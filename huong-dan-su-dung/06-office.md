# 6 · Sora Office — hậu cần & quản trị

Office chạy tại `admin.tokyosora.vn` trên máy tính văn phòng, nền sáng. Người
dùng: chủ (R10), quản lý chuỗi (R11), quản lý ca (R7), kế toán (R8), quản lý
nhân sự (R13), marketing (R9), bếp trưởng (R5), thủ kho (R6).

## 6.1 Đăng nhập & khung màn hình

- Đăng nhập bằng **Chi nhánh + Email + Mật khẩu** (nút **Vào Office**) — không
  cần thiết bị ghép. **Phiên mở đúng một chi nhánh**; vai trò cấp chuỗi muốn
  làm việc ở chi nhánh khác thì đăng nhập lại.
- Cột trái là menu 10 nhóm dạng accordion (một nhóm mở tại một thời điểm; nhóm
  chứa trang đang xem tự mở). Ô **"Lọc menu…"** gõ là trải phẳng kết quả — gõ
  "kho" hay "S5" đều ra. Menu chỉ hiện màn mà vai trò của bạn dùng được.
- Trang mở đầu là **N1 · Bàn làm việc** — việc của chính bạn hôm nay (§6.4b).
- **Chuông "Việc cần xử lý"** cạnh logo: số trên chuông là tổng việc đang chờ bạn
  (việc được giao, việc chờ bạn nghiệm thu, báo cáo cần nộp / cần xem, sự cố đang mở,
  khiếu nại bạn đang xử lý, văn bản chưa đọc, văn bản chờ bạn ký). Có việc, báo cáo,
  khiếu nại **quá hạn** hoặc sự cố nghiêm trọng đang mở thì chấm số chuyển đỏ và dòng
  tương ứng ghi rõ. Bấm để xem từng nhóm và đi thẳng tới màn xử lý.
  Số tự cập nhật mỗi phút — chưa có thông báo đẩy.

**Ba cách nói "chi nhánh nào"** — nhầm lẫn phổ biến nhất khi mới dùng:

| Bộ chọn | Nhãn | Dùng ở | Ý nghĩa |
|---|---|---|---|
| Chi nhánh phiên | "Chi nhánh đang xem" (thanh bên) | Mọi màn vận hành/sổ sách còn lại | Phạm vi đăng nhập — đổi bằng cách đăng nhập lại |
| Bộ lọc báo cáo | Ô **"Chi nhánh"** | 11 màn đọc: B1–B10 và F7 | Đảo nhanh để so sánh; chọn một lần, cả nhóm báo cáo đổi theo |
| Bộ chọn cấu hình | Ô **"Chi nhánh đang cấu hình"** | 8 màn ghi: O10 · O11 · R3 · A3 · A4 · A5 · A6 · A9 | Ngồi một chỗ khai cho từng chi nhánh; khi khác chi nhánh đăng nhập sẽ có cảnh báo cam *"Khác chi nhánh đăng nhập"* |

## 6.2 Báo cáo kinh doanh (B1–B10)

Mọi màn báo cáo có bộ chọn kỳ + mốc so sánh, số nào cũng kèm chip chênh lệch
▲▼. Ô chưa có nguồn dữ liệu hiện gạch ngang kèm lý do — cố ý không hiện 0₫.

| Màn | Trả lời câu hỏi gì |
|---|---|
| **B1 · Hôm nay** | Màn mở đầu mỗi sáng: doanh thu, khách, BQ/khách, số đơn, food cost — so *hôm qua* và *cùng thứ tuần trước*; biểu đồ theo giờ; món đang bị bếp gạt; cảnh báo kho. Tự tải lại mỗi 60 giây |
| **B2 · Doanh thu** | Một con số cắt 5 lát: ngày, khung giờ, khu, hình thức, kênh, cách trả |
| **B3 · Phân tích món** | Ma trận 4 ô **Ngôi sao 星 · Bò sữa 牛 · Câu đố 謎 · Bỏ đi 去** + món dịch chuyển ô giữa các kỳ |
| **B4 · Giá vốn & lãi gộp** | Food cost từng ngày so mục tiêu; đóng góp lãi gộp theo nhóm (xếp theo **tiền**, không theo %) |
| **B5 · Hiệu suất bếp** | Thời gian vé vào hàng → xong theo trạm/khung giờ, tỉ lệ trễ SLA — **tách kênh tại bàn / online** |
| **B6 · Vòng quay bàn** | Thời gian ngồi, lượt/bàn/ngày; cột **Lấp đầy** lộ bàn đặt sai kích cỡ |
| **B7 · Nhân sự** | Doanh thu theo nhân viên, kèm số **Huỷ** và **Cần duyệt** đứng cạnh nhau — doanh thu cao mà duyệt nhiều là đang giảm giá để bán. Không có số lương nào ở đây |
| **B8 · Set & giảm giá** | Lãi thật của set (food cost theo **lựa chọn thật** của khách); BQ đơn có/không giảm giá |
| **B9 · Online & đặt bàn** | Đơn online theo giờ, tỉ lệ huỷ, thời gian giao; tỉ lệ no-show theo kiểu chỗ |
| **B10 · Trung tâm báo cáo** | Chọn kỳ một lần → **Xuất CSV** từng báo cáo (UTF-8 BOM, Excel không hỏng dấu). *Chưa có:* đặt lịch email, PDF, so liên chi nhánh |

Quy tắc đọc số: **doanh thu không gồm VAT và phí ship** (tiền thu hộ/trả hộ) —
riêng lát "theo cách trả tiền" cộng cả hai vì để đối soát với sổ quỹ F1.

## 6.3 Khách & khuyến mãi (B11–B15)

- **B11 · Khuyến mãi & voucher** — nút **Soạn chương trình** (giảm %, giảm
  tiền, tặng món, giá set khung giờ; điều kiện kênh/thứ/giờ/đơn tối thiểu; phát
  lô mã voucher). Marketing soạn được nhưng **bật chương trình phải có quản lý
  chuỗi/chủ duyệt bằng PIN** ngay trên màn (dải **Duyệt & bật**) — vì bật là
  đụng giá. **Một đơn chỉ hưởng một chương trình, không cộng dồn.**
