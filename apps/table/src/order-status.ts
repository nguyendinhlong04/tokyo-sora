import type { OrderLineRow, SessionOrder } from './api'

/** Bốn nấc khách nhìn thấy; `draft` là món chưa gửi nên chưa vào thang này */
export const STEPS: OrderLineRow['state'][] = ['queued', 'cooking', 'ready', 'served']

export const LABELS: Record<OrderLineRow['state'], string> = {
  draft: 'Chờ gửi bếp',
  queued: 'Bếp đã nhận',
  cooking: 'Đang làm',
  ready: 'Sắp ra',
  served: 'Đã ra',
  voided: 'Đã huỷ',
}

export interface SendRound {
  /** Lượt thứ mấy trong bữa, đếm từ 1 */
  no: number
  sentAt: string
  lines: OrderLineRow[]
}

/**
 * Các lượt gửi bếp của bàn — mỗi lần bấm "Gửi bếp" là một lượt.
 *
 * KHÔNG nhóm theo `batchNo`: đó là đợt ra món của bếp (đợt sau giữ lại chờ nhân
 * viên bấm "Ra đợt tiếp"), và mọi món gọi từ bàn đều rơi vào đợt 1. Một lần gửi
 * đóng dấu cùng một `sentAt` lên mọi dòng của nó, nên đó mới là thứ khách nhớ là
 * "đợt mình gọi": đợt đầu ba món bò, đợt sau gọi thêm bia.
 */
export function sendRounds(order: SessionOrder | null | undefined): SendRound[] {
  const bySent = new Map<string, OrderLineRow[]>()
  for (const line of order?.lines ?? []) {
    if (line.parentLineId !== null || line.sentAt === null) continue
    bySent.set(line.sentAt, [...(bySent.get(line.sentAt) ?? []), line])
  }
  return [...bySent.entries()]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([sentAt, lines], i) => ({ no: i + 1, sentAt, lines }))
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
