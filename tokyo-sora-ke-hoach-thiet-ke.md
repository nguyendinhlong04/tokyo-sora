# TOKYO SORA — KẾ HOẠCH THIẾT KẾ HỆ THỐNG

**Phiên bản:** 2.2 — BẢN CHỐT. Gộp đặt món online vào Sora Web (SEO), điều phối & đặt bàn vào Sora POS; bỏ Sora Online
**Tài liệu đi kèm:** `tokyo-sora-dac-ta-man-hinh.md` — đặc tả từng màn hình theo định dạng đưa thẳng cho AI dựng thiết kế
**Phạm vi:** 6 ứng dụng · 139 màn hình · 78 món ăn + 26 đồ uống · 6 trạm bếp · đa chi nhánh · chạy trình duyệt (chưa làm app)
**Ước tính:** ~21 tuần thiết kế (1 designer) hoặc ~15 tuần (2 designer)

---

# PHẦN A — TỔNG QUAN & KIẾN TRÚC

## 1. Mục tiêu sản phẩm

| Nhóm người dùng | Việc họ cần làm | Chỉ số thành công |
|---|---|---|
| Khách tại bàn | Gọi món nhanh, tự thanh toán không cần chờ | ≤ 90 giây từ quét QR đến đơn đầu tiên |
| Khách online | Đặt bàn / đặt món mang về–giao hàng từ website | Hoàn tất đặt trong ≤ 3 phút; đơn báo về đúng chi nhánh |
| Phục vụ / thu ngân | Gọi hộ, ghép tách bàn, thanh toán, đối soát | ≤ 20 giây/đơn 5 món; sai đơn < 1% |
| Bếp | Nhận đúng món, đúng trạm, đúng thứ tự | Đúng SLA ≥ 90%; đơn online không nấu sớm |
| Bếp trưởng | Chuẩn hoá định lượng, kiểm soát food cost | Food cost thực lệch < 3% so với công thức |
| Thủ kho | Nhập – xuất – kiểm kê không sổ giấy | Chênh lệch kiểm kê < 2% |
| Kế toán | Đối soát sạch, hoá đơn điện tử đủ, khoá sổ được kỳ | 100% giao dịch có chứng từ; đối soát ngân hàng khớp hằng ngày |
| Chủ / quản lý chuỗi | So sánh chi nhánh, chu kỳ; biết món nào lãi | Mọi báo cáo có so sánh kỳ trước & cùng kỳ |

**Nguyên tắc xuyên suốt:** một món chỉ khai báo **một lần** (ở Quản lý món cấp chuỗi), rồi tự chảy sang menu khách, POS, KDS, online, kho, kế toán và báo cáo. Không nhập trùng ở đâu cả.

## 2. Các quyết định đã chốt

| # | Quyết định | Ghi chú |
|---|---|---|
| Q1 | **Nhiều chi nhánh** ngay từ đầu | Kiến trúc ở Mục 5 |
| Q2 | Chỉ **gọi món (à la carte)**, không buffet | — |
| Q3 | Khách **tự thanh toán tại bàn**, không giới hạn hạn mức, song song luồng thu ngân | — |
| Q4 | Nướng **tùy món tùy khu**, nướng hộ **không phụ thu** | Phân loại 24 món đã chốt ở Mục 16 |
| Q5 | **Mua mới toàn bộ thiết bị** | Danh mục ở Phụ lục C |
| Q6 | **Chạy trình duyệt, chưa làm app native** | Thông báo đẩy giải quyết bằng PWA + Zalo/Telegram — Mục 30.4 |
| Q7 | Ngôn ngữ khách: **Việt – Anh – Nhật**; back-office tiếng Việt | — |
| Q8 | Trừ kho khi bếp **bấm Hoàn thành** | Kế toán duyệt lại khi vào giai đoạn 4 |
| Q9 | Thanh toán qua **VietinBank Open API + tài khoản định danh** | Phương án đa chi nhánh ở Mục 30.1 |
| Q10 | **Hoá đơn điện tử từ máy tính tiền** — bắt buộc, có công tắc theo chi nhánh | Phân tích nhà cung cấp ở Mục 30.2 |
| Q11 | Thực đơn chốt: **78 món** (Mục 15) + **26 đồ uống** gồm bia bán theo cốc (Mục 17) + **6 set** (Mục 14) | — |
| Q12 | Website cho **đặt bàn + đặt món online**; đơn online chọn chi nhánh, xong thì **gửi vào Page** | Cơ chế ở Mục 30.3 |
| Q13 | Có module **Kế toán minh bạch** + báo cáo **so sánh chu kỳ** | Mục 26, 25 |
| Q14 | Kiến trúc **module hoá để mở rộng** về sau | Mục 6 |
| Q15 | Có module **Nhân sự** (lịch làm, chấm công, lương, thưởng) và **Chi phí & tài sản** để tính lợi nhuận toàn diện, phục vụ kê khai thuế | Mục 26, 27, 28 |
| Q16 | **Một pháp nhân, một mã số thuế** cho cả chuỗi · **Page riêng từng chi nhánh** · khởi động với **1 chi nhánh** | Phương án tài chính – pháp lý chốt ở Mục 30.1, 30.2, 30.3 |
| Q17 | Nâng **tích điểm & hạng thành viên**, **công nợ khách doanh nghiệp**, **bảo trì thiết bị** vào bản chốt. **Không đấu nối** API app giao đồ ăn, **không làm** app native (ship gọi thủ công), **không triển khai** checklist nhiệt độ tủ | Chi tiết G.2, G.3 |

Không còn câu hỏi nào chặn tiến độ. Việc còn lại là điền giá trị tham số và giấy tờ ở Mục 34.

## 3. Bản đồ hệ thống — 6 ứng dụng

```
┌──────────────────────────────────────────────────────────────┐
│  1. SORA WEB          tokyosora.vn                           │
│     Website thương hiệu · SEO · đặt bàn · ĐẶT MÓN ONLINE      │
│     /dat-mon → chọn chi nhánh → menu → thanh toán → Page      │
├──────────────────────────────────────────────────────────────┤
│  2. SORA TABLE        tokyosora.vn/t/{token}                 │
│     Khách gọi món & tự thanh toán tại bàn · quét QR · noindex │
├──────────────────────────────────────────────────────────────┤
│  3. SORA POS          pos.tokyosora.vn                       │
│     Phục vụ · thu ngân P16 · ĐIỀU PHỐI ONLINE · ĐẶT BÀN       │
│     Tablet 10–11" + máy thu ngân 22"                          │
├──────────────────────────────────────────────────────────────┤
│  4. SORA KITCHEN      kds.tokyosora.vn/{station}             │
│     6 trạm bếp + màn điều phối Expo · TV 32–43"               │
├──────────────────────────────────────────────────────────────┤
│  5. SORA OFFICE       admin.tokyosora.vn                     │
│     Món · Kho · Nhân sự · Chi phí · Kinh doanh · Kế toán ·    │
│     Quản trị (+ cấu hình kênh online: O10 · O11 · R3)         │
├──────────────────────────────────────────────────────────────┤
│  6. TÍCH HỢP NGOÀI                                            │
│     VietinBank Open API · Nhà cung cấp HĐĐT · Facebook Page   │
└──────────────────────────────────────────────────────────────┘
```

**Thay đổi so với v2.1:** Sora Online giải thể. Luồng khách đặt món (O1–O7) trở thành các trang thuộc tokyosora.vn để dồn toàn bộ tín hiệu SEO về một tên miền; màn vận hành (O8, O9, O12, R1, R2, R4) về Sora POS — nơi thu ngân và lễ tân đã đứng sẵn; màn cấu hình (O10, O11, R3) về Office — thu ngân không nên đụng cấu hình vùng giao và giá. Sora Table cũng chuyển về đường dẫn tokyosora.vn/t/{token} (noindex) để dùng chung tên miền và PWA.

Vì sao tách Sora Table và Sora POS dù cùng là "gọi món": khách cần ảnh to, mô tả, gợi ý; nhân viên cần lưới phím nhanh, không ảnh. Ép chung một giao diện sẽ làm chậm nhân viên và làm rối khách.

## 4. Phân quyền (RBAC)

### 4.1 Mười ba vai trò

| Mã | Vai trò | Đăng nhập | Phạm vi |
|---|---|---|---|
| R0 | Khách tại bàn | Token QR theo phiên bàn, hết hạn khi đóng bàn | Bàn của mình |
| R1 | Phục vụ | PIN 4–6 số trên tablet chung | Khu vực được phân, trong chi nhánh |
| R2 | Thu ngân | PIN + thiết bị đã ghép | Chi nhánh |
| R3 | Lễ tân / đặt bàn | PIN | Sơ đồ bàn, đặt chỗ chi nhánh |
| R4 | Nhân viên bếp | PIN, gắn cứng 1 trạm | Trạm đó |
| R5 | Bếp trưởng | Tài khoản | Mọi trạm + công thức + báo hết món |
| R6 | Thủ kho | Tài khoản | Kho chi nhánh |
| R7 | Quản lý ca | Tài khoản + 2FA | Vận hành trong ca, duyệt ngoại lệ |
| R8 | Kế toán | Tài khoản + 2FA | Sổ sách, hoá đơn, khoá sổ — không sửa vận hành |
| R9 | Marketing | Tài khoản | CMS website, ảnh món |
| R10 | Chủ / Admin | Tài khoản + 2FA | Toàn quyền, mọi chi nhánh |
| R11 | Quản lý chuỗi | Tài khoản + 2FA | Xem mọi chi nhánh, sửa danh mục cấp chuỗi |
| R12 | Điều phối online & đặt bàn | Tài khoản | Vai trò **tuỳ chọn** khi muốn tách khỏi thu ngân lúc quy mô lớn; mặc định **R2 kiêm qua P16** |
| R13 | Quản lý nhân sự | Tài khoản + 2FA | Hồ sơ, lịch–công–lương toàn chuỗi; không can thiệp vận hành ca |

### 4.2 Ma trận quyền

`✓` = được · `△` = cần duyệt · `–` = không

| Hành động | R0 | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | R11 | R12 | R10 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Xem thực đơn (giá bán) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tạo đơn / gọi món tại bàn | ✓ | ✓ | ✓ | – | – | – | – | ✓ | – | – | – | – | ✓ |
| Sửa món **chưa** gửi bếp | ✓ | ✓ | ✓ | – | – | – | – | ✓ | – | – | – | – | ✓ |
| Huỷ món **đã** gửi bếp | – | △ | △ | – | – | ✓ | – | ✓ | – | – | – | – | ✓ |
| Chuyển / ghép / tách bàn | – | ✓ | ✓ | ✓ | – | – | – | ✓ | – | – | – | – | ✓ |
| Giảm giá ≤ 10% | – | – | △ | – | – | – | – | ✓ | – | – | – | – | ✓ |
| Giảm giá > 10% / tặng món | – | – | – | – | – | – | – | △ | – | – | – | – | ✓ |
| Huỷ hoá đơn đã in | – | – | △ | – | – | – | – | ✓ | – | – | – | – | ✓ |
| Khách tự thanh toán tại bàn | ✓ | – | – | – | – | – | – | – | – | – | – | – | – |
| Xác nhận / đối soát khoản khách tự trả | – | ✓ | ✓ | – | – | – | – | ✓ | ✓ | – | – | – | ✓ |
| Đóng bàn sau khi trả đủ | – | ✓ | ✓ | – | – | – | – | ✓ | – | – | – | – | ✓ |
| Mở két / đóng ca / kiểm quỹ | – | – | ✓ | – | – | – | – | ✓ | ✓ | – | – | – | ✓ |
| Đổi trạng thái món trên KDS | – | – | – | – | ✓ | ✓ | – | ✓ | – | – | – | – | ✓ |
| Báo hết món (86) | – | △ | – | – | △ | ✓ | – | ✓ | – | – | – | – | ✓ |
| Nhận / xác nhận đơn online | – | – | ✓ | – | – | – | – | ✓ | – | – | – | ✓ | ✓ |
| Gán shipper / huỷ đơn online | – | – | ✓* | – | – | – | – | ✓ | – | – | – | ✓ | ✓ |
| Xác nhận đặt bàn / đánh no-show | – | ✓ | – | ✓ | – | – | – | ✓ | – | – | – | ✓ | ✓ |
| Xem **giá vốn** & công thức | – | – | – | – | ✓* | ✓ | ✓ | ✓ | ✓ | – | ✓ | – | ✓ |
| Sửa công thức / định lượng (cấp chuỗi) | – | – | – | – | – | ✓ | – | △ | – | – | ✓ | – | ✓ |
| Sửa giá bán | – | – | – | – | – | – | – | △ | – | – | ✓ | – | ✓ |
| Nhập kho / nhận hàng | – | – | – | – | – | – | ✓ | ✓ | – | – | – | – | ✓ |
| Xuất huỷ / điều chỉnh tồn | – | – | – | – | – | △ | △ | ✓ | – | – | – | – | ✓ |
| Chốt kiểm kê | – | – | – | – | – | – | △ | ✓ | ✓ | – | – | – | ✓ |
| Báo cáo doanh thu chi nhánh | – | – | – | – | – | – | – | ✓ | ✓ | – | ✓ | – | ✓ |
| Báo cáo lãi gộp / food cost | – | – | – | – | – | ✓ | – | ✓ | ✓ | – | ✓ | – | ✓ |
| So sánh liên chi nhánh | – | – | – | – | – | – | – | – | ✓ | – | ✓ | – | ✓ |
| Sổ kế toán / khoá sổ kỳ | – | – | – | – | – | – | – | – | ✓ | – | – | – | ✓ |
| Huỷ / thay thế / điều chỉnh HĐĐT | – | – | – | – | – | – | – | △ | ✓ | – | – | – | ✓ |
| Sửa nội dung website | – | – | – | – | – | – | – | – | – | ✓ | – | – | ✓ |
| Quản lý tài khoản & quyền | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Xem nhật ký thao tác | – | – | – | – | – | – | – | ✓ | ✓ | – | ✓ | – | ✓ |

`R4*` chỉ thấy công thức của món thuộc trạm mình. `R2*` gán shipper và xác nhận đơn qua P16; huỷ đơn online vẫn cần lý do và ghi nhật ký.

### 4.2b Ma trận bổ sung — Nhân sự & Chi phí

Cột `NV` = mọi nhân viên vận hành (R1–R6), thao tác qua Kênh nhân viên trên điện thoại.

| Hành động | NV | R7 | R8 | R13 | R11 | R10 |
|---|---|---|---|---|---|---|
| Xem lịch làm, bảng công, phiếu lương **của mình** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gửi yêu cầu nghỉ phép / đổi ca | ✓ | ✓ | – | – | – | – |
| Chấm công vào/ra (kiosk tại chi nhánh) | ✓ | ✓ | – | – | – | – |
| Xếp & công bố lịch chi nhánh | – | ✓ | – | ✓ | – | ✓ |
| Duyệt nghỉ phép / đổi ca | – | ✓ | – | ✓ | – | ✓ |
| Sửa công tay (kèm lý do, ghi nhật ký) | – | △ | – | ✓ | – | ✓ |
| Chốt công kỳ | – | – | – | ✓ | – | ✓ |
| **Xem lương người khác** | – | **–** | ✓ | ✓ | – | ✓ |
| Cấu hình cơ chế lương / thưởng | – | – | – | ✓ | – | ✓ |
| Tính kỳ lương nháp | – | – | – | ✓ | – | ✓ |
| Duyệt & phát lương | – | – | kiểm | trình | – | ✓ |
| Ghi phiếu chi ≤ hạn mức chi vặt | – | ✓ | ✓ | – | – | ✓ |
| Ghi phiếu chi trên hạn mức | – | △ | ✓ | – | – | ✓ |
| Duyệt phiếu chi / ghi nhận tài sản | – | – | ✓ | – | – | ✓ (mức lớn) |
| Sổ tài sản & khấu hao | – | – | ✓ | – | – | ✓ |
| Xem Lãi/Lỗ đầy đủ (có chi tiết lương) | – | – | ✓ | – | ✓ | ✓ |
| Xem Lãi/Lỗ chi nhánh dạng gộp (không chi tiết lương) | – | ✓ | ✓ | – | ✓ | ✓ |

