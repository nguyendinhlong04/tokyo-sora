import { describe, expect, it } from 'vitest'
import {
  FIXED_DISHES,
  LINH_HOAT_DISHES,
  NUONG_DISHES,
  SONG_DISHES,
  SUKIYAKI,
  routingOf,
} from './__fixtures__/section-16'
import { ST, type ServiceContext } from './routing'
import {
  TicketingError,
  buildTickets,
  fireBatch,
  type BuildTicketsInput,
  type DishInfo,
  type OrderLineForTicket,
} from './ticketing'

/** Tiền tố mã vé theo trạm — đọc từ prototype KDS (A-0412 ở ST-06, B-0412 ở ST-02) */
const PREFIXES: Record<string, string> = {
  [ST.GRILL]: 'A',
  [ST.RAW]: 'B',
  [ST.HOT2]: 'C',
  [ST.COLD]: 'D',
  [ST.HOT1]: 'E',
  [ST.BAR]: 'F',
}

const CATALOG: Record<string, DishInfo> = {
  ...Object.fromEntries(
    [...SONG_DISHES, ...NUONG_DISHES, ...LINH_HOAT_DISHES, ...FIXED_DISHES].map((d) => [
      d.id,
      { name: d.name, routing: routingOf(d) } satisfies DishInfo,
    ]),
  ),
  sukiyaki: { name: 'Lẩu Sukiyaki bò', routing: SUKIYAKI },
}

const NOW = new Date('2026-08-01T19:00:00+07:00')
const GRILL_TABLE: ServiceContext = { kind: 'dinein', tableCode: '12', tableHasGrill: true }
const PLAIN_TABLE: ServiceContext = { kind: 'dinein', tableCode: '05', tableHasGrill: false }

const line = (over: Partial<OrderLineForTicket> & { dishId: string }): OrderLineForTicket => ({
  lineId: `L-${over.dishId}`,
  kind: 'dish',
  qty: 1,
  batchNo: 1,
  ...over,
})

function build(over: Partial<BuildTicketsInput> & { lines: OrderLineForTicket[] }) {
  return buildTickets({
    order: { orderNumber: '0412', channel: 'pos', context: GRILL_TABLE },
    catalog: (id) => CATALOG[id],
    firedBatches: new Set([1]),
    stationPrefixes: PREFIXES,
    now: NOW,
    ...over,
  })
}

describe('Một vé cho MỖI (trạm × đợt)', () => {
  it('ba món cùng trạm cùng đợt gộp vào một vé', () => {
    const tickets = build({
      lines: [line({ dishId: 'bachibo' }), line({ dishId: 'nambo' }), line({ dishId: 'thanbo' })],
    })
    expect(tickets).toHaveLength(1)
    expect(tickets[0]!.station).toBe(ST.RAW)
    expect(tickets[0]!.items).toHaveLength(3)
  })

  it('món khác trạm tách thành vé riêng, cùng mang số đơn nhưng khác tiền tố', () => {
    const tickets = build({
      lines: [line({ dishId: 'bachibo' }), line({ dishId: 'milanh' }), line({ dishId: 'biatuoi' })],
    })
    expect(tickets.map((t) => t.displayCode).sort()).toEqual(['B-0412', 'C-0412', 'F-0412'])
  })

  it('cùng trạm nhưng khác đợt là hai vé', () => {
    const tickets = build({
      lines: [line({ dishId: 'bachibo', batchNo: 1 }), line({ dishId: 'nambo', batchNo: 2 })],
      firedBatches: new Set([1, 2]),
    })
    expect(tickets).toHaveLength(2)
    expect(tickets.map((t) => t.batchNo).sort()).toEqual([1, 2])
  })
})

