import { describe, expect, it } from 'vitest'
import {
  ALL_GRILL_DISHES,
  FIXED_DISHES,
  LINH_HOAT_DISHES,
  NUONG_DISHES,
  SONG_DISHES,
  SUKIYAKI,
  routingOf,
} from './__fixtures__/section-16'
import {
  DEFAULT_ROUTING_PARAMS,
  ST,
  possibleStations,
  presetRouting,
  resolveRouting,
  type ServiceContext,
} from './routing'

const GRILL_TABLE: ServiceContext = { kind: 'dinein', tableCode: '12', tableHasGrill: true }
const PLAIN_TABLE: ServiceContext = { kind: 'dinein', tableCode: '05', tableHasGrill: false }
const TAKEAWAY: ServiceContext = { kind: 'takeaway' }
const DELIVERY: ServiceContext = { kind: 'delivery' }

describe('§16 — bảng phân loại 27 món nướng', () => {
  it('đủ 27 món: 16 SỐNG + 6 NƯỚNG + 5 LINH HOẠT', () => {
    expect(SONG_DISHES).toHaveLength(16)
    expect(NUONG_DISHES).toHaveLength(6)
    expect(LINH_HOAT_DISHES).toHaveLength(5)
    expect(ALL_GRILL_DISHES).toHaveLength(27)
  })

  describe.each(SONG_DISHES)('SỐNG · $name', (dish) => {
    const routing = routingOf(dish)
    it('bàn CÓ bếp → ST-02, khách tự nướng', () => {
      const r = resolveRouting(routing, GRILL_TABLE)
      expect(r.primary.station).toBe(ST.RAW)
      expect(r.grillService).toBe(false)
      expect(r.primary.prepSeconds).toBe(dish.prepSeconds)
    })
    it('bàn KHÔNG bếp → ST-06 nướng hộ, +8 phút, vé ghi rõ lý do', () => {
      const r = resolveRouting(routing, PLAIN_TABLE)
      expect(r.primary.station).toBe(ST.GRILL)
      expect(r.grillService).toBe(true)
      expect(r.primary.prepSeconds).toBe(dish.prepSeconds + 480)
      expect(r.grillServiceNote).toBe('Bàn 05 không có bếp')
    })
  })

  describe.each(NUONG_DISHES)('NƯỚNG · $name', (dish) => {
    const routing = routingOf(dish)
    it('luôn ST-06 dù bàn nào', () => {
      expect(resolveRouting(routing, GRILL_TABLE).primary.station).toBe(ST.GRILL)
      expect(resolveRouting(routing, PLAIN_TABLE).primary.station).toBe(ST.GRILL)
    })
    it('không phải "nướng hộ" — bếp nướng là mặc định, không cộng thêm giờ', () => {
      const r = resolveRouting(routing, PLAIN_TABLE)
      expect(r.grillService).toBe(false)
      expect(r.grillServiceNote).toBeNull()
      expect(r.primary.prepSeconds).toBe(dish.prepSeconds)
    })
  })

  describe.each(LINH_HOAT_DISHES)('LINH HOẠT · $name', (dish) => {
    const routing = routingOf(dish)
    it('bàn có bếp → ST-02 · bàn không bếp → ST-06', () => {
      expect(resolveRouting(routing, GRILL_TABLE).primary.station).toBe(ST.RAW)
      expect(resolveRouting(routing, PLAIN_TABLE).primary.station).toBe(ST.GRILL)
    })
  })

  describe.each(FIXED_DISHES)('CỐ ĐỊNH · $name', (dish) => {
    const routing = routingOf(dish)
    it('mọi ngữ cảnh đều về đúng một trạm, không bao giờ nướng hộ', () => {
      for (const ctx of [GRILL_TABLE, PLAIN_TABLE, TAKEAWAY, DELIVERY]) {
        const r = resolveRouting(routing, ctx)
        expect(r.primary.station).toBe(dish.station)
        expect(r.grillService).toBe(false)
        expect(r.primary.prepSeconds).toBe(dish.prepSeconds)
      }
    })
  })
})

