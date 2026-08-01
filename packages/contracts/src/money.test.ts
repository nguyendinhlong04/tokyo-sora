import { describe, expect, it } from 'vitest'
import { computeOrderTotals, formatVnd, roundToUnit, splitEven } from './money'

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
