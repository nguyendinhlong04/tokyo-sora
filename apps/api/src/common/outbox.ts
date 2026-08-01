import { outboxEvents } from '../db/schema'
import type { Tx } from './tx'

export interface DomainEvent {
  /** null với sự kiện cấp chuỗi */
  branchId: string | null
  topic: string
  /** Tên phòng nhận sự kiện (TRIEN-KHAI §6) — xem rooms() ở @sora/contracts */
  rooms: string[]
  payload: Record<string, unknown>
}

/**
 * Ghi sự kiện vào outbox — BẮT BUỘC gọi trong cùng transaction với thay đổi
 * nghiệp vụ sinh ra nó.
 *
 * Không phát trực tiếp qua WebSocket ở đây: nếu transaction rollback mà sự kiện
 * đã bay đi thì client thấy thứ không tồn tại; nếu tiến trình chết sau commit mà
 * trước khi phát thì sự kiện mất. Outbox giải cả hai.
 *
 * Việc PHÁT do Supabase Realtime lo: một trigger AFTER INSERT trên bảng này gọi
 * `realtime.send()` cho từng phòng. Nhờ vậy không cần tiến trình dispatcher chạy
 * nền — điều kiện tiên quyết để chạy được trên nền serverless của Vercel.
 *
 * `outbox_events.id` chính là `seq` đơn điệu tăng mà client dùng để phát hiện hở
 * sự kiện và biết khi nào phải refetch.
 */
export async function emit(tx: Tx, event: DomainEvent): Promise<number> {
  const [row] = await tx
    .insert(outboxEvents)
    .values({
      branchId: event.branchId,
      topic: event.topic,
      rooms: event.rooms,
      payload: event.payload,
    })
    .returning({ id: outboxEvents.id })
  return row!.id
}

export async function emitAll(tx: Tx, events: DomainEvent[]): Promise<void> {
  if (events.length === 0) return
  await tx.insert(outboxEvents).values(
    events.map((e) => ({
      branchId: e.branchId,
      topic: e.topic,
      rooms: e.rooms,
      payload: e.payload,
    })),
  )
}
