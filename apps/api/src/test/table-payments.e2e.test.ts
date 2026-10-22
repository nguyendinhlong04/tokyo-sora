/**
 * Nghiệm thu GĐ2 (phần backend) — khách tại bàn tự gọi món và tự trả tiền trên
 * iPad gắn bàn (§9.1).
 *
 * Kịch bản exit trong kế hoạch: iPad ghép bằng mã 6 số và ghim cứng một bàn ·
 * khách tự mở bàn, bàn có đặt chỗ thì mời nhân viên · iPad chỉ thấy bàn mình ·
 * món đã có người nhận không trả trùng được · chỉ webhook ngân hàng mới đổi trạng
 * thái đã trả · đóng bàn thì iPad về màn bàn chưa mở · món 86 khoá ngay trên iPad.
 */
import { createHmac } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { IDEMPOTENCY_HEADER } from '@sora/contracts'
import { and, eq, ne } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import {
  bankEvents,
  devices,
  journalEntries,
  payments,
  reservations,
  tableFeedback,
  tableSessions,
  ticketItems,
} from '../db/schema'
import { ConfigBundleService } from '../modules/config-bundle/config-bundle.service'
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
let manager: string
/** Phiên của bàn A4 — khách tự mở trên iPad ở mục 2 */
let sessionId: number
/** Bàn 05 bên cạnh — dùng để chứng minh iPad bàn này không mở được bàn kia */
let otherSession: number
/** iPad bàn A4 — ghép đúng đường người lắp máy đi ở mục 1 */
let ipadA4: string
let ipadA4Id: number
/** iPad của bàn 05 và A9: ghép thẳng vào CSDL, đường ghép đã kiểm ở mục 1 */
const IPAD_05 = 'ipad-ban-05-token'
const IPAD_A9 = 'ipad-ban-a9-token'

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const staffAuth = () => ({ authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE })
const asManager = () => ({ authorization: `Bearer ${manager}`, [DEVICE_HEADER]: SEED_DEVICE })
/** iPad gọi API như ngoài đời: chỉ mang token thiết bị — không cookie, không đăng nhập */
const ipad = (token = ipadA4) => ({ [DEVICE_HEADER]: token })

const login = async (staffId: number) =>
  (
    await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
      payload: { branchId: fx.branchId, staffId, pin: fx.pins[staffId] },
    })
  ).json<{ token: string }>().token

const pairingCode = (tableId?: number) =>
  inject({
    method: 'POST',
    url: '/api/auth/pairing-codes',
    headers: asManager(),
    payload: { branchId: fx.branchId, kind: 'table', tableId },
  })

/** Khách chạm "Bắt đầu gọi món" rồi chọn số người */
const selfOpen = (token: string, guestCount: number) =>
  inject({
    method: 'POST',
    url: '/api/table-terminal/open',
    headers: ipad(token),
    payload: { guestCount },
  })

interface TerminalState {
  table: { id: number; code: string; hasGrill: boolean; seatMax: number }
  session: { id: number; status: string; guestCount: number } | null
  reservedAt: string | null
  overCapacity?: boolean
}

/** Giả lập ngân hàng gọi webhook — ký đúng như hàng thật */
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

