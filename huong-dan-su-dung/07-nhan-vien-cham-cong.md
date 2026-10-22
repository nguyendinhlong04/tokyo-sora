# 7 · Kênh nhân viên & kiosk chấm công

Hai bề mặt dành cho **mọi nhân viên** (phục vụ, bếp, thu ngân…): xem lịch —
công — phiếu lương — việc — thông báo của chính mình trên điện thoại, và chấm
công vào/ra ca tại quán. Chúng là hai app tách biệt vì hai vùng tin cậy khác nhau: điện thoại cá
nhân mang đi khắp nơi, kiosk gắn cứng ở chi nhánh.

## 7.1 Kênh nhân viên (`nv.tokyosora.vn`)

### Cấp link (việc của quản lý nhân sự)

Office → **Nhân sự → H1 Hồ sơ nhân viên** → bấm **Link** ở hàng của người cần
cấp → hộp thoại `Link cá nhân của {tên}` → **Chép link** và gửi cho nhân viên
qua Zalo.

- **Link chỉ hiện đúng một lần** — đóng hộp là không xem lại được; mất thì cấp
  lại. **Cấp lại làm link cũ chết ngay**, kể cả đang mở trên máy khác.
- Link là yếu tố *sở hữu* (mỗi người một link), PIN là yếu tố *biết* — đúng cặp
  mà POS đang dùng.

### Nhân viên vào lần đầu

1. Bấm link `…/nv/{token}` trên điện thoại → máy tự nhớ, địa chỉ token biến
   mất khỏi lịch sử.
2. `Nhập PIN của bạn` — *"Cùng mã PIN bạn dùng ở quán"*, 4 số tự gửi. Sai PIN
   quá 5 lần trong một phút thì khoá 5 phút.
3. Từ đó về sau mở app chỉ cần PIN (phiên sống 12 giờ). Máy của người khác thì
   bấm `Đây không phải máy của tôi`.

Nếu thấy *"Link không còn hiệu lực. Xin quản lý cấp lại."* — có link mới được
cấp, xin lại là xong.

### Thanh tab ở đáy màn

Năm tab trong tầm ngón cái: **Lịch** (mở đầu) · **Việc** · **Thông báo** · **Lương** ·
**KPI**. Chấm số trên tab Việc là số việc đang chờ bạn (đỏ khi có việc quá hạn), trên
tab Thông báo là số văn bản chưa đọc, trên tab KPI là số phiếu đang chờ bạn tự đánh
giá — tự cập nhật mỗi phút khi app đang mở; chưa có thông báo đẩy, nên quán vẫn dán
link văn bản vào nhóm Zalo.

**Lịch & công (H8):**

- **Lịch tuần** — chuyển tuần bằng `‹ ›`; chỉ hiện **ca đã công bố** (ca nháp
  của quản lý thì chưa thấy). Ca ghi giờ, tên ca, và chi nhánh nếu làm nơi khác
  chi nhánh chính.
- **Bảng công** — giờ công tháng (`176g30`), tăng ca thường/ngày nghỉ/lễ, danh
  sách từng ngày. Ba dòng cảnh báo quan trọng:
  - *"Còn N ca chưa chấm ra. Nhớ bấm ở kiosk trước khi về — ca chưa chấm ra thì
    chưa vào bảng công."*
  - *"Ngày có ca mà không có công: …"*
  - *"Kỳ lương … đã chốt công — giờ công trong khoảng đó không đổi nữa."*
  - Ngày do quản lý sửa tay có ghi rõ ai sửa, lý do.
- **Gửi yêu cầu nghỉ / đổi ca** — 4 loại: Nghỉ phép · Nghỉ ốm · Nghỉ không
  lương · Đổi ca (đổi ca phải chọn **Người nhận ca**); lý do bắt buộc. Yêu cầu
  đổ vào hàng đợi duyệt của quản lý (H5); trạng thái `Chờ duyệt / Đã duyệt /
  Từ chối` xem ở khối **Yêu cầu của tôi**.

**Phiếu lương (H9):** chọn kỳ → các dòng **Cộng** (lương theo công, tăng ca
`6g00 × 150%…`, phụ cấp, thưởng) và **Trừ** (bảo hiểm, thuế TNCN tạm khấu trừ,
tạm ứng) → **Thực lãnh**. Phiếu chỉ hiện **sau khi kỳ lương được duyệt**. Màn
hoàn toàn chỉ đọc — *"Thấy số chưa đúng thì nhắn quản lý nhân sự — kỳ đã chốt
không sửa ngược, sai sẽ được cộng/trừ ở kỳ sau."*

**Việc (N12):** dòng đầu là ca hôm nay của bạn (ca đã công bố). Bên dưới:

