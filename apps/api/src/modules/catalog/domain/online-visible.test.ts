import { describe, expect, it } from 'vitest'
import { onlineVisibleOf } from './online-visible'

describe('onlineVisibleOf', () => {
  it('chi nhánh không ghi đè, hoặc ghi đè mà để trống cờ online: theo cấp chuỗi', () => {
    for (const chain of [true, false]) {
      const dish = { onlineVisible: chain }
      expect(onlineVisibleOf(dish, undefined)).toBe(chain)
      expect(onlineVisibleOf(dish, null)).toBe(chain)
      // Ghi đè chỉ để đổi giá thì cờ online vẫn là của chuỗi
      expect(onlineVisibleOf(dish, { onlineVisible: null })).toBe(chain)
    }
  })

  it('cờ chi nhánh đè cấp chuỗi cả hai chiều', () => {
    expect(onlineVisibleOf({ onlineVisible: false }, { onlineVisible: true })).toBe(true)
    expect(onlineVisibleOf({ onlineVisible: true }, { onlineVisible: false })).toBe(false)
  })
})
