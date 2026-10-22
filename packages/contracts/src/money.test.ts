import { describe, expect, it } from 'vitest'
import { allocateByWeight, computeOrderTotals, formatVnd, roundToUnit, splitEven } from './money'

describe('roundToUnit — half-up theo bội số', () => {
  it.each([
    [914_499, 1000, 914_000],
    [914_500, 1000, 915_000],
    [914_501, 1000, 915_000],
    [915_000, 1000, 915_000],
    [0, 1000, 0],
    [500, 1000, 1000],
    [499, 1000, 0],
    [123_456, 1, 123_456],
  ])('%i (unit %i) → %i', (amount, unit, expected) => {
    expect(roundToUnit(amount, unit)).toBe(expected)
  })

  it('từ chối số không nguyên', () => {
    expect(() => roundToUnit(1.5, 1000)).toThrow(RangeError)
    expect(() => roundToUnit(1000, 0)).toThrow(RangeError)
  })
})

describe('computeOrderTotals — thứ tự phép tính cố định', () => {
  it('đơn mẫu trong TRIEN-KHAI §2.1: 890.000 + ship 25.000 = 915.000', () => {
    const t = computeOrderTotals({
      lines: [
        { qty: 2, unitPrice: 325_000, modifierDeltas: [0] },
        { qty: 1, unitPrice: 240_000 },
      ],
      ship: 25_000,
    })
    expect(t.sub).toBe(890_000)
    expect(t.total).toBe(915_000)
    expect(t.round).toBe(0)
  })

  it('modifier chênh giá cộng vào đơn giá từng dòng', () => {
    const t = computeOrderTotals({
      lines: [{ qty: 3, unitPrice: 45_000, modifierDeltas: [10_000, 5_000] }],
    })
    expect(t.sub).toBe(3 * 60_000)
  })

  it('giảm giá → phí phục vụ → VAT → làm tròn, chênh lưu vào round', () => {
    const t = computeOrderTotals({
      lines: [{ qty: 1, unitPrice: 287_000 }],
      discount: 10_000,
      serviceRate: 0.05,
      vatRate: 0.08,
      roundingUnit: 1000,
    })
    // base 277.000 · service floor(13.850)=13.850 · vat floor(0.08×290.850)=23.268
    expect(t.service).toBe(13_850)
    expect(t.vat).toBe(23_268)
    // 277.000+13.850+23.268 = 314.118 → 314.000, round = −118
    expect(t.total).toBe(314_000)
    expect(t.round).toBe(-118)
  })

  it('chặn discount âm hoặc vượt sub', () => {
    expect(() =>
      computeOrderTotals({ lines: [{ qty: 1, unitPrice: 100 }], discount: 200 }),
    ).toThrow(RangeError)
  })

  it('chặn qty và giá không nguyên', () => {
    expect(() => computeOrderTotals({ lines: [{ qty: 0, unitPrice: 100 }] })).toThrow()
    expect(() => computeOrderTotals({ lines: [{ qty: 1, unitPrice: 10.5 }] })).toThrow()
  })
})

