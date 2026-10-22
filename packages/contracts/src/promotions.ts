/**
 * Bộ máy khuyến mãi dùng chung (CLAUDE.md §9.6).
 *
 * API tính CHÍNH THỨC lúc gọi món và lúc tính lại đơn; iPad, POS, web dùng đúng
 * bộ này để hiện giá giảm trước khi gửi. Cùng lý do với `computeOrderTotals`: một
 * chỗ tính, mọi nơi đọc ra cùng một con số — khách thấy giá nào thì bill in giá đó.
 *
 * Hai tầng, không chồng lên nhau:
 *   · Chương trình MÓN (`scope = 'item'`) — giảm %, giảm tiền, đồng giá, mua N tặng
 *     M — chấm khi món được GỌI và đóng băng vào dòng đơn như giá: giờ vàng hết giữa
 *     bữa không làm món đã gọi đắt lên.
 *   · Chương trình HOÁ ĐƠN (`scope = 'bill'`) — giảm %, giảm tiền, tặng món — chấm
 *     lại mỗi lần đơn đổi, như giảm giá lúc tính tiền.
 *
 * Quy tắc chồng của §25 B11 giữ nguyên tinh thần "không cộng dồn": mỗi dòng hưởng
 * nhiều nhất MỘT chương trình món, hoá đơn hưởng nhiều nhất MỘT chương trình hoá
 * đơn và chỉ tính trên các dòng CHƯA được giảm — một đồng không bao giờ bị giảm hai
 * lần. Trong số chương trình đủ điều kiện luôn chọn cái lợi nhất cho khách; hoà thì
 * chọn chương trình soạn trước, để cùng một giỏ luôn ra cùng một kết quả.
 */

import { allocateByWeight } from './money.js'

export const PROMOTION_SCOPES = ['item', 'bill'] as const
export type PromotionScope = (typeof PROMOTION_SCOPES)[number]

export const PROMOTION_KINDS = [
  'percent',
  'amount',
  'set_price',
  'buy_x_get_y',
  'free_dish',
] as const
export type PromotionKind = (typeof PROMOTION_KINDS)[number]

/** Loại nào đi với phạm vi nào — CSDL chặn đúng bảng này (`promotions_scope_kind_check`) */
export const KINDS_BY_SCOPE: Record<PromotionScope, readonly PromotionKind[]> = {
  item: ['percent', 'amount', 'set_price', 'buy_x_get_y'],
  bill: ['percent', 'amount', 'free_dish'],
}

/**
 * Trần giảm theo luật: mức giảm không quá 50% giá ngay trước khuyến mại, và giá
 * trị món tặng không quá 50% giá trị hàng được khuyến mại (Nghị định 81/2018/NĐ-CP,
 * sửa bởi 128/2024/NĐ-CP). Chương trình khuyến mại TẬP TRUNG được giảm tới 100%.
 * Con số chạy thật là tham số `promo.maxDiscountRate` — luật đổi thì sửa một chỗ.
 */
export const LEGAL_MAX_DISCOUNT_RATE = 0.5

