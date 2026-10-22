import {
  badgeOf,
  dishOffer,
  nextBillHint,
  priceNewLines,
  unitDiscountOf,
  type BillHint,
  type DishOffer,
  type NewPricingLine,
  type PricedLine,
  type PromoContext,
} from '@sora/contracts'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { api, type Dish, type SessionOrder } from './api'
import type { CartItem } from './cart-context'

/**
 * Khuyến mãi tại bàn (§9.6): giá giảm trên thẻ món, giá ước tính trong giỏ, nhãn
 * chương trình trên đơn và bill.
 *
 * Tiền giảm do MÁY CHỦ ghi vào đơn lúc gửi bếp; ở đây chỉ chạy lại đúng bộ chấm
 * của `@sora/contracts` để khách thấy trước con số sẽ in trên bill. Giờ lấy theo
 * `clock` máy chủ trả kèm và hỏi lại mỗi phút — iPad mở cả buổi, đồng hồ máy lệch
 * được, mà giờ vàng phải bật và tắt theo giờ của quán.
 */

export interface CartPricing {
  /** Giảm ước tính của từng dòng giỏ, cùng thứ tự với `items` */
  lines: { discount: number; badge: string | null }[]
  discount: number
  /** "Gọi thêm 120.000₫ để được giảm 10%" — chỉ khi thứ còn thiếu DUY NHẤT là tiền */
  hint: BillHint | null
}

export interface Promotions {
  /** Ưu đãi của một món lúc này; null khi không có hoặc chưa tải xong */
  offerOf: (dish: Dish) => DishOffer | null
  /** Giá MỘT phần sau giảm theo phần, đã cộng tuỳ chọn — "Thêm vào giỏ · 59.500₫" */
  unitPriceOf: (dish: Dish, unitPrice: number) => number
  priceCart: (
    items: CartItem[],
    order: SessionOrder | null | undefined,
    dishById: Map<string, Dish>,
  ) => CartPricing
  /** Nhãn của chương trình đã ghi vào đơn; chương trình đã dừng thì không còn nhãn */
  badgeOf: (promotionId: number | null) => string | null
  nameOf: (promotionId: number | null) => string | null
}

const NONE: Promotions = {
  offerOf: () => null,
  unitPriceOf: (_dish, unitPrice) => unitPrice,
  priceCart: (items) => ({
    lines: items.map(() => ({ discount: 0, badge: null })),
    discount: 0,
    hint: null,
  }),
  badgeOf: () => null,
  nameOf: () => null,
}

const Ctx = createContext<Promotions>(NONE)

/** Khuyến mãi của bàn đang ngồi; ngoài `PromotionsProvider` thì như không có chương trình nào */
export function usePromos(): Promotions {
  return useContext(Ctx)
}

/**
 * Đặt MỘT lần ở vỏ iPad: lưới 78 thẻ món, giỏ, đơn và tạm tính cùng đọc một lượt
 * hỏi máy chủ thay vì mỗi thẻ tự hỏi.
 */
export function PromotionsProvider({
  branchId,
  children,
}: {
  branchId: string
  children: ReactNode
}) {
  return <Ctx.Provider value={usePromotions(branchId)}>{children}</Ctx.Provider>
}

