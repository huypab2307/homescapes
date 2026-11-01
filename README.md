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