- **B12 · Sổ khách** — hồ sơ gom **tự động theo SĐT** từ đặt bàn + đơn online +
  lượt thu tiền; không có nút "thêm khách". Hai tab *Hồ sơ & lịch sử* và
  *Điểm & hạng*. Vai trò không đủ quyền thấy SĐT bị che. **Điều chỉnh điểm
  tay** là cửa duy nhất đi vòng quy tắc "điểm chỉ sinh từ thanh toán" — bắt
  buộc lý do, luôn ghi nhật ký A7.
- **B13 · Phản hồi khách** — hàng đợi từ thẻ chấm sao sau thanh toán; nhận việc
  (**Tôi nhận việc này**), đóng khiếu nại phải ghi "đã xử lý thế nào"; quá hạn
  viền đỏ. **Giao việc…** tạo việc khắc phục (N5) cho bếp hoặc sảnh, gắn với khiếu
  nại — việc làm xong KHÔNG tự đóng khiếu nại: câu trả lời khách vẫn do người phụ
  trách tự viết. Bảng "món hay xuất hiện trong bill bị chấm thấp" dùng để đi hỏi,
  không phải để cắt món.
- **B14 · Tích điểm & hạng** — cửa sửa tham số tích/đổi điểm và 3 hạng (chi
  tiêu 12 tháng trượt). Chỉ chủ sửa được; không có nút cộng điểm ở đây.
- **B15 · Khách doanh nghiệp** — hồ sơ MST, hạn mức nợ, điều khoản NET; bảng kê
  tuổi nợ 4 khoang; **Gạch nợ** khi tiền về. Quá hạn quá N ngày → **POS tự chặn
  ghi nợ mới**, cột "Quầy" nói rõ hồ sơ nào đang bị chặn.

## 6.4 Nhân sự (H1–H7)

Dòng chảy chuẩn **Lịch → Công → Lương**, mỗi bước khoá bước trước (sơ đồ tổng
ở chương 7 §7.3):

- **H1 · Hồ sơ nhân viên** — gắn hồ sơ vào **tài khoản đã có ở A1** (không tạo
  người mới ở đây): vị trí, cách trả lương (giờ/tháng), đơn giá, phụ cấp, tài
  khoản nhận lương. Nút **Link** cấp link Kênh nhân viên (chương 7 §7.1).
- **H2 · Xếp lịch tuần** — kéo ca vào lưới ngày × người, **Sao chép tuần
  trước**, rồi **Công bố lịch**. Quy tắc quyết định mọi thứ: **ca nháp thì nhân
  viên không thấy và giờ công chưa tính** — chỉ ca đã công bố mới được kỳ lương
  đọc. Khi sửa một ô, chọn **Ca mẫu** (ca sáng, ca tối…) thay vì gõ giờ: ô nhớ ca
  mẫu của nó, và SOP theo ca (N6) dựa vào đó để biết ai đứng ca mở cửa, ai đứng ca
  đóng cửa. Khối **Ca mẫu của chi nhánh** dưới lưới để thêm ca mẫu và xem SOP nào
  đang gắn vào ca nào.
- **H3 · Chấm công hôm nay** — bảng lệch **ba nguồn**: lịch xếp · công đã chấm
  (kiosk) · phiên đăng nhập POS/KDS. Khối "Cần đối chiếu" chỉ ra người có làm
  mà chưa chấm (sẽ bị trả thiếu) hoặc có chấm mà không thấy hoạt động.
- **H4 · Bảng công tháng** — giờ đã phân theo hệ số (thường / TC 150% / 200% /
  300%) — đúng con số kỳ lương dùng. Sửa tay bắt buộc lý do, ghi nhật ký; kỳ đã
  chốt công thì chỉ đọc — sai thì bút toán công kỳ sau.
- **H5 · Nghỉ phép & đổi ca** — một hàng đợi duyệt. Duyệt nghỉ thì ca rời lịch;
  **duyệt đổi ca thì hai ô lịch đổi chỗ và quay về nháp — phải công bố lại**.
- **H6 · Cơ chế lương** — giờ chuẩn, hệ số tăng ca (150/200/300%), khấu trừ
  (BHXH trên **lương cơ bản**). **Không có mục phạt tiền đi muộn** — luật lao
  động không cho phạt tiền; đi muộn trừ theo giờ không làm việc.
- **H7 · Kỳ lương** — 5 bước, không nhảy bước, ba vai trò:

```mermaid
flowchart LR
    A["Chốt công<br/>(R13 nhân sự)"] --> B["Tính nháp<br/>(R13)"]
    B --> C["Trình duyệt<br/>(R13)"]
    C --> D["Đã kiểm<br/>(R8 kế toán)"]
    D --> E["Duyệt<br/>(R10 chủ)"]
    E --> F["Đã phát<br/>(R10) — phiếu lương<br/>về Kênh nhân viên"]
```

  **"Chốt công" là mốc không quay lại** — sau đó bảng công của kỳ đóng băng.
  Không ai một mình đưa được tiền lương ra khỏi quỹ: nhân sự trình, kế toán
  kiểm, chủ duyệt và phát. Quản lý ca thấy *công* nhưng không bao giờ thấy
  *lương*.

  **Tính nháp…** mở bảng điều chỉnh từng người: **thưởng**, **tạm ứng**, **ghi chú**.
  Kỳ KPI cùng tháng đã chốt (N10) thì người chưa có dòng lương được điền sẵn thưởng
  gợi ý (hạng, điểm, số gợi ý hiện ngay trên dòng); **Lấy thưởng KPI** điền lại cả
  bảng. Sửa được, nhưng **khác gợi ý thì bắt buộc ghi lý do**. Kỳ KPI chưa chốt thì
  khung trên nói rõ vì sao chưa có thưởng — ô thưởng không tự về 0. Tính nháp lại
  không làm mất thưởng đã nhập. Phiếu chi tạm ứng (C2) trong kỳ được lấy tự động,
  thay cho số nhập tay. Bảng lương tách riêng cột **Thưởng** và hiện ghi chú.

## 6.4b Tổ chức & điều hành (N1 – N11)

Sơ đồ tổ chức là trục của giao việc, văn bản, báo cáo và KPI: **cấp trên trực
tiếp** của một người là người ngồi ghế **trưởng** của đơn vị gần nhất phía trên.

