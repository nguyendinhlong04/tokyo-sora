import { describe, expect, it } from 'vitest'
import { activeOf } from './active'

describe('activeOf', () => {
  it('chi nhánh không ghi đè, hoặc ghi đè mà để trống trạng thái: theo cấp chuỗi', () => {
    for (const chain of [true, false]) {
      const dish = { active: chain }
      expect(activeOf(dish, undefined)).toBe(chain)
      expect(activeOf(dish, null)).toBe(chain)
      // Ghi đè chỉ để đổi giá thì trạng thái vẫn là của chuỗi
      expect(activeOf(dish, { active: null })).toBe(chain)
    }
  })

  it('"Tắt ở chi nhánh này" tắt món chuỗi đang bán', () => {
    expect(activeOf({ active: true }, { active: false })).toBe(false)
    expect(activeOf({ active: true }, { active: true })).toBe(true)
  })

  it('chuỗi ngừng bán thì ghi đè của chi nhánh không bán lại được', () => {
    expect(activeOf({ active: false }, { active: true })).toBe(false)
    expect(activeOf({ active: false }, { active: false })).toBe(false)
  })
})
