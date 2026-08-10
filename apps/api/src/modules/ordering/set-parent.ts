import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { Tx } from '../../common/tx'
import { orderLines } from '../../db/schema'
import { deriveSetParentState, type LineState } from './domain/order-state'

/**
 * Kéo trạng thái từ MÓN THÀNH PHẦN lên DÒNG SET CHA của một đơn.
 *
 * Mắt xích cuối của chuỗi suy trạng thái: mục vé → dòng món (`syncOrderLines`),
 * vé → đơn (`rollUpOrderStatus`), và ở đây là món con → dòng set. Dòng set cha
 * chỉ giữ giá và không xuống bếp nên nó không nằm trong vé nào — không có bước
 * này thì không ai chạm tới nó, và màn "Đơn của bàn" của khách (chỉ đọc dòng cha)
 * báo "Bếp đã nhận" cho tới lúc khách đứng dậy về.
 *
 * Gọi sau MỌI thay đổi trạng thái dòng món trong cùng transaction. Không có món
 * con nào đổi thì hàm này không ghi gì, nên gọi thừa cũng không tốn.
 */
export async function syncSetParents(tx: Tx, orderId: number): Promise<void> {
  const children = await tx
    .select({ parentLineId: orderLines.parentLineId, state: orderLines.state })
    .from(orderLines)
    .where(and(eq(orderLines.orderId, orderId), isNotNull(orderLines.parentLineId)))
  if (children.length === 0) return

  const byParent = new Map<number, LineState[]>()
  for (const child of children) {
    const parentId = child.parentLineId!
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), child.state as LineState])
  }

  for (const [parentId, states] of byParent) {
    const next = deriveSetParentState(states)
    if (!next) continue
    // `state <> next` để không sinh ghi thừa: hàm này chạy sau mỗi cú bấm của bếp,
    // mà một set mười sáu món thì mười sáu lần bấm chỉ đổi trạng thái cha vài lần.
    // `<> 'voided'` vì huỷ cả set là quyết định của người, không phải hệ quả suy ra.
    await tx
      .update(orderLines)
      .set({ state: next })
      .where(
        and(
          eq(orderLines.id, parentId),
          sql`${orderLines.state} <> ${next}`,
          sql`${orderLines.state} <> 'voided'`,
        ),
      )
  }
}