describe('Đơn mang về / giao hàng — không có bàn nên đi nhánh không-bếp', () => {
  it.each([...SONG_DISHES, ...LINH_HOAT_DISHES])('$name → ST-06 nướng hộ', (dish) => {
    for (const ctx of [TAKEAWAY, DELIVERY]) {
      const r = resolveRouting(routingOf(dish), ctx)
      expect(r.primary.station).toBe(ST.GRILL)
      expect(r.grillService).toBe(true)
      // Không có bàn ⇒ không in dòng "Bàn X không có bếp"
      expect(r.grillServiceNote).toBeNull()
    }
  })

  it('nhánh mang về ghi đè được độc lập với nhánh không-bếp (M6 khai 4 nhánh riêng)', () => {
    // VD "Set nướng mang về": thịt sống đóng gói cho khách tự nướng ở nhà
    const routing = { ...routingOf(SONG_DISHES[0]!), stationTakeaway: ST.RAW }
    expect(resolveRouting(routing, TAKEAWAY).primary.station).toBe(ST.RAW)
    expect(resolveRouting(routing, TAKEAWAY).grillService).toBe(false)
    // giao hàng không khai riêng ⇒ vẫn rơi về nhánh không-bếp
    expect(resolveRouting(routing, DELIVERY).primary.station).toBe(ST.GRILL)
  })
})

describe('Món đa trạm — lẩu Sukiyaki', () => {
  it('sinh 2 phần: nồi ST-04 + khay thịt ST-02, mỗi phần có nhãn thành phần', () => {
    const r = resolveRouting(SUKIYAKI, GRILL_TABLE)
    expect(r.primary).toMatchObject({ station: ST.HOT2, componentLabel: 'nồi' })
    expect(r.secondary).toMatchObject({ station: ST.RAW, componentLabel: 'khay thịt' })
  })

  it('món một trạm không có phần phụ và không mang nhãn thành phần', () => {
    const r = resolveRouting(routingOf(NUONG_DISHES[0]!), GRILL_TABLE)
    expect(r.secondary).toBeNull()
    expect(r.primary.componentLabel).toBeNull()
  })
})

describe('Tham số nướng hộ đọc từ Trung tâm tham số A6', () => {
  it('mặc định +8 phút đúng như M6 prototype', () => {
    expect(DEFAULT_ROUTING_PARAMS.grillServiceExtraSeconds).toBe(480)
  })

  it('đổi tham số là đổi thời gian chuẩn, không phải sửa code', () => {
    const r = resolveRouting(routingOf(SONG_DISHES[0]!), PLAIN_TABLE, {
      grillServiceExtraSeconds: 600,
    })
    expect(r.primary.prepSeconds).toBe(180 + 600)
  })
})

describe('possibleStations — nguồn cho màn xem trước định tuyến M6', () => {
  it('món SỐNG có thể rơi vào ST-02 hoặc ST-06', () => {
    expect(possibleStations(routingOf(SONG_DISHES[0]!)).sort()).toEqual([ST.RAW, ST.GRILL].sort())
  })

  it('món cố định chỉ một trạm', () => {
    expect(possibleStations(routingOf(FIXED_DISHES[0]!))).toEqual([ST.COLD])
  })

  it('món đa trạm liệt kê cả trạm phụ', () => {
    expect(possibleStations(SUKIYAKI).sort()).toEqual([ST.HOT2, ST.RAW].sort())
  })
})

describe('presetRouting', () => {
  it('preset "fixed" thiếu station là lỗi lập trình, phải ném ngay', () => {
    expect(() => presetRouting('fixed', { prepSeconds: 180 })).toThrow(/cần chỉ định station/)
  })

  it('song và linh_hoat cho cùng bộ 4 nhánh — khác nhau ở nhãn cho khách, không ở định tuyến', () => {
    const song = presetRouting('song', { prepSeconds: 180 })
    const linh = presetRouting('linh_hoat', { prepSeconds: 180 })
    const { method: _m1, ...songBranches } = song
    const { method: _m2, ...linhBranches } = linh
    expect(songBranches).toEqual(linhBranches)
  })
})
