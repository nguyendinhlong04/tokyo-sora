import { describe, expect, it } from 'vitest'
import { addDays, daysInRange, delta, listDays, resolvePeriod } from './period'

describe('cắt kỳ', () => {
  it('ngày là chính nó', () => {
    const p = resolvePeriod({ kind: 'ngay', compare: 'ky-truoc', anchor: '2026-08-02' })
    expect(p.current).toEqual({ from: '2026-08-02', to: '2026-08-02' })
    expect(p.days).toBe(1)
  })

  it('tuần bắt đầu thứ Hai — 2026-08-02 là Chủ nhật nên thuộc tuần 27/7', () => {
    const p = resolvePeriod({ kind: 'tuan', compare: 'ky-truoc', anchor: '2026-08-02' })
    expect(p.current).toEqual({ from: '2026-07-27', to: '2026-08-02' })
    expect(p.days).toBe(7)
  })

  it('tuần neo vào chính thứ Hai không nhảy về tuần trước', () => {
    const p = resolvePeriod({ kind: 'tuan', compare: 'ky-truoc', anchor: '2026-07-27' })
    expect(p.current.from).toBe('2026-07-27')
  })

  it('tháng lấy đúng ngày cuối, kể cả tháng 2 năm nhuận', () => {
    expect(resolvePeriod({ kind: 'thang', compare: 'ky-truoc', anchor: '2026-02-15' }).current)
      .toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(resolvePeriod({ kind: 'thang', compare: 'ky-truoc', anchor: '2028-02-15' }).current)
      .toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('quý gom đúng ba tháng', () => {
    expect(resolvePeriod({ kind: 'quy', compare: 'ky-truoc', anchor: '2026-08-02' }).current)
      .toEqual({ from: '2026-07-01', to: '2026-09-30' })
    expect(resolvePeriod({ kind: 'quy', compare: 'ky-truoc', anchor: '2026-01-31' }).current)
      .toEqual({ from: '2026-01-01', to: '2026-03-31' })
  })

  it('kỳ tuỳ chọn nhận đúng khoảng người chọn', () => {
    const p = resolvePeriod({
      kind: 'tuy-chon',
      compare: 'ky-truoc',
      anchor: '2026-08-02',
      from: '2026-07-10',
      to: '2026-07-20',
    })
    expect(p.current).toEqual({ from: '2026-07-10', to: '2026-07-20' })
    expect(p.days).toBe(11)
  })

  it('kỳ tuỳ chọn ngược đầu bị chặn', () => {
    expect(() =>
      resolvePeriod({
        kind: 'tuy-chon',
        compare: 'ky-truoc',
        anchor: '2026-08-02',
        from: '2026-07-20',
        to: '2026-07-10',
      }),
    ).toThrow()
  })

  it('ngày sai định dạng bị chặn ngay, không lặng lẽ ra NaN', () => {
    expect(() => resolvePeriod({ kind: 'ngay', compare: 'ky-truoc', anchor: '2/8/2026' })).toThrow()
  })
})

describe('mốc so sánh', () => {
  it('kỳ liền trước lùi đúng độ dài kỳ, không lùi theo lịch', () => {
    const p = resolvePeriod({ kind: 'thang', compare: 'ky-truoc', anchor: '2026-03-15' })
    // Tháng 3 có 31 ngày ⇒ lùi 31 ngày, KHÔNG phải "tháng 2"
    expect(p.baseline).toEqual({ from: '2026-01-29', to: '2026-02-28' })
    expect(daysInRange(p.baseline)).toBe(daysInRange(p.current))
  })

  it('cùng kỳ tuần trước lùi 7 ngày', () => {
    const p = resolvePeriod({ kind: 'ngay', compare: 'tuan-truoc', anchor: '2026-08-02' })
    expect(p.baseline).toEqual({ from: '2026-07-26', to: '2026-07-26' })
  })

  it('cùng kỳ năm trước giữ nguyên THỨ trong tuần', () => {
    const p = resolvePeriod({ kind: 'ngay', compare: 'nam-truoc', anchor: '2026-08-02' })
    const day = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()
    expect(day(p.baseline.from)).toBe(day(p.current.from))
  })
})

describe('tiện ích lịch', () => {
  it('cộng ngày qua mốc tháng và năm', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('liệt kê ngày gồm cả hai đầu', () => {
    expect(listDays({ from: '2026-08-01', to: '2026-08-03' })).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
  })
})

describe('chênh lệch', () => {
  it('tính đúng phần trăm', () => {
    expect(delta(120, 100)).toEqual({ value: 120, previous: 100, diff: 20, percent: 0.2 })
  })

  it('kỳ trước bằng 0 thì không có phần trăm', () => {
    expect(delta(120, 0).percent).toBeNull()
  })
})