**Quyền marketing (R9):** soạn khuyến mãi/voucher và trả lời phản hồi khách được phép; **kích hoạt** khuyến mãi cần R11/R10 duyệt (vì đụng giá); xem Sổ khách được nhưng SĐT che 3 số giữa.

**Quyền tích điểm & công nợ:** đổi điểm tại quầy — R2 được, trong trần mỗi giao dịch (tham số); điều chỉnh điểm tay — chỉ R11/R10, kèm lý do, ghi A7; ghi nợ công ty tại P10 — R2 thao tác nhưng cần R7 duyệt + chữ ký khách; gạch nợ / xoá nợ — R8, mức lớn R10; hồ sơ khách doanh nghiệp — R2 xem, R8/R11 sửa.

**Nguyên tắc cứng thứ tư: lương là dữ liệu nhạy cảm.** Quản lý ca thấy *công* của nhân viên mình nhưng không bao giờ thấy *lương*; báo cáo Lãi/Lỗ cho quản lý ca chỉ hiện tổng chi nhân sự chi nhánh, không xuống được từng người. Chỉ R8, R13, R10 chạm được số lương cá nhân.

### 4.3 Ba quy tắc cứng

1. **Mọi thao tác `△` sinh bản ghi duyệt**: ai xin, ai duyệt, lý do, thời điểm. Duyệt bằng PIN ngay trên màn hình của nhân viên.
2. **Không xoá dữ liệu, chỉ huỷ có dấu vết.** Huỷ món, huỷ bill, sửa tồn, huỷ hoá đơn điện tử đều là bút toán ngược, giữ bản gốc.
3. **Quyền xem giá vốn tách khỏi quyền xem doanh thu.**

## 5. Kiến trúc đa chi nhánh

Nguyên tắc: **mọi bản ghi vận hành thuộc về một chi nhánh; mọi bản ghi danh mục thuộc về chuỗi nhưng ghi đè được theo chi nhánh.**

| Loại dữ liệu | Thuộc về | Ghi đè theo chi nhánh |
|---|---|---|
| Món, công thức, nguyên liệu, danh mục, set | Chuỗi | Giá bán · có bán không · trạm bếp |
| Bàn, khu vực, thiết bị, máy in | Chi nhánh | — |
| Đơn hàng, hoá đơn, ca, đặt bàn, đơn online | Chi nhánh | — |
| Kho, lô, kiểm kê | Chi nhánh | Nhà cung cấp dùng chung được |
| Nhân sự, vai trò | Chuỗi | Gán quyền theo từng chi nhánh |
| Bảng công, kỳ lương, phiếu chi, tài sản | Chi nhánh | Chi phí chung cấp chuỗi phân bổ về chi nhánh theo quy tắc (Mục 27) |
| Tài khoản ngân hàng, dải VA, ký hiệu HĐĐT, Page | Chi nhánh | Bắt buộc riêng |

**Bốn hệ quả giao diện:** (1) bộ chọn chi nhánh cố định góc trên trái Office/POS, ẩn nếu chỉ có một; (2) báo cáo mặc định xem một chi nhánh, có nút *So sánh chi nhánh* riêng — gộp sẵn sẽ che chi nhánh đang lỗ; (3) kho không dùng chung, chuyển hàng qua phiếu chuyển có xác nhận hai đầu; (4) sửa danh mục cấp chuỗi phải cảnh báo "áp dụng cho N chi nhánh" trước khi lưu.

## 6. Kiến trúc mở rộng — engine ổn định, cấu hình trong dữ liệu

Yêu cầu "dễ mở rộng module sau này" được giải bằng ba lớp:

**6.1 Chia miền rõ ràng.** Hệ thống là một khối nhưng chia thành các miền độc lập, mỗi miền có dữ liệu và API riêng: Danh mục (món, set, giá) · Đặt món (bàn + online) · Bếp · Kho · Thanh toán · Hoá đơn · Đặt bàn · **Nhân sự (lịch–công–lương)** · **Chi phí & tài sản** · Kế toán · Báo cáo · Định danh & quyền. Miền này gọi miền kia qua API nội bộ, không đọc thẳng bảng của nhau — nhờ vậy về sau tách một miền ra dịch vụ riêng không phải viết lại.

**6.2 Sự kiện làm xương sống.** Mọi biến cố nghiệp vụ phát ra sự kiện: `don.tao` · `mon.gui-bep` · `mon.hoan-thanh` · `thanh-toan.nhan` · `hoa-don.phat-hanh` · `ton-kho.duoi-dinh-muc` · `dat-ban.xac-nhan` · `cham-cong.vao/ra` · `ky-luong.chot` · `phieu-chi.duyet` · `khau-hao.sinh` · `diem.tich` · `diem.tieu` · `cong-no.ghi` · `cong-no.gach` · `bao-tri.den-han`… Module mới (tích điểm, chấm công, kết nối Grab) chỉ cần **nghe sự kiện**, không sửa lõi. Đây cũng là cách đơn online đẩy sang Page mà không dính vào luồng bếp.

**6.3 Cấu hình thay vì code.** Những thứ thay đổi thường xuyên nằm trong cơ sở dữ liệu, sửa được từ Office không cần triển khai lại: quy tắc định tuyến trạm, thời gian chuẩn, cây danh mục, modifier, khung giờ đặt bàn, vùng giao, trần đơn online, mẫu thông báo. Engine chỉ đọc cấu hình và chạy.

**Chỗ ngồi chờ sẵn cho module tương lai:** thành viên & tích điểm · chấm công & lương · kết nối API GrabFood/ShopeeFood · app native · nhượng quyền (chi nhánh ngoài chuỗi với quyền hạn hẹp hơn) · marketing tự động qua Messenger/Zalo.

---

# PHẦN B — QUY CHUẨN THIẾT KẾ (Sora Design System)

## 7. Định hướng thẩm mỹ

*Sora* là bầu trời. Bảng màu đi từ **mực sumi** (đen ám xanh, không phải đen thuần) lên **hoàng hôn đồng thau** — trời Tokyo lúc quán mở cửa. Chất liệu tham chiếu: than hoa, vỉ gang, đồng thau xước, giấy washi.

**Ba quy tắc giữ "sang" không thành "sến":** vàng là kim loại chứ không phải màu highlight (viền mảnh, chữ nhấn — không nền lớn, không gradient chói); khoảng trống nhiều hơn mức thấy thoải mái; mỗi màn hình chỉ một điểm vàng mạnh nhất.

**Điểm ký tự riêng:** *thang than hồng* — dải xám tro → đồng → cam than → đỏ lửa, dùng thống nhất làm ngôn ngữ tiến độ ở mọi nơi: đồng hồ KDS, tiến độ đơn của khách, mức tồn kho, mức đạt chỉ tiêu. Một ẩn dụ, dùng cả bảy ứng dụng.

Back-office dùng **nền sáng ngà** — không bắt kế toán nhìn nền đen 8 tiếng/ngày.

## 8. Màu

### 8.1 Nền tối (Table, POS, Kitchen, Web, Online-khách)

| Token | Hex | Dùng cho |
|---|---|---|
| `--sumi-950` | `#07080A` | Nền trang, nền KDS |
| `--sumi-900` | `#0D0F13` | Nền app |
| `--sumi-800` | `#151920` | Thẻ, panel |
| `--sumi-700` | `#1E232C` | Thẻ nổi, hover |
| `--sumi-600` | `#2B313C` | Viền mạnh |
| `--sumi-500` | `#3D4552` | Chữ vô hiệu hoá |
| `--brass-200` | `#EFE0BC` | Chữ nhấn cỡ nhỏ trên nền rất tối |
| `--brass-300` | `#DCC58A` | Chữ nhấn, icon |
| `--brass-400` | `#C9A85C` | Viền, trạng thái chọn |
| `--brass-500` | `#B08A33` | **Màu thương hiệu** — nút chính, logo |
| `--brass-600` | `#8A6C24` | Nút nhấn giữ |
| `--brass-700` | `#5E4917` | Nền vàng chìm |
| `--ivory-100` | `#F5F2EA` | Chữ chính trên nền tối |
| `--ivory-300` | `#C2BCAE` | Chữ phụ |
| `--ivory-500` | `#8B8577` | Nhãn |

### 8.2 Nền sáng (Sora Office)

| Token | Hex | Dùng cho |
|---|---|---|
| `--washi-50` | `#FBF9F4` | Nền trang |
| `--washi-100` | `#FFFFFF` | Thẻ, bảng |
| `--washi-200` | `#EFEBE1` | Viền, kẻ bảng |
| `--sumi-900` | `#0D0F13` | Chữ chính |
| `--brass-600` | `#8A6C24` | Nhấn, link, tab chọn |

### 8.3 Màu chức năng & thang than hồng

| Token | Hex | Nghĩa |
|---|---|---|
| `--aka` | `#B5382C` | Lỗi, quá giờ, huỷ, hết món, giảm so kỳ trước |
| `--matcha` | `#4A8F63` | Thành công, đủ, tăng so kỳ trước |
| `--kohaku` | `#D08A1C` | Cảnh báo, sắp trễ, tồn thấp |
| `--ai` | `#4E7FA8` | Thông tin, đơn online |

Thang than hồng: 0–40% thời gian chuẩn `#5A6270` tro · 40–70% `#C9A85C` đồng · 70–100% `#D9721F` than · >100% `#B5382C` lửa nhấp nháy 1.2s.

### 8.4 Quy tắc bắt buộc

Chữ vàng < 14px: cấm, dùng `--ivory-100`. Nút chính = nền `--brass-500`, chữ `--sumi-950` — không chữ trắng trên vàng. Không dùng màu làm thông tin duy nhất — trạng thái luôn kèm chữ hoặc icon. Tương phản ≥ 4.5:1 chữ thường, ≥ 3:1 chữ ≥24px và viền tương tác.

## 9. Chữ

| Vai trò | Font | Weight | Dùng ở đâu |
|---|---|---|---|
| Display | **Cormorant Garamond** (dự phòng: Lora / Noto Serif) | 300 / 600 | Tiêu đề website, tên nhóm món menu khách. Chỉ ≥ 28px. |
| Giao diện | **Be Vietnam Pro** | 400/500/600/700 | Toàn bộ POS, KDS, Office, chữ nhỏ mọi nơi |
| Số liệu | **IBM Plex Mono** | 400/500 | Đồng hồ KDS, số tiền, mã đơn, bảng kho, bảng kế toán |
| Trang trí Nhật | **Shippori Mincho B1** | 500 | Chỉ kana/kanji: 東京空 |

Việc bắt buộc tuần đầu giai đoạn 1: dựng bảng thử dấu tiếng Việt cho Cormorant weight 600 (`ắ ằ ẵ ộ ữ ỡ ị Ỹ`). Lỗi thì đổi sang Lora hoặc Noto Serif.

Thang cỡ: D1 60 · D2 44 · D3 30 · T1 22 · T2 18 · B1 16 · B2 14 · C1 13 · C2 11 (viết hoa, tracking 0.08em). **KDS dùng thang riêng ×1.25**: tên món 24px, số lượng 30px, đồng hồ 40px mono.

## 10. Lưới, khoảng cách, hình khối

| Hạng mục | Quy chuẩn |
|---|---|
| Đơn vị | 4px. Khoảng cách hợp lệ: 4·8·12·16·24·32·48·64·96 |
| Bo góc | sm 4 (nút, ô nhập) · md 8 (thẻ) · lg 12 (modal) · pill 999 (chip). Không bo góc lớn. |
| Viền | Hairline 1px `rgba(201,168,92,.16)` trên nền tối; `--washi-200` trên nền sáng |
| Độ nổi | Nền tối: không đổ bóng, dùng bậc nền + viền vàng mảnh. Nền sáng: bóng nhẹ `0 1px 2px rgba(13,15,19,.06)` |
| Vùng chạm | ≥44px (khách) · ≥52px (POS) · ≥64px (KDS, đeo găng) |

Breakpoint: `sm` 360–599 (4 cột) · `md` 600–1023 (8) · `lg` 1024–1439 (12) · `xl` 1440–1919 (12) · `tv` 1920+ (12).

## 11. Icon, hệ ảnh PNG tách nền, hệ chữ Nhật, chuyển động

### 11.1 Icon
Line 1.5px (Lucide chỉnh stroke), cỡ 20/24/32; KDS dùng 32.

### 11.2 Hệ ảnh sản phẩm — toàn bộ là PNG tách nền

Ảnh món tải lên là **PNG không nền**. Đây là quyết định nền tảng: ảnh cắt rời có viền bất định, nếu thả trần lên giao diện sẽ "trôi lơ lửng" và mỗi chỗ trông một kiểu. Giải pháp là **đĩa ảnh (image plate)** — mọi ảnh món đặt trong một sân khấu chuẩn do CSS dựng, không nướng nền vào file:

| Thành phần đĩa ảnh | Quy chuẩn |
|---|---|
| Nền | Radial gradient tâm lệch trên: `--sumi-700` → `--sumi-800` (chủ đề tối) · `--washi-100` → `--washi-200` (sáng) |
| Bóng đổ | `filter: drop-shadow(0 12px 24px rgba(0,0,0,.45))` nền tối; `.12` nền sáng — bóng bám theo hình cắt, làm món "đậu" xuống |
| Tỉ lệ chiếm chỗ | Món chiếm ~80% khung, canh giữa, đệm 10% mọi phía — hình cắt méo mó vẫn không chạm mép |
| Khung | 1:1 thumbnail (88, 176) · 4:3 thẻ · 3:2 chi tiết · tự do ở hero website |
| Vân | Washi 3% phủ lên plate ở website/menu khách; không ở POS/KDS |

**Đường ống ảnh khi tải lên (M2):** kiểm kênh alpha — không có thì cảnh báo "Ảnh chưa tách nền, sẽ hiển thị trong khung có viền" và rơi về kiểu ảnh vuông để không vỡ layout; tự cắt viền trong suốt thừa; tự sinh biến thể 176 / 400 / 800 / 1600 (PNG giữ alpha + WebP-alpha cho web); một bản gốc, mọi kênh dùng chung.

**Guideline chụp:** một góc thống nhất theo nhóm — món nướng và đồ khay 90° từ trên; bát nước (lẩu, ramen, súp) 45°; đồ uống ngang 0°. Ánh sáng bên trái. Sai góc là plate không cứu được — guideline giao cho người chụp trước buổi chụp.

**Cơ hội của ảnh tách nền:** hero website và thẻ set cho món "bay" — cutout lớn nổi trên nền khói/washi, chữ chạy sau món. Chữ ký thị giác này chỉ có được nhờ PNG alpha.

Chưa có ảnh: plate trống + kana đầu tên món màu `--brass-700`. Không ảnh stock.

### 11.3 Hệ chữ Nhật trang trí

Chữ Nhật dùng **Shippori Mincho B1**, theo hệ thống chứ không rắc tuỳ hứng:

| Cấp | Dùng gì | Ở đâu |
|---|---|---|
| Thương hiệu | 東京空 · từ khoá 炭火焼 (nướng than hoa) | Logo lockup, hero W1, màn chờ POS |
| Nhóm món | Một kanji đại diện mỗi nhóm, làm dấu chia `— 焼 —` và watermark tiêu đề nhóm | Menu khách, website |
| Trạm bếp | Kanji trạm in lớn góc header KDS | KDS |
| Món | Tên Nhật phụ dưới tên Việt (dữ liệu tên JA sẵn) | T3, W3 |
| Không khí | Watermark kanji lớn opacity 4–6%, có thể viết dọc (tategaki) mép trang | Hero web, empty state, màn chờ — không ở KDS và bảng số liệu |

**Bảng kanji chuẩn:** Set 膳 · Nướng 焼 · Khai vị & bếp lạnh 鮮 · Chiên xào hấp 揚 · Lẩu cơm mì 鍋 · Súp 汁 · Tráng miệng 甘 · Bia 麦 · Rượu Nhật 酒 · Trà & nước ép 茶 · nhóm con thịt: Bò 牛 · Heo gà 豚 · Hải sản 海 · Rau củ 野 · trạm: bếp lạnh 鮮 · quầy sống 生 · bếp nướng 焼 · nóng 1 揚 · nóng 2 鍋 · pha chế 酒.

Ba quy tắc an toàn: kanji không bao giờ là thông tin duy nhất — luôn có chữ Việt bên cạnh; watermark ≤ 6% opacity; **toàn bộ kanji phải được người biết tiếng Nhật duyệt trước khi in/đăng**.

