/**
 * Nghiệm thu báo cáo công việc và sự cố — N7 · N8 Office, N1, Kênh nhân viên N15.
 *
 * Bốn thứ phải chứng minh:
 *   1. **Suất báo cáo tính từ mẫu + lịch**, không ai phải tạo tay; quá hạn mà chưa
 *      nộp hiện ở tab "Còn thiếu".
 *   2. **Nộp là đóng băng**: số tự điền chụp lúc nộp, trường bắt buộc phải đủ.
 *   3. **Tiền chỉ nộp ở máy của quán**: Kênh nhân viên nộp được báo cáo ca bếp,
 *      không nộp được báo cáo cuối ngày.
 *   4. **Sự cố nghiêm trọng đóng đúng người, đúng thủ tục**: khai báo ra ngoài, việc
 *      khắc phục xong, người báo không tự đóng.
 */
import { hash } from '@node-rs/argon2'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type {
  IncidentDetail,
  IncidentRow,
  InboxCounts,
  OrgChart,
  ReportSlot,
  WorkReportDetail,
} from '@sora/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import { employees, scheduleEntries, shiftTemplates, staff, staffRoles, tasks } from '../db/schema'
import { addDays } from '../modules/work-reports/domain/report-slots'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'

let hrManager: string
let chainLead: string
let branchLead: string
let chainLeadId: number
let lanEmployee: number
let ducEmployee: number
let minhEmployee: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const today = () => businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')

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
      payKind: 'hourly',
      hourlyRateVnd: 25_000,
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

const due = async (headers: Record<string, string>) =>
  (await inject({ method: 'GET', url: '/api/work-reports/me/due', headers })).json<ReportSlot[]>()

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
  await office('NS09', 'Nhân sự Mai', 'ns@tokyosora.vn', 'R13')
  chainLeadId = await office('CHUOI09', 'Quản lý chuỗi', 'chuoi@tokyosora.vn', 'R11')

  // Lan: chỉ R7 — ngồi ghế quản lý chi nhánh (người nộp báo cáo cuối ngày)
  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash: await hash(OFFICE_PASSWORD) })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db
    .insert(staffRoles)
    .values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  lanEmployee = await addEmployee(fx.managerId, 'Quản lý chi nhánh')
  ducEmployee = await addEmployee(fx.chefId, 'Bếp trưởng')
  minhEmployee = await addEmployee(fx.waiterId, 'Phục vụ')

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
  const c = await (
    await inject({ method: 'GET', url: '/api/org/chart', headers: bearer(hrManager) })
  ).json<OrgChart>()
  await seat([chainLeadId], positionIn(c, 'Khối vận hành', 'Quản lý chuỗi').id)
  const branchUnit = c.units.find((u) => u.branchId === fx.branchId)!
  await seat(
    [fx.managerId],
    c.positions.find((p) => p.unitId === branchUnit.id && p.title === 'Quản lý chi nhánh')!.id,
  )
  await seat([fx.chefId], positionIn(c, 'Bếp', 'Bếp trưởng').id)
  await seat([fx.waiterId], positionIn(c, 'Sảnh', 'Phục vụ').id)

  const [morning] = await db
    .insert(shiftTemplates)
    .values({ branchId: fx.branchId, name: 'Ca sáng', startMinute: 7 * 60, endMinute: 15 * 60 })
    .returning()
  await db.insert(scheduleEntries).values({
    branchId: fx.branchId,
    employeeId: ducEmployee,
    workDate: today(),
    templateId: morning!.id,
    startMinute: morning!.startMinute,
    endMinute: morning!.endMinute,
    state: 'published',
    publishedAt: new Date(),
  })
}, 120_000)

afterAll(async () => {
  await close?.()
})

