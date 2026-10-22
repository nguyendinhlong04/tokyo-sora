import { describe, expect, it } from 'vitest'
import {
  badgeOf,
  dishOffer,
  nextBillHint,
  percentLabel,
  priceBill,
  priceNewLines,
  ruleRunsAt,
  type NewPricingLine,
  type PricedLine,
  type PromoClock,
  type PromoContext,
  type PromotionRule,
} from './promotions'

const rule = (over: Partial<PromotionRule>): PromotionRule => ({
  id: 1,
  code: 'KM-1',
  name: 'Chương trình 1',
  badge: null,
  scope: 'item',
  kind: 'percent',
  percentBp: 1000,
  amountVnd: null,
  setPriceVnd: null,
  buyQty: null,
  getQty: null,
  getPercent: null,
  giftDishId: null,
  targetDishIds: ['bachi'],
  targetCategoryIds: [],
  maxDiscountVnd: null,
  channels: [],
  branchIds: [],
  weekdays: [],
  fromMinute: null,
  toMinute: null,
  minOrderVnd: 0,
  requiresVoucher: false,
  concentrated: false,
  startsOn: '2026-10-01',
  endsOn: '2026-10-31',
  ...over,
})

const ctx: PromoContext = {
  branchId: 'cg',
  channel: 'table',
  voucherPromotionIds: [],
  maxDiscountRate: 0.5,
}
/** Thứ năm 22/10/2026, 18:30 */
const at: PromoClock = { businessDate: '2026-10-22', weekday: 4, minuteOfDay: 18 * 60 + 30 }

const add = (over: Partial<NewPricingLine>): NewPricingLine => ({
  key: 'n1',
  dishId: 'bachi',
  categoryId: 'yaki',
  qty: 1,
  unitPrice: 285_000,
  basePrice: 285_000,
  ...over,
})

const had = (over: Partial<PricedLine>): PricedLine => ({
  key: 'o1',
  dishId: 'bachi',
  categoryId: 'yaki',
  qty: 1,
  unitPrice: 285_000,
  at,
  promotionId: null,
  discountVnd: 0,
  promoQty: 0,
  ...over,
})

describe('Điều kiện chạy', () => {
  it('ngoài lịch · sai kênh · sai chi nhánh · sai thứ thì không chạy', () => {
    expect(ruleRunsAt(rule({ endsOn: '2026-10-21' }), ctx, at)).toBe(false)
    expect(ruleRunsAt(rule({ channels: ['web'] }), ctx, at)).toBe(false)
    expect(ruleRunsAt(rule({ branchIds: ['hk'] }), ctx, at)).toBe(false)
    expect(ruleRunsAt(rule({ weekdays: [5, 6] }), ctx, at)).toBe(false)
    expect(
      ruleRunsAt(rule({ channels: ['table'], branchIds: ['cg'], weekdays: [4] }), ctx, at),
    ).toBe(true)
  })

  it('khung giờ mở ở đầu, đóng ở cuối — 19:00 không còn thuộc giờ vàng 17:00–19:00', () => {
    const vang = rule({ fromMinute: 17 * 60, toMinute: 19 * 60 })
    expect(ruleRunsAt(vang, ctx, { ...at, minuteOfDay: 17 * 60 })).toBe(true)
    expect(ruleRunsAt(vang, ctx, { ...at, minuteOfDay: 19 * 60 })).toBe(false)
  })

  it('chương trình cần mã chỉ mở bằng mã của chính nó', () => {
    const can = rule({ id: 7, requiresVoucher: true })
    expect(ruleRunsAt(can, ctx, at)).toBe(false)
    expect(ruleRunsAt(can, { ...ctx, voucherPromotionIds: [8] }, at)).toBe(false)
    expect(ruleRunsAt(can, { ...ctx, voucherPromotionIds: [7] }, at)).toBe(true)
  })
})

