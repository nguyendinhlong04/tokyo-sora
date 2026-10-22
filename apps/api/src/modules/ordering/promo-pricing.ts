import {
  LEGAL_MAX_DISCOUNT_RATE,
  type PricedLine,
  type PromoClock,
  type PromoContext,
  type PromotionKind,
  type PromotionRule,
  type PromotionScope,
} from '@sora/contracts'
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { businessDateOf, minuteOfDayIn, weekdayIn } from '../../common/business-date'
import type { ParamsService } from '../../common/params.service'
import type { DbOrTx } from '../../common/tx'
import { dishes, orderLines, promotions, voucherCodes } from '../../db/schema'

/**
 * Phần CSDL của khuyến mãi áp chung (§9.6). Phép chấm nằm ở
 * `@sora/contracts/promotions` — file này chỉ đọc CSDL ra đúng hình bộ chấm cần,
 * để luồng gọi món (`OrderingService`) và B11 (`PromotionsService`) đọc cùng một
 * cách, không ai tự viết lại câu truy vấn.
 */

export type PromotionRow = typeof promotions.$inferSelect

/** Giờ treo tường của chi nhánh tại một thời điểm — giờ vàng tính theo đây */
export function clockOf(at: Date, timezone: string): PromoClock {
  return {
    businessDate: businessDateOf(at, timezone),
    weekday: weekdayIn(at, timezone),
    minuteOfDay: minuteOfDayIn(at, timezone),
  }
}

export function ruleOf(row: PromotionRow): PromotionRule {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    badge: row.badge,
    scope: row.scope as PromotionScope,
    kind: row.kind as PromotionKind,
    percentBp: row.percentBp,
    amountVnd: row.amountVnd,
    setPriceVnd: row.setPriceVnd,
    buyQty: row.buyQty,
    getQty: row.getQty,
    getPercent: row.getPercent,
    giftDishId: row.targetDishId,
    targetDishIds: row.targetDishIds,
    targetCategoryIds: row.targetCategoryIds,
    maxDiscountVnd: row.maxDiscountVnd,
    channels: row.channels,
    branchIds: row.branchIds,
    weekdays: row.weekdays,
    fromMinute: row.fromMinute,
    toMinute: row.toMinute,
    minOrderVnd: row.minOrderVnd,
    requiresVoucher: row.requiresVoucher,
    concentrated: row.concentrated,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
  }
}

/**
 * Chương trình đang chạy và còn trong lịch của ngày làm việc `businessDate`,
 * cộng những chương trình nêu trong `keep` dù trạng thái của chúng giờ ra sao —
 * nơi gọi tự quyết có giữ hay không (xem `heldFor`).
 */
export async function rulesOn(
  db: DbOrTx,
  businessDate: string,
  keep: number[] = [],
): Promise<PromotionRow[]> {
  const live = and(
    eq(promotions.state, 'active'),
    lte(promotions.startsOn, businessDate),
    gte(promotions.endsOn, businessDate),
  )
  return db
    .select()
    .from(promotions)
    .where(keep.length > 0 ? or(live, inArray(promotions.id, keep)) : live)
    .orderBy(asc(promotions.id))
}

/**
 * Chương trình đã dừng có còn giữ cho một đơn không.
 *
 * Còn, nếu nó đang chạy lúc khách MỞ đơn và chỉ bị dừng sau đó: khách ngồi xuống
 * khi quán đang "giảm 10% hoá đơn" thì tính tiền theo đúng lời mời đó, dù quản lý
 * tắt chương trình giữa ca.
 */
export function heldFor(row: PromotionRow, orderCreatedAt: Date): boolean {
  if (row.state === 'active') return true
  return (
    row.activatedAt !== null &&
    row.activatedAt <= orderCreatedAt &&
    row.stateChangedAt !== null &&
    row.stateChangedAt > orderCreatedAt
  )
}

/** Bối cảnh chấm của một đơn: kênh, chi nhánh, voucher đang gắn, trần luật */
export async function contextOf(
  db: DbOrTx,
  order: { branchId: string; channel: string; voucherCodeId: number | null },
  params: ParamsService,
): Promise<PromoContext> {
  let voucherPromotionIds: number[] = []
  if (order.voucherCodeId !== null) {
    const [voucher] = await db
      .select({ promotionId: voucherCodes.promotionId })
      .from(voucherCodes)
      .where(eq(voucherCodes.id, order.voucherCodeId))
    if (voucher) voucherPromotionIds = [voucher.promotionId]
  }
  return {
    branchId: order.branchId,
    channel: order.channel,
    voucherPromotionIds,
    maxDiscountRate: await params.getNumber(
      'promo.maxDiscountRate',
      LEGAL_MAX_DISCOUNT_RATE,
      order.branchId,
    ),
  }
}

/**
 * Dòng CHA đang sống của đơn (chưa huỷ), quy về thứ bộ chấm cần.
 *
 * Dòng con của set giá 0 nên không vào: khuyến mãi của set nằm ở dòng set cha,
 * như giá của nó.
 */
export async function pricedLinesOf(
  db: DbOrTx,
  orderId: number,
  timezone: string,
): Promise<(PricedLine & { id: number })[]> {
  const rows = await db
    .select({
      id: orderLines.id,
      dishId: orderLines.dishId,
      categoryId: dishes.categoryId,
      qty: orderLines.qty,
      unitPrice: orderLines.unitPrice,
      promotionId: orderLines.promotionId,
      discountVnd: orderLines.discountVnd,
      promoQty: orderLines.promoQty,
      createdAt: orderLines.createdAt,
    })
    .from(orderLines)
    .innerJoin(dishes, eq(dishes.id, orderLines.dishId))
    .where(
      and(
        eq(orderLines.orderId, orderId),
        isNull(orderLines.parentLineId),
        sql`${orderLines.state} <> 'voided'`,
      ),
    )
    .orderBy(asc(orderLines.id))

  return rows.map((r) => ({
    id: r.id,
    key: String(r.id),
    dishId: r.dishId,
    categoryId: r.categoryId,
    qty: r.qty,
    unitPrice: r.unitPrice,
    at: clockOf(r.createdAt, timezone),
    promotionId: r.promotionId,
    discountVnd: r.discountVnd,
    promoQty: r.promoQty,
  }))
}
