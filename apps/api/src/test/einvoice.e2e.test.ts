/**
 * Hoá đơn điện tử khởi tạo từ máy tính tiền (NĐ 254/2026, TT 91/2026) — đường thật
 * từ lượt thu tiền tới tờ hoá đơn.
 *
 * Phải chứng minh:
 *   1. Bill trả ĐỦ mới sinh hoá đơn, và đúng MỘT tờ, có từng món và VAT theo
 *      từng thuế suất (món ăn 8%, bia 10%).
 *   2. Webhook ngân hàng chỉ xếp hàng, không đứng chờ nhà cung cấp; lượt hỏi kế
 *      tiếp (iPad, trạm thu ngân) là lượt phát hành.
 *   3. Hoá đơn hỏng không bao giờ làm hỏng lượt thu; số đã cấp giữ nguyên cho lượt
 *      gửi lại; hai lượt thử cùng lúc chỉ gọi nhà cung cấp một lần.
 *   4. Người mua (công ty, cá nhân) khai ở iPad, POS hay web nằm trên đơn tới lúc
 *      phát hành; sau đó chỉ còn đường lập hoá đơn thay thế.
 *   5. Gõ MST là có tên, địa chỉ — từ hồ sơ B15, danh bạ của quán hay nguồn ngoài;
 *      số định danh cá nhân không bao giờ đem đi tra.
 */
import { createHmac } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ParamsService } from '../common/params.service'
import type { Db } from '../db/client'
import {
  corporateCustomers,
  deliveryZones,
  devices,
  dishes,
  invoiceBuyers,
  invoices,
  orders,
  payments,
} from '../db/schema'
import { EINVOICE_PROVIDER, type MockEinvoiceProvider } from '../modules/einvoice/einvoice-provider'
import { TAX_CODE_REGISTRY, type MockTaxCodeRegistry } from '../modules/einvoice/tax-code-registry'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>
let cashier: string
let manager: string
let params: ParamsService
let provider: MockEinvoiceProvider

const SEED_DEVICE = 'seed-device-token'
const BANK_SECRET = 'dev-bank-secret'
/** iPad gắn bàn 05 — ghép thẳng vào CSDL, đường ghép đã kiểm ở table-payments */
const IPAD_05 = 'ipad-ban-05-token'

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const auth = () => ({ authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE })
const asManager = () => ({ authorization: `Bearer ${manager}`, [DEVICE_HEADER]: SEED_DEVICE })
/** iPad chỉ mang token thiết bị — bàn đang mở thì nó là khách (R0) của đúng bàn đó */
const ipad = () => ({ [DEVICE_HEADER]: IPAD_05 })

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

/** Mở bàn dự phòng, gọi món, trả về phiên và đơn */
async function tableWith(lines: { dishId: string; qty: number }[], tableId = fx.spareTableId) {
  const opened = await inject({
    method: 'POST',
    url: `/api/tables/${tableId}/open`,
    headers: auth(),
    payload: { guestCount: 2 },
  })
  expect(opened.statusCode, opened.payload).toBe(201)
  const sessionId = opened.json<{ id: number }>().id
  const added = await inject({
    method: 'POST',
    url: `/api/table-sessions/${sessionId}/lines`,
    headers: auth(),
    payload: { lines },
  })
  expect(added.statusCode, added.payload).toBe(201)
  return { sessionId, orderId: added.json<{ orderId: number }>().orderId }
}