### 11.4 Chất liệu & chuyển động
Vân washi 3% ở website và màn chờ POS, không ở KDS. Vi tương tác 120ms · panel 200ms · sheet 280ms · hé lộ cuộn 480ms lệch pha 60ms, easing `cubic-bezier(.2,.8,.2,1)`. KDS chỉ một hiệu ứng: nhấp nháy vé quá giờ. Tôn trọng `prefers-reduced-motion`. Không bounce; hero "món bay" cho phép trôi ≤8px, tắt khi reduced-motion.

## 12. Danh mục thành phần — 44 thành phần dùng chung

**Nền tảng (12):** Button (5 biến thể) · IconButton · Input · NumberStepper · Select · Search · Toggle · Checkbox · Radio · Textarea · DatePicker · SegmentedControl
**Hiển thị (11):** Card · ListRow · DataTable (sắp xếp, cố định cột, phân trang) · Badge · Chip · Avatar · StatTile · ProgressBar (thang than hồng) · Timeline · EmptyState · Skeleton
**Điều hướng (7):** TopBar · SideNav · TabBar · Breadcrumb · StepIndicator · CategoryRail · Pagination
**Phản hồi (6):** Toast · Modal · BottomSheet · ConfirmDialog · InlineAlert · LoadingOverlay
**Chuyên biệt (8):** MenuItemCard (khách/POS/KDS) · CartLine · TableTile · OrderTicket · RecipeRow · ApprovalPrompt (PIN duyệt) · ReservationCard (thẻ đặt bàn) · **PeriodComparator** (bộ chọn so sánh chu kỳ — kỳ này / kỳ trước / cùng kỳ, kèm chip chênh lệch ▲▼)

Mỗi thành phần đủ 6 trạng thái (mặc định/hover/nhấn/chọn/vô hiệu/lỗi) × 2 chủ đề tối/sáng.

## 13. Trạng thái, giọng văn, điều kiện vận hành

| Tình huống | Cách xử lý |
|---|---|
| Rỗng | Một câu nói rõ cần làm gì + một nút |
| Đang tải | Skeleton đúng hình nội dung, không spinner toàn màn |
| Lỗi | Nói chuyện gì xảy ra và làm gì tiếp. Không xin lỗi, không mơ hồ |
| Mất mạng | Banner + hàng đợi cục bộ. POS và KDS hoạt động offline ≥ 15 phút. Màn thanh toán bị chặn khi mất mạng |

Giọng văn: câu ngắn, động từ chủ động, sentence case. Nút mô tả hành động ("Gửi bếp" không phải "Xác nhận"); từ ở nút = từ ở thông báo kết quả.

Điều kiện thực tế quyết định bố cục: bếp hơi nước tay ướt → nút to, không hover, không kéo-thả; sàn ồn 75dB → không dựa âm thanh; bàn ăn tối → tương phản dư; nhân viên cầm khay → POS thao tác một tay, phím chính nửa dưới màn.

---

# PHẦN C — THỰC ĐƠN & ĐỊNH TUYẾN BẾP (ĐÃ CHỐT)

## 14. Cấu trúc thực đơn cho khách — 10 nhóm

| # | Nhóm hiển thị | Số mục |
|---|---|---|
| 1 | Set & Combo | 6 |
| 2 | Nướng tại bàn | 27 (sau tách) |
| 3 | Khai vị & Bếp lạnh | 21 |
| 4 | Món chiên · xào · hấp | 13 |
| 5 | Lẩu · Cơm · Mì | 12 |
| 6 | Súp & Canh | 3 |
| 7 | Tráng miệng | 2 |
| 8 | Bia | 7 |
| 9 | Rượu & đồ uống Nhật | 7 |
| 10 | Nước ép · trà · nước ngọt | 12 |

Cấu trúc cho bếp giữ theo 6 trạm (Mục 16). Cây danh mục quản lý ở M10, sửa tự do không ảnh hưởng định tuyến.

**Sáu set đã chốt:** Sora Đôi (2 người) · Sora Gia đình (4 người) · Thử vị bò (5 phần nhỏ) · Sora Trưa · Set nhậu · Set nướng mang về (chỉ online). Ba ràng buộc kỹ thuật: set **nổ thành từng món** khi gửi bếp (vé mang nhãn `[SET]`); **trừ kho theo món thành phần**; set có **nhóm lựa chọn** ("chọn 4 trong 10 loại bò") nên giá vốn là khoảng — food cost tính theo món khách chọn thật.

## 15. Danh sách 78 món — đã chốt tách/gộp

| Dòng gốc | Xử lý chốt | Chênh |
|---|---|---|
| Lòng bò (gộp gan/xiên) | Tách 3: Lòng bò · Gan bò · Xiên bò | +2 |
| Cánh gà Teriyaki (gộp mề) | Tách 2: Cánh gà Teriyaki · Mề gà nướng | +1 |
| Ramen Shoyu/Miso | Tách 2 món (nước dùng khác nhau) | +1 |
| Ramen Hải sản/Thịt | Thành modifier topping trên 3 ramen | −1 |
| Cánh gà chiên 3 vị · Nghêu hấp 2 kiểu · Kem các vị | 1 món + modifier | 0 |
| Sashimi mực · Hải sản hấp · Hoa quả | Cờ `theo mùa`, bếp trưởng tự đổi mô tả/giá | 0 |

**75 + 3 = 78 món.** Bốn nhóm modifier dùng lại: Chọn vị (bắt buộc, 1) · Topping ramen (tuỳ ý, nhiều, chênh giá) · Cỡ phần (bắt buộc, 1, chênh giá) · Ghi chú chế biến (cắt dày/mỏng, chín tới/kỹ, ít cay).

## 16. Sáu trạm bếp & định tuyến động — đã chốt

| Mã | Trạm | Món | Thời gian chuẩn |
|---|---|---|---|
| ST-01 | Bếp lạnh | Sashimi 6 · Sushi 5 · Salad & Gỏi 8 · Ăn kèm 2 · Tráng miệng 2 = 23 | 3–6 phút |
| ST-02 | Quầy thịt & hải sản sống (ra sống đã cân) | 16 cố định + 5 linh hoạt | 2–5 phút |
| ST-06 | Bếp nướng (nướng hộ, ra chín) | 6 cố định + 5 linh hoạt | 8–16 phút |
| ST-03 | Bếp nóng 1 | Chiên 7 · Xào 4 · Hấp 2 = 13 | 6–14 phút |
| ST-04 | Bếp nóng 2 | Lẩu 2 · Ramen 3 · Cơm 7 · Súp 3 = 15 | 5–12 phút |
| ST-05 | Quầy pha chế | 26 đồ uống | 1–4 phút |
| — | Expo | Điều phối, không nấu | — |

**Phân loại 27 món nướng — CHỐT theo đề xuất đã duyệt:**

| Phương thức | Món |
|---|---|
| `SỐNG` → ST-02 (16) | 12 món bò sau tách: lưỡi · cuống tim · diềm thăn · dẻ sườn · gầu · thăn · ba chỉ · ba chỉ cuộn nấm · nầm · lòng · gan · xiên bò. Cộng má heo · ba chỉ heo · nầm heo · xiên heo* |
| `NƯỚNG` → ST-06 (6) | Xiên gà Yakitori · cánh gà Teriyaki · mề gà nướng · hàu · sò điệp · sò mai |
| `LINH HOẠT` (5) | Tôm · mực · nấm đùi gà · măng tây · ớt chuông — bàn có bếp → ST-02, không bếp → ST-06 |

*Xiên heo chuyển sang `SỐNG` vì đã tẩm sẵn, khách nướng được; nếu bếp trưởng muốn đưa về ST-06 thì chỉ đổi cấu hình, không đổi thiết kế.

Quy tắc lõi: `Trạm đích = f(món, loại bàn)`. Mỗi bàn có thuộc tính `có bếp tại bàn`. Nướng hộ **không phụ thu** — giá một, chỉ khác nhãn và thời gian. Vé ST-06 hiện dòng "Bàn 12 không có bếp" để đầu bếp hiểu vì sao món về đây. Chuyển bàn khác loại giữa chừng → POS bắt xác nhận định tuyến lại, không tự đổi im lặng.

**Đợt ra món:** Đợt 1 uống + khai vị (ngay) → Đợt 2 thịt loạt 1 → Đợt 3 loạt 2 + món nóng (bấm "Ra đợt tiếp") → Đợt 4 cơm/mì/lẩu → Đợt 5 tráng miệng. Món chưa tới đợt ở trạng thái *Chờ ra* trên KDS, chưa tính giờ.

**Món đa trạm:** Lẩu Sukiyaki = nồi (ST-04) + khay thịt (ST-02) → 2 vé con cùng mã, Expo chỉ báo sẵn sàng khi cả hai xong.

## 17. Đồ uống — 26 loại, đã chốt (có bia theo cốc)

| Nhóm | Món | Vận hành |
|---|---|---|
| **Bia chai/lon (5)** | Asahi Super Dry · Sapporo Premium · Kirin Ichiban · Heineken · Saigon Special | Kho theo lon/chai |
| **Bia bán theo cốc (2)** | **Bia tươi Nhật** (keg Sapporo/Asahi) · **Bia hơi** — modifier cỡ cốc 330ml / 500ml | Xem nghiệp vụ keg bên dưới |
| **Rượu & highball (7)** | Sake Junmai · Sake Ginjo · Shochu lúa mạch · Shochu khoai · Umeshu · Highball Suntory · Umeshu soda | Sake/shochu bán bình + ly → quy đổi 1 chai 720ml = 6 ly 120ml |
| **Nước ngọt & soda (3)** | Coca-Cola · Sprite · Ramune (modifier vị) | |
| **Nước ép (4)** | Cam · Táo · Dứa · Theo mùa | Có công thức, định lượng, hao hụt như món ăn |
| **Trà (3)** | Trà xanh Nhật (modifier nóng/lạnh) · Trà lúa mạch · Trà hoa quả | |
| **Nước (2)** | Nước suối · Nước suối có gas | |

**Nghiệp vụ bia keg — điểm mới của kho:**

- Kho nhập theo **keg** (20L hoặc 30L). Bán theo **cốc**. Quy đổi: keg 20L ≈ 57 cốc 330ml hoặc 38 cốc 500ml **trước hao hụt**.
- BOM của "Bia tươi cốc 500ml" = 500ml từ keg + **hao hụt bọt/rót 6%** (số khởi điểm, hiệu chỉnh sau 2 tuần chạy thật).
- Trừ kho theo lượng rót mỗi cốc; **kiểm kê cuối ngày theo keg** (đếm keg nguyên + ước lượng keg đang mở bằng cân hoặc vạch). Chênh lệch rót thực tế vs lý thuyết hiện ở báo cáo hao hụt S11 — đây là chỗ thất thoát kinh điển của quầy bia.
- Keg đang mở có hạn dùng ngắn (thường 5–7 ngày sau khi đục) → màn S9 thêm loại lô `keg đang mở` với đồng hồ riêng.
- POS: hai món bia tươi nằm trong bàn phím nhanh mặc định; rót theo cỡ nên modifier cỡ cốc là bắt buộc.

Quầy bar: POS nhắc kiểm tra độ tuổi khi order có cồn; cần đủ giấy phép bán rượu bia.

## 18. Mô hình dữ liệu món (khai báo một lần)

```
MÓN ĂN
├─ Định danh: mã (SORA-BO-001) · tên Việt/EN/JA · phím tắt POS
├─ Phân loại: nhóm khách (1/10) · nhóm bếp · thẻ (cay/chay/sống/theo mùa/món ký)
├─ Trạm & phương thức: SỐNG / NƯỚNG / LINH HOẠT · trạm khi bàn có bếp ·
│    trạm khi không bếp · trạm phụ · thời gian chuẩn từng nhánh
├─ Theo chi nhánh: có bán không · giá riêng · trạm riêng
├─ Kênh bán: tại bàn · mang về · giao hàng · giá riêng kênh online
├─ Bán hàng: giá · giá khung giờ · thuế suất · đơn vị bán · cho gọi trên Sora Table?
├─ Tuỳ chọn: nhóm bắt buộc/tuỳ ý · chênh giá · modifier có trừ kho không
├─ Công thức (BOM): NVL → định lượng → hao hụt % · bán thành phẩm lồng nhau ·
│    giá vốn tự tính · food cost % · lãi gộp
├─ Trình bày: ảnh 1+2 · mô tả ≤80 ký tự + dài · dị ứng · gợi ý kèm 3 món + 2 uống
└─ Trạng thái: đang bán / 86 / ngừng · giới hạn ngày · lịch bán
```

### 18.1 Trung tâm sản phẩm — một nguồn, mọi kênh, không phân mảnh

Sản phẩm thay đổi thường xuyên nên quy tắc là tuyệt đối: **chỉ một nơi ghi dữ liệu món** (miền Danh mục, giao diện M1–M11). Web, Table, POS, KDS, Online, kho, kế toán đều là **người đọc** qua API — không app nào có bảng món riêng.

- Ảnh: một bản gốc PNG alpha, biến thể tự sinh (11.2). Đổi ảnh một lần, mọi kênh đổi theo.
- Lan truyền: sự kiện `mon.cap-nhat` / `mon.86` làm mới cache mọi kênh trong **≤ 60 giây** (86 tức thời qua websocket). Sửa giá ở Office là menu web và menu bàn đổi theo, không có bước đồng bộ tay.
- Bản nháp & hẹn giờ: sửa lớn (đổi mùa, đổi giá loạt) soạn nháp, hẹn áp dụng 0h — menu không nhảy giá giữa ca.
- Kiểm tra khi lưu: món bật `bán online` phải có ảnh + mô tả; modifier bắt buộc phải có ≥ 2 lựa chọn; thiếu là chặn lưu kèm lý do.


---

# PHẦN D — THIẾT KẾ CHI TIẾT TỪNG GIAO DIỆN

## 19. SORA WEB — Website thương hiệu + Đặt món online (20 màn)

**Desktop + mobile · nền tối · SEO là mục tiêu số một cùng với hai cửa hành động: Đặt bàn và Đặt món online.**

| # | Trang | Đường dẫn | Ghi chú |
|---|---|---|---|
| W1 | Trang chủ | `/` | Hero video than hồng 8s; chữ Cormorant 60px "Bầu trời Tokyo, trên bếp than."; 東京空. **Hai nút hành động ngang hàng: *Đặt bàn* · *Đặt món mang về*** — đây là hai việc website phải bán được, mọi trang đều có lối về hai nút này ở thanh điều hướng. |
| W2 | Thực đơn | `/thuc-don` | Toàn bộ 78 món + giá, lấy cùng nguồn dữ liệu hệ thống — sửa ở Office là web đổi theo |
| W3 | Chi tiết món | `/thuc-don/{slug}` | Chỉ ~15 món chủ lực, ảnh lớn, schema `Menu` |
| W4 | Câu chuyện | `/ve-chung-toi` | |
| W5 | Không gian & chi nhánh | `/khong-gian` | Mỗi chi nhánh: ảnh, bản đồ, giờ mở, khu có bếp tại bàn, phòng riêng |
| W6 | **Đặt bàn** | `/dat-ban` | Viết lại thành 3 bước — chi tiết bên dưới |
| W7 | Ưu đãi & Set | `/uu-dai` | 6 set với ảnh và giá |
| W8 | Tin tức | `/tin-tuc` | SEO |
| W9 | Liên hệ & tuyển dụng | `/lien-he` | |
| — | Phụ (4) | chính sách · điều khoản · 404 · trang cảm ơn | |

**W6 — Đặt bàn 3 bước** (không phải form mù):
1. **Chọn chi nhánh** — thẻ chi nhánh với khoảng cách, giờ mở.
2. **Chọn ngày giờ + số khách + kiểu chỗ** (bàn thường / bàn nướng có bếp / phòng riêng). Lưới khung giờ hiển thị **còn nhận hay hết chỗ theo sức chứa thật** từ cấu hình R3 — khung hết thì mờ đi, không cho chọn rồi báo lỗi sau.
3. **Thông tin & xác nhận** — tên, SĐT, ghi chú (sinh nhật, dị ứng). Suất được **giữ mềm 10 phút** trong lúc điền (đồng hồ nhỏ góc phải), hết giờ trả suất về lưới. Xong hiện mã đặt chỗ + nút *Nhận nhắc hẹn qua Messenger* (m.me kèm ref — Mục 30.3) và lối *Thêm vào lịch*.