beforeAll(async () => {
  process.env.BANK_WEBHOOK_SECRET = BANK_SECRET
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await db.insert(devices).values([
    {
      branchId: fx.branchId,
      kind: 'cashier',
      name: 'Máy thu ngân gốc',
      tokenHash: hashToken(SEED_DEVICE),
    },
    {
      branchId: fx.branchId,
      kind: 'table',
      name: 'iPad bàn 05',
      tableId: fx.plainTableId,
      tokenHash: hashToken(IPAD_05),
    },
    {
      branchId: fx.branchId,
      kind: 'table',
      name: 'iPad bàn A9',
      tableId: fx.spareTableId,
      tokenHash: hashToken(IPAD_A9),
    },
  ])

  cashier = await login(fx.cashierId)
  manager = await login(fx.managerId)

  await inject({
    method: 'POST',
    url: '/api/shifts',
    headers: staffAuth(),
    payload: { branchId: fx.branchId, openingCash: 0 },
  })
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('1. Ghép iPad vào bàn (A4)', () => {
  it('quản lý sinh mã cho bàn A4, iPad nhập mã thì nhận token', async () => {
    const code = await pairingCode(fx.grillTableId)
    expect(code.statusCode, code.payload).toBe(201)

    const paired = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code: code.json<{ code: string }>().code, name: 'iPad bàn A4' },
    })
    expect(paired.statusCode, paired.payload).toBe(201)
    const body = paired.json<{ token: string; deviceId: number }>()
    ipadA4 = body.token
    ipadA4Id = body.deviceId
  })

  it('CSDL chỉ giữ bản băm token, và iPad ghim đúng bàn của mã ghép', async () => {
    const [row] = await db.select().from(devices).where(eq(devices.id, ipadA4Id))
    expect(row!.kind).toBe('table')
    expect(row!.tableId).toBe(fx.grillTableId)
    expect(row!.tokenHash).toHaveLength(64) // SHA-256 dạng hex
    expect(ipadA4).not.toContain(row!.tokenHash)
  })

  it('mã cho iPad tại bàn phải chọn bàn', async () => {
    expect((await pairingCode()).statusCode).toBe(400)
  })

  it('bàn không thuộc chi nhánh thì không sinh mã', async () => {
    expect((await pairingCode(999_999)).statusCode).toBe(400)
  })

  /** Hai iPad một bàn là hai giỏ cho một phiên — khách bấm máy này, món hiện máy kia */
  it('bàn đã có iPad đang chạy thì không sinh thêm mã', async () => {
    expect((await pairingCode(fx.grillTableId)).statusCode).toBe(409)
  })

  it('iPad không đăng nhập ca được — PIN nhân viên không mở quyền trên máy của khách', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: ipad(),
      payload: { branchId: fx.branchId, staffId: fx.cashierId, pin: fx.pins[fx.cashierId] },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ---------------------------------------------------------------------------

describe('2. Bàn chưa mở — khách tự mở trên iPad (T1)', () => {
  it('iPad đọc được bàn mình ngay cả khi bàn chưa mở', async () => {
    const res = await inject({ method: 'GET', url: '/api/table-terminal', headers: ipad() })
    expect(res.statusCode, res.payload).toBe(200)
    const body = res.json<TerminalState>()
    expect(body.table.code).toBe('A4')
    expect(body.table.hasGrill).toBe(true)
    expect(body.session).toBeNull()
  })

  it('iPad của bàn chưa mở không đọc được gì khác', async () => {
    const reads = [
      ['/api/table-sessions/1', 403],
      ['/api/tables?branch=' + fx.branchId, 403],
      ['/api/table-requests?branch=' + fx.branchId, 403],
      ['/api/tickets?station=ST-02', 400],
      ['/api/expo', 400],
    ] as const
    for (const [url, status] of reads) {
      const res = await inject({ method: 'GET', url, headers: ipad() })
      expect(res.statusCode, `GET ${url}`).toBe(status)
    }
  })

  it('cửa của iPad chỉ dành cho iPad — máy thu ngân không gọi được', async () => {
    const res = await inject({ method: 'GET', url: '/api/table-terminal', headers: staffAuth() })
    expect(res.statusCode).toBe(403)
  })

  it('khách tự mở bàn — POS thấy bàn có khách ngay', async () => {
    const res = await selfOpen(ipadA4, 4)
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<TerminalState>()
    expect(body.session?.status).toBe('open')
    expect(body.session?.guestCount).toBe(4)
    expect(body.overCapacity).toBe(false)
    sessionId = body.session!.id

    const floor = await inject({
      method: 'GET',
      url: `/api/tables?branch=${fx.branchId}`,
      headers: staffAuth(),
    })
    const a4 = floor.json<{ id: number; session: { id: number } | null }[]>()
    expect(a4.find((t) => t.id === fx.grillTableId)?.session?.id).toBe(sessionId)
  })

  /** Khách chạm hai lần, hoặc nhân viên vừa mở ở POS đúng lúc khách chạm */
  it('mở lại bàn đang mở không đẻ phiên thứ hai, cũng không báo lỗi', async () => {
    const res = await selfOpen(ipadA4, 4)
    expect(res.statusCode).toBe(201)
    expect(res.json<TerminalState>().session?.id).toBe(sessionId)

    const live = await db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, fx.grillTableId), ne(tableSessions.status, 'closed')))
    expect(live).toHaveLength(1)
  })

  it('iPad không mở được bàn khác qua cửa của nhân viên', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/tables/${fx.spareTableId}/open`,
      headers: ipad(),
      payload: { guestCount: 2 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('khách chốt lại số khách của bàn mình', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/guests`,
      headers: ipad(),
      payload: { guestCount: 3 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ guestCount: number }>().guestCount).toBe(3)

    // Trả lại 4 để các mục sau đọc đúng con số ban đầu
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/guests`,
      headers: ipad(),
      payload: { guestCount: 4 },
    })
  })

  it('số khách vượt sức chứa bàn bị chặn — y như lúc nhân viên mở bàn', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/guests`,
      headers: ipad(),
      payload: { guestCount: 40 },
    })
    expect(res.statusCode).toBe(409)
  })

  it('iPad đọc được mình đang ở bàn nào — T1 mới chào bàn được', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}`,
      headers: ipad(),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{
      guestCount: number
      table: { code: string; hasGrill: boolean }
    }>()
    expect(body.guestCount).toBe(4)
    expect(body.table.code).toBe('A4')
    expect(body.table.hasGrill).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('2b. Đặt chỗ và sức chứa khi khách tự mở (bàn 05)', () => {
  let reservationId: number

  beforeAll(async () => {
    const slotAt = new Date(Date.now() + 30 * 60_000)
    const [row] = await db
      .insert(reservations)
      .values({
        displayCode: 'DB-IPAD-001',
        branchId: fx.branchId,
        seatKind: 'standard',
        guestCount: 2,
        slotAt,
        endAt: new Date(slotAt.getTime() + 105 * 60_000),
        status: 'confirmed',
        customerName: 'Chị Vy',
        customerPhone: '0977 613 209',
        tableId: fx.plainTableId,
        source: 'phone',
        businessDate: businessDateOf(slotAt, 'Asia/Ho_Chi_Minh'),
      })
      .returning({ id: reservations.id })
    reservationId = row!.id
  })

  /** Màn hình đặt giữa phòng ăn — ai đi ngang cũng đọc được, nên không có tên khách */
  it('bàn có đặt chỗ trong 90′ thì iPad không mở, chỉ báo giờ — không lộ tên người đặt', async () => {
    const res = await selfOpen(IPAD_05, 2)
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('table_reserved')
    expect(res.json<{ reservedAt: string | null }>().reservedAt).not.toBeNull()
    expect(res.payload).not.toContain('Chị Vy')
    expect(res.payload).not.toContain('0977')

    const state = await inject({
      method: 'GET',
      url: '/api/table-terminal',
      headers: ipad(IPAD_05),
    })
    expect(state.json<TerminalState>().reservedAt).not.toBeNull()
    expect(state.payload).not.toContain('Chị Vy')
  })

  it('đông hơn sức chứa vẫn mở với đúng sức chứa và báo iPad gọi nhân viên', async () => {
    await db
      .update(reservations)
      .set({ status: 'cancelled' })
      .where(eq(reservations.id, reservationId))

    const res = await selfOpen(IPAD_05, 7)
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<TerminalState>()
    expect(body.overCapacity).toBe(true)
    expect(body.session?.guestCount).toBe(4)
    otherSession = body.session!.id
  })
})

// ---------------------------------------------------------------------------

describe('3. Khách tự gọi món (T2 · T6 · T7)', () => {
  it('khách thêm món vào đơn của bàn mình', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: ipad(),
      payload: {
        lines: [
          { dishId: 'thanbo', qty: 2 },
          { dishId: 'sodiep', qty: 1 },
          { dishId: 'miso', qty: 2 },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    // 2×420.000 + 245.000 + 2×45.000 = 1.175.000
    expect(res.json<{ money: { sub: number } }>().money.sub).toBe(1_175_000)
  })

  it('khách KHÔNG gọi nhân viên hộ bàn khác được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${otherSession}/requests`,
      headers: ipad(),
      payload: { kind: 'phuc-vu' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('khách KHÔNG gọi món hay gửi bếp hộ bàn khác được', async () => {
    const lines = await inject({
      method: 'POST',
      url: `/api/table-sessions/${otherSession}/lines`,
      headers: ipad(),
      payload: { lines: [{ dishId: 'miso', qty: 1 }] },
    })
    expect(lines.statusCode).toBe(403)

    const send = await inject({
      method: 'POST',
      url: `/api/table-sessions/${otherSession}/send`,
      headers: ipad(),
    })
    expect(send.statusCode).toBe(403)
  })

  /**
   * Mã phiên là số chạy nên đoán được. Không có chốt này thì sửa số trong lệnh gọi
   * là đọc được đơn và tạm tính của bàn bên cạnh.
   */
  it('khách KHÔNG đọc được đơn, tạm tính hay thông tin của bàn khác', async () => {
    for (const path of ['', '/order', '/bill']) {
      const res = await inject({
        method: 'GET',
        url: `/api/table-sessions/${otherSession}${path}`,
        headers: ipad(),
      })
      expect(res.statusCode, `GET ${path || '/'}`).toBe(403)
    }
  })

  it('bàn đang mở cũng không đọc được sơ đồ, hàng đợi hay Expo của cả sàn', async () => {
    const reads = [
      ['/api/tables?branch=' + fx.branchId, 403],
      ['/api/table-requests?branch=' + fx.branchId, 403],
      ['/api/expo', 400],
    ] as const
    for (const [url, status] of reads) {
      const res = await inject({ method: 'GET', url, headers: ipad() })
      expect(res.statusCode, `GET ${url}`).toBe(status)
    }
  })

  it('nhân viên vẫn nhìn được cả sàn', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${otherSession}/order`,
      headers: staffAuth(),
    })
    expect(res.statusCode).toBe(200)
  })

  it('gửi bếp rồi thì món xuống đúng trạm', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/send`,
      headers: ipad(),
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ tickets: number }>().tickets).toBeGreaterThan(0)
  })

  it('gửi lại cùng khoá idempotency không nhân đôi món', async () => {
    const key = 'gd2-idem-001'
    const payload = { lines: [{ dishId: 'duamuoi', qty: 1 }] }
    const first = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: { ...ipad(), [IDEMPOTENCY_HEADER]: key },
      payload,
    })
    const replay = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: { ...ipad(), [IDEMPOTENCY_HEADER]: key },
      payload,
    })
    expect(replay.json<{ money: { sub: number } }>().money.sub).toBe(
      first.json<{ money: { sub: number } }>().money.sub,
    )
  })

  it('việc của nhân viên — nhả đợt, huỷ món đã lên đơn — iPad không làm được', async () => {
    const order = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/order`,
      headers: ipad(),
    })
    const { order: o, lines } = order.json<{ order: { id: number }; lines: { id: number }[] }>()

    const fire = await inject({
      method: 'POST',
      url: `/api/orders/${o.id}/batches/2/fire`,
      headers: ipad(),
    })
    expect(fire.statusCode).toBe(403)

    const voided = await inject({
      method: 'POST',
      url: `/api/order-lines/${lines[0]!.id}/void`,
      headers: ipad(),
      payload: { reason: 'Khách đổi ý' },
    })
    expect(voided.statusCode).toBe(403)
  })
})

// ---------------------------------------------------------------------------

describe('3b. Thực đơn trên iPad (T2 · T3 · T5)', () => {
  beforeAll(async () => {
    // Ngoài đời Office bấm "Lưu & phát hành"; ở đây gọi thẳng service vì thu ngân
    // không có quyền sửa giá — và quyền đó không phải thứ mục này đang kiểm.
    await app.get(ConfigBundleService).publish(fx.branchId, { kind: 'system' })
  })

  it('bundle mang theo nhóm tuỳ chọn và món nào dùng nhóm nào', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/config?branch=${fx.branchId}`,
      headers: ipad(),
    })
    expect(res.statusCode).toBe(200)
    const bundle = res.json<{
      modifiers: { id: string; options: { id: string; priceDelta: number }[] }[]
      dishes: { id: string; modifierGroupIds: string[] }[]
    }>()

    const group = bundle.modifiers.find((g) => g.id === 'yaki-them')
    expect(group?.options.find((o) => o.id === 'yaki-them-toi')?.priceDelta).toBe(15_000)
    expect(bundle.dishes.find((d) => d.id === 'thanbo')?.modifierGroupIds).toContain('yaki-them')
  })

  it('khách chọn tuỳ chọn thì chênh giá vào thẳng dòng đơn', async () => {
    const before = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/order`,
      headers: ipad(),
    })
    const subBefore = before.json<{ order: { moneySub: number } }>().order.moneySub

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: ipad(),
      payload: { lines: [{ dishId: 'thanbo', qty: 1, modifierOptionIds: ['yaki-them-toi'] }] },
    })
    expect(res.statusCode).toBe(201)
    // 420.000 + 15.000 tỏi nướng
    expect(res.json<{ money: { sub: number } }>().money.sub).toBe(subBefore + 435_000)
  })

  it('tuỳ chọn xuống tới VÉ BẾP, không dừng ở dòng đơn', async () => {
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: ipad(),
      payload: {
        lines: [
          { dishId: 'thanbo', qty: 1, modifierOptionIds: ['yaki-them-rau'], note: 'cắt dày' },
        ],
      },
    })
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/send`,
      headers: staffAuth(),
    })

    const rows = await db.select().from(ticketItems)
    const item = rows.filter((r) => r.dishId === 'thanbo').at(-1)
    expect(item?.note).toBe('Rau ăn kèm — cắt dày')
  })
})

