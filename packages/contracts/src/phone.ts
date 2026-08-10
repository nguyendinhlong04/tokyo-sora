/**
 * Số điện thoại khách — chuẩn hoá và kiểm CÚ PHÁP, không kiểm số có tồn tại.
 *
 * Cố ý không OTP: đặt bàn không phải mở tài khoản, mà suất `pending` thì lễ tân
 * gọi xác nhận và suất cần cọc thì gọi thu cọc — số sai lộ ra ở cuộc gọi đó,
 * không tốn một tin nhắn nào. Thứ chặn đặt bừa là tiền cọc, không phải OTP.
 *
 * Việc phải làm là bịt chỗ hở giữa hai tầng: W6 và API từng nhận mọi chuỗi 8–20
 * ký tự thuộc `[\d\s+.()-]`, trong khi CRM đòi 8–15 CHỮ SỐ mới ghi vào Sổ khách.
 * Số rác lọt qua thì suất vẫn tạo được, nhưng khách không vào Sổ và no-show của
 * họ không đếm được — hỏng mà không ai thấy.
 */

/** Đầu số di động đang phát hành (01xx đã bị thu hồi từ 2018). */
const MOBILE_PREFIX = /^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}$/

/**
 * Cố định: 11 chữ số kể cả số 0, luôn mở đầu `02`.
 *
 * Sau quy hoạch 2017 mã vùng dài 2 số (24 Hà Nội, 28 TP.HCM — kèm 8 số thuê
 * bao) hoặc 3 số (236 Đà Nẵng, 212 Sơn La — kèm 7 số), tổng lúc nào cũng ra 11.
 * Chính số của quán là `024 3782 4400`, đếm ra 11 — bắt 10 số là chặn luôn tổng
 * đài của mình.
 */
const LANDLINE = /^02\d{9}$/

/**
 * Về dạng lưu duy nhất: `0` + 9 số, hoặc `+` + 8–15 số với số ngoài Việt Nam.
 *
 * Quy `+84`/`84` về `0` chứ không giữ nguyên: CRM ghép lịch sử khách bằng chính
 * chuỗi này sau khi bỏ ký tự không phải số, nên cùng một người gõ `0912345678`
 * lần này và `+84912345678` lần sau sẽ thành hai bản ghi nếu không quy về một
 * dạng.
 *
 * Trả về chuỗi đã bỏ mọi khoảng trắng và dấu ngăn cách; KHÔNG hứa hợp lệ —
 * `isPhone` mới là chỗ phán.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  const plus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')

  // Có dấu `+` thì `84` chắc chắn là mã nước; không dấu thì chỉ coi là mã nước
  // khi phần còn lại dài đúng một số nội địa đã bỏ số 0 đầu — `0847123456` cũng
  // bắt đầu bằng 84 sau khi bỏ số 0, mà đó là số thật của khách.
  //
  // Quy trước rồi mới phán: `+84 90 123 456` thành `090123456` và trượt luật số
  // Việt Nam vì thiếu một chữ số, thay vì lọt qua cửa quốc tế.
  if (digits.startsWith('84') && (plus || digits.length === 11)) return `0${digits.slice(2)}`
  if (plus) return `+${digits}`
  return digits
}

/**
 * Di động Việt Nam 10 số, cố định 11 số, hoặc số quốc tế `+` kèm 8–15 số.
 *
 * Lối thoát quốc tế để đấy cho khách nước ngoài — quán có khách Nhật đặt bằng số
 * bản xứ, chặn cứng số Việt Nam là mất luôn cả nhóm đó.
 */
export function isPhone(raw: string): boolean {
  const phone = normalizePhone(raw)
  if (phone.startsWith('+')) return /^\+\d{8,15}$/.test(phone)
  return MOBILE_PREFIX.test(phone) || LANDLINE.test(phone)
}

/** Câu báo lỗi dùng chung — khách và lễ tân đọc cùng một dòng. */
export const PHONE_ERROR =
  'Số điện thoại chưa đúng — ví dụ 0912 345 678 hoặc 024 3782 4400'
