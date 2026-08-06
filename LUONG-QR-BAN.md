# Luồng gọi món tại bàn bằng mã QR — bản mô tả thiết kế

Bản này mô tả luồng đã chốt. Chưa hiện thực hoá — hệ thống hiện tại chạy khác, xem
mục 8 để biết phần nào đã có và phần nào phải dựng mới.

## 1. Nguyên tắc

Câu hỏi mà hệ thống phải trả lời không phải *"máy này có được phép không"* mà là
**"máy này có đang ngồi ở bàn đó không"**.

Ba lớp trả lời câu đó, xếp từ rẻ tới đắt. Lớp sau chỉ chạy khi lớp trước không kết
luận được:

| Lớp | Chặn ai | Khách phải làm gì |
|---|---|---|
| 1 · Bàn phải đang mở | Người cầm mã của bữa đã qua | Không gì |
| 2 · Đang trên Wi-Fi quán | Người ở xa quán | Không gì |
| 3 · Chủ bàn duyệt | Người ở xa đã lọt lớp 2 | Chờ chủ bàn bấm Đồng ý |

## 2. Mã QR và trạng thái bàn

Mã QR **dán cố định** tại bàn, in một lần, không đổi. Nó chỉ mang ý nghĩa *"đây là
bàn A4"* — không phải bí mật, chụp được cũng không sao.

Mã chỉ sống khi **bàn đang mở**. Lễ tân mở bàn cho khách vừa ngồi xuống là mã bắt
đầu ăn; nhân viên đóng bàn sau khi dọn là mã chết, mọi máy đang gắn với bàn bị đẩy
ra.

Đây là lý do quét mã của một bàn trống không mở ra gì cả.

## 3. Trạng thái của một máy

Mỗi máy quét mã nằm ở đúng một trong bốn trạng thái:

- **Chờ duyệt** — đã quét, chưa chứng minh được có mặt, đang đợi người duyệt.
- **Đã vào** — gọi món được bình thường tới hết bữa.
- **Chủ bàn** — như "đã vào", cộng quyền duyệt máy khác.
- **Bị từ chối** — không vào được nữa trong bữa này.

Trạng thái xét **một lần lúc vào bàn**, không xét lại ở mỗi lần gọi món. Điện thoại
nhảy qua lại giữa Wi-Fi và mạng di động giữa bữa là chuyện thường; xét lại sẽ sinh
ra lỗi ngẫu nhiên không ai tái hiện được.

## 4. Máy đầu tiên — ai thành chủ bàn

Quyền chủ bàn **không** trao cho ai quét trước. Trao cho máy đầu tiên chứng minh
được mình đang ở trong quán:

- Đang trên Wi-Fi quán → vào thẳng, **thành chủ bàn**, không hỏi gì.
- Đang dùng mạng di động → **lễ tân xác nhận tại chỗ** rồi mới thành chủ bàn.

Lễ tân vừa mở bàn xong và đang đứng ngay đó, nên đây là khoảnh khắc rẻ nhất trong
cả bữa để xác nhận một điều gì đó.

> Không có bước này thì kẻ chụp trộm mã, quét trước khách thật, sẽ nắm quyền chủ
> bàn và từ chối chính những người đang ngồi ăn.

## 5. Máy tiếp theo

**Đang trên Wi-Fi quán** → vào thẳng. Không thông báo, không chờ, chủ bàn không bị
làm phiền.

**Đang dùng mạng di động** → màn hình hiện trước một lối thoát nhanh:

> Kết nối Wi-Fi **Tokyo Sora** để gọi món ngay
> — hoặc chờ người mở bàn đồng ý

Ai bấm sang Wi-Fi thì xong trong mười giây. Ai không muốn đổi mạng thì đi tiếp
xuống lớp 3.

## 6. Lớp 3 — chủ bàn duyệt

**Máy đang chờ** hiện màn chờ đơn giản:

> Đang chờ người mở bàn đồng ý…

**Máy chủ bàn** hiện lời hỏi kèm **bối cảnh**, rồi hai nút:

> Có người ở bàn bạn muốn cùng gọi món.
> _Bàn khai **4 khách**, hiện đã có **4 máy** đang gọi món._
>
> **Đồng ý**   **Từ chối**

Câu in nghiêng là phần quan trọng nhất của màn này. Một nút Đồng ý trơ trọi sẽ bị
bấm theo phản xạ — chủ bàn đang ngồi với ba người bạn cùng nghịch điện thoại, họ
không có căn cứ nào để nghi ngờ. Nhưng số khách thì **lễ tân đã nhập sẵn lúc mở
bàn**, nên đưa nó ra ở đây không tốn của khách một thao tác nào mà lại cho họ đúng
thứ họ đang thiếu: một dấu hiệu để biết chuyện này có bất thường không.

