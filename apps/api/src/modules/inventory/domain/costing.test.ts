import { describe, expect, it } from 'vitest'
import {
  dishCost,
  effectiveQtyBase,
  foodCost,
  foodCostBand,
  lineCostVnd,
  movingAverageMilli,
  prepCost,
  stockRatio,
  type RecipeLineInput,
} from './costing'

const line = (over: Partial<RecipeLineInput> & { ingredientId: string }): RecipeLineInput => ({
  qtyBase: 100,
  wasteBp: 0,
  costPerBaseMilli: 1_000,
  ...over,
})

describe('hao hụt cộng vào lượng phải xuất', () => {
  it('bia tươi: cốc 500ml hao hụt bọt 6% thì kho xuất 530ml', () => {
    expect(effectiveQtyBase(1, 500, 600)).toBe(530)
  })

  it('không hao hụt thì xuất đúng định lượng', () => {
    expect(effectiveQtyBase(1, 150, 0)).toBe(150)
  })

  it('nhân số phần trước, làm tròn một lần — 10 phần khong lech so voi 1 phan x10', () => {
    // 150 × 1,025 = 153,75. Lam tron tung phan roi nhan: 154 × 10 = 1540 (sai).
    expect(effectiveQtyBase(10, 150, 250)).toBe(1538)
  })

  it('hao hụt tính bằng điểm cơ bản nên khai được số lẻ', () => {
    expect(effectiveQtyBase(1, 1_000, 250)).toBe(1_025)
  })
})

describe('giá vốn một dòng công thức', () => {
  it('quy đổi phần nghìn đồng về đồng nguyên', () => {
    // 200g thịt, giá 285.000₫/kg = 285₫/g = 285.000 phần nghìn đồng/g
    expect(lineCostVnd(line({ ingredientId: 'bo', qtyBase: 200, costPerBaseMilli: 285_000 }))).toBe(
      57_000,
    )
  })

  it('nguyên liệu rẻ không bị làm tròn về 0', () => {
    // Đá lạnh 800₫/kg = 0,8₫/g = 800 phần nghìn đồng/g; 250g đá = 200₫
    expect(lineCostVnd(line({ ingredientId: 'da', qtyBase: 250, costPerBaseMilli: 800 }))).toBe(200)
  })

  it('cộng cả hao hụt', () => {
    // 500ml bia hao 6% = 530ml; keg 20L giá 1.200.000₫ = 60₫/ml
    expect(
      lineCostVnd(line({ ingredientId: 'keg', qtyBase: 500, wasteBp: 600, costPerBaseMilli: 60_000 })),
    ).toBe(31_800)
  })
})

describe('giá vốn món và cột đóng góp', () => {
  const BACHIBO: RecipeLineInput[] = [
    // 200g ba chỉ bò @285₫/g = 57.000₫
    line({ ingredientId: 'bo', qtyBase: 200, costPerBaseMilli: 285_000 }),
    // 50g hành tây @12₫/g = 600₫
    line({ ingredientId: 'hanhtay', qtyBase: 50, costPerBaseMilli: 12_000 }),
    // 30ml sốt @80₫/ml = 2.400₫
    line({ ingredientId: 'sot', qtyBase: 30, costPerBaseMilli: 80_000 }),
  ]

  it('tổng bằng đúng tổng các dòng đã làm tròn', () => {
    const result = dishCost(BACHIBO)
    expect(result.costVnd).toBe(60_000)
    expect(result.lines.reduce((s, l) => s + l.costVnd, 0)).toBe(result.costVnd)
  })

  it('cột đóng góp cộng lại bằng 100%', () => {
    const result = dishCost(BACHIBO)
    expect(result.lines[0]!.share).toBeCloseTo(0.95)
    expect(result.lines.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1)
  })

  it('công thức rỗng ra 0 và không chia cho 0', () => {
    const result = dishCost([])
    expect(result.costVnd).toBe(0)
    expect(result.lines).toEqual([])
  })

  it('nguyên liệu chưa có giá thì đóng góp 0, không phải NaN', () => {
    const result = dishCost([line({ ingredientId: 'x', costPerBaseMilli: 0 })])
    expect(result.costVnd).toBe(0)
    expect(result.lines[0]!.share).toBe(0)
  })
})

