/**
 * Nghiệm thu nhân sự — H1 · H2 · H7.
 *
 * Hai thứ phải chứng minh, và cả hai đều là quy tắc chứ không phải tính năng:
 *   1. **Nguyên tắc cứng thứ tư (§4.2b):** quản lý ca thấy CÔNG của nhân viên
 *      mình nhưng KHÔNG BAO GIỜ thấy LƯƠNG.
 *   2. **Dòng chảy khoá nhau:** không tính được lương của kỳ chưa chốt công,
 *      không duyệt được kỳ chưa kiểm, và chốt công rồi thì lịch đóng băng.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { parameters, staff, staffRoles } from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'

/** R10 chủ · R13 quản lý nhân sự · R8 kế toán · R7 quản lý ca */
let owner: string
let hrManager: string
let accountant: string
let shiftLead: string

let cookEmployeeId: number
let periodId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

/** Thứ Hai 2026-08-03 — tuần dùng cho mọi bài kiểm lịch */
const WEEK = '2026-08-03'
const day = (offset: number) => {
  const at = new Date(`${WEEK}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + offset)
  return at.toISOString().slice(0, 10)
}

async function officeLogin(email: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email, password: OFFICE_PASSWORD },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

async function makeOfficeUser(code: string, name: string, email: string, role: string) {
  const passwordHash = await hash(OFFICE_PASSWORD)
  const [row] = await db
    .insert(staff)
    .values({ code, fullName: name, email, passwordHash })
    .returning({ id: staff.id })
  await db
    .insert(staffRoles)
    .values({ staffId: row!.id, roleCode: role, branchId: role === 'R10' ? null : fx.branchId })
  return row!.id
}

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await makeOfficeUser('CHU01', 'Chủ quán', 'chu@tokyosora.vn', 'R10')
  await makeOfficeUser('NS01', 'Nhân sự Mai', 'ns@tokyosora.vn', 'R13')
  await makeOfficeUser('KT01', 'Kế toán Vân', 'kt@tokyosora.vn', 'R8')

  // Quản lý ca dùng chính tài khoản Lan của harness
  const passwordHash = await hash(OFFICE_PASSWORD)
  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db.insert(staffRoles).values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  // Tham số lương (seed thật có, harness thì không)
  await db.insert(parameters).values([
    { key: 'payroll.standardDailyMinutes', branchId: null, value: 480, unit: 'phút' },
    { key: 'payroll.standardMonthlyMinutes', branchId: null, value: 26 * 480, unit: 'phút' },
    { key: 'payroll.otNormalRate', branchId: null, value: 1.5, unit: 'hệ số' },
    { key: 'payroll.otRestRate', branchId: null, value: 2, unit: 'hệ số' },
    { key: 'payroll.otHolidayRate', branchId: null, value: 3, unit: 'hệ số' },
    { key: 'payroll.insuranceEmployeeRate', branchId: null, value: 0.105, unit: 'tỉ lệ' },
    { key: 'payroll.pitWithholdRate', branchId: null, value: 0, unit: 'tỉ lệ' },
  ])

  owner = await officeLogin('chu@tokyosora.vn')
  hrManager = await officeLogin('ns@tokyosora.vn')
  accountant = await officeLogin('kt@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------- H1

describe('H1 — Hồ sơ nhân viên', () => {
  it('quản lý nhân sự tạo được hồ sơ trả theo giờ', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/hr/employees',
      headers: bearer(hrManager),
      payload: {
        staffId: fx.chefId,
        branchId: fx.branchId,
        position: 'Bếp chính',
        payKind: 'hourly',
        hourlyRateVnd: 30_000,
        monthlySalaryVnd: 0,
        fixedAllowanceVnd: 500_000,
        startedOn: '2026-01-05',
        endedOn: null,
        bankAccount: '0021000123456',
        active: true,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    cookEmployeeId = res.json<{ id: number }>().id
  })

  it('trả theo giờ mà đơn giá 0 bị chặn — kỳ lương sẽ ra 0₫ mà không ai báo gì', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/hr/employees',
      headers: bearer(hrManager),
      payload: {
        staffId: fx.waiterId,
        branchId: fx.branchId,
        position: 'Phục vụ',
        payKind: 'hourly',
        hourlyRateVnd: 0,
        monthlySalaryVnd: 0,
        fixedAllowanceVnd: 0,
        startedOn: '2026-02-01',
        endedOn: null,
        bankAccount: null,
        active: true,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('đơn giá giờ')
  })

  it('một tài khoản chỉ có một hồ sơ', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/hr/employees',
      headers: bearer(hrManager),
      payload: {
        staffId: fx.chefId,
        branchId: fx.branchId,
        position: 'Bếp phụ',
        payKind: 'hourly',
        hourlyRateVnd: 25_000,
        monthlySalaryVnd: 0,
        fixedAllowanceVnd: 0,
        startedOn: '2026-03-01',
        endedOn: null,
        bankAccount: null,
        active: true,
      },
    })
    expect(res.statusCode).toBe(409)
  })

  it('QUẢN LÝ CA không mở được hồ sơ — hồ sơ chứa đơn giá lương', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/hr/employees?branch=${fx.branchId}`,
      headers: bearer(shiftLead),
    })
    expect(res.statusCode).toBe(403)
  })
})

