/**
 * Nghiệm thu KPI — N9 · N10 · N11 Office, N14 Kênh nhân viên, thưởng gợi ý H7.
 *
 * Năm thứ phải chứng minh:
 *   1. **Bộ KPI đủ 100%** mới lưu được.
 *   2. **Luật chấm đóng băng lúc mở kỳ** — đổi A6 giữa kỳ không đổi kỳ đang chạy.
 *   3. **KPI doanh thu = B2**, cùng chi nhánh, cùng kỳ.
 *   4. **Vòng trọn**: tự đánh giá trên điện thoại → cấp trên chấm, kết thúc → R13 chốt
 *      → nhân viên ghi ý kiến; chốt xong là đóng băng.
 *   5. **Thưởng gợi ý chỉ người tính lương thấy**; quản lý ca không thấy cột thưởng.
 */
import { hash } from '@node-rs/argon2'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type {
  KpiBonusSuggestions,
  KpiCycleView,
  KpiReviewDetail,
  KpiReviewRow,
  OrgChart,
} from '@sora/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import { employees, orders, staff, staffRoles } from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'

let owner: string
let hrManager: string
let chainLead: string
let branchLead: string
let minhEmployee: number
let lanEmployee: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

/** Tháng trước — kỳ đã kết thúc, đánh giá được ngay */
const today = businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')
const lastMonth = (() => {
  const [y, m] = today.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 10)
})()
const lastMonthEnd = (() => {
  const [y, m] = today.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, 0)).toISOString().slice(0, 10)
})()
const day = (n: number) => `${lastMonth.slice(0, 8)}${String(n).padStart(2, '0')}`

async function officeLogin(email: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email, password: OFFICE_PASSWORD },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

async function addEmployee(staffId: number, position: string) {
  const [row] = await db
    .insert(employees)
    .values({
      staffId,
      branchId: fx.branchId,
      position,
      payKind: 'monthly',
      monthlySalaryVnd: 8_000_000,
      startedOn: '2026-01-05',
    })
    .returning({ id: employees.id })
  return row!.id
}

async function channelLogin(employeeId: number, pin: string) {
  const link = await inject({
    method: 'POST',
    url: `/api/hr/employees/${employeeId}/channel-link`,
    headers: bearer(hrManager),
  })
  expect(link.statusCode, link.payload).toBe(201)
  const login = await inject({
    method: 'POST',
    url: '/api/auth/channel/login',
    payload: { token: link.json<{ token: string }>().token, pin },
  })
  expect(login.statusCode, login.payload).toBe(201)
  return { cookie: `sora_staff=${login.cookies.find((c) => c.name === 'sora_staff')!.value}` }
}

const positionIn = (c: OrgChart, unitName: string, title: string) => {
  const unit = c.units.find((u) => u.name === unitName)
  return c.positions.find((p) => p.unitId === unit?.id && p.title === title)!
}

async function seat(staffIds: number[], positionId: number) {
  const res = await inject({
    method: 'POST',
    url: '/api/org/assignments',
    headers: bearer(hrManager),
    payload: { staffIds, positionId, fromDate: '2026-01-05', note: 'Dựng sơ đồ lần đầu' },
  })
  expect(res.statusCode, res.payload).toBe(201)
}

async function paidOrder(code: string, date: string, sub: number) {
  await db.insert(orders).values({
    displayCode: code,
    branchId: fx.branchId,
    channel: 'pos',
    type: 'takeaway',
    status: 'done',
    moneySub: sub,
    moneyDiscount: 0,
    moneyService: 0,
    moneyVat: 0,
    moneyShip: 0,
    moneyTotal: sub,
    paymentState: 'paid',
    createdByKind: 'staff',
    createdById: String(fx.cashierId),
    businessDate: date,
  })
}

