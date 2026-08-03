/**
 * Nghiệm thu GĐ1 — trọn vòng vận hành tại bàn, chạy qua HTTP thật trên Postgres
 * thật. Đây là kịch bản exit trong kế hoạch: mở ca → mở bàn có bếp và bàn không
 * bếp → gọi set + món LINH HOẠT + món đa trạm → gửi bếp → ra đợt → nấu → xong →
 * thu tiền → đóng bàn → đóng ca khớp quỹ.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { IDEMPOTENCY_HEADER } from '@sora/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import {
  auditLog,
  devices,
  journalEntries,
  outboxEvents,
  stockMoves,
  ticketItems,
  tickets,
} from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const SEED_DEVICE = 'seed-device-token'
/** Phiên của thu ngân — người thao tác chính trên POS */
let cashier: string
/** Phiên của bếp — bấm nút trên KDS */
let chef: string
let waiter: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)

async function login(staffId: number, deviceToken = SEED_DEVICE) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { [DEVICE_HEADER]: deviceToken },
    payload: { branchId: fx.branchId, staffId, pin: fx.pins[staffId] },
  })
  expect(res.statusCode, `đăng nhập ${staffId}: ${res.payload}`).toBe(201)
  return res.json<{ token: string }>().token
}

const auth = (token: string) => ({
  authorization: `Bearer ${token}`,
  [DEVICE_HEADER]: SEED_DEVICE,
})

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'cashier',
    name: 'Máy thu ngân gốc',
    tokenHash: hashToken(SEED_DEVICE),
  })

  cashier = await login(fx.cashierId)
  chef = await login(fx.chefId)
  waiter = await login(fx.waiterId)
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('1. Mở ca và mở bàn (P1 · P2 · P3)', () => {
  it('chưa mở ca thì không thu tiền được', async () => {
    // Kiểm ở bước cuối; ở đây chỉ chốt là ca chưa tồn tại
    const res = await inject({ method: 'GET', url: '/api/shifts/open', headers: auth(cashier) })
    expect(res.json()).toBeNull()
  })

  it('mở ca với tiền đầu ca', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/shifts',
      headers: auth(cashier),
      payload: { branchId: fx.branchId, openingCash: 2_000_000 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ openingCash: number }>().openingCash).toBe(2_000_000)
  })

  it('không mở được ca thứ hai khi ca cũ chưa đóng', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/shifts',
      headers: auth(cashier),
      payload: { branchId: fx.branchId, openingCash: 500_000 },
    })
    expect(res.statusCode).toBe(409)
  })

  it('sơ đồ bàn hiện đủ bàn, phân biệt bàn có bếp', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/tables?branch=${fx.branchId}`,
      headers: auth(cashier),
    })
    const rows = res.json<{ code: string; hasGrill: boolean; session: unknown }[]>()
    expect(rows.map((r) => r.code).sort()).toEqual(['05', 'A4', 'A9'])
    expect(rows.find((r) => r.code === 'A4')!.hasGrill).toBe(true)
    expect(rows.find((r) => r.code === '05')!.hasGrill).toBe(false)
  })

  it('mở bàn quá sức chứa bị chặn', async () => {
    // Bàn 05 ngồi tối đa 4 khách
    const res = await inject({
      method: 'POST',
      url: `/api/tables/${fx.plainTableId}/open`,
      headers: auth(cashier),
      payload: { guestCount: 8 },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ message: string }>().message).toContain('tối đa 4 khách')
  })

  it('một bàn chỉ mở được một phiên', async () => {
    const first = await inject({
      method: 'POST',
      url: `/api/tables/${fx.grillTableId}/open`,
      headers: auth(cashier),
      payload: { guestCount: 4 },
    })
    expect(first.statusCode).toBe(201)
    grillSession = first.json<{ id: number }>().id

    const second = await inject({
      method: 'POST',
      url: `/api/tables/${fx.grillTableId}/open`,
      headers: auth(cashier),
      payload: { guestCount: 2 },
    })
    expect(second.statusCode).toBe(409)
  })
})

let grillSession: number
let plainSession: number

// ---------------------------------------------------------------------------

describe('2. Gọi món và định tuyến bếp (P4 · §16)', () => {
  it('mở thêm bàn KHÔNG có bếp', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/tables/${fx.plainTableId}/open`,
      headers: auth(cashier),
      payload: { guestCount: 2 },
    })
    expect(res.statusCode).toBe(201)
    plainSession = res.json<{ id: number }>().id
  })

  it('gọi set → nổ thành món thành phần, mỗi chặng một đợt; giá nằm ở dòng cha', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'setsora', qty: 1 }] },
    })
    expect(res.statusCode).toBe(201)

    const detail = await inject({
      method: 'GET',
      url: `/api/table-sessions/${grillSession}/order`,
      headers: auth(cashier),
    })
    const { lines } = detail.json<{
      lines: {
        dishId: string
        kind: string
        batchNo: number
        priceTotal: number
        setLabel: string | null
        portionLabel: string | null
      }[]
    }>()

    const parent = lines.find((l) => l.kind === 'set_parent')!
    expect(parent.priceTotal).toBe(1_280_000)

    const children = lines.filter((l) => l.kind === 'dish')
    expect(children).toHaveLength(4)
    // Dòng con giá 0 — không tính tiền hai lần
    expect(children.every((c) => c.priceTotal === 0)).toBe(true)
    expect(children.every((c) => c.setLabel === 'SET SORA')).toBe(true)
    // Chặng lệch đợt: mở bữa đợt 1, bò đợt 2, tráng miệng đợt 3
    expect(children.find((c) => c.dishId === 'duamuoi')!.batchNo).toBe(1)
    expect(children.find((c) => c.dishId === 'bachibo')!.batchNo).toBe(2)
    expect(children.find((c) => c.dishId === 'kemtra')!.batchNo).toBe(3)
    expect(children.find((c) => c.dishId === 'bachibo')!.portionLabel).toBe('100g')
  })

  it('gọi thêm món lẻ có tuỳ chọn chênh giá và món đa trạm', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/lines`,
      headers: auth(cashier),
      payload: {
        lines: [
          { dishId: 'thanbo', qty: 2, modifierOptionIds: ['yaki-them-toi'], note: 'hồng đào' },
          { dishId: 'sukiyaki', qty: 1 },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    // 1.280.000 (set) + 2 × (420.000 + 15.000) + 520.000 = 2.670.000
    expect(res.json<{ money: { sub: number } }>().money.sub).toBe(2_670_000)
  })

  it('GỬI BẾP: đợt 1 chạy ngay, đợt sau chờ — đồng hồ CHƯA chạy', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/send`,
      headers: auth(cashier),
    })
    expect(res.statusCode).toBe(201)

    const rows = await db.select().from(tickets)
    const batch1 = rows.filter((t) => t.batchNo === 1)
    const batch2 = rows.filter((t) => t.batchNo === 2)

    expect(batch1.every((t) => t.state === 'queued' && t.queuedAt !== null)).toBe(true)
    expect(batch2.every((t) => t.state === 'waiting' && t.queuedAt === null)).toBe(true)
    expect(batch2.every((t) => t.dueAt === null)).toBe(true)
  })

  it('bàn CÓ bếp: món sống về ST-02, không có dòng nướng hộ', async () => {
    const rows = await db.select().from(tickets)
    const raw = rows.find((t) => t.stationId === 'ST-02' && t.batchNo === 2)!
    expect(raw.displayCode).toMatch(/^B-\d{4}$/)
    expect(raw.grillServiceNote).toBeNull()
    expect(raw.prepSeconds).toBe(180)
  })

  it('món đa trạm sinh 2 vé khác trạm, hai item chung linkGroup', async () => {
    const items = await db.select().from(ticketItems)
    const sukiyaki = items.filter((i) => i.dishId === 'sukiyaki')
    expect(sukiyaki).toHaveLength(2)
    expect(sukiyaki[0]!.linkGroup).toBe(sukiyaki[1]!.linkGroup)
    expect(sukiyaki.map((i) => i.componentLabel).sort()).toEqual(['khay thịt', 'nồi'])
  })

  it('bàn KHÔNG bếp: cùng món sống chuyển sang ST-06, +8 phút, vé ghi rõ lý do', async () => {
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${plainSession}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'bachibo', qty: 1 }] },
    })
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${plainSession}/send`,
      headers: auth(cashier),
    })

    const rows = await db.select().from(tickets)
    const plain = rows.find((t) => t.tableCode === '05')!
    expect(plain.stationId).toBe('ST-06')
    expect(plain.displayCode).toMatch(/^A-\d{4}$/)
    expect(plain.grillServiceNote).toBe('Bàn 05 không có bếp')
    expect(plain.prepSeconds).toBe(180 + 480)
  })
})

// ---------------------------------------------------------------------------

describe('3. Bếp nhận vé và nấu (K2 · K4)', () => {
  it('màn KDS chỉ thấy vé của trạm mình', async () => {
    const pairing = await inject({
      method: 'POST',
      url: '/api/auth/pairing-codes',
      headers: auth(await login(fx.managerId)),
      payload: { branchId: fx.branchId, kind: 'kds', stationId: 'ST-02' },
    })
    const { code } = pairing.json<{ code: string }>()
    const paired = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code, name: 'Màn quầy sống' },
    })
    const kdsToken = paired.json<{ token: string }>().token

    const queue = await inject({
      method: 'GET',
      url: '/api/tickets',
      headers: { [DEVICE_HEADER]: kdsToken },
    })
    const body = queue.json<{ tickets: { stationId: string }[]; serverTime: string }>()
    expect(body.tickets.length).toBeGreaterThan(0)
    expect(body.tickets.every((t) => t.stationId === 'ST-02')).toBe(true)
    // Giờ server để client tính thang than hồng, không tin đồng hồ TV box
    expect(body.serverTime).toBeTruthy()
  })

  it('vé đợt chưa ra thì không bấm "Bắt đầu" được', async () => {
    const waiting = (await db.select().from(tickets)).find((t) => t.state === 'waiting')!
    const res = await inject({
      method: 'POST',
      url: `/api/tickets/${waiting.id}/state`,
      headers: auth(chef),
      payload: { action: 'start' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('"Ra đợt tiếp" mới bắt đầu tính giờ', async () => {
    const order = (
      await inject({
        method: 'GET',
        url: `/api/table-sessions/${grillSession}/order`,
        headers: auth(cashier),
      })
    ).json<{ order: { id: number } }>()

    const res = await inject({
      method: 'POST',
      url: `/api/orders/${order.order.id}/batches/2/fire`,
      headers: auth(cashier),
    })
    expect(res.statusCode).toBe(201)

    const fired = (await db.select().from(tickets)).filter(
      (t) => t.batchNo === 2 && t.orderId === order.order.id,
    )
    expect(fired.every((t) => t.state === 'queued' && t.queuedAt !== null)).toBe(true)
    expect(fired.every((t) => t.dueAt !== null)).toBe(true)
  })

  it('bấm "Ra đợt" lần hai là no-op thành công (an toàn cho hàng đợi offline)', async () => {
    const order = (
      await inject({
        method: 'GET',
        url: `/api/table-sessions/${grillSession}/order`,
        headers: auth(cashier),
      })
    ).json<{ order: { id: number } }>()

    const res = await inject({
      method: 'POST',
      url: `/api/orders/${order.order.id}/batches/2/fire`,
      headers: auth(cashier),
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ changed: boolean }>().changed).toBe(false)
  })

  it('bếp bấm Bắt đầu → đơn tự chuyển sang cooking, POS không phải làm gì', async () => {
    const ticket = (await db.select().from(tickets)).find(
      (t) => t.state === 'queued' && t.tableCode === 'A4',
    )!
    const res = await inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/state`,
      headers: auth(chef),
      payload: { action: 'start' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ orderStatus: string }>().orderStatus).toBe('cooking')
  })

  it('thu ngân không bấm thay bếp được', async () => {
    const ticket = (await db.select().from(tickets)).find((t) => t.state === 'queued')!
    const res = await inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/state`,
      headers: auth(cashier),
      payload: { action: 'start' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('mọi vé xong → đơn sang ready; Expo báo hết chờ', async () => {
    const order = (
      await inject({
        method: 'GET',
        url: `/api/table-sessions/${grillSession}/order`,
        headers: auth(cashier),
      })
    ).json<{ order: { id: number } }>()

    const mine = (await db.select().from(tickets)).filter((t) => t.orderId === order.order.id)
    for (const ticket of mine) {
      await inject({
        method: 'POST',
        url: `/api/tickets/${ticket.id}/state`,
        headers: auth(chef),
        payload: { action: 'done' },
      })
    }

    const expo = await inject({
      method: 'GET',
      url: `/api/expo?branch=${fx.branchId}`,
      headers: auth(chef),
    })
    const mineInExpo = expo
      .json<{ orders: { orderId: number; ready: boolean; waitingFor: string[] }[] }>()
      .orders.filter((o) => o.orderId === order.order.id)
    expect(mineInExpo.every((o) => o.ready && o.waitingFor.length === 0)).toBe(true)
  })

  /**
   * Cửa sổ hoàn tác (§22 K2 "Xong + *Hoàn tác* 30s", tham số `kitchen.undoSeconds`).
   *
   * Vé `ready` trước đây bị loại hẳn khỏi hàng vé, nên nút Hoàn tác không có chỗ
   * nào để hiện. Ba phép thử dưới đây khoá đúng ba điều: vé còn nán lại, hoàn tác
   * trong hạn không trừ kho lần hai, và quá hạn thì chặn.
   */
  const kdsTokenFor = async (stationId: string) => {
    const pairing = await inject({
      method: 'POST',
      url: '/api/auth/pairing-codes',
      headers: auth(await login(fx.managerId)),
      payload: { branchId: fx.branchId, kind: 'kds', stationId },
    })
    const paired = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code: pairing.json<{ code: string }>().code, name: `Màn ${stationId}` },
    })
    return paired.json<{ token: string }>().token
  }

  it('vé vừa bấm Xong còn nán lại hàng vé để bếp kịp hoàn tác', async () => {
    const done = (await db.select().from(tickets)).find((t) => t.state === 'ready')!
    const queue = await inject({
      method: 'GET',
      url: '/api/tickets',
      headers: { [DEVICE_HEADER]: await kdsTokenFor(done.stationId) },
    })

    const body = queue.json<{ tickets: { id: number }[]; undoSeconds: number }>()
    expect(body.tickets.some((t) => t.id === done.id)).toBe(true)
    // Màn bếp phải biết cửa sổ dài bao nhiêu, không được đoán 30
    expect(body.undoSeconds).toBe(30)
  })

  it('hoàn tác trong hạn → vé về hàng; bấm Xong lại KHÔNG trừ kho lần hai', async () => {
    const done = (await db.select().from(tickets)).find((t) => t.state === 'ready')!
    const movesBefore = (await db.select().from(stockMoves)).length

    const undo = await inject({
      method: 'POST',
      url: `/api/tickets/${done.id}/state`,
      headers: auth(chef),
      payload: { action: 'undo' },
    })
    expect(undo.statusCode).toBe(201)
    expect(undo.json<{ state: string }>().state).toBe('queued')

    // Kéo lùi trạng thái KHÔNG hoàn kho — nguyên liệu đã nấu mất rồi
    expect((await db.select().from(stockMoves)).length).toBe(movesBefore)

    const redo = await inject({
      method: 'POST',
      url: `/api/tickets/${done.id}/state`,
      headers: auth(chef),
      payload: { action: 'done' },
    })
    expect(redo.statusCode).toBe(201)
    // Chỉ số `stock_moves_one_sale_per_line` chặn bút toán thứ hai cho cùng dòng đơn
    expect((await db.select().from(stockMoves)).length).toBe(movesBefore)

    const [after] = await db.select().from(tickets).where(eq(tickets.id, done.id))
    expect(after!.state).toBe('ready')
  })

  it('quá cửa sổ thì hoàn tác bị chặn, và vé rời hàng vé', async () => {
    const done = (await db.select().from(tickets)).find((t) => t.state === 'ready')!
    // Lùi mốc Xong thay vì chờ thật — phép thử không được phụ thuộc đồng hồ
    await db
      .update(tickets)
      .set({ readyAt: new Date(Date.now() - 3600_000) })
      .where(eq(tickets.id, done.id))

    const res = await inject({
      method: 'POST',
      url: `/api/tickets/${done.id}/state`,
      headers: auth(chef),
      payload: { action: 'undo' },
    })
    expect(res.statusCode).toBe(400)

    const queue = await inject({
      method: 'GET',
      url: '/api/tickets',
      headers: { [DEVICE_HEADER]: await kdsTokenFor(done.stationId) },
    })
    expect(queue.json<{ tickets: { id: number }[] }>().tickets.some((t) => t.id === done.id)).toBe(
      false,
    )
  })
})

// ---------------------------------------------------------------------------

describe('4. Huỷ món đã gửi bếp cần quản lý duyệt (P8 · §4.2 dấu △)', () => {
  let lineId: number

  beforeAll(async () => {
    const detail = await inject({
      method: 'GET',
      url: `/api/table-sessions/${plainSession}/order`,
      headers: auth(cashier),
    })
    lineId = detail.json<{ lines: { id: number; kind: string }[] }>().lines.find(
      (l) => l.kind === 'dish',
    )!.id
  })

  it('phục vụ huỷ món đã gửi bếp mà không có PIN duyệt → bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/order-lines/${lineId}/void`,
      headers: auth(waiter),
      payload: { reason: 'khách đổi ý' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('requires_approval')
  })

  it('tự duyệt việc của mình → bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/order-lines/${lineId}/void`,
      headers: auth(waiter),
      payload: {
        reason: 'khách đổi ý',
        approval: {
          approverStaffId: fx.waiterId,
          approverPin: fx.pins[fx.waiterId],
          reason: 'tự duyệt',
        },
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('quản lý duyệt bằng PIN → huỷ được, ghi bản ghi duyệt và nhật ký', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/order-lines/${lineId}/void`,
      headers: auth(waiter),
      payload: {
        reason: 'khách đổi ý',
        approval: {
          approverStaffId: fx.managerId,
          approverPin: fx.pins[fx.managerId],
          reason: 'khách đổi ý, chưa lên vỉ',
        },
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ approvalId: number }>().approvalId).toBeGreaterThan(0)

    const logs = await db.select().from(auditLog)
    expect(logs.some((l) => l.action === 'order.line.void-sent')).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('5. Báo hết món khoá ngay việc đặt (K5 · §9.3)', () => {
  it('báo hết → gọi món đó bị từ chối', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/availability',
      headers: auth(chef),
      payload: { dishId: 'sodiep', status: 'sold_out' },
    })
    expect(res.statusCode).toBe(201)

    const order = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'sodiep', qty: 1 }] },
    })
    expect(order.statusCode).toBe(409)
    expect(order.json<{ code: string }>().code).toBe('dish_sold_out')
  })

  it('còn giới hạn N phần: bán quá N thì chặn, trừ nguyên tử', async () => {
    await inject({
      method: 'POST',
      url: '/api/availability',
      headers: auth(chef),
      payload: { dishId: 'miso', status: 'limited', remaining: 2 },
    })

    const ok = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'miso', qty: 2 }] },
    })
    expect(ok.statusCode).toBe(201)

    const over = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'miso', qty: 1 }] },
    })
    expect(over.statusCode).toBe(409)
  })

  it('mở lại món thì đặt được bình thường', async () => {
    await inject({
      method: 'POST',
      url: '/api/availability',
      headers: auth(chef),
      payload: { dishId: 'sodiep', status: 'available' },
    })
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${plainSession}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'sodiep', qty: 1 }] },
    })
    expect(res.statusCode).toBe(201)
  })
})

// ---------------------------------------------------------------------------

describe('6. Idempotency — hàng đợi offline gửi lại không sinh đơn trùng', () => {
  it('cùng khoá + cùng nội dung → chỉ chạy một lần', async () => {
    const key = 'test-idem-0001'
    const payload = { lines: [{ dishId: 'duamuoi', qty: 1 }] }

    const first = await inject({
      method: 'POST',
      url: `/api/table-sessions/${plainSession}/lines`,
      headers: { ...auth(cashier), [IDEMPOTENCY_HEADER]: key },
      payload,
    })
    expect(first.statusCode).toBe(201)
    const afterFirst = first.json<{ money: { sub: number } }>().money.sub

    const replay = await inject({
      method: 'POST',
      url: `/api/table-sessions/${plainSession}/lines`,
      headers: { ...auth(cashier), [IDEMPOTENCY_HEADER]: key },
      payload,
    })
    expect(replay.statusCode).toBe(201)
    // Tổng tiền KHÔNG tăng lần hai — món không bị thêm trùng
    expect(replay.json<{ money: { sub: number } }>().money.sub).toBe(afterFirst)
  })

  it('cùng khoá nhưng khác nội dung → 409, đó là lỗi client chứ không phải gửi lại', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${plainSession}/lines`,
      headers: { ...auth(cashier), [IDEMPOTENCY_HEADER]: 'test-idem-0001' },
      payload: { lines: [{ dishId: 'thanbo', qty: 5 }] },
    })
    expect(res.statusCode).toBe(409)
  })
})

