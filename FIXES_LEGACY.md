# Bản sửa các chức năng cũ

Dựa trên hs_repo(1).zip vừa cung cấp. Đối chiếu cho thấy các file src/client/tools trong ZIP này trùng bản hs_repo.zip ban đầu; bản sửa hiện tại đưa các cập nhật MAX_GP/Standalone/VN trở lại cùng mã gốc đó.

## Các thay đổi

1. Gắn các yêu cầu đọc, discovery, Save, cards, cosmetics, reset và Push vào phiên save đang hiển thị. Trước đây nhiều tab dùng phiên mới nhất trên server; một phiên donor/tạm có thể làm thao tác Save lệch với phiên được Push.
2. Các nút Push dùng chung luồng trong StudioProvider, lưu chỉnh sửa staged trước khi gửi và từ chối gửi nếu đổi thiết bị mà chưa Connect lại.
3. Season Pass cũ ghép component theo tên, thay vì chép vị trí mảng donor sang tài khoản. Bảo toàn thứ tự và các component riêng của tài khoản; bổ sung kiểm thử xuất kết quả để kiểm tra trường hợp đảo thứ tự.
4. Cập nhật kiểm thử cũ theo định dạng Currency khóa phẳng đã xác minh và hợp đồng planner hiện tại: không yêu cầu object lồng, không yêu cầu tạo thao tác cho giá trị vốn đã đúng, kiểm tra thông báo lỗi thực tế. Không đổi ladder thành số đoán.
5. Sửa export/type đã cũ gây lỗi khởi động/build; HomeClone hiển thị highlights thay cấu trúc before/after không còn tồn tại.
6. Giữ MAX_GP có UI, nguồn game gốc ưu tiên trước .vn, và bộ build EXE tự khởi động Node/API.

## Cách dùng

Giải nén thư mục mới. Chạy BUILD_EXE.bat của chính bản này để tạo EXE mới. Không chạy lại EXE của bản cũ: nó chứa mã được gói từ trước và không tự cập nhật.

Mở desktop_dist\HomescapesSaveStudio.exe, chọn thiết bị, Connect, chỉnh chức năng cần dùng và Save/Push. Nếu đổi thiết bị, Connect lại trước khi Push.

## Kiểm tra

- npm test: 77 bài, 64 đạt, 13 bỏ qua vì thiếu fixture đặc thù, 0 lỗi.
- npm run build: TypeScript và Vite production build đạt; dist đã cập nhật.
- python -m unittest discover -s client -p test_package_fallback.py -v: 6/6 đạt.
- node --experimental-strip-types tools/verify_legacy.mjs PATH_TO_SAVE: đã chạy đạt với SaveGame.db người dùng cung cấp trước đó. Kịch bản tạo thêm phiên donor trong lúc giữ UI ở tài khoản gốc, sửa xu/sao/mạng/booster, thêm thẻ, cấp/chọn khung, chạy MAX_GP và kiểm tra file xuất đúng tài khoản. Không ghi đè tệp đầu vào.
- Chưa build/chạy EXE Windows hoặc Push vào thiết bị thật ở môi trường này. Các kiểm tra API/save xác minh dữ liệu xuất; chưa chứng minh mọi thay đổi đều được game chấp nhận.

Nếu một chức năng cụ thể vẫn lỗi trong game, cần tên chức năng và thông báo/ảnh lỗi hoặc save mới đọc lại để đối chiếu. Bản sửa này xử lý các lỗi tái hiện được trong mã và kiểm thử, không khẳng định đã tái hiện tình huống trên thiết bị của người dùng.
