# Handoff: Tokyo Sora — hệ thống vận hành nhà hàng nướng than

## 1. Tổng quan

Bộ thiết kế gồm **5 ứng dụng** dùng chung một nền dữ liệu, phục vụ trọn vòng đời một bữa ăn
(khách đặt → bếp nấu → thu ngân chốt → báo cáo):

| Ứng dụng | Người dùng | Thiết bị | Số màn |
|---|---|---|---|
| **Sora Web** | Khách hàng | Desktop 1440 + Mobile 390 | 48 |
| **Sora Table** | Khách tại bàn (QR) | Điện thoại của khách | 13 |
| **Sora POS** | Phục vụ · Thu ngân | Máy POS 1280×800 cảm ứng | 24 |
| **Sora Kitchen** | Bếp · Expo | Màn hình treo 1920×1080 | 6 |
| **Sora Office** | Quản lý · Kế toán · HR | Desktop 1440+ | 27 |

Tổng **118 màn hình** hi-fi, tiếng Việt, đã gắn sẵn ô ảnh (image-slot) để chèn ảnh thật.

## 2. Về các file thiết kế trong gói này

Các file `.dc.html` là **bản thiết kế tham chiếu viết bằng HTML** — prototype thể hiện đúng
giao diện, nội dung và hành vi mong muốn. **Không phải mã production để copy thẳng.**

Nhiệm vụ của đội phát triển là **dựng lại các thiết kế này trong codebase thật**, theo đúng
framework và thư viện sẵn có của dự án (React/Next.js, Vue, Flutter, native…). Nếu chưa có
codebase, hãy chọn stack phù hợp rồi hiện thực hoá theo mô tả trong `TRIEN-KHAI-DAU-NOI.md`.

Dữ liệu trong prototype là **dữ liệu mẫu hard-code** trong logic class của từng file — dùng
để hiểu cấu trúc (tên trường, trạng thái, quan hệ), không phải schema cuối cùng.

Cách mở xem: mở trực tiếp file `.dc.html` trong trình duyệt (cần `support.js` và
`image-slot.js` nằm cùng thư mục). Mỗi file có thanh chọn màn ở trên cùng để duyệt qua
toàn bộ màn hình, và nút chuyển Desktop/Mobile với Sora Web.

## 3. Độ hoàn thiện: **Hi-fi**

Màu, chữ, khoảng cách, trạng thái hover/active, nội dung copy đều là bản cuối. Dựng lại
**pixel-perfect** bằng hệ component sẵn có của codebase. Mọi giá trị thiết kế đều nằm ở
mục 5 (Design tokens) — không tự chế thêm màu hay font.

## 4. Danh mục màn hình

### Sora Web — website khách hàng
Trang tĩnh: W1 Trang chủ · W2 Thực đơn · W3 Chi tiết món · W4 Câu chuyện · W5 Không gian &
chi nhánh · W6 Đặt bàn · W7 Ưu đãi & Set · W8 Tin tức · W9 Liên hệ & tuyển dụng · Chính sách ·
Điều khoản · 404 · Cảm ơn · bản EN kiểm tra độ dài chữ.

Luồng đặt món mang về (`/dat-mon`): O1 Chọn chi nhánh & kiểu nhận → O2 Thực đơn online →
O3 Chi tiết món → O4 Giỏ & chọn giờ → O5 Người nhận → O6 Thanh toán → O13 VietQR →
O14 Chờ xác nhận → O7 Thành công & theo dõi đơn.

Mọi màn đều có **bản desktop và bản mobile riêng**, không phải responsive tự co.

### Sora Table — gọi món tại bàn bằng QR
T1 Chào & xác nhận bàn · T2 Thực đơn · T4 Tìm kiếm · T6 Giỏ hàng · T7 Xác nhận gửi ·
T8 Đơn của bàn · T10 Tạm tính · T11 Chia tiền · T12 Chọn món mình trả · T13 VietQR ·
T14 Chờ xác nhận · T15 Hoá đơn · T17 Thanh toán bị chặn.

### Sora POS — máy bán hàng tại quầy
Tại bàn: P1 Đăng nhập ca · P2 Sơ đồ bàn · P3 Mở bàn · P4 Gọi món · P6 Popup modifier ·
P7 Chi tiết đơn bàn · P8 Huỷ món · P9 Chuyển/ghép/tách · P10 Tính tiền · P11 Hoàn tất & in ·
P12 Yêu cầu từ bàn · P13 Đặt bàn hôm nay · P14 Đóng ca · P15 Đối soát thanh toán ·
P16 Trạm thu ngân (dải điều phối + drawer gán shipper).

Đơn online & đặt chỗ: O8 Bảng điều phối · O9 Chi tiết đơn · O12 Kênh ngoài ·
R1 Bảng đặt bàn · R2 Chi tiết đặt chỗ · R4 Nhắc hẹn & no-show.

### Sora Kitchen — màn hình bếp
K1 Ghép thiết bị · K2 Hàng vé · K3 Bảng tổng món · K4 Chờ ra · K5 Báo hết món · K6 Expo.

### Sora Office — hậu cần & quản trị
Món & kho: M1 Món và set · M4 Công thức · S1 Tổng quan kho · S2 Tồn kho.
Kinh doanh: B1 Kinh doanh hôm nay · B3 Ma trận món · B13 Phản hồi khách.
Nhân sự: H2 Xếp ca · H7 Tính lương · H8 Ca của tôi · H9 Phiếu lương · H10 Kiosk chấm công.
Tài chính: C1 Tổng quan chi phí · F1 Quỹ & đối chiếu · F7 Báo cáo P&L.
Quản trị: A2 Vai trò & quyền · A3 Sơ đồ bàn · A6 Trung tâm tham số · A10 Chi nhánh.
Kênh online: O10 Vùng giao & phí · O11 Menu online · R3 Cấu hình nhận đặt.

