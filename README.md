# Homescapes Server — phát hành client tự cập nhật

Gói này có đầy đủ source UI + API + gateway/bridge để các lần sau chỉ cần sửa
repository server và deploy lại. Giữ toàn bộ thư mục `src`, `public`, `client`,
`tools`, `data` và các file cấu hình ở gốc repository.

## Deploy lần đầu cho auto-update

Giữ Web Service hiện có và database cũ. Cấu hình:

| Mục | Giá trị |
| --- | --- |
| Build Command | npm ci --include=dev --cache /tmp/hcs-npm-cache && npm run build |
| Start Command | npm start |
| Health Check | /api/health |
| NODE_VERSION | 24.21.0 |
| HC_CLOUD_MODE | 1 |
| DATABASE_URL | PostgreSQL cũ đang dùng |
| HC_ADMIN_PASSWORD | Mật khẩu web Admin hiện tại |
| HC_SESSION_SECRET | Secret hiện tại, giữ cố định |

`npm run build` kiểm tra TypeScript, build UI rồi tự tạo gói client trong
`desktop_release`. Không cần tạo/upload ZIP cập nhật bằng tay. Gói chỉ chứa UI,
gateway đã bundle và bridge; không chứa engine, dữ liệu save, Owner hash hoặc
mật khẩu Admin. Gói được server ký bằng Ed25519 khi client xin manifest.

Khóa ký mặc định được suy ra bằng HMAC từ HC_SESSION_SECRET và một nhãn riêng.
Nếu cần khóa ký riêng, đặt HC_UPDATE_SIGNING_SECRET (ít nhất 32 ký tự) TRƯỚC khi
build EXE đầu tiên. Không đổi secret dùng để ký sau khi đã phát EXE: khóa công
khai đã được pin trong EXE sẽ không chấp nhận khóa mới. Không đưa secret vào Git.

Kiểm tra các URL sau khi deploy:
- `/api/health` → ok true.
- `/desktop/update-key.json` → algorithm Ed25519 + public_key.
- `/desktop/manifest.json` → version + sha256 + signature.

Sau đó build EXE AUTO-UPDATE từ gói client riêng và thay EXE cũ một lần.

## Cập nhật về sau — không build lại EXE

1. Sửa UI trong `src/components`, `src/sections`, CSS hoặc `public`.
2. Sửa gateway trong `src/server/gateway.ts`, `remote.ts`/các module được import.
3. Sửa bridge ADB trong `client/hc_client.py` nếu cần.
4. Commit/push mã lên repository server và deploy lại Render.
5. Người dùng đóng/mở EXE: app tự tải và chạy gói client mới đã ký.

Các thay đổi engine/API ở `src/engine` và server áp dụng trên server ngay sau
deploy. Không cần phát client mới khi không thay UI/gateway/bridge.

Không đổi signing secret, URL server hoặc database khi cập nhật thông thường.
Gói có số phát hành tăng theo thời điểm build và client chặn quay về bản cũ hơn.
Nếu cần phát lại source cũ, hãy build/deploy lại source đó để có bản phát hành
mới; rollback sang artifact Render cũ có thể bị client từ chối do số phát hành cũ.
Không ép cập nhật giữa phiên: app chỉ đổi payload ở lần mở tiếp theo.

## Những chức năng hiện có

- Owner key đã cấu hình; Owner cấp/thu hồi/gỡ khóa key trong EXE.
- `/admin` vẫn quản lý bằng HC_ADMIN_PASSWORD; key thường không có quyền cấp key.
- Các tab cũ và MAX_GP được giữ. Fresh Start chỉ còn tạo và khôi phục tài khoản.
  Trước khi xóa đúng SaveGame.db, SaveGame.db.bak, SaveGame.db.buf, ứng dụng
  sao lưu cả ba file trên máy tính. Khôi phục trả lại đúng bản sao lưu này.
  Kiểm tra Player ID sau khi game khởi động; game có thể khôi phục từ đám mây.
- Không xóa database/key khi cập nhật; save session ở RAM nên Connect lại sau deploy.

## Kiểm tra

`npm ci`, `npm run build`, `npm test`, `npm run test:owner`.
Với Python 3 + cryptography: `npm run test:updates` kiểm tra HTTP/signature thật,
server-only UI update và rollback khi gateway mới không khởi động.
`node --experimental-strip-types tools/verify_render.mjs PATH_TO_SAVE` kiểm tra
các luồng game bằng ADB giả. EXE/MEmu thực tế vẫn cần thử trên Windows.

Bootstrap, Node/Python hoặc thư viện native mới chưa có trong EXE không thể thêm
qua gói này; các thay đổi đó cần EXE mới. Updater không sửa save hoặc backup.

## Cập nhật cấp key và đăng nhập

Owner dùng trên nhiều máy. Key mới phải nhập Device ID và số máy tối đa khi cấp; key cũ giữ khóa máy hiện tại. Phiên đăng nhập tự ghi nhớ 30 ngày, đăng xuất xóa phiên đã lưu. Stats chỉnh Properties.level. Xem TEST_VI.md để thử từng trường hợp. Giữ nguyên DATABASE_URL và HC_SESSION_SECRET khi deploy; database tự thêm cột mới.
