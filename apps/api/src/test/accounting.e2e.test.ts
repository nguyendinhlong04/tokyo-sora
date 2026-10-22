/**
 * Nghiệm thu kế toán — F2 · F3 · F4 · F5 · F6.
 *
 * Hai thứ phải chứng minh:
 *   1. **Hoá đơn điện tử là sổ có luật**: một đơn một hoá đơn, số cấp không trùng,
 *      đã phát hành thì không huỷ mà lập hoá đơn thay thế có lý do, bản gốc không mất.
 *   2. **Khoá sổ có hệ quả thật**: sau khi khoá, BỐN miền khác nhau ngừng nhận
 *      sửa cho kỳ đó — và không có đường mở lại.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import {
  expenseCategories,
  invoices,
  orderLines,
  orders,
  parameters,
  staff,
  staffRoles,
} from '../db/schema'
import { EINVOICE_PROVIDER, type MockEinvoiceProvider } from '../modules/einvoice/einvoice-provider'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'

let owner: string
let accountant: string
let shiftLead: string
let orderId: number
let secondOrderId: number
let invoiceId: number
/** Hoá đơn của đơn tháng 7 — quản lý ca thay thế ở cuối nhóm F3 */
let thirdInvoiceId: number
/** Bill tháng 6 trả rồi mà chưa có hoá đơn — chặn khoá sổ ở F6 */
let uninvoicedOrderId: number
/** Phiếu chi và tờ hoá đơn đầu vào của nhóm bài C5 · F4 */
let voucherId: number
let inputInvoiceId: number

/** Tháng đã qua — F6 chỉ khoá được tháng đã kết thúc */
const CLOSED_MONTH = '2026-06-01'
const IN_CLOSED = '2026-06-15'

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

async function officeLogin(email: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email, password: OFFICE_PASSWORD },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

/**
 * Đơn đã trả đủ, ghi thẳng vào CSDL. Có một dòng món: hoá đơn ghi từng món nên
 * đơn không có món thì không lập được hoá đơn. `vat_breakdown` để trống như đơn
 * tính trước khi có VAT theo nhóm thuế — thuế suất suy từ tiền của đơn.
 */
async function makeOrder(code: string, businessDate: string, sub: number, vat: number) {
  const [row] = await db
    .insert(orders)
    .values({
      displayCode: code,
      branchId: fx.branchId,
      channel: 'pos',
      type: 'dinein',
      status: 'done',
      paymentState: 'paid',
      moneySub: sub,
      moneyVat: vat,
      moneyTotal: sub + vat,
      createdByKind: 'staff',
      businessDate,
    })
    .returning({ id: orders.id })
  await db.insert(orderLines).values({
    orderId: row!.id,
    dishId: 'bachibo',
    dishCode: 'SORA-BO-001',
    nameSnapshot: 'Ba chỉ bò',
    qty: 1,
    unitPrice: sub,
    priceTotal: sub,
    state: 'served',
  })
  return row!.id
}