## 5. Design tokens

### Màu — nền và bề mặt
| Token | Hex | Dùng ở |
|---|---|---|
| bg-base | `#07080A` | nền toàn trang |
| surface-1 | `#0A0C10` | thẻ, khối nội dung |
| surface-2 | `#0D0F13` | thẻ lồng, thanh cuộn nền |
| surface-3 | `#10131A` | hộp nhấn mạnh, hover |
| surface-4 | `#151920` | ô tròn/vuông icon, khung thiết bị |
| line-1 | `#1E232C` | đường kẻ mảnh |
| line-2 | `#242A34` | thanh đo chưa đầy |
| line-3 | `#2B313C` | viền nút phụ, scrollbar |
| line-4 | `#3D4552` | viền disabled, scrollbar hover |

### Màu — chữ
| Token | Hex | Dùng ở |
|---|---|---|
| ink-hi | `#F5F2EA` | tiêu đề chính |
| ink-cream | `#EFEBE1` | chữ đậm trên nền tối |
| ink-body | `#C2BCAE` | chữ nội dung |
| ink-mute | `#8B8577` | chữ phụ, nhãn |

### Màu — vàng đồng (thương hiệu)
| Token | Hex | Dùng ở |
|---|---|---|
| gold-500 | `#C9A85C` | viền nhấn, ký hiệu ◆ |
| gold-300 | `#DCC58A` | chữ vàng, link |
| gold-200 | `#EFE0BC` | tiêu đề vàng nhạt |
| gold-600 | `#B08A33` | nền nút chính |
| gold-700 | `#8A6B22` | gradient tối của kim cương số |
| gold-900 | `#5E4917` | watermark kanji (opacity .12) |
| kraft | `#D9CDB8` | nền panel giấy kraft |
| kraft-ink | `#241E17` | chữ trên nền kraft |
| kraft-ink-2 | `#4A3B22` | chữ phụ trên kraft |

### Màu — trạng thái
| Token | Hex | Nghĩa |
|---|---|---|
| ok | `#4A8F63` | xong, đã thanh toán |
| warn | `#D08A1C` | cảnh báo, sắp trễ |
| danger | `#C34141` | trễ, huỷ, lỗi |
| danger-line | `#8C2F2F` / `#6E2A2A` | viền khối cảnh báo |
| info | `#4E7FA8` | vé mới từ app |

### Chữ
- **Cormorant Garamond** 300/600 — tiêu đề lớn, tên món, số liệu trang trọng.
- **Shippori Mincho B1** 400/600 — chữ Nhật (kanji, tên món tiếng Nhật, dấu 御膳/美味).
- **Be Vietnam Pro** 400/500/600/700 — chữ nội dung tiếng Việt (font mặc định).
- **IBM Plex Mono** 400/500 — giá tiền, mã đơn, định lượng, đồng hồ đếm.

Cỡ chữ chính: 52/44/38/34/30/26/24/21/19/16/15/14/13/12/11/10px.
Letter-spacing nhãn viết hoa: `.14em`–`.22em`. Chữ dọc dùng `writing-mode:vertical-rl`.

### Khác
- Bo góc: `0` (khối poster) · `4px` (nút, chip) · `8px` (thẻ) · `999px` (tròn).
- Khoảng cách: 4/6/8/10/12/14/16/18/20/22/26/28/32/36/40/44/48px.
- Animation: `sora-fade`, `sora-rise`, `sora-slide`, `sora-pulse`, `sora-tick` —
  đều tôn trọng `prefers-reduced-motion`.
- Hit target tối thiểu trên POS/Table: **44px**.

## 6. Assets

Thiết kế **không nhúng ảnh thật** — mọi vị trí ảnh là một ô `<image-slot>` có id ổn định
(`dish-<mã món>-main`, `st-<mã món>-hero`, `set-<mã set>-hero`…). Khi dựng lại:

- Thay `<image-slot>` bằng `<img>`/`next/image` trỏ vào CDN ảnh món.
- Mỗi món cần tối thiểu 1 ảnh vuông (thẻ thực đơn) + 1 ảnh ngang 3:2 (hero chi tiết).
- Món có trang "Chuyện nguyên liệu" cần thêm: 1 ảnh dọc nguyên liệu, 1 sơ đồ vị trí,
  3 ảnh độ cắt, 4 ảnh gia vị, 1 ảnh than, 1 ảnh chấm, 1 ảnh chân trang.
- Set cần: 1 ảnh mâm dọn đầy (dọc), 1 ảnh bàn ăn (ngang).

Icon dùng SVG stroke 1.5px vẽ tay trong code, không dùng icon font.

## 7. Files trong gói

```
designs/
  Sora Web.dc.html       — website khách + luồng đặt món mang về
  Sora Table.dc.html     — gọi món tại bàn qua QR
  Sora POS.dc.html       — máy POS: bàn, thu ngân, đơn online, đặt chỗ
  Sora Kitchen.dc.html   — màn hình bếp và expo
  Sora Office.dc.html    — quản trị, kho, nhân sự, tài chính
  support.js             — runtime để mở prototype trong trình duyệt
  image-slot.js          — component ô ảnh placeholder
TRIEN-KHAI-DAU-NOI.md    — kiến trúc, hợp đồng dữ liệu, API, thứ tự triển khai
README.md                — file này
```

Đọc tiếp **`TRIEN-KHAI-DAU-NOI.md`** để biết 5 ứng dụng nối với nhau như thế nào.
