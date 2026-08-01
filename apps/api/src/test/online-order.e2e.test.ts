/**
 * Nghiệm thu GĐ3 (backend) — kênh online.
 *
 * Kịch bản: khách web chọn chi nhánh và kiểu nhận (O1) → gọi món bán online (O2)
 * → chọn khung giờ còn nhận (O4) → đặt đơn (O6) → trả trước bằng VietQR (O13) →
 * theo dõi đơn bằng mã riêng (O7). Bên POS: đơn hiện trên bảng điều phối (O8),
 * xác nhận thì xuống bếp, huỷ thì phải có lý do (O9), và đơn kênh ngoài nhập tay
 * đi chung một hàng đợi (O12).
 */
import { createHmac } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { deliveryZones, devices, dishes, tickets } from '../db/schema'
import { ParamsService } from '../common/params.service'
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

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const staffAuth = () => ({ authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE })

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

/** Đặt một đơn mang về "nhận ngay" — dùng lại ở nhiều mục */
async function placeTakeaway(lines: { dishId: string; qty: number }[] = [{ dishId: 'thanbo', qty: 1 }]) {
  const res = await inject({
    method: 'POST',
    url: '/api/online/orders',
    payload: {
      branchId: fx.branchId,
      type: 'takeaway',
      customer: { name: 'Khách web', phone: '0900000001' },
      lines,
      slotMode: 'asap',
    },
  })
  return res
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

  // Món bán online + một vùng giao để kiểm phí ship
  await db.update(dishes).set({ onlineVisible: true })
  await db.insert(deliveryZones).values({
    branchId: fx.branchId,
    name: 'Vòng 1',
    wards: ['Dich Vong', 'Quan Hoa'],
    feeVnd: 15_000,
    minOrderVnd: 150_000,
    etaMinutes: 25,
  })
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('1. Vùng giao và phí ship (O1)', () => {
  it('địa chỉ trong vùng trả về phí, đơn tối thiểu và thời gian dự kiến', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/online/quote?branch=${fx.branchId}&ward=${encodeURIComponent('Phường Dịch Vọng')}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ inZone: true, feeVnd: 15_000, etaMinutes: 25 })
  })

  it('khớp phường không cần dấu và không cần chữ "Phường"', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/online/quote?branch=${fx.branchId}&ward=quan%20hoa`,
    })
    expect(res.json<{ inZone: boolean }>().inZone).toBe(true)
  })

  it('ngoài vùng thì nói thẳng, kèm danh sách vùng đang giao', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/online/quote?branch=${fx.branchId}&ward=Long%20Bien`,
    })
    const body = res.json<{ inZone: boolean; zones: unknown[] }>()
    expect(body.inZone).toBe(false)
    expect(body.zones.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------

describe('2. Đặt đơn online (O4 · O6)', () => {
  it('khung giờ hiện trần và số đơn đã nhận', async () => {
    const res = await inject({ method: 'GET', url: `/api/online/slots?branch=${fx.branchId}` })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ slots: { capacity: number; open: boolean }[] }>()
    expect(body.slots.length).toBeGreaterThan(0)
    expect(body.slots[0]!.capacity).toBeGreaterThan(0)
  })

  it('đơn mang về nhận ngay được xếp vào khung mở sớm nhất', async () => {
    const res = await placeTakeaway()
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<{ displayCode: string; trackToken: string; slotAt: string; money: { total: number } }>()
    expect(body.displayCode).toMatch(/^ON-\d{4}-\d{4}$/)
    expect(body.trackToken.length).toBeGreaterThan(20)
    expect(new Date(body.slotAt).getTime()).toBeGreaterThan(Date.now())
    expect(body.money.total).toBe(420_000)
  })

  it('món chỉ bán tại quán bị từ chối ngay, kèm tên món', async () => {
    await db.update(dishes).set({ onlineVisible: false })
    const res = await placeTakeaway([{ dishId: 'sukiyaki', qty: 1 }])
    expect(res.statusCode).toBe(400)
    expect(res.json<{ message: string }>().message).toContain('Lẩu')
    await db.update(dishes).set({ onlineVisible: true })
  })

  it('đơn giao hàng cộng phí ship vào tổng, không tính phí phục vụ', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/online/orders',
      payload: {
        branchId: fx.branchId,
        type: 'delivery',
        customer: {
          name: 'Khách giao',
          phone: '0900000002',
          address: '12 Trần Duy Hưng',
          ward: 'Dịch Vọng',
        },
        lines: [{ dishId: 'thanbo', qty: 1 }],
        slotMode: 'asap',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    const money = res.json<{ money: { sub: number; ship: number; service: number; total: number } }>().money
    expect(money.sub).toBe(420_000)
    expect(money.ship).toBe(15_000)
    expect(money.service).toBe(0)
    expect(money.total).toBe(435_000)
  })

  it('đơn giao dưới mức tối thiểu của vùng bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/online/orders',
      payload: {
        branchId: fx.branchId,
        type: 'delivery',
        customer: { name: 'Khách nhỏ', phone: '0900000003', address: '1 Ngõ nhỏ', ward: 'Dịch Vọng' },
        lines: [{ dishId: 'duamuoi', qty: 1 }],
        slotMode: 'asap',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('below_min_order')
  })

  it('địa chỉ ngoài vùng giao bị chặn trước khi tạo đơn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/online/orders',
      payload: {
        branchId: fx.branchId,
        type: 'delivery',
        customer: { name: 'Xa quá', phone: '0900000004', address: '1 Bát Tràng', ward: 'Bat Trang' },
        lines: [{ dishId: 'thanbo', qty: 2 }],
        slotMode: 'asap',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('out_of_zone')
  })

  it('giờ hẹn tự chế không rơi vào khung 15 phút bị từ chối', async () => {
    const odd = new Date(Date.now() + 3 * 3600_000)
    odd.setMinutes(7, 0, 0)
    const res = await inject({
      method: 'POST',
      url: '/api/online/orders',
      payload: {
        branchId: fx.branchId,
        type: 'takeaway',
        customer: { name: 'Hẹn lệch', phone: '0900000005' },
        lines: [{ dishId: 'thanbo', qty: 1 }],
        slotMode: 'scheduled',
        slotAt: odd.toISOString(),
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('not-a-slot')
  })
})

// ---------------------------------------------------------------------------

describe('3. Theo dõi đơn bằng mã riêng (O7)', () => {
  let trackToken: string
  let displayCode: string

  beforeAll(async () => {
    const body = (await placeTakeaway()).json<{ trackToken: string; displayCode: string }>()
    trackToken = body.trackToken
    displayCode = body.displayCode
  })

  it('mã theo dõi mở đúng đơn của mình', async () => {
    const res = await inject({ method: 'GET', url: `/api/online/track/${trackToken}` })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ displayCode: string; status: string }>()).toMatchObject({
      displayCode,
      status: 'new',
    })
  })

  it('CSDL chỉ giữ bản băm của mã theo dõi', async () => {
    const row = await db.query.orders.findFirst({
      where: (o, { eq }) => eq(o.displayCode, displayCode),
    })
    expect(row!.trackTokenHash).toBe(hashToken(trackToken))
    expect(row!.trackTokenHash).not.toBe(trackToken)
  })

  it('mã sai không mở được đơn nào', async () => {
    const res = await inject({ method: 'GET', url: '/api/online/track/khong-phai-ma-that' })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------

describe('4. Trả trước bằng VietQR (O13 · §20)', () => {
  let trackToken: string
  let orderId: number

  beforeAll(async () => {
    const body = (await placeTakeaway()).json<{ trackToken: string; id: number }>()
    trackToken = body.trackToken
    orderId = body.id
  })

  it('tạo lượt trả cho trọn số tiền đơn', async () => {
    const res = await inject({ method: 'POST', url: `/api/online/track/${trackToken}/pay/vietqr` })
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<{ amount: number; vaNumber: string; qrString: string }>()
    expect(body.amount).toBe(420_000)
    expect(body.vaNumber).toMatch(/^9704\d{8}$/)
    expect(body.qrString.startsWith('000201')).toBe(true)
  })

  it('CHỈ webhook ngân hàng mới đổi đơn sang đã trả', async () => {
    const created = await inject({ method: 'POST', url: `/api/online/track/${trackToken}/pay/vietqr` })
    // Lượt trước đã giữ trọn số tiền nên không tạo thêm được
    expect(created.statusCode).toBe(409)

    const before = await inject({ method: 'GET', url: `/api/online/track/${trackToken}` })
    expect(before.json<{ paymentState: string }>().paymentState).toBe('unpaid')

    const payment = await db.query.payments.findFirst({
      where: (p, { eq }) => eq(p.orderId, orderId),
    })
    const res = await bankWebhook({
      bankRef: `FT-ONLINE-${orderId}`,
      vaNumber: payment!.vaNumber!,
      amount: payment!.amount,
    })
    expect(res.json<{ matched: boolean }>().matched).toBe(true)

    const after = await inject({ method: 'GET', url: `/api/online/track/${trackToken}` })
    expect(after.json<{ paymentState: string }>().paymentState).toBe('paid')
  })
})

// ---------------------------------------------------------------------------

describe('5. Điều phối trên POS (O8 · O9)', () => {
  let orderId: number
  let trackToken: string

  beforeAll(async () => {
    const body = (await placeTakeaway([{ dishId: 'thanbo', qty: 2 }])).json<{
      id: number
      trackToken: string
    }>()
    orderId = body.id
    trackToken = body.trackToken
  })

  it('đơn mới hiện trên bảng điều phối', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/orders?branch=${fx.branchId}`,
      headers: staffAuth(),
    })
    expect(res.statusCode).toBe(200)
    const board = res.json<{ orders: { id: number; status: string; channel: string }[] }>()
    const found = board.orders.find((o) => o.id === orderId)
    expect(found).toMatchObject({ status: 'new', channel: 'web' })
  })

  it('bảng điều phối KHÔNG trộn đơn tại bàn vào', async () => {
    const opened = await inject({
      method: 'POST',
      url: `/api/tables/${fx.grillTableId}/open`,
      headers: staffAuth(),
      payload: { guestCount: 2 },
    })
    const sessionId = opened.json<{ id: number }>().id
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: staffAuth(),
      payload: { lines: [{ dishId: 'thanbo', qty: 1 }] },
    })

    const res = await inject({
      method: 'GET',
      url: `/api/orders?branch=${fx.branchId}`,
      headers: staffAuth(),
    })
    const types = res.json<{ orders: { type: string }[] }>().orders.map((o) => o.type)
    expect(types).not.toContain('dinein')
  })

  it('xác nhận đơn thì món xuống bếp, kèm mốc phải bắt đầu nấu', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/orders/${orderId}/status`,
      headers: staffAuth(),
      payload: { to: 'confirmed' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ tickets: number }>().tickets).toBeGreaterThan(0)

    const rows = await db.select().from(tickets)
    const mine = rows.filter((t) => t.orderId === orderId)
    expect(mine.length).toBeGreaterThan(0)
    // Đơn online mang mã vé tiền tố O và có mốc đếm ngược tới giờ hẹn
    expect(mine[0]!.displayCode.startsWith('O')).toBe(true)
    expect(mine[0]!.startBy).not.toBeNull()
    expect(mine[0]!.source).toBe('online')
  })

  it('khách theo dõi thấy đơn đã sang bước xác nhận', async () => {
    const res = await inject({ method: 'GET', url: `/api/online/track/${trackToken}` })
    expect(res.json<{ status: string }>().status).toBe('confirmed')
  })

  it('không nhảy thẳng từ xác nhận sang giao hàng', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/orders/${orderId}/status`,
      headers: staffAuth(),
      payload: { to: 'delivering' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('invalid-transition')
  })

  it('huỷ đơn phải có lý do, và lý do hiện cho khách', async () => {
    const fresh = (await placeTakeaway()).json<{ id: number; trackToken: string }>()

    const noReason = await inject({
      method: 'POST',
      url: `/api/orders/${fresh.id}/cancel`,
      headers: staffAuth(),
      payload: { reason: '' },
    })
    expect(noReason.statusCode).toBe(400)

    const done = await inject({
      method: 'POST',
      url: `/api/orders/${fresh.id}/cancel`,
      headers: staffAuth(),
      payload: { reason: 'Hết nguyên liệu' },
    })
    expect(done.statusCode).toBe(201)

    const tracked = await inject({ method: 'GET', url: `/api/online/track/${fresh.trackToken}` })
    expect(tracked.json<{ status: string; cancelReason: string }>()).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Hết nguyên liệu',
    })
  })

  /**
   * Đơn xác nhận rồi là vé đã nằm trên màn bếp. Huỷ mà để vé lại thì bếp cứ nấu
   * tiếp một đơn không còn ai lấy.
   */
  it('huỷ đơn đã xác nhận thì rút luôn vé khỏi bếp', async () => {
    const fresh = (await placeTakeaway()).json<{ id: number }>()
    await inject({
      method: 'POST',
      url: `/api/orders/${fresh.id}/status`,
      headers: staffAuth(),
      payload: { to: 'confirmed' },
    })

    const before = (await db.select().from(tickets)).filter((t) => t.orderId === fresh.id)
    expect(before.length).toBeGreaterThan(0)
    expect(before.every((t) => t.state !== 'voided')).toBe(true)

    await inject({
      method: 'POST',
      url: `/api/orders/${fresh.id}/cancel`,
      headers: staffAuth(),
      payload: { reason: 'Khách gọi báo huỷ' },
    })

    const after = (await db.select().from(tickets)).filter((t) => t.orderId === fresh.id)
    expect(after.every((t) => t.state === 'voided')).toBe(true)
  })

  it('bếp đã bắt tay vào nấu thì không huỷ được nữa', async () => {
    const chef = (
      await inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { [DEVICE_HEADER]: SEED_DEVICE },
        payload: { branchId: fx.branchId, staffId: fx.chefId, pin: fx.pins[fx.chefId] },
      })
    ).json<{ token: string }>().token

    const mine = (await db.select().from(tickets)).filter((t) => t.orderId === orderId)
    const started = await inject({
      method: 'POST',
      url: `/api/tickets/${mine[0]!.id}/state`,
      headers: { authorization: `Bearer ${chef}`, [DEVICE_HEADER]: SEED_DEVICE },
      payload: { action: 'start' },
    })
    expect(started.statusCode, started.payload).toBe(201)

    const res = await inject({
      method: 'POST',
      url: `/api/orders/${orderId}/cancel`,
      headers: staffAuth(),
      payload: { reason: 'Khách đổi ý' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('cancel-locked')
  })
})

// ---------------------------------------------------------------------------

describe('6. Kênh ngoài nhập tay (O12)', () => {
  it('đơn GrabFood vào chung bảng điều phối và chung hàng đợi bếp', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/orders/external',
      headers: staffAuth(),
      payload: {
        branchId: fx.branchId,
        channel: 'grab',
        type: 'delivery',
        externalCode: 'GR-8842',
        customer: { phone: '0987654321' },
        lines: [{ dishId: 'thanbo', qty: 1 }],
      },
    })
    expect(created.statusCode, created.payload).toBe(201)
    const orderId = created.json<{ id: number }>().id

    const board = await inject({
      method: 'GET',
      url: `/api/orders?branch=${fx.branchId}`,
      headers: staffAuth(),
    })
    expect(
      board.json<{ orders: { id: number; channel: string }[] }>().orders.find((o) => o.id === orderId),
    ).toMatchObject({ channel: 'grab' })

    const confirmed = await inject({
      method: 'POST',
      url: `/api/orders/${orderId}/status`,
      headers: staffAuth(),
      payload: { to: 'confirmed' },
    })
    expect(confirmed.json<{ tickets: number }>().tickets).toBeGreaterThan(0)
  })

  /**
   * Shipper của Grab đang đứng ở cửa: từ chối vì "hết giờ nhận đơn online" chỉ
   * đẩy đơn đó ra ngoài hệ thống, ghi tay lên giấy.
   */
  it('đơn kênh ngoài nhận được cả khi đã quá giờ nhận đơn online', async () => {
    const params = app.get(ParamsService)
    await params.set('online.lastOrderMinute', 1)

    try {
      const res = await inject({
        method: 'POST',
        url: '/api/orders/external',
        headers: staffAuth(),
        payload: {
          branchId: fx.branchId,
          channel: 'be',
          type: 'delivery',
          externalCode: 'BE-0007',
          customer: {},
          lines: [{ dishId: 'thanbo', qty: 1 }],
        },
      })
      expect(res.statusCode, res.payload).toBe(201)

      // Cùng lúc đó khách web thì bị từ chối, đúng như ý đồ của giờ nhận đơn
      const web = await placeTakeaway()
      expect(web.statusCode).toBe(409)
      expect(web.json<{ code: string }>().code).toBe('no_slot')
    } finally {
      await params.set('online.lastOrderMinute', 23 * 60 + 45)
    }
  })

  it('đơn kênh ngoài không tính phí giao — bên họ thu của khách', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/orders/external',
      headers: staffAuth(),
      payload: {
        branchId: fx.branchId,
        channel: 'shopee',
        type: 'delivery',
        externalCode: 'SP-1201',
        customer: {},
        lines: [{ dishId: 'thanbo', qty: 1 }],
      },
    })
    expect(created.json<{ money: { ship: number } }>().money.ship).toBe(0)
  })
})
