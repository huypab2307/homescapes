Bản sửa mới nhất và kết quả kiểm tra: xem FIXES_LEGACY.md. Các ghi chú lỗi cũ bên dưới được giữ làm lịch sử, không phải tình trạng hiện tại.

Bản EXE tự khởi động: xem BUILD_STANDALONE.md; chạy BUILD_EXE.bat để tạo. Các lệnh server dưới đây dành cho chế độ phát triển.

# MAX_GP — giao diện Home Pass

## Sử dụng

1. Chạy ứng dụng như trước (`npm ci` lần đầu, `npm run start` để dùng bản dist đã build; hoặc chạy server và Vite theo README).
2. Connect để nạp bản lưu từ thiết bị, hoặc mở bản lưu bằng luồng có sẵn.
3. Chọn **Home Pass**. Khối **MAX_GP** hiển thị season, source vé và giá trị sẽ ghi.
4. Nếu có chỉnh sửa đang staged, Save hoặc hoàn tác chúng trước.
5. Bấm **MAX_GP — Points + Golden Ticket**. Cả hai thay đổi được lưu ngay vào phiên đang mở, có audit trong Review và nhật ký.
6. Bấm **Push** để chuyển bản đã sửa vào game. MAX_GP không tự Push.

Các điều khiển Home Pass cũ vẫn nằm bên dưới, trong Legacy pass controls.

## Dữ liệu

Nhận diện theo nhóm cá nhân trong GameModifiers; bỏ RemoteGroup, vẫn nhận khi isActive=false.
- Currency[season + "Points.amount"] = 10000
- Currency[season + "Points.prevAmount"] = 9999
- PlayerItems[source] = 1

Không thêm thời gian, không sửa GameModifiers, cache, giao dịch hoặc danh sách thưởng.
Chỉ tự nhận các mùa có cấu trúc như vậy. Trường hợp không có mùa hoặc có nhiều mùa không phân biệt được sẽ hiện lỗi, không ghi dữ liệu.

## Mã nguồn

- src/engine/MAX_GP.ts: hàm MAX_GP(inputBytes), dùng cơ chế sửa từng đoạn byte của engine.
- src/sections/MaxGPPanel.tsx: UI nhận diện, xem giá trị, chạy MAX_GP, trạng thái và lỗi.
- src/sections/HomePassSection.tsx: nhúng khối MAX_GP, giữ các điều khiển cũ.
- src/lib/api.ts: client có kiểu cho API preview/apply.
- src/lib/studio.tsx: thao tác MAX_GP có trạng thái applying, cập nhật phiên, audit và toast.
- src/server/main.ts: GET /api/seasonpass/max-gp?sessionId=... xem trước; POST cùng đường dẫn với {sessionId} áp dụng. Cả hai bắt buộc sessionId.

Các API này chỉ sửa phiên được chỉ định, không dùng donor và không gọi ADB Push.

## Kiểm tra

- npm run build: TypeScript + Vite production build đạt. dist đã được cập nhật.
- 8/8 kiểm thử MAX_GP và season-ticket đạt.
- Đã kiểm tra HTTP với SaveGame.db đã cung cấp: load, preview đúng SSPSpooky48, apply, apply lặp không thêm thay đổi, export khớp đúng dữ liệu dự kiến, thiếu sessionId trả 400.
- Toàn bộ engine: 76 bài, 58 đạt, 13 bỏ qua do thiếu fixture, 5 lỗi cũ còn trong seasonpass.test.ts. Các lỗi này thuộc planner seasonpass cũ, không phải MAX_GP.
- Đã sửa export FALLBACK_MAX_POINTS/FALLBACK_MAX_TIER không còn tồn tại để server khởi động được; cập nhật HomeCloneSection dùng highlights thay before/after cũ; cập nhật một assertion cũ theo hợp đồng cache không thay đổi của planner.
- Chưa kiểm tra tương tác trong trình duyệt hoặc ADB/game ở môi trường này. Việc thử trực tiếp trong game trước đó là của người dùng với bản lưu đã sửa.