Đặt món online là **một phần của chính website**: nút *Đặt món mang về* ở nav mọi trang dẫn về `/dat-mon` (luồng O1–O7, chi tiết ở 23.2). Không còn app riêng, không còn subdomain.

Kỹ thuật: LCP < 2.5s trên 4G · WebP/AVIF · schema `Restaurant` + `Menu` cho từng chi nhánh · 3 ngôn ngữ `/`, `/en`, `/ja`.

## 20. SORA TABLE — Khách gọi món & tự thanh toán (17 màn)

Nguyên tắc: nút hành động ở 1/3 dưới màn; chữ nhỏ nhất 14px; tối ưu cho lần gọi thứ 2-3-4.

| # | Màn hình | Nội dung chính |
|---|---|---|
| T1 | Chào & xác nhận bàn | "Bàn 12 · Khu Sakura", số khách, ngôn ngữ. Bàn đã mở phiên → vào thẳng T2 |
| T2 | Thực đơn | Thanh 10 nhóm dính trên, cuộn liên tục **không phân trang**; nhóm >12 món chia nhóm con dính cấp 2 (Bò · Heo & Gà · Hải sản · Rau củ); món hết xám hoá không ẩn; giỏ nổi ở đáy |
| T3 | Chi tiết món (sheet 90%) | Ảnh 3:2, tên VI+JA, dị ứng, modifier, ghi chú, số lượng, *Thêm vào giỏ · 285.000₫*; cuối sheet 3 món dùng kèm. Món `SỐNG` ở bàn không bếp hiện nhãn "Bếp nướng sẵn · thêm 8 phút" |
| T4 | Tìm kiếm | Gõ không dấu vẫn ra ("bo ba chi" → Ba chỉ bò) |
| T5 | Bộ lọc | Chay · không cay · không hải sản · <200k · đang có sẵn; hiện số món khớp ngay trên nút |
| T6 | Giỏ hàng | Sửa/xoá, ghi chú bếp, *Gửi bếp* |
| T7 | Xác nhận gửi | 2 giây, tự về T2 |
| T8 | Đơn của bàn | Nhóm theo đợt, mỗi món thanh than hồng: Đã nhận → Đang làm → Đang mang ra → Đã phục vụ |
| T9 | Gọi nhân viên | 5 nút to: phục vụ · thêm than · đá/nước · tính tiền · khác |
| T10 | Tạm tính | Hai nút ngang hàng: *Tự thanh toán* · *Gọi thu ngân* |
| T11 | Chia tiền | Trả hết · chia đều N · chọn món mình trả; hiện "Đã trả X / còn Y" |
| T12 | Chọn món mình trả | Món người khác nhận thì khoá — chống trả trùng |
| T13 | VietQR | QR nhúng **tài khoản định danh riêng của lần trả này** + số tiền; số TK và tiền mono có nút sao chép; *Đã chuyển xong*; *Đổi cách trả* |
| T14 | Chờ xác nhận | 0–20s "Đang chờ ngân hàng báo về" · 20–60s "Thường dưới 1 phút" · >60s "Nhân viên sẽ tới xác nhận" + đẩy P15; luôn có "Bạn có thể đóng màn này" |
| T15 | Hoá đơn | **Hoá đơn điện tử thật** (không chỉ bảng kê): mã tra cứu, lưu ảnh, gửi email/Zalo; dưới cùng: khối **đánh giá 1 chạm** — 5 sao + ô nhận xét tuỳ chọn (→ B13); nếu có SĐT tích điểm: dòng “+42 điểm · hạng Bạc” |
| T16 | Hết món giữa chừng | "Nầm bò vừa hết, đã bỏ khỏi đơn" + 2 gợi ý thay |
| T17 | Mất kết nối | Giỏ vẫn thêm được, tự gửi lại; màn thanh toán bị chặn kèm "Vui lòng gọi thu ngân" |

Bốn quy tắc an toàn: bàn **không tự đóng** khi trả xong (chuyển *Đã thanh toán, chờ dọn*, nhân viên đóng); trả rồi vẫn gọi thêm được (khoản nợ mới cùng phiên); **chỉ webhook/API ngân hàng mới đóng khoản**, nút của khách chỉ đổi màn hình; token bàn hết hạn khi đóng bàn.

## 21. SORA POS — Phục vụ, thu ngân, điều phối online & đặt bàn (22 màn)

