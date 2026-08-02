import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  addMonths,
  amortize,
  approvalTierOf,
  depreciationFor,
  firstOfMonth,
  monthsBetween,
  needsAssetRecord,
} from './expense'

describe('lịch tháng', () => {
  it('quy về mùng 1', () => {
    expect(firstOfMonth('2026-08-17')).toBe('2026-08-01')
  })

  it('cộng tháng qua mốc năm', () => {
    expect(addMonths('2026-11-01', 3)).toBe('2027-02-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
  })

  it('đếm khoảng cách tháng', () => {
    expect(monthsBetween('2026-01-01', '2026-08-01')).toBe(7)
    expect(monthsBetween('2026-08-01', '2026-08-01')).toBe(0)
    expect(monthsBetween('2026-08-01', '2026-07-01')).toBe(-1)
  })
})

describe('phân bổ chi phí trả trước', () => {
  it('một tháng thì ghi hết vào tháng đó', () => {
    expect(amortize(5_000_000, 1, '2026-08-01')).toEqual([
      { month: '2026-08-01', amountVnd: 5_000_000 },
    ])
  })

  it('sáu tháng tiền nhà: tiền ra một lần, chi phí chia đều sáu tháng', () => {
    const slices = amortize(60_000_000, 6, '2026-08-01')
    expect(slices).toHaveLength(6)
    expect(slices[0]).toEqual({ month: '2026-08-01', amountVnd: 10_000_000 })
    expect(slices[5]!.month).toBe('2027-01-01')
  })

  it('TỔNG CÁC PHẦN LUÔN bằng đúng số gốc, kể cả khi chia không hết', () => {
    for (const [amount, months] of [
      [10_000_000, 3],
      [1, 7],
      [999_999_999, 13],
      [7, 3],
    ] as const) {
      const slices = amortize(amount, months, '2026-08-01')
      expect(slices.reduce((s, x) => s + x.amountVnd, 0), `${amount}/${months}`).toBe(amount)
    }
  })

  it('phần dư dồn vào tháng cuối, không rải lung tung', () => {
    const slices = amortize(10_000_000, 3, '2026-08-01')
    expect(slices.map((s) => s.amountVnd)).toEqual([3_333_333, 3_333_333, 3_333_334])
  })

  it('số tiền hoặc số tháng không hợp lệ bị chặn', () => {
    expect(() => amortize(0, 3, '2026-08-01')).toThrow()
    expect(() => amortize(1_000, 0, '2026-08-01')).toThrow()
    expect(() => amortize(1_000.5, 3, '2026-08-01')).toThrow()
  })
})

describe('khấu hao đường thẳng', () => {
  const asset = {
    costVnd: 36_000_000,
    inServiceFrom: '2026-01-01',
    depreciationMonths: 36,
  }

  it('mỗi tháng một phần đều nhau', () => {
    expect(depreciationFor(asset, '2026-01-01')).toBe(1_000_000)
    expect(depreciationFor(asset, '2026-08-15')).toBe(1_000_000)
  })

  it('chưa tới ngày đưa vào dùng thì chưa khấu hao', () => {
    expect(depreciationFor(asset, '2025-12-01')).toBe(0)
  })

  it('hết đời khấu hao thì dừng', () => {
    expect(depreciationFor(asset, '2028-12-01')).toBe(1_000_000) // tháng thứ 36
    expect(depreciationFor(asset, '2029-01-01')).toBe(0)
  })

  it('cộng cả đời khấu hao đúng bằng nguyên giá, kể cả khi chia lẻ', () => {
    const odd = { costVnd: 10_000_000, inServiceFrom: '2026-01-01', depreciationMonths: 7 }
    let total = 0
    for (let i = 0; i < 12; i++) total += depreciationFor(odd, addMonths('2026-01-01', i))
    expect(total).toBe(10_000_000)
  })

  it('thanh lý thì ngừng từ tháng thanh lý', () => {
    const retired = { ...asset, retiredOn: '2026-06-10' }
    expect(depreciationFor(retired, '2026-05-01')).toBe(1_000_000)
    expect(depreciationFor(retired, '2026-06-01')).toBe(0)
  })
})

describe('bậc duyệt phiếu chi', () => {
  it('dưới hạn mức chi vặt thì tự ghi', () => {
    expect(approvalTierOf(1_500_000, DEFAULT_THRESHOLDS)).toBe('tu-ghi')
    expect(approvalTierOf(2_000_000, DEFAULT_THRESHOLDS)).toBe('tu-ghi')
  })

  it('trên hạn mức thì kế toán duyệt', () => {
    expect(approvalTierOf(2_000_001, DEFAULT_THRESHOLDS)).toBe('ke-toan-duyet')
    expect(approvalTierOf(19_999_999, DEFAULT_THRESHOLDS)).toBe('ke-toan-duyet')
  })

  it('mức lớn thì chủ duyệt', () => {
    expect(approvalTierOf(20_000_000, DEFAULT_THRESHOLDS)).toBe('chu-duyet')
  })

  it('mua tài sản thì chủ duyệt bất kể số tiền', () => {
    expect(approvalTierOf(500_000, DEFAULT_THRESHOLDS, true)).toBe('chu-duyet')
  })
})

describe('ngưỡng ghi nhận tài sản', () => {
  it('mua thiết bị từ ngưỡng trở lên phải ghi thành tài sản', () => {
    expect(needsAssetRecord(6_000_000, 'depreciation', DEFAULT_THRESHOLDS)).toBe(true)
  })

  it('sửa chữa nhỏ dưới ngưỡng vào chi phí ngay', () => {
    expect(needsAssetRecord(1_200_000, 'depreciation', DEFAULT_THRESHOLDS)).toBe(false)
  })

  it('trả trước sáu tháng tiền nhà 60 triệu KHÔNG phải tài sản', () => {
    expect(needsAssetRecord(60_000_000, 'rent', DEFAULT_THRESHOLDS)).toBe(false)
  })
})
