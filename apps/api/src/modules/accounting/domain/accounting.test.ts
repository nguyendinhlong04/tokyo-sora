import { describe, expect, it } from 'vitest'
import {
  assertInvoiceSerial,
  firstOfMonth,
  lastOfMonth,
  monthsInRange,
  nextInvoiceNo,
  reconcile,
  taxSummary,
  vatBuckets,
} from './accounting'

describe('lịch tháng', () => {
  it('quy về mùng 1 và ngày cuối', () => {
    expect(firstOfMonth('2026-08-17')).toBe('2026-08-01')
    expect(lastOfMonth('2026-02-01')).toBe('2026-02-28')
    expect(lastOfMonth('2028-02-01')).toBe('2028-02-29')
  })

  it('liệt kê mọi tháng một khoảng ngày chạm tới', () => {
    expect(monthsInRange('2026-08-15', '2026-08-20')).toEqual(['2026-08-01'])
    expect(monthsInRange('2026-11-20', '2027-01-05')).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
    ])
  })
})

describe('ký hiệu hoá đơn điện tử', () => {
  it('nhận ký hiệu 6 ký tự có chữ M', () => {
    expect(assertInvoiceSerial('C26MAA')).toBe('C26MAA')
    expect(assertInvoiceSerial('c26maa')).toBe('C26MAA')
  })

  it('thiếu chữ M bị chặn — đó là dấu của hoá đơn từ máy tính tiền', () => {
    expect(() => assertInvoiceSerial('C26AAA')).toThrow(/chữ M/)
  })

  it('sai độ dài bị chặn', () => {
    expect(() => assertInvoiceSerial('C26M')).toThrow()
    expect(() => assertInvoiceSerial('C26MAAA')).toThrow()
  })

  it('ký tự lạ bị chặn', () => {
    expect(() => assertInvoiceSerial('C26-MA')).toThrow()
  })
})

describe('số hoá đơn', () => {
  it('bắt đầu từ 1, đủ 8 chữ số', () => {
    expect(nextInvoiceNo(null)).toBe('00000001')
  })

  it('tăng dần', () => {
    expect(nextInvoiceNo('00000001')).toBe('00000002')
    expect(nextInvoiceNo('00000999')).toBe('00001000')
  })
})

describe('doanh thu theo thuế suất', () => {
  it('gộp các đơn cùng thuế suất', () => {
    const buckets = vatBuckets([
      { netVnd: 1_000_000, vatVnd: 80_000 },
      { netVnd: 500_000, vatVnd: 40_000 },
    ])
    expect(buckets).toEqual([{ rate: 0.08, netVnd: 1_500_000, vatVnd: 120_000 }])
  })

  it('tách các thuế suất khác nhau', () => {
    const buckets = vatBuckets([
      { netVnd: 1_000_000, vatVnd: 80_000 },
      { netVnd: 1_000_000, vatVnd: 100_000 },
      { netVnd: 1_000_000, vatVnd: 0 },
    ])
    expect(buckets.map((b) => b.rate)).toEqual([0, 0.08, 0.1])
  })

  it('sai số làm tròn không đẻ thêm dòng trên tờ khai', () => {
    const buckets = vatBuckets([
      { netVnd: 999_999, vatVnd: 80_000 },
      { netVnd: 1_000_001, vatVnd: 80_000 },
    ])
    expect(buckets).toHaveLength(1)
  })

  it('đơn doanh thu 0 không chia cho 0', () => {
    expect(vatBuckets([{ netVnd: 0, vatVnd: 0 }])).toEqual([
      { rate: 0, netVnd: 0, vatVnd: 0 },
    ])
  })

  it('danh sách rỗng ra bảng rỗng', () => {
    expect(vatBuckets([])).toEqual([])
  })
})

describe('tổng hợp thuế', () => {
  it('VAT phải nộp = đầu ra trừ đầu vào', () => {
    expect(taxSummary({ vatOutVnd: 5_000_000, vatInVnd: 2_000_000, pitWithheldVnd: 0 }))
      .toMatchObject({ vatPayableVnd: 3_000_000 })
  })

  it('đầu vào lớn hơn đầu ra ra số ÂM — được khấu trừ kỳ sau, không kẹp về 0', () => {
    expect(taxSummary({ vatOutVnd: 1_000_000, vatInVnd: 4_000_000, pitWithheldVnd: 0 })
      .vatPayableVnd).toBe(-3_000_000)
  })
})

describe('đối chiếu hoá đơn với doanh thu', () => {
  it('khớp thì không có gì phải làm', () => {
    expect(reconcile(10_000_000, 10_000_000).matched).toBe(true)
  })

  it('lệch thì nêu đúng số chênh', () => {
    const result = reconcile(10_000_000, 9_500_000)
    expect(result.matched).toBe(false)
    expect(result.diffVnd).toBe(500_000)
  })
})