| # | Màn hình | Nội dung chính |
|---|---|---|
| P1 | Đăng nhập ca | PIN, chọn ca, tiền đầu ca |
| P2 | Sơ đồ bàn | Trạng thái: trống · có khách · đã gọi · chờ tính tiền · **trả một phần (viền đỏ nét đứt + %)** · **trả đủ chờ dọn (viền matcha)** · cần dọn. Ô bàn: số bàn, khách, thời gian, tiền tạm, **icon lửa nếu có bếp tại bàn**; bàn có đặt chỗ trong 90 phút tới: viền chấm brass + nhãn `Đặt 19:00`. Lọc theo khu |
| P3 | Mở bàn | Số khách, tên, ghi chú; bàn có đặt chỗ trong 90 phút tới → cảnh báo, yêu cầu xác nhận hoặc gợi ý bàn khác (nguồn: 23.5) |
| P4 | Gọi món 3 cột | Trái: 10 nhóm · Giữa: **lưới 4×5 = 20 ô/trang** (chỗ duy nhất trong hệ thống dùng phân trang — lưới cố định bấm nhanh hơn cuộn), ô chữ + giá + huy hiệu trạm, hết hàng gạch chéo, modifier bắt buộc có chấm vàng · Phải: phiếu order, *Ra đợt*, *GỬI BẾP* |
| P5 | Bàn phím nhanh | 20 món bán chạy tự cập nhật tuần — gồm 2 bia tươi mặc định |
| P6 | Popup modifier | Một chạm chọn xong, tự đóng |
| P7 | Chi tiết đơn bàn | Nhóm theo đợt, trạng thái bếp, *Ra đợt tiếp*, sửa/huỷ |
| P8 | Huỷ món | Lý do; đã gửi bếp → ô PIN quản lý tại chỗ |
| P9 | Chuyển/ghép/tách bàn | Chọn món → bàn đích; tách theo món hoặc %; **chuyển bàn khác loại → xác nhận định tuyến lại** |
| P10 | Tính tiền | Nếu khách đã tự trả một phần: khối "Đã thu X qua QR lúc HH:MM" ở đầu, chỉ tính phần còn lại; ô **SĐT tích điểm** (hiện số dư + nút *Dùng điểm*, trần theo tham số); giảm giá, voucher, chia bill; hình thức: tiền mặt · thẻ · chuyển khoản · ví · **Ghi nợ công ty** (chọn công ty → kiểm hạn mức & quá hạn → R7 duyệt → khách ký trên máy hoặc in phiếu ký; HĐĐT xuất theo MST công ty — từng bill hoặc gộp bảng kê cuối kỳ, kế toán chọn và xác nhận pháp lý) |
| P11 | Hoàn tất & in | Tiền thối, in bill kèm **QR tra cứu HĐĐT**; trạng thái *đang phát hành hoá đơn* — lỗi thì cho khách về, phát hành bù (Mục 30.2) |
| P12 | Yêu cầu từ bàn | Hàng đợi T9, sắp theo thời gian chờ |
| P13 | Đặt bàn hôm nay | Danh sách rút gọn từ R1: xác nhận đến, gán bàn — bản đầy đủ ở module Đặt bàn |
| P14 | Đóng ca | Tiền mặt, doanh thu theo hình thức, **khối đối soát chuyển khoản: hệ thống vs sao kê, giao dịch chưa gán** |
| P15 | Đối soát thanh toán tại bàn | 3 nhóm: đã khớp (xanh) · lệch tiền (vàng — chấp nhận/yêu cầu bù) · chưa gán (xám). Mỗi dòng: bàn · tiền · số VA · mã GD ngân hàng. Banner đỏ nếu không nhận giao dịch nào >15 phút giờ cao điểm. Mở thường trực |
| P16 | **Trạm thu ngân (máy 22", kiêm điều phối online)** | Bố cục hai vùng cố định: **vùng việc chính** (trái) chạy các màn POS bình thường (sơ đồ bàn, tính tiền P10/P11) và **dải điều phối** (phải, ~640px) luôn hiển thị, xếp ba ngăn theo ưu tiên: (1) **Đơn online** — thẻ đơn mới viền `--ai` + một tiếng chuông, hành động một chạm ngay trên thẻ: *Xác nhận* (đẩy bếp), *Gọi khách*, *Gán ship* (mở drawer: chọn từ **sổ shipper quen** tên + SĐT hoặc nhập mới, nút gọi trực tiếp — vì ship gọi thủ công), *Đóng gói xong*, *Đã giao*; đơn hẹn giờ hiện đếm ngược. (2) **Đối soát thanh toán** — chỉ hiện dòng cần xử lý (lệch / chưa gán), khớp tự động chỉ là số đếm; tiền lệch kêu hai tiếng trầm. (3) **Yêu cầu từ bàn** — "xin tính tiền" ghim đầu. Chân dải: **sổ COD theo shipper** — "Hùng · 3 đơn · 742.000₫", shipper về nộp bấm *Đã nhận* → vào sổ quỹ, khớp P14. Quy tắc ưu tiên chú ý: khách đứng trước mặt > tiền lệch > đơn online mới > còn lại — dải không bao giờ che vùng tính tiền. |

### Vì sao P16 là một màn riêng chứ không phải "mở hai cửa sổ"

Thu ngân kiêm điều phối nghĩa là một người phải phản ứng với bốn dòng sự kiện cùng lúc trong khi khách đứng trước mặt. Bắt họ chuyển qua lại giữa POS và O8 là bảo đảm sót đơn giờ cao điểm. P16 gom mọi thứ cần *phản ứng nhanh* vào một dải luôn nhìn thấy với hành động một chạm; O8/P15 bản đầy đủ vẫn mở được khi cần *đào sâu* (lọc, lịch sử, huỷ đơn có lý do). Máy thu ngân 22" đủ rộng cho cả hai vùng không chen nhau.

### Hai phân hệ chuyển về từ Sora Online

POS nhận thêm 6 màn vận hành: **Điều phối online** — O8 bảng đầy đủ (chế độ đào sâu của dải P16), O9 chi tiết đơn, O12 nhập đơn kênh ngoài; **Đặt bàn** — R1 bảng trục giờ, R2 chi tiết đặt chỗ, R4 nhắc hẹn & no-show. Cả sáu màn đổi sang **nền tối POS** để đồng nhất thiết bị (tablet + máy thu ngân); đặc tả giữ nguyên bố cục, chỉ đổi token. Ba màn cấu hình O10 (vùng giao & phí), O11 (menu online & trần công suất), R3 (cấu hình nhận đặt) chuyển về Office — Quản trị.

## 22. SORA KITCHEN — Màn hình bếp (6 màn)

| # | Màn hình | Mô tả |
|---|---|---|
| K1 | Ghép thiết bị | Mã 6 số gán màn vào trạm |
| K2 | Hàng vé | Vé xếp cũ → mới, quá giờ nhảy đầu + nhấp nháy viền đỏ. Trạng thái Mới → Đang làm → Xong (+ *Hoàn tác* 30s). Ghi chú khách màu kohaku không bao giờ ẩn. Không cuộn — quá 5 vé hiện "còn N đơn". Offline vẫn thao tác được. **Đơn online: viền `--ai`, nhãn `MANG VỀ` / `GIAO 19:30`, đồng hồ ĐẾM NGƯỢC đến lúc phải bắt đầu nấu** (giờ hẹn − thời gian nấu − thời gian giao) — logic ngược với đơn tại bàn, nếu dùng chung thì bếp nấu sớm và món nguội |
| K3 | Bảng tổng món | "Cơm chiên hải sản ×7" để nấu gộp |
| K4 | Chờ ra | Món đợt sau + đơn online hẹn giờ xa |
| K5 | Báo hết món | Gạt công tắc, "hết đến cuối ca"/"còn N phần" — đẩy ngay ra Table, POS **và menu online** |
| K6 | Expo | Gom theo bàn/đơn, đủ/thiếu, cảnh báo vé đa trạm chờ nhau |

Vé mẫu: bàn + đợt 22px · mã đơn + đồng hồ 40px mono theo thang than hồng · tên món 24px, số lượng 30px · ghi chú 18px kohaku · hai nút cao 72px.

**Hai trạm nướng khác nhau:** ST-02 — 6 cột vé thấp, thông tin chính là **khối lượng gram** (kết nối cân điện tử tự điền), ghi chú "cắt dày/mỏng". ST-06 — 4 cột vé cao, thêm nút *Đang trên vỉ*, ghi chú "chín tới/kỹ", dòng "Bàn 12 không có bếp" giải thích vì sao món về đây.

Cấu hình trạm (ở Office): món thuộc trạm · quy tắc định tuyến theo loại bàn · thời gian chuẩn từng nhánh · ngưỡng cảnh báo · số cột · in tem.

## 23. LUỒNG ONLINE & ĐẶT BÀN — khách trên Sora Web · vận hành trong Sora POS · cấu hình trong Office

### 23.1 Vì sao gộp vào web — và phương án SEO

1. **Một tên miền gom toàn bộ tín hiệu.** Đặt món ở subdomain là tự chia đôi uy tín — Google đối xử subdomain như thực thể nửa tách rời. Gộp về đường dẫn `/dat-mon` để mọi phiên đặt món, mọi lượt quay lại, mọi liên kết nội bộ cộng dồn cho tokyosora.vn.
2. **Tín hiệu hành vi.** Khách đặt lặp lại = truy cập trực tiếp + tìm kiếm thương hiệu tăng — hai tín hiệu xếp hạng mạnh mà quảng cáo không mua được.
3. **Trang nào index, trang nào không.** `/dat-mon/{chi-nhánh}` **được index**, title địa phương hoá ("Đặt món online Tokyo Sora Cầu Giấy — giao tận nơi"), nội dung khác hẳn W2 (chỉ món bán online + phí giao + thời gian) nên không trùng lặp. Giỏ hàng, thanh toán, theo dõi đơn: **noindex**. W2/W3 giữ schema `Menu`/`MenuItem` + `Offer`.
4. **Schema hành động.** Mỗi trang chi nhánh gắn `potentialAction: OrderAction` và `ReserveAction` trên thực thể `Restaurant` — điều kiện để nút đặt hiện ngay trên kết quả tìm kiếm.
5. **Google Business Profile từng chi nhánh** gắn link đặt món `/dat-mon/{chi-nhánh}` và đặt bàn `/dat-ban` — đòn bẩy local SEO lớn nhất, miễn phí, thường bị bỏ quên.
6. **Tốc độ là điều kiện sống.** JS của luồng đặt món tách bundle, chỉ tải khi vào `/dat-mon`; trang marketing giữ LCP < 2.5s — gộp app không được làm chậm trang chủ.
7. **Một PWA dùng cả ba việc:** xem menu, đặt món online, gọi món tại bàn (Table về `/t/{token}`). Cài một lần lên màn hình chính.

Ba quyết định cũ giữ nguyên: không bán cả 78 món online (~40–45 món); KDS đếm ngược theo giờ hẹn; đơn xong gửi vào Page chi nhánh.

### 23.2 Luồng khách đặt món trên Sora Web (O1–O7 · mobile dùng khung khách, desktop bố cục 2 cột: menu trái + giỏ dính phải)

| # | Màn hình | Nội dung |
|---|---|---|
| O1 | **Chọn chi nhánh** & kiểu nhận | Mang về / giao hàng; giao thì nhập địa chỉ, kiểm tra vùng, hiện phí + thời gian |
| O2 | `/dat-mon/{chi-nhánh}` — Thực đơn online (**index**) | Chỉ món bật `bán online` của chi nhánh, giá kênh online |
| O3 | Chi tiết món | Như T3 + cảnh báo món dễ nguội |
| O4 | Giỏ & chọn giờ (noindex) | Nhận ngay / hẹn giờ; chặn khung bếp quá tải theo trần công suất |
| O5 | Người nhận | Tên, SĐT, địa chỉ, ghi chú |
| O6 | Thanh toán (noindex) | VietQR qua VA (cùng cơ chế tại bàn) hoặc trả khi nhận |
| O7 | Thành công & theo dõi | Mã đơn + thanh than hồng: Đã nhận → Bếp đang làm → Đóng gói xong → Đang giao → Hoàn tất. **Nút chính: *Theo dõi đơn qua Messenger*** → mở Page chi nhánh kèm mã đơn (Mục 30.3); phụ: link theo dõi web + SMS/Zalo; khi Hoàn tất: khối đánh giá 1 chạm (→ B13) |

### 23.3 Điều phối trong Sora POS (O8 · O9 · O12) — nền tối

| # | Màn hình | Nội dung |
|---|---|---|
| O8 | Bảng điều phối (theo chi nhánh) | Cột theo trạng thái, thẻ đơn hiện giờ hẹn + đếm ngược, sắp trễ nhảy đầu; đơn mới rung + đẩy thông báo (Mục 30.4). **Là chế độ đào sâu** — vận hành thường trực nằm ở dải điều phối P16 trên máy thu ngân |
| O9 | Chi tiết đơn | Món, in phiếu đóng gói, gán shipper, gọi khách, huỷ có lý do; **nút mở thẳng hội thoại Messenger của đơn** |
| O10 | *(Office)* Vùng giao & phí | Vẽ vùng bản đồ, phí theo vùng/km, đơn tối thiểu, giờ ngừng nhận |
| O11 | *(Office)* Menu online | Bật/tắt món theo chi nhánh, giá riêng, giới hạn/ngày, giờ bán, **trần đơn mỗi khung 15 phút** |
| O12 | Kênh ngoài | GrabFood/ShopeeFood/Be nhập tay vào cùng bảng — bếp thấy một hàng đợi; **không đấu nối API theo quyết định** — giao hàng gọi ship thủ công, nhập tay là luồng chính thức |

Đóng gói là một điểm bấm riêng ("đã đóng gói xong") — không có thì món ra bếp nằm chờ không ai biết. Hết món đồng bộ hai chiều với K5.

### 23.4 Đặt bàn trong Sora POS (R1 · R2 · R4 — nền tối) · cấu hình R3 ở Office

| # | Màn hình | Nội dung |
|---|---|---|
| R1 | Bảng đặt bàn | Trục giờ × khu vực, thẻ đặt chỗ ReservationCard; trạng thái: chờ xác nhận → đã xác nhận → đã đến → no-show → huỷ. Kéo thẻ để gán bàn |
| R2 | Chi tiết đặt chỗ | Khách, SĐT, số người, **kiểu chỗ mong muốn (bàn có bếp / phòng riêng)**, ghi chú, gán bàn, lịch sử khách (số lần đến, số lần no-show) |
| R3 | *(Office)* Cấu hình nhận đặt | Khung giờ, **sức chứa mỗi khung theo khu** (nguồn cho lưới W6), thời gian giữ bàn (mặc định 15 phút), **thời lượng bữa theo số khách** (2 khách 90 phút · 4+ 120 phút) + đệm dọn 15 phút, chế độ xác nhận **tự động / duyệt tay**, chặn ngày, bật/tắt đặt cọc |
| R4 | Nhắc hẹn & no-show | Hàng đợi nhắc trước 24h và 2h qua Messenger/Zalo/SMS; khách xác nhận lại bằng một chạm; thống kê tỉ lệ no-show theo nguồn đặt |

### 23.5 Bộ máy chỗ trống — một nguồn sự thật, không bao giờ trùng bàn

Sơ đồ bàn (POS) và lịch đặt bàn (web + R1) cùng đọc **một dịch vụ chỗ trống** duy nhất. Mọi nơi hiển thị khả dụng — lưới khung giờ W6, bảng R1, sơ đồ P2 — đều là hình chiếu realtime (websocket, trễ ≤ 3 giây) của dịch vụ này. Không nơi nào tự tính.

**Đơn vị tồn chỗ:** bàn × dải giờ. Một đặt chỗ chiếm từ giờ hẹn đến giờ hẹn + thời lượng bữa (theo số khách, cấu hình R3) + đệm dọn 15 phút.

**Hai chế độ nhận đặt:** *theo sức chứa khu* (mặc định cho bàn thường & bàn nướng — khách đặt "4 người, khu có bếp", bàn cụ thể gán lúc đến, linh hoạt nhất cho vận hành) và *đích danh bàn* (phòng riêng, bàn đặc biệt — khoá đúng bàn đó).

**Chống trùng ba lớp:**
1. **Giữ chỗ mềm 10 phút** khi khách vào bước 3 của W6 — hai người giành cùng suất thì người sau thấy khung xám ngay, không phải điền xong mới báo lỗi.
2. **Khoá ghi giao dịch** ở dịch vụ chỗ trống: xác nhận đặt là thao tác nguyên tử; cùng bàn × giờ chồng lấn thì thao tác sau thất bại — kể cả hai nhân viên cùng thao tác trên R1.
3. **Đồng bộ với sàn:** bàn đang có khách (walk-in) tự chiếm dải giờ hiện tại + dự kiến; POS mở bàn có đặt chỗ trong 90 phút tới bị hỏi xác nhận và gợi ý bàn khác; đến giờ hẹn mà bàn chưa trống → R1 cảnh báo đỏ + gợi ý bàn cùng khu; no-show quá thời gian giữ → tự giải phóng suất.

Kết nối P2: ô bàn có đặt trong 90 phút tới hiện viền chấm brass + nhãn "Đặt 19:00, Anh Minh, 4 khách"; khách đến, lễ tân bấm *Đã đến* trên R1 → mở phiên bàn nối thẳng vào đặt chỗ.

## 24. SORA OFFICE — Món, công thức, set (11 màn)

| # | Màn hình | Nội dung |
|---|---|---|
| M1 | Danh sách món | 78 dòng: mã · ảnh · tên · nhóm · trạm · giá · giá vốn · food cost % · trạng thái · chi nhánh áp dụng; sắp theo food cost tìm món lãi thấp |
| M2 | Thông tin món | Tên 3 ngôn ngữ, nhóm, thẻ, dị ứng, món kèm |
| M3 | Giá & thuế | Giá, khung giờ, kênh, thuế; gõ giá là hiện ngay food cost % và lãi gộp |
| M4 | **Công thức (BOM)** | Bảng NVL: định lượng · ĐVT · hao hụt % · giá vốn dòng · % đóng góp; chèn bán thành phẩm; chân bảng: tổng giá vốn, lãi gộp. Ngưỡng food cost: xanh <30% · vàng 30–38% · đỏ >38%. Sửa là báo trước "giá vốn tăng 4.200₫, food cost lên 36,7%". In phiếu A5 dán bếp |
| M5 | Tuỳ chọn | Nhóm modifier, chênh giá, **có trừ kho không** |
| M6 | Bếp & định tuyến | SỐNG/NƯỚNG/LINH HOẠT, trạm hai nhánh, thời gian chuẩn, kênh hiển thị; **bảng xem trước định tuyến**: chọn thử bàn để thấy món chạy về đâu |
| M7 | Nguyên liệu | Mã · ĐVT cơ sở/mua · quy đổi · giá bình quân · NCC · tồn · món đang dùng |
| M8 | Bán thành phẩm | Công thức sốt/nước dùng/kim chi, sản lượng đầu ra để tính giá vốn/ml |
| M9 | Lịch sử phiên bản công thức | Ai sửa, giá vốn đổi bao nhiêu, so sánh 2 bản |
| M10 | **Cây danh mục** | Kéo thả, không giới hạn cấp; tên 3 ngôn ngữ, ảnh bìa, kênh hiển thị; đổi danh mục **không** ảnh hưởng định tuyến bếp |
| M11 | **Set & Combo** | Nhóm lựa chọn ("chọn 4 trong 10"), món cố định, giá set, kênh, chi nhánh, lịch bán; hiện **dải giá vốn min–max** và food cost tương ứng |

## 25. SORA OFFICE — Kho (12 màn) & Kinh doanh (15 màn)

### Kho

S1 Tổng quan (giá trị tồn · dưới định mức · lô sắp hết hạn · hao hụt tháng) · S2 Tồn kho (thanh mức tồn theo thang than hồng) · S3 Nhà cung cấp · S4 Đơn đặt hàng PO (gợi ý theo tốc độ tiêu thụ 14 ngày) · S5 Nhập kho theo lô (số lô, HSD, nhiệt độ, ảnh chứng từ, cảnh báo lệch giá) · S6 Xuất kho 4 loại (bán tự động · huỷ có lý do+ảnh · nội bộ · chuyển) · S7 **Sản xuất nội bộ** (pha sốt, ninh nước dùng, **pha lóc thịt**: 1 tảng bò 12kg → nầm 2,1kg + dẻ sườn 3,4kg + hao 0,8kg — bắt buộc với quán nướng, và **đục keg bia**: chuyển keg nguyên → keg đang mở) · S8 Kiểm kê trên tablet, duyệt trước khi chốt · S9 Lô & hạn dùng FEFO + **loại lô `keg đang mở` đồng hồ 5–7 ngày** · S10 Chuyển kho giữa chi nhánh, xác nhận hai đầu · S11 **Báo cáo hao hụt**: tiêu hao công thức vs thực tế — gồm mục riêng cho bia tươi (rót lý thuyết vs keg thực dùng) · S12 Thẻ kho từng mặt hàng.

Ba quyết định nghiệp vụ giữ nguyên: giá bình quân gia quyền di động · trừ kho khi bếp bấm Xong · bắt buộc lô với hải sản sống, thịt bò, keg; tuỳ chọn với đồ khô.

### Kinh doanh — quy tắc mới: mọi báo cáo đều so sánh được chu kỳ

**Quy tắc xuyên suốt:** đầu mỗi màn báo cáo có **PeriodComparator** — chọn kỳ (ngày/tuần/tháng/quý/tuỳ chọn) và mốc so sánh (kỳ liền trước / cùng kỳ tuần trước / cùng kỳ năm trước). Mọi con số đi kèm chip chênh lệch ▲▼ (matcha/aka) và sparkline 30 điểm. Có thêm nút *So sánh chi nhánh* mở chế độ small-multiples: mỗi chi nhánh một biểu đồ nhỏ cùng thang đo — không gộp thành một số tổng.

| # | Màn hình | Nội dung |
|---|---|---|
| B1 | Hôm nay | Doanh thu · khách · BQ/khách · food cost; mỗi ô kèm so hôm qua **và** cùng thứ tuần trước; biểu đồ theo giờ chồng mờ đường cùng kỳ; cảnh báo kho |
| B2 | Doanh thu | Theo ngày/khung giờ/khu/hình thức/kênh (tại bàn vs online) — mọi lát cắt đều so kỳ |
| B3 | Phân tích món | Ma trận Ngôi sao / Bò sữa / Câu đố / Bỏ đi + hành động gợi ý; có trục thời gian xem món dịch chuyển giữa các ô qua các kỳ |
| B4 | Giá vốn & lãi gộp | Food cost theo ngày vs mục tiêu; đóng góp lãi gộp theo nhóm; so kỳ |
| B5 | Hiệu suất bếp | Thời gian gửi→xong theo trạm/khung giờ, tỉ lệ trễ SLA, món hay trễ; **tách hai kênh tại bàn / online** |
| B6 | Vòng quay bàn | Thời gian ngồi, lượt/bàn/ngày |
| B7 | Nhân sự | Doanh thu theo phục vụ, số huỷ, số lần cần duyệt |
| B8 | Khuyến mãi & set | Hiệu quả chương trình, tác động BQ/khách; food cost set theo lựa chọn thật |
| B9 | Online & đặt bàn | Đơn online theo giờ, tỉ lệ huỷ, thời gian giao; tỉ lệ no-show đặt bàn |
| B10 | Trung tâm báo cáo | Đặt lịch email, xuất Excel/PDF |
| B11 | **Khuyến mãi & voucher** | Nơi TẠO chương trình (P10 có ô voucher mà trước đây chưa có nơi tạo): loại (% · số tiền · tặng món · giá set khung giờ) · điều kiện (kênh, chi nhánh, ngày giờ, đơn tối thiểu) · lô mã voucher + giới hạn lượt · lịch chạy. **Quy tắc chồng: không cộng dồn, tự áp mức lợi nhất cho khách.** R9 soạn, R11/R10 kích hoạt; hiệu quả đo ở B8. |
| B12 | **Sổ khách** | Hồ sơ khách hợp nhất theo SĐT, gom tự động từ đặt bàn + đơn online + hoá đơn: lịch sử đến, chi tiêu, món hay gọi, **dị ứng**, số lần no-show, ghi chú phục vụ. Tab **Điểm & hạng**: số dư, lịch sử tích/tiêu, hạng hiện tại, quyền lợi. SĐT che 3 số giữa với vai trò không cần thấy. |
| B13 | **Phản hồi khách** | Nguồn: khối đánh giá 1 chạm T15/O7 (sao + nhận xét + món trong bill). Hàng đợi xử lý khiếu nại: gán người, trạng thái, hạn phản hồi. Điểm trung bình theo chi nhánh/ca/món nối vào B1. |
| B14 | **Tích điểm & hạng thành viên** | Cấu hình: tỷ lệ tích (điểm trên ₫ thực trả) · tỷ lệ quy đổi điểm → giảm giá · trần đổi mỗi giao dịch · hạn điểm 12 tháng · 3 hạng theo chi tiêu 12 tháng trượt + quyền lợi hạng (ưu tiên phòng riêng, ưu đãi sinh nhật). **Điểm chỉ sinh từ sự kiện `thanh-toan.nhan`** — không có nút cộng tay; huỷ/hoàn bill tự thu hồi điểm; điều chỉnh thủ công chỉ R11 kèm lý do. Giá trị số nằm ở Trung tâm tham số. |
| B15 | **Khách doanh nghiệp** | Hồ sơ: tên công ty, MST, người liên hệ, **hạn mức nợ**, điều khoản thanh toán (NET 15/30), kỳ đối soát. Tuổi nợ 0–30 / 31–60 / trên 60 ngày; quá hạn quá N ngày (tham số) → **tự chặn ghi nợ mới tại POS**. Cuối kỳ xuất bảng kê PDF gửi email công ty; tiền về khớp ở F1 → gạch nợ ở F5. |

## 26. SORA OFFICE — Nhân sự (10 màn, mới)

**Dòng chảy chuẩn, mỗi bước khoá bước trước: Lịch → Công → Lương → Chi → Sổ.** Máy tự nối các bước; người chỉ can thiệp bằng thao tác có duyệt.

| # | Màn hình | Nội dung |
|---|---|---|
| H1 | Hồ sơ nhân viên | Mẫu DS + CT: vị trí, chi nhánh chính (làm nhiều chi nhánh được), loại trả lương (theo giờ / theo tháng), đơn giá hoặc lương cơ bản, phụ cấp cố định, ngày vào, giấy tờ, tài khoản nhận lương, trạng thái. Gắn 1-1 với tài khoản đăng nhập A1. |
| H2 | Xếp lịch tuần | Mẫu LỊCH: cột ngày × hàng nhân viên; kéo thả **ca mẫu** (Sáng 8–16 · Chiều 15–23 · Gãy...); tô đỏ khung thiếu người so với dự báo lượt khách (dữ liệu B6); nút *Sao chép tuần trước*; **Công bố lịch** → đẩy Kênh nhân viên + Zalo. Lịch chưa công bố = nháp, nhân viên không thấy. |
| H3 | Chấm công hôm nay | Bảng realtime theo chi nhánh: ai đã vào ca (giờ chấm), đi muộn (chênh so lịch, kohaku), chưa đến (aka), đang tăng ca. Nguồn: kiosk H10. Người có phiên đăng nhập POS/KDS mà chưa chấm công → nhắc trên màn này. |
| H4 | Bảng công tháng | Mẫu DS: mỗi người một hàng — giờ công · tăng ca (tách ngày thường/ngày nghỉ/lễ) · đi muộn · nghỉ có phép/không phép. Sửa tay bắt buộc chọn lý do và ghi nhật ký (R7 cần duyệt, R13 trực tiếp). |
| H5 | Yêu cầu nghỉ & đổi ca | Hàng đợi duyệt: nghỉ phép (loại phép, số ngày còn) · đổi ca (A đề nghị, B nhận, quản lý duyệt cả cặp). Duyệt xong lịch H2 và công H4 tự cập nhật. |
| H6 | Cơ chế lương & thưởng | Mẫu CH: đơn giá giờ theo vị trí; hệ số tăng ca **150% ngày thường · 200% ngày nghỉ · 300% ngày lễ** (theo luật lao động — kế toán xác nhận); phụ cấp (ăn ca theo ca làm, trách nhiệm, xăng xe); **quy tắc thưởng**: đạt % chỉ tiêu doanh thu chi nhánh → thưởng % quỹ hoặc số cố định chia theo giờ công, thưởng nóng nhập tay kèm lý do; khấu trừ: BHXH/BHYT/BHTN phần người lao động, thuế TNCN tạm khấu trừ, tạm ứng. **Kỳ lương, ngày chốt công, ngày phát lương** cấu hình tại đây (giá trị nằm trong Trung tâm tham số 29.1 — H6 là cửa vào theo ngữ cảnh). **Lưu ý pháp lý: đi muộn trừ theo giờ không làm việc, không cấu hình "phạt tiền"** — luật lao động VN không cho phạt tiền người lao động. |
| H7 | Kỳ lương | Mẫu WZ 5 bước: **Chốt công** (sau chốt không sửa — sai thì bút toán công kỳ sau) → **Tính nháp** (bảng từng người: công × đơn giá + tăng ca theo hệ số + phụ cấp + thưởng − bảo hiểm − TNCN − tạm ứng = **thực lãnh**, mỗi dòng bấm xuống được chi tiết) → **Trình duyệt** (R13 trình, R8 kiểm, R10 duyệt) → **Phát lương**: xuất file hoặc gọi **API Chi lương VietinBank** (một nợ nhiều có — có sẵn trên cổng Open API, cùng hợp đồng với thanh toán), trạng thái từng người → **Phát phiếu lương** tự động qua Kênh nhân viên/Zalo. Chốt kỳ xong: tổng chi lương **tự sinh bút toán chi phí khoản mục Nhân sự** theo chi nhánh (người làm nhiều chi nhánh phân bổ theo giờ công) — không ai nhập tay lần hai. |
| H8 | Kênh nhân viên — Lịch & công của tôi | Mobile (khung khách, nền tối), vào bằng link cá nhân + PIN: lịch tuần của mình, bảng công tháng, nút gửi yêu cầu nghỉ/đổi ca (đổ về H5). |
| H9 | Kênh nhân viên — Phiếu lương | Phiếu lương từng kỳ: các dòng cộng/trừ rõ ràng, thực lãnh mono lớn; chỉ chính chủ xem được. |
| H10 | Kiosk chấm công | Tablet gắn cố định tại chi nhánh, chế độ toàn màn: bàn phím PIN lớn + (tuỳ chọn bật) chụp ảnh lúc chấm; hiện "Chào Hoa · Vào ca 15:02 · lịch 15:00". Thiết bị gắn chi nhánh — không chấm từ ngoài. |

**Chống gian lận chấm công:** PIN + ảnh chụp thời điểm chấm (bật/tắt ở A6) · kiosk gắn cứng chi nhánh · đối chiếu chéo với phiên đăng nhập POS/KDS (có làm mà không chấm → nhắc; có chấm mà không có hoạt động → cảnh báo trên H3).

## 27. SORA OFFICE — Chi phí & tài sản (6 màn, mới)

**Nguyên tắc: máy tự ghi mọi khoản máy biết, người chỉ nhập khoản máy không biết.** Tự động: giá vốn hàng bán (tiêu hao kho S11) · chi nhân sự (kỳ lương H7) · khấu hao (C4) · phí thanh toán. Nhập tay: thuê nhà, điện nước, sửa chữa, marketing, chi vặt.

| # | Màn hình | Nội dung |
|---|---|---|
| C1 | Tổng quan chi phí | Mẫu BĐK: tổng chi kỳ + cơ cấu theo khoản mục (thanh ngang, % doanh thu từng khoản) + so kỳ trước/cùng kỳ + top biến động bất thường + phiếu định kỳ sắp đến hạn + khoản vượt ngân sách (aka). |
| C2 | Sổ phiếu chi | Mẫu DS + drawer ghi nhanh: ngày · chi nhánh · **khoản mục (bắt buộc, chọn từ cây C6)** · nhà cung cấp · số tiền · VAT đầu vào (nếu có hoá đơn) · hình thức (tiền mặt quỹ / chuyển khoản) · **loại đặc biệt: tạm ứng nhân viên** (chọn người → tự đổ vào khấu trừ kỳ lương H7) · **kỳ phân bổ** · ảnh chứng từ · trạng thái duyệt. Trả trước nhiều kỳ (VD 6 tháng tiền nhà): tiền ra một lần ở sổ quỹ, **chi phí chia đều 6 tháng trên Lãi/Lỗ** — hệ thống tự chia khi chọn kỳ phân bổ. Chi tiền mặt tự trừ sổ quỹ F1, khớp kiểm quỹ P14. |
| C3 | Chi phí định kỳ | Mẫu DS: thuê nhà · điện nước · internet · phần mềm · bảo trì...: chu kỳ, ngày sinh, số tiền dự kiến; hằng tháng **tự sinh phiếu chi nháp** + nhắc trên C1 — chống bỏ sót là chống ở đây. Điện nước biến động: phiếu nháp chờ điền số thật. |
| C4 | Tài sản & khấu hao | Mẫu DS + CT: mua thiết bị ≥ ngưỡng tài sản (cấu hình, gợi ý 5 triệu) ghi thành tài sản — nguyên giá · ngày dùng · số tháng khấu hao (đường thẳng) · chi nhánh; **khấu hao tháng tự sinh bút toán chi phí**, không nhập tay; thanh lý/hỏng có luồng riêng. Sửa chữa nhỏ dưới ngưỡng vào chi phí ngay ở C2. Danh mục thiết bị Phụ lục C khi mua thật sẽ nhập vào đây. Tab **Bảo trì**: mỗi tài sản có lịch chu kỳ (30/90/180 ngày) + checklist ngắn + đơn vị bảo trì; đến hạn tự sinh việc vào hàng đợi + nhắc trên C1; hoàn thành ghi ngày/người/ảnh và **tự tạo phiếu chi** khoản mục sửa chữa; nút *Báo hỏng* tạo việc đột xuất. |
| C5 | Hoá đơn đầu vào | Mẫu DS: hoá đơn VAT đầu vào gắn với phiếu chi/PO — số HĐ, MST người bán, tiền trước thuế, **VAT được khấu trừ**; cảnh báo phiếu chi lớn thiếu hoá đơn đầu vào (mất quyền khấu trừ). Nguồn cho F4. |
| C6 | Khoản mục & ngân sách | Cây khoản mục sửa được, mặc định chuẩn F&B: Giá vốn hàng bán (tự động) · Nhân sự (tự động) · Mặt bằng · Tiện ích (điện, nước, gas, internet) · Thiết bị & khấu hao · Marketing · Phí thanh toán · Vận hành khác · Thuế & phí. Ngân sách tháng theo khoản mục × chi nhánh. **Quy tắc phân bổ chi phí chung cấp chuỗi** về chi nhánh: theo doanh thu kỳ / chia đều / tỷ lệ tay. |

**Duyệt theo ngưỡng (cấu hình ở A6):** ≤ hạn mức chi vặt (gợi ý 2 triệu) — thu ngân/quản lý ca tự ghi, kế toán hậu kiểm · trên hạn mức — kế toán duyệt · mức lớn hoặc mua tài sản — chủ duyệt.

## 28. SORA OFFICE — Kế toán (7 màn)

Mục tiêu không đổi: mọi đồng tiền có chứng từ, mọi chứng từ truy được về gốc, kỳ đã khoá thì không ai sửa. Bổ sung: chi phí và lương đổ về đây để ra **Lãi/Lỗ toàn diện**.

| # | Màn hình | Nội dung |
|---|---|---|
| F1 | Sổ quỹ & đối soát ngân hàng | Tiền mặt: đầu ca → thu → **chi (phiếu chi tiền mặt từ C2)** → cuối ca, khớp kiểm quỹ P14. **Phiếu thu khác** (ngoài bán hàng: thanh lý, bồi thường, thu hộ...) ghi tại đây → đổ vào F2 và dòng Doanh thu khác của F7. Chuyển khoản: từng giao dịch VA khớp bill; nút *Đối chiếu sao kê* qua API vấn tin. |
| F2 | Nhật ký doanh thu & điều chỉnh | Sổ bất biến: bán, giảm giá, tặng, huỷ, hoàn — kèm người thao tác, người duyệt, lý do. Chỉ đọc. |
| F3 | Sổ hoá đơn điện tử | Phát hành, trạng thái cơ quan thuế, hàng đợi lỗi + phát hành lại, luồng huỷ/thay thế/điều chỉnh có duyệt. |
| F4 | Báo cáo thuế | **VAT đầu ra** (từ HĐĐT bán) **− VAT đầu vào** (từ C5) **= VAT phải nộp** · doanh thu theo thuế suất · **TNCN đã khấu trừ** (từ kỳ lương H7) · xuất bảng kê theo kỳ. Đối chiếu tổng HĐĐT vs doanh thu hệ thống — lệch là đỏ. |
| F5 | Công nợ (hai chiều) | **Tab Phải trả NCC:** từ PO/nhập kho và phiếu chi → hạn trả → lịch trả tuần. **Tab Phải thu khách DN:** từ bill ghi nợ (B15) → tuổi nợ → nhắc nợ → gạch nợ khi tiền về F1. |
| F6 | Khoá sổ & xuất kế toán | Khoá kỳ theo tháng × chi nhánh: sau khoá chặn sửa **cả doanh thu, phiếu chi, bảng công, kỳ lương** kỳ đó — chỉ tạo bút toán điều chỉnh kỳ sau. Xuất chuẩn MISA/Excel. |
| F7 | **Báo cáo Lãi/Lỗ (P&L)** | Bảng tài chính hợp nhất tự động — **không nhập tay dòng nào**: Doanh thu bán hàng − giảm giá/hoàn + doanh thu khác = **Doanh thu thuần** → − Giá vốn hàng bán (kho) = **Lãi gộp %** → − Nhân sự (H7) − Mặt bằng − Tiện ích − Khấu hao (C4) − Marketing − Phí thanh toán − Vận hành khác − Phân bổ chi phí chuỗi = **Lợi nhuận hoạt động** → − Thuế = **Lợi nhuận ròng**. Kèm chỉ số sống còn F&B: **Prime cost = Giá vốn + Nhân sự**, cảnh báo khi > 60% doanh thu. Mọi dòng **bấm xuống được chứng từ gốc** (drill-down: dòng Tiện ích → danh sách phiếu chi điện nước). PeriodComparator + so chi nhánh small multiples. Hai chế độ xem: **dồn tích** (chi phí theo kỳ phân bổ — mặc định, đúng cho đánh giá lợi nhuận) và **dòng tiền** (theo tiền ra thực, đối chiếu F1). Xuất Excel. |

## 29. SORA OFFICE — Quản trị (13 màn — nhận thêm O10, O11, R3 từ luồng online)

A1 Tài khoản (vai trò, chi nhánh được phân) · A2 Vai trò & quyền (ma trận 4.2 dựng thành giao diện; mỗi vai trò có tab **Hạn mức & phạm vi**: giảm giá tối đa, hạn mức chi vặt, chi nhánh được phân) · A3 Khu vực & bàn (kéo thả; mỗi bàn khai **loại chỗ: bàn thường / bàn nướng có bếp / phòng riêng** + sức chứa tối thiểu–tối đa + loại bếp than/gas/điện; phòng riêng mặc định đặt đích danh theo 23.5; khu đặt giá trị mặc định, bàn ghi đè; sinh + in QR từng bàn) · A4 Thiết bị (tablet/KDS ghép trạm, ngắt từ xa) · A5 Máy in (bill/tem, gán trạm, mẫu in) · A6 **Trung tâm tham số** — một nơi cho mọi thông số lưu động của hệ thống, thiết kế ở 29.1 · A7 Nhật ký thao tác (mọi hành động nhạy cảm; nhật ký định tuyến) · A8 CMS website · A9 Hoá đơn điện tử (MST, ký hiệu, nhà cung cấp, chứng thư số, công tắc theo chi nhánh — sổ phát hành nằm ở F3) · A10 Chi nhánh (pháp lý; **thông tin liên hệ đầy đủ: địa chỉ, SĐT, email, giờ mở từng ngày, mạng xã hội, toạ độ bản đồ** — tự đổ ra W5, W9, footer website và chân hoá đơn, sửa một chỗ mọi nơi đổi; tài khoản ngân hàng + dải VA; kho gắn kèm; **Page riêng của chi nhánh** + trạng thái webhook; bật/tắt hoạt động; **checklist mở chi nhánh mới**: tài khoản ngân hàng → địa điểm kinh doanh thuế → ký hiệu HĐĐT → Page → thiết bị).

### 29.1 A6 — Trung tâm tham số

Trả lời trực tiếp yêu cầu "các thông số lưu động phải có nơi cài đặt". Mọi ngưỡng, hệ số, hạn mức rải rác trong hệ thống gom về **một sổ đăng ký tham số** duy nhất — engine đọc lúc chạy, sửa không cần triển khai lại (đúng triết lý Mục 6.3).

Mỗi tham số có: mã · tên · giá trị · đơn vị · **phạm vi** (cấp chuỗi, chi nhánh ghi đè được hay không) · người sửa cuối · lịch sử thay đổi. Có ô tìm kiếm; tham số nhạy cảm (hệ số tăng ca, ngưỡng duyệt, tài khoản nhận tiền) đổi phải nhập 2FA và ghi nhật ký A7.

| Nhóm | Tham số khởi điểm |
|---|---|
| Bán hàng & thuế | Thuế suất · phí phục vụ · quy tắc làm tròn |
| Thanh toán tại bàn | Bật/tắt theo khu · ngưỡng chấp nhận lệch · ngưỡng chuyển xác nhận tay |
| Đặt bàn | Giữ chỗ mềm 10 phút · giữ bàn 15 phút · thời lượng bữa theo số khách · lịch nhắc 24h/2h |
| Online | Trần đơn mỗi khung 15 phút · giờ ngừng nhận · đơn giao tối thiểu |
| Bếp & SLA | Thời gian chuẩn mặc định theo trạm · ngưỡng cảnh báo than hồng |
| Nhân sự | **Hệ số tăng ca 150/200/300%** · **ngày chốt công** · **ngày phát lương** · kỳ lương (tháng/nửa tháng) · tỷ lệ BHXH/BHYT/BHTN · bật/tắt ảnh khi chấm công |
| Chi phí | **Hạn mức chi vặt** · **ngưỡng ghi nhận tài sản** · **ngưỡng chủ duyệt** · ngưỡng food cost xanh/vàng/đỏ |
| Vai trò | Giảm giá tối đa theo vai trò · hạn mức duyệt theo vai trò (đồng bộ tab A2) |
| Tích điểm | Tỷ lệ tích · tỷ lệ quy đổi · trần đổi mỗi giao dịch · hạn điểm · ngưỡng ba hạng |
| Công nợ DN | Hạn mức nợ mặc định · số ngày quá hạn thì chặn ghi nợ · chế độ xuất HĐĐT (từng bill / gộp) |
| Bảo trì | Chu kỳ mặc định theo nhóm thiết bị · nhắc trước N ngày |

H6 (cơ chế lương) và các màn cấu hình khác là **cửa vào theo ngữ cảnh** của cùng bộ tham số — sửa ở đâu cũng là sửa một chỗ.

---

# PHẦN E — TÍCH HỢP NGOÀI

## 30.1 VietinBank Open API — phương án đa chi nhánh

VietinBank có cổng Open API tự phục vụ (developer.vietinbank.vn): đăng ký doanh nghiệp trực tuyến, sandbox kiểm thử ngay trên trình duyệt, danh mục sản phẩm gồm thông báo biến động số dư, quản lý tài khoản định danh (VA), vấn tin báo nợ báo có, thanh toán QR, và có hẳn gói ngành **Chuỗi bán lẻ** — đúng mô hình nhiều điểm bán. Tài liệu hướng dẫn: file UserGuide trên portal, đọc được sau khi đăng ký tài khoản developer.

**Phương án theo cấu trúc pháp nhân** — đây là lý do câu hỏi "một hay nhiều pháp nhân" phải trả lời trước:

| | PA-1: Một pháp nhân, mỗi chi nhánh một tài khoản (khuyến nghị) | PA-2: Một pháp nhân, một tài khoản chung + dải VA theo chi nhánh | PA-3: Mỗi chi nhánh một pháp nhân |
|---|---|---|---|
| Hợp đồng API | 1 | 1 | Mỗi MST một đăng ký |
| Nhận diện chi nhánh | Theo tài khoản nhận | Theo prefix VA (VD `B01xxxx`) | Theo credential |
| Sao kê | Tách sẵn theo chi nhánh → F1 đối soát sạch | Trộn chung, đối soát dựa hoàn toàn vào VA | Tách theo pháp nhân |
| Kế toán | Sạch nhất | Chấp nhận được nếu kế toán đồng ý | Bắt buộc tách sổ |
| Chi phí/thủ tục | Mở nhiều tài khoản | Nhẹ nhất | Nặng nhất |

**ĐÃ CHỐT — một pháp nhân, đi theo PA-1 kiểu tăng trưởng:** hôm nay 1 chi nhánh = 1 tài khoản thanh toán + dải VA của nó, một hợp đồng Open API. Quy tắc cứng khi mở chi nhánh mới: **mở thêm một tài khoản thanh toán cùng pháp nhân + dải VA riêng**, vẫn chung hợp đồng API. Vì sao không dồn một tài khoản rồi tách bằng prefix VA (PA-2): tiết kiệm chút phí tài khoản nhưng sao kê trộn khiến F1 và kế toán bóc tách thủ công mỗi ngày — đắt hơn nhiều lần. Hệ thống lưu cấu hình ngân hàng theo chi nhánh (A10) nên thêm chi nhánh chỉ là thêm bản ghi, không đổi màn hình.

**Kiến trúc kỹ thuật giữ nguyên từ v0.4:** mỗi lượt thanh toán sinh một VA nhúng vào VietQR → tiền vào VA nào là của bill đó, không phụ thuộc nội dung chuyển khoản. Webhook có xác thực chữ ký + idempotent theo mã giao dịch; poller vấn tin báo có mỗi 20 giây làm lớp dự phòng; nút của khách không đổi trạng thái bill; cuối ca đối chiếu sao kê (P14/F1).

**Checklist làm việc với VietinBank ở giai đoạn 0:** đăng ký developer + chạy sandbox VA và biến động số dư; hỏi: gói Chuỗi bán lẻ gồm gì · giới hạn số VA, VA dùng một lần hay tái sử dụng, thời gian hết hạn · phí giao dịch/duy trì · số webhook endpoint đăng ký được · phí mở nhiều tài khoản thanh toán.

## 30.2 Hoá đơn điện tử — phân tích chi phí & kết nối

**Bối cảnh pháp lý:** nhà hàng thuộc nhóm bắt buộc dùng HĐĐT khởi tạo từ máy tính tiền có kết nối cơ quan thuế (NĐ 254/2026/NĐ-CP, hiệu lực 01/7/2026); ký hiệu hoá đơn 6 ký tự có chữ **M**; nội dung tối thiểu: bên bán, hàng hoá, đơn giá, số lượng, giá thanh toán, thông tin người mua nếu yêu cầu. *Phần pháp lý cần kế toán xác nhận lại — tôi không phải chuyên gia thuế.*

**Mô hình chi phí:** ước 150 bill/ngày/chi nhánh × 30 ngày ≈ **4.500 HĐ/tháng/chi nhánh** (~54.000/năm). Ba chi nhánh ≈ 162.000 HĐ/năm. Ở khối lượng này, chênh 50đ/hoá đơn = chênh ~8 triệu/năm — nên đàm phán theo gói lớn, đừng mua gói lẻ.

**So sánh giá niêm yết công khai** *(giá tham khảo từ bảng giá công bố 2024–2025, thay đổi theo thời điểm — bắt buộc lấy báo giá theo khối lượng thật)*:

| Nhà cung cấp | Giá niêm yết gói nhỏ | Điểm mạnh với mô hình này |
|---|---|---|
| **Viettel S-Invoice** — ứng viên số 1 | ~143.000đ/300 HĐ (~477đ/HĐ, giảm mạnh theo gói lớn) | Rẻ nhất theo niêm yết; ký số HSM hàng loạt 10.000 HĐ/tháng; API tích hợp POS/SAP/Oracle; gửi HĐ qua email/SMS/Zalo; xuất HTKK/eTax |
| **MISA meInvoice** — ứng viên số 2 | ~450.000đ/300 HĐ | Hệ sinh thái mạnh nhất; nếu kế toán dùng MISA thì xuất F6 → MISA liền mạch; tài liệu API công khai |
| EasyInvoice (Softdreams) | gói ~325.000đ | Rẻ, có gói riêng cho máy tính tiền |
| MobiFone Invoice | ~270.000đ | Trung bình |
| VNPT / BKAV / FPT | tương đương nhóm giữa | Cân nhắc nếu có sẵn quan hệ |

**Khuyến nghị:** lấy báo giá khối lượng lớn từ **Viettel S-Invoice** và **MISA meInvoice**, quyết theo hai tiêu chí: (1) đơn giá ở mức 50.000–200.000 HĐ/năm, (2) chất lượng API môi trường test. Nếu kế toán chốt dùng phần mềm MISA thì cộng điểm mạnh cho meInvoice; nếu tối ưu chi phí thuần thì S-Invoice.

**Kiến trúc kết nối (không phụ thuộc nhà cung cấp):** hệ thống có **lớp trừu tượng hoá đơn** — một giao diện chung `phát hành / huỷ / thay thế / điều chỉnh / tra trạng thái`, mỗi nhà cung cấp là một adapter. Đổi nhà cung cấp = viết adapter mới, không đụng P11/T15/F3. Luồng phát hành: thanh toán xong → đẩy hàng đợi phát hành → gọi API ký số (HSM đặt phía nhà cung cấp để không phải cắm USB token từng máy) → nhận số HĐ + mã tra cứu → in QR lên bill + gửi T15. **Lỗi phát hành không được chặn khách ra về** — bill in trước, HĐ phát hành bù qua hàng đợi F3, ghi rõ SLA phát hành bù trong ngày.

**ĐÃ CHỐT:** một mã số thuế → **một hợp đồng HĐĐT duy nhất**, mỗi địa điểm kinh doanh một ký hiệu M riêng (A9). Trình tự khi mở chi nhánh: đăng ký địa điểm kinh doanh với cơ quan thuế → thêm ký hiệu → bật công tắc. Lưu ý kế toán xác nhận khi mở chi nhánh **khác tỉnh**: có thể phát sinh phân bổ thuế cho địa phương — không ảnh hưởng thiết kế, chỉ ảnh hưởng kê khai.

## 30.3 Gửi đơn vào Page — Facebook Messenger

Yêu cầu: đơn online đặt xong thì **gửi vào Page**. Thiết kế theo cách đúng chính sách Meta và tận dụng được hạ tầng Messenger sẵn có:

**Luồng chuẩn (khách chủ động — hợp lệ 100%):**
1. Mỗi chi nhánh khai báo Page ID ở A10 (một Page chung cho chuỗi cũng chạy — ref mang mã chi nhánh).
2. Khách đặt xong ở O7 → nút *Theo dõi đơn qua Messenger* = link `m.me/{page}?ref=DON_{maDon}`.
3. Khách bấm → mở Messenger với Page → webhook `messaging_referrals` trả về ref → hệ thống **ghép PSID với đơn** → bot gửi ngay tóm tắt đơn vào hội thoại. Từ lúc này đơn "nằm trong Page": nhân viên trực Page thấy và chat trực tiếp; O9 có nút mở thẳng hội thoại.
4. Cập nhật trạng thái (đã nhận → đang giao → hoàn tất) gửi qua message tag **POST_PURCHASE_UPDATE** — cơ chế hợp lệ để nhắn ngoài cửa sổ 24h cho cập nhật đơn hàng. Nhắc hẹn đặt bàn (R4) dùng tag **CONFIRMED_EVENT_UPDATE**.

**Điều kiện kỹ thuật:** app Facebook với quyền `pages_messaging` đã qua App Review, gắn vào Page; webhook nhận `messages` + `messaging_referrals` + `messaging_postbacks`. Ràng buộc nền tảng cần chấp nhận: **Page không thể chủ động nhắn người chưa từng tương tác** — vì vậy bước 2 là nút cho khách bấm, không phải hệ thống tự đẩy. Khách không bấm thì vẫn có link theo dõi web + SMS/Zalo, không mất gì.

**Kênh báo nội bộ (song song):** sự kiện `don-online.tao` bắn thông báo vào kênh trực của từng chi nhánh (khuyến nghị Zalo OA nhóm hoặc Telegram bot — Messenger không cho bot nhắn vào group chat qua API chính thức). Nhân viên nghe "ting" ở kênh chat quen thuộc, còn xử lý thì trên O8.

**Đặt bàn đi cùng đường với đơn online:** đặt thành công ở W6 → sự kiện `dat-ban.xac-nhan` bắn ngay vào **kênh trực của chi nhánh** (Zalo OA nhóm / Telegram) và hiện trên R1 + badge P13 — nhà hàng biết tức thời, không phụ thuộc khách. Song song, màn thành công W6 có nút *Nhận xác nhận & nhắc hẹn qua Messenger* = `m.me/{page}?ref=DATBAN_{ma}` → ghép hội thoại với đặt chỗ → bot gửi xác nhận vào Page ngay, nhắc 24h và 2h trước giờ hẹn bằng tag CONFIRMED_EVENT_UPDATE, khách xác nhận lại một chạm (đổ về R4). Đặt chỗ chế độ *duyệt tay* thì tin đầu ghi "đang chờ nhà hàng xác nhận", duyệt xong bot báo tiếp.

**ĐÃ CHỐT: mỗi chi nhánh một Page riêng**, khai ở A10. Một app Messenger duy nhất gắn vào tất cả Page — App Review làm một lần, thêm chi nhánh chỉ là gắn app vào Page mới + subscribe webhook; ref `DON_/DATBAN_` tự định tuyến về đúng chi nhánh theo Page nhận. Còn cần: quyền admin Business Manager và trạng thái App Review của app hiện có.

## 30.4 Thông báo đẩy khi chưa có app native

Chạy trình duyệt thuần thì thông báo giải quyết ba tầng: (1) **PWA + Web Push** cho thiết bị vận hành — tablet POS và máy điều phối là Android/desktop nên web push chạy ổn; cài PWA lên màn hình chính, O8 và P12 đăng ký push. iPhone cá nhân của nhân viên: web push chỉ chạy khi cài PWA lên màn hình chính (iOS 16.4+), hướng dẫn cài trong onboarding. (2) **Âm + rung tại chỗ**: O8/P12/KDS đang mở thì kêu trực tiếp, không cần push. (3) **Zalo/Telegram** cho shipper và thông báo ngoài ca. **App native: không nằm trong lộ trình** (quyết định: ship gọi thủ công, không cần kênh đẩy riêng cho shipper); ba tầng web là luồng chính thức — khe cắm tầng 1 vẫn chừa nếu sau này đổi ý.

---

# PHẦN F — TRIỂN KHAI

## 31. Tổng khối lượng — 139 màn hình

| Ứng dụng | Màn | Ưu tiên |
|---|---|---|
| Sora Web (gồm đặt món online O1–O7) | 20 | **P2** |
| Sora Table | 17 | **P1** |
| Sora POS (gồm điều phối O8/O9/O12 + đặt bàn R1/R2/R4) | 22 | **P1** |
| Sora Kitchen | 6 (×2 biến thể ST-02/ST-06) | **P1** |
| Office — Món, công thức, set | 11 | P2 |
| Office — Kho | 12 | P2 |
| Office — Kinh doanh & khách hàng | 15 | P3 |
| Office — Nhân sự | 10 | P2 |
| Office — Chi phí & tài sản | 6 | P2 |
| Office — Kế toán | 7 | P2 |
| Office — Quản trị (gồm O10, O11, R3) | 13 | P2 |
| **Tổng** | **139** | |

Cộng: 44 thành phần dùng chung × 2 chủ đề · 3 ngôn ngữ khối khách · bộ chọn chi nhánh xuyên suốt.

## 32. Lộ trình

| GĐ | Nội dung | Bàn giao | Thời lượng |
|---|---|---|---|
| 0 | Chốt pháp nhân · sandbox VietinBank (VA + biến động số dư) · báo giá S-Invoice & meInvoice · Page ID + App Review · lịch chụp ảnh món theo guideline PNG · duyệt bộ kanji | Đặc tả đã duyệt | 1 tuần |
| 1 | Design system, token, 44 component, 2 chủ đề, mẫu chọn chi nhánh + PeriodComparator | Thư viện Figma + token JSON | 2 tuần |
| 2 | Vòng vận hành: Table + POS + Kitchen (39 màn) | Wireframe → hi-fi → prototype | 5 tuần |
| 3 | Thử tại quán 1 ca thật 5 bàn | Báo cáo + bản sửa | 1 tuần |
| 4 | Back-office: Món + Kho + Kế toán + Quản trị (40 màn) | Hi-fi + đặc tả | 5 tuần |
| 4b | Nhân sự + Chi phí (16 màn) | Hi-fi + đặc tả | 2,5 tuần |
| 5 | Đặt món trên Web (7) + điều phối & đặt bàn POS (6) + cấu hình Office (3) | Hi-fi + prototype | 2,5 tuần |
| 6 | Kinh doanh & khách hàng + Sora Web (28 màn) | Hi-fi + bản dựng web | 4 tuần |
| 7 | Bàn giao: đặc tả tương tác, responsive, tài liệu lập trình | Bộ tài liệu | 1 tuần |

Tổng ≈ **24 tuần** một designer; GĐ 4–4b–5–6 song song với 2 designer → ≈ **17,5 tuần**.

**Thứ tự triển khai vận hành (khuyến nghị):** dựng và chạy thật **một chi nhánh** hết vòng P1+P2, ổn định 4–6 tuần, rồi mới nhân bản. Kiến trúc đa chi nhánh có sẵn từ ngày đầu, nhưng vận hành thì đi từng bước.

## 33. Rủi ro

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| VietinBank không cấp VA như kỳ vọng | **Cao** | Sandbox ngay GĐ 0; dự phòng khớp nội dung chuyển khoản đã thiết kế sẵn trong P15 |
| Phạm vi phình (đa chi nhánh + online + đặt bàn + kế toán) | **Cao** | Ưu tiên P1 trước; một chi nhánh chạy thật rồi mới nhân bản |
| Định tuyến động sai khi chuyển bàn / đổi cấu hình | **Cao** | Xem trước định tuyến M6; POS bắt xác nhận; nhật ký A7 |
| Đơn online vỡ công suất bếp cao điểm | **Cao** | Trần đơn/khung 15 phút (O11); KDS đếm ngược; theo dõi trễ hai kênh riêng (B5) |
| Chưa có ảnh món thật | Cao | Chốt lịch chụp GĐ 0; thiết kế đẹp cả khi chưa ảnh |
| 78 món nhiều, khách choáng | Cao | 6 set + tìm kiếm + gợi ý |
| Định lượng thịt cắt lóc thủ công | Cao | S7 pha lóc + cân điện tử ST-02 |
| Thất thoát bia tươi (rót lố, mời) | Trung bình | S11 mục riêng: rót lý thuyết vs keg thực; kiểm keg cuối ngày |
| HĐĐT lỗi giữa ca | Trung bình | Hàng đợi phát hành bù F3; không chặn khách ra về |
| Khách không bấm nút Messenger → Page không có đơn | Trung bình | Đơn vẫn đủ trên O8 + kênh trực Zalo/Telegram; Messenger là kênh cộng thêm, không phải đường độc đạo |
| No-show đặt bàn cao | Trung bình | Nhắc 24h + 2h (R4); cân nhắc bật cọc cho phòng riêng cuối tuần |
| Trùng bàn khi hai kênh cùng giành (web vs walk-in) | **Cao** | Một dịch vụ chỗ trống duy nhất + khoá giao dịch + giữ mềm 10 phút (23.5); cấm mọi màn tự tính khả dụng |
| Ảnh PNG tách nền chất lượng không đều (viền lem, sai góc chụp) | Trung bình | Guideline chụp theo nhóm (11.2); kiểm alpha + trim khi tải; plate chuẩn cứu được viền, không cứu được sai góc |
| Kỳ kế toán khoá nhưng có giao dịch trễ | Trung bình | F6 chỉ cho bút toán điều chỉnh kỳ sau, không mở lại kỳ |
| Chấm công hộ (buddy punching) | Trung bình | PIN + ảnh lúc chấm (tuỳ chọn) + kiosk gắn chi nhánh + đối chiếu phiên POS/KDS |
| Lương sai vì công sai | **Cao** | Chốt công trước khi tính; sau chốt chỉ bút toán kỳ sau; mọi sửa công có lý do + nhật ký |
| Chi phí ghi sót → Lãi/Lỗ ảo cao | **Cao** | Chi phí định kỳ tự sinh phiếu nháp + nhắc C1; đối chiếu sổ quỹ; danh sách khoản mục 0đ bất thường trong kỳ |
| Cấu hình lương trái luật lao động (phạt tiền, hệ số OT sai) | Trung bình | Mặc định 150/200/300%, không có trường "phạt tiền"; kế toán/pháp chế duyệt H6 trước khi chạy kỳ đầu |
| Khuyến mãi chồng chéo làm loạn giá | Trung bình | Không cộng dồn — áp mức lợi nhất; kích hoạt phải qua duyệt; B8 đo từng chương trình |
| Nợ xấu khách doanh nghiệp | Trung bình | Hạn mức + tự chặn khi quá hạn; tuổi nợ trên F5; ghi nợ luôn có duyệt + chữ ký |
| Gian lận điểm thành viên | Trung bình | Điểm chỉ sinh từ sự kiện thanh toán; điều chỉnh tay chỉ R11 kèm nhật ký; trần đổi mỗi giao dịch |
| Bếp bỏ KDS quay lại giấy | Trung bình | In tem song song 2 tuần đầu |
| Wifi yếu | Trung bình | Tách mạng vận hành khỏi wifi khách; menu <500KB; chặn thanh toán khi mất mạng |
| Font serif lỗi dấu Việt | Thấp | Kiểm tra tuần đầu GĐ 1 |

## 34. Việc còn lại trước go-live

1. Kế toán điền **giá trị tham số** vào Trung tâm tham số (29.1): tỷ lệ BHXH/BHYT/BHTN hiện hành, cách tạm khấu trừ TNCN, ngày chốt công & phát lương, ba hạn mức duyệt chi.
2. Cung cấp **quyền admin Business Manager** + trạng thái App Review; tạo Page cho chi nhánh đầu tiên nếu chưa có.
3. Khi ký VietinBank: xác nhận **cấp dải VA theo tài khoản** và biểu phí; chạy sandbox trước khi vẽ xong màn thanh toán.
4. Khi mở chi nhánh thứ hai: chạy checklist A10 — tài khoản ngân hàng mới → đăng ký địa điểm kinh doanh → ký hiệu HĐĐT → Page → thiết bị. Kế toán xác nhận phân bổ thuế nếu khác tỉnh.

---

# PHẦN G — PHÂN TÍCH ĐỘ PHỦ: MÔ HÌNH CÒN THIẾU GÌ

Soi hệ thống theo hai vòng đời: **vòng đời đồng tiền** (vào từ đâu, ra đi đâu, ai duyệt, sổ nào ghi) và **vòng đời khách hàng** (biết đến → đặt → ăn → trả tiền → quay lại). Kết quả: vòng tiền đã khép kín; vòng khách còn hở ba chỗ và đã vá trong bản này.

## G.1 Bổ sung đợt 1 — sổ khách, khuyến mãi, phản hồi, tham số

| Bổ sung | Vì sao thiếu là hổng |
|---|---|
| **Khuyến mãi & voucher (B11)** | P10 có ô nhập voucher nhưng toàn hệ thống chưa có nơi *tạo* voucher — tức là tính năng chết. Giờ có engine điều kiện + quy tắc không cộng dồn. |
| **Sổ khách (B12)** | Dữ liệu khách đã chảy qua đặt bàn, đơn online, hoá đơn nhưng không ai gom — mất trí nhớ về khách quen, dị ứng, no-show. Sổ khách gom tự động theo SĐT, là nền cho tích điểm sau này. |
| **Phản hồi khách (B13 + khối đánh giá T15/O7)** | Vòng khách kết thúc ở thanh toán mà không có tai nghe — món dở không ai biết cho tới khi vắng khách. |
| **Trung tâm tham số (29.1)** | Hơn 20 ngưỡng/hệ số rải trong tài liệu mà không có nhà — giờ một sổ đăng ký, có lịch sử, có 2FA cho tham số nhạy cảm. |
| **Khoản thu khác + tạm ứng nhân viên (F1/C2)** | Tiền vào ngoài bán hàng và tiền tạm ứng trước đây không có cửa ghi — P&L và kỳ lương sẽ lệch thực tế. |
| **Phòng riêng thành loại chỗ chính thức (A3)** | Trước chỉ là ghi chú; giờ là thuộc tính bàn với sức chứa min–max và quy tắc đặt đích danh. |
| **Thông tin liên hệ chi nhánh (A10)** | Địa chỉ/giờ/SĐT sửa một chỗ, tự đổ ra website, footer, chân hoá đơn. |

## G.2 Bổ sung đợt 2 — ba hạng mục nâng vào bản chốt (đã thiết kế)

| Hạng mục | Đã đưa vào đâu | Logic cốt lõi |
|---|---|---|
| **Tích điểm & hạng thành viên** | B14 cấu hình · B12 tab Điểm & hạng · P10 ô SĐT + nút Dùng điểm · T15 dòng điểm vừa tích · Trung tâm tham số nhóm Tích điểm | Điểm chỉ sinh từ sự kiện `thanh-toan.nhan` — không cộng tay được; huỷ bill tự thu hồi; hạng theo chi tiêu 12 tháng trượt; đổi điểm có trần mỗi giao dịch |
| **Công nợ khách doanh nghiệp** | B15 hồ sơ & hạn mức · P10 hình thức Ghi nợ công ty (duyệt + ký) · F5 tab Phải thu · F7 tách dồn tích/dòng tiền | Doanh thu ghi nhận ngay (dồn tích), tiền về mới vào dòng tiền; quá hạn N ngày tự chặn ghi nợ mới; bảng kê cuối kỳ gửi công ty; HĐĐT theo MST công ty — chế độ từng bill/gộp do kế toán chọn |
| **Bảo trì thiết bị định kỳ** | C4 tab Bảo trì · nhắc trên C1 · phiếu chi tự sinh khoản mục sửa chữa | Lịch chu kỳ theo tài sản; đến hạn sinh việc; hoàn thành là có chứng từ chi phí luôn — không ghi hai lần |

## G.3 Cố tình không làm — và vì sao

| Không làm | Lý do |
|---|---|
| **Kết nối API GrabFood/ShopeeFood/Be + app native thông báo đẩy** | **Quyết định vận hành của chủ đầu tư:** giao hàng gọi ship thủ công, không đấu nối hệ thống ngoài. O12 nhập tay là luồng chính thức; ba tầng thông báo web (30.4) là đủ. Khe cắm kỹ thuật vẫn chừa nếu mô hình đổi. |
| **Checklist ca & nhật ký nhiệt độ tủ** | **Quyết định của chủ đầu tư — không triển khai.** Kiến trúc sự kiện vẫn chừa chỗ nếu sau này quy định an toàn thực phẩm yêu cầu. |
| Sổ kế toán kép đầy đủ (định khoản, cân đối kế toán) | Xuất chuẩn sang MISA (F6) rẻ hơn, đúng chuẩn hơn và kế toán quen tay hơn tự xây ERP |
| Tuyển dụng, đào tạo, đánh giá nhân sự | Ngoài trọng tâm vận hành; W9 đăng tin tuyển là đủ giai đoạn này |
| Chấm công sinh trắc (vân tay/khuôn mặt) | Kiosk PIN + ảnh + đối chiếu phiên đủ chống gian lận ở quy mô này; sinh trắc kéo nghĩa vụ dữ liệu cá nhân nặng |
| Truy vết lô đến từng gói nhỏ (serial) | Mức lô + FEFO hiện tại đủ cho F&B; serial hoá làm thủ kho bỏ hệ thống |

## G.4 Khép kín dòng tiền — khung kiểm chứng đầy đủ

Mỗi dòng tiền phải đi qua đúng bốn trạm: **Ghi nhận → Duyệt → Sổ bất biến → Dòng P&L truy ngược được chứng từ.** Thiếu một trạm là có đường rò. Hai bảng dưới liệt kê toàn bộ dòng tiền của mô hình và bốn trạm của từng dòng — đây là bảng để kiểm thử nghiệm thu: đi từng hàng, chứng minh từng ô.

### Tiền vào

| Dòng | Ghi nhận ở | Duyệt / kiểm | Sổ | Đối soát | Lên P&L |
|---|---|---|---|---|---|
| Tiền mặt tại quầy | P10/P11 | Kiểm quỹ P14 mỗi ca | F2 | Quỹ đếm thực vs hệ thống | Doanh thu bán hàng |
| Chuyển khoản QR (VA) | T13/O6 — tự động | Không ai chạm: webhook + poller | F2 | F1 vs sao kê hằng ngày | Doanh thu bán hàng |
| Thẻ / ví | P10 | Báo có máy POS ngân hàng | F2 | F1 | Doanh thu bán hàng |
| Ghi nợ công ty | P10 hình thức 5 | R7 duyệt + chữ ký khách | F2 + sổ nợ F5 | Bảng kê cuối kỳ với công ty | Doanh thu (dồn tích) — tiền chưa về |
| COD đơn giao | P16/O8; shipper nộp khi về | Sổ COD theo shipper trên P16, bấm *Đã nhận* | F2 | Đơn hoàn tất vs tiền nộp từng shipper; chốt ở P14 | Doanh thu bán hàng |
| Thu khác | Phiếu thu F1 | R8 | F2 | Chứng từ đính kèm | Doanh thu khác |

### Tiền ra

| Dòng | Ghi nhận ở | Duyệt | Sổ | Đối soát | Lên P&L |
|---|---|---|---|---|---|
| Giá vốn (COGS) | Tự động khi bếp bấm Xong | Không nhập tay | Thẻ kho S12 | Kiểm kê tháng + hao hụt S11 | Giá vốn hàng bán |
| Lương & thưởng | Kỳ lương H7 | R13 trình → R8 kiểm → R10 duyệt | F2 | Bảng công đã chốt · lệnh chi ngân hàng | Chi phí nhân sự |
| Phiếu chi tay | C2 | Theo ngưỡng hai mức | F2 | Sổ quỹ F1 / sao kê | Khoản mục tương ứng, theo kỳ phân bổ |
| Chi định kỳ | C3 sinh nháp | Điền số thật + duyệt | F2 | Nhắc nếu tháng thiếu phiếu | Mặt bằng / tiện ích |
| Tạm ứng nhân viên | C2 loại tạm ứng | R8 | F2 | Tự khấu trừ kỳ lương H7 | **Không vào chi phí** — là phải thu nội bộ |
| Trả nợ NCC | F5 | R8 | F2 | Sao kê | **Không vào chi phí** — chi phí đã ghi khi nguyên liệu được dùng; chỉ hiện ở dòng tiền |
| Khấu hao | C4 tự sinh | Không ai chạm | F2 | Sổ tài sản | Chi phí khấu hao — **không phải tiền ra**, chỉ có ở chế độ dồn tích |

Ba dòng cuối là chỗ chủ quán hay nhầm nhất: **tạm ứng** và **trả nợ NCC** là tiền ra nhưng không phải chi phí; **khấu hao** là chi phí nhưng không phải tiền ra. F7 có hai chế độ xem dồn tích / dòng tiền chính là để nhìn đúng cả hai mặt — tháng nào "lãi trên giấy mà két rỗng" hay "két đầy mà thực ra đang lỗ" đều lộ ra ngay.

### Ba vòng đối soát định kỳ

1. **Mỗi ca (P14):** tiền mặt đếm vs hệ thống · COD vs đơn hoàn tất · giao dịch VA chưa gán = 0 mới đóng ca.
2. **Mỗi ngày (F1):** tổng chuyển khoản hệ thống vs sao kê VietinBank qua API vấn tin · phiếu chi tiền mặt vs sổ quỹ.
3. **Mỗi tháng:** chốt công → kỳ lương → kiểm kê kho (chênh vào hao hụt S11) → đối chiếu tổng HĐĐT vs doanh thu hệ thống (F4, lệch = đỏ) → gửi bảng kê công nợ DN → **khoá sổ F6**. Sau khoá, số liệu kỳ là bất biến.

### Chỗ dễ rò và chốt chặn tương ứng

| Kịch bản rò | Chốt chặn đã thiết kế |
|---|---|
| Thu tiền mặt không nhập máy | Bàn không đóng được nếu chưa thanh toán trên hệ thống; kiểm quỹ lệch hiện ngay P14 |
| Huỷ món/bill sau khi đã thu tiền | Huỷ sau thanh toán bị chặn — chỉ có luồng hoàn tiền có duyệt + bút toán ngược F2 |
| Giảm giá tay quá đà | Ngưỡng theo vai trò (A2) · giảm >10% cần duyệt · B7 thống kê giảm giá theo từng nhân viên |
| Bia tươi rót không ghi | S11 so rót lý thuyết vs keg thực dùng từng ngày; kiểm keg cuối ca |
| Ghi nợ công ty khống | Hạn mức + duyệt + chữ ký khách; quá hạn tự chặn; tuổi nợ phơi trên F5 |
| Chi khống, hoá đơn khống | Ảnh chứng từ bắt buộc · hậu kiểm R8 · cảnh báo phiếu chi lớn thiếu hoá đơn đầu vào (C5) |
| Tự cộng điểm, đổi điểm hộ | Điểm chỉ sinh từ sự kiện thanh toán · điều chỉnh tay chỉ R11 + nhật ký · trần đổi mỗi giao dịch |
| Sửa số liệu kỳ cũ | F6 khoá sổ chặn cứng; chỉ bút toán điều chỉnh kỳ sau |

### Phân tách nhiệm vụ — không ai tự duyệt việc của mình

Hệ thống chặn theo tài khoản đăng nhập, không dựa vào ý thức: người thu tiền không tự duyệt giảm giá lớn hay huỷ bill của chính mình; người ghi phiếu chi không phải người duyệt phiếu đó; người sửa công không tự duyệt công của mình; kỳ lương do R13 lập thì phần lương của chính R13 phải do R10 duyệt; marketing tạo khuyến mãi nhưng không tự kích hoạt được. Mọi cặp ghi–duyệt đều là hai người khác nhau, và cả hai đều nằm trong nhật ký A7.

---

# PHỤ LỤC C — THIẾT BỊ MỖI CHI NHÁNH (mua mới)

| Nhóm | Thiết bị | SL | Ghi chú |
|---|---|---|---|
| POS | Tablet 11" Android + đế xoay | 3–4 | 1/khu + dự phòng; **cùng một model cho mọi chi nhánh** |
| | Máy tính thu ngân + màn 22" (1920×1080) | 1 | Chạy **P16** — trạm thu ngân kiêm điều phối |
| | Két tiền mở bằng lệnh · máy POS thẻ | 1 · 1–2 | |
| Bếp | TV 32–43" + giá treo | 7 | 6 trạm + Expo |
| | Mini PC / Android box chạy KDS | 7 | Đặt xa hơi nước |
| | Cân điện tử có cổng kết nối | 1–2 | ST-02 — bắt buộc |
| In | Máy in bill nhiệt 80mm · in tem 58mm | 2 · 3–5 | |
| Kho | Máy quét mã vạch · tablet 10" kiểm kê | 1 · 1 | |
| Quầy bia | Tủ keg + vòi rót (2 vòi) · cân keg | 1 bộ | Phục vụ 2 món bia tươi; cân để ước keg đang mở khi kiểm kê |
| Mạng | Router + 3–4 AP, **tách VLAN vận hành / wifi khách** · UPS | 1 bộ · 1–2 | Chỗ hay bị bỏ qua nhất, gây treo POS cao điểm |
| Bàn | Bảng QR acrylic | 1/bàn | Mã riêng từng bàn |

---

*v2.1 — bản chốt. Phạm vi 139 màn, mô hình pháp lý – tài chính khép kín, không còn câu hỏi mở. Bắt đầu từ Giai đoạn 1 (design system) song song với 4 việc hành chính ở Mục 34, rồi vào wireframe 39 màn vòng vận hành.*