/** Ký hiệu khai ở A9 là mẫu; năm trong ký hiệu đi theo ngày lập hoá đơn (hôm nay) */
const serialNow = () => `C${businessDateOf(new Date(), 'Asia/Ho_Chi_Minh').slice(2, 4)}MAA`

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  const passwordHash = await hash(OFFICE_PASSWORD)
  const make = async (code: string, name: string, email: string, role: string) => {
    const [row] = await db
      .insert(staff)
      .values({ code, fullName: name, email, passwordHash })
      .returning({ id: staff.id })
    await db
      .insert(staffRoles)
      .values({ staffId: row!.id, roleCode: role, branchId: role === 'R10' ? null : fx.branchId })
    return row!.id
  }
  await make('CHU01', 'Chủ quán', 'chu@tokyosora.vn', 'R10')
  await make('KT01', 'Kế toán Vân', 'kt@tokyosora.vn', 'R8')

  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db.insert(staffRoles).values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  await db.insert(parameters).values([
    { key: 'einvoice.serial', branchId: null, value: 'C26MAA', unit: 'ký hiệu' },
    // A9 khai đủ người bán và bật hoá đơn điện tử
    { key: 'einvoice.enabled', branchId: null, value: true },
    { key: 'einvoice.taxCode', branchId: null, value: '0101234567' },
    { key: 'einvoice.sellerName', branchId: null, value: 'CÔNG TY TNHH TOKYO SORA' },
    { key: 'einvoice.sellerAddress', branchId: null, value: '12 Trần Thái Tông, Cầu Giấy, Hà Nội' },
    // Ngày bật hoá đơn điện tử: bill trả trước ngày này không bị coi là "thiếu hoá đơn"
    { key: 'einvoice.enabledFrom', branchId: null, value: '2026-06-01' },
    { key: 'expense.pettyCashVnd', branchId: null, value: 2_000_000, unit: 'đồng' },
    { key: 'expense.ownerApprovalVnd', branchId: null, value: 20_000_000, unit: 'đồng' },
    { key: 'expense.assetThresholdVnd', branchId: null, value: 5_000_000, unit: 'đồng' },
  ])

  await db.insert(expenseCategories).values([
    { id: 'mat-bang', name: 'Mặt bằng', pnlLine: 'rent', sort: 0 },
    { id: 'van-hanh-khac', name: 'Vận hành khác', pnlLine: 'other-opex', sort: 1 },
  ])

  owner = await officeLogin('chu@tokyosora.vn')
  accountant = await officeLogin('kt@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')

  orderId = await makeOrder('PO-0615-0001', IN_CLOSED, 1_000_000, 80_000)
  secondOrderId = await makeOrder('PO-0615-0002', IN_CLOSED, 500_000, 40_000)
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------- F3