// ---------------------------------------------------------------- H2

describe('H2 — Xếp lịch tuần', () => {
  it('quản lý CA xếp được lịch — đây là việc của họ', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/hr/schedule',
      headers: bearer(shiftLead),
      payload: {
        branchId: fx.branchId,
        weekStart: WEEK,
        employeeId: cookEmployeeId,
        cells: [
          // Thứ Hai–Thứ Năm: ca 8 tiếng, ngày thường
          ...[0, 1, 2, 3].map((i) => ({
            workDate: day(i),
            startMinute: 8 * 60,
            endMinute: 17 * 60,
            breakMinutes: 60,
            dayKind: 'thuong',
          })),
          // Thứ Sáu: 10 tiếng ⇒ 2 tiếng tăng ca 150%
          { workDate: day(4), startMinute: 8 * 60, endMinute: 18 * 60, breakMinutes: 0, dayKind: 'thuong' },
          // Chủ nhật: 6 tiếng ngày nghỉ ⇒ toàn bộ 200%
          { workDate: day(6), startMinute: 10 * 60, endMinute: 16 * 60, breakMinutes: 0, dayKind: 'nghi' },
        ],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().cells).toBe(6)
  })

  it('lịch NHÁP chưa tính giờ công — nhân viên còn chưa thấy nó', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/hr/schedule?branch=${fx.branchId}&week=${WEEK}`,
      headers: bearer(shiftLead),
    })
    const me = res.json().employees.find((e: { employeeId: number }) => e.employeeId === cookEmployeeId)
    expect(me.cells).toHaveLength(6)
    expect(me.totalMinutes).toBe(0)
  })

  it('công bố rồi mới tính giờ, và tách đúng ba loại', async () => {
    const publish = await inject({
      method: 'POST',
      url: '/api/hr/schedule/publish',
      headers: bearer(shiftLead),
      payload: { branchId: fx.branchId, weekStart: WEEK, employeeId: cookEmployeeId, cells: [] },
    })
    expect(publish.statusCode, publish.payload).toBe(201)

    const res = await inject({
      method: 'GET',
      url: `/api/hr/schedule?branch=${fx.branchId}&week=${WEEK}`,
      headers: bearer(shiftLead),
    })
    const me = res.json().employees.find((e: { employeeId: number }) => e.employeeId === cookEmployeeId)
    // 4 ngày × 8g = 1920 phút thường; thứ Sáu 10g ⇒ 480 thường + 120 tăng ca
    expect(me.minutes.worked).toBe(1_920 + 480)
    expect(me.minutes.otNormal).toBe(120)
    expect(me.minutes.otRest).toBe(360) // Chủ nhật 6 tiếng
    expect(me.minutes.otHoliday).toBe(0)
  })

  it('ca kết thúc trước khi bắt đầu bị chặn', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/hr/schedule',
      headers: bearer(shiftLead),
      payload: {
        branchId: fx.branchId,
        weekStart: WEEK,
        employeeId: cookEmployeeId,
        cells: [{ workDate: day(0), startMinute: 16 * 60, endMinute: 8 * 60, breakMinutes: 0, dayKind: 'thuong' }],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('ngày ngoài tuần đang sửa bị chặn', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/hr/schedule',
      headers: bearer(shiftLead),
      payload: {
        branchId: fx.branchId,
        weekStart: WEEK,
        employeeId: cookEmployeeId,
        cells: [{ workDate: day(9), startMinute: 8 * 60, endMinute: 16 * 60, breakMinutes: 0, dayKind: 'thuong' }],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('sao chép tuần trước sang dạng NHÁP, không chép loại ngày lễ', async () => {
    const nextWeek = day(7)
    const res = await inject({
      method: 'POST',
      url: '/api/hr/schedule/copy-previous',
      headers: bearer(shiftLead),
      payload: { branchId: fx.branchId, weekStart: nextWeek, employeeId: cookEmployeeId, cells: [] },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().copied).toBe(6)

    const grid = await inject({
      method: 'GET',
      url: `/api/hr/schedule?branch=${fx.branchId}&week=${nextWeek}`,
      headers: bearer(shiftLead),
    })
    const me = grid.json().employees.find((e: { employeeId: number }) => e.employeeId === cookEmployeeId)
    expect(me.totalMinutes).toBe(0) // vừa chép, còn là nháp
    expect(me.cells.every((c: { dayKind: string }) => c.dayKind === 'thuong')).toBe(true)
  })
})

// ---------------------------------------------------------------- H7

describe('H7 — Kỳ lương, năm bước khoá nhau', () => {
  it('mở kỳ lương phủ tuần đã xếp', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/hr/payroll/periods',
      headers: bearer(hrManager),
      payload: { branchId: fx.branchId, periodStart: '2026-08-01', periodEnd: '2026-08-31' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    periodId = res.json<{ id: number }>().id
  })

  it('CHƯA chốt công thì không tính nháp được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/compute`,
      headers: bearer(hrManager),
      payload: {},
    })
    expect(res.statusCode).toBe(409)
  })

  it('chốt công', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/lock`,
      headers: bearer(hrManager),
    })
    expect(res.statusCode, res.payload).toBe(201)
  })

  it('chốt công rồi thì LỊCH của kỳ đó đóng băng', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/hr/schedule',
      headers: bearer(shiftLead),
      payload: {
        branchId: fx.branchId,
        weekStart: WEEK,
        employeeId: cookEmployeeId,
        cells: [{ workDate: day(0), startMinute: 8 * 60, endMinute: 12 * 60, breakMinutes: 0, dayKind: 'thuong' }],
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('period_locked')
  })

  it('lưới lịch nói rõ vì sao chỉ đọc', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/hr/schedule?branch=${fx.branchId}&week=${WEEK}`,
      headers: bearer(shiftLead),
    })
    expect(res.json().locked).toBe(true)
    expect(res.json().lockedReason).toContain('chốt công')
  })

  it('tính nháp: lương + tăng ca theo hệ số, trừ bảo hiểm trên lương cơ bản', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/compute`,
      headers: bearer(hrManager),
      payload: { adjustments: [{ employeeId: cookEmployeeId, bonusVnd: 1_000_000 }] },
    })
    expect(res.statusCode, res.payload).toBe(201)

    const detail = await inject({
      method: 'GET',
      url: `/api/hr/payroll/periods/${periodId}`,
      headers: bearer(hrManager),
    })
    const line = detail.json().lines.find((l: { employeeId: number }) => l.employeeId === cookEmployeeId)

    // 2.400 phút thường × 30.000/60 = 1.200.000
    expect(line.basePayVnd).toBe(1_200_000)
    // 120 phút × 45.000/60 = 90.000 · 360 phút × 60.000/60 = 360.000
    expect(line.overtimePayVnd).toBe(450_000)
    expect(line.allowanceVnd).toBe(500_000)
    expect(line.bonusVnd).toBe(1_000_000)
    expect(line.grossPayVnd).toBe(3_150_000)
    // Bảo hiểm chỉ trên lương cơ bản, KHÔNG trên tăng ca
    expect(line.insuranceVnd).toBe(Math.round(1_200_000 * 0.105))
    expect(line.netPayVnd).toBe(line.grossPayVnd - line.insuranceVnd - line.taxVnd - line.advanceVnd)
  })

  it('tính lại được khi còn ở bước nháp', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/compute`,
      headers: bearer(hrManager),
      payload: { adjustments: [{ employeeId: cookEmployeeId, advanceVnd: 500_000 }] },
    })
    expect(res.statusCode).toBe(201)

    const detail = await inject({
      method: 'GET',
      url: `/api/hr/payroll/periods/${periodId}`,
      headers: bearer(hrManager),
    })
    const line = detail.json().lines[0]
    expect(line.bonusVnd).toBe(0) // thưởng lần trước đã bị dựng lại
    expect(line.advanceVnd).toBe(500_000)
  })

  it('không nhảy cóc: chưa trình thì không kiểm được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/check`,
      headers: bearer(accountant),
    })
    expect(res.statusCode).toBe(409)
  })

  it('R13 trình → R8 kiểm → R10 duyệt → R10 phát', async () => {
    const step = async (path: string, token: string) => {
      const res = await inject({
        method: 'POST',
        url: `/api/hr/payroll/periods/${periodId}/${path}`,
        headers: bearer(token),
      })
      expect(res.statusCode, `${path}: ${res.payload}`).toBe(201)
      return res.json().state
    }

    expect(await step('submit', hrManager)).toBe('submitted')
    expect(await step('check', accountant)).toBe('checked')
    expect(await step('approve', owner)).toBe('approved')
    expect(await step('pay', owner)).toBe('paid')
  })

  it('trình rồi thì KHÔNG tính lại được — đó là điểm của việc trình', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/compute`,
      headers: bearer(hrManager),
      payload: {},
    })
    expect(res.statusCode).toBe(409)
  })
})

// ------------------------------------------ Nguyên tắc cứng thứ tư

describe('NGUYÊN TẮC CỨNG 4 — lương là dữ liệu nhạy cảm', () => {
  it('quản lý ca xem được CÔNG của nhân viên mình', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/hr/schedule?branch=${fx.branchId}&week=${WEEK}`,
      headers: bearer(shiftLead),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().employees[0].minutes.worked).toBeGreaterThan(0)
  })

  it('nhưng KHÔNG xem được bảng lương của kỳ', async () => {
    for (const url of [`payroll/periods?branch=${fx.branchId}`, `payroll/periods/${periodId}`]) {
      const res = await inject({ method: 'GET', url: `/api/hr/${url}`, headers: bearer(shiftLead) })
      expect(res.statusCode, url).toBe(403)
    }
  })

  it('và KHÔNG tính, KHÔNG trình, KHÔNG duyệt được kỳ lương', async () => {
    for (const path of ['compute', 'submit', 'approve', 'pay']) {
      const res = await inject({
        method: 'POST',
        url: `/api/hr/payroll/periods/${periodId}/${path}`,
        headers: bearer(shiftLead),
      })
      expect(res.statusCode, path).toBe(403)
    }
  })

  it('kế toán kiểm được nhưng KHÔNG duyệt được — phân tách nhiệm vụ', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/approve`,
      headers: bearer(accountant),
    })
    expect(res.statusCode).toBe(403)
  })

  it('quản lý nhân sự trình được nhưng KHÔNG duyệt được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/approve`,
      headers: bearer(hrManager),
    })
    expect(res.statusCode).toBe(403)
  })

  it('phiếu lương của chính mình chỉ có sau khi chủ duyệt', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/hr/payroll/my-payslips',
      headers: bearer(hrManager),
    })
    expect(res.statusCode).toBe(200)
    // Quản lý nhân sự chưa có hồ sơ nhân viên nên chưa có phiếu nào
    expect(res.json()).toEqual([])
  })
})