async function payCash(sessionId: number, amount: number) {
  const res = await inject({
    method: 'POST',
    url: `/api/table-sessions/${sessionId}/pay/cash`,
    headers: auth(),
    payload: { amount },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json()
}

async function closeTable(sessionId: number) {
  const res = await inject({
    method: 'POST',
    url: `/api/table-sessions/${sessionId}/close`,
    headers: auth(),
  })
  expect(res.statusCode, res.payload).toBe(201)
}

const invoicesOf = (orderId: number) =>
  db.select().from(invoices).where(eq(invoices.orderId, orderId))

beforeAll(async () => {
  process.env.BANK_WEBHOOK_SECRET = BANK_SECRET
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close
  params = app.get(ParamsService)
  provider = app.get<MockEinvoiceProvider>(EINVOICE_PROVIDER)

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
  ])
  const login = async (staffId: number) =>
    (
      await inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { [DEVICE_HEADER]: SEED_DEVICE },
        payload: { branchId: fx.branchId, staffId, pin: fx.pins[staffId] },
      })
    ).json<{ token: string }>().token
  cashier = await login(fx.cashierId)
  manager = await login(fx.managerId)

  const shift = await inject({
    method: 'POST',
    url: '/api/shifts',
    headers: auth(),
    payload: { branchId: fx.branchId, openingCash: 1_000_000 },
  })
  expect(shift.statusCode, shift.payload).toBe(201)

  await db.insert(dishes).values({
    id: 'asahi',
    code: 'SORA-BIA-001',
    kind: 'drink',
    nameVi: 'Bia Asahi',
    basePrice: 95_000,
    routingMethod: 'fixed',
    stationGrill: 'ST-01',
    stationNoGrill: 'ST-01',
    stationTakeaway: 'ST-01',
    stationDelivery: 'ST-01',
    vatCode: 'alcohol',
  })

  // Kế toán khai A9 và bật VAT ở A6
  await params.set('sales.vatRate', 0.08)
  await params.set('sales.vatRateAlcohol', 0.1)
  await params.set('einvoice.taxCode', '0101234567')
  await params.set('einvoice.sellerName', 'CÔNG TY TNHH TOKYO SORA')
  await params.set('einvoice.sellerAddress', '12 Trần Thái Tông, Cầu Giấy, Hà Nội')
  await params.set('einvoice.serial', 'C26MAA', { branchId: fx.branchId })
  await params.set('einvoice.enabled', true, { branchId: fx.branchId })
}, 120_000)

afterAll(async () => close?.())