| Màn | Dùng để |
|---|---|
| **N1 · Bàn làm việc** | Trang mở đầu: việc của tôi (quá hạn → hôm nay → sắp tới), báo cáo cần nộp, việc chờ tôi nghiệm thu, văn bản cần đọc/ký, phiếu KPI của tôi và phiếu chờ tôi chấm, khiếu nại tôi đang xử lý; nút **Báo sự cố**. Bấm một việc để tích checklist, nộp, nghiệm thu; bấm một báo cáo để điền và nộp |
| **N2 · Sơ đồ tổ chức** | Cây đơn vị (công ty → khối/phòng → chi nhánh → bộ phận → tổ). Mỗi thẻ đơn vị liệt kê chức danh: người đang giữ, **thực có/định biên**, thanh than hồng (càng nóng càng thiếu người — đỏ là ghế trưởng trống). Bố cục **Dọc/Ngang**, thu phóng, **tìm người** (mở nhánh và đưa thẻ ra giữa), lọc chi nhánh, **In sơ đồ** (A3 ngang) |
| **N3 · Chức danh & định biên** | Cùng dữ liệu dạng bảng: lọc "chỉ ghế còn trống", cột vai trò gợi ý báo người giữ ghế chưa có quyền ở A1 |
| **N4 · Văn bản & thông báo** | Sổ thông báo, quyết định, quy định nội bộ. Tab **Gửi tôi · Chờ tôi ký · Tôi soạn · Tất cả**. Soạn, trình ký, ký bằng PIN, thu hồi; theo dõi ai đã đọc/xác nhận |
| **N5 · Giao việc** | Tab **Tôi giao · Đơn vị tôi · Chờ tôi nghiệm thu**. Giao cho người trong phạm vi, theo dõi đã nhận / checklist / quá hạn, nghiệm thu hoặc trả lại, huỷ kèm lý do |
| **N6 · Việc định kỳ & SOP** | Tab **Hôm nay** (checklist từng ca: ai làm, ai nghiệm thu, còn gì trễ) · **Mẫu việc** (SOP giao cho chức danh, lặp theo ca / ngày / tuần / tháng). Nút **Dùng bộ SOP chuẩn** |
| **N7 · Báo cáo công việc** | Tab **Cần tôi xem · Còn thiếu · Tất cả · Mẫu**. Xem, xác nhận (hoặc "Nhận ca" với sổ giao ca), viết bổ sung; mẫu báo cáo theo chi nhánh. Nút **Dùng bộ mẫu chuẩn** |
| **N8 · Sự cố** | Danh sách sự cố đang mở / đã đóng, lọc theo mức. Điều tra, giao việc khắc phục, ghi mốc khai báo ra ngoài, đóng |
| **N9 · Bộ KPI** | Tab **Bộ KPI theo chức danh** (mỗi ghế 3–6 chỉ số, trọng số đúng 100%) · **Danh mục chỉ số** (cách tính, nguồn số, khi nào "không tính"). Nút **Dùng bộ KPI mẫu** |
| **N10 · Kỳ đánh giá KPI** | Mở kỳ, đặt chỉ tiêu riêng, công bố, tính lại số, chấm phiếu, chốt kỳ. Thưởng gợi ý chỉ người xem được lương thấy |
| **N11 · Phiếu kiểm tra** | Điểm kiểm tra vệ sinh ATTP và khách bí mật (0–100) kèm đường dẫn bằng chứng; huỷ kèm lý do |

**Bắt đầu nhanh — dựng theo mẫu chuẩn:** nút **Dựng khung chuỗi theo mẫu** tạo Ban
điều hành, Khối văn phòng (Kế toán, Nhân sự, Marketing), Khối vận hành; dải
**"Chi nhánh chưa có trên sơ đồ"** có nút **Dựng … theo mẫu** cho từng chi nhánh
(Sảnh, Bếp với sáu tổ theo trạm ST-01…ST-06, Kho), kèm **mô tả công việc** ba
phần (trách nhiệm · quyền hạn · tiêu chuẩn) cho từng chức danh. Áp lại không nhân
đôi; sửa tay sau khi áp không bị ghi đè. Nội dung mẫu là bản nháp — duyệt lại
trước khi dùng làm căn cứ tuyển dụng.

- **Gán người vào ghế:** bấm một chức danh → tab **Người giữ** → chọn người, chức
  danh chính hay kiêm nhiệm, từ ngày, **lý do** (bắt buộc với gán tay). Người đang
  giữ chức chính khác thì hệ thống hỏi **Điều chuyển** — chức cũ đóng đúng ngày
  nhận chức mới. **Không ai tự gán chức cho mình.**
- **Kết thúc chức danh** ghi ngày thôi giữ và lý do. Lịch sử giữ chức không xoá,
  không sửa ngược (tab **Lịch sử**).
- **Hồ sơ H1 đi theo sơ đồ:** người đã có ghế thì cột Chức danh ở H1 lấy từ sơ đồ
  và chỉ đọc — đổi bằng điều chuyển ở N2.
- **Sơ đồ không cấp quyền.** Mỗi chức danh có vai trò gợi ý (R1–R13); người giữ
  ghế chưa có vai trò đó thì sơ đồ nhắc, việc cấp vẫn làm ở **A1**.
- **Ai thấy gì:** mọi vai trò có tài khoản Office **xem** được cả sơ đồ (không có số
  lương nào ở đây); chỉ R10 · R11 · R13 **sửa** được và thấy danh sách "chưa xếp vào
  sơ đồ". Phạm vi theo cây áp cho **thao tác** — giao việc, ký văn bản, chấm KPI —
  không áp cho việc xem. R1–R4 không mở Office.

**Giao việc (N5):**