describe('giá vốn mẻ bán thành phẩm (M8)', () => {
  const NUOC_DUNG: RecipeLineInput[] = [
    // 3kg xương @18₫/g = 54.000₫
    line({ ingredientId: 'xuong', qtyBase: 3_000, costPerBaseMilli: 18_000 }),
    // 500g hành @12₫/g = 6.000₫
    line({ ingredientId: 'hanh', qtyBase: 500, costPerBaseMilli: 12_000 }),
  ]

  it('chia tiền mẻ cho sản lượng ra giá mỗi ml', () => {
    // 60.000₫ cho 8.000ml = 7,5₫/ml = 7.500 phần nghìn đồng
    const result = prepCost(NUOC_DUNG, 8_000)
    expect(result.costVnd).toBe(60_000)
    expect(result.costPerBaseMilli).toBe(7_500)
  })

  it('giữ được giá dưới một đồng mỗi ml thay vì làm tròn thành 1₫', () => {
    // 240.000₫ pha loãng ra 400.000ml = 0,6₫/ml
    const result = prepCost([line({ ingredientId: 'siro', qtyBase: 1_000, costPerBaseMilli: 240_000 })], 400_000)
    expect(result.costPerBaseMilli).toBe(600)
  })

  it('chưa khai sản lượng thì giá là CHƯA BIẾT, không phải 0', () => {
    expect(prepCost(NUOC_DUNG, 0).costPerBaseMilli).toBeNull()
  })

  it('vẫn trả cột đóng góp của từng nguyên liệu như bảng công thức món', () => {
    const result = prepCost(NUOC_DUNG, 8_000)
    expect(result.lines[0]!.share).toBeCloseTo(0.9)
    expect(result.lines.reduce((s, l) => s + l.costVnd, 0)).toBe(result.costVnd)
  })
})

describe('food cost', () => {
  it('ba ngưỡng đúng theo §24 M4', () => {
    expect(foodCostBand(0.299)).toBe('tot')
    expect(foodCostBand(0.3)).toBe('canh-bao')
    expect(foodCostBand(0.38)).toBe('canh-bao')
    expect(foodCostBand(0.381)).toBe('bao-dong')
  })

  it('tính phần trăm và lãi gộp', () => {
    const result = foodCost(60_000, 285_000, true)
    expect(result.percent).toBeCloseTo(0.2105)
    expect(result.band).toBe('tot')
    expect(result.grossProfitVnd).toBe(225_000)
  })

  it('món CHƯA khai công thức tra ve "chua-co", khong phai 0%', () => {
    const result = foodCost(0, 285_000, false)
    expect(result.percent).toBeNull()
    expect(result.band).toBe('chua-co')
    expect(result.grossProfitVnd).toBeNull()
  })

  it('món có công thức mà nguyên liệu chưa có giá thì vẫn là 0%, khác với chưa khai', () => {
    const result = foodCost(0, 285_000, true)
    expect(result.percent).toBe(0)
    expect(result.band).toBe('tot')
  })

  it('giá bán 0 thì không có food cost để tính', () => {
    expect(foodCost(60_000, 0, true).percent).toBeNull()
  })
})

describe('giá bình quân gia quyền di động', () => {
  it('kho rỗng thì lô mới quyết định giá', () => {
    // 12kg = 12.000g, 3.420.000₫ ⇒ 285₫/g
    expect(movingAverageMilli({ onHandBase: 0, currentMilli: 0, inBase: 12_000, inTotalVnd: 3_420_000 }))
      .toBe(285_000)
  })

  it('trộn theo trọng số của lượng, không phải trung bình cộng hai giá', () => {
    // Còn 1.000g @300₫/g, nhập 9.000g @200₫/g ⇒ (300.000 + 1.800.000)/10.000 = 210₫/g
    expect(
      movingAverageMilli({
        onHandBase: 1_000,
        currentMilli: 300_000,
        inBase: 9_000,
        inTotalVnd: 1_800_000,
      }),
    ).toBe(210_000)
  })

  it('tồn âm bị coi như 0 — lô mới tự quyết định giá', () => {
    const withNegative = movingAverageMilli({
      onHandBase: -5_000,
      currentMilli: 300_000,
      inBase: 1_000,
      inTotalVnd: 200_000,
    })
    expect(withNegative).toBe(200_000)
    expect(withNegative).toBeGreaterThan(0)
  })

  it('nhập lượng 0 hoặc âm bị chặn', () => {
    expect(() =>
      movingAverageMilli({ onHandBase: 100, currentMilli: 1, inBase: 0, inTotalVnd: 1 }),
    ).toThrow()
  })

  it('nhập hàng biếu giá 0 kéo giá bình quân xuống, không nổ', () => {
    expect(
      movingAverageMilli({ onHandBase: 1_000, currentMilli: 200_000, inBase: 1_000, inTotalVnd: 0 }),
    ).toBe(100_000)
  })
})

describe('mức tồn trên thang than hồng', () => {
  it('cạn là nóng, đầy là nguội', () => {
    expect(stockRatio(0, 1_000)).toBe(1)
    expect(stockRatio(500, 1_000)).toBe(0.5)
    expect(stockRatio(1_000, 1_000)).toBe(0)
  })

  it('trên định mức vẫn là 0, không âm', () => {
    expect(stockRatio(5_000, 1_000)).toBe(0)
  })

  it('chưa khai định mức thì không có thang nào để đo', () => {
    expect(stockRatio(500, 0)).toBeNull()
  })
})
