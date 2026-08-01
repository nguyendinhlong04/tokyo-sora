const KEY = 'sora.table.payments'

/**
 * Các lượt trả do CHÍNH máy này tạo.
 *
 * Cả bàn dùng chung một token nên máy chủ không phân biệt được điện thoại nào —
 * và không cần phân biệt: tiền vào VA nào là của lượt đó. Nhưng màn T12 thì cần,
 * để "món tôi vừa nhận" không hiện ra như "món người khác đã giữ".
 */
export function myPayments(): number[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

export function rememberPayment(id: number): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...new Set([...myPayments(), id])]))
  } catch {
    // Trình duyệt chặn lưu trữ: mất chút tiện lợi, không mất tiền
  }
}