- **Chờ bạn nghiệm thu** — chỉ có khi bạn giữ ghế được chỉ định nghiệm thu (vd. quản
  lý ca nghiệm thu checklist mở ca). Mở việc, xem ai tích mục nào, bấm **Đạt** hoặc
  **Trả lại…** kèm lý do.
- **Cần làm** — quá hạn trước (chữ đỏ "Quá hạn N giờ"), rồi hôm nay, rồi sắp tới.
  Checklist mở ca, đóng ca, vệ sinh ATTP **chỉ hiện khi bạn đứng đúng ca đã công bố**:
  nghỉ được duyệt thì việc của ca đó không tới bạn. Việc quản lý giao tận tay ghi
  "Giao bởi …".
- Mở một việc: bấm **Nhận việc** để người giao biết việc đã tới tay; chạm từng mục
  checklist để tích — lưu ngay, mất sóng thì mục tự bỏ tích và báo lỗi. Cả ca làm
  chung một checklist, mỗi mục ghi tên người tích.
- **Nộp nghiệm thu** (hoặc **Báo xong** nếu việc không cần nghiệm thu). Còn mục chưa
  tích thì phải ghi lý do mới nộp được. Bị trả lại thì việc quay về "Cần làm" kèm
  lý do ở đầu việc.
- **Đã nộp gần đây** — việc 7 ngày qua: chờ nghiệm thu hay đã xong.
- **Báo cáo cần nộp** — báo cáo ca của ghế bạn giữ (vd. báo cáo ca bếp của bếp trưởng).
  Chữ đã gõ giữ trong máy cho tới khi nộp xong. Báo cáo có số tiền (cuối ngày, giao ca)
  hiện ở đây để nhắc nhưng **nộp ở máy của quán**.
- **Báo sự cố** (nút cuối màn) — loại, mức, chuyện gì, đã làm gì ngay. Có người bị
  thương, cháy nổ, ngộ độc thì gọi quản lý và cấp cứu trước, báo ở đây sau.

**Thông báo (N13):** thông báo, quyết định, quy định đã ký ban hành gửi tới bạn.

- Văn bản **Cần bạn xác nhận** (nội quy, quy định ATTP…) nằm trên cùng, gắn nhãn
  _Cần xác nhận_. Chưa đọc thì tiêu đề in đậm, có chấm vàng.
- Mở văn bản là đã ghi **đã đọc**. Văn bản cần xác nhận có nút **Tôi đã đọc và
  hiểu** dính đáy màn — bấm một lần, hiện _"Đã xác nhận {ngày}"_. Đó là bằng chứng
  quán đã phổ biến cho bạn, không bấm lại hay huỷ được.
- Tài liệu đính kèm mở bằng link (tab mới). Văn bản bị thu hồi tự biến khỏi danh
  sách.
- Quyết định bổ nhiệm/điều chuyển về chính bạn cũng tới đây; chức danh ở đầu màn
  đổi theo ngày hiệu lực.

**KPI của tôi (N14):** mỗi kỳ đánh giá một thẻ — điểm (_tạm tính_ khi kỳ còn chạy),
hạng A–D trên thanh than hồng, và nhãn **Cần tự đánh giá** khi tới lượt bạn.

- Mở một kỳ: từng chỉ số bạn được chấm, trọng số, **% đạt**. Chỉ số chưa đủ dữ liệu
  ghi "không tính" — nó không kéo điểm của bạn xuống. Doanh thu, giá vốn không hiện
  số tiền trên điện thoại, chỉ % đạt.
- **Tự đánh giá:** chạm 1–5 cho từng chỉ số, viết vài dòng tự nhận xét, bấm **Gửi tự
  đánh giá** (gửi lại được tới khi cấp trên kết thúc phiếu). Tự chấm chỉ để cấp trên
  đối chiếu — điểm tính từ số thật và phần cấp trên chấm.
- Kỳ đã chốt: đọc nhận xét của cấp trên, ghi ý kiến nếu muốn, bấm **Tôi đã xem kết
  quả** — một lần.
- Không có số thưởng ở đây; thưởng (nếu có) nằm trong phiếu lương H9. KPI không phạt,
  không trừ lương.

### Ranh giới phạm vi `self` (cố ý)

Phiên mở bằng link cá nhân **chỉ xem được dữ liệu của chính mình** — kể cả thu
ngân hay bếp trưởng cũng không mở được màn vận hành nào từ điện thoại:
*"Kênh nhân viên chỉ mở lịch, công, lương, việc, văn bản và KPI của chính bạn. Việc
quản lý cần đăng nhập ở máy của quán."* Chấm KPI cho người khác làm ở Office (N10). Chấm công từ đây cũng bị chặn — phải ra
kiosk. Link cá nhân cũng không xin được luồng tin trực tiếp (realtime) của quán.

## 7.2 Kiosk chấm công (`chamcong.tokyosora.vn`)

