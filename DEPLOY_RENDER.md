# Render server + EXE local

## Luồng hoạt động

EXE luôn hiển thị giao diện local và dùng ADB của máy người dùng. Khi bật Render trong nút Server:
- Connect: EXE đọc save qua ADB rồi upload lên Render.
- Save/MAX_GP/cards/cosmetics: Render xử lý save trong phiên riêng của EXE.
- Push: EXE tải bản đã sửa từ Render, kiểm tra đúng thiết bị/package/path đã Connect rồi dùng ADB ghi và mở game.
- Clone và Season Pass cũ cũng chạy thuật toán trên Render; các bước ADB nằm ở gateway local.
- Có thể chọn Use local mode để dùng như bản trước.

## 1. Đưa mã lên GitHub

Tạo repository riêng tư và đưa NỘI DUNG thư mục hs_repo trong ZIP lên gốc repository: package.json, src, public, data, render.yaml, .node-version...
Không upload node_modules, .venv, desktop_build, desktop_dist, .env hoặc server-settings.json.
Giữ data/IGG-account.db vì chức năng Clone dùng tệp này. Không đưa save cá nhân khác lên repository.
Nếu repository chứa nguyên thư mục hs_repo thay vì nội dung ở gốc, đặt Root Directory của Render là hs_repo.

## 2. Tạo dịch vụ Render

Cách A: trên Render chọn New -> Blueprint, liên kết repository, dùng render.yaml.
Blueprint đã khai báo Node runtime, health check và API key được Render sinh tự động.

Cách B: New -> Web Service, chọn repository và cấu hình:
- Runtime: Node
- Build Command: npm ci --include=dev --cache /tmp/hcs-npm-cache && npm run build
- Start Command: npm start
- Health Check Path: /api/health
- Environment:
  - NODE_VERSION = 24.21.0
  - HC_CLOUD_MODE = 1
  - HC_API_KEY = chuỗi bí mật ngẫu nhiên ít nhất 32 ký tự

Sinh key trên máy của bạn bằng:
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
Không dùng key ví dụ trong mã kiểm thử làm key thật. Không commit key thật vào Git.

Render cung cấp PORT; chương trình tự bind 0.0.0.0 ở chế độ cloud.
Blueprint chọn gói free để khởi đầu; không cấu hình autoscale. Bản này cần một instance vì phiên save nằm trong RAM.

## 3. Lấy URL và API key

Chờ Render báo deploy Live. Truy cập:
https://TEN-DICH-VU.onrender.com/api/health

Kết quả phải có ok=true và app=Homescapes Save Studio.
Trên trang Environment của dịch vụ, sao chép giá trị HC_API_KEY (Blueprint tự sinh nếu dùng cách A).
Không gửi key qua chat hoặc đưa vào ảnh chụp công khai.

## 4. Build và nối EXE

Chạy BUILD_EXE.bat của dự án này trên Windows x64. Đây là EXE mới có nút Server; các EXE cũ không tự cập nhật.
Mở desktop_dist/HomescapesSaveStudio.exe, bấm Server ở thanh trên cùng.
- Server URL: https://TEN-DICH-VU.onrender.com (không thêm /api).
- API key: HC_API_KEY vừa lấy từ Render.
- Bấm Save Render connection. Ứng dụng kiểm tra key và tải lại UI.
- Chọn giả lập, Connect, chỉnh và Save, rồi Push.

Cấu hình được lưu trong %LOCALAPPDATA%/HomescapesSaveStudio/server-settings.json của máy người dùng, không nằm trong ZIP/EXE và không trả key về JavaScript khi đọc settings. Đây là file bí mật của tài khoản Windows: không chia sẻ nó.

## Phiên và giới hạn

Save trên Render chỉ ở RAM, không lưu bền vững. Restart, redeploy hoặc tiến trình bị thay thế sẽ mất các chỉnh sửa chưa tải về/Push. Kết nối lại bằng Connect để upload bản hiện tại từ game. Không khẳng định có cơ chế khôi phục các thay đổi chưa được xuất.
Phiên hết hạn sau 30 phút không dùng; tối đa 16 phiên trong một tiến trình. Lỗi 404 yêu cầu Connect lại; 503 session limit yêu cầu chờ phiên cũ hết hạn hoặc khởi động lại dịch vụ sau khi đã xuất/Push các phiên còn cần.

API yêu cầu Bearer key và client id; phiên được tách theo client id. Cloud không nhận đường dẫn file từ người dùng, không cung cấp endpoint ADB hay debug đọc filesystem, không phục vụ UI public. Đây là mô hình dùng cá nhân/nhóm tin cậy cùng API key, chưa phải hệ thống tài khoản hoặc phân quyền cho khách hàng không tin cậy.

Gói free có thể ngủ sau 15 phút không có lưu lượng; lần đánh thức có thể mất khoảng một phút. Nếu phiên đã mất sau khi dịch vụ ngủ/restart, hãy Connect lại. Xem https://render.com/docs/free .

Render không trực tiếp nhìn thấy ADB của bạn. Log Connect/Push phát sinh ở EXE. URL chỉ nhận HTTPS; localhost HTTP chỉ dành cho harness kiểm thử qua HC_ALLOW_HTTP_REMOTE=1, không bật ở bản triển khai thật.

## Kiểm tra đã chạy

- npm test: 79 bài, 66 đạt, 13 bỏ qua do thiếu fixture đặc thù, 0 lỗi.
- npm run build: TypeScript + Vite production build đạt.
- Python package fallback: 6/6 đạt (gốc ưu tiên trước VN).
- node --experimental-strip-types tools/verify_render.mjs PATH_TO_SAVE: đã chạy đạt trên SaveGame.db được cung cấp. Harness chạy hai Node process độc lập làm cloud/gateway và ADB giả lập: auth, chống đọc chéo phiên, chặn file path/cloud ADB, cấu hình URL/key, Connect/upload, chỉnh xu/booster/MAX_GP, Push/download, clone, Season Pass cũ, reset và chặn browser origin không hợp lệ.
- Chưa deploy trên tài khoản Render hoặc chạy EXE/ADB thật trên Windows trong môi trường này. Kết quả harness không chứng minh thao tác trong game đã được kiểm tra.

Tài liệu chính thức: https://render.com/docs/web-services ; https://render.com/docs/blueprint-spec ; https://render.com/docs/node-version