describe('N7 — mẫu chuẩn và suất phải nộp', () => {
  it('áp ba mẫu chuẩn cho chi nhánh; áp lại không nhân đôi', async () => {
    const send = () =>
      inject({
        method: 'POST',
        url: '/api/work-reports/templates/apply-standard',
        headers: bearer(chainLead),
        payload: { branchId: fx.branchId },
      })
    const first = await send()
    expect(first.statusCode, first.payload).toBe(201)
    expect(first.json<{ created: number }>().created).toBe(3)
    expect((await send()).json<{ created: number }>().created).toBe(0)
  })

  it('quản lý ca không cấu hình mẫu được', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/work-reports/templates/apply-standard',
      headers: bearer(branchLead),
      payload: { branchId: fx.branchId },
    })
    expect(res.statusCode).toBe(403)
  })

  it('quản lý chi nhánh có suất báo cáo cuối ngày hôm nay', async () => {
    const slots = await due(bearer(branchLead))
    expect(
      slots.some((s) => s.templateName === 'Báo cáo cuối ngày' && s.businessDate === today()),
    ).toBe(true)
  })
})

let dailyId = 0

describe('Nộp — đóng băng số tự điền, đủ trường bắt buộc', () => {
  it('thiếu trường bắt buộc thì không nộp được; đủ thì nộp, số tự điền có mặt', async () => {
    const slot = (await due(bearer(branchLead))).find(
      (s) => s.templateName === 'Báo cáo cuối ngày' && s.businessDate === today(),
    )!
    const opened = await inject({
      method: 'POST',
      url: '/api/work-reports/me/drafts',
      headers: bearer(branchLead),
      payload: { templateId: slot.templateId, periodKey: slot.periodKey, shiftTemplateId: null },
    })
    expect(opened.statusCode, opened.payload).toBe(201)
    dailyId = opened.json<WorkReportDetail>().id

    const early = await inject({
      method: 'POST',
      url: `/api/work-reports/me/${dailyId}/submit`,
      headers: bearer(branchLead),
    })
    expect(early.statusCode).toBe(409)
    expect(early.json<{ code: string }>().code).toBe('report_field_required')

    await inject({
      method: 'PUT',
      url: `/api/work-reports/me/${dailyId}`,
      headers: bearer(branchLead),
      payload: { values: { 'nhan-xet': 'Ngày bình thường', 'da-kiem-dong-cua': true } },
    })
    const ok = await inject({
      method: 'POST',
      url: `/api/work-reports/me/${dailyId}/submit`,
      headers: bearer(branchLead),
    })
    expect(ok.statusCode, ok.payload).toBe(201)
    expect(ok.json<{ onTime: boolean }>().onTime).toBe(true)

    const detail = (
      await inject({
        method: 'GET',
        url: `/api/work-reports/me/${dailyId}`,
        headers: bearer(branchLead),
      })
    ).json<WorkReportDetail>()
    expect(detail.state).toBe('submitted')
    expect(typeof detail.autoValues['doanh-thu']?.value).toBe('number')
  })

  it('đã nộp thì không sửa — chỉ viết bổ sung', async () => {
    const res = await inject({
      method: 'PUT',
      url: `/api/work-reports/me/${dailyId}`,
      headers: bearer(branchLead),
      payload: { values: { 'nhan-xet': 'Sửa lại' } },
    })
    expect(res.json<{ code: string }>().code).toBe('report_not_draft')
    const add = await inject({
      method: 'POST',
      url: `/api/work-reports/me/${dailyId}/addenda`,
      headers: bearer(branchLead),
      payload: { body: 'Bổ sung: máy lạnh khu B kêu to' },
    })
    expect(add.statusCode, add.payload).toBe(201)
  })

  it('người viết không tự xác nhận; cấp trên theo sơ đồ xác nhận', async () => {
    const self = await inject({
      method: 'POST',
      url: `/api/work-reports/${dailyId}/review`,
      headers: bearer(branchLead),
      payload: {},
    })
    expect(self.json<{ code: string }>().code).toBe('self_review')
    const ok = await inject({
      method: 'POST',
      url: `/api/work-reports/${dailyId}/review`,
      headers: bearer(chainLead),
      payload: { note: 'Đã xem' },
    })
    expect(ok.statusCode, ok.payload).toBe(201)
  })

  it('suất đã quá hạn mà chưa ai nộp hiện ở "Còn thiếu"', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/work-reports/missing?branch=${fx.branchId}`,
      headers: bearer(chainLead),
    })
    const missing = res.json<ReportSlot[]>()
    // Báo cáo cuối ngày của hôm kia: hạn 09:00 hôm qua — chắc chắn đã quá
    expect(
      missing.some(
        (s) => s.templateName === 'Báo cáo cuối ngày' && s.businessDate === addDays(today(), -2),
      ),
    ).toBe(true)
  })
})

describe('Kênh nhân viên — tiền chỉ nộp ở máy của quán', () => {
  it('bếp trưởng nộp báo cáo ca bếp trên điện thoại', async () => {
    const duc = await channelLogin(ducEmployee, fx.pins[fx.chefId]!)
    const slot = (await due(duc)).find((s) => s.templateName === 'Báo cáo ca bếp')!
    expect(slot.kenhNv).toBe(true)
    const opened = await inject({
      method: 'POST',
      url: '/api/work-reports/me/drafts',
      headers: duc,
      payload: {
        templateId: slot.templateId,
        periodKey: slot.periodKey,
        shiftTemplateId: slot.shiftTemplateId,
      },
    })
    const id = opened.json<WorkReportDetail>().id
    await inject({
      method: 'PUT',
      url: `/api/work-reports/me/${id}`,
      headers: duc,
      payload: { values: { 'so-che': 'Thái 5kg bò, ướp 3kg gà', 've-sinh': true } },
    })
    const res = await inject({
      method: 'POST',
      url: `/api/work-reports/me/${id}/submit`,
      headers: duc,
    })
    expect(res.statusCode, res.payload).toBe(201)
  })

  it('báo cáo cuối ngày (có tiền) không nộp được từ link cá nhân', async () => {
    const lan = await channelLogin(lanEmployee, fx.pins[fx.managerId]!)
    const slot = (await due(lan)).find(
      (s) => s.templateName === 'Báo cáo cuối ngày' && s.businessDate === addDays(today(), -1),
    )!
    const opened = await inject({
      method: 'POST',
      url: '/api/work-reports/me/drafts',
      headers: lan,
      payload: { templateId: slot.templateId, periodKey: slot.periodKey, shiftTemplateId: null },
    })
    const id = opened.json<WorkReportDetail>().id
    const res = await inject({
      method: 'POST',
      url: `/api/work-reports/me/${id}/submit`,
      headers: lan,
    })
    expect(res.statusCode).toBe(403)
    expect(res.json<{ code: string }>().code).toBe('workreport_need_office')
  })
})

describe('N8 — sự cố nghiêm trọng', () => {
  let incidentId = 0
  let minh: Record<string, string>

  it('phục vụ báo sự cố ATTP từ điện thoại: có mã SC, tự đánh dấu phải khai báo ra ngoài', async () => {
    minh = await channelLogin(minhEmployee, fx.pins[fx.waiterId]!)
    const res = await inject({
      method: 'POST',
      url: '/api/incidents',
      headers: minh,
      payload: {
        category: 'an-toan-thuc-pham',
        severity: 'nghiem-trong',
        occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
        title: 'Hai khách đau bụng sau khi ăn hàu',
        description: 'Bàn A4, 20:30, hai khách báo đau bụng',
        injuredCount: 2,
        customerInvolved: true,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ code: string }>().code).toMatch(/^SC-\d{4}-0001$/)
    incidentId = res.json<{ id: number }>().id
  })

  it('báo sau quá workreport.incidentReportHours thì hiện là báo trễ', async () => {
    const late = await inject({
      method: 'POST',
      url: '/api/incidents',
      headers: minh,
      payload: {
        category: 'hong-thiet-bi',
        severity: 'nhe',
        occurredAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
        title: 'Vòi rửa khu bếp lạnh rò nước',
        description: 'Phát hiện từ hôm qua, giờ mới báo',
        injuredCount: 0,
        customerInvolved: false,
      },
    })
    expect(late.statusCode, late.payload).toBe(201)
    const rows = (
      await inject({ method: 'GET', url: '/api/incidents', headers: bearer(chainLead) })
    ).json<IncidentRow[]>()
    expect(rows.find((r) => r.id === late.json<{ id: number }>().id)?.reportedLate).toBe(true)
    expect(rows.find((r) => r.id === incidentId)?.reportedLate).toBe(false)
  })

  it('quản lý ca không đóng được sự cố nghiêm trọng', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/incidents/${incidentId}/close`,
      headers: bearer(branchLead),
      payload: {},
    })
    expect(res.statusCode).toBe(403)
  })

  it('chưa khai báo ra ngoài, còn việc khắc phục thì quản lý chuỗi cũng chưa đóng được', async () => {
    await inject({
      method: 'PUT',
      url: `/api/incidents/${incidentId}`,
      headers: bearer(chainLead),
      payload: {
        rootCause: 'Hàu lô 18/10 bảo quản sai nhiệt',
        correctiveAction: 'Đổi nhà cung cấp',
      },
    })
    const task = await inject({
      method: 'POST',
      url: `/api/incidents/${incidentId}/tasks`,
      headers: bearer(chainLead),
      payload: { title: 'Rà lại quy trình nhận hàu', assigneeStaffIds: [fx.waiterId] },
    })
    expect(task.statusCode, task.payload).toBe(201)

    const pending = await inject({
      method: 'POST',
      url: `/api/incidents/${incidentId}/close`,
      headers: bearer(chainLead),
      payload: {},
    })
    expect(pending.json<{ code: string }>().code).toBe('incident_external_pending')

    await inject({
      method: 'POST',
      url: `/api/incidents/${incidentId}/external-report`,
      headers: bearer(chainLead),
      payload: { reportedAt: new Date().toISOString(), ref: 'Báo Trung tâm y tế quận, 21:15' },
    })
    const open = await inject({
      method: 'POST',
      url: `/api/incidents/${incidentId}/close`,
      headers: bearer(chainLead),
      payload: {},
    })
    expect(open.json<{ code: string }>().code).toBe('incident_open_tasks')
  })

  it('việc khắc phục xong thì đóng được; sự cố đã đóng không sửa nữa', async () => {
    const detail = (
      await inject({
        method: 'GET',
        url: `/api/incidents/${incidentId}`,
        headers: bearer(chainLead),
      })
    ).json<IncidentDetail>()
    const taskId = detail.tasks[0]!.id
    await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${taskId}/submit`,
      headers: minh,
      payload: { note: 'Đã rà, thêm bước đo nhiệt khi nhận' },
    })
    await inject({
      method: 'POST',
      url: `/api/org/tasks/${taskId}/review`,
      headers: bearer(chainLead),
      payload: { accept: true },
    })
    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(row!.state).toBe('done')

    const closed = await inject({
      method: 'POST',
      url: `/api/incidents/${incidentId}/close`,
      headers: bearer(chainLead),
      payload: { note: 'Đã đổi nhà cung cấp hàu' },
    })
    expect(closed.statusCode, closed.payload).toBe(201)
    const again = await inject({
      method: 'PUT',
      url: `/api/incidents/${incidentId}`,
      headers: bearer(chainLead),
      payload: { title: 'Sửa' },
    })
    expect(again.json<{ code: string }>().code).toBe('incident_closed')
  })

  it('hộp việc của quản lý chuỗi đếm sự cố đang mở; phục vụ không có nhóm sự cố', async () => {
    const chain = (
      await inject({ method: 'GET', url: '/api/me/inbox', headers: bearer(chainLead) })
    ).json<InboxCounts>()
    expect(chain.incidents).toBeDefined()
    const waiter = (
      await inject({ method: 'GET', url: '/api/me/inbox', headers: minh })
    ).json<InboxCounts>()
    expect(waiter.incidents).toBeUndefined()
    expect(waiter.reports).toBeDefined()
  })
})
