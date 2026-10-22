import { describe, expect, it } from 'vitest'
import { priceOf, type BranchPrices } from './price'

/** Ba chỉ bò: tại quán 285.000₫, online cấp chuỗi 315.000₫ */
const dish = { basePrice: 285_000, onlinePrice: 315_000 }
const branch = (patch: Partial<BranchPrices>): BranchPrices => ({
  price: null,
  onlinePrice: null,
  ...patch,
})

describe('priceOf', () => {
  it('web: giá online chi nhánh → giá chi nhánh → giá online chuỗi → giá tại quán', () => {
    expect(priceOf(dish, branch({ price: 300_000, onlinePrice: 299_000 }), 'web')).toBe(299_000)
    expect(priceOf(dish, branch({ price: 300_000 }), 'web')).toBe(300_000)
    expect(priceOf(dish, undefined, 'web')).toBe(315_000)
    expect(priceOf({ basePrice: 285_000, onlinePrice: null }, null, 'web')).toBe(285_000)
  })

  it('tại bàn, POS và kênh ngoài nhập tay không đọc giá online', () => {
    const both = branch({ onlinePrice: 299_000 })
    for (const channel of ['table', 'pos', 'grab', 'shopee', 'be']) {
      expect(priceOf(dish, both, channel)).toBe(285_000)
      expect(priceOf(dish, branch({ price: 300_000, onlinePrice: 299_000 }), channel)).toBe(300_000)
    }
  })
})