- **Giao việc** → việc cần làm, **người nhận** (chỉ hiện người trong phạm vi bạn quản
  lý theo sơ đồ; ô **Chọn cả ghế…** tick sẵn mọi người đang giữ một chức danh), hạn
  ngày + giờ, **nghiệm thu** (mặc định là bạn; chọn người khác hoặc "Không cần — nộp
  là xong"), ưu tiên Thường/Gấp, ghi chú, checklist tuỳ chọn, đính kèm link https.
  Mỗi người nhận ra **một việc riêng**. Không tự giao cho mình; người làm không là
  người nghiệm thu.
- Người nhận thấy việc trên **Kênh nhân viên** (tab Việc) hoặc **N1** nếu dùng Office.
  Cột **Đã nhận** cho biết việc đã tới tay chưa.
- **Nghiệm thu đạt** hoặc **Trả lại…** kèm lý do — việc về "đang làm", người làm thấy
  lý do và nộp lại. **Huỷ việc…** khi không cần làm nữa (bắt buộc lý do); việc đã xong
  hoặc đã huỷ là hồ sơ, không sửa được.
- **Quá hạn** = còn đang làm mà đã qua hạn: chữ đỏ ghi "Quá hạn N giờ". Việc đã quá
  hạn **không dời hạn được** — muốn làm lại thì huỷ kèm lý do rồi giao việc mới.
- Ai giao được cho ai: trưởng một đơn vị giao trong cây con của đơn vị đó; quản lý ca
  (R7) cả chi nhánh; quản lý chuỗi, chủ cả chuỗi. Nhân sự (R13) giao việc trong phòng
  nhân sự, không giao việc vận hành.

**Việc định kỳ & SOP (N6):**

1. Ở **H2**, tạo ca mẫu (ca sáng, ca tối…) và xếp lịch bằng ca mẫu, rồi **Công bố**.
2. Ở N6 tab **Mẫu việc**, bấm **Dùng bộ SOP chuẩn**: mở ca sảnh/bếp gắn vào ca bắt đầu
   sớm nhất, đóng ca sảnh/bếp (gas, điện, nước, khoá) và vệ sinh ATTP gắn vào ca kết
   thúc muộn nhất; kiểm hạn dùng hằng ngày, tổng vệ sinh bếp thứ Hai, kiểm PCCC và tủ
   sơ cứu ngày 1 hằng tháng. Chi nhánh chưa có ca mẫu thì SOP mở/đóng ca chạy theo giờ
   cố định — tạo ca mẫu rồi sửa mẫu để gắn theo ca. Sơ đồ chi nhánh phải dựng trước
   (SOP giao cho chức danh). Nội dung checklist là bản nháp — duyệt lại trước khi dùng.
3. **Thêm mẫu** / bấm một mẫu để sửa: ghế làm, ghế nghiệm thu, lặp (theo ca · hằng
   ngày · hằng tuần · hằng tháng), hạn (theo ca để trống = giờ kết ca), checklist, văn
   bản hướng dẫn (N4). Sửa mẫu chỉ áp cho việc sinh từ nay; **Đã tắt** thì ngừng sinh.
4. Việc **tự sinh** mỗi ngày (không cần ai bấm). Việc theo ca chỉ tới người giữ đúng
   ghế VÀ đứng ca **đã công bố** — người nghỉ không bị đòi checklist. Cả ca làm chung
   một checklist, mỗi mục ghi tên người tích; ai trong ca cũng nộp được.
5. Tab **Hôm nay**: từng ca, việc nào xong / chờ nghiệm thu / quá hạn (viền đỏ), ai
   nộp. Bấm vào để xem từng mục và nghiệm thu.

**Báo cáo công việc (N7, nộp ở N1):**

- Ba mẫu chuẩn (**Dùng bộ mẫu chuẩn**, quản lý chuỗi / chủ): **Báo cáo cuối ngày** (quản
  lý chi nhánh nộp, quản lý ca nộp thay khi quá hạn; hạn 9 giờ sáng hôm sau), **Sổ giao
  ca** (quản lý ca, mỗi ca, hạn 30 phút sau giờ kết ca; quản lý ca của ca sau bấm **Nhận
  ca**), **Báo cáo ca bếp** (bếp trưởng / bếp phó, nộp được trên điện thoại).
- Báo cáo **tự xuất hiện** ở mục *Báo cáo cần nộp* của N1 khi tới kỳ — không ai phải
  tạo. Báo cáo theo ca chỉ tới người đứng đúng ca đã công bố.
- **Trường tự điền** (doanh thu thuần, số đơn, khách, đơn huỷ, món huỷ sau gửi bếp, vé
  bếp trễ, khách chấm 1–2 sao, điểm chấm, chênh lệch két, QR chưa về, người đứng ca,
  checklist SOP) máy tính đúng như B2/B5; lúc còn nháp là số xem trước, **bấm Nộp thì
  chốt lại**. Két lệch quá 20.000₫ thì bắt buộc giải trình — hệ thống không tự trừ
  lương ai.
- Đã nộp thì **không sửa** — dùng **Thêm bổ sung**. Nộp sau hạn (cộng 15 phút ân hạn, A6
  `workreport.graceMinutes`) ghi "trễ hạn".
- Tab **Còn thiếu**: suất đã quá hạn mà chưa nộp. Người viết không tự xác nhận báo cáo
  của mình.
- Báo cáo có số tiền chỉ nộp ở Office; Kênh nhân viên nộp được mẫu không có tiền.

**Sự cố (N8):**

- Ai cũng **Báo sự cố** được (Office N1/N8, Kênh nhân viên): loại, mức, giờ xảy ra,
  chuyện gì, đã làm gì ngay. Mã `SC-…`. Báo sau hơn 24 giờ kể từ lúc xảy ra (A6
  `workreport.incidentReportHours`) thì danh sách ghi **Báo trễ**.
- **Tai nạn lao động, an toàn thực phẩm, cháy nổ** mức nghiêm trọng trở lên: hệ thống
  đánh dấu **phải khai báo ra ngoài** — người xử lý ghi mốc và nơi đã khai báo (số hiệu
  văn bản pháp luật cụ thể: hỏi pháp chế).
- Người xử lý (bếp trưởng, quản lý ca, quản lý chuỗi, nhân sự, chủ) ghi **nguyên nhân
  gốc**, **biện pháp**, thiệt hại ước tính, **giao việc khắc phục** (hạn mặc định 7
  ngày) rồi **Đóng sự cố…**. Chỉ đóng được khi đủ nguyên nhân, biện pháp, mốc khai báo
  (nếu phải) và mọi việc khắc phục đã xong.
- Sự cố **nghiêm trọng** chỉ quản lý chuỗi hoặc chủ đóng, và người báo không tự đóng.
  Sự cố không xoá; đã đóng thì không sửa.

**KPI (N9 – N11):**

- **N9 · Bộ KPI** — mỗi chức danh 3–6 chỉ số trong danh mục, trọng số cộng đúng 100%
  (thiếu hay thừa thì nút **Lưu bộ KPI** không bấm được), chỉ tiêu mặc định theo đơn vị
  của chỉ số. Lưu là tạo **phiên bản mới** — kỳ đã mở vẫn chấm theo bộ lúc mở. **Dùng
  bộ KPI mẫu** dựng bộ cho các chức danh chuẩn còn trống (văn phòng chuỗi hoặc từng
  chi nhánh). Ghế chưa có bộ KPI thì người ngồi ghế đó được miễn đánh giá khi mở kỳ.
- **N10 · Kỳ đánh giá KPI** — đi đúng một chiều:
  1. **Mở kỳ mới** (chi nhánh, tháng hoặc quý): dựng phiếu cho mọi nhân viên đang làm,
     người đánh giá là **cấp trên trực tiếp** theo sơ đồ lúc đó. Kỳ nháp là lúc đặt
     **chỉ tiêu riêng** cho từng người (bắt buộc lý do) và **miễn đánh giá** người nghỉ
     dài.
  2. **Công bố…** chụp thang chấm và mức thưởng từ A6 (nhóm "KPI & thưởng") — đổi A6
     sau đó không đổi kỳ này (quy chế thưởng công bố trước, Điều 104). Dán đường dẫn
     văn bản quy chế nếu có.
  3. **Tính lại** lấy số thật từ dữ liệu (giãn cách 5 phút giữa hai lần bấm).
  4. Sau ngày cuối kỳ: **Bắt đầu đánh giá** (số được tính lại lần cuối). Người đánh giá
     mở từng phiếu: chấm 1–5 phần thái độ, tay nghề; **loại** chỉ số có dữ liệu sai
     (bắt buộc lý do); nhận xét; **Kết thúc đánh giá…** khi nhân viên đã tự đánh giá
     hoặc đã chờ quá 5 ngày.
  5. R13 hoặc R10 **Chốt kỳ…** khi mọi phiếu đã kết thúc; người có phiếu trong kỳ không
     tự chốt. Chốt rồi thì phiếu đóng băng, thưởng gợi ý sang H7.
- **Cách chấm:** điểm là trung bình có trọng số của % đạt (mỗi chỉ số kẹp ở 120%), **chỉ
  tính chỉ số có dữ liệu** — thiếu dữ liệu hiện "không tính", không phải 0. Phần trọng
  số có dữ liệu dưới 70% thì không xếp loại. Hạng A ≥ 105 · B ≥ 95 · C ≥ 80 · D. Cột
  **Thưởng gợi ý** chỉ người xem được lương (kế toán, nhân sự, chủ) mới có. Số doanh
  thu, giá vốn bị che với người không có quyền xem — chỉ còn % đạt.
- **N11 · Phiếu kiểm tra** — điểm kiểm tra vệ sinh ATTP hay khách bí mật (0–100), bắt
  buộc **đường dẫn bằng chứng**; là nguồn của hai chỉ số cùng tên. Sai thì **Huỷ
  phiếu…** kèm lý do. Phiếu do chính người được chấm ghi không tính cho người đó.
- **KPI của tôi:** khối **KPI** ở N1 — mở phiếu của mình để tự chấm 1–5 từng chỉ số (chỉ
  để cấp trên đối chiếu, không cộng vào điểm) và gửi tự nhận xét; kỳ chốt rồi thì đọc
  nhận xét, bấm **Tôi đã xem kết quả** kèm ý kiến (một lần). Nhân viên tuyến đầu làm
  việc này trên Kênh nhân viên (chương 7).
- **Không phạt, không khấu trừ** (Điều 127): hạng D nghĩa là thưởng gợi ý bằng 0.

**Văn bản (N4) — soạn, trình, ký:**

1. **Văn bản mới** → chọn loại: **Thông báo**, **Quyết định** (bổ nhiệm, điều
   chuyển, miễn nhiệm, khen thưởng, kỷ luật, khác) hoặc **Quy định**. Nội dung là
   chữ thường; tài liệu dài (PDF, ảnh) thì dán **đường dẫn https** ở mục Đính kèm.
2. **Nơi nhận** ghép từ nhiều quy tắc: toàn chuỗi, chi nhánh, đơn vị (có hoặc không
   gồm đơn vị con), chức danh, vai trò, từng người. Ô bên cạnh ước tính số người
   nhận. Bật **Yêu cầu xác nhận đã đọc** cho nội quy, quy định ATTP — người nhận
   phải bấm "Tôi đã đọc và hiểu".
3. **Lưu nháp** bao nhiêu lần cũng được. Xong thì chọn **Trình người ký** → **Trình
   ký**. Từ lúc trình, nội dung và nơi nhận **khoá lại** — người ký ký đúng thứ đã
   đọc. Người ký **Trả lại người soạn** kèm lý do thì văn bản về nháp để sửa.
4. Người ký bấm **Ký ban hành** và nhập **PIN của chính mình**. Văn bản nhận số
   hiệu (`TB-…` thông báo · `QD-…` quyết định · `QYD-…` quy định) và tới tay người
   nhận ngay trên Kênh nhân viên. Bạn tự có quyền ký thì nút **Ký ban hành** hiện
   ngay ở màn soạn, không cần trình.
5. Đã ban hành thì **không sửa**. Sai thì **Thu hồi văn bản…** kèm lý do (văn bản
   rời hộp thư người nhận, sổ vẫn giữ) hoặc ban hành văn bản khác. **Chép link Kênh
   nhân viên** để dán vào nhóm Zalo của quán.

| Ai ký được | Thông báo | Quyết định, quy định |
|---|---|---|
| Quản lý ca (R7) | ✓ trong chi nhánh của mình | – |
| Quản lý chuỗi (R11) · Chủ (R10) | ✓ | ✓ |
| Quản lý nhân sự (R13) | ✓ | – |

- **Quyết định bổ nhiệm / điều chuyển / miễn nhiệm** có thêm bảng _Thay đổi nhân
  sự_ (ai, ghế nào, chính hay kiêm nhiệm). Ký xong là sơ đồ N2 và chức danh ở H1
  **đổi ngay** theo ngày hiệu lực; người có tên trong quyết định tự nhận được quyết
  định. Loại này **không thu hồi được** — sai thì ban hành quyết định khác. Người có
  tên trong quyết định không ký được chính quyết định đó.
- **PIN là chữ ký:** nhập sai nhiều lần liên tiếp thì bị khoá vài phút, như ở máy
  POS. Chưa có PIN thì không có tên trong danh sách người ký.
- **Người nhận chốt lúc ký**, không gồm người soạn và người ký. Riêng **quy định**
  còn hiệu lực thì người vào làm sau vẫn nhận và phải xác nhận.
- Bên phải màn chi tiết: **Đã đọc x/y · đã xác nhận x/y** và tên người chưa đọc
  (chỉ người soạn, người ký, R10 · R11 · R13 thấy tên).
- **Kỷ luật:** hệ thống chỉ lưu và phổ biến quyết định. Trình tự xử lý kỷ luật
  (họp, biên bản, có mặt người lao động) làm theo luật, ngoài hệ thống. Không dùng
  văn bản để phạt tiền hay trừ lương.

## 6.5 Chi phí & tài sản (C1–C5)

- **C1 · Tổng quan chi phí** — cơ cấu theo khoản mục, cột **Ngân sách** nhập
  trực tiếp, vượt thì đỏ; nhắc "N phiếu chi đang chờ duyệt — chúng **chưa** vào
  Lãi/Lỗ".
- **C2 · Sổ phiếu chi** — cửa ghi chính; **quyền phụ thuộc số tiền**, form tự
  hiện bậc ngay khi gõ:

  | Số tiền | Bậc | Ai duyệt |
  |---|---|---|
  | ≤ hạn mức chi vặt | "Tự ghi — kế toán hậu kiểm" | Duyệt luôn khi ghi |
  | Khoảng giữa | "Cần kế toán duyệt" | Kế toán (R8) |
  | ≥ ngưỡng chủ duyệt | "Cần chủ duyệt" | Chủ (R10) |

  **Không ai tự duyệt phiếu chi của mình — kể cả chủ quán.** Chế độ **Tạm ứng
  nhân viên**: tiền ra nhưng *không phải chi phí* — tự khấu trừ vào kỳ lương.
  Mua sắm từ ngưỡng tài sản trở lên bị chặn ở đây — phải ghi ở C4.
- **C3 · Chi phí định kỳ** — khai tiền nhà/điện/nước; hằng tháng bấm **Sinh
  phiếu tháng N** để ra loạt phiếu **nháp** chờ điền số thật rồi duyệt (bấm lại
  không sinh trùng; chưa có bộ hẹn giờ tự chạy).
- **C4 · Tài sản & khấu hao** — ghi nhận tài sản, **Sinh khấu hao tháng** (đi
  thẳng vào sổ chi phí, không qua phiếu chi), **Thanh lý**.
- **C5 · Hoá đơn đầu vào** — sổ hoá đơn VAT mua vào, gắn với phiếu chi; cảnh
  báo "VAT khai trên phiếu mà chưa có hoá đơn" (mất quyền khấu trừ). F4 chỉ
  cộng tờ đánh dấu *được khấu trừ*.

## 6.6 Tài chính (F1–F7)

```mermaid
flowchart TD
    subgraph TIENVAO["Tiền vào"]
        P10["POS tiền mặt · COD"]
        QR["VietQR — webhook ngân hàng"]
        NO["Ghi nợ công ty (B15)"]
    end
    subgraph TIENRA["Chi phí"]
        KHO["Kho — giá vốn tự động khi bếp bấm Xong"]
        C2["C2 Phiếu chi (duyệt theo bậc)"]
        H7["H7 Kỳ lương đã phát"]
        C4["C4 Khấu hao tự sinh"]
    end
    P10 --> F2["F2 Nhật ký doanh thu —<br/>sổ bất biến, chỉ đọc"]
    QR --> F1["F1 Sổ quỹ & đối soát"]
    NO --> F5["F5 Công nợ"]
    P10 --> F1
    F2 --> F7["F7 Lãi / Lỗ<br/>(dồn tích | dòng tiền)"]
    KHO --> F7
    C2 --> F7
    H7 --> F7
    C4 --> F7
    F1 --> F6["F6 Khoá sổ kỳ —<br/>khoá rồi KHÔNG mở lại"]
    F7 --> F6
```

- **F1 · Sổ quỹ & đối soát** — tiền hệ thống ghi có khớp tiền thật không: tiền
  mặt theo ca (đầu ca → thu → chi → đếm thực → **Lệch**), chuyển khoản vs sao
  kê, khối "Còn treo — phải soi trước khi khoá ngày". **Không có nút đánh dấu
  tay** cho khoản treo — chỉ tín hiệu ngân hàng mới đóng được.
- **F2 · Nhật ký doanh thu** — sổ bất biến (trigger CSDL chặn sửa): bán, thu,
  giảm giá, tặng, huỷ, hoàn — kèm người thao tác, người duyệt, lý do. Sửa sai
  là bút toán ngược, không sửa dòng cũ.
- **F3 · Sổ hoá đơn điện tử** — khối "Bill đã trả mà chưa có hoá đơn" với nút
  **Phát hành** từng dòng; trạng thái Chờ/Đã phát hành/Lỗi/Đã huỷ/Đã thay thế;
  huỷ bắt buộc lý do, chọn "Huỷ và phát hành thay thế" hay "Chỉ huỷ". **Một đơn
  một hoá đơn**; hoá đơn huỷ giữ nguyên số đã cấp. Chưa khai ký hiệu ở A9 thì
  không phát hành được.
- **F4 · Báo cáo thuế** — VAT đầu ra − VAT đầu vào = VAT phải nộp; TNCN đã khấu
  trừ; khối đối chiếu hoá đơn vs doanh thu — lệch là đỏ kèm giải thích.
- **F5 · Công nợ** — phải trả NCC và phải thu khách doanh nghiệp (cùng nguồn
  với B15).
- **F6 · Khoá sổ kỳ** — màn có hệ quả lớn nhất Office: liệt kê **việc còn dở**
  và khoá nút cho tới khi xử lý hết; khoá xong thì **doanh thu, phiếu chi, bảng
  công, kỳ lương của kỳ ngừng nhận sửa và không có nút mở lại** — chỉ bút toán
  điều chỉnh kỳ sau. Chỉ khoá được tháng đã kết thúc.
- **F7 · Lãi / Lỗ** — hợp nhất tự động, **không dòng nào nhập tay**; hai chế độ
  **Dồn tích / Dòng tiền** (tạm ứng và trả nợ NCC là tiền ra nhưng không phải
  chi phí; khấu hao là chi phí nhưng không phải tiền ra). Ô **Prime cost** (giá
  vốn + nhân sự) báo động khi vượt 60% doanh thu. Dòng chưa có nguồn hiện trống
  kèm nhãn "Chưa có nguồn" — cố ý không giả vờ đầy đủ.

## 6.7 Món & thực đơn (M1–M11)

**M1 là cửa ghi duy nhất của trung tâm sản phẩm** — sửa ở đây, web · app bàn ·
POS · bếp · kênh online đổi theo trong vòng một phút. Không nhập món ở đâu khác.

| Màn | Việc chính |
|---|---|
| **M1 · Món và set** | Tìm không dấu, lọc; drawer sửa món: định danh → phân loại → giá (kèm **giá riêng chi nhánh** / **Tắt ở chi nhánh này**) → định tuyến bếp → tuỳ chọn → kênh bán → trình bày → **trang giới thiệu trên web** → trạng thái |
| **M5 · Tuỳ chọn** | Nhóm câu hỏi khi gọi món, dùng chung nhiều món; bắt buộc/tuỳ ý, chọn một/nhiều, chênh giá, công tắc **có trừ kho** (chỉ bật khi lựa chọn là nguyên liệu thật). Nhóm bắt buộc phải có ≥2 lựa chọn |
| **M4 · Công thức & giá vốn** | Xếp theo food cost giảm dần; sửa định lượng là thấy ngay "giá vốn tăng X · food cost lên Y%" **trước khi lưu**. Ngưỡng: <30% tốt · 30–38% cảnh báo · >38% báo động. Hao hụt % cộng thêm vào lượng xuất kho |
| **M7 · Nguyên liệu** | Khai một lần cấp chuỗi; cột **Quy đổi** sai là mọi công thức sai theo. Giá bình quân **không sửa tay được** — chỉ đổi qua phiếu nhập |
| **M8 · Bán thành phẩm** | Công thức mẻ (sốt, nước dùng): tiền mẻ ÷ sản lượng = giá đơn vị. Hai cột **Giá chuẩn** vs **Giá đang dùng** (từ lượt nấu thật S7) — lệch ≥10% thì nhắc |
| **M9 · Lịch sử công thức** | So hai bản bất kỳ (thêm/bỏ/sửa). Giá nguyên liệu đổi **không** sinh phiên bản — nhập hàng không phải sửa công thức |
| **M10 · Cây danh mục** | Kéo thả nhóm menu khách; đổi nhóm **không đụng định tuyến bếp** (trạm nằm trên món) |
| **M11 · Set & Combo** | Dải **giá vốn min–max** theo lựa chọn của khách — định giá theo **đầu đắt**; **Lịch bán** (thứ/khung giờ/từ–đến ngày) cưỡng chế lúc gọi món |

Ba trạng thái "không bán" dễ nhầm:

| Thao tác | Ở đâu | Phạm vi & thời hạn |
|---|---|---|
| **86 / báo hết** | Màn bếp K5 (hoặc B1 hiển thị) | Hết **trong ca**, tự hết hạn cuối ngày, khoá mọi kênh ngay |
| **Tắt ở chi nhánh này** | M1, khối giá | Chi nhánh đó ngừng bán tới khi bật lại |
| **Đang tắt (online)** | O11 Menu online | Chỉ tắt kênh mang về/giao — tại quán vẫn bán |

**Trang giới thiệu món trên web** (khối trong drawer M1): soạn nội dung trang
`/thuc-don/{mã}` — chương, lời dẫn, vị trí phần thịt, hương vị, độ cắt, gợi ý
gia vị… **Bỏ trống là hợp lệ ở mọi ô** — trang web tự lùi về bản gọn; nút
**Lưu nội dung trang web** / **Xoá nội dung giới thiệu**.

## 6.8 Kho & mua hàng (S1–S12)

| Màn | Việc chính |
|---|---|
| **S1 · Tổng quan kho** | Giá trị tồn, dưới định mức, lô sắp hết hạn; khối "Đang cản trở giá vốn" trỏ thẳng tới món chưa khai công thức / nguyên liệu chưa có giá |
| **S2 · Tồn kho** | Thanh mức tồn (càng cạn càng "nóng"); **Điều chỉnh** bắt buộc lý do, ghi bút toán riêng — sổ kho là sổ bất biến |
| **S3 · Nhà cung cấp** | Giá thoả thuận từng mặt hàng, **một mối chính** mỗi nguyên liệu |
| **S4 · Đơn đặt hàng** | Gợi ý đặt theo tốc độ tiêu thụ 14 ngày (`Đủ mấy ngày`, `Đang về`); gom theo mối chính → **Lập đơn**; đơn tự sang "Đã nhận đủ" |
| **S5 · Nhập kho** | **Cửa duy nhất làm đổi giá bình quân**; số lô + hạn dùng bắt buộc với hàng theo lô; cảnh báo lệch giá thoả thuận (không chặn) |
| **S6 · Xuất kho** | Tách **Xuất huỷ** (mất thật → hao hụt) và **Xuất nội bộ** (ăn ca — chi phí có ích); bắt buộc lý do; thủ kho cần người khác duyệt |
| **S7 · Sản xuất nội bộ** | Pha chế · **pha lóc** (1 tảng bò → nầm + dẻ sườn + hao) · đục keg; tổng tỉ lệ đầu ra phải đúng 100% — tiền phần hao nằm lại trong giá thành phẩm |
| **S8 · Kiểm kê** | Mở phiếu là **đóng băng tồn sổ** làm mốc; dòng trống = *chưa đếm*, không phải 0; **Chốt kiểm kê** cần người khác duyệt — chênh lệch thành chi phí ngay lúc bấm |
| **S9 · Lô & hạn dùng** | Xếp hạn gần trước (FEFO); **keg đã đục tính hạn từ ngày đục**, không theo vỏ |
| **S10 · Chuyển kho** | Xác nhận hai đầu; **nhận thiếu thì ghi hao ở bên gửi** |
| **S11 · Báo cáo hao hụt** | Công thức đòi vs thực tế xuất; khối riêng **bia tươi** (rót lý thuyết vs keg thực dùng); chênh âm thường là công thức khai thừa |
| **S12 · Thẻ kho** | Mọi bút toán của một mặt hàng, tồn luỹ kế từng dòng |

## 6.9 Kênh online & đặt bàn (O10 · O11 · R3)

- **O10 · Vùng giao & phí** — vùng khớp **theo tên phường**; mỗi vùng: phí,
  đơn tối thiểu, thời gian; một phường chỉ thuộc một vùng. Panel **Giờ ngừng
  nhận đơn** riêng cho mang về / giao hàng.
- **O11 · Menu online** — trần đơn mỗi khung 15 phút, thời gian bếp cần trước;
  công tắc bán online + **giá online** từng món (trống = giá tại quán).
- **R3 · Cấu hình nhận đặt** — chế độ xác nhận **tự động / duyệt tay**; 11 tham
  số thời lượng & giữ chỗ (giữ chỗ mềm 10′, giữ bàn 15′, thời lượng bữa…); trần
  suất và **tiền cọc theo kiểu chỗ**; **chặn ngày** (không huỷ suất đã nhận —
  màn báo số suất đang có để gọi từng khách). Lưu ý khối "Hai thứ không nằm ở
  đây": giờ nhận đặt lấy từ **giờ mở cửa A10**, sức chứa lấy từ **A3**.

## 6.10 Quản trị (A1–A10)

| Màn | Việc chính |
|---|---|
| **A1 · Tài khoản** | **Cửa duy nhất tạo người**: email + mật khẩu (vào Office) và PIN (vào POS/KDS/kiosk) trên cùng một tài khoản; lưới vai trò × chi nhánh. Không có nút xoá — người nghỉ chuyển "Đã ngừng". Đổi mật khẩu/PIN cắt mọi phiên đang mở |
| **A2 · Vai trò & quyền** | Màn **đọc** ma trận quyền (✓ / △ cần duyệt / –) + hạn mức theo vai trò + ai đang giữ vai trò nào. Ma trận nằm trong mã nguồn — thêm quyền là việc của bản thiết kế |
| **A3 · Khu vực & bàn** | Khai khu, bàn: loại chỗ (thường / nướng có bếp / phòng riêng), loại bếp, sức chứa min–max. Ba thuộc tính đổ thẳng vào W6, định tuyến bếp và lưới khung giờ |
| **A4 · Thiết bị** | Sinh **mã ghép 6 số** (sống 10 phút, dùng một lần) cho 5 loại máy: Tablet phục vụ · Máy thu ngân · **Màn bếp (bắt buộc ghim trạm)** · Kiosk chấm công · Cầu in. Nút **Ngắt máy** cắt cả token thiết bị lẫn phiên đang mở — máy mất là ngắt từ xa ngay |
| **A5 · Máy in** | Khai máy in bill/tem theo trạm, địa chỉ LAN, mẫu in. *Sửa xong phải phát hành lại bundle cấu hình* (xem 6.11) |
| **A6 · Trung tâm tham số** | Một sổ cho mọi ngưỡng/hệ số của hệ thống, nhóm theo mảng, mỗi dòng có chú thích hệ quả + lịch sử ai đổi. Hai nút lưu: **"Lưu cho chuỗi"** / **"Chỉ chi nhánh này"** (+ **Bỏ ghi đè**). Hiệu lực ngay, không cần triển khai lại. Nhóm **KPI & thưởng**: thang chấm và mức thưởng chỉ đặt ở cấp chuỗi, kỳ KPI đã công bố giữ số lúc công bố |
| **A7 · Nhật ký thao tác** | Sổ bất biến mọi hành động nhạy cảm; lọc theo ngày/hành động/người; 50 dòng/trang |
| **A8 · Nội dung website** | Hai tab **Tin tức** và **Tuyển dụng**; bài giữ nháp được. Giá món sửa ở M1, địa chỉ/giờ mở sửa ở A10 — không ở đây |
| **A9 · Hoá đơn điện tử** | Phần chuỗi: MST, nhà cung cấp HĐĐT, chứng thư số (đếm ngày hết hạn); phần chi nhánh: **ký hiệu 6 ký tự có chữ M** + công tắc bật phát hành. Khai ở đây, phát hành ở F3 |
| **A10 · Chi nhánh** | Tên, SĐT, địa chỉ, email, **giờ mở cửa** — sửa một chỗ đổ ra website, chân hoá đơn, và là **nguồn dựng lưới giờ đặt bàn** (gõ sai giờ mở là chi nhánh ngừng nhận đặt) |

## 6.11 Giới hạn của bản dựng hiện tại (08/2026)

- **Nút "Lưu & phát hành" cấu hình chưa có trên Office.** Máy chủ đã có sẵn
  lệnh phát hành bundle (và POS còn nhắc "Vào Office bấm 'Lưu & phát hành'"),
  nhưng Office chưa dựng nút — hiện phát hành do kỹ thuật chạy lệnh
  (`db:dev-bootstrap` trên máy dev). Các màn cần phát hành lại sau khi sửa: A3
  sơ đồ bàn, A5 máy in, M1/M10/M11 phần cờ kênh.
- **Luồng duyệt bằng PIN trên Office mới có ở B11 (bật khuyến mãi)** — marketing
  bấm **Bật** thì hiện dải nhập mã nhân viên + PIN của quản lý chuỗi hoặc chủ quán.
  Nhập sai PIN 5 lần trong một phút là khoá 5 phút (chỉ khoá đúng cặp người xin –
  người duyệt, PIN của quản lý vẫn dùng được ở chỗ khác). Các chỗ
  khác vượt hạn mức (phiếu chi của quản lý ca, điều chỉnh tồn của thủ kho, huỷ
  hoá đơn) hiện báo *"cần người duyệt, mà luồng duyệt bằng PIN chưa có trên
  Office"* — tạm thời để người có quyền cao hơn tự thao tác.
- **B10** chưa có đặt lịch email, xuất PDF, so sánh liên chi nhánh (đã có CSV).
- **C3** chưa tự sinh phiếu hằng tháng — phải bấm nút **Sinh phiếu tháng N**.
- Ngân hàng và nhà cung cấp HĐĐT đang chạy **bản giả lập** — màn hình và thao
  tác không đổi khi đấu nối thật.