Tablet gắn cố định ở lối vào khu nhân viên. **Chi nhánh nằm trong chính cái
máy** — đó là toàn bộ cơ chế "không chấm hộ từ ngoài". Lắp đặt và ghép máy (mã
6 số loại *Kiosk chấm công*, sinh ở Office → A4 Thiết bị) xem
[THIET-BI.md](../THIET-BI.md).

### Chấm công

```mermaid
flowchart LR
    A["Chạm vào tên của bạn"] --> B["Nhập PIN 4 số"]
    B --> C{"Máy chủ tự quyết:<br/>chưa chấm hôm nay?"}
    C -- "Lần 1" --> D["Vào ca — 'Chào {tên}'<br/>giờ chấm · lịch · Đúng giờ / Muộn N phút"]
    C -- "Lần 2" --> E["Ra ca — 'Tạm biệt {tên}'<br/>'Hôm nay 7 giờ 38 phút'"]
    C -- "Lần 3" --> F["Chặn: 'đã chấm ra hôm nay —<br/>cần sửa thì nhờ quản lý ở bảng công'"]
```

- Người bấm **không chọn vào hay ra** — máy chủ tự quyết theo bản ghi trong
  ngày. Màn chào tự tắt sau 6 giây.
- Đi muộn dưới 5 phút vẫn hiện `Đúng giờ` (khoan dung đúng bằng máy chủ tính
  công). Không có ca trong lịch vẫn chấm được, màn ghi *"quản lý sẽ đối chiếu
  lại"*.
- Làm nhiều chi nhánh: chấm được ở nơi mình **có ca hôm đó**; chấm nhầm chi
  nhánh sẽ bị báo *"Hôm nay bạn không có ca ở chi nhánh này"*.
- Sau **mỗi** lượt chấm máy tự đăng xuất — tablet đứng ở lối vào, không phải
  máy của ai. Chọn tên rồi bỏ đi thì 20 giây sau màn tự về lưới tên.

### Khi có chuyện

| Tình huống | Máy nói | Việc cần làm |
|---|---|---|
| **Mất mạng** | `Mất mạng — gọi quản lý, đừng bỏ ca chưa chấm` | Quản lý ghi công tay ở H4 kèm lý do. Kiosk **cố ý không chấm offline** — lượt chấm không tới máy chủ thì không phải là lượt chấm |
| Sai PIN nhiều lần | `Nhập sai PIN quá nhiều lần. Thử lại sau N phút.` | Chờ hết khoá (5 phút) |
| Kỳ lương đã chốt công | `Kỳ lương … đã chốt công. Sai thì ghi bút toán công ở kỳ sau, không sửa ngược.` | Báo quản lý nhân sự |
| Quên chấm ra hôm trước | Bảng công báo "ca chưa chấm ra" | Nhờ quản lý sửa công tay (có lý do, ghi nhật ký) — **ca chưa chấm ra chưa vào bảng công** |

### Chống chấm hộ — ba lớp đang chạy

1. **PIN riêng từng người** (kiosk chỉ hiện chấm tròn, không hiện số).
2. **Máy gắn cứng chi nhánh** — mang kiosk ra ngoài là nó thành vô dụng.
3. **Đối chiếu chéo** ở Office H3: có phiên POS/KDS mà không chấm công → nhắc;
   có chấm công mà không có hoạt động nào → cảnh báo.

*Ảnh chụp lúc chấm (tuỳ chọn trong thiết kế) chưa có trong bản dựng này.*

## 7.3 Phía quản lý — vòng khép Lịch → Công → Lương

Dữ liệu từ hai bề mặt này chảy về Office (chi tiết chương 6 §6.3):

```mermaid
flowchart LR
    H2["H2 Xếp lịch tuần<br/>Công bố lịch"] --> H8["Kênh nhân viên<br/>thấy ca của mình"]
    K["Kiosk chấm công<br/>vào / ra ca"] --> H3["H3 Chấm công hôm nay<br/>bảng lệch 3 nguồn"]
    K --> H4["H4 Bảng công tháng<br/>giờ đã phân hệ số"]
    H8 -- "yêu cầu nghỉ / đổi ca" --> H5["H5 Duyệt nghỉ & đổi ca"]
    H5 --> H2
    H4 --> H7["H7 Kỳ lương:<br/>Chốt công → Tính nháp → Trình<br/>→ Kiểm → Duyệt → Phát"]
    H7 -- "phiếu lương" --> H9["Kênh nhân viên<br/>H9 Phiếu lương"]
```

Nguyên tắc xuyên suốt: **lương tính từ công thực tế đã chấm, không từ lịch
xếp** — vì vậy "chưa chấm ra thì chưa vào bảng công" không phải lỗi vặt, nó là
tiền của người làm.