describe('Bill trả đủ là một hoá đơn', () => {
  it('trả một phần chưa có hoá đơn; trả nốt mới có — đúng một tờ, từng món, VAT từng thuế suất', async () => {
    const { sessionId, orderId } = await tableWith([
      { dishId: 'bachibo', qty: 2 },
      { dishId: 'asahi', qty: 2 },
    ])
    // 570.000 + 45.600 (8%) + 190.000 + 19.000 (10%) = 824.600 → 825.000
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    expect(order!.moneyTotal).toBe(825_000)

    const first = await payCash(sessionId, 500_000)
    expect(first.invoice).toBeNull()
    expect(await invoicesOf(orderId)).toHaveLength(0)

    const rest = await payCash(sessionId, 325_000)
    expect(rest.invoice).toMatchObject({ state: 'issued', test: true, invoiceNo: '00000001' })
    expect(rest.invoice.document.lines.map((l: { name: string }) => l.name)).toEqual([
      'Ba chỉ bò',
      'Bia Asahi',
    ])
    expect(
      rest.invoice.document.vatBreakdown.map((r: { rateBp: number; vat: number }) => [
        r.rateBp,
        r.vat,
      ]),
    ).toEqual([
      [800, 45_600],
      [1000, 19_000],
    ])
    expect(rest.invoice.document.amounts).toMatchObject({ total: 824_600, round: 400 })
    expect(rest.invoice.document.paymentMethod).toBe('TM')
    expect(rest.invoice.document.buyer).toBeNull()

    // Đóng bàn không sinh tờ thứ hai
    await closeTable(sessionId)
    expect(await invoicesOf(orderId)).toHaveLength(1)
  })

  it('thu bằng thẻ: ghi số phiếu, hoá đơn ghi hình thức Thẻ', async () => {
    const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }])
    const res = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/pay/card`,
      headers: auth(),
      payload: { amount: 308_000, reference: '004512' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().invoice).toMatchObject({ state: 'issued', invoiceNo: '00000002' })
    expect(res.json().invoice.document.paymentMethod).toBe('Thẻ')

    const [payment] = await db.select().from(payments).where(eq(payments.orderId, orderId))
    expect(payment).toMatchObject({ kind: 'card', reference: '004512', state: 'paid' })
    await closeTable(sessionId)
  })

  it('chi nhánh chưa bật hoá đơn điện tử: thu tiền như thường, không sinh hoá đơn', async () => {
    await params.set('einvoice.enabled', false, { branchId: fx.branchId })
    try {
      const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }])
      const res = await payCash(sessionId, 308_000)
      expect(res.paymentState).toBe('paid')
      expect(res.invoice).toBeNull()
      expect(await invoicesOf(orderId)).toHaveLength(0)
      await closeTable(sessionId)
    } finally {
      await params.set('einvoice.enabled', true, { branchId: fx.branchId })
    }
  })

  it('ký hiệu khai sai không làm hỏng lượt thu — hoá đơn nằm hàng đợi, nói rõ lỗi gì', async () => {
    await params.set('einvoice.serial', 'C26AAA', { branchId: fx.branchId })
    try {
      const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }])
      const res = await payCash(sessionId, 308_000)
      expect(res.paymentState).toBe('paid')
      expect(res.invoice).toMatchObject({ state: 'failed', invoiceNo: null })
      expect(res.invoice.lastError).toContain('chữ M')
      const [row] = await invoicesOf(orderId)
      expect(row!.lastErrorCode).toBe('bad_serial')

      // Khai đúng lại rồi phát hành lại từ quầy
      await params.set('einvoice.serial', 'C26MAA', { branchId: fx.branchId })
      const again = await inject({
        method: 'POST',
        url: `/api/orders/${orderId}/invoice/issue`,
        headers: auth(),
      })
      expect(again.statusCode, again.payload).toBe(201)
      expect(again.json()).toMatchObject({ state: 'issued', invoiceNo: '00000003' })
      await closeTable(sessionId)
    } finally {
      await params.set('einvoice.serial', 'C26MAA', { branchId: fx.branchId })
    }
  })

  it('nhà cung cấp lỗi tạm: số đã cấp giữ nguyên cho lượt gửi lại', async () => {
    provider.failNext('provider_busy', 'Hệ thống thuế đang bận')
    const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }])
    const res = await payCash(sessionId, 308_000)
    expect(res.invoice).toMatchObject({ state: 'failed', invoiceNo: '00000004' })

    const again = await inject({
      method: 'POST',
      url: `/api/orders/${orderId}/invoice/issue`,
      headers: auth(),
    })
    expect(again.json()).toMatchObject({ state: 'issued', invoiceNo: '00000004' })
    // Cùng một khoá gửi cho cả hai lượt — nhà cung cấp nhận ra là một hoá đơn
    const keys = provider.calls.filter((c) => c.invoiceNo === '00000004').map((c) => c.requestKey)
    expect(new Set(keys).size).toBe(1)
    await closeTable(sessionId)
  })

  it('phát hành lại đơn đã có hoá đơn là sai phạm thuế — 409', async () => {
    const [issued] = await db.select().from(invoices).where(eq(invoices.state, 'issued')).limit(1)
    const res = await inject({
      method: 'POST',
      url: `/api/orders/${issued!.orderId}/invoice/issue`,
      headers: auth(),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('invoice_exists')
  })
})

describe('VietQR: webhook xếp hàng, lượt hỏi phát hành', () => {
  let sessionId: number
  let orderId: number

  beforeAll(async () => {
    ;({ sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }]))
    const qr = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/pay/vietqr`,
      headers: auth(),
      payload: { amount: 308_000 },
    })
    expect(qr.statusCode, qr.payload).toBe(201)
    const callsBefore = provider.calls.length
    const hook = await bankWebhook({
      bankRef: 'FT26102200001',
      vaNumber: qr.json<{ vaNumber: string }>().vaNumber,
      amount: 308_000,
    })
    expect(hook.statusCode, hook.payload).toBe(201)
    // Webhook không gọi nhà cung cấp hoá đơn
    expect(provider.calls.length).toBe(callsBefore)
  })

  it('sau webhook hoá đơn nằm hàng chờ, chưa ai gọi nhà cung cấp', async () => {
    const [row] = await invoicesOf(orderId)
    expect(row).toMatchObject({ state: 'pending', attempts: 0, invoiceNo: null })
  })

  it('hai lượt hỏi cùng lúc chỉ một lượt gọi nhà cung cấp, cả hai thấy hoá đơn', async () => {
    const callsBefore = provider.calls.length
    const [a, b] = await Promise.all([
      inject({ method: 'GET', url: `/api/table-sessions/${sessionId}/invoice`, headers: auth() }),
      inject({ method: 'GET', url: `/api/table-sessions/${sessionId}/invoice`, headers: auth() }),
    ])
    expect(provider.calls.length - callsBefore).toBe(1)
    for (const res of [a, b]) {
      expect(res.statusCode, res.payload).toBe(200)
      expect(res.json()).toMatchObject({ enabled: true, editable: false, buyer: null })
    }
    const states = [a, b].map((r) => r.json().invoice.state)
    expect(states).toContain('issued')
    expect((await invoicesOf(orderId))[0]!.state).toBe('issued')
    expect((await invoicesOf(orderId))[0]!.paymentMethod).toBe('CK')
    await closeTable(sessionId)
  })
})

