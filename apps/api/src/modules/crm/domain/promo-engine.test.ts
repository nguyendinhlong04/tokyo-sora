import { describe, expect, it } from 'vitest'
import {
  pickBestPromotion,
  quotePromotion,
  type CartContext,
  type PromotionRule,
} from './promo-engine'

const rule = (over: Partial<PromotionRule>): PromotionRule => ({
  id: 1,
  code: 'KM-1',
  name: 'Chương trình 1',
  kind: 'percent',
  percentBp: 1000,
  amountVnd: null,
  targetDishId: null,
  setPriceVnd: null,
  maxDiscountVnd: null,
  channels: [],
  branchIds: [],
  weekdays: [],
  fromMinute: null,
  toMinute: null,
  minOrderVnd: 0,
  requiresVoucher: false,
  startsOn: '2026-08-01',
  endsOn: '2026-08-31',
  ...over,
})

const cart = (over: Partial<CartContext> = {}): CartContext => ({
  branchId: 'CG',
  channel: 'table',
  businessDate: '2026-08-15',
  weekday: 6,
  minuteOfDay: 12 * 60,
  subtotalVnd: 1_000_000,
  lines: [{ dishId: 'M-BO', qty: 2, priceTotal: 600_000 }],
  voucherPromotionId: null,
  ...over,
})

describe('Điều kiện áp dụng — chương trình nào không ăn thì phải nói vì sao', () => {
  it('ngoài lịch chạy', () => {
    expect(quotePromotion(rule({}), cart({ businessDate: '2026-09-01' }))).toMatchObject({
      reason: 'ngoai-lich',
    })
    expect(quotePromotion(rule({}), cart({ businessDate: '2026-07-31' }))).toMatchObject({
      reason: 'ngoai-lich',
    })
  })

  it('mảng rỗng nghĩa là KHÔNG giới hạn, không phải cấm hết', () => {
    expect(quotePromotion(rule({ channels: [], branchIds: [], weekdays: [] }), cart())).toMatchObject(
      { discountVnd: 100_000 },
    )
  })

  it('sai kênh · sai chi nhánh · sai thứ', () => {
    expect(quotePromotion(rule({ channels: ['web'] }), cart())).toMatchObject({
      reason: 'sai-kenh',
    })
    expect(quotePromotion(rule({ branchIds: ['Q1'] }), cart())).toMatchObject({
      reason: 'sai-chi-nhanh',
    })
    expect(quotePromotion(rule({ weekdays: [1, 2, 3] }), cart())).toMatchObject({
      reason: 'sai-thu',
    })
  })

  it('khung giờ đóng ở đầu, MỞ ở cuối — 14:00 không còn thuộc khung 11:00–14:00', () => {
    const trua = rule({ fromMinute: 11 * 60, toMinute: 14 * 60 })
    expect(quotePromotion(trua, cart({ minuteOfDay: 11 * 60 }))).toMatchObject({
      discountVnd: 100_000,
    })
    expect(quotePromotion(trua, cart({ minuteOfDay: 14 * 60 - 1 }))).toMatchObject({
      discountVnd: 100_000,
    })
    expect(quotePromotion(trua, cart({ minuteOfDay: 14 * 60 }))).toMatchObject({
      reason: 'ngoai-khung-gio',
    })
  })

  it('đơn tối thiểu tính trên tiền hàng trước giảm', () => {
    const r = rule({ minOrderVnd: 1_000_000 })
    expect(quotePromotion(r, cart({ subtotalVnd: 999_999 }))).toMatchObject({
      reason: 'chua-du-don-toi-thieu',
    })
    expect(quotePromotion(r, cart({ subtotalVnd: 1_000_000 }))).toMatchObject({
      discountVnd: 100_000,
    })
  })

  it('mã voucher của chương trình KHÁC không mở được chương trình này', () => {
    const r = rule({ id: 7, requiresVoucher: true })
    expect(quotePromotion(r, cart({ voucherPromotionId: null }))).toMatchObject({
      reason: 'thieu-ma-voucher',
    })
    expect(quotePromotion(r, cart({ voucherPromotionId: 9 }))).toMatchObject({
      reason: 'thieu-ma-voucher',
    })
    expect(quotePromotion(r, cart({ voucherPromotionId: 7 }))).toMatchObject({
      discountVnd: 100_000,
    })
  })
})