describe('Dòng set không xuống bếp — chỉ món thành phần', () => {
  it('bỏ qua dòng set cha, giữ nhãn set trên từng món con', () => {
    const tickets = build({
      lines: [
        { lineId: 'L1', dishId: 'sora', kind: 'set_parent', qty: 1, batchNo: 1 },
        line({ lineId: 'L1a', dishId: 'bachibo', setLabel: 'SET SORA', portionLabel: '100g' }),
        line({ lineId: 'L1b', dishId: 'nambo', setLabel: 'SET SORA', portionLabel: '100g' }),
      ],
    })
    expect(tickets).toHaveLength(1)
    expect(tickets[0]!.items.map((i) => i.dishId)).toEqual(['bachibo', 'nambo'])
    expect(tickets[0]!.items.every((i) => i.setLabel === 'SET SORA')).toBe(true)
    expect(tickets[0]!.items[0]!.portionLabel).toBe('100g')
  })

  it('đơn chỉ có dòng set cha (dữ liệu hỏng) không sinh vé nào thay vì đẩy set xuống bếp', () => {
    const tickets = build({
      lines: [{ lineId: 'L1', dishId: 'sora', kind: 'set_parent', qty: 1, batchNo: 1 }],
    })
    expect(tickets).toEqual([])
  })
})

describe('Món đa trạm — Sukiyaki', () => {
  it('sinh 2 vé khác trạm, hai item chung linkGroup để Expo chờ đủ', () => {
    const tickets = build({ lines: [line({ lineId: 'L7', dishId: 'sukiyaki' })] })
    expect(tickets).toHaveLength(2)

    const pot = tickets.find((t) => t.station === ST.HOT2)!
    const tray = tickets.find((t) => t.station === ST.RAW)!
    expect(pot.items[0]!.componentLabel).toBe('nồi')
    expect(tray.items[0]!.componentLabel).toBe('khay thịt')
    expect(pot.items[0]!.linkGroup).toBe('L7')
    expect(tray.items[0]!.linkGroup).toBe('L7')
  })

  it('phần Sukiyaki gộp chung vé với món khác cùng trạm, linkGroup vẫn theo từng món', () => {
    const tickets = build({
      lines: [line({ lineId: 'L7', dishId: 'sukiyaki' }), line({ dishId: 'milanh' })],
    })
    const hot2 = tickets.find((t) => t.station === ST.HOT2)!
    expect(hot2.items).toHaveLength(2)
    expect(hot2.items.find((i) => i.dishId === 'sukiyaki')!.linkGroup).toBe('L7')
    expect(hot2.items.find((i) => i.dishId === 'milanh')!.linkGroup).toBeNull()
  })

  it('món một trạm không mang linkGroup', () => {
    const tickets = build({ lines: [line({ dishId: 'bachibo' })] })
    expect(tickets[0]!.items[0]!.linkGroup).toBeNull()
  })
})

describe('Đợt chưa ra — đồng hồ CHƯA chạy (điểm dễ sai §9.5)', () => {
  it('đợt chưa fire → vé waiting, không có mốc giờ', () => {
    const tickets = build({
      lines: [line({ dishId: 'bachibo', batchNo: 3 })],
      firedBatches: new Set([1]),
    })
    expect(tickets[0]).toMatchObject({ state: 'waiting', queuedAt: null, dueAt: null })
  })

  it('đợt đã fire → vé queued, dueAt = giờ vào hàng + thời gian chuẩn', () => {
    const tickets = build({ lines: [line({ dishId: 'bachibo' })] })
    expect(tickets[0]!.state).toBe('queued')
    expect(tickets[0]!.queuedAt).toEqual(NOW)
    expect(tickets[0]!.dueAt).toEqual(new Date(NOW.getTime() + 180_000))
  })

  it('bấm "Ra đợt tiếp" mới bắt đầu tính giờ, và chỉ cho đúng đợt đó', () => {
    const tickets = build({
      lines: [line({ dishId: 'bachibo', batchNo: 2 }), line({ dishId: 'milanh', batchNo: 3 })],
      firedBatches: new Set(),
    })
    const later = new Date(NOW.getTime() + 600_000)
    const fired = fireBatch(tickets, 2, later)

    const batch2 = fired.find((t) => t.batchNo === 2)!
    const batch3 = fired.find((t) => t.batchNo === 3)!
    expect(batch2).toMatchObject({ state: 'queued', queuedAt: later })
    expect(batch2.dueAt).toEqual(new Date(later.getTime() + 180_000))
    expect(batch3).toMatchObject({ state: 'waiting', queuedAt: null })
  })

  it('thời gian chuẩn của vé lấy theo món lâu nhất', () => {
    const tickets = build({
      lines: [line({ dishId: 'milanh' }), line({ dishId: 'sukiyaki' })],
    })
    const hot2 = tickets.find((t) => t.station === ST.HOT2)!
    expect(hot2.prepSeconds).toBe(600) // sukiyaki 600 > mì lạnh 420
  })
})

