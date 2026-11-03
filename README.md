# Homescapes Server — Render Web Service

Gói server riêng: engine xử lý save, MAX_GP và các chức năng cũ, xác minh license,
trang web Admin, quyền Owner cấp key qua EXE. Không cần gói client để deploy.

## Deploy lên Web Service đang có

1. Upload nội dung thư mục này lên repository đang nối Render. `package.json`
   và `src` phải nằm ở Root Directory mà Render dùng.
2. Build Command: `npm ci --include=dev --cache /tmp/hcs-npm-cache && npm run build`
3. Start Command: `npm start`
4. Health Check Path: `/api/health`
5. Thiết lập các biến sau rồi Save, rebuild, and deploy:

| Biến | Giá trị |
| --- | --- |
| NODE_VERSION | 24.21.0 |
| HC_CLOUD_MODE | 1 |
| DATABASE_URL | PostgreSQL connection URL, dùng Internal URL nếu cùng region Render |
| HC_ADMIN_PASSWORD | Mật khẩu web Admin, ít nhất 12 ký tự |
| HC_SESSION_SECRET | Chuỗi ngẫu nhiên ít nhất 32 ký tự |

Đây là bản PostgreSQL hiện tại, chưa chuyển sang licenses.json theo app mẫu.
Giữ nguyên database và secret khi cập nhật. Không cần thêm biến để dùng key
Owner đã chỉ định: server tự thêm Owner vĩnh viễn một lần bằng mã băm cấu hình
sẵn, không đặt key dạng rõ trong source. Key cũ và liên kết máy được giữ lại.

## Kiểm tra

- `https://homescapes-save-api.onrender.com/api/health` cần trả `ok: true`.
- `/admin`: đăng nhập bằng HC_ADMIN_PASSWORD để quản lý key, gỡ khóa Owner.
- Client gói riêng: build EXE và nhập key Owner để thấy **Cấp key · Owner**.
- `npm run build`, `npm test`, `npm run test:owner` kiểm tra mã và phân quyền.

`npm run build` gói server chỉ kiểm tra TypeScript, không build UI desktop.
UI web Admin có sẵn trong `src/server/admin.html` và `admin.js`.
Xem `DEPLOY_RENDER.md` để biết chi tiết logic license. Các hướng dẫn build EXE
trong tài liệu đó áp dụng cho gói client riêng, không phải gói server này.

Save sessions nằm trong RAM; Connect lại sau deploy/restart. Chỉ chạy một
instance server vì sessions chưa chia sẻ giữa replica. Không đưa secret vào Git.

## Fresh Start — thử khởi tạo tài khoản mới

Mục **Fresh Start** hiện có nút **Sao lưu & thử tạo tài khoản mới** ở đầu trang.
Đây là luồng riêng với các ô chỉnh level/coins/stars cũ.

1. Deploy server mới, build và mở EXE mới.
2. Chọn MEmu phụ và bấm Connect để đọc save hiện tại.
3. Hủy hoặc lưu các chỉnh sửa còn đang chờ.
4. Mở Fresh Start → Sao lưu & thử tạo tài khoản mới → đọc và xác nhận.
5. Ứng dụng chọn đúng package Global/VN, dừng game, đọc lại save, giữ một bản
   sao lưu riêng trên máy tính, nhờ server format JSON (4 dấu cách, CRLF) rồi
   bỏ đúng dấu `}` đóng object gốc cuối cùng. Với save XOR, giữ nguyên kiểu
   mã hóa và trailer nguồn. Không thay level, ID hay các giá trị dữ liệu.
6. Chỉ ghi nếu bản .hcsbak trên máy game cũng sao lưu thành công; sau đó mở game.
7. Kiểm tra Player ID có đổi không. Đợi game khởi tạo xong rồi bấm Connect lại.

Phương pháp khớp byte với file test đã được chủ dự án báo thành công. Không bảo
đảm mọi phiên bản sẽ tạo tài khoản mới: game có thể khôi phục bản cũ hoặc không
mở được. Luồng này là thử nghiệm, không giả lập hay tự cấp Player ID từ tool.

Có nút **Khôi phục save trước đó** dùng bản .hcsbak gần nhất trên thiết bị.
Ngoài ra, bản gốc được giữ riêng trên máy tính tại:
`%LOCALAPPDATA%\HomescapesSaveStudio\backups\before-new-account-…db`.
Đường dẫn cụ thể hiện trong giao diện sau khi ghi thành công hoặc thông báo lỗi.
Các bản riêng trên máy tính không bị ghi đè bởi Push lần sau. Bản .hcsbak trên
máy game có thể bị thay bởi lần Push tiếp theo. Khôi phục file cục bộ không bảo
đảm khôi phục được liên kết hồ sơ trên server sau khi game đã đổi Player ID.
Nếu thao tác thất bại, game có thể còn đang dừng: mở lại thủ công hoặc khôi phục.

Sau thao tác, phiên cũ bị loại khỏi luồng Push; phải Connect lại trước khi sửa.
Không xóa database, không đổi key Owner, không đổi secret khi cập nhật bản này.
Client và server phải cùng bản có endpoint `/api/fresh-start/prepare` và gateway
`/api/fresh-start/new-account`. Cần build lại EXE để có bridge với kiểm tra backup.

Đã kiểm tra formatter, XOR/trailer, quyền session, sao lưu thất bại không ghi,
chặn nhầm thiết bị, chặn Push session cũ và ưu tiên Global/VN. Chưa chạy EXE
hoặc emulator thật trong môi trường build Linux.