function usePromotions(branchId: string): Promotions {
  const live = useQuery({
    queryKey: ['promotions', branchId],
    queryFn: () => api.promotions(branchId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  return useMemo(() => {
    const data = live.data
    if (!data || data.rules.length === 0) return NONE

    const { rules, clock } = data
    const ctx: PromoContext = {
      branchId,
      channel: 'table',
      voucherPromotionIds: [],
      maxDiscountRate: data.maxDiscountRate,
    }
    const byId = new Map(rules.map((r) => [r.id, r]))
    // Lưới 78 món hỏi lại ưu đãi mỗi lần vẽ — chấm một lần cho mỗi món trong một phút
    const offers = new Map<string, DishOffer | null>()
    const offerOf = (dish: Dish) => {
      if (!offers.has(dish.id)) {
        offers.set(
          dish.id,
          dishOffer(rules, ctx, clock, {
            id: dish.id,
            categoryId: dish.categoryId,
            price: dish.price,
          }),
        )
      }
      return offers.get(dish.id) ?? null
    }

    return {
      offerOf,

      unitPriceOf: (dish, unitPrice) => {
        const offer = offerOf(dish)
        const rule = offer ? byId.get(offer.promotionId) : undefined
        if (!rule || rule.kind === 'buy_x_get_y') return unitPrice
        return unitPrice - unitDiscountOf(rule, unitPrice, dish.price, ctx.maxDiscountRate)
      },

      priceCart: (items, order, dishById) => {
        /**
         * Đợt đã gửi cũng được tính — vào đơn tối thiểu và vào số phần "đã mua" của
         * "mua N tặng M". Máy chủ đếm theo lúc TỪNG món được gọi; ở đây coi như gọi
         * lúc này. Hai bên chỉ lệch khi đợt trước gọi ngoài khung giờ của chương
         * trình — và khi đó bill vẫn theo đúng máy chủ.
         */
        const existing: PricedLine[] = (order?.lines ?? [])
          .filter((l) => l.parentLineId === null && l.state !== 'voided')
          .map((l) => ({
            key: `o${l.id}`,
            dishId: l.dishId,
            categoryId: dishById.get(l.dishId)?.categoryId ?? null,
            qty: l.qty,
            unitPrice: l.unitPrice,
            at: clock,
            promotionId: l.promotionId,
            discountVnd: l.discountVnd,
            promoQty: l.promoQty,
          }))
        const fresh: NewPricingLine[] = items.map((item, i) => ({
          key: String(i),
          dishId: item.dishId,
          categoryId: dishById.get(item.dishId)?.categoryId ?? null,
          qty: item.qty,
          unitPrice: item.price,
          basePrice: dishById.get(item.dishId)?.price ?? item.price,
        }))
        const priced = priceNewLines(rules, ctx, clock, existing, fresh)

        const lines = fresh.map((line) => {
          const deal = priced.get(line.key)
          const rule = deal ? byId.get(deal.promotionId) : undefined
          return { discount: deal?.discountVnd ?? 0, badge: rule ? badgeOf(rule) : null }
        })
        const hint = nextBillHint(rules, ctx, clock, [
          ...existing,
          ...fresh.map((line) => {
            const deal = priced.get(line.key)
            return {
              ...line,
              at: clock,
              promotionId: deal?.promotionId ?? null,
              discountVnd: deal?.discountVnd ?? 0,
              promoQty: deal?.promoQty ?? 0,
            }
          }),
        ])
        return { lines, discount: lines.reduce((sum, l) => sum + l.discount, 0), hint }
      },

      badgeOf: (promotionId) => {
        const rule = promotionId === null ? undefined : byId.get(promotionId)
        return rule ? badgeOf(rule) : null
      },
      nameOf: (promotionId) =>
        promotionId === null ? null : (byId.get(promotionId)?.name ?? null),
    }
  }, [live.data, branchId])
}

/**
 * Tiền của đơn tách theo cách khách đọc: tiền món ĐÃ trừ giảm món (khớp tổng các
 * dòng đang hiện), rồi giảm hoá đơn là một dòng riêng.
 *
 * `money_sub` của máy chủ là tiền món theo GIÁ NIÊM YẾT (báo cáo và hoá đơn điện tử
 * cần giá gốc lẫn chiết khấu), nên cộng các dòng trên màn sẽ không ra số đó.
 */
export function moneyOf(order: SessionOrder['order']) {
  const billDiscount = order.moneyBillDiscount ?? 0
  const lineDiscount = (order.moneyDiscount ?? 0) - billDiscount
  return {
    lines: order.moneySub - lineDiscount,
    lineDiscount,
    billDiscount,
    saved: order.moneyDiscount ?? 0,
  }
}