describe('Chương trình món — chấm lúc gọi, đóng băng vào dòng', () => {
  it('giảm % theo món, áp theo nhóm món cũng được', () => {
    const r = priceNewLines(
      [rule({ targetDishIds: [], targetCategoryIds: ['yaki'], percentBp: 2000 })],
      ctx,
      at,
      [],
      [add({ qty: 2 })],
    )
    expect(r.get('n1')).toEqual({ promotionId: 1, discountVnd: 114_000, promoQty: 2 })
  })

  it('giảm % tính trên cả tuỳ chọn; đồng giá chỉ thay giá món, tuỳ chọn vẫn tính', () => {
    const line = add({ unitPrice: 300_000, basePrice: 285_000 })
    expect(
      priceNewLines([rule({ percentBp: 1000 })], ctx, at, [], [line]).get('n1')?.discountVnd,
    ).toBe(30_000)
    expect(
      priceNewLines(
        [rule({ kind: 'set_price', percentBp: null, setPriceVnd: 199_000 })],
        ctx,
        at,
        [],
        [line],
      ).get('n1')?.discountVnd,
    ).toBe(86_000)
  })

  it('đồng giá cao hơn giá đang bán thì không giảm và không bao giờ tăng giá', () => {
    const r = priceNewLines(
      [rule({ kind: 'set_price', percentBp: null, setPriceVnd: 300_000 })],
      ctx,
      at,
      [],
      [add({})],
    )
    expect(r.has('n1')).toBe(false)
  })

  it('trần luật 50%: khai giảm 70% vẫn chỉ giảm một nửa — trừ khuyến mại tập trung', () => {
    const r = priceNewLines([rule({ percentBp: 7000 })], ctx, at, [], [add({})])
    expect(r.get('n1')?.discountVnd).toBe(142_500)
    const tapTrung = priceNewLines(
      [rule({ percentBp: 7000, concentrated: true })],
      ctx,
      at,
      [],
      [add({})],
    )
    expect(tapTrung.get('n1')?.discountVnd).toBe(199_500)
  })

  it('mỗi dòng lấy chương trình lợi nhất cho dòng đó; hoà thì chương trình soạn trước', () => {
    const rules = [
      rule({ id: 1, percentBp: 1000 }),
      rule({ id: 2, kind: 'amount', percentBp: null, amountVnd: 40_000 }),
      rule({ id: 3, kind: 'amount', percentBp: null, amountVnd: 40_000 }),
    ]
    expect(priceNewLines(rules, ctx, at, [], [add({})]).get('n1')?.promotionId).toBe(2)
  })

  it('trần mỗi đơn tính cả phần các dòng cũ đã ăn', () => {
    const cap = rule({ percentBp: 2000, maxDiscountVnd: 100_000 })
    const old = had({ promotionId: 1, discountVnd: 57_000, promoQty: 1 })
    const r = priceNewLines([cap], ctx, at, [old], [add({})])
    expect(r.get('n1')?.discountVnd).toBe(43_000)
  })

  it('đơn tối thiểu tính cả các dòng đã gọi trước', () => {
    const min = rule({ minOrderVnd: 500_000 })
    expect(priceNewLines([min], ctx, at, [], [add({})]).has('n1')).toBe(false)
    expect(priceNewLines([min], ctx, at, [had({})], [add({})]).has('n1')).toBe(true)
  })

  it('món không nằm trong danh sách thì không được giảm', () => {
    expect(priceNewLines([rule({})], ctx, at, [], [add({ dishId: 'nambo' })]).size).toBe(0)
  })
})