describe('F3 — Sổ hoá đơn điện tử', () => {
  it('bill đã trả mà chưa có hoá đơn nằm ở danh sách còn thiếu — tính từ ngày bật', async () => {
    // Bill tháng 5, trước ngày chi nhánh bật hoá đơn điện tử
    await makeOrder('PO-0520-0001', '2026-05-20', 300_000, 24_000)
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/invoices?branch=${fx.branchId}&from=2026-05-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().serial).toBe('C26MAA')
    expect(res.json().missing.map((m: { displayCode: string }) => m.displayCode)).toEqual([
      'PO-0615-0001',
      'PO-0615-0002',
    ])
  })

  it('phát hành: cấp số 8 chữ số và nhận mã cơ quan thuế', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${orderId}`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(201)

    const body = res.json()
    expect(body.state).toBe('issued')
    expect(body.formNo).toBe('1')
    expect(body.serial).toBe(serialNow())
    expect(body.invoiceNo).toBe('00000001')
    expect(body.authorityCode).toContain(`${serialNow()}00000001`)
    // Bản giả lập: hoá đơn thử, không lên cơ quan thuế thật
    expect(body.test).toBe(true)
    expect(body.document.orderCode).toBe('PO-0615-0001')
    expect(body.document.buyer).toBeNull()
    expect(body.document.lines).toHaveLength(1)
    expect(body.document.amounts.total).toBe(1_080_000)
    invoiceId = body.id
  })

  it('số hoá đơn tăng dần trong cùng ký hiệu', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${secondOrderId}`,
      headers: bearer(accountant),
    })
    expect(res.json().invoiceNo).toBe('00000002')
  })

  it('MỘT đơn chỉ một hoá đơn — phát hành hai lần là sai phạm thuế', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${orderId}`,
      headers: bearer(accountant),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('sai phạm thuế')
  })

  it('thay thế bắt buộc ghi lý do', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/${invoiceId}/replace`,
      headers: bearer(accountant),
      payload: { reason: '' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('hoá đơn đã lên cơ quan thuế không huỷ được — sai thì lập hoá đơn thay thế', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/${invoiceId}/void`,
      headers: bearer(accountant),
      payload: { reason: 'Khách đổi thông tin xuất hoá đơn' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('invoice_issued')
  })

  it('thay thế: bản cũ chuyển trạng thái và GIỮ NGUYÊN số đã cấp, bản mới trỏ về nó', async () => {
    // Nhà cung cấp trả lỗi lần này: bản thay thế nằm lại hàng đợi cho F6 bên dưới
    app.get<MockEinvoiceProvider>(EINVOICE_PROVIDER).failNext('provider_busy', 'Hệ thống thuế bận')
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/${invoiceId}/replace`,
      headers: bearer(accountant),
      payload: {
        reason: 'Sai tên người mua',
        buyer: {
          kind: 'company',
          taxCode: '0101248141',
          name: 'CÔNG TY CỔ PHẦN FPT',
          address: '17 Duy Tân, Cầu Giấy, Hà Nội',
        },
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().replacement.replacesId).toBe(invoiceId)
    expect(res.json().replacement.state).toBe('failed')
    expect(res.json().replacement.lastError).toBe('Hệ thống thuế bận')
    // Bản thay thế mang người mua mới; số được cấp ngay và giữ cho lượt thử sau
    expect(res.json().replacement.document.buyer.name).toBe('CÔNG TY CỔ PHẦN FPT')
    expect(res.json().replacement.invoiceNo).toBe('00000003')

    const list = await inject({
      method: 'GET',
      url: `/api/accounting/invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    const original = list.json().rows.find((r: { id: number }) => r.id === invoiceId)
    expect(original.state).toBe('replaced')
    expect(original.invoiceNo).toBe('00000001') // số đã lên thuế thì tồn tại vĩnh viễn
    expect(original.voidReason).toBe('Sai tên người mua')

    // Bản thay thế chưa phát hành ⇒ nằm ở hàng đợi
    expect(list.json().queue.length).toBeGreaterThan(0)
  })

  /**
   * Sửa ký hiệu qua ĐÚNG cửa A6 chứ không ghi thẳng CSDL: `ParamsService` giữ
   * cache trong tiến trình, nên một dòng đổi sau lưng nó sẽ không có tác dụng.
   * Đó cũng là hành vi thật — tham số chỉ đổi qua màn A6.
   */
  it('ký hiệu sai chuẩn là lỗi CẤU HÌNH, báo rõ sai ở đâu', async () => {
    const setSerial = (value: string) =>
      inject({
        method: 'PUT',
        url: '/api/admin/parameters/einvoice.serial',
        headers: bearer(owner),
        payload: { value, branchId: null },
      })

    const thirdOrder = await makeOrder('PO-0716-0003', '2026-07-16', 200_000, 16_000)
    expect((await setSerial('C26AAA')).statusCode).toBe(200)

    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${thirdOrder}`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(409)
    expect(res.json().code).toBe('bad_serial')
    expect(res.json().message).toContain('chữ M')

    // Khai đúng lại thì phát hành được ngay
    await setSerial('C26MAA')
    const retry = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${thirdOrder}`,
      headers: bearer(accountant),
    })
    expect(retry.statusCode, retry.payload).toBe(201)
    // 00000003 thuộc về bản thay thế ở trên — số đã cấp không ai lấy lại
    expect(retry.json().invoiceNo).toBe('00000004')
    thirdInvoiceId = retry.json().id
  })

  it('lọc sổ theo trạng thái, người mua, MST; ngăn chi tiết có lịch sử thay thế', async () => {
    const book = (query: string) =>
      inject({
        method: 'GET',
        url: `/api/accounting/invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30&${query}`,
        headers: bearer(accountant),
      })
    const replaced = await book('state=replaced')
    expect(replaced.json().rows.map((r: { id: number }) => r.id)).toEqual([invoiceId])

    const company = await book('buyer=company')
    expect(company.json().rows).toHaveLength(1)
    const row = company.json().rows[0]
    expect(row).toMatchObject({ buyerTaxCode: '0101248141', replacesId: invoiceId })
    // Sổ không chở nội dung đầy đủ từng tờ — xem ở ngăn chi tiết
    expect(row).not.toHaveProperty('snapshot')
    expect((await book('q=0101248141')).json().rows).toHaveLength(1)
    expect((await book('state=lung-tung')).statusCode).toBe(400)

    const detail = await inject({
      method: 'GET',
      url: `/api/accounting/invoices/${row.id}`,
      headers: bearer(accountant),
    })
    expect(detail.statusCode, detail.payload).toBe(200)
    expect(detail.json().invoice.document.buyer.name).toBe('CÔNG TY CỔ PHẦN FPT')
    expect(detail.json().history.map((h: { id: number }) => h.id)).toEqual([invoiceId, row.id])
  })

  it('quản lý ca lập hoá đơn thay thế thẳng, không cần ai duyệt (§4.2)', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/${thirdInvoiceId}/replace`,
      headers: bearer(shiftLead),
      payload: { reason: 'Khách đổi thông tin xuất hoá đơn' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().replacement).toMatchObject({ state: 'issued', replacesId: thirdInvoiceId })
  })

  it('hoá đơn đã lên thuế mà đơn bị huỷ sau đó: nằm ở mục cần xử lý', async () => {
    const orderX = await makeOrder('PO-0720-0009', '2026-07-20', 100_000, 8_000)
    const issued = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${orderX}`,
      headers: bearer(accountant),
    })
    expect(issued.statusCode, issued.payload).toBe(201)
    await db
      .update(orders)
      .set({ status: 'cancelled', cancelReason: 'Khách đổi ý sau khi in bill' })
      .where(eq(orders.id, orderX))

    const res = await inject({
      method: 'GET',
      url: `/api/accounting/invoices?branch=${fx.branchId}&from=2026-07-01&to=2026-07-31`,
      headers: bearer(accountant),
    })
    expect(res.json().needsAction).toEqual([
      expect.objectContaining({ id: issued.json().id, orderCode: 'PO-0720-0009' }),
    ])
  })
})

// ---------------------------------------------------------------- F2

describe('F2 — Nhật ký doanh thu & điều chỉnh', () => {
  it('sổ chỉ đọc, gom theo loại bút toán', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/journal?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().readOnly).toBe(true)
  })

  it('quản lý ca KHÔNG mở được sổ doanh thu — đó là màn kế toán', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/journal?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(shiftLead),
    })
    expect(res.statusCode).toBe(403)
  })
})

// ---------------------------------------------------------------- F4

describe('F4 — Báo cáo thuế', () => {
  /**
   * Hai bill tháng 6, hoá đơn lập HÔM NAY (ngày chạy test): tờ hoá đơn khai theo
   * ngày lập, nên bill có tờ đã phát hành rời khỏi tháng 6. Bill kia chưa có tờ nào
   * lên thuế (bản thay thế còn kẹt) — vẫn phải khai, nằm ở phần "chưa có hoá đơn".
   */
  it('tách doanh thu theo thuế suất: theo hoá đơn đã lập, cộng bill chưa có hoá đơn', async () => {
    const report = (from: string, to: string) =>
      inject({
        method: 'GET',
        url: `/api/accounting/tax-report?branch=${fx.branchId}&from=${from}&to=${to}`,
        headers: bearer(accountant),
      })
    const june = await report('2026-06-01', '2026-06-30')
    expect(june.statusCode, june.payload).toBe(200)
    const body = june.json()
    expect(body.invoicedBuckets).toEqual([])
    expect(body.uninvoicedBuckets).toEqual([{ rate: 0.08, netVnd: 1_000_000, vatVnd: 80_000 }])
    expect(body.buckets).toEqual(body.uninvoicedBuckets)
    expect(body.summary.vatOutVnd).toBe(80_000)

    // Ngày lập của các tờ đã phát hành: đúng bằng tổng VAT trên chính các tờ đó
    const today = businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')
    const [issued] = await db
      .select({ vat: sql<number>`coalesce(sum(${invoices.amountVat}), 0)::int` })
      .from(invoices)
      .where(and(eq(invoices.state, 'issued'), eq(invoices.invoiceDate, today)))
    const now = (await report(today, today)).json()
    const vatOf = (buckets: { vatVnd: number }[]) => buckets.reduce((s, b) => s + b.vatVnd, 0)
    expect(vatOf(now.invoicedBuckets)).toBe(Number(issued!.vat))
    expect(Number(issued!.vat)).toBeGreaterThan(0)
  })

  /**
   * Đây là ranh giới của C5, và nó là ranh giới về TIỀN THẬT: gõ số VAT lên phiếu
   * chi không làm khoản đó được khấu trừ. Điều kiện khấu trừ là có tờ hoá đơn.
   */
  it('VAT gõ trên phiếu chi mà KHÔNG có hoá đơn thì không vào tờ khai', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(accountant),
      payload: {
        branchId: fx.branchId,
        categoryId: 'mat-bang',
        kind: 'expense',
        supplier: 'Chủ nhà',
        memo: null,
        amountVnd: 1_100_000,
        vatVnd: 100_000,
        method: 'transfer',
        amortizeMonths: 1,
        amortizeFrom: CLOSED_MONTH,
        advanceEmployeeId: null,
        paidOn: IN_CLOSED,
      },
    })
    expect(created.statusCode, created.payload).toBe(201)
    voucherId = created.json<{ id: number }>().id
    // 1.100.000 trên hạn mức chi vặt ⇒ chờ duyệt; chủ duyệt vì kế toán là người ghi
    await inject({
      method: 'POST',
      url: `/api/expenses/vouchers/${voucherId}/approve`,
      headers: bearer(owner),
    })

    const res = await inject({
      method: 'GET',
      url: `/api/accounting/tax-report?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.json().summary.vatInVnd).toBe(0)
    expect(res.json().vatInInvoices).toBe(0)
  })

  it('C5 nêu đúng phiếu chi lớn còn thiếu hoá đơn', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/expenses/input-invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().missingVouchers.map((v: { id: number }) => v.id)).toContain(voucherId)
    expect(res.json().declaredButUndocumentedVnd).toBe(100_000)
  })

  it('ghi hoá đơn vào thì VAT mới được khấu trừ', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/expenses/input-invoices',
      headers: bearer(accountant),
      payload: {
        branchId: fx.branchId,
        voucherId,
        sellerName: 'Chủ nhà',
        sellerTaxCode: '0101234567',
        invoiceNo: '00012345',
        serial: '1C26TAA',
        issuedOn: IN_CLOSED,
        netVnd: 1_000_000,
        vatVnd: 100_000,
        deductible: true,
        note: null,
      },
    })
    expect(created.statusCode, created.payload).toBe(201)
    inputInvoiceId = created.json<{ id: number }>().id

    const res = await inject({
      method: 'GET',
      url: `/api/accounting/tax-report?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.json().summary.vatInVnd).toBe(100_000)
    // Ra 80.000 − vào 100.000: âm là khấu trừ chuyển kỳ sau
    expect(res.json().summary.vatPayableVnd).toBe(-20_000)
    expect(res.json().vatInInvoices).toBe(1)
  })

  it('hoá đơn đó không còn nằm trong danh sách thiếu', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/expenses/input-invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.json().missingVouchers.map((v: { id: number }) => v.id)).not.toContain(voucherId)
    expect(res.json().deductibleVnd).toBe(100_000)
  })

  it('cùng người bán không ghi hai lần cùng một số hoá đơn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/input-invoices',
      headers: bearer(accountant),
      payload: {
        branchId: fx.branchId,
        voucherId: null,
        sellerName: 'Chủ nhà',
        sellerTaxCode: '0101234567',
        invoiceNo: '00012345',
        serial: null,
        issuedOn: IN_CLOSED,
        netVnd: 500_000,
        vatVnd: 50_000,
        deductible: true,
        note: null,
      },
    })
    expect(res.statusCode).toBe(409)
  })

  it('VAT vượt tiền trước thuế bị chặn — nhiều khả năng gõ nhầm cột', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/input-invoices',
      headers: bearer(accountant),
      payload: {
        branchId: fx.branchId,
        voucherId: null,
        sellerName: 'Nhà cung cấp lạ',
        sellerTaxCode: '0109999999',
        invoiceNo: '00099999',
        serial: null,
        issuedOn: IN_CLOSED,
        netVnd: 100_000,
        vatVnd: 1_000_000,
        deductible: true,
        note: null,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('tổng hoá đơn gắn vào một phiếu không vượt số đã chi', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/input-invoices',
      headers: bearer(accountant),
      payload: {
        branchId: fx.branchId,
        voucherId,
        sellerName: 'Chủ nhà',
        sellerTaxCode: '0101234567',
        invoiceNo: '00012346',
        serial: null,
        issuedOn: IN_CLOSED,
        netVnd: 900_000,
        vatVnd: 90_000,
        deductible: true,
        note: null,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('vượt số đã chi')
  })

  /**
   * Hoá đơn có thật nhưng không được khấu trừ vẫn phải ghi nhận — xoá đi rồi quên
   * là đã có thì lần đối chiếu sau không ai hiểu vì sao thiếu một tờ.
   */
  it('đánh dấu không khấu trừ thì tờ hoá đơn còn đó nhưng rời khỏi tờ khai', async () => {
    const patched = await inject({
      method: 'PUT',
      url: `/api/expenses/input-invoices/${inputInvoiceId}`,
      headers: bearer(accountant),
      payload: { deductible: false },
    })
    expect(patched.statusCode, patched.payload).toBe(200)

    const book = await inject({
      method: 'GET',
      url: `/api/expenses/input-invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(book.json().rows).toHaveLength(1)
    expect(book.json().deductibleVnd).toBe(0)

    const tax = await inject({
      method: 'GET',
      url: `/api/accounting/tax-report?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(tax.json().summary.vatInVnd).toBe(0)

    // Trả lại cho các bài sau
    await inject({
      method: 'PUT',
      url: `/api/expenses/input-invoices/${inputInvoiceId}`,
      headers: bearer(accountant),
      payload: { deductible: true },
    })
  })

  it('quản lý ca không mở được sổ hoá đơn đầu vào', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/expenses/input-invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(shiftLead),
    })
    expect(res.statusCode).toBe(403)
  })

  it('đối chiếu HĐĐT với doanh thu hệ thống — lệch thì nêu đúng số chênh', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/tax-report?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    const rec = res.json().reconciliation
    // Hai bill 1.620.000; chỉ còn một hoá đơn 'issued' (bản kia đã bị thay thế)
    expect(rec.systemVnd).toBe(1_620_000)
    expect(rec.invoicedVnd).toBe(540_000)
    expect(rec.matched).toBe(false)
    expect(rec.diffVnd).toBe(1_080_000)
  })

  it('nói rõ hai chỗ kế toán phải tự xác nhận', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/tax-report?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.json().vatInNote).toContain('C5')
    expect(res.json().pitNote).toContain('luỹ tiến')
  })
})

// ---------------------------------------------------------------- F5

describe('F5 — Công nợ hai chiều', () => {
  it('phải trả nêu được giá trị hàng đã nhận, và nói rõ chưa phải sổ công nợ', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/debts?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().payable.note).toContain('chưa phải sổ công nợ')
  })

  /**
   * Tab Phải thu đọc dòng ghi nợ công ty của B15. Chưa có công ty nào thì bảng
   * rỗng — nhưng rỗng có CẤU TRÚC, không phải một ô chặn: ngày mai kế toán khai
   * hồ sơ đầu tiên là con số chạy, không phải đợi sửa mã nguồn.
   */
  it('phải thu đọc công nợ khách doanh nghiệp của B15, chia bốn khoang tuổi nợ', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/debts?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    const receivable = res.json().receivable
    expect(receivable.companies).toEqual([])
    expect(receivable.totals).toMatchObject({
      currentVnd: 0,
      d0to30Vnd: 0,
      d31to60Vnd: 0,
      over60Vnd: 0,
      totalVnd: 0,
    })
    expect(receivable.note).toContain('NGÀY ĐẾN HẠN')
  })
})

// ---------------------------------------------------------------- F6

describe('F6 — Khoá sổ và hệ quả của nó', () => {
  it('KHÔNG khoá được tháng chưa kết thúc — vì không có đường mở lại', async () => {
    const thisMonth = `${new Date().toISOString().slice(0, 7)}-01`
    const res = await inject({
      method: 'POST',
      url: '/api/accounting/periods/lock',
      headers: bearer(accountant),
      payload: { branchId: fx.branchId, month: thisMonth },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('chưa kết thúc')
  })

  it('chặn khoá khi còn hoá đơn chưa phát hành được, hay bill đã trả chưa có hoá đơn', async () => {
    uninvoicedOrderId = await makeOrder('PO-0625-0005', '2026-06-25', 200_000, 16_000)
    const res = await inject({
      method: 'POST',
      url: '/api/accounting/periods/lock',
      headers: bearer(accountant),
      payload: { branchId: fx.branchId, month: CLOSED_MONTH },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('hoá đơn chưa phát hành')
    expect(res.json().message).toContain('1 bill đã trả chưa có hoá đơn')
  })

  it('dọn xong hàng đợi thì khoá được', async () => {
    const list = await inject({
      method: 'GET',
      url: `/api/accounting/invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    const stuck = list.json().rows.find((r: { state: string }) => r.state === 'failed')
    const reissued = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${stuck.orderId}`,
      headers: bearer(accountant),
    })
    expect(reissued.statusCode, reissued.payload).toBe(201)
    // Gửi lại giữ đúng số đã cấp ở lượt hỏng
    expect(reissued.json()).toMatchObject({ state: 'issued', invoiceNo: '00000003' })
    const late = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${uninvoicedOrderId}`,
      headers: bearer(accountant),
    })
    expect(late.statusCode, late.payload).toBe(201)

    const res = await inject({
      method: 'POST',
      url: '/api/accounting/periods/lock',
      headers: bearer(accountant),
      payload: { branchId: fx.branchId, month: CLOSED_MONTH, note: 'Chốt tháng 6' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().locked).toBe(true)
  })

  it('khoá hai lần bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/accounting/periods/lock',
      headers: bearer(accountant),
      payload: { branchId: fx.branchId, month: CLOSED_MONTH },
    })
    expect(res.statusCode).toBe(409)
  })

  it('HỆ QUẢ 1 — chi phí: không ghi được phiếu chi vào kỳ đã khoá', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(owner),
      payload: {
        branchId: fx.branchId,
        categoryId: 'van-hanh-khac',
        kind: 'expense',
        supplier: null,
        memo: null,
        amountVnd: 500_000,
        vatVnd: 0,
        method: 'cash',
        amortizeMonths: 1,
        amortizeFrom: CLOSED_MONTH,
        advanceEmployeeId: null,
        paidOn: IN_CLOSED,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('period_closed')
  })

  it('HỆ QUẢ 2 — nhân sự: không sửa được lịch của kỳ đã khoá', async () => {
    const employee = await inject({
      method: 'POST',
      url: '/api/hr/employees',
      headers: bearer(owner),
      payload: {
        staffId: fx.waiterId,
        branchId: fx.branchId,
        position: 'Phục vụ',
        payKind: 'hourly',
        hourlyRateVnd: 30_000,
        monthlySalaryVnd: 0,
        fixedAllowanceVnd: 0,
        startedOn: '2026-01-01',
        endedOn: null,
        bankAccount: null,
        active: true,
      },
    })

    const res = await inject({
      method: 'PUT',
      url: '/api/hr/schedule',
      headers: bearer(owner),
      payload: {
        branchId: fx.branchId,
        weekStart: '2026-06-15',
        employeeId: employee.json().id,
        cells: [
          {
            workDate: IN_CLOSED,
            startMinute: 8 * 60,
            endMinute: 16 * 60,
            breakMinutes: 0,
            dayKind: 'thuong',
          },
        ],
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('period_closed')
  })

  it('HỆ QUẢ 3 — kỳ lương: không mở được kỳ nằm trong tháng đã khoá', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/hr/payroll/periods',
      headers: bearer(owner),
      payload: { branchId: fx.branchId, periodStart: CLOSED_MONTH, periodEnd: '2026-06-30' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('period_closed')
  })

  it('tháng KHÁC vẫn làm việc bình thường — khoá sổ không chặn cả hệ thống', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(owner),
      payload: {
        branchId: fx.branchId,
        categoryId: 'van-hanh-khac',
        kind: 'expense',
        supplier: null,
        memo: null,
        amountVnd: 500_000,
        vatVnd: 0,
        method: 'cash',
        amortizeMonths: 1,
        amortizeFrom: '2026-07-01',
        advanceEmployeeId: null,
        paidOn: '2026-07-10',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
  })

  it('sổ khoá liệt kê ai khoá và khi nào', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/periods?branch=${fx.branchId}`,
      headers: bearer(accountant),
    })
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0]).toMatchObject({ month: CLOSED_MONTH, lockedByName: 'Kế toán Vân' })
  })

  it('KHÔNG có cửa mở khoá — đó là toàn bộ giá trị của F6', async () => {
    for (const method of ['POST', 'DELETE'] as const) {
      const res = await inject({
        method,
        url: '/api/accounting/periods/unlock',
        headers: bearer(owner),
        payload: { branchId: fx.branchId, month: CLOSED_MONTH },
      })
      expect(res.statusCode, method).toBe(404)
    }
  })
})