export interface PromotionRule {
  id: number
  code: string
  name: string
  /** Nhãn ngắn in trên thẻ món, vd "Giờ vàng"; null thì dùng nhãn theo loại */
  badge: string | null
  scope: PromotionScope
  kind: PromotionKind
  /** Giảm % nhân 100 (1250 = 12,5%) — loại `percent` */
  percentBp: number | null
  /** Giảm số tiền: mỗi phần (món) hoặc một lần (hoá đơn) — loại `amount` */
  amountVnd: number | null
  /** Đồng giá: giá một phần của món áp dụng — loại `set_price` */
  setPriceVnd: number | null
  /** Mua N tặng M, phần tặng giảm `getPercent`% (100 = miễn phí) — loại `buy_x_get_y` */
  buyQty: number | null
  getQty: number | null
  getPercent: number | null
  /** Món được tặng — loại `free_dish` */
  giftDishId: string | null
  /** Món / set / nhóm món áp dụng. Với `free_dish`: món phải gọi kèm mới được tặng */
  targetDishIds: readonly string[]
  targetCategoryIds: readonly string[]
  /** Trần tiền giảm của chương trình trên MỘT đơn */
  maxDiscountVnd: number | null
  /** Rỗng = không giới hạn (mọi kênh / chi nhánh / thứ) */
  channels: readonly string[]
  branchIds: readonly string[]
  /** 0 = Chủ nhật … 6 = Thứ bảy */
  weekdays: readonly number[]
  /** Khung giờ trong ngày, phút từ 00:00, mở ở đầu đóng ở cuối; null = cả ngày */
  fromMinute: number | null
  toMinute: number | null
  /** Đơn tối thiểu, tính trên tiền món sau giảm món, trước phí và thuế */
  minOrderVnd: number
  requiresVoucher: boolean
  /** Chương trình khuyến mại tập trung — được vượt trần 50% */
  concentrated: boolean
  /** Ngày làm việc YYYY-MM-DD */
  startsOn: string
  endsOn: string
}

/** Giờ treo tường của chi nhánh tại một thời điểm */
export interface PromoClock {
  businessDate: string
  /** 0 = Chủ nhật … 6 = Thứ bảy */
  weekday: number
  /** Phút kể từ 00:00 */
  minuteOfDay: number
}

export interface PromoContext {
  branchId: string
  channel: string
  /** Chương trình đã được mở bằng mã voucher gắn vào đơn */
  voucherPromotionIds: readonly number[]
  /** Trần giảm theo luật, 0,5 = 50% — xem `LEGAL_MAX_DISCOUNT_RATE` */
  maxDiscountRate: number
}

/** Một dòng đã nằm trong đơn, với phần giảm đã đóng băng */
export interface PricedLine {
  key: string
  dishId: string
  categoryId: string | null
  qty: number
  /** Giá niêm yết một phần, đã cộng tuỳ chọn */
  unitPrice: number
  /** Lúc dòng được gọi — giờ vàng tính theo lúc gọi món, không theo lúc tính tiền */
  at: PromoClock
  promotionId: number | null
  discountVnd: number
  /** Số phần của dòng được hưởng chương trình (với "mua N tặng M": số phần được tặng) */
  promoQty: number
}

/** Một dòng sắp thêm vào đơn */
export interface NewPricingLine {
  key: string
  dishId: string
  categoryId: string | null
  qty: number
  unitPrice: number
  /** Giá món trước khi cộng tuỳ chọn — "đồng giá" chỉ thay phần này, tuỳ chọn vẫn tính */
  basePrice: number
}

export interface LineDiscount {
  promotionId: number
  discountVnd: number
  promoQty: number
}

export interface BillDiscount {
  promotionId: number
  discountVnd: number
  /**
   * Phần giảm chia về từng dòng (khoá dòng → đồng), tổng đúng bằng `discountVnd`.
   *
   * Hoá đơn GTGT ghi tiền thuế theo từng thuế suất, nên phải biết phần giảm hoá
   * đơn rơi vào món ăn (8%) bao nhiêu, bia rượu (10%) bao nhiêu. Giảm % và giảm
   * tiền chia theo đúng phần tiền đã dùng để tính ra mức giảm — các phần chưa được
   * giảm món; tặng món thì cả phần giảm nằm ở dòng được tặng.
   */
  shares: Record<string, number>
}

/** Chương trình có chạy cho đơn này vào lúc này không — chưa xét món hay số tiền */
export function ruleRunsAt(rule: PromotionRule, ctx: PromoContext, at: PromoClock): boolean {
  if (at.businessDate < rule.startsOn || at.businessDate > rule.endsOn) return false
  if (rule.channels.length > 0 && !rule.channels.includes(ctx.channel)) return false
  if (rule.branchIds.length > 0 && !rule.branchIds.includes(ctx.branchId)) return false
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(at.weekday)) return false
  if (rule.fromMinute !== null && rule.toMinute !== null) {
    if (at.minuteOfDay < rule.fromMinute || at.minuteOfDay >= rule.toMinute) return false
  }
  // Chương trình cần mã chỉ mở bằng mã của CHÍNH nó
  if (rule.requiresVoucher && !ctx.voucherPromotionIds.includes(rule.id)) return false
  return true
}