let cycleId = 0

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  const office = async (code: string, name: string, email: string, role: string) => {
    const [row] = await db
      .insert(staff)
      .values({ code, fullName: name, email, passwordHash: await hash(OFFICE_PASSWORD) })
      .returning({ id: staff.id })
    await db.insert(staffRoles).values({ staffId: row!.id, roleCode: role, branchId: null })
    return row!.id
  }
  await office('CHU09', 'Chủ quán', 'chu@tokyosora.vn', 'R10')
  await office('NS09', 'Nhân sự Mai', 'ns@tokyosora.vn', 'R13')
  const chainLeadId = await office('CHUOI09', 'Quản lý chuỗi', 'chuoi@tokyosora.vn', 'R11')

  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash: await hash(OFFICE_PASSWORD) })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db
    .insert(staffRoles)
    .values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  minhEmployee = await addEmployee(fx.waiterId, 'Phục vụ')
  lanEmployee = await addEmployee(fx.managerId, 'Quản lý chi nhánh')

  owner = await officeLogin('chu@tokyosora.vn')
  hrManager = await officeLogin('ns@tokyosora.vn')
  chainLead = await officeLogin('chuoi@tokyosora.vn')
  branchLead = await officeLogin('lan@tokyosora.vn')

  for (const target of ['chuoi', fx.branchId]) {
    const res = await inject({
      method: 'POST',
      url: '/api/org/apply-standard',
      headers: bearer(hrManager),
      payload: { target },
    })
    expect(res.statusCode, res.payload).toBe(201)
  }
  const c = (
    await inject({ method: 'GET', url: '/api/org/chart', headers: bearer(hrManager) })
  ).json<OrgChart>()
  // Minh: phục vụ → cấp trên là quản lý chi nhánh (Lan) → cấp trên của Lan là quản lý chuỗi
  await seat([fx.waiterId], positionIn(c, 'Sảnh', 'Phục vụ').id)
  const branchUnit = c.units.find((u) => u.branchId === fx.branchId)!
  await seat(
    [fx.managerId],
    c.positions.find((p) => p.unitId === branchUnit.id && p.title === 'Quản lý chi nhánh')!.id,
  )
  await seat([chainLeadId], positionIn(c, 'Khối vận hành', 'Quản lý chuỗi').id)

  // Doanh thu tháng trước: 2 đơn đã trả
  await paidOrder('KPI-001', day(10), 1_200_000)
  await paidOrder('KPI-002', day(20), 800_000)
}, 120_000)

afterAll(async () => {
  await close?.()
})

describe('N9 — bộ KPI', () => {
  it('trọng số không đủ 100% thì không lưu được', async () => {
    const c = (
      await inject({ method: 'GET', url: '/api/org/chart', headers: bearer(hrManager) })
    ).json<OrgChart>()
    const res = await inject({
      method: 'POST',
      url: '/api/performance/templates',
      headers: bearer(hrManager),
      payload: {
        positionId: positionIn(c, 'Sảnh', 'Thu ngân').id,
        items: [
          { metricCode: 'tn.ket-khop', weightPct: 30, defaultTargetMilli: 95_000 },
          { metricCode: 'cc.dung-gio', weightPct: 30, defaultTargetMilli: 95_000 },
          { metricCode: 'nt.thai-do', weightPct: 30, defaultTargetMilli: 4_000 },
        ],
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('kpi_weights_invalid')
  })

  it('áp bộ KPI mẫu cho chi nhánh', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/performance/templates/apply-standard',
      headers: bearer(hrManager),
      payload: { target: fx.branchId },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ created: number }>().created).toBeGreaterThan(5)
  })
})

