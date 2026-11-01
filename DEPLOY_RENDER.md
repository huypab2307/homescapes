# Render Web Service + key/login

Bản này thay hoàn toàn `HC_API_KEY` dùng chung bằng license riêng cho từng máy.
Engine xử lý save ở Render. EXE chỉ có UI, Node gateway và ADB; không chứa
module giải mã/chỉnh save, database key, mật khẩu Admin hay khóa ký token.
Các tab cũ và MAX_GP vẫn dùng API xử lý save hiện có.

## 1. Cập nhật Web Service đang có

Upload/commit toàn bộ dự án này vào repository đang nối với Render.
Giữ tên service/URL `https://homescapes-save-api.onrender.com`.
Không dùng bản client preset cũ sau khi đổi server sang license.

Render → service → Settings:

- Runtime: Node
- Build Command: `npm ci --include=dev --cache /tmp/hcs-npm-cache && npm run build`
- Start Command: `npm start`
- Health Check: `/api/health`

Environment:

| Biến | Giá trị |
| --- | --- |
| `NODE_VERSION` | `24.21.0` |
| `HC_CLOUD_MODE` | `1` |
| `HC_ADMIN_PASSWORD` | Mật khẩu Admin riêng, ít nhất 12 ký tự |
| `HC_SESSION_SECRET` | Chuỗi ngẫu nhiên ít nhất 32 ký tự, giữ cố định giữa các deploy |
| `DATABASE_URL` | Connection URL PostgreSQL bền vững |

Tạo secret bằng `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
Xóa biến `HC_API_KEY` cũ. Không đưa các secret vào Git hoặc client.
`render.yaml` đi kèm cũng khai báo các biến này cho service mới.

## 2. Database cho key

Có thể dùng Render PostgreSQL. Chọn database cùng region với Web Service,
rồi lấy **Internal Database URL** điền vào `DATABASE_URL` của Web Service.
Nếu dùng nhà cung cấp PostgreSQL khác, dùng URL/TLS đúng theo hướng dẫn của họ.
Không tự tắt kiểm tra chứng chỉ TLS.

Ứng dụng tự tạo bảng `hc_licenses` khi khởi động. Tài khoản DB cần quyền tạo bảng,
đọc, thêm và cập nhật bảng này. Database không chứa save người chơi; save session
chỉ nằm trong RAM server, cần Connect lại sau restart/deploy hoặc hết thời gian rỗi.
Chạy một instance Web Service: save sessions chưa chia sẻ giữa nhiều replica.

Không dùng JSON trên filesystem tạm của Render để lưu key. Render Free PostgreSQL
hết hạn sau 30 ngày; cần database không hết hạn cho sử dụng lâu dài.
Tài liệu: https://render.com/docs/free và https://render.com/docs/databases
Không có tài nguyên trả phí nào được tạo tự động bởi dự án này.

## 3. Tạo key

Sau khi deploy thành công, mở:

`https://homescapes-save-api.onrender.com/admin`

Đăng nhập bằng `HC_ADMIN_PASSWORD`, chọn 7/30/365 ngày hoặc vĩnh viễn, nhập ghi chú,
bấm **Tạo key** rồi sao chép ngay. Server chỉ lưu SHA-256 của key nên không xem lại
được toàn bộ key sau khi rời trang. Nếu mất, thu hồi và tạo key mới.

- Thời hạn bắt đầu từ lúc tạo.
- Key khóa vào Device ID ở lần đăng nhập đầu; một key dùng cho một máy Windows.
- **Gỡ khóa máy**: cho phép key liên kết máy mới, vô hiệu token hiện có ngay.
- **Thu hồi**: vô hiệu key và token hiện có ngay; không thể khôi phục trong UI này.
- Token đăng nhập có hạn 30 phút; client tự gia hạn khi đang mở và key còn hợp lệ.
- Admin cũng cần đăng nhập lại sau 30 phút.
- Đổi `HC_SESSION_SECRET` làm toàn bộ token hiện tại mất hiệu lực; client còn key
  hợp lệ có thể đăng nhập lại. Đổi mật khẩu Admin nên đổi luôn secret để kết thúc
  các phiên Admin đang mở.

## 4. Tạo client EXE

Trên Windows x64, cài Node 24 x64 và Python x64. Giải nén dự án rồi chạy
`BUILD_EXE.bat`. Kết quả: `desktop_dist\HomescapesSaveStudio.exe`.
Máy chạy EXE cần Edge WebView2 Runtime; Node/Python không cần cài trên máy đích.

Bấm EXE → màn hình đăng nhập key → UI cũ → chọn emulator → Connect → chỉnh →
Push & Launch. Hỗ trợ `com.playrix.homescapes` trước, chỉ fallback
`com.playrix.homescapes.vn` khi không lấy được save từ nguồn đầu.

Client đặt sẵn URL server ở `client/desktop_launcher.py`. Nếu đổi tên service,
sửa URL tại đó và mặc định trong `src/server/remote.ts`, rồi build EXE lại.
Không điền mật khẩu Admin hoặc secret vào client. License key/token chỉ giữ trong
RAM của ứng dụng; đóng EXE cần nhập key lại. Device ID được băm từ Windows
MachineGuid; cài lại Windows có thể cần Admin gỡ khóa máy.

Builder chỉ đóng gói `gateway.ts`, `remote.ts`, `errors.ts` và UI đã build, Node,
ADB. Nó không đóng gói `src/engine`, `data`, `licenses.ts`, Admin hoặc `pg`.
Mã frontend chỉ bao gồm hiển thị/điều khiển và các hằng số catalog.
Có thể chia sẻ EXE cho người dùng; giữ source server và quyền quản trị riêng.

## 5. Kiểm tra / lỗi

- `/api/health`: phải trả `ok: true`.
- `DATABASE_URL is required`: chưa thiết lập PostgreSQL.
- Lỗi secret/password lúc startup: kiểm tra đủ độ dài các biến môi trường.
- `Key is already linked...`: Admin gỡ khóa key trước khi chuyển máy.
- Key hết hạn/thu hồi: giao diện quay lại đăng nhập khi yêu cầu tiếp theo bị từ chối.
- Render vừa deploy: Connect lại vì save session trước đó đã mất.
- `ERR_CONNECTION_REFUSED` tại 127.0.0.1: xem
  `%LOCALAPPDATA%\HomescapesSaveStudio\logs\desktop.log`.
- Render Free có thể ngủ; client đợi tối đa 120 giây cho mỗi kết nối.

## 6. Kiểm tra mã nguồn

`npm ci`, `npm run build`, `npm test`.
`node --experimental-strip-types tools/verify_render.mjs PATH_TO_SAVE` chạy kiểm
tra tích hợp bằng SQLite tạm và ADB giả trên Linux: key, máy, expiry, thu hồi,
restart, login, Connect/edit/MAX_GP/Push, clone, legacy unlock, reset và CSRF.
`tools/test_cloud_entry.mjs` chỉ là harness kiểm tra, không phải lệnh deploy.
Production `npm start` với `HC_CLOUD_MODE=1` luôn yêu cầu PostgreSQL thật.

Bản kiểm tra không kết nối PostgreSQL production hoặc emulator thật. EXE phải
build/chạy thử trên Windows; môi trường Linux không xác nhận được WebView2/ADB
trên máy người dùng. Các bài kiểm tra fixture Windows riêng có thể bị skip.