/** Món này có nằm trong danh sách áp dụng của chương trình không (theo món hoặc theo nhóm) */
export function ruleTargets(
  rule: PromotionRule,
  dishId: string,
  categoryId: string | null,
): boolean {
  return (
    rule.targetDishIds.includes(dishId) ||
    (categoryId !== null && rule.targetCategoryIds.includes(categoryId))
  )
}

/**
 * Phần giảm cho MỘT phần món theo chương trình giảm từng phần, đã cắt trần luật.
 *
 * Trần luật tính trên giá niêm yết của chính phần đó: món 285.000₫ giảm tối đa
 * 142.500₫ dù chương trình khai 60% hay "đồng giá 99.000₫".
 */
export function unitDiscountOf(
  rule: PromotionRule,
  unitPrice: number,
  basePrice: number,
  maxRate: number,
): number {
  let off: number
  switch (rule.kind) {
    case 'percent':
      off = Math.floor((unitPrice * (rule.percentBp ?? 0)) / 10_000)
      break
    case 'amount':
      off = Math.min(rule.amountVnd ?? 0, unitPrice)
      break
    case 'set_price':
      // Đồng giá cao hơn giá đang bán thì không giảm — và cũng không bao giờ tăng giá
      off = Math.max(0, basePrice - (rule.setPriceVnd ?? basePrice))
      break
    default:
      return 0
  }
  return rule.concentrated ? off : Math.min(off, Math.floor(unitPrice * maxRate))
}

const byId = (a: PromotionRule, b: PromotionRule) => a.id - b.id
const lineGross = (l: { qty: number; unitPrice: number }) => l.qty * l.unitPrice

/**
 * Chấm khuyến mãi MÓN cho các dòng sắp thêm — kết quả được đóng băng vào dòng.
 *
 * `existing` là các dòng đang sống của đơn (chưa huỷ), với phần giảm đã đóng băng
 * từ những lần gọi trước. Chúng không bị chấm lại, nhưng vẫn được tính: vào đơn
 * tối thiểu, vào trần mỗi đơn của từng chương trình, và vào số phần "đã mua" của
 * "mua N tặng M" — hai chai bia gọi lúc 18:00 cộng với chai gọi lúc 18:20 là đủ
 * ba, chai thứ ba được tặng.
 */
