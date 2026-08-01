import { outboxEvents } from '../db/schema'
import type { Tx } from './tx'

export interface DomainEvent {
  /** null với sự kiện cấp chuỗi */
  branchId: string | null
  topic: string
  payload: Record<string, unknown>
}

/**
 * Ghi sự kiện vào outbox — BẮT BUỘC gọi trong cùng transaction với thay đổi
 * nghiệp vụ sinh ra nó.
 *
 * Không phát trực tiếp qua WebSocket ở đây: nếu transaction rollback mà sự kiện
 * đã bay đi thì client thấy thứ không tồn tại; nếu API chết sau commit mà trước
 * khi phát thì sự kiện mất. Outbox giải cả hai — dispatcher đọc lại từ bảng.
 *
 * `outbox_events.id` chính là `seq` đơn điệu tăng mà client dùng để phát hiện hở.
 */
export async function emit(tx: Tx, event: DomainEvent): Promise<number> {
  const [row] = await tx
    .insert(outboxEvents)
    .values({ branchId: event.branchId, topic: event.topic, payload: event.payload })
    .returning({ id: outboxEvents.id })
  return row!.id
}

export async function emitAll(tx: Tx, events: DomainEvent[]): Promise<void> {
  if (events.length === 0) return
  await tx.insert(outboxEvents).values(
    events.map((e) => ({ branchId: e.branchId, topic: e.topic, payload: e.payload })),
  )
}