// ---------------------------------------------------------------------------

describe('4. Gọi nhân viên (T9 → P12)', () => {
  it('khách bấm gọi, yêu cầu hiện trên hàng đợi của POS', async () => {
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/requests`,
      headers: ipad(),
      payload: { kind: 'them-than' },
    })
    const res = await inject({
      method: 'GET',
      url: `/api/table-requests?branch=${fx.branchId}`,
      headers: staffAuth(),
    })
    const body = res.json<{ requests: { label: string; tableCode: string }[] }>()
    expect(body.requests.some((r) => r.label === 'Thêm than')).toBe(true)
  })

  it('"Xin tính tiền" được ghim lên đầu hàng đợi dù gửi sau', async () => {
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/requests`,
      headers: ipad(),
      payload: { kind: 'tinh-tien' },
    })
    const res = await inject({
      method: 'GET',
      url: `/api/table-requests?branch=${fx.branchId}`,
      headers: staffAuth(),
    })
    expect(res.json<{ requests: { label: string }[] }>().requests[0]!.label).toBe('Xin tính tiền')
  })

  it('nhân viên xử lý xong thì yêu cầu rời hàng đợi', async () => {
    const queue = await inject({
      method: 'GET',
      url: `/api/table-requests?branch=${fx.branchId}`,
      headers: staffAuth(),
    })
    const first = queue.json<{ requests: { id: number }[] }>().requests[0]!
    await inject({
      method: 'POST',
      url: `/api/table-requests/${first.id}/done`,
      headers: staffAuth(),
    })
    const after = await inject({
      method: 'GET',
      url: `/api/table-requests?branch=${fx.branchId}`,
      headers: staffAuth(),
    })
    expect(after.json<{ requests: { id: number }[] }>().requests.some((r) => r.id === first.id)).toBe(
      false,
    )
  })
})