// ---------------------------------------------------------------------------

describe('7. Thu tiền, đóng bàn, đóng ca (P10 · P11 · P14)', () => {
  it('tạm tính trả đúng số còn phải trả', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${grillSession}/bill`,
      headers: auth(cashier),
    })
    const bill = res.json<{ total: number; paid: number; outstanding: number }>()
    expect(bill.paid).toBe(0)
    expect(bill.outstanding).toBe(bill.total)
    // Làm tròn về bội số 1000
    expect(bill.total % 1000).toBe(0)
  })

  it('thu quá số còn lại bị chặn — tiền thừa trả khách, không ghi vào đơn', async () => {
    const bill = (
      await inject({
        method: 'GET',
        url: `/api/table-sessions/${grillSession}/bill`,
        headers: auth(cashier),
      })
    ).json<{ total: number }>()

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/pay/cash`,
      headers: auth(cashier),
      payload: { amount: bill.total + 100_000 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('trả một phần → trạng thái partial, bàn chưa chuyển chờ dọn', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/pay/cash`,
      headers: auth(cashier),
      payload: { amount: 500_000 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ paymentState: string }>().paymentState).toBe('partial')
  })

  it('chưa trả đủ thì KHÔNG đóng bàn được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/close`,
      headers: auth(cashier),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('unpaid')
  })

  it('trả nốt → bàn chuyển "đã thanh toán, chờ dọn", KHÔNG tự đóng', async () => {
    const bill = (
      await inject({
        method: 'GET',
        url: `/api/table-sessions/${grillSession}/bill`,
        headers: auth(cashier),
      })
    ).json<{ outstanding: number }>()

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/pay/cash`,
      headers: auth(cashier),
      payload: { amount: bill.outstanding, tendered: bill.outstanding + 200_000 },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ paymentState: string; outstanding: number; change: number }>()
    expect(body.paymentState).toBe('paid')
    expect(body.outstanding).toBe(0)
    expect(body.change).toBe(200_000)

    const floor = await inject({
      method: 'GET',
      url: `/api/tables?branch=${fx.branchId}`,
      headers: auth(cashier),
    })
    const table = floor
      .json<{ code: string; session: { status: string } | null }[]>()
      .find((t) => t.code === 'A4')!
    expect(table.session!.status).toBe('paid_wait_clear')
  })

  it('mỗi lượt thu ghi một dòng vào sổ doanh thu bất biến', async () => {
    const entries = await db.select().from(journalEntries)
    expect(entries.filter((e) => e.kind === 'payment').length).toBeGreaterThanOrEqual(2)
  })

  it('trả đủ rồi mới đóng bàn được, và bàn giải phóng cho khách sau', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grillSession}/close`,
      headers: auth(cashier),
    })
    expect(res.statusCode).toBe(201)

    const reopen = await inject({
      method: 'POST',
      url: `/api/tables/${fx.grillTableId}/open`,
      headers: auth(cashier),
      payload: { guestCount: 2 },
    })
    expect(reopen.statusCode).toBe(201)
  })

  it('đóng ca đối chiếu quỹ: đếm khớp thì lệch bằng 0', async () => {
    const shift = (
      await inject({ method: 'GET', url: '/api/shifts/open', headers: auth(cashier) })
    ).json<{ id: number; openingCash: number }>()

    const cashTaken = (await db.select().from(journalEntries))
      .filter((e) => e.kind === 'payment')
      .reduce((sum, e) => sum + e.amount, 0)

    const res = await inject({
      method: 'POST',
      url: `/api/shifts/${shift.id}/close`,
      headers: auth(cashier),
      payload: { countedCash: shift.openingCash + cashTaken },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ expected: number; counted: number; variance: number }>()
    expect(body.variance).toBe(0)
    expect(body.expected).toBe(shift.openingCash + cashTaken)
  })
})