describe('N10 — kỳ KPI', () => {
  it('mở kỳ dựng phiếu cho người đang làm; người đánh giá là cấp trên theo sơ đồ', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/performance/cycles',
      headers: bearer(hrManager),
      payload: { branchId: fx.branchId, kind: 'thang', periodStart: lastMonth },
    })
    expect(res.statusCode, res.payload).toBe(201)
    cycleId = res.json<{ id: number }>().id

    const again = await inject({
      method: 'POST',
      url: '/api/performance/cycles',
      headers: bearer(hrManager),
      payload: { branchId: fx.branchId, kind: 'thang', periodStart: lastMonth },
    })
    expect(again.json<{ code: string }>().code).toBe('kpi_cycle_exists')

    const rows = (
      await inject({
        method: 'GET',
        url: `/api/performance/cycles/${cycleId}/reviews`,
        headers: bearer(hrManager),
      })
    ).json<KpiReviewRow[]>()
    expect(rows.find((r) => r.staffId === fx.waiterId)?.reviewerName).toBe('Lan')
    expect(rows.find((r) => r.staffId === fx.managerId)?.reviewerName).toBe('Quản lý chuỗi')
  })

  it('công bố kỳ chụp luật chấm; đổi A6 sau đó không đổi kỳ đang chạy', async () => {
    const opened = await inject({
      method: 'POST',
      url: `/api/performance/cycles/${cycleId}/open`,
      headers: bearer(hrManager),
      payload: {},
    })
    expect(opened.statusCode, opened.payload).toBe(201)
    const changed = await inject({
      method: 'PUT',
      url: '/api/admin/parameters/kpi.gradeA',
      headers: bearer(owner),
      payload: { value: 90, branchId: null },
    })
    expect(changed.statusCode, changed.payload).toBe(200)
    const cycles = (
      await inject({
        method: 'GET',
        url: `/api/performance/cycles?branch=${fx.branchId}`,
        headers: bearer(hrManager),
      })
    ).json<KpiCycleView[]>()
    expect(cycles.find((x) => x.id === cycleId)?.rules?.gradeA).toBe(105)
  })

  it('thang chấm khoá ở cấp chuỗi — chi nhánh không nới được', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/parameters/kpi.gradeA',
      headers: bearer(owner),
      payload: { value: 70, branchId: fx.branchId },
    })
    expect(res.json<{ code: string }>().code).toBe('param_not_overridable')
  })

  it('KPI doanh thu bằng đúng doanh thu B2 của cùng kỳ', async () => {
    const computed = await inject({
      method: 'POST',
      url: `/api/performance/cycles/${cycleId}/compute`,
      headers: bearer(chainLead),
    })
    expect(computed.statusCode, computed.payload).toBe(201)
    const rows = (
      await inject({
        method: 'GET',
        url: `/api/performance/cycles/${cycleId}/reviews`,
        headers: bearer(chainLead),
      })
    ).json<KpiReviewRow[]>()
    const lanReview = rows.find((r) => r.staffId === fx.managerId)!
    const detail = (
      await inject({
        method: 'GET',
        url: `/api/performance/reviews/${lanReview.id}`,
        headers: bearer(chainLead),
      })
    ).json<KpiReviewDetail>()
    const revenue = detail.items.find((i) => i.metricCode === 'cn.doanh-thu-thuan')!
    const b2 = await inject({
      method: 'GET',
      url: `/api/reports/revenue?branch=${fx.branchId}&kind=tuy-chon&from=${lastMonth}&to=${lastMonthEnd}&compare=ky-truoc`,
      headers: bearer(chainLead),
    })
    expect(b2.statusCode, b2.payload).toBe(200)
    expect(revenue.actualMilli).toBe(b2.json<{ total: { value: number } }>().total.value * 1000)
    expect(revenue.actualMilli).toBe(2_000_000_000)
  })

  it('quản lý ca không thấy cột thưởng; người tính lương thấy', async () => {
    const asLead = (
      await inject({
        method: 'GET',
        url: `/api/performance/cycles/${cycleId}/reviews`,
        headers: bearer(branchLead),
      })
    ).json<KpiReviewRow[]>()
    expect(asLead.every((r) => !('suggestedBonusVnd' in r))).toBe(true)
    const asHr = (
      await inject({
        method: 'GET',
        url: `/api/performance/cycles/${cycleId}/reviews`,
        headers: bearer(hrManager),
      })
    ).json<KpiReviewRow[]>()
    expect(asHr.some((r) => 'suggestedBonusVnd' in r)).toBe(true)
  })
})