export function priceNewLines(
  rules: readonly PromotionRule[],
  ctx: PromoContext,
  at: PromoClock,
  existing: readonly PricedLine[],
  added: readonly NewPricingLine[],
): Map<string, LineDiscount> {
  const result = new Map<string, LineDiscount>()
  if (added.length === 0) return result

  const gross =
    existing.reduce((s, l) => s + lineGross(l), 0) + added.reduce((s, l) => s + lineGross(l), 0)
  const itemDiscount = existing.reduce((s, l) => s + l.discountVnd, 0)
  const live = rules
    .filter((r) => r.scope === 'item' && ruleRunsAt(r, ctx, at))
    .filter((r) => gross - itemDiscount >= r.minOrderVnd)
    .sort(byId)
  if (live.length === 0) return result

  // Trần mỗi đơn: phần các dòng cũ đã ăn vào trần của từng chương trình
  const used = new Map<number, number>()
  const spend = (id: number, amount: number) => used.set(id, (used.get(id) ?? 0) + amount)
  for (const line of existing)
    if (line.promotionId !== null) spend(line.promotionId, line.discountVnd)
  const room = (rule: PromotionRule) =>
    rule.maxDiscountVnd === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, rule.maxDiscountVnd - (used.get(rule.id) ?? 0))

  // 1. Giảm theo từng phần — mỗi dòng lấy chương trình lợi nhất cho dòng đó
  for (const line of added) {
    let best: LineDiscount | null = null
    for (const rule of live) {
      if (rule.kind === 'buy_x_get_y' || !ruleTargets(rule, line.dishId, line.categoryId)) continue
      const off = Math.min(
        unitDiscountOf(rule, line.unitPrice, line.basePrice, ctx.maxDiscountRate) * line.qty,
        room(rule),
      )
      if (off > 0 && (best === null || off > best.discountVnd)) {
        best = { promotionId: rule.id, discountVnd: off, promoQty: line.qty }
      }
    }
    if (best) {
      result.set(line.key, best)
      spend(best.promotionId, best.discountVnd)
    }
  }

  /**
   * 2. Mua N tặng M, trên các dòng mới chưa được giảm theo phần.
   *
   * Giảm theo từng phần đi TRƯỚC: một món vừa có giờ vàng vừa có "mua 2 tặng 1"
   * thì khách thấy ngay giá giờ vàng trên thẻ món, và giá đó là giá họ trả. Để
   * hai chương trình tranh nhau theo số phần trong giỏ thì giá trên thẻ món nói
   * một đằng, bill in một nẻo.
   */
  for (const rule of live) {
    if (rule.kind !== 'buy_x_get_y') continue
    const buy = rule.buyQty ?? 0
    const get = rule.getQty ?? 0
    const pct = rule.getPercent ?? 100
    if (buy < 1 || get < 1 || pct < 1) continue

    // Phần gọi trước đó cũng là "đã mua" — nhưng chỉ phần gọi khi chương trình đang chạy
    const before = existing
      .filter(
        (l) =>
          ruleTargets(rule, l.dishId, l.categoryId) &&
          (l.promotionId === null || l.promotionId === rule.id) &&
          ruleRunsAt(rule, ctx, l.at),
      )
      .reduce((s, l) => s + l.qty, 0)
    const fresh = added.filter(
      (l) => !result.has(l.key) && ruleTargets(rule, l.dishId, l.categoryId),
    )
    const freshQty = fresh.reduce((s, l) => s + l.qty, 0)
    if (freshQty === 0) continue

    const owed = Math.floor((before + freshQty) / (buy + get)) * get
    const given = existing
      .filter((l) => l.promotionId === rule.id)
      .reduce((s, l) => s + l.promoQty, 0)
    let toGive = Math.min(Math.max(0, owed - given), freshQty)

    // Tặng phần RẺ NHẤT trong các phần mới gọi: chi phí chương trình đoán trước được
    const cheapestFirst = [...fresh].sort(
      (a, b) => a.unitPrice - b.unitPrice || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    for (const line of cheapestFirst) {
      if (toGive === 0) break
      const units = Math.min(toGive, line.qty)
      const off = Math.min(Math.floor((line.unitPrice * pct) / 100) * units, room(rule))
      if (off <= 0) break
      result.set(line.key, { promotionId: rule.id, discountVnd: off, promoQty: units })
      spend(rule.id, off)
      toGive -= units
    }
  }

  return result
}

/**
 * Chấm khuyến mãi HOÁ ĐƠN trên các dòng đang sống của đơn.
 *
 * `at` là lúc MỞ đơn: chương trình "hoá đơn buổi trưa" xét theo lúc khách vào
 * ngồi, không theo lúc thu ngân bấm tính tiền. Tiền để xét đơn tối thiểu là tiền
 * món sau giảm món; tiền để tính phần giảm chỉ gồm các PHẦN chưa được giảm món.
 *
 * Tính theo phần chứ không theo dòng vì "mua 2 tặng 1" gọi một lượt ba phần là
 * MỘT dòng: hai phần khách trả đủ giá vẫn được giảm hoá đơn, y như khi gọi hai
 * phần trước rồi một phần sau — cùng một bữa ăn không được ra hai bill khác nhau.
 */
