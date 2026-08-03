/**
 * Năm màn còn thiếu của POS — phần máy chủ.
 *
 * P5 bàn phím nhanh · P9 chuyển/ghép/tách bàn · P14 đóng ca · P15 đối soát
 * thanh toán tại bàn · sổ COD của dải P16. Chạy qua HTTP thật trên Postgres thật
 * vì thứ đáng kiểm ở đây là TIỀN và VÉ BẾP đi đúng chỗ sau khi món đổi bàn, chứ
 * không phải một hàm tính đúng.
 */
import { createHmac } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { and, eq } from 'drizzle-orm'
import {
  bankEvents,
  deliveryZones,
  devices,
  dishes,
  journalEntries,
  orders,
  payments,
  tableSessions,
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
const BANK_SECRET = 'dev-bank-secret'
let cashier: string
/** Quản lý ca — bếp và điều phối đi qua các bước mà thu ngân không được bấm */
let manager: string
let shiftId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const auth = () => ({ authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE })
const managerAuth = () => ({ authorization: `Bearer ${manager}`, [DEVICE_HEADER]: SEED_DEVICE })

function bankWebhook(payload: { bankRef: string; vaNumber: string; amount: number }) {
  const raw = JSON.stringify(payload)
  return inject({
    method: 'POST',
    url: '/api/webhooks/bank',
    headers: {
      'content-type': 'application/json',
      'x-bank-signature': createHmac('sha256', BANK_SECRET).update(raw).digest('hex'),
    },
    payload: raw,
  })
}

async function openTable(tableId: number, guestCount = 2) {
  const res = await inject({
    method: 'POST',
    url: `/api/tables/${tableId}/open`,
    headers: auth(),
    payload: { guestCount },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ id: number }>().id
}

async function addLines(sessionId: number, lines: { dishId: string; qty: number }[]) {
  const res = await inject({
    method: 'POST',
    url: `/api/table-sessions/${sessionId}/lines`,
    headers: auth(),
    payload: { lines },
  })
  expect(res.statusCode, res.payload).toBe(201)
}

async function send(sessionId: number) {
  const res = await inject({
    method: 'POST',
    url: `/api/table-sessions/${sessionId}/send`,
    headers: auth(),
  })
  expect(res.statusCode, res.payload).toBe(201)
}

async function linesOf(sessionId: number) {
  const res = await inject({
    method: 'GET',
    url: `/api/table-sessions/${sessionId}/order`,
    headers: auth(),
  })
  return res.json<{
    order: { id: number; moneyTotal: number } | null
    lines: {
      id: number
      dishId: string
      state: string
      parentLineId: number | null
      priceTotal: number
    }[]
  } | null>()
}

async function closeSession(sessionId: number) {
  const res = await inject({
    method: 'POST',
    url: `/api/table-sessions/${sessionId}/close`,
    headers: auth(),
  })
  expect(res.statusCode, res.payload).toBe(201)
}

beforeAll(async () => {
  process.env.BANK_WEBHOOK_SECRET = BANK_SECRET
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

  cashier = (
    await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
      payload: { branchId: fx.branchId, staffId: fx.cashierId, pin: fx.pins[fx.cashierId] },
    })
  ).json<{ token: string }>().token

  manager = (
    await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
      payload: { branchId: fx.branchId, staffId: fx.managerId, pin: fx.pins[fx.managerId] },
    })
  ).json<{ token: string }>().token

  shiftId = (
    await inject({
      method: 'POST',
      url: '/api/shifts',
      headers: auth(),
      payload: { branchId: fx.branchId, openingCash: 500_000 },
    })
  ).json<{ id: number }>().id

  await db.update(dishes).set({ onlineVisible: true })
  await db.insert(deliveryZones).values({
    branchId: fx.branchId,
    name: 'Vòng 1',
    wards: ['Dich Vong'],
    feeVnd: 15_000,
    minOrderVnd: 100_000,
    etaMinutes: 25,
  })
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('P5 bàn phím nhanh', () => {
  it('chi nhánh chưa bán buổi nào vẫn có đủ ô để bấm', async () => {
    const res = await inject({ method: 'GET', url: `/api/quick-keys?branch=${fx.branchId}`, headers: auth() })
    expect(res.statusCode, res.payload).toBe(200)
    const body = res.json<{ dishIds: string[]; days: number }>()
    expect(body.days).toBe(7)
    expect(body.dishIds.length).toBeGreaterThan(0)
    expect(new Set(body.dishIds).size).toBe(body.dishIds.length)
  })

  it('món bán nhiều nhất tuần qua đứng đầu lưới', async () => {
    const session = await openTable(fx.spareTableId)
    await addLines(session, [{ dishId: 'sodiep', qty: 9 }])

    const res = await inject({
      method: 'GET',
      url: `/api/quick-keys?branch=${fx.branchId}`,
      headers: auth(),
    })
    expect(res.json<{ dishIds: string[] }>().dishIds[0]).toBe('sodiep')

    // Trả bàn về trạng thái trống cho các kịch bản sau — dọn của test, không phải
    // đường chạy thật, nên đi thẳng vào CSDL thay vì bịa một luồng huỷ đơn.
    await db
      .update(orders)
      .set({ status: 'cancelled', cancelReason: 'dọn dữ liệu test' })
      .where(eq(orders.tableSessionId, session))
    await db
      .update(tableSessions)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(tableSessions.id, session))
  })
})

