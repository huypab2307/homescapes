# Homescapes Save Studio — Render License Edition

Web Service xử lý save, license key khóa một máy, Admin tạo/thu hồi/gỡ khóa,
Windows client có màn hình đăng nhập và toàn bộ các tab cũ cùng MAX_GP.

**Bắt đầu:** đọc [DEPLOY_RENDER.md](DEPLOY_RENDER.md), deploy lại Web Service,
thiết lập PostgreSQL + mật khẩu Admin + secret ký token, rồi tạo key tại `/admin`.
Build client trên Windows bằng `BUILD_EXE.bat`.

- `npm start`: server xử lý save (Render đặt `HC_CLOUD_MODE=1`).
- `npm run client`: gateway desktop nhẹ; cần engine Render đã deploy.
- `npm run build`: kiểm tra TypeScript và build UI.
- `npm test`: các kiểm tra engine/session/API.
- `node --experimental-strip-types tools/verify_render.mjs PATH_TO_SAVE`:
  kiểm tra tích hợp license và gateway với ADB giả trên Linux.

Các bản client cũ dùng API key chung không tương thích với server license.
Không chép API key cũ vào bản mới. Không lưu database/secret vào repository.