export function priceBill(
  rules: readonly PromotionRule[],
  ctx: PromoContext,
  at: PromoClock,
  lines: readonly PricedLine[],
): BillDiscount | null {
  const net = lines.reduce((s, l) => s + lineGross(l) - l.discountVnd, 0)
  const base = lines.reduce((s, l) => s + billableOf(l), 0)

  let best: { promotionId: number; off: number; giftKey: string | null } | null = null
  for (const rule of rules.filter((r) => r.scope === 'bill' && ruleRunsAt(r, ctx, at)).sort(byId)) {
    const { off, giftKey } = billDiscountOf(rule, lines, net, base, ctx.maxDiscountRate)
    if (off > 0 && (best === null || off > best.off)) {
      best = { promotionId: rule.id, off, giftKey }
    }
  }
  if (best === null) return null

  const shares: Record<string, number> = {}
  if (best.giftKey !== null) {
    shares[best.giftKey] = best.off
  } else {
    const parts = allocateByWeight(best.off, lines.map(billableOf))
    lines.forEach((l, i) => {
      if (parts[i]! > 0) shares[l.key] = parts[i]!
    })
  }
  return { promotionId: best.promotionId, discountVnd: best.off, shares }
}

/** Tiền các phần CHƯA được giảm món của một dòng — nền để tính giảm hoá đơn */
const billableOf = (l: PricedLine) =>
  (l.qty - (l.promotionId === null ? 0 : l.promoQty)) * l.unitPrice

function billDiscountOf(
  rule: PromotionRule,
  lines: readonly PricedLine[],
  net: number,
  base: number,
  maxRate: number,
): { off: number; giftKey: string | null } {
  const legal = (off: number, of: number) =>
    rule.concentrated ? off : Math.min(off, Math.floor(of * maxRate))
  const none = { off: 0, giftKey: null }
  switch (rule.kind) {
    case 'percent': {
      if (net < rule.minOrderVnd) return none
      const raw = Math.floor((base * (rule.percentBp ?? 0)) / 10_000)
      return { off: legal(capped(raw, rule.maxDiscountVnd), base), giftKey: null }
    }
    case 'amount': {
      if (net < rule.minOrderVnd) return none
      // Không giảm quá tiền món: đơn 30.000₫ gặp chương trình giảm 50.000₫ không thành bill âm
      return {
        off: legal(capped(Math.min(rule.amountVnd ?? 0, base), rule.maxDiscountVnd), base),
        giftKey: null,
      }
    }
    case 'free_dish': {
      const gifts = lines.filter(
        (l) => l.dishId === rule.giftDishId && l.promotionId === null && l.qty > 0,
      )
      if (gifts.length === 0) return none
      // Tặng MỘT phần, phần rẻ nhất — khách gọi ba phần thì được tặng một
      const gift = gifts.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a))
      const value = capped(gift.unitPrice, rule.maxDiscountVnd)
      // Đơn tối thiểu và trần luật tính trên phần khách MUA, không gồm món được tặng
      const paid = net - gift.unitPrice
      if (paid < rule.minOrderVnd) return none
      if (rule.targetDishIds.length + rule.targetCategoryIds.length > 0) {
        const bought = lines.some(
          (l) => ruleTargets(rule, l.dishId, l.categoryId) && (l !== gift || l.qty > 1),
        )
        if (!bought) return none
      }
      // Món tặng quá nửa giá trị phần mua thì không được tặng — tặng một phần món là vô nghĩa
      if (!rule.concentrated && value > Math.floor(paid * maxRate)) return none
      return { off: value, giftKey: gift.key }
    }
    default:
      return none
  }
}

function capped(amount: number, max: number | null): number {
  return max === null ? amount : Math.min(amount, max)
}

// =================================================================== Hiển thị

export interface DishOffer {
  promotionId: number
  /** Giá một phần sau giảm, chưa cộng tuỳ chọn; "mua N tặng M" thì bằng giá gốc */
  price: number
  badge: string
}