describe('P9 chuyển · ghép · tách bàn', () => {
  let grill: number
  let plain: number
  let movedLineId: number

  it('bàn có bếp gọi món sống — vé về Quầy sống', async () => {
    grill = await openTable(fx.grillTableId, 4)
    await addLines(grill, [
      { dishId: 'bachibo', qty: 1 },
      { dishId: 'miso', qty: 1 },
    ])
    await send(grill)

    const order = await linesOf(grill)
    movedLineId = order!.lines.find((l) => l.dishId === 'bachibo')!.id

    const rows = await db
      .select({ station: tickets.stationId })
      .from(tickets)
      .innerJoin(ticketItems, eq(ticketItems.ticketId, tickets.id))
      .where(eq(ticketItems.orderLineId, movedLineId))
    expect(rows[0]?.station).toBe('ST-02')
  })

  it('chuyển sang bàn không bếp phải xác nhận định tuyến lại', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grill}/transfer`,
      headers: auth(),
      payload: { lineIds: [movedLineId], targetTableId: fx.plainTableId, guestCount: 2 },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('reroute_confirm')
  })

  it('xác nhận rồi thì món sang bàn mới và vé chạy về Bếp nướng', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grill}/transfer`,
      headers: auth(),
      payload: {
        lineIds: [movedLineId],
        targetTableId: fx.plainTableId,
        guestCount: 2,
        confirmReroute: true,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<{ targetSessionId: number; movedLines: number; rerouted: number }>()
    plain = body.targetSessionId
    expect(body.movedLines).toBe(1)
    expect(body.rerouted).toBe(1)

    // Tiền đi theo món: bàn nguồn còn canh miso, bàn đích gánh ba chỉ bò
    const source = await linesOf(grill)
    const target = await linesOf(plain)
    expect(source!.order!.moneyTotal).toBe(45_000)
    expect(target!.order!.moneyTotal).toBe(285_000)
    expect(target!.lines.map((l) => l.dishId)).toEqual(['bachibo'])

    // Vé cũ chết, vé mới ở trạm của bàn không bếp
    const items = await db
      .select({ state: ticketItems.state, station: tickets.stationId, table: tickets.tableCode })
      .from(ticketItems)
      .innerJoin(tickets, eq(tickets.id, ticketItems.ticketId))
      .where(eq(ticketItems.orderLineId, movedLineId))
    expect(items.some((i) => i.state === 'voided' && i.station === 'ST-02')).toBe(true)
    const live = items.find((i) => i.state !== 'voided')
    expect(live?.station).toBe('ST-06')
    expect(live?.table).toBe('05')
  })

  it('ghép bàn dồn hết món và đóng phiên nguồn', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${plain}/merge`,
      headers: auth(),
      payload: { targetSessionId: grill },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ movedLines: number }>().movedLines).toBe(1)

    const merged = await linesOf(grill)
    expect(merged!.order!.moneyTotal).toBe(330_000)

    const closed = await inject({
      method: 'GET',
      url: `/api/tables?branch=${fx.branchId}`,
      headers: auth(),
    })
    const plainTable = closed
      .json<{ id: number; session: unknown }[]>()
      .find((t) => t.id === fx.plainTableId)
    expect(plainTable?.session).toBeNull()
  })

  it('chuyển cả bàn sang bàn trống thì giữ nguyên phiên, chỉ đổi số bàn', async () => {
    const before = await linesOf(grill)
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grill}/move`,
      headers: auth(),
      payload: { tableId: fx.plainTableId, confirmReroute: true },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ tableCode: string }>().tableCode).toBe('05')

    const after = await linesOf(grill)
    expect(after!.order!.id).toBe(before!.order!.id)

    const live = await db
      .select({ table: tickets.tableCode })
      .from(tickets)
      .where(and(eq(tickets.orderId, after!.order!.id), eq(tickets.state, 'queued')))
    expect(live.every((t) => t.table === '05')).toBe(true)
  })

  it('bàn đã có tiền vào thì không tách được nữa', async () => {
    const bill = await inject({
      method: 'GET',
      url: `/api/table-sessions/${grill}/bill`,
      headers: auth(),
    })
    const outstanding = bill.json<{ outstanding: number }>().outstanding
    const paid = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grill}/pay/cash`,
      headers: auth(),
      payload: { amount: Math.min(50_000, outstanding), tendered: 50_000 },
    })
    expect(paid.statusCode, paid.payload).toBe(201)

    const order = await linesOf(grill)
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${grill}/transfer`,
      headers: auth(),
      payload: {
        lineIds: [order!.lines.find((l) => l.state !== 'voided')!.id],
        targetTableId: fx.spareTableId,
        confirmReroute: true,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('bill_has_money')
  })
})

