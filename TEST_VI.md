# Kiểm thử bản cập nhật

Thử trên bản sao MEmu và ghi lại Player ID trước khi thử Fresh Start.

| Mục | Thao tác | Kết quả mong đợi |
|---|---|---|
| Owner | Đăng nhập cùng key trên hai máy | Cả hai vào được và có Cấp key |
| Key 1 máy | Nhập số máy 1, Device ID máy A rồi cấp | A đăng nhập được |
| Sai ID | Dùng key A trên máy B | B bị từ chối |
| Chưa có ID | Để trống ID khi cấp | Không tạo key |
| Nhiều máy | Chọn 2, nhập ID A và B cách bằng dấu ; | A và B dùng được, C bị từ chối |
| Vượt số máy | Chọn 1 nhưng nhập 2 ID | Báo lỗi, không tạo key |
| ID trùng | Nhập cùng ID hai lần | Báo lỗi |
| ID sai | Nhập abc thay Device ID | Báo lỗi |
| Số máy sai | Nhập 0 hoặc 101 | Báo lỗi |
| Quyền user | Đăng nhập key thường | Không có nút Cấp key; API quản trị bị chặn |
| Thu hồi | Owner thu hồi key đang dùng | Yêu cầu tiếp theo bị từ chối |
| Ghi nhớ | Đăng nhập rồi đóng mở app | Tự vào lại, không nhập key |
| Đăng xuất | Đăng xuất rồi đóng mở | Hiện đăng nhập |
| Nhớ + thu hồi | Thu hồi key đã ghi nhớ, mở lại app | Không tự vào được |
| Mất mạng | Mở khi mất mạng rồi thử lại khi có mạng | Không mất key đã ghi nhớ chỉ vì mất mạng |
| Level | Nhập 10000 ở Stats, Save và đọc lại save | Properties.level = 10000; LID_Lvl và level ở nhóm khác giữ nguyên |
| Fresh Start | Tạo tài khoản mới | Sao lưu tự động ba file trước khi xóa; khởi động game |
| Khôi phục | Khôi phục tài khoản trước đó | Trả lại ba file đã sao lưu của đúng thiết bị |
| Sao lưu lỗi | Thư mục backup không ghi được | Không xóa save |
| Chức năng cũ | Thử MAX_GP, coins, boosters, cards và Push | Hoạt động như trước |

Ghi nhớ đăng nhập có hiệu lực tối đa 30 ngày, hết hạn key hoặc thu hồi sẽ buộc đăng nhập lại. Không lưu key/mật khẩu dạng văn bản. Key cũ giữ cơ chế khóa máy cũ; key mới bắt buộc cấp theo Device ID. Key cấp theo ID cố định không dùng Gỡ khóa máy; thu hồi rồi cấp lại nếu đổi ID. Số máy là giới hạn trên của danh sách ID cho phép, không mở chỗ cho máy chưa được chỉ định.

Fresh Start lưu dữ liệu hiện tại đã có trên MEmu, không tự áp dụng các thay đổi đang chờ Save/Push. Dữ liệu đám mây có thể được game phục hồi: kiểm tra Player ID sau khi khởi động.
