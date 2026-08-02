/**
 * B11 — Engine khuyến mãi. Phần TÍNH, không chạm CSDL.
 *
 * Toàn bộ màn B11 xoay quanh một câu trong §25: **"Quy tắc chồng: không cộng dồn,
 * tự áp mức lợi nhất cho khách."** Câu đó có hai vế và vế thứ hai mới là phần khó:
 *
 *   · *Không cộng dồn* là ràng buộc — một đơn hưởng đúng một chương trình. Chỗ
 *     cưỡng chế nó là chỉ số duy nhất trên `promotion_redemptions.order_id`.
 *   · *Tự áp mức lợi nhất* là phép chọn — chấm điểm MỌI chương trình đủ điều kiện
 *     rồi lấy cái giảm nhiều tiền nhất. Đó là việc của file này.
 *
 * Vì sao chọn theo TIỀN GIẢM chứ không theo thứ tự ưu tiên do người xếp: một
 * chương trình "giảm 10%" và một chương trình "giảm 50.000đ" đổi vai nhau tuỳ giá
 * trị đơn, nên mọi bảng ưu tiên cố định đều sẽ có ngày trả cho khách mức thấp hơn
 * mức họ đáng được hưởng — và không ai phát hiện ra.
 */

export type PromotionKind = 'percent' | 'amount' | 'free_dish' | 'set_price'

export interface PromotionRule {
  id: number
  code: string
  name: string
  kind: PromotionKind
  percentBp: number | null
  amountVnd: number | null
  targetDishId: string | null
  setPriceVnd: number | null
  maxDiscountVnd: number | null
  channels: string[]
  branchIds: string[]
  weekdays: number[]
  fromMinute: number | null
  toMinute: number | null
  minOrderVnd: number
  requiresVoucher: boolean
  startsOn: string
  endsOn: string
}

export interface CartLine {
  dishId: string
  qty: number
  /** Tiền của cả dòng sau khi đã cộng tuỳ chọn — đúng con số đang nằm trên bill */
  priceTotal: number
}

export interface CartContext {
  branchId: string
  channel: string
  /** Ngày làm việc YYYY-MM-DD — dùng để so với lịch chạy */
  businessDate: string
  /** Thứ trong tuần 0 = Chủ nhật … 6 = Thứ bảy, theo giờ chi nhánh */
  weekday: number
  /** Phút từ 00:00 theo giờ chi nhánh */
  minuteOfDay: number
  /** Tổng tiền hàng trước giảm giá */
  subtotalVnd: number
  lines: CartLine[]
  /** Mã voucher khách đưa, đã viết HOA; null = không có mã */
  voucherPromotionId: number | null
}

export type Ineligible =
  | 'ngoai-lich'
  | 'sai-kenh'
  | 'sai-chi-nhanh'
  | 'sai-thu'
  | 'ngoai-khung-gio'
  | 'chua-du-don-toi-thieu'
  | 'thieu-ma-voucher'
  | 'khong-co-mon-ap-dung'
  | 'khong-giam-duoc-dong-nao'

export interface Quote {
  promotionId: number
  code: string
  name: string
  kind: PromotionKind
  discountVnd: number
}

export interface Rejected {
  promotionId: number
  code: string
  reason: Ineligible
}

/**
 * Chấm một chương trình trên một giỏ hàng.
 * Trả về số tiền giảm, hoặc lý do KHÔNG áp được — lý do quan trọng ngang kết quả,
 * vì màn B11 phải trả lời được "sao đơn này không ăn chương trình?".
 */
export function quotePromotion(rule: PromotionRule, cart: CartContext): Quote | Rejected {
  const no = (reason: Ineligible): Rejected => ({
    promotionId: rule.id,
    code: rule.code,
    reason,
  })

  if (cart.businessDate < rule.startsOn || cart.businessDate > rule.endsOn) return no('ngoai-lich')
  if (rule.channels.length > 0 && !rule.channels.includes(cart.channel)) return no('sai-kenh')
  if (rule.branchIds.length > 0 && !rule.branchIds.includes(cart.branchId)) {
    return no('sai-chi-nhanh')
  }
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(cart.weekday)) return no('sai-thu')
  if (rule.fromMinute !== null && rule.toMinute !== null) {
    if (cart.minuteOfDay < rule.fromMinute || cart.minuteOfDay >= rule.toMinute) {
      return no('ngoai-khung-gio')
    }
  }
  if (cart.subtotalVnd < rule.minOrderVnd) return no('chua-du-don-toi-thieu')
  // Chương trình cần mã thì phải đúng mã của CHÍNH nó — mã của chương trình khác
  // không mở được cửa này
  if (rule.requiresVoucher && cart.voucherPromotionId !== rule.id) return no('thieu-ma-voucher')

  const discount = discountFor(rule, cart)
  if (discount === null) return no('khong-co-mon-ap-dung')
  if (discount <= 0) return no('khong-giam-duoc-dong-nao')

  return {
    promotionId: rule.id,
    code: rule.code,
    name: rule.name,
    kind: rule.kind,
    discountVnd: discount,
  }
}