// ---------------------------------------------------------------------------

/**
 * Một iPad cho cả bàn: người trả trước và người trả sau bấm trên cùng một máy, cách
 * nhau vài phút. Thứ phải chặn là người sau nhận lại món người trước ĐÃ tạo mã trả.
 */
describe('5. Chia tiền — món đã có người nhận không trả trùng được (T11 · T12)', () => {
  let lineIds: number[]

  beforeAll(async () => {
    const detail = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/order`,
      headers: ipad(),
    })
    lineIds = detail
      .json<{ lines: { id: number; priceTotal: number; parentLineId: number | null }[] }>()
      .lines.filter((l) => l.priceTotal > 0)
      .map((l) => l.id)
  })

  it('chia đều N: các phần cộng lại đúng bằng số còn phải trả, chênh nhau tối đa 1đ', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/split/preview`,
      headers: ipad(),
      payload: { parts: 3 },
    })
    const body = res.json<{ amounts: number[]; outstanding: number }>()
    expect(body.amounts).toHaveLength(3)
    expect(body.amounts.reduce((a, b) => a + b, 0)).toBe(body.outstanding)
    expect(Math.max(...body.amounts) - Math.min(...body.amounts)).toBeLessThanOrEqual(1)
  })

  it('người thứ nhất nhận vài món → tạo lượt trả kèm VietQR', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/split/claim`,
      headers: ipad(),
      payload: { orderLineIds: lineIds.slice(0, 2) },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ id: number; vaNumber: string; qrString: string }>()
    expect(body.vaNumber).toMatch(/^9704\d{8}$/)
    // Chuỗi VietQR theo chuẩn EMVCo, mở đầu 000201
    expect(body.qrString.startsWith('000201')).toBe(true)
  })

  it('người sau nhận lại đúng món đã có người nhận → BỊ CHẶN', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/split/claim`,
      headers: ipad(),
      payload: { orderLineIds: [lineIds[0]!] },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('line_already_claimed')
  })

  it('tạm tính báo món nào đã có người nhận — iPad khoá món đó trước khi bấm, không đợi lỗi', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/bill`,
      headers: ipad(),
    })
    const claimed = res
      .json<{ claimedLines: { orderLineId: number }[] }>()
      .claimedLines.map((c) => c.orderLineId)
    expect(claimed).toEqual(expect.arrayContaining(lineIds.slice(0, 2)))
  })

  it('nhận món KHÁC thì được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/split/claim`,
      headers: ipad(),
      payload: { orderLineIds: lineIds.slice(2, 3) },
    })
    expect(res.statusCode).toBe(201)
  })

  it('số còn phải trả trừ cả khoản ĐANG CHỜ — hai người không cùng trả hết được', async () => {
    const bill = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/bill`,
      headers: staffAuth(),
    })
    const total = bill.json<{ total: number }>().total

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/split/preview`,
      headers: ipad(),
      payload: { parts: 2 },
    })

    if (res.statusCode === 409) {
      // Ba lượt nhận món đã giữ trọn hoá đơn — đúng ý đồ: không ai trả thêm được
      expect(res.json<{ message: string }>().message).toContain('đã trả đủ')
      return
    }
    expect(res.json<{ outstanding: number }>().outstanding).toBeLessThan(total)
  })
})

