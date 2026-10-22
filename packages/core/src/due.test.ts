import { describe, expect, it } from 'vitest'
import { dueLabel } from './due'

// 22/10/2026 10:00 giờ Việt Nam
const now = new Date('2026-10-22T03:00:00Z')

describe('dueLabel — nhãn hạn theo giờ Việt Nam', () => {
  it('quá hạn đếm phút, giờ, ngày', () => {
    expect(dueLabel('2026-10-22T02:59:30Z', now)).toBe('Quá hạn 1 phút')
    expect(dueLabel('2026-10-22T02:20:00Z', now)).toBe('Quá hạn 40 phút')
    expect(dueLabel('2026-10-21T23:00:00Z', now)).toBe('Quá hạn 4 giờ')
    expect(dueLabel('2026-10-19T03:00:00Z', now)).toBe('Quá hạn 3 ngày')
  })

  it('hôm nay, mai, ngày khác — theo ngày ở Việt Nam chứ không theo UTC', () => {
    expect(dueLabel('2026-10-22T07:30:00Z', now)).toBe('Hạn 14:30 hôm nay')
    // 23:30 UTC ngày 22 là 06:30 sáng 23 ở Việt Nam
    expect(dueLabel('2026-10-22T23:30:00Z', now)).toBe('Hạn 06:30 mai')
    expect(dueLabel('2026-10-25T09:00:00Z', now)).toBe('Hạn 25/10 16:00')
  })
})