describe('computeOrderTotals — VAT theo từng thuế suất (NĐ 254/2026)', () => {
  /** 2 phần ba chỉ 285.000 (món ăn 8%) + 2 chai bia 95.000 (10%), giảm hoá đơn 10% */
  const bill = {
    lines: [
      { qty: 2, unitPrice: 285_000, billDiscount: 57_000, vatRateBp: 800 },
      { qty: 2, unitPrice: 95_000, billDiscount: 19_000, vatRateBp: 1000 },
    ],
  }

  it('bill có món ăn 8% và bia 10%: thuế tính riêng từng thuế suất', () => {
    const t = computeOrderTotals(bill)
    expect(t.sub).toBe(760_000)
    expect(t.discount).toBe(76_000)
    expect(t.byRate).toEqual([
      { rateBp: 800, goods: 570_000, discount: 57_000, service: 0, net: 513_000, vat: 41_040 },
      { rateBp: 1000, goods: 190_000, discount: 19_000, service: 0, net: 171_000, vat: 17_100 },
    ])
    expect(t.vat).toBe(58_140)
    // 684.000 + 58.140 = 742.140 → làm tròn 742.000
    expect(t.total).toBe(742_000)
    expect(t.round).toBe(-140)
  })

  it('phí phục vụ chia về các thuế suất theo giá tính thuế, tổng khớp từng đồng', () => {
    const t = computeOrderTotals({ ...bill, serviceRate: 0.05 })
    expect(t.service).toBe(34_200)
    expect(t.byRate.map((r) => r.service)).toEqual([25_650, 8_550])
    // 8% × 538.650 = 43.092 · 10% × 179.550 = 17.955
    expect(t.byRate.map((r) => r.vat)).toEqual([43_092, 17_955])
    expect(t.vat).toBe(61_047)
  })

  it('lời gọi cũ chỉ có tổng giảm: chia về dòng theo tiền món, ra cùng tiền thuế', () => {
    const t = computeOrderTotals({
      lines: [
        { qty: 2, unitPrice: 285_000, vatRateBp: 800 },
        { qty: 2, unitPrice: 95_000, vatRateBp: 1000 },
      ],
      discount: 76_000,
    })
    expect(t.byRate.map((r) => r.discount)).toEqual([57_000, 19_000])
    expect(t.vat).toBe(58_140)
  })

  it('dòng không khai thuế suất thì theo vatRate của đơn — một thuế suất như trước', () => {
    const t = computeOrderTotals({
      lines: [{ qty: 1, unitPrice: 287_000, discount: 10_000 }],
      serviceRate: 0.05,
      vatRate: 0.08,
    })
    expect(t.byRate).toEqual([
      { rateBp: 800, goods: 287_000, discount: 10_000, service: 13_850, net: 290_850, vat: 23_268 },
    ])
    expect(t.total).toBe(314_000)
  })

  it('tính bằng số nguyên: 29% của 100₫ là 29₫, không phải 28,999… làm tròn xuống', () => {
    expect(computeOrderTotals({ lines: [{ qty: 1, unitPrice: 100 }], vatRate: 0.29 }).vat).toBe(29)
  })

  it('tổng giảm khác tổng giảm của các dòng là lỗi, không đoán', () => {
    expect(() => computeOrderTotals({ ...bill, discount: 70_000 })).toThrow(RangeError)
  })

  it('chặn giảm của một dòng vượt tiền món của dòng đó', () => {
    expect(() =>
      computeOrderTotals({
        lines: [{ qty: 1, unitPrice: 50_000, discount: 30_000, billDiscount: 30_000 }],
      }),
    ).toThrow(RangeError)
  })

  it('chặn thuế suất ngoài [0%, 100%]', () => {
    expect(() =>
      computeOrderTotals({ lines: [{ qty: 1, unitPrice: 100, vatRateBp: 12_000 }] }),
    ).toThrow(RangeError)
    expect(() =>
      computeOrderTotals({ lines: [{ qty: 1, unitPrice: 100 }], vatRate: -0.1 }),
    ).toThrow(RangeError)
  })

  it('đơn chưa có món: không có dòng thuế suất nào', () => {
    expect(computeOrderTotals({ lines: [] }).byRate).toEqual([])
  })
})

describe('allocateByWeight — phần dư lớn nhất', () => {
  it('50.000 chia theo 297.000 / 35.000 → 44.729 / 5.271', () => {
    expect(allocateByWeight(50_000, [297_000, 35_000])).toEqual([44_729, 5_271])
  })

  it('hoà phần lẻ thì phần đứng trước nhận đồng dư', () => {
    expect(allocateByWeight(1, [1, 1])).toEqual([1, 0])
    expect(allocateByWeight(5, [1, 1, 1])).toEqual([2, 2, 1])
  })

  it('trọng số 0 không bao giờ nhận đồng nào', () => {
    expect(allocateByWeight(10, [0, 3, 0, 1])).toEqual([0, 8, 0, 2])
  })

  it('tổng luôn đúng, kể cả số lớn vượt 2^53 khi nhân', () => {
    const parts = allocateByWeight(900_000_001, [30_000_000, 70_000_003, 1])
    expect(parts.reduce((s, p) => s + p, 0)).toBe(900_000_001)
  })

  it('không có gì để chia mà vẫn đòi chia là lỗi', () => {
    expect(allocateByWeight(0, [0, 0])).toEqual([0, 0])
    expect(() => allocateByWeight(1, [0, 0])).toThrow(RangeError)
    expect(() => allocateByWeight(1, [-1, 2])).toThrow(RangeError)
  })
})

describe('splitEven — largest remainder', () => {
  it.each([
    [915_000, 3, [305_000, 305_000, 305_000]],
    [100_001, 3, [33_334, 33_334, 33_333]],
    [100, 3, [34, 33, 33]],
    [7, 1, [7]],
  ])('%i chia %i', (total, n, expected) => {
    const parts = splitEven(total, n)
    expect(parts).toEqual(expected)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
  })
})

describe('formatVnd', () => {
  it.each([
    [285_000, '285.000₫'],
    [0, '0₫'],
    [1_234_567, '1.234.567₫'],
    [-5_000, '−5.000₫'],
  ])('%i → %s', (amount, expected) => {
    expect(formatVnd(amount)).toBe(expected)
  })
})
