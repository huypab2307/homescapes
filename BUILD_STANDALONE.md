# Build Windows EXE

Xem [DEPLOY_RENDER.md](DEPLOY_RENDER.md) để deploy server và tạo key trước.

1. Windows x64: cài Node 24 x64 + Python x64.
2. Giải nén dự án, chạy `BUILD_EXE.bat`.
3. Lấy `desktop_dist\HomescapesSaveStudio.exe`.
4. Mở EXE, nhập license key đã tạo tại trang Admin rồi Connect emulator.

Client gói UI, Node, gateway và ADB. Engine save và Admin ở server.
Máy đích cần Microsoft Edge WebView2 Runtime. Khởi động gateway tự động;
không cần mở server thủ công. Không gói API key dùng chung vào EXE.
