import { describe, expect, it } from 'vitest'
import { formatKpiScore, formatKpiValue } from './kpi.js'

describe('Định dạng số KPI', () => {
  it('theo đơn vị của chỉ số, dấu phẩy thập phân', () => {
    expect(formatKpiValue(2_000_000_000, 'vnd')).toBe('2.000.000₫')
    expect(formatKpiValue(452_345_678, 'vnd-gio')).toBe('452.346₫/giờ công')
    expect(formatKpiValue(8_500, 'pct')).toBe('8,5%')
    expect(formatKpiValue(95_000, 'pct')).toBe('95%')
    expect(formatKpiValue(3_250, 'phut')).toBe('3,3 phút')
    expect(formatKpiValue(2_000, 'lan')).toBe('2 lần')
    expect(formatKpiValue(4_500, 'diem')).toBe('4,5 điểm')
  })

  it('điểm tổng một chữ số thập phân, có dấu nghìn', () => {
    expect(formatKpiScore(103_571)).toBe('103,6')
    expect(formatKpiScore(120_000)).toBe('120')
    expect(formatKpiScore(1_234_500)).toBe('1.234,5')
  })
})