/**
 * Ưu đãi của MỘT món vào lúc này — để in giá giảm và nhãn lên thẻ món.
 *
 * Chỉ xét chương trình không đòi đơn tối thiểu: thẻ món chưa biết đơn sẽ to bao
 * nhiêu, in giá giảm mà lúc gửi bếp không được hưởng là hứa suông. Chương trình
 * có đơn tối thiểu vẫn được áp khi đủ — giỏ hàng hiện ra lúc đó.
 */
export function dishOffer(
  rules: readonly PromotionRule[],
  ctx: PromoContext,
  at: PromoClock,
  dish: { id: string; categoryId: string | null; price: number },
): DishOffer | null {
  const live = rules
    .filter(
      (r) =>
        r.scope === 'item' &&
        r.minOrderVnd === 0 &&
        ruleRunsAt(r, ctx, at) &&
        ruleTargets(r, dish.id, dish.categoryId),
    )
    .sort(byId)

  let best: DishOffer | null = null
  for (const rule of live) {
    if (rule.kind === 'buy_x_get_y') continue
    const price = dish.price - unitDiscountOf(rule, dish.price, dish.price, ctx.maxDiscountRate)
    if (price < dish.price && (best === null || price < best.price)) {
      best = { promotionId: rule.id, price, badge: badgeOf(rule) }
    }
  }
  if (best) return best

  const bogo = live.find((r) => r.kind === 'buy_x_get_y')
  return bogo ? { promotionId: bogo.id, price: dish.price, badge: badgeOf(bogo) } : null
}

export interface BillHint {
  promotionId: number
  name: string
  badge: string
  /** Còn thiếu bao nhiêu tiền món để đạt đơn tối thiểu */
  missingVnd: number
}

/**
 * Chương trình hoá đơn gần đạt nhất — "Gọi thêm 120.000₫ để được giảm 10%".
 *
 * Chỉ nói khi thứ còn thiếu DUY NHẤT là tiền: chương trình sai giờ, sai kênh hay
 * cần mã thì không đáng nhắc với khách.
 */
export function nextBillHint(
  rules: readonly PromotionRule[],
  ctx: PromoContext,
  at: PromoClock,
  lines: readonly PricedLine[],
): BillHint | null {
  const net = lines.reduce((s, l) => s + lineGross(l) - l.discountVnd, 0)
  let best: BillHint | null = null
  for (const rule of rules.filter((r) => r.scope === 'bill' && ruleRunsAt(r, ctx, at)).sort(byId)) {
    if (rule.kind === 'free_dish' || rule.minOrderVnd <= net) continue
    const missingVnd = rule.minOrderVnd - net
    if (best === null || missingVnd < best.missingVnd) {
      best = { promotionId: rule.id, name: rule.name, badge: badgeOf(rule), missingVnd }
    }
  }
  return best
}

/** Nhãn ngắn của chương trình cho khách đọc: "−20%", "Mua 2 tặng 1"… */
export function badgeOf(rule: PromotionRule): string {
  if (rule.badge && rule.badge.trim()) return rule.badge.trim()
  switch (rule.kind) {
    case 'percent':
      return `−${percentLabel(rule.percentBp ?? 0)}`
    case 'amount':
      return `−${thousands(rule.amountVnd ?? 0)}`
    case 'set_price':
      return `Đồng giá ${thousands(rule.setPriceVnd ?? 0)}`
    case 'buy_x_get_y':
      return (rule.getPercent ?? 100) >= 100
        ? `Mua ${rule.buyQty ?? 0} tặng ${rule.getQty ?? 0}`
        : `Mua ${rule.buyQty ?? 0}, phần sau −${rule.getPercent ?? 0}%`
    case 'free_dish':
      return 'Tặng món'
  }
}

/** 1250 → "12,5%" — dấu phẩy thập phân theo cách viết tiếng Việt */
export function percentLabel(bp: number): string {
  const value = bp / 100
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '').replace('.', ',')}%`
}

/** 20.000 → "20k", 1.150.000 → "1.150k" — đủ ngắn cho một nhãn trên thẻ món */
function thousands(vnd: number): string {
  return vnd % 1000 === 0
    ? `${(vnd / 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}k`
    : `${vnd.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}₫`
}
