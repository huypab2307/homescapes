# Build EXE: nhấp đúp là mở toàn bộ ứng dụng

Đây là bộ build mới thay cho BUILD_EXE.bat trước đây chỉ đóng gói cửa sổ WebView.

## Build một lần trên Windows x64

1. Giải nén toàn bộ dự án vào thư mục riêng.
2. Máy build cần Node.js x64 22.18+ hoặc 24+, Python x64 có pip và kết nối Internet.
3. Nhấp đúp BUILD_EXE.bat trong thư mục có package.json.
4. Chờ hoàn tất. Script dừng và giữ cửa sổ nếu có lỗi.
5. Kết quả: desktop_dist\HomescapesSaveStudio.exe.

File EXE mới tự chứa giao diện đã build, mã server, Node runtime, dữ liệu dự án và bridge ADB đã đóng gói. Android platform-tools được tải từ Google khi build; nếu đã có adb\adb.exe cùng các DLL của platform-tools ở thư mục gốc, dùng bản đó.

## Dùng ứng dụng

Nhấp đúp desktop_dist\HomescapesSaveStudio.exe. Không cần RUN_STUDIO.bat, npm start hay cửa sổ server riêng. Có thể chép riêng EXE sang máy Windows x64 khác mà không cần Node/Python/thư mục dự án.

Máy chạy cần Microsoft Edge WebView2 Runtime và thiết bị/giả lập phù hợp để dùng ADB như trước. Bộ build chưa gói bộ cài WebView2. Lần mở đầu EXE có thể cần chờ vì PyInstaller giải nén các thành phần đi kèm.

Ứng dụng tự chọn cổng localhost còn trống, chạy server ẩn, kiểm tra /api/health rồi mới mở giao diện. Đóng cửa sổ sẽ dừng server của ứng dụng. Mỗi lần mở dùng phiên riêng; cần xuất/push những chỉnh sửa muốn giữ trước khi đóng.

Nếu khởi động lỗi, chương trình hiển thị hộp thoại và đường dẫn log:
%LOCALAPPDATA%\HomescapesSaveStudio\logs\desktop.log

MAX_GP nằm ở Home Pass. Các tính năng cũ vẫn có trong dự án.

## Thành phần mới

- client/desktop_launcher.py: tự khởi động/dừng Node và mở WebView2.
- tools/build_standalone.py: đóng gói Node, server, UI, data và bridge thành một EXE.
- BUILD_EXE.bat: cài thư viện, build UI rồi gọi bộ đóng gói.
- src/server/main.ts: hỗ trợ HC_BRIDGE_EXE để gọi bridge đi kèm; chế độ Python phát triển vẫn hoạt động khi không đặt biến này.

## Kiểm tra đã làm

- TypeScript typecheck đạt.
- Kiểm tra cú pháp Python đạt.
- Kiểm thử khởi chạy với WebView giả lập trên Linux: tự chọn cổng, chạy API, gọi bridge đóng gói giả lập qua subprocess, áp dụng MAX_GP trên save thực tế, tắt server khi đóng UI đều đạt.
- Chưa build hoặc chạy EXE/Windows WebView2 thật trong môi trường hiện tại. Bạn cần chạy BUILD_EXE.bat trên Windows để tạo và thử EXE.
- Bản hiện tại đã sửa planner Season Pass cũ và cập nhật các kiểm thử đã lỗi thời; xem FIXES_LEGACY.md.

## Nguồn game và bản VN

Connect thử com.playrix.homescapes trước. Chỉ thử com.playrix.homescapes.vn khi bản gốc không cài hoặc không có save đọc được. Một lần Connect mới luôn quay lại ưu tiên bản gốc.
Push cũng xác định nguồn theo thứ tự trên, rồi dừng, ghi và mở lại đúng package đã chọn. Không chuyển sang ghi vào package khác khi ghi nguồn đã chọn gặp lỗi.

Đã chạy 6/6 unit test nguồn package với ADB giả lập. Chưa có kiểm tra ADB thực tế trên Windows/giả lập của người dùng. Sau khi cập nhật cần chạy BUILD_EXE.bat để tạo EXE mới; EXE đã build trước đây không tự cập nhật.