describe('Nướng hộ — vé ghi rõ lý do cho đầu bếp', () => {
  it('bàn không bếp: món SỐNG về ST-06, vé in "Bàn 05 không có bếp"', () => {
    const tickets = build({
      order: { orderNumber: '2841', channel: 'pos', context: PLAIN_TABLE },
      lines: [line({ dishId: 'bachibo' })],
    })
    expect(tickets[0]!.station).toBe(ST.GRILL)
    expect(tickets[0]!.grillServiceNote).toBe('Bàn 05 không có bếp')
    expect(tickets[0]!.items[0]!.grillService).toBe(true)
    expect(tickets[0]!.prepSeconds).toBe(180 + 480)
  })

  it('vé trộn món nướng hộ và món NƯỚNG thường vẫn in dòng giải thích một lần', () => {
    const tickets = build({
      order: { orderNumber: '2841', channel: 'pos', context: PLAIN_TABLE },
      lines: [line({ dishId: 'bachibo' }), line({ dishId: 'yakitori' })],
    })
    expect(tickets).toHaveLength(1)
    expect(tickets[0]!.grillServiceNote).toBe('Bàn 05 không có bếp')
    expect(tickets[0]!.items.map((i) => i.grillService)).toEqual([true, false])
  })

  it('bàn có bếp không bao giờ in dòng đó', () => {
    const tickets = build({ lines: [line({ dishId: 'bachibo' })] })
    expect(tickets[0]!.grillServiceNote).toBeNull()
  })
})