/** `null` = chương trình không chạm được giỏ này (không có món áp dụng) */
function discountFor(rule: PromotionRule, cart: CartContext): number | null {
  switch (rule.kind) {
    case 'percent': {
      const raw = Math.floor((cart.subtotalVnd * (rule.percentBp ?? 0)) / 10_000)
      return capped(raw, rule.maxDiscountVnd)
    }
    case 'amount':
      // Không giảm quá tiền hàng: một đơn 30.000đ gặp voucher 50.000đ thì giảm
      // 30.000đ, chứ không sinh ra một bill âm tiền
      return Math.min(rule.amountVnd ?? 0, cart.subtotalVnd)

    case 'free_dish': {
      const line = cheapestLineOf(cart, rule.targetDishId)
      if (!line) return null
      // Tặng MỘT suất, không tặng cả dòng: khách gọi 3 phần thì được tặng 1
      const unit = Math.floor(line.priceTotal / Math.max(1, line.qty))
      return capped(unit, rule.maxDiscountVnd)
    }
    case 'set_price': {
      const line = cheapestLineOf(cart, rule.targetDishId)
      if (!line) return null
      const unit = Math.floor(line.priceTotal / Math.max(1, line.qty))
      // Giá khung giờ cao hơn giá đang bán thì không giảm gì — và cũng không tăng
      return capped(Math.max(0, unit - (rule.setPriceVnd ?? 0)), rule.maxDiscountVnd)
    }
  }
}

function capped(amount: number, max: number | null): number {
  return max === null ? amount : Math.min(amount, max)
}

/**
 * Dòng RẺ NHẤT của món áp dụng, không phải dòng đầu tiên.
 *
 * Cùng một món có thể nằm trên hai dòng với hai mức giá (tuỳ chọn thêm, phần lớn
 * nhỏ). Tặng dòng đắt nhất là hào phóng ngoài ý định của người soạn chương trình;
 * chọn dòng rẻ nhất là cách duy nhất khiến chi phí chương trình đoán trước được.
 */
function cheapestLineOf(cart: CartContext, dishId: string | null): CartLine | null {
  if (!dishId) return null
  const lines = cart.lines.filter((l) => l.dishId === dishId && l.qty > 0)
  if (lines.length === 0) return null
  return lines.reduce((best, line) =>
    line.priceTotal / line.qty < best.priceTotal / best.qty ? line : best,
  )
}

export interface BestPick {
  best: Quote | null
  /** Mọi chương trình đủ điều kiện, xếp giảm dần theo tiền giảm */
  eligible: Quote[]
  rejected: Rejected[]
}

/**
 * Chọn mức LỢI NHẤT cho khách trong số các chương trình đang chạy.
 *
 * Hoà nhau thì lấy chương trình có `id` nhỏ hơn — cái được soạn trước. Không phải
 * vì nó tốt hơn mà vì kết quả phải ổn định: cùng một giỏ hàng, hai lần bấm phải
 * ra cùng một chương trình, nếu không thì bill in ra và bill lưu lại khác nhau.
 */
export function pickBestPromotion(rules: PromotionRule[], cart: CartContext): BestPick {
  const eligible: Quote[] = []
  const rejected: Rejected[] = []

  for (const rule of rules) {
    const result = quotePromotion(rule, cart)
    if ('discountVnd' in result) eligible.push(result)
    else rejected.push(result)
  }

  eligible.sort((a, b) => b.discountVnd - a.discountVnd || a.promotionId - b.promotionId)
  return { best: eligible[0] ?? null, eligible, rejected }
}
