import { describe, expect, it } from 'vitest'
import { emberLevel, formatClock, isOverdue } from './ember'

describe('Thang than hồng — ngưỡng 40/70/100%', () => {
  it.each([
    [0, 'ash'],
    [0.39, 'ash'],
    [0.4, 'brass'],
    [0.69, 'brass'],
    [0.7, 'char'],
    [1, 'char'],
    [1.01, 'fire'],
    [3, 'fire'],
  ] as const)('tỉ lệ %s → %s', (ratio, expected) => {
    expect(emberLevel(ratio)).toBe(expected)
  })

  it('chỉ vé quá giờ mới nhấp nháy — KDS chỉ được một hiệu ứng', () => {
    expect(isOverdue(1)).toBe(false)
    expect(isOverdue(1.001)).toBe(true)
  })
})

describe('Đồng hồ vé', () => {
  it.each([
    [0, '00:00'],
    [59, '00:59'],
    [60, '01:00'],
    [742, '12:22'],
    [3599, '59:59'],
    [-90, '-01:30'],
  ])('%i giây → %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected)
  })
})