describe('Trạm thu ngân hỏi hàng chờ', () => {
  it('lượt hỏi đẩy hoá đơn tới lượt; còn lại đếm rõ chờ / hỏng', async () => {
    // Một hoá đơn chờ do webhook (chưa ai hỏi)
    const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }])
    const qr = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/pay/vietqr`,
      headers: auth(),
      payload: { amount: 308_000 },
    })
    await bankWebhook({
      bankRef: 'FT26102200002',
      vaNumber: qr.json<{ vaNumber: string }>().vaNumber,
      amount: 308_000,
    })
    expect((await invoicesOf(orderId))[0]!.state).toBe('pending')

    const res = await inject({
      method: 'GET',
      url: `/api/accounting/invoices/pending?branch=${fx.branchId}`,
      headers: auth(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().counts).toEqual({ pending: 0, failed: 0 })
    expect((await invoicesOf(orderId))[0]!.state).toBe('issued')
    await closeTable(sessionId)
  })

  it('không ai có hai hoá đơn còn hiệu lực', async () => {
    const live = await db
      .select({ orderId: invoices.orderId })
      .from(invoices)
      .where(and(inArray(invoices.state, ['pending', 'issued', 'failed'])))
    const orderIds = live.map((r) => r.orderId)
    expect(new Set(orderIds).size).toBe(orderIds.length)
  })
})

const COMPANY = {
  kind: 'company' as const,
  taxCode: '0312345678',
  name: 'CÔNG TY TNHH THỰC PHẨM AN BÌNH',
  address: '45 Nguyễn Huệ, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
  email: 'ketoan@anbinh.vn',
}

const setBuyer = (sessionId: number, buyer: unknown, headers: Record<string, string> = ipad()) =>
  inject({
    method: 'PUT',
    url: `/api/table-sessions/${sessionId}/invoice-buyer`,
    headers,
    payload: { buyer },
  })

const issueAgain = (orderId: number) =>
  inject({ method: 'POST', url: `/api/orders/${orderId}/invoice/issue`, headers: auth() })

describe('Người mua khai tại bàn', () => {
  it('iPad khai công ty cho bàn mình: hoá đơn ghi đúng công ty, hồ sơ B15 gửi kèm bị bỏ', async () => {
    const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }], fx.plainTableId)
    const res = await setBuyer(sessionId, { ...COMPANY, corporateId: 1 })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json()).toMatchObject({ enabled: true, editable: true, invoice: null })
    expect(res.json().buyer).toEqual(COMPANY)

    const paid = await payCash(sessionId, 308_000)
    expect(paid.invoice.state).toBe('issued')
    expect(paid.invoice.document.buyer).toEqual(COMPANY)
    const [row] = await invoicesOf(orderId)
    expect(row).toMatchObject({
      buyerKind: 'company',
      buyerTaxCode: COMPANY.taxCode,
      buyerName: COMPANY.name,
      buyerAddress: COMPANY.address,
      buyerEmail: COMPANY.email,
    })
    // Lần sau gõ MST này là điền sẵn
    const [known] = await db
      .select()
      .from(invoiceBuyers)
      .where(eq(invoiceBuyers.taxCode, COMPANY.taxCode))
    expect(known).toMatchObject({ name: COMPANY.name, source: 'invoice' })

    // Đã phát hành: đổi người mua là việc của thu ngân — lập hoá đơn thay thế
    const late = await setBuyer(sessionId, null)
    expect(late.statusCode).toBe(409)
    expect(late.json()).toMatchObject({ code: 'invoice_issued', invoiceId: row!.id })
    await closeTable(sessionId)
  })

  describe('iPad chỉ khai cho bàn mình; ghép bàn mang theo người mua', () => {
    let mine: { sessionId: number; orderId: number }
    let other: { sessionId: number; orderId: number }

    beforeAll(async () => {
      mine = await tableWith([{ dishId: 'bachibo', qty: 1 }], fx.plainTableId)
      other = await tableWith([{ dishId: 'bachibo', qty: 1 }])
    })

    it('iPad bàn 05 không khai được cho bàn khác', async () => {
      const res = await setBuyer(other.sessionId, COMPANY)
      expect(res.statusCode).toBe(403)
    })

    it('MST sai dạng, công ty thiếu địa chỉ bị chặn trước khi ghi', async () => {
      for (const buyer of [
        { ...COMPANY, taxCode: '03123' },
        { ...COMPANY, address: '' },
        { kind: 'person', name: 'Nguyễn Văn An', taxCode: '001099012345' },
      ]) {
        const res = await setBuyer(mine.sessionId, buyer)
        expect(res.statusCode, JSON.stringify(buyer)).toBe(400)
      }
      const [order] = await db.select().from(orders).where(eq(orders.id, mine.orderId))
      expect(order!.invoiceBuyer).toBeNull()
    })

    it('nhân viên gắn được hồ sơ B15; null là "Bán cho người tiêu dùng"', async () => {
      const staff = await setBuyer(other.sessionId, { ...COMPANY, corporateId: 7 }, auth())
      expect(staff.statusCode, staff.payload).toBe(200)
      expect(staff.json().buyer.corporateId).toBe(7)

      const cleared = await setBuyer(other.sessionId, null, auth())
      expect(cleared.statusCode, cleared.payload).toBe(200)
      expect(cleared.json().buyer).toBeNull()
    })

    it('ghép bàn: người mua khai ở bàn nguồn đi theo món sang bàn đích', async () => {
      expect((await setBuyer(mine.sessionId, COMPANY)).statusCode).toBe(200)
      const merged = await inject({
        method: 'POST',
        url: `/api/table-sessions/${mine.sessionId}/merge`,
        headers: auth(),
        payload: { targetSessionId: other.sessionId },
      })
      expect(merged.statusCode, merged.payload).toBe(201)

      // 2 × 285.000 + 8% = 615.600 → 616.000
      const paid = await payCash(other.sessionId, 616_000)
      expect(paid.invoice.document.buyer).toEqual(COMPANY)
      await closeTable(other.sessionId)
    })
  })

  it('hoá đơn đang gửi thì chưa đổi được người mua', async () => {
    const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }], fx.plainTableId)
    const qr = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/pay/vietqr`,
      headers: auth(),
      payload: { amount: 308_000 },
    })
    await bankWebhook({
      bankRef: 'FT26102200101',
      vaNumber: qr.json<{ vaNumber: string }>().vaNumber,
      amount: 308_000,
    })
    const [row] = await invoicesOf(orderId)
    expect(row).toMatchObject({ state: 'pending', invoiceNo: null })

    // Một lượt phát hành đang giữ hoá đơn (lease)
    await db
      .update(invoices)
      .set({ leaseUntil: sql`now() + interval '60 seconds'` })
      .where(eq(invoices.id, row!.id))
    const busy = await setBuyer(sessionId, COMPANY, auth())
    expect(busy.statusCode).toBe(409)
    expect(busy.json().code).toBe('invoice_issuing')

    // Hoá đơn chờ mà không ai đang gửi: sửa được, và lượt sửa đẩy phát hành luôn
    await db.update(invoices).set({ leaseUntil: null }).where(eq(invoices.id, row!.id))
    const saved = await setBuyer(sessionId, COMPANY, auth())
    expect(saved.statusCode, saved.payload).toBe(200)
    expect(saved.json()).toMatchObject({ editable: false, invoice: { state: 'issued' } })
    expect(saved.json().invoice.document.buyer).toEqual(COMPANY)
    await closeTable(sessionId)
  })

  it('đã gửi mà không có câu trả lời: khoá người mua tới khi phát hành xong', async () => {
    const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }], fx.plainTableId)
    provider.failNext('provider_timeout', 'Nhà cung cấp hoá đơn không trả lời kịp — sẽ thử lại')
    const paid = await payCash(sessionId, 308_000)
    expect(paid.invoice.state).toBe('failed')
    expect(paid.invoice.invoiceNo).not.toBeNull()

    // Nhà cung cấp có thể đã nhận bản "Bán cho người tiêu dùng" — không gửi nội dung khác
    const res = await setBuyer(sessionId, COMPANY, auth())
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('invoice_unconfirmed')

    const again = await issueAgain(orderId)
    expect(again.json()).toMatchObject({ state: 'issued', invoiceNo: paid.invoice.invoiceNo })
    expect(again.json().document.buyer).toBeNull()
    await closeTable(sessionId)
  })

  it('nhà cung cấp từ chối hẳn: sửa người mua rồi gửi lại đúng số cũ', async () => {
    const { sessionId, orderId } = await tableWith([{ dishId: 'bachibo', qty: 1 }], fx.plainTableId)
    expect((await setBuyer(sessionId, { ...COMPANY, taxCode: '0312345670' })).statusCode).toBe(200)
    provider.failNext('buyer_tax_code_invalid', 'MST người mua không tồn tại', false)
    const paid = await payCash(sessionId, 308_000)
    expect(paid.invoice.state).toBe('failed')

    // Chưa có tờ nào trên cơ quan thuế — thu ngân sửa MST rồi gửi lại
    const fixed = await setBuyer(sessionId, COMPANY, auth())
    expect(fixed.statusCode, fixed.payload).toBe(200)
    const again = await issueAgain(orderId)
    expect(again.json()).toMatchObject({ state: 'issued', invoiceNo: paid.invoice.invoiceNo })
    expect(again.json().document.buyer.taxCode).toBe(COMPANY.taxCode)
    await closeTable(sessionId)
  })

  it('bàn chưa gọi món thì chưa có đơn để khai', async () => {
    const opened = await inject({
      method: 'POST',
      url: `/api/tables/${fx.plainTableId}/open`,
      headers: auth(),
      payload: { guestCount: 2 },
    })
    const sessionId = opened.json<{ id: number }>().id
    const res = await setBuyer(sessionId, COMPANY)
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('no_order')
    await closeTable(sessionId)
  })
})