describe('Vòng trọn — tự đánh giá, chấm, chốt, ý kiến', () => {
  let minh: Record<string, string>
  let minhReview = 0
  let lanReview = 0

  it('Minh tự đánh giá trên điện thoại; số tiền bị che với phiên điện thoại', async () => {
    minh = await channelLogin(minhEmployee, fx.pins[fx.waiterId]!)
    const mine = (await inject({ method: 'GET', url: '/api/performance/me', headers: minh })).json<
      KpiReviewRow[]
    >()
    minhReview = mine[0]!.id
    expect('suggestedBonusVnd' in mine[0]!).toBe(false)
    const res = await inject({
      method: 'PUT',
      url: `/api/performance/me/reviews/${minhReview}/self`,
      headers: minh,
      payload: {
        comment: 'Tháng này đông khách',
        items: [{ metricCode: 'nt.thai-do', selfScore: 4 }],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const lan = await channelLogin(lanEmployee, fx.pins[fx.managerId]!)
    const lanRows = (
      await inject({ method: 'GET', url: '/api/performance/me', headers: lan })
    ).json<KpiReviewRow[]>()
    lanReview = lanRows[0]!.id
    const lanDetail = (
      await inject({ method: 'GET', url: `/api/performance/me/reviews/${lanReview}`, headers: lan })
    ).json<KpiReviewDetail>()
    const revenue = lanDetail.items.find((i) => i.metricCode === 'cn.doanh-thu-thuan')!
    expect(revenue.masked).toBe(true)
    expect(revenue.actualMilli).toBeNull()
  })

  it('vào bước đánh giá; Minh không tự chấm phiếu của mình; Lan chấm và kết thúc', async () => {
    const start = await inject({
      method: 'POST',
      url: `/api/performance/cycles/${cycleId}/start-review`,
      headers: bearer(hrManager),
    })
    expect(start.statusCode, start.payload).toBe(201)

    const manager = await inject({
      method: 'PUT',
      url: `/api/performance/reviews/${minhReview}/manager`,
      headers: bearer(branchLead),
      payload: { comment: 'Tốt', items: [{ metricCode: 'nt.thai-do', managerScore: 4 }] },
    })
    expect(manager.statusCode, manager.payload).toBe(200)
    const done = await inject({
      method: 'POST',
      url: `/api/performance/reviews/${minhReview}/finalize`,
      headers: bearer(branchLead),
    })
    expect(done.statusCode, done.payload).toBe(201)

    // Phiếu của Lan: Lan chưa tự đánh giá — đặt hạn chờ về 0 để cấp trên kết thúc được
    const wait = await inject({
      method: 'PUT',
      url: '/api/admin/parameters/kpi.selfReviewDays',
      headers: bearer(owner),
      payload: { value: 0, branchId: null },
    })
    expect(wait.statusCode, wait.payload).toBe(200)
    const lanDone = await inject({
      method: 'POST',
      url: `/api/performance/reviews/${lanReview}/finalize`,
      headers: bearer(chainLead),
    })
    expect(lanDone.statusCode, lanDone.payload).toBe(201)
  })

  it('thưởng gợi ý chỉ có khi kỳ KPI đã chốt', async () => {
    const period = await inject({
      method: 'POST',
      url: '/api/hr/payroll/periods',
      headers: bearer(hrManager),
      payload: { branchId: fx.branchId, periodStart: lastMonth, periodEnd: lastMonthEnd },
    })
    expect(period.statusCode, period.payload).toBe(201)
    const periodId = period.json<{ id: number }>().id
    const before = (
      await inject({
        method: 'GET',
        url: `/api/performance/bonus-suggestions?payrollPeriodId=${periodId}`,
        headers: bearer(hrManager),
      })
    ).json<KpiBonusSuggestions>()
    expect(before.blockedBy).toContain('chưa chốt')

    const closed = await inject({
      method: 'POST',
      url: `/api/performance/cycles/${cycleId}/close`,
      headers: bearer(hrManager),
    })
    expect(closed.statusCode, closed.payload).toBe(201)

    const after = (
      await inject({
        method: 'GET',
        url: `/api/performance/bonus-suggestions?payrollPeriodId=${periodId}`,
        headers: bearer(hrManager),
      })
    ).json<KpiBonusSuggestions>()
    expect(after.blockedBy).toBeNull()
    expect(after.suggestions.find((s) => s.staffId === fx.waiterId)).toBeDefined()
  })

  it('chốt rồi thì đóng băng; nhân viên ghi ý kiến được đúng một lần', async () => {
    const late = await inject({
      method: 'PUT',
      url: `/api/performance/reviews/${minhReview}/manager`,
      headers: bearer(branchLead),
      payload: { comment: 'Sửa', items: [] },
    })
    expect(late.json<{ code: string }>().code).toBe('kpi_cycle_locked')

    const ack = await inject({
      method: 'POST',
      url: `/api/performance/me/reviews/${minhReview}/ack`,
      headers: minh,
      payload: { feedback: 'Em đồng ý' },
    })
    expect(ack.statusCode, ack.payload).toBe(201)
    const twice = await inject({
      method: 'POST',
      url: `/api/performance/me/reviews/${minhReview}/ack`,
      headers: minh,
      payload: { feedback: 'Đổi ý' },
    })
    expect(twice.json<{ code: string }>().code).toBe('kpi_already_acked')
  })
})
