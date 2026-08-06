/**
 * Nghiệm thu GĐ2 (phần backend) — khách tại bàn tự gọi món và tự trả tiền.
 *
 * Kịch bản exit trong kế hoạch: hai điện thoại cùng bàn chia món không thể trùng ·
 * chỉ webhook ngân hàng mới đổi trạng thái đã trả · đóng bàn thì token cũ chết ·
 * món 86 khoá ngay trên điện thoại.
 */
import { createHmac } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { IDEMPOTENCY_HEADER } from '@sora/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { ParamsService } from '../common/params.service'
import {
  bankEvents,
  devices,
  journalEntries,
  parameters,
  payments,
  tableFeedback,
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
let sessionId: number
/** Bàn bên cạnh — dùng để chứng minh token bàn này không mở được bàn kia */
let otherSession: number
/** Cookie của "điện thoại" khách — hai máy KHÁC NHAU, không dùng chung token */
let phoneA: string
let phoneB: string

/** Địa chỉ giả lập máy đang bắt Wi-Fi của quán; khai vào tham số ở beforeAll */
const TRONG_QUAN = '203.0.113.10'

/** Mã bàn mà harness dựng sẵn */
const GRILL_TABLE_CODE = 'A4'
const SPARE_TABLE_CODE = 'A9'

/** Khách quét mã dán bàn từ một địa chỉ mạng cho trước */
const joinTable = (ip: string) =>
  inject({
    method: 'POST',
    url: '/api/table-devices/join',
    headers: { 'x-forwarded-for': ip },
    payload: { branchId: fx.branchId, tableCode: GRILL_TABLE_CODE },
  })

const cookieOf = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.map((c) => `${c.name}=${c.value}`).join('; ')

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const staffAuth = () => ({ authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE })

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

  await inject({
    method: 'POST',
    url: '/api/shifts',
    headers: staffAuth(),
    payload: { branchId: fx.branchId, openingCash: 0 },
  })

  sessionId = (
    await inject({
      method: 'POST',
      url: `/api/tables/${fx.grillTableId}/open`,
      headers: staffAuth(),
      payload: { guestCount: 4 },
    })
  ).json<{ id: number }>().id

  /**
   * Khai đường mạng của quán, rồi NẠP LẠI tham số.
   *
   * ParamsService giữ cache trong tiến trình và chỉ nạp lại khi có sự kiện đổi
   * tham số — ghi thẳng vào CSDL sau khi app đã chạy thì nó không thấy, và mọi
   * máy sẽ rơi vào hàng chờ duyệt. Sai kiểu này rất khó lần vì không có lỗi nào.
   */
  await db.insert(parameters).values({
    key: 'table.branchNetworks',
    branchId: fx.branchId,
    value: TRONG_QUAN,
  })
  await app.get(ParamsService).reload()
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('1. Quét mã QR dán bàn (T1)', () => {
  it('máy đang ở trong quán vào thẳng, thành chủ bàn', async () => {
    const res = await joinTable(TRONG_QUAN)
    expect(res.statusCode).toBe(201)
    const body = res.json<{ state: string; isHost: boolean; sessionId: number }>()
    expect(body.state).toBe('admitted')
    expect(body.isHost).toBe(true)
    expect(body.sessionId).toBe(sessionId)

    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    phoneA = cookieOf(res)
  })

  it('CSDL chỉ giữ bản băm của máy, không giữ token', async () => {
    const rows = await db.query.tableDevices.findMany({
      where: (d, { eq }) => eq(d.tableSessionId, sessionId),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tokenHash).toHaveLength(64) // SHA-256 dạng hex
    expect(phoneA).not.toContain(rows[0]!.tokenHash)
  })

  it('điện thoại thứ hai cùng bàn cũng vào được, nhưng không là chủ bàn', async () => {
    const res = await joinTable(TRONG_QUAN)
    const body = res.json<{ state: string; isHost: boolean }>()
    expect(body.state).toBe('admitted')
    expect(body.isHost).toBe(false)
    phoneB = cookieOf(res)
  })

  /**
   * Đây là lớp bảo vệ chính của luồng mới: mã QR dán bàn ai chụp cũng được, nên
   * thứ chặn người ở nhà là việc họ KHÔNG đi ra internet qua đường mạng của quán.
   */
  it('máy ở ngoài quán chỉ được xếp hàng chờ duyệt', async () => {
    const res = await joinTable('198.51.100.7')
    const body = res.json<{ state: string; isHost: boolean }>()
    expect(body.state).toBe('waiting')
    expect(body.isHost).toBe(false)
  })

  it('quét mã của bàn chưa mở thì không mở ra gì cả', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/table-devices/join',
      headers: { 'x-forwarded-for': TRONG_QUAN },
      payload: { branchId: fx.branchId, tableCode: 'KHONG-CO-BAN-NAY' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('khách chốt lại số khách của bàn mình', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/guests`,
      headers: { cookie: phoneA },
      payload: { guestCount: 3 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ guestCount: number }>().guestCount).toBe(3)

    // Trả lại 4 để các mục sau đọc đúng con số ban đầu
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/guests`,
      headers: { cookie: phoneA },
      payload: { guestCount: 4 },
    })
  })

  it('số khách vượt sức chứa bàn bị chặn — y như lúc nhân viên mở bàn', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/guests`,
      headers: { cookie: phoneA },
      payload: { guestCount: 40 },
    })
    expect(res.statusCode).toBe(409)
  })

  it('điện thoại đọc được mình đang ngồi bàn nào — T1 mới chào bàn được', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}`,
      headers: { cookie: phoneA },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{
      guestCount: number
      table: { code: string; hasGrill: boolean }
    }>()
    expect(body.guestCount).toBe(4)
    expect(body.table.code).toBeTruthy()
    expect(body.table.hasGrill).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('2. Khách tự gọi món (T2 · T6 · T7)', () => {
  it('khách thêm món vào đơn của bàn mình', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: { cookie: phoneA },
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

  it('khách KHÔNG gọi món hộ bàn khác được', async () => {
    otherSession = (
      await inject({
        method: 'POST',
        url: `/api/tables/${fx.plainTableId}/open`,
        headers: staffAuth(),
        payload: { guestCount: 2 },
      })
    ).json<{ id: number }>().id

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${otherSession}/requests`,
      headers: { cookie: phoneA },
      payload: { kind: 'phuc-vu' },
    })
    expect(res.statusCode).toBe(400)
  })

  /**
   * Mã phiên là số chạy nên đoán được. Không có chốt này thì sửa số trên thanh
   * địa chỉ là đọc được đơn và tạm tính của bàn bên cạnh.
   */
  it('khách KHÔNG đọc được đơn, tạm tính hay thông tin của bàn khác', async () => {
    for (const path of ['', '/order', '/bill']) {
      const res = await inject({
        method: 'GET',
        url: `/api/table-sessions/${otherSession}${path}`,
        headers: { cookie: phoneA },
      })
      expect(res.statusCode, `GET ${path || '/'}`).toBe(403)
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
      headers: staffAuth(),
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
      headers: { cookie: phoneA, [IDEMPOTENCY_HEADER]: key },
      payload,
    })
    const replay = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: { cookie: phoneA, [IDEMPOTENCY_HEADER]: key },
      payload,
    })
    expect(replay.json<{ money: { sub: number } }>().money.sub).toBe(
      first.json<{ money: { sub: number } }>().money.sub,
    )
  })
})

// ---------------------------------------------------------------------------

describe('2b. Thực đơn trên điện thoại (T2 · T3 · T5)', () => {
  beforeAll(async () => {
    // Ngoài đời Office bấm "Lưu & phát hành"; ở đây gọi thẳng service vì thu ngân
    // không có quyền sửa giá — và quyền đó không phải thứ mục này đang kiểm.
    await app.get(ConfigBundleService).publish(fx.branchId, { kind: 'system' })
  })

  it('bundle mang theo nhóm tuỳ chọn và món nào dùng nhóm nào', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/config?branch=${fx.branchId}`,
      headers: { cookie: phoneA },
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
      headers: { cookie: phoneA },
    })
    const subBefore = before.json<{ order: { moneySub: number } }>().order.moneySub

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: { cookie: phoneA },
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
      headers: { cookie: phoneA },
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

describe('3. Gọi nhân viên (T9 → P12)', () => {
  it('khách bấm gọi, yêu cầu hiện trên hàng đợi của POS', async () => {
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/requests`,
      headers: { cookie: phoneA },
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
      headers: { cookie: phoneA },
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

describe('4. Chia tiền — hai điện thoại không thể trả trùng (T11 · T12)', () => {
  let lineIds: number[]

  beforeAll(async () => {
    const detail = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/order`,
      headers: { cookie: phoneA },
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
      headers: { cookie: phoneA },
      payload: { parts: 3 },
    })
    const body = res.json<{ amounts: number[]; outstanding: number }>()
    expect(body.amounts).toHaveLength(3)
    expect(body.amounts.reduce((a, b) => a + b, 0)).toBe(body.outstanding)
    expect(Math.max(...body.amounts) - Math.min(...body.amounts)).toBeLessThanOrEqual(1)
  })

  it('điện thoại A nhận vài món → tạo lượt trả kèm VietQR', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/split/claim`,
      headers: { cookie: phoneA },
      payload: { orderLineIds: lineIds.slice(0, 2) },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ id: number; vaNumber: string; qrString: string }>()
    expect(body.vaNumber).toMatch(/^9704\d{8}$/)
    // Chuỗi VietQR theo chuẩn EMVCo, mở đầu 000201
    expect(body.qrString.startsWith('000201')).toBe(true)
  })

  it('điện thoại B nhận đúng món A đã nhận → BỊ CHẶN', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/split/claim`,
      headers: { cookie: phoneB },
      payload: { orderLineIds: [lineIds[0]!] },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('line_already_claimed')
  })

  it('tạm tính báo món nào đã có người nhận — máy kia khoá trước khi bấm, không đợi lỗi', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/bill`,
      headers: { cookie: phoneB },
    })
    const claimed = res
      .json<{ claimedLines: { orderLineId: number }[] }>()
      .claimedLines.map((c) => c.orderLineId)
    expect(claimed).toEqual(expect.arrayContaining(lineIds.slice(0, 2)))
  })

  it('điện thoại B nhận món KHÁC thì được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/split/claim`,
      headers: { cookie: phoneB },
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
      headers: { cookie: phoneA },
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

describe('5. Chỉ ngân hàng mới đổi trạng thái đã trả (T13 · T14 · §20)', () => {
  let paymentId: number
  let vaNumber: string
  let amount: number
  /** Bàn riêng: bàn ở mục 4 đã bị các lượt nhận món giữ hết tiền */
  let qrSession: number
  let qrCookie: string

  beforeAll(async () => {
    const opened = await inject({
      method: 'POST',
      url: `/api/tables/${fx.spareTableId}/open`,
      headers: staffAuth(),
      payload: { guestCount: 2 },
    })
    expect(opened.statusCode, opened.payload).toBe(201)
    qrSession = opened.json<{ id: number }>().id

    const joined = await inject({
      method: 'POST',
      url: '/api/table-devices/join',
      headers: { 'x-forwarded-for': TRONG_QUAN },
      payload: { branchId: fx.branchId, tableCode: SPARE_TABLE_CODE },
    })
    expect(joined.statusCode, joined.payload).toBe(201)
    expect(joined.json<{ state: string }>().state).toBe('admitted')
    qrCookie = cookieOf(joined)

    await inject({
      method: 'POST',
      url: `/api/table-sessions/${qrSession}/lines`,
      headers: { cookie: qrCookie },
      payload: { lines: [{ dishId: 'thanbo', qty: 1 }] },
    })

    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${qrSession}/pay/vietqr`,
      headers: { cookie: qrCookie },
      payload: { amount: 50_000 },
    })
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<{ id: number; vaNumber: string; amount: number }>()
    paymentId = body.id
    vaNumber = body.vaNumber
    amount = body.amount
  })

  it('lượt trả mới sinh ra ở trạng thái chờ, chưa phải đã trả', async () => {
    const res = await inject({ method: 'GET', url: `/api/payments/${paymentId}/status`, headers: { cookie: qrCookie } })
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

    const status = await inject({ method: 'GET', url: `/api/payments/${paymentId}/status`, headers: { cookie: qrCookie } })
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
      headers: { cookie: qrCookie },
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

describe('6. Món hết khoá ngay trên điện thoại khách (K5 → T2)', () => {
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
      headers: { cookie: phoneA },
      payload: { lines: [{ dishId: 'kemtra', qty: 1 }] },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('dish_sold_out')
  })

  it('khách đọc được danh sách món hết để tô xám ngay trên máy mình', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/availability?branch=${fx.branchId}`,
      headers: { cookie: phoneA },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ dishId: string }[]>().some((a) => a.dishId === 'kemtra')).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('6b. Chấm sao sau bữa ăn (T15 → B13)', () => {
  it('khách chấm sao kèm nhận xét', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/feedback`,
      headers: { cookie: phoneA },
      payload: { stars: 4, comment: 'Thăn bò ngon, chờ hơi lâu' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ stars: number }>().stars).toBe(4)
  })

  it('chấm lại thì SỬA phiếu cũ, không đẻ ra hai ý kiến của một bữa', async () => {
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/feedback`,
      headers: { cookie: phoneA },
      payload: { stars: 5, comment: 'Nghĩ lại thì rất đáng' },
    })

    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/feedback`,
      headers: { cookie: phoneA },
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
      headers: { cookie: phoneA },
      payload: { stars: 9 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('khách không chấm hộ bàn khác được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${otherSession}/feedback`,
      headers: { cookie: phoneA },
      payload: { stars: 1 },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ---------------------------------------------------------------------------

describe('7. Đóng bàn thì token QR chết theo (§8)', () => {
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

  it('token cũ không dùng lại được — khách bàn trước không đọc được đơn bàn sau', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/order`,
      headers: { cookie: phoneA },
    })
    expect(res.statusCode).toBe(401)
  })

  it('quét lại mã dán bàn cũng không vào được nữa — bàn đã đóng', async () => {
    const res = await joinTable(TRONG_QUAN)
    expect(res.statusCode).toBe(404)
  })
})
