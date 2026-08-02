import { describe, expect, it } from 'vitest'
import { classifyMenu, quadrantShift, type MenuItemStat } from './menu-matrix'

const item = (over: Partial<MenuItemStat> & { dishId: string }): MenuItemStat => ({
  code: over.dishId.toUpperCase(),
  name: over.dishId,
  qty: 0,
  revenue: 0,
  contribution: 0,
  ...over,
})

/**
 * Bốn món, 400 phần. Vạch phổ biến = 0,7 / 4 = 17,5%. Vạch đóng góp = tổng đóng
 * góp / tổng phần = 40.000.000 / 400 = 100.000₫/phần.
 */
const MENU: MenuItemStat[] = [
  // 50% số phần · 150k/phần → bán chạy, đóng góp cao
  item({ dishId: 'bachibo', qty: 200, revenue: 30_000_000, contribution: 30_000_000 }),
  // 37,5% · 40k/phần → bán chạy, đóng góp thấp
  item({ dishId: 'miso', qty: 150, revenue: 6_000_000, contribution: 6_000_000 }),
  // 7,5% · 120k/phần → ít người gọi nhưng đóng góp cao
  item({ dishId: 'sodiep', qty: 30, revenue: 3_600_000, contribution: 3_600_000 }),
  // 5% · 20k/phần → ít người gọi, đóng góp thấp
  item({ dishId: 'duamuoi', qty: 20, revenue: 400_000, contribution: 400_000 }),
]

const quadrantOf = (matrix: ReturnType<typeof classifyMenu>, dishId: string) =>
  matrix.rows.find((r) => r.dishId === dishId)!.quadrant

describe('ma trận món', () => {
  const matrix = classifyMenu(MENU)

  it('đặt vạch theo quy tắc 70% và đóng góp bình quân có trọng số', () => {
    expect(matrix.popularityCut).toBeCloseTo(0.175)
    expect(matrix.contributionCut).toBe(100_000)
  })

  it('xếp đủ bốn ô', () => {
    expect(quadrantOf(matrix, 'bachibo')).toBe('ngoi-sao')
    expect(quadrantOf(matrix, 'miso')).toBe('bo-sua')
    expect(quadrantOf(matrix, 'sodiep')).toBe('cau-do')
    expect(quadrantOf(matrix, 'duamuoi')).toBe('bo-di')
  })

  it('ngôi sao đứng đầu, cùng ô thì món bán nhiều đứng trên', () => {
    expect(matrix.rows.map((r) => r.dishId)).toEqual(['bachibo', 'miso', 'sodiep', 'duamuoi'])
  })

  it('cộng lại đúng tổng', () => {
    expect(matrix.totals).toEqual({
      dishes: 4,
      qty: 400,
      revenue: 40_000_000,
      contribution: 40_000_000,
    })
    expect(matrix.rows.reduce((s, r) => s + r.qtyShare, 0)).toBeCloseTo(1)
  })

  it('đóng góp bình quân mỗi phần tính trên chính món đó', () => {
    expect(matrix.rows.find((r) => r.dishId === 'miso')!.unitContribution).toBe(40_000)
  })
})

describe('trường hợp biên', () => {
  it('thực đơn rỗng không chia cho 0', () => {
    const matrix = classifyMenu([])
    expect(matrix.rows).toEqual([])
    expect(matrix.popularityCut).toBe(0)
    expect(matrix.contributionCut).toBe(0)
  })

  it('mọi món bán bằng nhau và lãi bằng nhau đều là ngôi sao', () => {
    const matrix = classifyMenu([
      item({ dishId: 'a', qty: 10, revenue: 100, contribution: 100 }),
      item({ dishId: 'b', qty: 10, revenue: 100, contribution: 100 }),
    ])
    expect(matrix.rows.every((r) => r.quadrant === 'ngoi-sao')).toBe(true)
  })

  it('món có kỳ nhưng không bán phần nào không làm hỏng phép chia', () => {
    const matrix = classifyMenu([
      item({ dishId: 'a', qty: 10, revenue: 1_000, contribution: 1_000 }),
      item({ dishId: 'b', qty: 0, revenue: 0, contribution: 0 }),
    ])
    expect(matrix.rows.find((r) => r.dishId === 'b')!.unitContribution).toBe(0)
    expect(quadrantOf(matrix, 'b')).toBe('bo-di')
  })
})

describe('dịch chuyển giữa hai kỳ', () => {
  it('chỉ ra ô của kỳ trước, món mới thì để trống', () => {
    const before = classifyMenu([
      item({ dishId: 'bachibo', qty: 10, revenue: 1_000_000, contribution: 1_000_000 }),
      item({ dishId: 'miso', qty: 10, revenue: 100_000, contribution: 100_000 }),
    ])
    const now = classifyMenu([
      item({ dishId: 'bachibo', qty: 10, revenue: 1_000_000, contribution: 1_000_000 }),
      item({ dishId: 'miso', qty: 10, revenue: 100_000, contribution: 100_000 }),
      item({ dishId: 'kemtra', qty: 5, revenue: 275_000, contribution: 275_000 }),
    ])

    const shift = quadrantShift(now, before)
    expect(shift.get('bachibo')).toBe('ngoi-sao')
    expect(shift.get('miso')).toBe('bo-sua')
    expect(shift.get('kemtra')).toBeNull()
  })
})
