import { describe, expect, it } from 'vitest'
import { agingOf, daysBetween, type AgingBuckets } from './aging'

const empty = (): AgingBuckets => ({
  currentVnd: 0,
  d0to30Vnd: 0,
  d31to60Vnd: 0,
  over60Vnd: 0,
  totalVnd: 0,
  maxOverdueDays: 0,
})

const TODAY = '2026-08-02'

describe('Tuổi nợ đếm từ NGÀY ĐẾN HẠN, không từ ngày ghi nợ', () => {
  it('chưa tới hạn thì không phải nợ quá hạn — kể cả khi đến hạn đúng hôm nay', () => {
    expect(agingOf(empty(), 1_000_000, '2026-08-30', TODAY)).toMatchObject({
      currentVnd: 1_000_000,
      d0to30Vnd: 0,
      maxOverdueDays: 0,
    })
    expect(agingOf(empty(), 1_000_000, TODAY, TODAY)).toMatchObject({
      currentVnd: 1_000_000,
      maxOverdueDays: 0,
    })
  })

  it('ba khoang của §25 B15, kiểm đúng hai đầu mỗi khoang', () => {
    expect(agingOf(empty(), 100, '2026-08-01', TODAY).d0to30Vnd).toBe(100)
    expect(agingOf(empty(), 100, '2026-07-03', TODAY).d0to30Vnd).toBe(100) // 30 ngày
    expect(agingOf(empty(), 100, '2026-07-02', TODAY).d31to60Vnd).toBe(100) // 31 ngày
    expect(agingOf(empty(), 100, '2026-06-03', TODAY).d31to60Vnd).toBe(100) // 60 ngày
    expect(agingOf(empty(), 100, '2026-06-02', TODAY).over60Vnd).toBe(100) // 61 ngày
  })

  it('cộng dồn nhiều dòng và nhớ khoản quá hạn LÂU NHẤT', () => {
    let bucket = empty()
    bucket = agingOf(bucket, 500_000, '2026-08-30', TODAY) // chưa tới hạn
    bucket = agingOf(bucket, 300_000, '2026-07-20', TODAY) // quá 13 ngày
    bucket = agingOf(bucket, 200_000, '2026-05-01', TODAY) // quá 93 ngày

    expect(bucket).toEqual({
      currentVnd: 500_000,
      d0to30Vnd: 300_000,
      d31to60Vnd: 0,
      over60Vnd: 200_000,
      totalVnd: 1_000_000,
      maxOverdueDays: 93,
    })
  })
})

describe('daysBetween', () => {
  it('đếm được cả chiều âm và vắt qua tháng', () => {
    expect(daysBetween('2026-08-02', '2026-08-02')).toBe(0)
    expect(daysBetween('2026-07-31', '2026-08-02')).toBe(2)
    expect(daysBetween('2026-08-05', '2026-08-02')).toBe(-3)
  })
})
