import { describe, expect, it } from 'vitest'
import {
  allocateProductionCost,
  effectiveExpiry,
  expiryBand,
  pickFefo,
  shareByWeightBp,
  varianceOf,
  type LotForPick,
} from './lots'

const lot = (over: Partial<LotForPick> & { id: number }): LotForPick => ({
  qtyRemainBase: 1_000,
  expiresOn: '2026-09-01',
  receivedOn: '2026-08-01',
  ...over,
})

describe('FEFO — rút lô hạn gần nhất trước', () => {
  it('rút lô sắp hết hạn trước, dù nó nhập sau', () => {
    const { picks, shortBase } = pickFefo(
      [
        lot({ id: 1, expiresOn: '2026-09-20', receivedOn: '2026-08-01' }),
        lot({ id: 2, expiresOn: '2026-08-25', receivedOn: '2026-08-10' }),
      ],
      500,
    )
    expect(picks).toEqual([{ lotId: 2, qtyBase: 500 }])
    expect(shortBase).toBe(0)
  })

  it('rút hết lô đầu rồi mới sang lô sau', () => {
    const { picks } = pickFefo(
      [
        lot({ id: 1, qtyRemainBase: 300, expiresOn: '2026-08-25' }),
        lot({ id: 2, qtyRemainBase: 900, expiresOn: '2026-09-10' }),
      ],
      1_000,
    )
    expect(picks).toEqual([
      { lotId: 1, qtyBase: 300 },
      { lotId: 2, qtyBase: 700 },
    ])
  })

  /**
   * Rút con tôm hết hạn ngày mai trước gói muối là đúng. Lô không hạn mà đứng đầu
   * sẽ giữ mãi những con tôm đó trong tủ.
   */
  it('hàng không hạn xuống cuối, không chắn đường hàng có hạn', () => {
    const { picks } = pickFefo(
      [
        lot({ id: 1, qtyRemainBase: 400, expiresOn: null }),
        lot({ id: 2, qtyRemainBase: 400, expiresOn: '2026-08-20' }),
      ],
      500,
    )
    expect(picks[0]).toEqual({ lotId: 2, qtyBase: 400 })
    expect(picks[1]).toEqual({ lotId: 1, qtyBase: 100 })
  })

  it('cùng hạn thì lô nhập trước ra trước', () => {
    const { picks } = pickFefo(
      [
        lot({ id: 7, receivedOn: '2026-08-10' }),
        lot({ id: 3, receivedOn: '2026-08-02' }),
      ],
      100,
    )
    expect(picks[0]!.lotId).toBe(3)
  })

  it('lô đã hết không được chọn', () => {
    const { picks } = pickFefo(
      [lot({ id: 1, qtyRemainBase: 0, expiresOn: '2026-08-01' }), lot({ id: 2 })],
      100,
    )
    expect(picks).toEqual([{ lotId: 2, qtyBase: 100 }])
  })

  /**
   * Không đủ lô thì vẫn trả về phần rút được. Chặn hay không là việc của tầng
   * dịch vụ: món đã nấu rồi thì không chặn được, còn chuyển kho thì chặn.
   */
  it('thiếu hàng thì nói rõ thiếu bao nhiêu, không im lặng rút thiếu', () => {
    const { picks, shortBase } = pickFefo([lot({ id: 1, qtyRemainBase: 200 })], 500)
    expect(picks).toEqual([{ lotId: 1, qtyBase: 200 }])
    expect(shortBase).toBe(300)
  })

  it('không cần rút gì thì không chọn lô nào', () => {
    expect(pickFefo([lot({ id: 1 })], 0)).toEqual({ picks: [], shortBase: 0 })
  })
})

describe('hạn dùng thật của lô', () => {
  const opened = new Date('2026-08-01T10:00:00+07:00')

  it('lô nguyên lấy hạn in trên vỏ', () => {
    expect(
      effectiveExpiry({
        expiresOn: '2027-02-01',
        state: 'sealed',
        openedAt: null,
        openShelfLifeDays: 7,
      }),
    ).toBe('2027-02-01')
  })

  /** Bia trong keg đã đục hỏng sau 5–7 ngày dù vỏ ghi sáu tháng (§25 S9) */
  it('keg đã đục lấy ngày đục cộng hạn ngắn, không lấy hạn trên vỏ', () => {
    expect(
      effectiveExpiry({
        expiresOn: '2027-02-01',
        state: 'open',
        openedAt: opened,
        openShelfLifeDays: 7,
      }),
    ).toBe('2026-08-08')
  })

  it('hạn trên vỏ gần hơn thì lấy hạn trên vỏ — bia không tươi lại vì được đục ra', () => {
    expect(
      effectiveExpiry({
        expiresOn: '2026-08-03',
        state: 'open',
        openedAt: opened,
        openShelfLifeDays: 7,
      }),
    ).toBe('2026-08-03')
  })

  it('hàng không hạn mà đục ra thì có hạn kể từ lúc đục', () => {
    expect(
      effectiveExpiry({ expiresOn: null, state: 'open', openedAt: opened, openShelfLifeDays: 5 }),
    ).toBe('2026-08-06')
  })
})