Máy thứ hai của bàn bốn người là bình thường. Máy thứ năm thì đáng dừng lại.

> **Giới hạn đã biết:** với hai nút, lớp này chỉ chặn được khi chủ bàn thật sự để
> ý. Nó KHÔNG phải lớp bảo vệ chính — lớp 2 mới là. Người ở xa quán không bao giờ
> tự vào thẳng được; họ chỉ có thể xin, và phải có người trong bàn bấm nhầm mới
> lọt. Đây là đánh đổi có chủ ý để giữ luồng đơn giản cho khách.

## 6b. Từ chối

Bị từ chối → máy đó hết đường tự xin trong bữa này, kể cả khi quét lại mã. Muốn
vào phải qua nhân viên.

Không có chốt này thì người ở nhà cứ xin lại liên tục cho tới khi chủ bàn bấm nhầm
một lần — và chủ bàn thì bị làm phiền suốt bữa.

## 7. Tình huống biên

**Chủ bàn không phản hồi.** Sau 45 giây, màn hình máy đang chờ đổi sang *"Nhờ nhân
viên mở giúp"*. Nhân viên duyệt thay, thấy đúng bối cảnh như chủ bàn thấy. Chủ bàn
đang gắp thịt hay vừa úp máy xuống bàn là chuyện thường, không thể để khách chờ mãi.

**Chủ bàn sắp rời đi.** Chuyển quyền chủ bàn cho một máy đã vào. Nếu họ quên và đã
rời đi, nhân viên duyệt thay như trên.

**Đóng bàn** → mọi máy bị đẩy ra, mọi yêu cầu đang chờ chết theo.

## 8. Đối chiếu với hệ thống hiện tại

**Đã có:**

- Lễ tân mở/đóng bàn, ghi số khách.
- Khách quét mã, xem thực đơn, gọi món, chia tiền, tự thanh toán.
- Mã vào bàn được xoá khỏi thanh địa chỉ ngay sau khi quét.
- Mỗi bàn chỉ có một lượt ăn đang mở tại một thời điểm.
- Khách chỉ đọc và thao tác được trên bàn của chính mình.

**Phải dựng mới:**

- Mã QR chuyển từ *sinh mỗi lượt ăn* sang *dán cố định theo bàn*.
- Phân biệt từng máy trong cùng một bàn — hiện tại cả bàn dùng chung một tấm vé,
  hệ thống không biết có mấy điện thoại đang nối vào.
- ~~Kiểm tra đường mạng để biết máy có đang ở trong quán không.~~ **Đã xong.**
  Đo trên bản triển khai thật ngày 06-08-2026: chuỗi chuyển tiếp luôn đúng một
  phần tử, và hai đường (qua `ban.tokyo-sora.vn` lẫn gọi thẳng vào API) cho kết
  quả y hệt — nên một giá trị dùng chung cho cả tám ứng dụng.

  Phát hiện quan trọng: **Vercel xoá hẳn phần địa chỉ do máy khách gửi lên rồi
  ghi lại bằng địa chỉ nó nhìn thấy.** Thử khai `203.0.113.99`, rồi thử khai cả
  chuỗi hai địa chỉ — đều bị vứt sạch. Trò giả mạo bị chặn từ tầng hạ tầng,
  trước khi chạm tới code. Lớp 2 vì thế chắc hơn dự kiến ban đầu.

  Cảnh báo còn nguyên giá trị cho tương lai: đặt thêm một lớp trung chuyển ở
  trước (Cloudflare) hoặc chuyển sang tự host là con số này sai, và **sai theo
  kiểu không báo lỗi gì**. Phải đo lại, sửa ở `TRUSTED_PROXY_HOPS`.
- Vai chủ bàn, chuyển quyền chủ bàn.
- Màn chờ duyệt của khách; màn hỏi duyệt kèm bối cảnh số khách ở cả máy chủ bàn
  lẫn máy nhân viên.
- Hàng chờ duyệt trên máy nhân viên.

**Điều kiện vận hành:** quán cần đường truyền có địa chỉ ổn định. Nếu địa chỉ đổi
theo thời gian thì hệ thống học lại được, nhưng phải tính tới từ đầu.

**Hệ quả cần biết:** mật khẩu Wi-Fi để ở đâu và có dễ vào không, từ nay là quyết
định ảnh hưởng tới an toàn chứ không còn là chuyện tiện nghi. Wi-Fi càng dễ vào
thì lớp 2 phủ càng rộng và lớp 3 càng ít phải chạy.