// ---------------------------------------------------------------------------

describe('6. Chỉ ngân hàng mới đổi trạng thái đã trả (T13 · T14 · §20)', () => {
  let paymentId: number
  let vaNumber: string
  let amount: number
  /** Bàn riêng: bàn ở mục 5 đã bị các lượt nhận món giữ hết tiền */
  let qrSession: number

  beforeAll(async () => {
    const opened = await inject({
      method: 'POST',
      url: `/api/tables/${fx.spareTableId}/open`,
      headers: staffAuth(),
      payload: { guestCount: 2 },
    })
    expect(opened.statusCode, opened.payload).toBe(201)
    qrSession = opened.json<{ id: number }>().id

    await inject({
      method: 'POST',
      url: `/api/table-sessions/${qrSession}/lines`,
      headers: ipad(IPAD_A9),
      payload: { lines: [{ dishId: 'thanbo', qty: 1 }] },
    })

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${qrSession}/pay/vietqr`,
      headers: ipad(IPAD_A9),
      payload: { amount: 50_000 },
    })
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<{ id: number; vaNumber: string; amount: number }>()
    paymentId = body.id
    vaNumber = body.vaNumber
    amount = body.amount
  })

  it('lượt trả mới sinh ra ở trạng thái chờ, chưa phải đã trả', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/payments/${paymentId}/status`,
      headers: ipad(IPAD_A9),
    })
    expect(res.json<{ state: string }>().state).toBe('pending')
  })

  it('webhook sai chữ ký bị từ chối', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/webhooks/bank',
      headers: { 'content-type': 'application/json', 'x-bank-signature': 'chu-ky-gia' },
      payload: JSON.stringify({ bankRef: 'GIA-01', vaNumber, amount }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('webhook thiếu chữ ký bị từ chối', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/webhooks/bank',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ bankRef: 'GIA-02', vaNumber, amount }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('webhook đúng chữ ký → đổi sang đã trả và ghi sổ doanh thu', async () => {
    const res = await bankWebhook({ bankRef: 'FT26080100001', vaNumber, amount })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ matched: boolean }>().matched).toBe(true)

    const status = await inject({
      method: 'GET',
      url: `/api/payments/${paymentId}/status`,
      headers: ipad(IPAD_A9),
    })
    expect(status.json<{ state: string; paidAt: string }>().state).toBe('paid')

    const entries = await db.select().from(journalEntries)
    expect(entries.some((e) => e.paymentId === paymentId)).toBe(true)
  })

  it('ngân hàng gửi lại cùng mã giao dịch → không xử lý hai lần', async () => {
    const before = (await db.select().from(journalEntries)).length
    const res = await bankWebhook({ bankRef: 'FT26080100001', vaNumber, amount })
    expect(res.json<{ duplicate: boolean }>().duplicate).toBe(true)
    expect((await db.select().from(journalEntries)).length).toBe(before)
  })

  it('tiền vào VA lạ vẫn được ghi vào hộp thư để người đối soát xử lý', async () => {
    const res = await bankWebhook({
      bankRef: 'FT26080199999',
      vaNumber: '9704000099',
      amount: 123_000,
    })
    expect(res.json<{ matched: boolean }>().matched).toBe(false)

    const events = await db.select().from(bankEvents)
    const orphan = events.find((e) => e.bankRef === 'FT26080199999')
    expect(orphan).toBeDefined()
    expect(orphan!.matchState).toBe('unmatched')
  })

  it('chuyển sai số tiền → đánh dấu lệch, KHÔNG tự coi là đã trả', async () => {
    const created = await inject({
      method: 'POST',
      url: `/api/table-sessions/${qrSession}/pay/vietqr`,
      headers: ipad(IPAD_A9),
      payload: { amount: 30_000 },
    })
    const p = created.json<{ id: number; vaNumber: string }>()

    const res = await bankWebhook({ bankRef: 'FT26080100002', vaNumber: p.vaNumber, amount: 25_000 })
    expect(res.json<{ mismatch: boolean }>().mismatch).toBe(true)

    const rows = await db.select().from(payments)
    expect(rows.find((r) => r.id === p.id)!.state).toBe('mismatch')
  })

  it('lượt trả đã trả tiền luôn có mốc paid_at — ràng buộc CSDL cưỡng chế', async () => {
    const rows = await db.select().from(payments)
    for (const row of rows.filter((r) => r.state === 'paid')) {
      expect(row.paidAt).not.toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------

describe('7. Món hết khoá ngay trên iPad (K5 → T2)', () => {
  it('thu ngân KHÔNG được báo hết món — đó là việc của bếp (§4.2)', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/availability',
      headers: staffAuth(),
      payload: { dishId: 'kemtra', status: 'sold_out' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('bếp báo hết → khách gọi món đó bị từ chối', async () => {
    const chef = (
      await inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { [DEVICE_HEADER]: SEED_DEVICE },
        payload: { branchId: fx.branchId, staffId: fx.chefId, pin: fx.pins[fx.chefId] },
      })
    ).json<{ token: string }>().token

    const marked = await inject({
      method: 'POST',
      url: '/api/availability',
      headers: { authorization: `Bearer ${chef}`, [DEVICE_HEADER]: SEED_DEVICE },
      payload: { dishId: 'kemtra', status: 'sold_out' },
    })
    expect(marked.statusCode).toBe(201)

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: ipad(),
      payload: { lines: [{ dishId: 'kemtra', qty: 1 }] },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('dish_sold_out')
  })

  it('khách đọc được danh sách món hết để tô xám ngay trên iPad', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/availability?branch=${fx.branchId}`,
      headers: ipad(),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ dishId: string }[]>().some((a) => a.dishId === 'kemtra')).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('7b. Chấm sao sau bữa ăn (T15 → B13)', () => {
  it('khách chấm sao kèm nhận xét', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/feedback`,
      headers: ipad(),
      payload: { stars: 4, comment: 'Thăn bò ngon, chờ hơi lâu' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ stars: number }>().stars).toBe(4)
  })

  it('chấm lại thì SỬA phiếu cũ, không đẻ ra hai ý kiến của một bữa', async () => {
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/feedback`,
      headers: ipad(),
      payload: { stars: 5, comment: 'Nghĩ lại thì rất đáng' },
    })

    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/feedback`,
      headers: ipad(),
    })
    expect(res.json<{ stars: number; comment: string }>()).toEqual({
      stars: 5,
      comment: 'Nghĩ lại thì rất đáng',
    })

    const rows = await db.select().from(tableFeedback)
    expect(rows.filter((r) => r.tableSessionId === sessionId)).toHaveLength(1)
  })

  it('số sao ngoài thang 1–5 bị từ chối', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/feedback`,
      headers: ipad(),
      payload: { stars: 9 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('khách không chấm hộ bàn khác được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${otherSession}/feedback`,
      headers: ipad(),
      payload: { stars: 1 },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ---------------------------------------------------------------------------

describe('8. Đóng bàn thì iPad về màn bàn chưa mở (§9.1)', () => {
  it('trả nốt phần còn lại rồi đóng bàn', async () => {
    const bill = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/bill`,
      headers: staffAuth(),
    })
    const outstanding = bill.json<{ outstanding: number }>().outstanding
    if (outstanding > 0) {
      await inject({
        method: 'POST',
        url: `/api/table-sessions/${sessionId}/pay/cash`,
        headers: staffAuth(),
        payload: { amount: outstanding },
      })
    }

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/close`,
      headers: staffAuth(),
    })
    expect(res.statusCode).toBe(201)
  })

  it('iPad thấy bàn đã về trạng thái chưa mở', async () => {
    const res = await inject({ method: 'GET', url: '/api/table-terminal', headers: ipad() })
    expect(res.json<TerminalState>().session).toBeNull()
  })

  it('khách bàn trước không còn đọc được đơn của mình trên iPad', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/order`,
      headers: ipad(),
    })
    expect(res.statusCode).toBe(403)
  })

  it('khách sau tự mở bàn là phiên MỚI — không thấy đơn của khách trước', async () => {
    const res = await selfOpen(ipadA4, 2)
    expect(res.statusCode, res.payload).toBe(201)
    const next = res.json<TerminalState>().session!
    expect(next.id).not.toBe(sessionId)

    const old = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/order`,
      headers: ipad(),
    })
    expect(old.statusCode).toBe(403)
  })

  it('ngắt iPad ở A4 thì máy đó hết đường vào ngay', async () => {
    const revoked = await inject({
      method: 'DELETE',
      url: `/api/admin/devices/${ipadA4Id}`,
      headers: asManager(),
    })
    expect(revoked.statusCode, revoked.payload).toBe(200)

    const res = await inject({ method: 'GET', url: '/api/table-terminal', headers: ipad() })
    expect(res.statusCode).toBe(401)
  })

  it('ngắt máy cũ rồi thì ghép được iPad mới cho bàn đó', async () => {
    expect((await pairingCode(fx.grillTableId)).statusCode).toBe(201)
  })
})
