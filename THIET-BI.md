# Cài đặt thiết bị tại quán

Tài liệu cho người lắp máy. Mỗi chi nhánh cần làm một lần khi mở quán, và làm lại
khi thay máy.

## Nguyên tắc chung

**Ghép máy là bước cấp quyền.** Không có mã ghép thì máy không đọc được gì của quán.
Mã 6 số do quản lý sinh trong Office, sống 10 phút và **dùng đúng một lần**.

**Máy mất thì thu hồi từ xa** — vào Office → A4 Thiết bị → Ngắt. Máy đó chết ngay
lập tức, kể cả khi đang mở app, vì mọi request đều kiểm lại quyền của thiết bị.

**Tách mạng vận hành khỏi wifi khách.** Đây là chỗ hay bị bỏ qua nhất và là nguyên
nhân số một khiến POS treo giờ cao điểm. Router phải có VLAN riêng cho máy POS, màn
bếp và máy in; khách dùng VLAN khác.

---

## Máy POS — tablet Android 11″

1. Mở Chrome, vào `https://pos.tokyosora.vn`.
2. Menu ⋮ → **Thêm vào màn hình chính**. Biểu tượng 空 xuất hiện trên desktop.
3. Mở app từ biểu tượng đó, **không mở từ Chrome** — mở từ biểu tượng mới chạy toàn
   màn hình, không có thanh địa chỉ chiếm chỗ.
4. Nhập mã ghép 6 số.
5. Cài đặt Android:
   - Màn hình → Thời gian chờ: **Không bao giờ** (máy cắm điện liên tục)
   - Màn hình → Tự xoay: **Tắt**, khoá ở chế độ ngang
   - Cài đặt → Ứng dụng → Chrome → Pin: **Không tối ưu hoá**

## Máy POS — máy thu ngân Windows 22″

Tạo lối tắt trên desktop:

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk https://pos.tokyosora.vn --edge-kiosk-type=fullscreen --no-first-run
```

Cho lối tắt này chạy cùng Windows: dán vào
`shell:startup` (Win+R → `shell:startup`).

Thoát kiosk bằng `Ctrl+Alt+Del` hoặc `Alt+F4` — chỉ quản lý mới nên biết.

## Màn bếp — Android TV box + TV 32–43″

Trình duyệt mặc định của TV box không tự khởi động lại khi treo và không giữ màn
sáng. Dùng **Fully Kiosk Browser** (bản miễn phí đủ dùng):

1. Cài Fully Kiosk Browser từ CH Play.
2. Settings → **Web Content** → Start URL: `https://kds.tokyosora.vn`
3. Settings → **Device Management**:
   - Keep Screen On: **Bật** — màn bếp không được tắt giữa ca
   - Screen Orientation: **Landscape**
4. Settings → **Advanced Web Settings**:
   - Enable Service Worker: **Bật** — thiếu cái này thì mất mạng là mất màn
5. Settings → **Kiosk Mode**: bật, đặt PIN thoát
6. Settings → **Auto Restart / Startup**: Launch on Boot **Bật**, Auto Reload on
   Crash **Bật**. Mất điện bật lại là màn tự lên, không cần ai chạm vào.
7. Mở app, nhập mã ghép 6 số của **đúng trạm** — mã do quản lý sinh riêng cho từng
   trạm, ghép nhầm là màn hiện vé của trạm khác.

### Hiệu chỉnh overscan

Nhiều TV cắt mất 3–5% mép hình. Sau khi ghép, nhìn màn hình:

- Nếu **không thấy đủ** dòng chữ trạm ở góc trái trên và nút "Ngắt ghép" ở góc phải
  trên → TV đang cắt mép.
- Vào cài đặt TV → Hình ảnh → **Kích thước hình / Aspect** → chọn `Just Scan`,
  `Screen Fit`, `1:1` hoặc `Full Pixel` (tên gọi khác nhau theo hãng).

Lưới vé được tính để **không cuộn**: quá số ô thì hiện "còn N vé nữa". Nếu TV cắt
mép thì vé hàng dưới biến mất mà không ai biết — nên bước này bắt buộc.

