import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import { branches, dishes, orderLines, orders } from '../../db/schema'

/** Lưới bàn phím nhanh của P5: 20 ô, đúng bằng một trang lưới 4×5 của P4 */
const SLOTS = 20
/** Hai ô cuối luôn dành cho đồ uống bán chạy — xem chú thích ở `quickKeys` */
const DRINK_SLOTS = 2
/** "Tự cập nhật tuần" (§21 P5) — cửa sổ đúng bảy ngày kinh doanh gần nhất */
const WINDOW_DAYS = 7

@Injectable()
export class QuickKeysService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * P5 bàn phím nhanh — 20 món bấm nhiều nhất tuần qua.
   *
   * Chỉ trả về DANH SÁCH MÃ MÓN chứ không trả tên và giá: POS đã có config bundle
   * của chi nhánh (giá theo kênh, tuỳ chọn, món hết) và đó là nguồn duy nhất để
   * dựng ô món. Trả kèm giá ở đây là dựng nguồn thứ hai cho cùng con số, rồi có
   * ngày hai nguồn lệch nhau giữa giờ cao điểm.
   *
   * Hai ô dành riêng cho đồ uống bán chạy: bia là thứ phục vụ gõ lại nhiều nhất
   * trong ca, nhưng một tuần nhiều tiệc nướng đủ để đẩy hết đồ uống ra khỏi top
   * 20 món. Giữ chỗ cho chúng là giữ đúng lý do bàn phím nhanh tồn tại (§21 P5
   * "gồm 2 bia tươi mặc định").
   */
  async quickKeys(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    const since = businessDateOf(
      new Date(Date.now() - WINDOW_DAYS * 24 * 3_600_000),
      branch?.timezone ?? 'Asia/Ho_Chi_Minh',
    )

    const sold = await this.db
      .select({
        dishId: orderLines.dishId,
        kind: dishes.kind,
        qty: sql<number>`sum(${orderLines.qty})::int`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .innerJoin(dishes, eq(dishes.id, orderLines.dishId))
      .where(
        and(
          eq(orders.branchId, branchId),
          sql`${orders.businessDate} >= ${since}`,
          sql`${orders.status} <> 'cancelled'`,
          sql`${orderLines.state} <> 'voided'`,
          // Dòng con của set không phải thứ ai bấm — nó do set nổ ra
          sql`${orderLines.parentLineId} IS NULL`,
          eq(dishes.active, true),
          eq(dishes.tableOrderable, true),
        ),
      )
      .groupBy(orderLines.dishId, dishes.kind)
      .orderBy(desc(sql`sum(${orderLines.qty})`))
      .limit(SLOTS * 3)

    const drinks = sold.filter((r) => r.kind === 'drink').slice(0, DRINK_SLOTS)
    const chosen = [...drinks.map((d) => d.dishId)]
    for (const row of sold) {
      if (chosen.length >= SLOTS) break
      if (!chosen.includes(row.dishId)) chosen.push(row.dishId)
    }

    // Chi nhánh mới chưa bán buổi nào thì lưới vẫn phải có món để bấm: lấy món ký
    // của bếp trước, phần còn lại theo mã món cho ổn định giữa các lần gọi.
    if (chosen.length < SLOTS) {
      const fallback = await this.db
        .select({ id: dishes.id })
        .from(dishes)
        .where(and(eq(dishes.active, true), eq(dishes.tableOrderable, true)))
        .orderBy(desc(dishes.signature), dishes.code)
        .limit(SLOTS)
      for (const row of fallback) {
        if (chosen.length >= SLOTS) break
        if (!chosen.includes(row.id)) chosen.push(row.id)
      }
    }

    return { dishIds: chosen.slice(0, SLOTS), days: WINDOW_DAYS, since }
  }
}