describe('Mua N tặng M', () => {
  const bia = rule({
    kind: 'buy_x_get_y',
    percentBp: null,
    buyQty: 2,
    getQty: 1,
    getPercent: 100,
    targetDishIds: ['asahi'],
  })
  const asahi = (over: Partial<NewPricingLine>) =>
    add({ dishId: 'asahi', categoryId: 'bia', unitPrice: 75_000, basePrice: 75_000, ...over })

  it('gọi ba chai một lần: tặng một chai', () => {
    expect(priceNewLines([bia], ctx, at, [], [asahi({ qty: 3 })]).get('n1')).toEqual({
      promotionId: 1,
      discountVnd: 75_000,
      promoQty: 1,
    })
  })

  it('hai chai gọi trước cộng một chai gọi sau là đủ — chai sau được tặng', () => {
    const old = had({ dishId: 'asahi', categoryId: 'bia', qty: 2, unitPrice: 75_000 })
    expect(priceNewLines([bia], ctx, at, [old], [asahi({})]).get('n1')?.discountVnd).toBe(75_000)
  })

  it('đã tặng rồi thì không tặng lại cho tới khi đủ nhóm tiếp theo', () => {
    const old = had({
      dishId: 'asahi',
      categoryId: 'bia',
      qty: 3,
      unitPrice: 75_000,
      promotionId: 1,
      discountVnd: 75_000,
      promoQty: 1,
    })
    expect(priceNewLines([bia], ctx, at, [old], [asahi({ qty: 2 })]).has('n1')).toBe(false)
    expect(priceNewLines([bia], ctx, at, [old], [asahi({ qty: 3 })]).get('n1')?.promoQty).toBe(1)
  })

  it('phần gọi NGOÀI giờ chương trình không tính là đã mua', () => {
    const vang = { ...bia, fromMinute: 17 * 60, toMinute: 19 * 60 }
    const truoc = had({
      dishId: 'asahi',
      categoryId: 'bia',
      qty: 2,
      unitPrice: 75_000,
      at: { ...at, minuteOfDay: 16 * 60 },
    })
    expect(priceNewLines([vang], ctx, at, [truoc], [asahi({})]).has('n1')).toBe(false)
  })

  it('tặng phần rẻ nhất trong các phần mới gọi', () => {
    const r = priceNewLines(
      [{ ...bia, targetDishIds: ['asahi', 'sapporo'] }],
      ctx,
      at,
      [],
      [
        asahi({ key: 'a', qty: 2 }),
        asahi({ key: 's', dishId: 'sapporo', unitPrice: 85_000, basePrice: 85_000 }),
      ],
    )
    expect(r.get('a')).toEqual({ promotionId: 1, discountVnd: 75_000, promoQty: 1 })
    expect(r.has('s')).toBe(false)
  })

  it('giảm theo từng phần đi trước — món có giờ vàng không đồng thời được "mua 2 tặng 1"', () => {
    const dongGia = rule({
      id: 2,
      kind: 'set_price',
      percentBp: null,
      setPriceVnd: 39_000,
      targetDishIds: ['asahi'],
    })
    const r = priceNewLines([bia, dongGia], ctx, at, [], [asahi({ qty: 3 })])
    expect(r.get('n1')).toEqual({ promotionId: 2, discountVnd: 108_000, promoQty: 3 })
  })
})

describe('Chương trình hoá đơn — chấm lại mỗi lần đơn đổi', () => {
  const lines = [
    had({ key: 'a', qty: 2 }),
    had({ key: 'b', dishId: 'miso', categoryId: 'sup', unitPrice: 45_000 }),
  ]

  it('giảm % hoá đơn khi đủ đơn tối thiểu, có trần', () => {
    const r = rule({
      scope: 'bill',
      targetDishIds: [],
      percentBp: 1000,
      minOrderVnd: 500_000,
      maxDiscountVnd: 50_000,
    })
    expect(priceBill([r], ctx, at, lines)).toEqual({ promotionId: 1, discountVnd: 50_000 })
    expect(priceBill([{ ...r, minOrderVnd: 700_000 }], ctx, at, lines)).toBeNull()
  })

  it('món đã được giảm món thì hoá đơn không giảm thêm trên món đó', () => {
    const r = rule({ scope: 'bill', targetDishIds: [], percentBp: 1000 })
    const daGiam = [
      had({ key: 'a', qty: 2, promotionId: 9, discountVnd: 57_000, promoQty: 2 }),
      lines[1]!,
    ]
    expect(priceBill([r], ctx, at, daGiam)?.discountVnd).toBe(4_500)
  })

  it('mua 2 tặng 1 gọi một lượt: hai phần phải trả vẫn được giảm hoá đơn', () => {
    const r = rule({ scope: 'bill', targetDishIds: [], percentBp: 1000 })
    const motDong = [had({ key: 'a', qty: 3, promotionId: 9, discountVnd: 285_000, promoQty: 1 })]
    const haiDong = [
      had({ key: 'a', qty: 2 }),
      had({ key: 'b', qty: 1, promotionId: 9, discountVnd: 285_000, promoQty: 1 }),
    ]
    expect(priceBill([r], ctx, at, motDong)?.discountVnd).toBe(57_000)
    expect(priceBill([r], ctx, at, haiDong)?.discountVnd).toBe(57_000)
  })

  it('giảm số tiền không vượt tiền món và không vượt trần luật', () => {
    const r = rule({
      scope: 'bill',
      targetDishIds: [],
      kind: 'amount',
      percentBp: null,
      amountVnd: 400_000,
    })
    expect(priceBill([r], ctx, at, lines)?.discountVnd).toBe(307_500)
  })

  it('tặng món: một phần rẻ nhất, khi phần mua đủ mức và đủ món điều kiện', () => {
    const kem = had({ key: 'k', dishId: 'kemtra', categoryId: 'ngot', unitPrice: 65_000 })
    const tang = rule({
      scope: 'bill',
      kind: 'free_dish',
      percentBp: null,
      giftDishId: 'kemtra',
      targetDishIds: ['bachi'],
      minOrderVnd: 500_000,
    })
    expect(priceBill([tang], ctx, at, [...lines, kem])).toEqual({
      promotionId: 1,
      discountVnd: 65_000,
    })
    // Không gọi món tặng thì không có gì để tặng
    expect(priceBill([tang], ctx, at, lines)).toBeNull()
    // Thiếu món điều kiện
    expect(
      priceBill([tang], ctx, at, [
        lines[1]!,
        kem,
        had({ key: 'z', dishId: 'thanbo', unitPrice: 500_000 }),
      ]),
    ).toBeNull()
  })

  it('món tặng quá nửa giá trị phần mua thì không được tặng (trừ khuyến mại tập trung)', () => {
    const lau = had({ key: 'l', dishId: 'sukiyaki', categoryId: 'lau', unitPrice: 480_000 })
    const tang = rule({
      scope: 'bill',
      kind: 'free_dish',
      percentBp: null,
      giftDishId: 'sukiyaki',
      targetDishIds: [],
    })
    const mua = [had({ key: 'a' }), lau]
    expect(priceBill([tang], ctx, at, mua)).toBeNull()
    expect(priceBill([{ ...tang, concentrated: true }], ctx, at, mua)?.discountVnd).toBe(480_000)
  })

  it('nhiều chương trình đủ điều kiện: lấy cái giảm nhiều nhất cho khách', () => {
    const phanTram = rule({ id: 1, scope: 'bill', targetDishIds: [], percentBp: 1000 })
    const tien = rule({
      id: 2,
      scope: 'bill',
      targetDishIds: [],
      kind: 'amount',
      percentBp: null,
      amountVnd: 70_000,
    })
    expect(priceBill([phanTram, tien], ctx, at, lines)?.promotionId).toBe(2)
    const to = [...lines, had({ key: 'c', dishId: 'thanbo', unitPrice: 600_000 })]
    expect(priceBill([phanTram, tien], ctx, at, to)?.promotionId).toBe(1)
  })
})

