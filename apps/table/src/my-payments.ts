export const PAYMENTS_KEY = 'sora.table.payments'

/**
 * Các lượt trả tạo trên iPad này, trong lượt khách đang ngồi.
 *
 * Máy chủ biết mọi lượt trả của bàn; màn T12 còn cần biết lượt nào do khách đứng
 * trước iPad tạo, để "món tôi vừa nhận" không hiện ra như "món người khác đã giữ"
 * — lượt thu ngân tạo ở quầy chẳng hạn. Đổi lượt khách thì `TableProvider` xoá.
 */
export function myPayments(): number[] {
  try {
    const raw = sessionStorage.getItem(PAYMENTS_KEY)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

export function rememberPayment(id: number): void {
  try {
    sessionStorage.setItem(PAYMENTS_KEY, JSON.stringify([...new Set([...myPayments(), id])]))
  } catch {
    // Trình duyệt chặn lưu trữ: mất chút tiện lợi, không mất tiền
  }
}