// ---------------------------------------------------------------------------

describe('8. Sự kiện realtime được ghi cùng transaction nghiệp vụ', () => {
  it('mọi biến cố quan trọng đều có sự kiện kèm kênh nhận', async () => {
    const events = await db.select().from(outboxEvents)
    const topics = new Set(events.map((e) => e.topic))

    for (const topic of ['table.opened', 'order.updated', 'ticket.created', 'table.paid']) {
      expect(topics, `thiếu sự kiện ${topic}`).toContain(topic)
    }
    // Không sự kiện nào được thiếu kênh nhận, nếu không sẽ phát vào hư không
    expect(events.every((e) => e.rooms.length > 0)).toBe(true)
    // seq đơn điệu tăng để client phát hiện hở
    const ids = events.map((e) => e.id)
    expect([...ids].sort((a, b) => a - b)).toEqual(ids)
  })

  it('vé bếp phát đúng kênh trạm, không lẫn sang trạm khác', async () => {
    const events = await db.select().from(outboxEvents)
    const ticketEvents = events.filter((e) => e.topic === 'ticket.created')
    expect(ticketEvents.length).toBeGreaterThan(0)
    expect(
      ticketEvents.every((e) => e.rooms.some((r) => r.startsWith(`branch:${fx.branchId}:station:`))),
    ).toBe(true)
  })
})