---

## Kiosk chấm công — tablet 10″ gắn cố định

Máy này đứng ở lối vào khu nhân viên, cắm điện liên tục, **không cầm đi đâu**: chi
nhánh được xác định bằng chính cái máy, nên một cái kiosk mang về nhà là một cái
kiosk chấm công hộ.

1. Mở Chrome, vào `https://chamcong.tokyosora.vn`.
2. Menu ⋮ → **Thêm vào màn hình chính**, rồi mở app từ biểu tượng đó — mở từ biểu
   tượng mới chạy toàn màn hình.
3. Nhập mã ghép 6 số loại **Kiosk chấm công** (quản lý sinh ở Office → A4 Thiết bị).
4. Cài đặt Android:
   - Màn hình → Thời gian chờ: **Không bao giờ**
   - Màn hình → Tự xoay: **Tắt**, khoá ngang
   - Nếu có giá đỡ khoá được: bật **Ghim ứng dụng** (Cài đặt → Bảo mật → Ghim ứng
     dụng) để không ai thoát ra trình duyệt
5. Treo hoặc bắt vít giá đỡ. Máy phải ở nơi có người qua lại nhìn thấy — camera
   giám sát của quán nên phủ được góc này.

**Không cần mạng dự phòng cho máy này.** Mất mạng thì kiosk báo "Mất mạng — gọi
quản lý, đừng bỏ ca chưa chấm" và quản lý ghi công tay ở H4 kèm lý do. Một lượt
chấm không tới được máy chủ thì không phải là một lượt chấm; cache lại để bấm cho
có sẽ khiến người ta yên tâm ra về với ca chưa được ghi.

**Ảnh chụp lúc chấm** (§26 nêu là tuỳ chọn bật ở A6) **chưa có trong bản dựng này**
— chưa có kho ảnh. Chống chấm hộ hiện dựa vào ba lớp còn lại: PIN riêng từng người,
máy gắn cứng chi nhánh, và đối chiếu chéo với phiên đăng nhập POS/KDS ở H3.

---

## Sau khi cài xong: bài kiểm 5 phút

Chạy đủ năm bước này trước khi bàn giao cho quán:

1. **Ghép máy** — mã dùng lần hai phải bị từ chối.
2. **Đăng nhập ca** bằng PIN trên máy POS; PIN đúng nhưng gõ ở máy chưa ghép phải
   không vào được.
3. **Gọi một món rồi GỬI BẾP** — vé phải hiện trên đúng màn trạm trong vài giây.
4. **Rút dây mạng máy POS**, gọi thêm món, cắm lại — món phải tự gửi lên, và
   **không được nhân đôi**. Thanh trên cùng phải báo "Mất mạng" trong lúc đó.
5. **Tắt nguồn màn bếp rồi bật lại khi chưa có mạng** — màn phải tự lên và hiện
   được giao diện (chưa có vé mới là đúng, vì vé đến từ máy chủ).

Bước 4 và 5 là hai bước hay bị bỏ qua nhất và cũng là hai bước quan trọng nhất —
chúng chứng minh quán vẫn chạy được khi mạng chập chờn.

---

## Cập nhật phần mềm

Không phải cài lại gì. Khi có bản mới:

- **Máy POS**: thanh trên cùng hiện "Có bản mới — bấm để cập nhật". Thu ngân bấm
  lúc rảnh tay. Cố tình không tự cập nhật vì reload giữa lúc đang nhập đơn là mất
  phiếu order đang dựng.
- **Màn bếp**: tự cập nhật khi hàng vé rỗng. Màn treo tường không có ai bấm nút,
  nhưng tải lại giữa lúc đang có vé thì đầu bếp mất chỗ đang nhìn.

## Máy in bill

Máy in nhiệt 80mm nối LAN. Máy chủ đặt trên cloud không với tới máy in trong quán
được, nên cần một tiến trình cầu nối chạy trên máy thu ngân
(`packages/print-bridge`, ghép như một thiết bị loại `bridge`). Chưa dựng ở giai
đoạn này — tạm thời in hoá đơn bằng chức năng in của trình duyệt.
