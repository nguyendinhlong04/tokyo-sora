/**
 * "Máy này có đang ngồi trong quán không?" — lớp 2 của LUONG-QR-BAN.md.
 *
 * Bằng chứng là đường mạng: khách bắt Wi-Fi quán thì mọi request của họ đi ra
 * internet qua đúng đường truyền của quán, còn người ở nhà thì không. Không ai
 * chui được vào đường mạng của quán từ xa — đó là sự thật vật lý, không phải mật
 * khẩu để đoán.
 *
 * TOÀN BỘ độ tin cậy của lớp này nằm ở việc lấy ĐÚNG địa chỉ của khách. Xem
 * `clientIp` bên dưới trước khi sửa bất cứ thứ gì ở đây.
 */

/** Không có thông tin đáng tin → coi như KHÔNG chứng minh được (đóng chặt) */
export const UNKNOWN_IP = null

/**
 * Địa chỉ thật của máy khách, đọc qua các lớp trung chuyển.
 *
 * `x-forwarded-for` là một danh sách được mỗi chặng NỐI THÊM vào bên phải:
 *
 *     <khách tự khai> , <chặng 1 thấy>, <chặng 2 thấy>
 *      ^ giả được       ^ do chặng 1 ghi, tin được nếu tin chặng 1
 *
 * Phần bên trái do CHÍNH MÁY KHÁCH gửi lên nên bịa được. Người ngồi ở nhà chỉ
 * cần tự khai địa chỉ của quán là đi thẳng qua lớp 2 — và lớp 2 là tuyến chính
 * của cả thiết kế. Vì vậy KHÔNG BAO GIỜ lấy phần tử đầu danh sách.
 *
 * Cách đúng là đếm ngược từ bên phải đúng bằng số chặng trung chuyển thật:
 * phần tử thứ `hops` tính từ cuối là địa chỉ do chặng ngoài cùng ghi lại, thứ
 * mà máy khách không với tới được.
 *
 * `hops` phải ĐO trên bản triển khai thật, không được đoán. Đoán thiếu một chặng
 * là lấy trúng phần khách tự khai; đoán thừa là luôn lấy trúng địa chỉ của lớp
 * trung chuyển, cả quán thành một địa chỉ duy nhất và lớp 2 chết âm thầm — không
 * có lỗi nào báo ra ở cả hai trường hợp.
 */
export function clientIp(forwardedFor: string | undefined, hops: number): string | null {
  if (hops <= 0) return UNKNOWN_IP
  if (!forwardedFor) return UNKNOWN_IP

  const chain = forwardedFor
    .split(',')
    .map((part) => normalizeIp(part))
    .filter((part) => part.length > 0)

  // Chuỗi ngắn hơn số chặng đã khai = request không đi qua đúng đường dự kiến.
  // Có thể ai đó gọi thẳng vào API. Không đoán bừa, trả về không biết.
  if (chain.length < hops) return UNKNOWN_IP

  return chain[chain.length - hops] ?? UNKNOWN_IP
}

/**
 * Địa chỉ này có thuộc đường mạng của chi nhánh không.
 *
 * So khớp chính xác với danh sách đã khai ở tham số `table.branchNetworks`. Chưa
 * hỗ trợ dải CIDR: gần như mọi quán chỉ có một địa chỉ tĩnh, và một hàm so dải
 * viết vội là thứ dễ sai theo hướng nới rộng quyền.
 */
export function isInsideBranch(ip: string | null, allowed: readonly string[]): boolean {
  if (!ip || allowed.length === 0) return false
  const wanted = normalizeIp(ip)
  return allowed.some((entry) => normalizeIp(entry) === wanted)
}

/**
 * IPv6 phân biệt hoa thường và có dạng ánh xạ IPv4 (`::ffff:1.2.3.4`) — hai cách
 * viết của cùng một máy sẽ không khớp nhau nếu so thô.
 */
function normalizeIp(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7)
  return trimmed
}

/** Số chặng trung chuyển tin được. 0 = chưa đo → lớp 2 tắt, mọi máy phải xin duyệt. */
export function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS)
  return Number.isInteger(raw) && raw > 0 ? raw : 0
}