describe('Đơn online', () => {
  it('dùng tiền tố O bất kể trạm, không gắn số bàn', () => {
    const tickets = build({
      order: { orderNumber: '2841', channel: 'web', context: { kind: 'takeaway' } },
      lines: [line({ dishId: 'bachibo' }), line({ dishId: 'milanh' })],
    })
    expect(tickets.every((t) => t.displayCode === 'O-2841')).toBe(true)
    expect(tickets.every((t) => t.source === 'online' && t.tableCode === null)).toBe(true)
  })

  it('kênh ngoài (Grab) vẫn là nguồn online — bếp thấy một hàng đợi', () => {
    const tickets = build({
      order: { orderNumber: '9001', channel: 'grab', context: { kind: 'delivery' } },
      lines: [line({ dishId: 'bachibo' })],
    })
    expect(tickets[0]!.source).toBe('online')
  })

  it('đơn hẹn giờ mang về: startBy = giờ hẹn − nấu − đệm đóng gói', () => {
    const slotAt = new Date('2026-08-01T20:00:00+07:00')
    const tickets = build({
      order: { orderNumber: '2843', channel: 'web', context: { kind: 'takeaway' }, slotAt },
      lines: [line({ dishId: 'yakitori' })], // nấu 720s
    })
    // 20:00 − 720s − 300s = 19:43
    expect(tickets[0]!.startBy).toEqual(new Date('2026-08-01T19:43:00+07:00'))
  })

  it('đơn giao hàng dùng đệm giao dài hơn', () => {
    const slotAt = new Date('2026-08-01T20:00:00+07:00')
    const tickets = build({
      order: { orderNumber: '2843', channel: 'web', context: { kind: 'delivery' }, slotAt },
      lines: [line({ dishId: 'yakitori' })],
    })
    // 20:00 − 720s − 1200s = 19:28
    expect(tickets[0]!.startBy).toEqual(new Date('2026-08-01T19:28:00+07:00'))
  })

  it('đơn nhận ngay và đơn tại bàn không có mốc đếm ngược', () => {
    expect(build({ lines: [line({ dishId: 'bachibo' })] })[0]!.startBy).toBeNull()
    const asap = build({
      order: { orderNumber: '2844', channel: 'web', context: { kind: 'takeaway' } },
      lines: [line({ dishId: 'bachibo' })],
    })
    expect(asap[0]!.startBy).toBeNull()
  })

  it('đơn hẹn giờ chưa tới mốc phải nấu thì vé CHƯA vào hàng — đồng hồ chưa chạy', () => {
    // Hẹn 20:00, phải bắt đầu 19:43, mà bây giờ mới 19:00
    const tickets = build({
      order: {
        orderNumber: '2845',
        channel: 'web',
        context: { kind: 'takeaway' },
        slotMode: 'scheduled',
        slotAt: new Date('2026-08-01T20:00:00+07:00'),
      },
      lines: [line({ dishId: 'yakitori' })],
    })
    expect(tickets[0]).toMatchObject({ state: 'waiting', queuedAt: null, dueAt: null })
  })

  it('đơn hẹn giờ đã qua mốc phải nấu thì vào hàng ngay, không bắt chờ', () => {
    // Hẹn 19:10 ⇒ phải bắt đầu 18:53, đã trôi qua so với 19:00
    const tickets = build({
      order: {
        orderNumber: '2846',
        channel: 'web',
        context: { kind: 'takeaway' },
        slotMode: 'scheduled',
        slotAt: new Date('2026-08-01T19:10:00+07:00'),
      },
      lines: [line({ dishId: 'yakitori' })],
    })
    expect(tickets[0]).toMatchObject({ state: 'queued', queuedAt: NOW })
  })

  /**
   * Chốt chặn hồi quy: đơn `asap` CŨNG được gán `slotAt` (khung sớm nhất còn mở,
   * cách hiện tại `online.leadMinutes` — mặc định 30 phút), nên nó cũng có
   * `startBy` nằm ở tương lai. Nếu chỉ nhìn `startBy` mà giữ vé lại thì mọi đơn
   * "nhận ngay" đều nằm im ở K4 khoảng mười lăm phút trước khi bếp thấy.
   */
  it('đơn nhận ngay xuống bếp luôn, dù khung giờ của nó nằm ở tương lai', () => {
    const tickets = build({
      order: {
        orderNumber: '2847',
        channel: 'web',
        context: { kind: 'takeaway' },
        slotMode: 'asap',
        slotAt: new Date('2026-08-01T19:30:00+07:00'),
      },
      lines: [line({ dishId: 'yakitori' })],
    })
    expect(tickets[0]).toMatchObject({ state: 'queued', queuedAt: NOW })
    // Mốc vẫn được tính và gửi xuống KDS, chỉ là không dùng để giữ vé lại
    expect(tickets[0]!.startBy).toEqual(new Date('2026-08-01T19:13:00+07:00'))
  })

  it('đơn tại bàn không bị mốc hẹn giờ chạm tới', () => {
    const tickets = build({ lines: [line({ dishId: 'yakitori', batchNo: 1 })] })
    expect(tickets[0]).toMatchObject({ state: 'queued', queuedAt: NOW, startBy: null })
  })
})

describe('Bảo vệ dữ liệu hỏng', () => {
  it('món không có trong danh mục → ném lỗi rõ ràng thay vì tạo vé rỗng', () => {
    expect(() => build({ lines: [line({ dishId: 'khong-ton-tai' })] })).toThrow(TicketingError)
  })

  it('trạm chưa khai tiền tố mã vé → ném lỗi', () => {
    expect(() => build({ lines: [line({ dishId: 'bachibo' })], stationPrefixes: {} })).toThrow(
      /chưa khai tiền tố/,
    )
  })
})