describe('P15 đối soát thanh toán tại bàn', () => {
  let sessionId: number
  let paymentId: number
  let vaNumber: string

  it('khách chuyển thiếu → lượt trả vào nhóm lệch tiền', async () => {
    sessionId = await openTable(fx.spareTableId, 2)
    await addLines(sessionId, [{ dishId: 'thanbo', qty: 1 }])

    const qr = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/pay/vietqr`,
      headers: auth(),
      payload: { amount: 420_000 },
    })
    expect(qr.statusCode, qr.payload).toBe(201)
    const created = qr.json<{ id: number; vaNumber: string }>()
    paymentId = created.id
    vaNumber = created.vaNumber

    const hook = await bankWebhook({ bankRef: 'GD-LECH-1', vaNumber, amount: 400_000 })
    expect(hook.json<{ mismatch?: boolean }>().mismatch).toBe(true)

    const res = await inject({
      method: 'GET',
      url: `/api/payments/reconcile?branch=${fx.branchId}`,
      headers: auth(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    const board = res.json<{
      mismatch: { paymentId: number; diff: number; tableCode: string | null }[]
    }>()
    const row = board.mismatch.find((r) => r.paymentId === paymentId)
    expect(row?.diff).toBe(-20_000)
    expect(row?.tableCode).toBe('A9')
  })

  it('chấp nhận lệch: ghi đúng số thực nhận, phần thiếu thành dòng giảm giá', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/payments/${paymentId}/accept-mismatch`,
      headers: auth(),
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ credited: number; gap: number }>()).toMatchObject({
      credited: 400_000,
      gap: 20_000,
    })

    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId))
    expect(payment!.state).toBe('paid')
    expect(payment!.amount).toBe(400_000)

    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.paymentId, paymentId))
    expect(entries.find((e) => e.kind === 'payment')?.amount).toBe(400_000)
    expect(entries.find((e) => e.kind === 'discount')?.amount).toBe(-20_000)

    // Bill đóng lại được thì bàn mới sang "chờ dọn"
    const bill = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/bill`,
      headers: auth(),
    })
    expect(bill.json<{ paymentState: string }>().paymentState).toBe('paid')

    const [event] = await db.select().from(bankEvents).where(eq(bankEvents.bankRef, 'GD-LECH-1'))
    expect(event!.matchState).toBe('matched')
  })

  it('tiền vào không khớp VA nào thì nằm chờ người gán vào bill', async () => {
    const orphan = await bankWebhook({
      bankRef: 'GD-MOCOI-1',
      vaNumber: '9704999999',
      amount: 45_000,
    })
    expect(orphan.json<{ matched: boolean }>().matched).toBe(false)

    const target = await openTable(fx.grillTableId, 2)
    await addLines(target, [{ dishId: 'miso', qty: 1 }])

    const board = await inject({
      method: 'GET',
      url: `/api/payments/reconcile?branch=${fx.branchId}`,
      headers: auth(),
    })
    const unassigned = board.json<{ unassigned: { bankEventId: number; bankRef: string }[] }>()
      .unassigned
    const event = unassigned.find((e) => e.bankRef === 'GD-MOCOI-1')
    expect(event).toBeTruthy()

    const res = await inject({
      method: 'POST',
      url: `/api/bank-events/${event!.bankEventId}/assign`,
      headers: auth(),
      payload: { sessionId: target },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ credited: number; paymentState: string }>()).toMatchObject({
      credited: 45_000,
      paymentState: 'paid',
    })

    const [after] = await db.select().from(bankEvents).where(eq(bankEvents.bankRef, 'GD-MOCOI-1'))
    expect(after!.matchState).toBe('matched')
  })
})

describe('P9 với set — nửa set ở bàn này nửa set ở bàn kia là không được', () => {
  let source: number
  let setLineId: number
  let childLineId: number

  it('chọn dòng set thì món thành phần đi theo, tiền cũng đi theo dòng cha', async () => {
    // Hai bàn của kịch bản trước đã trả đủ — dọn để mở lại
    const board = await inject({ method: 'GET', url: `/api/tables?branch=${fx.branchId}`, headers: auth() })
    for (const table of board.json<{ id: number; session: { id: number } | null }[]>()) {
      if (table.session && (table.id === fx.grillTableId || table.id === fx.spareTableId)) {
        await closeSession(table.session.id)
      }
    }

    source = await openTable(fx.grillTableId, 4)
    await addLines(source, [
      { dishId: 'setsora', qty: 1 },
      { dishId: 'miso', qty: 1 },
    ])
    await send(source)

    const before = await linesOf(source)
    setLineId = before!.lines.find((l) => l.dishId === 'setsora')!.id
    childLineId = before!.lines.find((l) => l.parentLineId === setLineId)!.id
    const setPrice = before!.lines.find((l) => l.id === setLineId)!.priceTotal

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${source}/transfer`,
      headers: auth(),
      payload: { lineIds: [setLineId], targetTableId: fx.spareTableId, guestCount: 2 },
    })
    expect(res.statusCode, res.payload).toBe(201)
    const target = res.json<{ targetSessionId: number; movedLines: number }>()
    // Một dòng cha + đủ món thành phần của set
    expect(target.movedLines).toBeGreaterThan(1)

    const after = await linesOf(target.targetSessionId)
    expect(after!.lines.some((l) => l.id === setLineId)).toBe(true)
    expect(after!.lines.some((l) => l.id === childLineId)).toBe(true)
    expect(after!.order!.moneyTotal).toBe(setPrice)

    const left = await linesOf(source)
    expect(left!.lines.map((l) => l.dishId)).toEqual(['miso'])
    expect(left!.order!.moneyTotal).toBe(45_000)
  })

  it('chọn thẳng món con của set thì bị từ chối', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${source}/transfer`,
      headers: auth(),
      payload: { lineIds: [childLineId], targetTableId: fx.plainTableId },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Sổ COD của dải P16 · P14 đóng ca', () => {
  let orderId: number
  let codDue = 0

  it('đơn giao đã đưa khách mà chưa thu tiền thì nằm trên sổ COD theo shipper', async () => {
    /**
     * Đơn kênh ngoài (O12) chứ không phải đơn web: đơn Grab không bị chặn bởi
     * giờ nhận đơn, nên kịch bản này chạy được bất kể bộ test khởi động lúc mấy
     * giờ. Phần đang kiểm là tiền COD, không phải khung giờ nhận đơn.
     */
    const created = await inject({
      method: 'POST',
      url: '/api/orders/external',
      headers: auth(),
      payload: {
        branchId: fx.branchId,
        channel: 'grab',
        type: 'delivery',
        externalCode: 'GRAB-77',
        customer: { name: 'Khách giao', phone: '0900000009', address: '12 Trần Duy Hưng' },
        lines: [{ dishId: 'thanbo', qty: 1 }],
      },
    })
    expect(created.statusCode, created.payload).toBe(201)
    orderId = created.json<{ id: number }>().id

    const detail = await inject({ method: 'GET', url: `/api/orders/${orderId}`, headers: auth() })
    codDue = detail.json<{ money: { total: number } }>().money.total
    expect(codDue).toBeGreaterThan(0)

    for (const to of ['confirmed', 'cooking', 'ready', 'delivering']) {
      const step = await inject({
        method: 'POST',
        url: `/api/orders/${orderId}/status`,
        // Bếp mới đẩy được sang "đang làm" — thu ngân không bấm hộ được
        headers: to === 'cooking' || to === 'ready' ? managerAuth() : auth(),
        payload: { to },
      })
      expect(step.statusCode, `${to}: ${step.payload}`).toBe(201)
    }

    const assigned = await inject({
      method: 'POST',
      url: `/api/orders/${orderId}/assign-shipper`,
      headers: auth(),
      payload: { name: 'Hùng', phone: '0912000111' },
    })
    expect(assigned.statusCode, assigned.payload).toBe(201)

    const book = await inject({
      method: 'GET',
      url: `/api/orders/cod?branch=${fx.branchId}`,
      headers: auth(),
    })
    expect(book.statusCode, book.payload).toBe(200)
    const body = book.json<{
      shippers: { name: string; due: number; orders: { id: number }[] }[]
      total: number
    }>()
    const hung = body.shippers.find((s) => s.name === 'Hùng')
    expect(hung?.due).toBe(codDue)
    expect(hung?.orders.map((o) => o.id)).toContain(orderId)

    const shipperBook = await inject({
      method: 'GET',
      url: `/api/shippers?branch=${fx.branchId}`,
      headers: auth(),
    })
    expect(shipperBook.json<{ name: string; phone: string | null }[]>()[0]).toMatchObject({
      name: 'Hùng',
      phone: '0912000111',
    })
  })

  it('shipper nộp thiếu: đơn vẫn đã thu, chỗ thiếu thành bút toán lệch quỹ', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/orders/cod/settle',
      headers: auth(),
      payload: {
        branchId: fx.branchId,
        shipper: 'Hùng',
        orderIds: [orderId],
        receivedAmount: codDue - 5_000,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ due: number; received: number; variance: number }>()).toMatchObject({
      due: codDue,
      received: codDue - 5_000,
      variance: -5_000,
    })

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    expect(order!.paymentState).toBe('paid')

    const cod = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.kind, 'cod')))
    expect(cod[0]?.shiftId).toBe(shiftId)

    const adjust = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.kind, 'shift_adjust'))
    expect(adjust.some((e) => e.amount === -5_000)).toBe(true)
  })

  it('P14: tiền COD nằm trong số phải có ở két, và bảng đóng ca khớp con số đó', async () => {
    const res = await inject({ method: 'GET', url: `/api/shifts/${shiftId}/summary`, headers: auth() })
    expect(res.statusCode, res.payload).toBe(200)
    const summary = res.json<{
      cash: { opening: number; sales: number; expected: number }
      revenue: { byKind: { kind: string; amount: number }[]; total: number }
      bank: { system: number; statement: number; unassigned: number }
    }>()

    expect(summary.cash.opening).toBe(500_000)
    // 50.000 tiền mặt tại quầy + trọn khoản COD shipper nộp về
    expect(summary.cash.sales).toBe(50_000 + codDue)
    expect(summary.cash.expected).toBe(550_000 + codDue)
    expect(summary.revenue.byKind.find((r) => r.kind === 'cod')?.amount).toBe(codDue)
    // 400.000 khoản lệch đã chấp nhận + 45.000 giao dịch gán tay
    expect(summary.revenue.byKind.find((r) => r.kind === 'vietqr')?.amount).toBe(445_000)
    expect(summary.bank.system).toBe(445_000)
    expect(summary.bank.unassigned).toBe(0)

    const closed = await inject({
      method: 'POST',
      url: `/api/shifts/${shiftId}/close`,
      headers: auth(),
      payload: { countedCash: summary.cash.expected },
    })
    expect(closed.statusCode, closed.payload).toBe(201)
    expect(closed.json<{ expected: number; variance: number }>()).toMatchObject({
      expected: 550_000 + codDue,
      variance: 0,
    })
  })
})
