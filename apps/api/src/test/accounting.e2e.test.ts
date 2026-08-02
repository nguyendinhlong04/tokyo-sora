/**
 * Nghiệm thu kế toán — F2 · F3 · F4 · F5 · F6.
 *
 * Hai thứ phải chứng minh:
 *   1. **Hoá đơn điện tử là sổ có luật**: một đơn một hoá đơn, số cấp không trùng,
 *      huỷ phải có lý do và bản ghi duyệt, bản gốc không mất.
 *   2. **Khoá sổ có hệ quả thật**: sau khi khoá, BỐN miền khác nhau ngừng nhận
 *      sửa cho kỳ đó — và không có đường mở lại.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import {
  expenseCategories,
  orders,
  parameters,
  staff,
  staffRoles,
} from '../db/schema'
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
  return row!.id
}

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
  it('bill đã trả mà chưa có hoá đơn nằm ở danh sách còn thiếu', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().serial).toBe('C26MAA')
    expect(res.json().missing).toHaveLength(2)
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
    expect(body.serial).toBe('C26MAA')
    expect(body.invoiceNo).toBe('00000001')
    expect(body.taxCode).toContain('PO-0615-0001')
    expect(body.amountTotal).toBe(1_080_000)
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

  it('huỷ hoá đơn bắt buộc ghi lý do', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/${invoiceId}/void`,
      headers: bearer(accountant),
      payload: { reason: '', replace: false },
    })
    expect(res.statusCode).toBe(400)
  })

  it('quản lý ca chạm được hoá đơn nhưng PHẢI xin duyệt (dòng △ của §4.2)', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/${invoiceId}/void`,
      headers: bearer(shiftLead),
      payload: { reason: 'Khách đổi thông tin xuất hoá đơn', replace: false },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('requires_approval')
  })

  it('thay thế: bản cũ chuyển trạng thái và GIỮ NGUYÊN số đã cấp, bản mới trỏ về nó', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/${invoiceId}/void`,
      headers: bearer(accountant),
      payload: { reason: 'Sai tên người mua', replace: true },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().replacement.replacesId).toBe(invoiceId)
    expect(res.json().replacement.state).toBe('pending')

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
    expect(retry.json().invoiceNo).toBe('00000003')
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
  it('tách doanh thu theo thuế suất', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/tax-report?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)

    const body = res.json()
    expect(body.buckets).toHaveLength(1)
    expect(body.buckets[0].rate).toBe(0.08)
    expect(body.buckets[0].netVnd).toBe(1_500_000)
    expect(body.summary.vatOutVnd).toBe(120_000)
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
    expect(res.json().summary.vatPayableVnd).toBe(20_000)
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

  it('chặn khoá khi còn hoá đơn chưa phát hành được', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/accounting/periods/lock',
      headers: bearer(accountant),
      payload: { branchId: fx.branchId, month: CLOSED_MONTH },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('hoá đơn chưa phát hành')
  })

  it('dọn xong hàng đợi thì khoá được', async () => {
    const list = await inject({
      method: 'GET',
      url: `/api/accounting/invoices?branch=${fx.branchId}&from=2026-06-01&to=2026-06-30`,
      headers: bearer(accountant),
    })
    const pending = list.json().rows.find((r: { state: string }) => r.state === 'pending')
    await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${pending.orderId}`,
      headers: bearer(accountant),
    })

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