describe('Đơn online: người mua đi cùng đơn', () => {
  const PERSON = {
    kind: 'person' as const,
    name: 'Trần Thị Bình',
    taxCode: '8012345678',
    address: '8 Phan Chu Trinh, Hoàn Kiếm, Hà Nội',
  }

  const place = (type: 'takeaway' | 'delivery', invoiceBuyer?: unknown) =>
    inject({
      method: 'POST',
      url: '/api/online/orders',
      payload: {
        branchId: fx.branchId,
        type,
        customer: {
          name: 'Khách web',
          phone: '0900000001',
          ...(type === 'delivery' ? { address: '12 Trần Duy Hưng', ward: 'Dịch Vọng' } : {}),
          invoiceBuyer,
        },
        lines: [{ dishId: 'bachibo', qty: 1 }],
        slotMode: 'asap',
      },
    })

  const track = (token: string) => inject({ method: 'GET', url: `/api/online/track/${token}` })

  /** Khách trả trọn phần trả trước bằng VietQR */
  async function prepay(token: string, bankRef: string) {
    const ticket = await inject({ method: 'POST', url: `/api/online/track/${token}/pay/vietqr` })
    expect(ticket.statusCode, ticket.payload).toBe(201)
    const { amount, vaNumber } = ticket.json<{ amount: number; vaNumber: string }>()
    const hook = await bankWebhook({ bankRef, vaNumber, amount })
    expect(hook.statusCode, hook.payload).toBe(201)
  }

  beforeAll(async () => {
    await db.update(dishes).set({ onlineVisible: true }).where(eq(dishes.id, 'bachibo'))
    // Vùng giao miễn phí ship: trả trước là trả đủ — tách được "trả" khỏi "giao xong"
    await db.insert(deliveryZones).values({
      branchId: fx.branchId,
      name: 'Vòng 1',
      wards: ['Dich Vong'],
      feeVnd: 0,
      minOrderVnd: 0,
      etaMinutes: 25,
    })
  })

  it('thực đơn online báo chi nhánh đang xuất hoá đơn điện tử', async () => {
    const menu = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    expect(menu.json().einvoiceEnabled).toBe(true)
  })

  it('đặt kèm công ty, trả trước: trang theo dõi thấy hoá đơn của công ty', async () => {
    const placed = await place('takeaway', { ...COMPANY, corporateId: 7 })
    expect(placed.statusCode, placed.payload).toBe(201)
    const { id, trackToken } = placed.json<{ id: number; trackToken: string }>()
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    expect(order!.invoiceBuyer).toEqual(COMPANY)

    const before = await track(trackToken)
    expect(before.json().invoice).toMatchObject({ enabled: true, editable: true, invoice: null })
    expect(before.json().money.vatBreakdown).toEqual([
      expect.objectContaining({ rateBp: 800, vat: 22_800 }),
    ])

    await prepay(trackToken, 'FT26102200201')
    const after = await track(trackToken)
    expect(after.json().invoice).toMatchObject({ editable: false, invoice: { state: 'issued' } })
    expect(after.json().invoice.invoice.document.buyer).toEqual(COMPANY)

    const late = await inject({
      method: 'PUT',
      url: `/api/online/track/${trackToken}/invoice-buyer`,
      payload: { buyer: null },
    })
    expect(late.statusCode).toBe(409)
    expect(late.json().code).toBe('invoice_issued')
  })

  it('khách bổ sung người mua bằng mã theo dõi; mã sai không mở được đơn nào', async () => {
    const placed = await place('takeaway')
    const { id, trackToken } = placed.json<{ id: number; trackToken: string }>()
    const res = await inject({
      method: 'PUT',
      url: `/api/online/track/${trackToken}/invoice-buyer`,
      payload: { buyer: PERSON },
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json()).toMatchObject({ editable: true, buyer: PERSON })
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    expect(order!.invoiceBuyer).toEqual(PERSON)

    const wrong = await inject({
      method: 'PUT',
      url: '/api/online/track/ma-khong-ton-tai/invoice-buyer',
      payload: { buyer: PERSON },
    })
    expect(wrong.statusCode).toBe(404)
  })

  it('đơn giao: trả trước chưa có hoá đơn — giao xong mới lập', async () => {
    const placed = await place('delivery', COMPANY)
    expect(placed.statusCode, placed.payload).toBe(201)
    const { id, trackToken } = placed.json<{ id: number; trackToken: string }>()
    await prepay(trackToken, 'FT26102200202')

    const paid = await track(trackToken)
    expect(paid.json()).toMatchObject({ paymentState: 'paid', invoice: { invoice: null } })
    expect(await invoicesOf(id)).toHaveLength(0)

    for (const to of ['cooking', 'ready', 'delivering', 'done']) {
      const step = await inject({
        method: 'POST',
        url: `/api/orders/${id}/status`,
        headers: asManager(),
        payload: { to },
      })
      expect(step.statusCode, `${to}: ${step.payload}`).toBe(201)
    }
    const [row] = await invoicesOf(id)
    expect(row).toMatchObject({ state: 'issued', buyerTaxCode: COMPANY.taxCode })
  })
})

describe('Thu ngân lập hoá đơn thay thế tại quầy', () => {
  it('khách đưa MST sau khi hoá đơn đã ra: thu ngân thay thế, quản lý ca duyệt PIN', async () => {
    const { sessionId } = await tableWith([{ dishId: 'bachibo', qty: 1 }], fx.plainTableId)
    const old = (await payCash(sessionId, 308_000)).invoice
    expect(old).toMatchObject({ state: 'issued', document: { buyer: null } })

    const replace = (approval?: unknown) =>
      inject({
        method: 'POST',
        url: `/api/accounting/invoices/${old.id}/replace`,
        headers: auth(),
        payload: { reason: 'Khách bổ sung MST công ty', buyer: COMPANY, approval },
      })

    const ask = await replace()
    expect(ask.statusCode).toBe(400)
    expect(ask.json().code).toBe('requires_approval')

    const wrongPin = await replace({
      approverStaffId: fx.managerId,
      approverPin: '0000',
      reason: 'Khách bổ sung MST công ty',
    })
    expect(wrongPin.statusCode).toBe(403)

    const ok = await replace({
      approverStaffId: fx.managerId,
      approverPin: fx.pins[fx.managerId],
      reason: 'Khách bổ sung MST công ty',
    })
    expect(ok.statusCode, ok.payload).toBe(201)
    const replacement = ok.json().replacement
    expect(replacement).toMatchObject({ state: 'issued', replacesId: old.id })
    expect(replacement.document.buyer).toEqual(COMPANY)
    expect(replacement.invoiceNo).not.toBe(old.invoiceNo)

    // Bàn thấy hoá đơn mới; bản cũ giữ nguyên số, chỉ đổi trạng thái, có dấu người duyệt
    const status = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/invoice`,
      headers: auth(),
    })
    expect(status.json()).toMatchObject({ buyer: COMPANY, invoice: { id: replacement.id } })
    const [oldRow] = await db.select().from(invoices).where(eq(invoices.id, old.id))
    expect(oldRow).toMatchObject({ state: 'replaced', invoiceNo: old.invoiceNo })
    expect(oldRow!.approvalId).not.toBeNull()
    await closeTable(sessionId)
  })
})

describe('Tra mã số thuế để điền sẵn người mua', () => {
  const FPT = {
    taxCode: '0101248141',
    name: 'CÔNG TY CỔ PHẦN FPT',
    address: 'Số 10 Phạm Văn Bạch, Dịch Vọng, Cầu Giấy, Hà Nội',
    status: 'NNT đang hoạt động (đã được cấp GCN ĐKT)',
  }
  let registry: MockTaxCodeRegistry

  const lookup = (code: string, headers: Record<string, string> = auth()) =>
    inject({ method: 'GET', url: `/api/tax-codes/${code}`, headers })

  beforeAll(() => {
    registry = app.get<MockTaxCodeRegistry>(TAX_CODE_REGISTRY)
    // Test không bao giờ ra mạng
    expect(registry.name).toBe('mock')
    registry.entries.set(FPT.taxCode, {
      name: FPT.name,
      address: FPT.address,
      status: FPT.status,
    })
  })

  it('MST lạ: tra nguồn ngoài một lần, lần sau lấy từ danh bạ của quán', async () => {
    const first = await lookup('0101 248 141')
    expect(first.statusCode, first.payload).toBe(200)
    expect(first.json()).toEqual({ ...FPT, source: 'registry', email: null, corporateId: null })
    expect(registry.calls).toEqual([FPT.taxCode])

    const again = await lookup(FPT.taxCode)
    expect(again.json()).toMatchObject({ name: FPT.name, status: FPT.status, source: 'directory' })
    expect(registry.calls).toHaveLength(1)
  })

  it('công ty quán đã xuất hoá đơn: iPad thấy tên, địa chỉ; email chỉ nhân viên thấy', async () => {
    const { sessionId } = await tableWith([{ dishId: 'bachibo', qty: 1 }], fx.plainTableId)
    const fromIpad = await lookup(COMPANY.taxCode, ipad())
    expect(fromIpad.statusCode, fromIpad.payload).toBe(200)
    expect(fromIpad.json()).toEqual({
      taxCode: COMPANY.taxCode,
      name: COMPANY.name,
      address: COMPANY.address,
      status: null,
      source: 'directory',
    })
    const fromStaff = await lookup(COMPANY.taxCode)
    expect(fromStaff.json()).toMatchObject({ email: COMPANY.email, corporateId: null })
    await payCash(sessionId, 308_000)
    await closeTable(sessionId)

    // Bàn đã đóng: iPad không còn là khách của bàn nào
    expect((await lookup(COMPANY.taxCode, ipad())).statusCode).toBe(403)
  })

  it('khách doanh nghiệp B15: nhân viên nhận luôn hồ sơ để ghi nợ', async () => {
    const [profile] = await db
      .insert(corporateCustomers)
      .values({
        code: 'DN-HB',
        name: 'CÔNG TY TNHH HẢI BÌNH',
        taxCode: '0109876543',
        address: '5 Láng Hạ, Đống Đa, Hà Nội',
        contactEmail: 'hoadon@haibinh.vn',
        creditLimitVnd: 20_000_000,
      })
      .returning({ id: corporateCustomers.id })
    const res = await lookup('0109876543')
    expect(res.json()).toMatchObject({
      source: 'corporate',
      name: 'CÔNG TY TNHH HẢI BÌNH',
      email: 'hoadon@haibinh.vn',
      corporateId: profile!.id,
    })
    expect(registry.calls).toHaveLength(1)
  })

  it('số định danh 12 số không đem đi tra; MST sai dạng bị chặn', async () => {
    const personal = await lookup('001099012345')
    expect(personal.statusCode).toBe(400)
    expect(personal.json().code).toBe('personal_id')
    expect((await lookup('01012')).json().code).toBe('bad_tax_code')
    expect(registry.calls).toHaveLength(1)
  })

  it('không có ở đâu → 404; nguồn ngoài hỏng → 503, nhập tay', async () => {
    const missing = await lookup('0100000000')
    expect(missing.statusCode).toBe(404)
    expect(missing.json().code).toBe('tax_code_not_found')

    registry.down = true
    try {
      const down = await lookup('0100000001')
      expect(down.statusCode).toBe(503)
      expect(down.json().code).toBe('lookup_unavailable')
    } finally {
      registry.down = false
    }
  })

  it('cửa công khai cho web: chỉ tên, địa chỉ; quá 10 lượt một phút thì 429', async () => {
    const publicLookup = (code: string) =>
      inject({
        method: 'GET',
        url: `/api/online/tax-codes/${code}`,
        headers: { 'x-real-ip': '203.0.113.7' },
      })
    const res = await publicLookup(COMPANY.taxCode)
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json()).not.toHaveProperty('email')
    expect(res.json()).toMatchObject({ name: COMPANY.name, address: COMPANY.address })

    for (let i = 0; i < 9; i++) await publicLookup(COMPANY.taxCode)
    const blocked = await publicLookup(COMPANY.taxCode)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().code).toBe('too_many_lookups')
  })
})
