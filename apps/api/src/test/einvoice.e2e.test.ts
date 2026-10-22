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
 */
import { createHmac } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ParamsService } from '../common/params.service'
import type { Db } from '../db/client'
import { devices, dishes, invoices, orders, payments } from '../db/schema'
import { EINVOICE_PROVIDER, type MockEinvoiceProvider } from '../modules/einvoice/einvoice-provider'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>
let cashier: string
let params: ParamsService
let provider: MockEinvoiceProvider

const SEED_DEVICE = 'seed-device-token'
const BANK_SECRET = 'dev-bank-secret'

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const auth = () => ({ authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE })

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
