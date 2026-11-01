Kết quả kiểm tra mới nhất: xem FIXES_LEGACY.md; thông tin lỗi cũ bên dưới thuộc bản trước.

# Points và GoldenTicket tự nhận diện mùa — TypeScript

Hàm chính: `editSeasonTicket(inputBytes, options)` trong `src/engine/season-ticket.ts`.
Hàm này đã được export từ `src/engine/index.ts`. Module và CLI vẫn dùng được. Giao diện Home Pass hiện có khối MAX_GP, dùng hàm MAX_GP trong src/engine/MAX_GP.ts; xem MAX_GP_UI.md.

## Chạy trực tiếp

Dùng Node hỗ trợ `--experimental-strip-types` (Node 22.18+ hoặc Node 24). Các lệnh dưới đây không cần cài thêm package.
Chạy tại thư mục gốc dự án. Tắt game và giữ bản lưu hiện tại trước khi nạp kết quả.

```bash
# Chỉ Points: mặc định amount=10000 và prevAmount=9999
npm run season-ticket -- SaveGame.db SaveGame_points.db points

# Chỉ GoldenTicket: thêm/cập nhật đúng một khóa trong PlayerItems bằng 1
npm run season-ticket -- SaveGame.db SaveGame_ticket.db goldenTicket

# Cả hai chức năng
npm run season-ticket -- SaveGame.db SaveGame_both.db both

# Điểm tùy chọn: amount=2500, prevAmount=2499
npm run season-ticket -- SaveGame.db SaveGame_points2500.db points 2500

# Chọn mùa cụ thể khi dữ liệu có nhiều ứng viên
npm run season-ticket -- SaveGame.db SaveGame_selected.db both 10000 SSPSpooky48
```

Lệnh từ chối ghi đè file đầu vào và file đầu ra đã tồn tại. File xuất giữ loại container/mã hóa đầu vào mà codec của dự án hỗ trợ.

## Gọi trong mã TypeScript

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { editSeasonTicket } from "./src/engine/season-ticket.ts";

const input = new Uint8Array(readFileSync("SaveGame.db"));
const result = editSeasonTicket(input, {
  action: "both", // "points" | "goldenTicket" | "both"
  points: 10000,
});
console.log(result.season, result.source, result.ops);
writeFileSync("SaveGame_result.db", result.encoded, { flag: "wx" });
```

Nếu muốn hiển thị trước rồi áp dụng qua luồng hiện có:

```ts
import { planSeasonTicket } from "./src/engine/season-ticket.ts";
// save là SaveGame đã giải mã/mở bằng engine hiện có.
const plan = planSeasonTicket(save, { action: "goldenTicket" });
// plan.ops là EditOp[], tương thích runApply / applyToContainer.
```

`discoverSeasonTickets(save)` trả về tất cả ứng viên để làm danh sách chọn mùa.

## Quy tắc nhận diện

1. Đọc các nhóm trực tiếp trong GameModifiers; mở lớp bọc `{t:"ds",v:...}` bằng API sẵn có.
2. Lấy season từ `groupId`; lấy nguyên tên vật phẩm vé từ `source`, không dựng cứng tên vé.
3. Chỉ nhận source kết thúc bằng GoldenTicket, mã gồm chữ/số/gạch dưới/gạch ngang, và nhóm có hiệu ứng isLocalPlayer=true.
4. Loại RemoteGroup. Không dùng isActive làm điều kiện, vì nhóm cá nhân có thể đang tắt trước khi mở vé.
5. Nếu có nhiều ứng viên: ưu tiên sự kiện InProgress; nếu vẫn nhiều thì chọn thời hạn expirationTime mới nhất khi tất cả đều có thời hạn. Nếu vẫn không rõ, báo lỗi kèm mã mùa để chọn bằng options.season. Không so với đồng hồ máy vì bản lưu có thể thuộc thời điểm cũ.
6. Mã mùa chỉ định cũng phải tìm thấy trong các nhóm cá nhân hợp lệ.

## Phạm vi ghi

- Points: `Currency[season + "Points.amount"] = points`; `Currency[season + "Points.prevAmount"] = Math.max(0, points - 1)`.
- Đây là HAI KHÓA PHẲNG chứa dấu chấm, không phải object Points lồng bên trong Currency.
- GoldenTicket: `PlayerItems[source] = 1`; không thêm AmountStartTime.
- Nếu Currency/PlayerItems chưa tồn tại, tạo object tương ứng. Nếu khóa đã có thì cập nhật; cùng giá trị thì không ghi lại.
- Không sửa GameModifiers, cache, lịch sử, giao dịch hoặc trạng thái nhận thưởng.
- Dùng cơ chế splice byte của engine; không JSON.stringify lại toàn bộ save. Dữ liệu khác giữ nguyên.
- Từ chối target sai kiểu, Currency bị lồng sai cấu trúc, điểm âm/lẻ/không hữu hạn hoặc vượt giới hạn số nguyên an toàn JavaScript.

Chỉ nhận diện tự động các mùa tuân theo cấu trúc GameModifiers trên. Mùa có schema khác sẽ cần bổ sung nhận diện; không bảo đảm mọi bản game tương lai giữ nguyên định dạng. Người dùng đã xác nhận mở được Spooky48 bằng khóa PlayerItems; chưa có thử nghiệm trực tiếp các mùa khác trong game.

## Kiểm thử

```bash
node --experimental-strip-types --test src/engine/season-ticket.test.ts
```

6/6 bài kiểm thử mới đạt: mùa khác, khóa phẳng, source riêng, bỏ RemoteGroup, giữ dữ liệu không liên quan, thiếu container, chạy lặp không thay đổi byte, chọn mùa/đụng mã mùa, số liệu không hợp lệ, container mã hóa.
Đã chạy CLI trên SaveGame.db được cung cấp và xác nhận tự chọn SSPSpooky48.

Toàn bộ `npm test`: 74 bài, 55 đạt, 13 bỏ qua do thiếu fixture, 6 lỗi trong seasonpass.test.ts. Sáu lỗi này cũng tái hiện trong source gốc được giải nén riêng. Không sửa module seasonpass cũ trong thay đổi này.
Bản tích hợp UI đã chạy thành công TypeScript typecheck và Vite production build. Kết quả kiểm thử mới nhất nằm trong MAX_GP_UI.md.
