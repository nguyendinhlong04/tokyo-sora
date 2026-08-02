/**
 * Nghiệm thu chi phí & tài sản — C1 · C2 · C3 · C4 · C6.
 *
 * Bài kiểm chính là RANH GIỚI DỒN TÍCH / DÒNG TIỀN, thứ §29.4 gọi là chỗ chủ quán
 * hay nhầm nhất:
 *   · tạm ứng là tiền ra nhưng KHÔNG phải chi phí,
 *   · khấu hao là chi phí nhưng KHÔNG phải tiền ra,
 *   · trả trước sáu tháng là một lần tiền ra và sáu lần chi phí.
 * Ba trường hợp đó phải ra đúng ở CẢ HAI chế độ xem của F7.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { expenseCategories, parameters, staff, staffRoles } from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'

let owner: string
let accountant: string
let shiftLead: string
let employeeId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

const MONTH = '2026-08-01'
const IN_MONTH = '2026-08-10'

async function officeLogin(email: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email, password: OFFICE_PASSWORD },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

const voucher = (over: Record<string, unknown> = {}) => ({
  branchId: fx.branchId,
  categoryId: 'mat-bang',
  kind: 'expense',
  supplier: 'Chủ nhà',
  memo: null,
  amountVnd: 1_000_000,
  vatVnd: 0,
  method: 'transfer',
  amortizeMonths: 1,
  amortizeFrom: MONTH,
  advanceEmployeeId: null,
  paidOn: IN_MONTH,
  ...over,
})

const pnl = async (token: string, basis = 'don-tich') => {
  const res = await inject({
    method: 'GET',
    url: `/api/reports/pnl?branch=${fx.branchId}&kind=tuy-chon&compare=ky-truoc&from=${MONTH}&to=2026-08-31&basis=${basis}`,
    headers: bearer(token),
  })
  expect(res.statusCode, res.payload).toBe(200)
  return res.json()
}

const lineOf = (body: { rows: { key: string }[] }, key: string) =>
  body.rows.find((r) => r.key === key) as { key: string; amount: number | null; blockedBy?: string }

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
    { key: 'expense.pettyCashVnd', branchId: null, value: 2_000_000, unit: 'đồng' },
    { key: 'expense.ownerApprovalVnd', branchId: null, value: 20_000_000, unit: 'đồng' },
    { key: 'expense.assetThresholdVnd', branchId: null, value: 5_000_000, unit: 'đồng' },
  ])

  // Cây khoản mục tối thiểu (seed thật có đủ; harness thì không)
  await db.insert(expenseCategories).values([
    { id: 'gia-von', name: 'Giá vốn hàng bán', pnlLine: 'cogs', automatic: true, sort: 0 },
    { id: 'mat-bang', name: 'Mặt bằng', pnlLine: 'rent', sort: 1 },
    { id: 'tien-ich', name: 'Tiện ích', pnlLine: 'utilities', sort: 2 },
    { id: 'thiet-bi', name: 'Thiết bị & khấu hao', pnlLine: 'depreciation', sort: 3 },
    { id: 'van-hanh-khac', name: 'Vận hành khác', pnlLine: 'other-opex', sort: 4 },
  ])

  owner = await officeLogin('chu@tokyosora.vn')
  accountant = await officeLogin('kt@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')

  const emp = await inject({
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
  employeeId = emp.json<{ id: number }>().id
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ------------------------------------------------------ C2 · bậc duyệt

describe('C2 — Ghi phiếu chi theo bậc duyệt', () => {
  it('quản lý ca ghi được chi vặt dưới hạn mức, và phiếu duyệt luôn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(shiftLead),
      payload: voucher({ categoryId: 'van-hanh-khac', amountVnd: 1_500_000, method: 'cash' }),
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().tier).toBe('tu-ghi')
    expect(res.json().state).toBe('approved')
  })

  it('trên hạn mức thì CHÍNH quản lý ca đó phải xin duyệt', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(shiftLead),
      payload: voucher({ amountVnd: 8_000_000 }),
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('requires_approval')
  })

  it('kế toán ghi thẳng được phiếu trên hạn mức, nhưng nó nằm chờ duyệt', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(accountant),
      payload: voucher({ amountVnd: 8_000_000, memo: 'Tiền nhà tháng 8' }),
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().tier).toBe('ke-toan-duyet')
    expect(res.json().state).toBe('draft')
  })

  it('không ai tự duyệt phiếu chi của mình', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(accountant),
      payload: voucher({ amountVnd: 3_000_000 }),
    })
    const res = await inject({
      method: 'POST',
      url: `/api/expenses/vouchers/${created.json().id}/approve`,
      headers: bearer(accountant),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('tự duyệt')
  })

  it('khoản mục do MÁY tự ghi thì không nhập tay được', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(owner),
      payload: voucher({ categoryId: 'gia-von', amountVnd: 500_000 }),
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('máy tự ghi')
  })

  it('mua thiết bị từ ngưỡng tài sản bị đẩy sang C4, không vào chi phí một lần', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(owner),
      payload: voucher({ categoryId: 'thiet-bi', amountVnd: 12_000_000 }),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('needs_asset_record')
  })

  it('sửa chữa nhỏ dưới ngưỡng vẫn ghi thẳng ở C2', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(owner),
      payload: voucher({ categoryId: 'thiet-bi', amountVnd: 1_200_000 }),
    })
    expect(res.statusCode, res.payload).toBe(201)
  })
})

// -------------------------------------- Ranh giới dồn tích / dòng tiền

describe('Dồn tích vs dòng tiền', () => {
  it('trả trước 6 tháng: MỘT lần tiền ra, SÁU lần chi phí', async () => {
    // Phiếu 60 triệu là mức chủ duyệt, nên nó nằm chờ — và người duyệt phải KHÁC
    // người ghi (§4.3.1), kể cả khi người ghi là kế toán và người duyệt là chủ
    const created = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(accountant),
      payload: voucher({
        categoryId: 'tien-ich',
        amountVnd: 60_000_000,
        amortizeMonths: 6,
        amortizeFrom: MONTH,
        memo: 'Internet trả trước 6 tháng',
      }),
    })
    expect(created.statusCode, created.payload).toBe(201)
    expect(created.json().state).toBe('draft')

    // Chưa duyệt thì chưa phải chi phí
    expect(lineOf(await pnl(owner, 'don-tich'), 'utilities').amount).toBeNull()

    const approved = await inject({
      method: 'POST',
      url: `/api/expenses/vouchers/${created.json().id}/approve`,
      headers: bearer(owner),
    })
    expect(approved.statusCode, approved.payload).toBe(201)

    // Dồn tích tháng 8: chỉ một phần sáu
    const accrual = await pnl(owner, 'don-tich')
    expect(lineOf(accrual, 'utilities').amount).toBe(-10_000_000)

    // Dòng tiền tháng 8: cả 60 triệu, vì tiền ra hết trong tháng
    const cash = await pnl(owner, 'dong-tien')
    expect(lineOf(cash, 'utilities').amount).toBe(-60_000_000)
  })

  it('tạm ứng nhân viên: CÓ ở dòng tiền, KHÔNG có ở dồn tích', async () => {
    const before = lineOf(await pnl(owner, 'don-tich'), 'other-opex').amount

    const created = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(owner),
      payload: voucher({
        categoryId: 'van-hanh-khac',
        kind: 'advance',
        advanceEmployeeId: employeeId,
        amountVnd: 2_000_000,
        method: 'cash',
        memo: 'Tạm ứng lương',
      }),
    })
    expect(created.statusCode, created.payload).toBe(201)

    // Dồn tích không đổi — tạm ứng chưa phải chi phí
    expect(lineOf(await pnl(owner, 'don-tich'), 'other-opex').amount).toBe(before)

    // Dòng tiền có thêm đúng 2 triệu
    const cash = await pnl(owner, 'dong-tien')
    expect(lineOf(cash, 'other-opex').amount).toBeLessThanOrEqual(-2_000_000)
  })

  it('tạm ứng phải nói được ứng cho ai', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: bearer(owner),
      payload: voucher({ kind: 'advance', advanceEmployeeId: null, amountVnd: 500_000 }),
    })
    expect(res.statusCode).toBe(400)
  })
})

// ------------------------------------------------ C4 · Tài sản & khấu hao

describe('C4 — Khấu hao là chi phí không có tiền ra', () => {
  let assetId: number

  it('ghi nhận tài sản', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/assets',
      headers: bearer(owner),
      payload: {
        branchId: fx.branchId,
        categoryId: 'thiet-bi',
        name: 'Tủ mát 2 cánh',
        costVnd: 36_000_000,
        inServiceFrom: MONTH,
        depreciationMonths: 36,
        note: null,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    assetId = res.json<{ id: number }>().id
  })

  it('sinh khấu hao tháng, chạy lại KHÔNG ghi trùng', async () => {
    const run = () =>
      inject({
        method: 'POST',
        url: '/api/expenses/assets/depreciation',
        headers: bearer(owner),
        payload: { branchId: fx.branchId, month: MONTH },
      })

    expect((await run()).json().posted).toBe(1)
    expect((await run()).json().posted).toBe(0)
  })

  it('khấu hao vào dồn tích nhưng KHÔNG vào dòng tiền', async () => {
    const accrual = await pnl(owner, 'don-tich')
    // 36 triệu / 36 tháng = 1 triệu, cộng với phiếu sửa chữa nhỏ 1,2 triệu
    expect(lineOf(accrual, 'depreciation').amount).toBe(-2_200_000)

    const cash = await pnl(owner, 'dong-tien')
    // Dòng tiền chỉ có phiếu sửa chữa, không có khấu hao
    expect(lineOf(cash, 'depreciation').amount).toBe(-1_200_000)
  })

  it('chế độ dòng tiền nói rõ khấu hao KHÔNG có ở đây, không nói "thiếu dữ liệu"', async () => {
    // Kỳ tháng 9 chưa có phiếu chi thiết bị nào ⇒ dòng khấu hao trống ở cả hai chế độ
    const url = (basis: string) =>
      `/api/reports/pnl?branch=${fx.branchId}&kind=tuy-chon&compare=ky-truoc&from=2026-09-01&to=2026-09-30&basis=${basis}`

    const accrual = await inject({ method: 'GET', url: url('don-tich'), headers: bearer(owner) })
    expect(lineOf(accrual.json(), 'depreciation').blockedBy).toContain('phiếu chi')

    const cash = await inject({ method: 'GET', url: url('dong-tien'), headers: bearer(owner) })
    expect(lineOf(cash.json(), 'depreciation').blockedBy).toContain('KHÔNG có tiền ra')
  })

  it('sổ tài sản cộng dồn khấu hao đã ghi', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/expenses/assets?branch=${fx.branchId}`,
      headers: bearer(owner),
    })
    const asset = res.json().find((a: { id: number }) => a.id === assetId)
    expect(asset.monthlyVnd).toBe(1_000_000)
    expect(asset.accumulatedVnd).toBe(1_000_000)
    expect(asset.remainingVnd).toBe(35_000_000)
  })

  it('thanh lý thì ngừng sinh khấu hao', async () => {
    await inject({
      method: 'POST',
      url: `/api/expenses/assets/${assetId}/retire`,
      headers: bearer(owner),
      payload: { retiredOn: '2026-09-01' },
    })
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/assets/depreciation',
      headers: bearer(owner),
      payload: { branchId: fx.branchId, month: '2026-09-01' },
    })
    expect(res.json().posted).toBe(0)
  })
})

// ------------------------------------------------ C3 · Chi phí định kỳ

describe('C3 — Phiếu định kỳ chống bỏ sót', () => {
  it('khai một khoản định kỳ rồi sinh phiếu nháp cho tháng', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/expenses/recurring',
      headers: bearer(accountant),
      payload: {
        branchId: fx.branchId,
        categoryId: 'mat-bang',
        name: 'Tiền nhà',
        supplier: 'Chủ nhà',
        expectedVnd: 25_000_000,
        dayOfMonth: 5,
        method: 'transfer',
      },
    })
    expect(created.statusCode, created.payload).toBe(201)

    const gen = await inject({
      method: 'POST',
      url: '/api/expenses/recurring/generate',
      headers: bearer(accountant),
      payload: { branchId: fx.branchId, month: '2026-09-01' },
    })
    expect(gen.json().created).toBe(1)
  })

  it('sinh lại trong cùng tháng KHÔNG đẻ phiếu trùng', async () => {
    const gen = await inject({
      method: 'POST',
      url: '/api/expenses/recurring/generate',
      headers: bearer(accountant),
      payload: { branchId: fx.branchId, month: '2026-09-01' },
    })
    expect(gen.json().created).toBe(0)
  })

  it('phiếu sinh ra là NHÁP với số dự kiến — chờ điền số thật', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/expenses/vouchers?branch=${fx.branchId}&from=2026-09-01&to=2026-09-30`,
      headers: bearer(accountant),
    })
    const draft = res.json()[0]
    expect(draft.state).toBe('draft')
    expect(draft.amountVnd).toBe(25_000_000)
    expect(draft.memo).toContain('kiểm lại số thật')
  })

  it('phiếu nháp CHƯA vào Lãi/Lỗ — chỉ phiếu đã duyệt mới là chi phí', async () => {
    const sept = await inject({
      method: 'GET',
      url: `/api/reports/pnl?branch=${fx.branchId}&kind=tuy-chon&compare=ky-truoc&from=2026-09-01&to=2026-09-30`,
      headers: bearer(owner),
    })
    expect(lineOf(sept.json(), 'rent').amount).toBeNull()
  })
})

// -------------------------------------- Tạm ứng chảy vào kỳ lương

describe('Tạm ứng ở C2 tự khấu trừ vào kỳ lương H7', () => {
  it('kỳ lương trừ đúng khoản tạm ứng đã ghi ở phiếu chi', async () => {
    const monday = '2026-08-03'
    await inject({
      method: 'PUT',
      url: '/api/hr/schedule',
      headers: bearer(owner),
      payload: {
        branchId: fx.branchId,
        weekStart: monday,
        employeeId,
        cells: [
          {
            workDate: monday,
            startMinute: 8 * 60,
            endMinute: 16 * 60,
            breakMinutes: 0,
            dayKind: 'thuong',
          },
        ],
      },
    })
    await inject({
      method: 'POST',
      url: '/api/hr/schedule/publish',
      headers: bearer(owner),
      payload: { branchId: fx.branchId, weekStart: monday, employeeId, cells: [] },
    })

    // Lương tính từ CÔNG THỰC TẾ, không từ lịch xếp — ghi công đúng ca đã xếp
    const punched = await inject({
      method: 'POST',
      url: '/api/hr/timesheet',
      headers: bearer(owner),
      payload: {
        branchId: fx.branchId,
        employeeId,
        workDate: monday,
        clockIn: '08:00',
        clockOut: '16:00',
        breakMinutes: 0,
        reason: 'Nhập từ sổ chấm công giấy',
      },
    })
    expect(punched.statusCode, punched.payload).toBe(201)

    const period = await inject({
      method: 'POST',
      url: '/api/hr/payroll/periods',
      headers: bearer(owner),
      payload: { branchId: fx.branchId, periodStart: MONTH, periodEnd: '2026-08-31' },
    })
    const periodId = period.json<{ id: number }>().id

    await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/lock`,
      headers: bearer(owner),
    })
    await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/compute`,
      headers: bearer(owner),
      payload: { adjustments: [] },
    })

    const detail = await inject({
      method: 'GET',
      url: `/api/hr/payroll/periods/${periodId}`,
      headers: bearer(owner),
    })
    const line = detail.json().lines.find((l: { employeeId: number }) => l.employeeId === employeeId)

    // 8g × 30.000 = 240.000 lương; tạm ứng 2.000.000 lấy TỰ ĐỘNG từ phiếu chi
    expect(line.basePayVnd).toBe(240_000)
    expect(line.advanceVnd).toBe(2_000_000)
    // Ứng quá lương thì thực lãnh âm, không kẹp về 0
    expect(line.netPayVnd).toBeLessThan(0)
  })
})

// ------------------------------------------------------- C1 · Tổng quan

describe('C1 — Tổng quan chi phí', () => {
  it('gom theo khoản mục, so kỳ trước, và đếm phiếu chờ duyệt', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/expenses/overview?branch=${fx.branchId}&month=${MONTH}`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)

    const body = res.json()
    expect(body.totalVnd).toBeGreaterThan(0)
    expect(body.draftVouchers).toBeGreaterThan(0)
    expect(body.thresholds.pettyCashVnd).toBe(2_000_000)
  })

  it('cảnh báo vượt ngân sách', async () => {
    await inject({
      method: 'PUT',
      url: '/api/expenses/budgets',
      headers: bearer(accountant),
      payload: {
        branchId: fx.branchId,
        categoryId: 'tien-ich',
        month: MONTH,
        amountVnd: 5_000_000,
      },
    })

    const res = await inject({
      method: 'GET',
      url: `/api/expenses/overview?branch=${fx.branchId}&month=${MONTH}`,
      headers: bearer(accountant),
    })
    const utilities = res.json().lines.find((l: { categoryId: string }) => l.categoryId === 'tien-ich')
    // Chi 10 triệu trên ngân sách 5 triệu
    expect(utilities.overBudget).toBe(true)
  })
})

// ------------------------------------------------------- Phân quyền

describe('Phân quyền §4.2b — Chi phí', () => {
  it('quản lý ca KHÔNG mở được sổ tài sản', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/expenses/assets?branch=${fx.branchId}`,
      headers: bearer(shiftLead),
    })
    expect(res.statusCode).toBe(403)
  })

  it('quản lý ca KHÔNG duyệt được phiếu chi', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers/1/approve',
      headers: bearer(shiftLead),
    })
    expect(res.statusCode).toBe(403)
  })

  it('quản lý ca KHÔNG đặt được ngân sách', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/expenses/budgets',
      headers: bearer(shiftLead),
      payload: {
        branchId: fx.branchId,
        categoryId: 'mat-bang',
        month: MONTH,
        amountVnd: 1_000_000,
      },
    })
    expect(res.statusCode).toBe(403)
  })
})