describe('Hiển thị cho khách', () => {
  it('thẻ món in giá giảm của chương trình lợi nhất, kèm nhãn', () => {
    const offer = dishOffer([rule({ percentBp: 2000, badge: 'Giờ vàng' })], ctx, at, {
      id: 'bachi',
      categoryId: 'yaki',
      price: 285_000,
    })
    expect(offer).toEqual({ promotionId: 1, price: 228_000, badge: 'Giờ vàng' })
  })

  it('chương trình đòi đơn tối thiểu không in lên thẻ món', () => {
    expect(
      dishOffer([rule({ minOrderVnd: 500_000 })], ctx, at, {
        id: 'bachi',
        categoryId: 'yaki',
        price: 285_000,
      }),
    ).toBeNull()
  })

  it('"mua N tặng M" chỉ in nhãn, giá giữ nguyên', () => {
    const bia = rule({
      kind: 'buy_x_get_y',
      percentBp: null,
      buyQty: 2,
      getQty: 1,
      getPercent: 100,
      targetDishIds: ['asahi'],
    })
    expect(dishOffer([bia], ctx, at, { id: 'asahi', categoryId: 'bia', price: 75_000 })).toEqual({
      promotionId: 1,
      price: 75_000,
      badge: 'Mua 2 tặng 1',
    })
  })

  it('gợi ý chương trình hoá đơn gần đạt nhất', () => {
    const r = rule({
      scope: 'bill',
      targetDishIds: [],
      percentBp: 1000,
      minOrderVnd: 1_000_000,
      name: 'Giảm 10%',
    })
    expect(nextBillHint([r], ctx, at, [had({})])).toMatchObject({
      promotionId: 1,
      missingVnd: 715_000,
    })
    expect(nextBillHint([r], ctx, at, [had({ qty: 4 })])).toBeNull()
  })

  it('nhãn theo loại khi người soạn không đặt', () => {
    expect(badgeOf(rule({ percentBp: 1250 }))).toBe('−12,5%')
    expect(badgeOf(rule({ kind: 'amount', percentBp: null, amountVnd: 20_000 }))).toBe('−20k')
    expect(badgeOf(rule({ kind: 'set_price', percentBp: null, setPriceVnd: 1_150_000 }))).toBe(
      'Đồng giá 1.150k',
    )
    expect(
      badgeOf(rule({ kind: 'buy_x_get_y', percentBp: null, buyQty: 1, getQty: 1, getPercent: 50 })),
    ).toBe('Mua 1, phần sau −50%')
    expect(percentLabel(1000)).toBe('10%')
  })
})