// ------------------------------------------------ Nối vào F7

describe('Kỳ lương đã duyệt chảy vào dòng Nhân sự của F7', () => {
  const pnl = async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/pnl?branch=${fx.branchId}&kind=tuy-chon&compare=ky-truoc&from=2026-08-01&to=2026-08-31`,
      headers: bearer(owner),
    })
    expect(res.statusCode, res.payload).toBe(200)
    return res.json()
  }

  it('dòng Nhân sự không còn để trống', async () => {
    const rows = (await pnl()).rows as { key: string; amount: number | null; note?: string }[]
    const labour = rows.find((r) => r.key === 'labour')!
    // Chi phí mang dấu âm trên P&L. Số là tổng GỘP trước khấu trừ, lấy từ lần tính
    // nháp cuối cùng: 1.200.000 lương + 450.000 tăng ca + 500.000 phụ cấp.
    // Tạm ứng 500.000 trừ vào thực lãnh của người lao động, không giảm chi phí quán.
    expect(labour.amount).toBe(-2_150_000)
    expect(labour.note).toContain('đã duyệt')
  })

  it('tạm ứng KHÔNG làm giảm chi phí nhân sự của quán', async () => {
    const detail = await inject({
      method: 'GET',
      url: `/api/hr/payroll/periods/${periodId}`,
      headers: bearer(owner),
    })
    const totals = detail.json().totals
    expect(totals.gross).toBe(2_150_000)
    expect(totals.net).toBeLessThan(totals.gross)
  })

  it('prime cost chưa tính được vì kỳ này chưa có doanh thu để so tỉ lệ', async () => {
    const body = await pnl()
    expect(body.primeCost.value).toBeNull()
    expect(body.primeCost.blockedBy).toContain('doanh thu')
  })
})
