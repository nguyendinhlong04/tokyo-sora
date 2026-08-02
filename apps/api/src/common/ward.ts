/**
 * Khớp tên phường/xã giữa thứ khách gõ và thứ Office lưu.
 *
 * Hai phép biến đổi tách bạch, cố ý:
 *
 *  - `foldWard` chỉ bỏ dấu và hạ chữ. KHÔNG cắt chữ nào — "Quan Hoa" là tên
 *    phường thật, cắt chữ "quan" ở đầu là biến nó thành "hoa" và đụng với mọi
 *    phường khác kết thúc bằng "hoa".
 *  - `wardMatches` mới là nơi bỏ qua tiền tố hành chính, và chỉ bỏ ở VẾ KHÁCH
 *    GÕ: khách quen viết "Phường Dịch Vọng" còn Office lưu "Dịch Vọng".
 *
 * Gộp hai việc vào một hàm là cách sinh ra lỗi im lặng: một phường bị cắt mất
 * chữ đầu vẫn khớp được với chính nó, nên không ai phát hiện cho tới khi hai
 * phường khác nhau cùng rút về một chuỗi.
 */
const ADMIN_PREFIX = /^(phuong|xa|thi tran|quan|huyen)\s+/

export function foldWard(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tên khách gõ có chỉ đúng phường Office đã khai không */
export function wardMatches(stored: string, typed: string): boolean {
  const target = foldWard(stored)
  const input = foldWard(typed)
  return input === target || input.replace(ADMIN_PREFIX, '') === target
}
