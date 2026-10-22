'use client'

import {
  badgeOf,
  computeOrderTotals,
  dishOffer,
  nextBillHint,
  priceBill,
  priceNewLines,
  type BillHint,
  type DishOffer,
  type NewPricingLine,
  type OrderTotals,
  type PromoClock,
  type PromoContext,
} from '@sora/contracts'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiGet, type LivePromotions, type MenuPricing } from '../../lib/api'
import type { CartLine, ReceiveMode } from './order-context'

/**
 * Khuyến mãi của luồng đặt món online (§9.6): giá giảm trên thực đơn O2 và chi
 * tiết O3, tiền giảm trong giỏ O4 và số tiền trả trước ở O6.
 *
 * Tiền giảm do MÁY CHỦ ghi vào đơn lúc đặt; ở đây chạy lại đúng bộ chấm và đúng
 * `computeOrderTotals` của `@sora/contracts` để con số khách thấy suốt bốn màn là
 * con số mã QR sẽ đòi — kể cả phần làm tròn khi giá giảm lẻ đồng.
 */

/** Phần của thực đơn chi nhánh mà phép tính cần — món nào thuộc nhóm nào, giá bao nhiêu */
export interface PricingDish {
  id: string
  categoryId: string | null
  price: number
}

export interface WebCartPricing {
  /** Giảm món của từng dòng giỏ, cùng thứ tự với `lines` */
  lines: { discount: number; badge: string | null }[]
  /** Tiền món sau giảm món — khớp tổng các dòng đang hiện */
  linesTotal: number
  bill: { discount: number; name: string } | null
  /** "Đặt thêm 120.000₫ để được giảm 10%" — chỉ khi thứ còn thiếu DUY NHẤT là tiền */
  hint: BillHint | null
  /** Đúng như máy chủ sẽ tính: tiền món giá niêm yết, giảm, VAT, phí giao, làm tròn */
  money: OrderTotals
  /** Phần chuyển khoản trước — đơn giao không gồm phí giao (`prepayDueOf` của API) */
  prepay: number
}

interface PromotionsValue {
  /** Ưu đãi của một món lúc này; null khi không có hoặc chưa tải xong */
  offerOf: (dish: PricingDish) => DishOffer | null
  priceCart: (lines: CartLine[], opts: { mode: ReceiveMode; ship: number }) => WebCartPricing
}

const Ctx = createContext<PromotionsValue | null>(null)

export function usePromos(): PromotionsValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('usePromos phải nằm trong <PromotionsProvider>')
  return value
}

/** Chưa tải được chương trình thì giờ nào cũng như nhau — không chương trình nào chạy */
const NO_CLOCK: PromoClock = { businessDate: '', weekday: 0, minuteOfDay: 0 }

/**
 * Đặt ở layout của một chi nhánh: O2 → O6 đọc cùng một bộ chương trình. Bản đầu
 * lấy sẵn khi dựng trang trên máy chủ để lần vẽ đầu đã có giá giảm; sau đó hỏi
 * lại mỗi phút theo `clock` máy chủ — trang để mở qua 17:00 thì giờ vàng phải bật
 * đúng lúc, không theo đồng hồ máy khách.
 */
export function PromotionsProvider({
  branchId,
  initial,
  dishes,
  pricing,
  children,
}: {
  branchId: string
  initial: LivePromotions | null
  dishes: PricingDish[]
  pricing: MenuPricing
  children: ReactNode
}) {
  const [live, setLive] = useState(initial)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      apiGet<LivePromotions>(`/api/crm/promotions/live?branch=${encodeURIComponent(branchId)}`)
        .then((next) => {
          if (!cancelled) setLive(next)
        })
        // Hỏi lại hỏng thì giữ bản đang có — máy chủ vẫn chấm lại khi đặt đơn
        .catch(() => undefined)
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [branchId])

  const value = useMemo<PromotionsValue>(() => {
    const rules = live?.rules ?? []
    const clock = live?.clock ?? NO_CLOCK
    const ctx: PromoContext = {
      branchId,
      channel: 'web',
      voucherPromotionIds: [],
      maxDiscountRate: live?.maxDiscountRate ?? 0.5,
    }
    const byId = new Map(rules.map((r) => [r.id, r]))
    const dishById = new Map(dishes.map((d) => [d.id, d]))

    return {
      offerOf: (dish) => (rules.length === 0 ? null : dishOffer(rules, ctx, clock, dish)),

      priceCart: (lines, { mode, ship }) => {
        const fresh: NewPricingLine[] = lines.map((line, i) => ({
          key: String(i),
          dishId: line.dishId,
          categoryId: dishById.get(line.dishId)?.categoryId ?? null,
          qty: line.qty,
          unitPrice: line.price,
          basePrice: line.price,
        }))
        // Đơn web luôn là đơn MỚI: không có dòng cũ nào để đếm vào "mua N tặng M"
        const priced = priceNewLines(rules, ctx, clock, [], fresh)
        const withDeals = fresh.map((line) => {
          const deal = priced.get(line.key)
          return {
            ...line,
            at: clock,
            promotionId: deal?.promotionId ?? null,
            discountVnd: deal?.discountVnd ?? 0,
            promoQty: deal?.promoQty ?? 0,
          }
        })
        const bill = priceBill(rules, ctx, clock, withDeals)
        const itemDiscount = withDeals.reduce((sum, l) => sum + l.discountVnd, 0)

        const money = computeOrderTotals({
          lines: lines.map((l) => ({ qty: l.qty, unitPrice: l.price })),
          discount: itemDiscount + (bill?.discountVnd ?? 0),
          vatRate: pricing.vatRate,
          ship,
          roundingUnit: pricing.roundingUnit,
        })

        return {
          lines: withDeals.map((l) => {
            const rule = l.promotionId === null ? undefined : byId.get(l.promotionId)
            return { discount: l.discountVnd, badge: rule ? badgeOf(rule) : null }
          }),
          linesTotal: money.sub - itemDiscount,
          bill: bill
            ? { discount: bill.discountVnd, name: byId.get(bill.promotionId)?.name ?? 'Khuyến mãi' }
            : null,
          hint: nextBillHint(rules, ctx, clock, withDeals),
          money,
          prepay: mode === 'delivery' ? Math.max(0, money.total - money.ship) : money.total,
        }
      },
    }
  }, [live, branchId, dishes, pricing])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
