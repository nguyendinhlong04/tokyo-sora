/**
 * Tiền khách phải trả TRƯỚC khi đơn online được xuống bếp.
 *
 * Đơn giao trừ phí ship ra: phần đó shipper thu tận tay lúc đưa hàng, còn tiền
 * món phải nằm trong tài khoản quán trước khi bếp đụng dao. Đơn mang về không có
 * ai đi thu hộ nên trả trọn.
 *
 * Đơn kênh ngoài (GrabFood · ShopeeFood) và đơn nhân viên nhập tay KHÔNG áp:
 * bên họ đã thu của khách rồi, còn đơn nhập tay là đơn có người đang đứng ở quầy.
 * Đơn tại bàn cũng không — ở đó khách trả lúc về.
 */
export interface PrepayOrder {
  channel: string
  type: string
  moneyTotal: number
  moneyShip: number
}

export function prepayDueOf(order: PrepayOrder): number {
  if (order.channel !== 'web') return 0
  if (order.type === 'delivery') return Math.max(0, order.moneyTotal - order.moneyShip)
  if (order.type === 'takeaway') return order.moneyTotal
  return 0
}