describe('xếp mức hạn để tô màu', () => {
  it('phân đúng bốn mức', () => {
    expect(expiryBand('2026-08-01', '2026-08-03')).toBe('het-han')
    expect(expiryBand('2026-08-05', '2026-08-03')).toBe('sap-het')
    expect(expiryBand('2026-08-20', '2026-08-03')).toBe('con-han')
    expect(expiryBand(null, '2026-08-03')).toBe('khong-han')
  })

  it('hết hạn đúng hôm nay vẫn là sắp hết, chưa phải hết', () => {
    expect(expiryBand('2026-08-03', '2026-08-03')).toBe('sap-het')
  })
})

describe('chia giá lượt pha lóc (S7)', () => {
  /**
   * Ví dụ của §25: một tảng bò 12kg → nầm 2,1kg + dẻ sườn 3,4kg + hao 0,8kg.
   * Tổng ra 5,5kg nhỏ hơn 12kg vào, nhưng tiền vẫn phải chia hết — đó chính là
   * cách phần hao nằm lại trong giá của thịt dùng được.
   */
  it('tổng giá các đầu ra bằng đúng tổng giá đầu vào, dù trọng lượng hụt', () => {
    const rows = allocateProductionCost(3_600_000, [
      { ingredientId: 'nam-bo', qtyBase: 2_100, costShareBp: 4_500 },
      { ingredientId: 'de-suon', qtyBase: 3_400, costShareBp: 5_500 },
    ])
    expect(rows.reduce((sum, r) => sum + r.costVnd, 0)).toBe(3_600_000)
    expect(rows[0]!.costVnd).toBe(1_620_000)
    expect(rows[1]!.costVnd).toBe(1_980_000)
  })

  it('nầm bò đắt hơn dẻ sườn dù nhẹ hơn — chia theo giá trị, không theo cân', () => {
    const rows = allocateProductionCost(3_600_000, [
      { ingredientId: 'nam-bo', qtyBase: 2_100, costShareBp: 4_500 },
      { ingredientId: 'de-suon', qtyBase: 3_400, costShareBp: 5_500 },
    ])
    expect(rows[0]!.unitCostMilli).toBeGreaterThan(rows[1]!.unitCostMilli)
  })

  it('đồng lẻ dồn vào dòng lớn nhất, tổng không bao giờ lệch', () => {
    const rows = allocateProductionCost(1_000_001, [
      { ingredientId: 'a', qtyBase: 100, costShareBp: 3_333 },
      { ingredientId: 'b', qtyBase: 100, costShareBp: 3_333 },
      { ingredientId: 'c', qtyBase: 100, costShareBp: 3_334 },
    ])
    expect(rows.reduce((sum, r) => sum + r.costVnd, 0)).toBe(1_000_001)
  })

  it('tổng tỉ lệ khác 100% bị chặn — số tiền sẽ bốc hơi hoặc sinh ra từ hư không', () => {
    expect(() =>
      allocateProductionCost(1_000_000, [
        { ingredientId: 'a', qtyBase: 100, costShareBp: 4_000 },
        { ingredientId: 'b', qtyBase: 100, costShareBp: 4_000 },
      ]),
    ).toThrow(/100%/)
  })

  it('gợi ý chia theo cân luôn cộng đủ 100%', () => {
    const bp = shareByWeightBp([{ qtyBase: 2_100 }, { qtyBase: 3_400 }, { qtyBase: 1_000 }])
    expect(bp.reduce((sum, v) => sum + v, 0)).toBe(10_000)
  })
})

describe('chênh lệch công thức vs thực tế (S11)', () => {
  it('dùng nhiều hơn công thức là hao, tính ra tiền', () => {
    const v = varianceOf({ theoreticalBase: 10_000, actualBase: 11_000, costPerBaseMilli: 250 })
    expect(v.diffBase).toBe(1_000)
    expect(v.diffVnd).toBe(250)
    expect(v.ratio).toBeCloseTo(0.1)
  })

  /** Âm thường nghĩa là công thức khai thừa, không phải bếp tiết kiệm được */
  it('dùng ít hơn công thức ra số âm, không kẹp về 0', () => {
    const v = varianceOf({ theoreticalBase: 10_000, actualBase: 9_000, costPerBaseMilli: 250 })
    expect(v.diffBase).toBe(-1_000)
    expect(v.diffVnd).toBe(-250)
  })

  it('công thức không đòi gì mà vẫn dùng thì tỉ lệ để trống, không phải vô cực', () => {
    const v = varianceOf({ theoreticalBase: 0, actualBase: 500, costPerBaseMilli: 100 })
    expect(v.ratio).toBeNull()
    expect(v.diffVnd).toBe(50)
  })
})