describe('Bốn loại chương trình của §25 B11', () => {
  it('giảm % làm tròn xuống và tôn trọng trần giảm', () => {
    expect(
      quotePromotion(rule({ percentBp: 1250 }), cart({ subtotalVnd: 333_333 })),
    ).toMatchObject({ discountVnd: 41_666 })
    expect(
      quotePromotion(rule({ percentBp: 5000, maxDiscountVnd: 200_000 }), cart()),
    ).toMatchObject({ discountVnd: 200_000 })
  })

  it('giảm số tiền KHÔNG vượt quá tiền hàng — không có bill âm', () => {
    const r = rule({ kind: 'amount', percentBp: null, amountVnd: 50_000 })
    expect(quotePromotion(r, cart({ subtotalVnd: 30_000 }))).toMatchObject({ discountVnd: 30_000 })
  })

  it('tặng món chỉ tặng MỘT suất, không tặng cả dòng', () => {
    const r = rule({ kind: 'free_dish', percentBp: null, targetDishId: 'M-BO' })
    // Dòng 2 suất giá 600.000đ ⇒ tặng một suất là 300.000đ
    expect(quotePromotion(r, cart())).toMatchObject({ discountVnd: 300_000 })
  })

  it('tặng món mà giỏ không có món đó thì nói rõ, không âm thầm giảm 0đ', () => {
    const r = rule({ kind: 'free_dish', percentBp: null, targetDishId: 'M-CA' })
    expect(quotePromotion(r, cart())).toMatchObject({ reason: 'khong-co-mon-ap-dung' })
  })

  it('tặng món chọn dòng RẺ NHẤT khi cùng một món nằm trên hai dòng', () => {
    const r = rule({ kind: 'free_dish', percentBp: null, targetDishId: 'M-BO' })
    const quote = quotePromotion(
      r,
      cart({
        lines: [
          { dishId: 'M-BO', qty: 1, priceTotal: 450_000 },
          { dishId: 'M-BO', qty: 2, priceTotal: 600_000 },
        ],
      }),
    )
    expect(quote).toMatchObject({ discountVnd: 300_000 })
  })

  it('giá set khung giờ chỉ giảm phần chênh, và không bao giờ tăng giá', () => {
    const re = rule({
      kind: 'set_price',
      percentBp: null,
      targetDishId: 'M-BO',
      setPriceVnd: 199_000,
    })
    // Đơn giá đang là 300.000đ ⇒ giảm 101.000đ
    expect(quotePromotion(re, cart())).toMatchObject({ discountVnd: 101_000 })

    const dat = rule({
      kind: 'set_price',
      percentBp: null,
      targetDishId: 'M-BO',
      setPriceVnd: 500_000,
    })
    expect(quotePromotion(dat, cart())).toMatchObject({ reason: 'khong-giam-duoc-dong-nao' })
  })
})

describe('KHÔNG CỘNG DỒN — tự áp mức lợi nhất cho khách', () => {
  const giam10 = rule({ id: 1, code: 'KM-10PT', percentBp: 1000 })
  const giam50k = rule({ id: 2, code: 'KM-50K', kind: 'amount', percentBp: null, amountVnd: 50_000 })

  it('đơn lớn thì % thắng, đơn nhỏ thì số tiền thắng — cùng một bộ chương trình', () => {
    const lon = pickBestPromotion([giam10, giam50k], cart({ subtotalVnd: 1_000_000 }))
    expect(lon.best).toMatchObject({ code: 'KM-10PT', discountVnd: 100_000 })

    const nho = pickBestPromotion([giam10, giam50k], cart({ subtotalVnd: 300_000 }))
    expect(nho.best).toMatchObject({ code: 'KM-50K', discountVnd: 50_000 })
  })

  it('chỉ trả về MỘT chương trình — hai mức không bao giờ cộng vào nhau', () => {
    const pick = pickBestPromotion([giam10, giam50k], cart())
    expect(pick.eligible).toHaveLength(2)
    expect(pick.best?.discountVnd).toBe(100_000)
    // Tổng hai chương trình là 150.000đ; mức áp cho khách vẫn là 100.000đ
    expect(pick.eligible.reduce((s, q) => s + q.discountVnd, 0)).toBe(150_000)
  })

  it('hoà nhau thì chọn chương trình soạn trước — kết quả phải ổn định', () => {
    const a = rule({ id: 5, code: 'A', kind: 'amount', percentBp: null, amountVnd: 50_000 })
    const b = rule({ id: 3, code: 'B', kind: 'amount', percentBp: null, amountVnd: 50_000 })
    expect(pickBestPromotion([a, b], cart()).best?.code).toBe('B')
    expect(pickBestPromotion([b, a], cart()).best?.code).toBe('B')
  })

  it('không chương trình nào đủ điều kiện thì `best` rỗng và có đủ lý do từ chối', () => {
    const pick = pickBestPromotion(
      [rule({ id: 1, channels: ['web'] }), rule({ id: 2, minOrderVnd: 9_000_000 })],
      cart(),
    )
    expect(pick.best).toBeNull()
    expect(pick.rejected.map((r) => r.reason)).toEqual(['sai-kenh', 'chua-du-don-toi-thieu'])
  })
})
