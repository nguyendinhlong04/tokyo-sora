/**
 * Nghiệm thu giao việc và SOP theo ca — N5 · N6 Office, N12 Kênh nhân viên.
 *
 * Bốn thứ phải chứng minh:
 *   1. **Giao trong phạm vi sơ đồ.** Quản lý ca giao được cho người của chi nhánh
 *      mình, không với sang chi nhánh khác; không ai tự giao, tự nghiệm thu.
 *   2. **Vòng nộp — trả lại — nghiệm thu** chạy trên một dòng, từ điện thoại.
 *   3. **SOP theo ca tới đúng người đứng ca đã công bố** — ca nháp không sinh
 *      việc; sinh lười đồng thời không ra hai việc.
 *   4. **Hai người cùng ca bấm nộp cùng lúc chỉ ra một bản nộp.**
 */
import { hash } from '@node-rs/argon2'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { InboxCounts, MyTasks, OrgChart, TaskDetail, TaskRow } from '@sora/contracts'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import {
  branches,
  devices,
  employees,
  scheduleEntries,
  shiftTemplates,
  staff,
  staffRoles,
  tasks,
} from '../db/schema'
import { hashToken } from '../modules/identity/tokens'
import { TasksService } from '../modules/org/tasks.service'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'
const KDS_TOKEN = 'task-test-kds-token'

let hrManager: string
let shiftLead: string
let tamId: number
let namId: number
/** Phiên Kênh nhân viên (link cá nhân + PIN) */
let minh: Record<string, string>
let nam: Record<string, string>

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const today = () => businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

async function officeLogin(email: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email, password: OFFICE_PASSWORD },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

async function addEmployee(staffId: number, branchId: string, position: string) {
  const [row] = await db
    .insert(employees)
    .values({
      staffId,
      branchId,
      position,
      payKind: 'hourly',
      hourlyRateVnd: 25_000,
      startedOn: '2026-01-05',
    })
    .returning({ id: employees.id })
  return row!.id
}

/** Mở Kênh nhân viên như người thật: quản lý cấp link, nhân viên bấm link rồi nhập PIN */
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

async function chart() {
  return (
    await inject({ method: 'GET', url: '/api/org/chart', headers: bearer(hrManager) })
  ).json<OrgChart>()
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

async function shift(employeeId: number, templateId: number, state: 'draft' | 'published') {
  const [t] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, templateId))
  await db.insert(scheduleEntries).values({
    branchId: fx.branchId,
    employeeId,
    workDate: today(),
    templateId,
    startMinute: t!.startMinute,
    endMinute: t!.endMinute,
    state,
    publishedAt: state === 'published' ? new Date() : null,
  })
}

const mine = async (headers: Record<string, string>) =>
  (await inject({ method: 'GET', url: '/api/org/me/tasks', headers })).json<MyTasks>()

const myTask = (list: MyTasks, title: string) => list.open.find((t) => t.title === title)

let morningId: number
let eveningId: number
let minhEmployee: number
let namEmployee: number
let hoaEmployee: number
let lanEmployee: number

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  // Chi nhánh thứ hai — ngoài phạm vi của quản lý ca Cầu Giấy
  await db.insert(branches).values({ id: 'ht', name: 'Hồ Tây' })
  const [tam] = await db
    .insert(staff)
    .values({ code: 'PV09', fullName: 'Tâm' })
    .returning({ id: staff.id })
  tamId = tam!.id
  await db.insert(staffRoles).values({ staffId: tamId, roleCode: 'R1', branchId: 'ht' })
  await addEmployee(tamId, 'ht', 'Phục vụ')

  // Phục vụ thứ hai cùng ca với Minh
  const [namRow] = await db
    .insert(staff)
    .values({ code: 'PV02', fullName: 'Nam', pinHash: await hash('1202') })
    .returning({ id: staff.id })
  namId = namRow!.id
  await db.insert(staffRoles).values({ staffId: namId, roleCode: 'R1', branchId: fx.branchId })

  const [hr] = await db
    .insert(staff)
    .values({
      code: 'NS09',
      fullName: 'Nhân sự Mai',
      email: 'ns@tokyosora.vn',
      passwordHash: await hash(OFFICE_PASSWORD),
    })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: hr!.id, roleCode: 'R13', branchId: null })

  // Quản lý ca Lan: CHỈ R7 (harness cho thêm R10 — bỏ để phạm vi đúng là chi nhánh)
  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash: await hash(OFFICE_PASSWORD) })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db
    .insert(staffRoles)
    .values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  minhEmployee = await addEmployee(fx.waiterId, fx.branchId, 'Phục vụ')
  namEmployee = await addEmployee(namId, fx.branchId, 'Phục vụ')
  hoaEmployee = await addEmployee(fx.cashierId, fx.branchId, 'Thu ngân')
  lanEmployee = await addEmployee(fx.managerId, fx.branchId, 'Quản lý ca')

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'kds',
    name: 'Màn bếp nướng',
    stationId: 'ST-06',
    tokenHash: hashToken(KDS_TOKEN),
  })

  hrManager = await officeLogin('ns@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')

  for (const target of ['chuoi', fx.branchId]) {
    const res = await inject({
      method: 'POST',
      url: '/api/org/apply-standard',
      headers: bearer(hrManager),
      payload: { target },
    })
    expect(res.statusCode, res.payload).toBe(201)
  }
  const c = await chart()
  await seat([fx.waiterId, namId], positionIn(c, 'Sảnh', 'Phục vụ').id)
  await seat([fx.cashierId], positionIn(c, 'Sảnh', 'Thu ngân').id)
  await seat([fx.managerId], positionIn(c, 'Sảnh', 'Quản lý ca').id)

  // Hai ca mẫu: ca sáng là ca mở cửa, ca tối là ca đóng cửa
  const [morning] = await db
    .insert(shiftTemplates)
    .values({ branchId: fx.branchId, name: 'Ca sáng', startMinute: 7 * 60, endMinute: 15 * 60 })
    .returning({ id: shiftTemplates.id })
  const [evening] = await db
    .insert(shiftTemplates)
    .values({ branchId: fx.branchId, name: 'Ca tối', startMinute: 15 * 60, endMinute: 23 * 60 })
    .returning({ id: shiftTemplates.id })
  morningId = morning!.id
  eveningId = evening!.id

  // Hôm nay: Minh và Nam đứng ca sáng (đã công bố); Hoa ca sáng nhưng là thu ngân
  await shift(minhEmployee, morningId, 'published')
  await shift(namEmployee, morningId, 'published')
  await shift(hoaEmployee, morningId, 'published')

  minh = await channelLogin(minhEmployee, fx.pins[fx.waiterId]!)
  nam = await channelLogin(namEmployee, '1202')
}, 120_000)

afterAll(async () => {
  await close?.()
})

let manualId = 0

describe('N5 — giao việc trong phạm vi sơ đồ', () => {
  const give = (body: Record<string, unknown>) =>
    inject({
      method: 'POST',
      url: '/api/org/tasks',
      headers: bearer(shiftLead),
      payload: { title: 'Lau quạt hút khu A', dueAt: inHours(6), ...body },
    })

  it('quản lý ca giao cho phục vụ của chi nhánh mình; không với sang chi nhánh khác', async () => {
    const ok = await give({ assigneeStaffIds: [fx.waiterId] })
    expect(ok.statusCode, ok.payload).toBe(201)
    manualId = ok.json<{ ids: number[] }>().ids[0]!

    const other = await give({ assigneeStaffIds: [tamId] })
    expect(other.statusCode).toBe(403)
    expect(other.json<{ code: string }>().code).toBe('assignee_out_of_scope')
  })

  it('không tự giao việc cho mình, không giao người làm tự nghiệm thu', async () => {
    const self = await give({ assigneeStaffIds: [fx.managerId] })
    expect(self.json<{ code: string }>().code).toBe('self_assignment')
    const review = await give({ assigneeStaffIds: [fx.waiterId], reviewerStaffId: fx.waiterId })
    expect(review.json<{ code: string }>().code).toBe('self_review')
  })

  it('danh sách người nhận chỉ gồm người trong phạm vi', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/org/tasks/assignees',
      headers: bearer(shiftLead),
    })
    const ids = res.json<{ staffId: number }[]>().map((p) => p.staffId)
    expect(ids).toContain(fx.waiterId)
    expect(ids).not.toContain(tamId)
    expect(ids).not.toContain(fx.managerId)
  })

  it('việc đã quá hạn không dời hạn được', async () => {
    const res = await give({ title: 'Dán nhãn kệ khô', assigneeStaffIds: [namId] })
    const id = res.json<{ ids: number[] }>().ids[0]!
    await db
      .update(tasks)
      .set({ dueAt: new Date(Date.now() - 3_600_000) })
      .where(eq(tasks.id, id))
    const moved = await inject({
      method: 'PUT',
      url: `/api/org/tasks/${id}`,
      headers: bearer(shiftLead),
      payload: { dueAt: inHours(24) },
    })
    expect(moved.statusCode).toBe(409)
    expect(moved.json<{ code: string }>().code).toBe('task_overdue_due_locked')
  })
})

describe('N12 — nhận, nộp, trả lại, nghiệm thu trên điện thoại', () => {
  it('Minh thấy việc, bấm nhận, nộp; người nộp không tự nghiệm thu', async () => {
    expect(myTask(await mine(minh), 'Lau quạt hút khu A')).toBeDefined()
    const accepted = await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${manualId}/accept`,
      headers: minh,
    })
    expect(accepted.statusCode, accepted.payload).toBe(201)

    const submitted = await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${manualId}/submit`,
      headers: minh,
      payload: { note: 'Đã tháo lưới, ngâm xút' },
    })
    expect(submitted.json<{ state: string }>().state).toBe('submitted')

    const selfReview = await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${manualId}/review`,
      headers: minh,
      payload: { accept: true },
    })
    expect(selfReview.statusCode).toBe(409)
    expect(selfReview.json<{ code: string }>().code).toBe('self_review')
  })

  it('người giao trả lại kèm lý do → Minh làm tiếp, nộp lại → đạt', async () => {
    const back = await inject({
      method: 'POST',
      url: `/api/org/tasks/${manualId}/review`,
      headers: bearer(shiftLead),
      payload: { accept: false, note: 'Còn bám dầu ở cánh quạt' },
    })
    expect(back.json<{ state: string }>().state).toBe('open')

    const detail = (
      await inject({ method: 'GET', url: `/api/org/me/tasks/${manualId}`, headers: minh })
    ).json<TaskDetail>()
    expect(detail.managerNote).toBe('Còn bám dầu ở cánh quạt')
    expect(detail.canSubmit).toBe(true)

    await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${manualId}/submit`,
      headers: minh,
      payload: { note: 'Đã lau lại' },
    })
    const done = await inject({
      method: 'POST',
      url: `/api/org/tasks/${manualId}/review`,
      headers: bearer(shiftLead),
      payload: { accept: true },
    })
    expect(done.json<{ state: string }>().state).toBe('done')
  })
})

describe('N6 — SOP theo ca', () => {
  let openingId = 0

  it('áp bộ SOP chuẩn: mở ca gắn ca sáng, đóng ca gắn ca tối', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/org/task-templates/apply-standard',
      headers: bearer(shiftLead),
      payload: { branchId: fx.branchId },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ created: number }>().created).toBeGreaterThan(0)

    const again = await inject({
      method: 'POST',
      url: '/api/org/task-templates/apply-standard',
      headers: bearer(shiftLead),
      payload: { branchId: fx.branchId },
    })
    expect(again.json<{ created: number }>().created).toBe(0)
  })

  it('việc mở ca tới người đứng ca sáng đã công bố; thu ngân cùng ca không thấy', async () => {
    const list = await mine(minh)
    const opening = myTask(list, 'Mở ca – Sảnh')
    expect(opening).toBeDefined()
    expect(opening!.checklist.total).toBe(6)
    openingId = opening!.id
    expect(list.shiftToday?.label).toContain('Ca sáng')

    const hoa = await channelLogin(hoaEmployee, fx.pins[fx.cashierId]!)
    expect(myTask(await mine(hoa), 'Mở ca – Sảnh')).toBeUndefined()
  })

  it('ca tối còn nháp thì chưa có việc đóng ca', async () => {
    await shift(lanEmployee, eveningId, 'draft')
    await app.get(TasksService).materialize(true)
    const sop = (
      await inject({
        method: 'GET',
        url: `/api/org/tasks?view=sop&branch=${fx.branchId}`,
        headers: bearer(shiftLead),
      })
    ).json<TaskRow[]>()
    const titles = sop.map((t) => t.title)
    expect(titles).toContain('Mở ca – Sảnh')
    expect(titles).not.toContain('Đóng ca – Sảnh')
  })

  it('năm lần sinh lười cùng lúc vẫn chỉ ra một việc mở ca', async () => {
    const service = app.get(TasksService)
    await Promise.all(Array.from({ length: 5 }, () => service.materialize(true)))
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.title, 'Mở ca – Sảnh'), eq(tasks.occurrenceDate, today())))
    expect(rows).toHaveLength(1)
  })

  it('còn mục chưa tích mà không ghi lý do thì không nộp được', async () => {
    await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${openingId}/check`,
      headers: minh,
      payload: { idx: 0, checked: true },
    })
    const early = await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${openingId}/submit`,
      headers: minh,
      payload: {},
    })
    expect(early.statusCode).toBe(409)
    expect(early.json<{ code: string }>().code).toBe('checklist_incomplete')

    // Nam cùng ca tích nốt — mỗi mục ghi đúng người tích
    for (let idx = 1; idx < 6; idx++) {
      const res = await inject({
        method: 'POST',
        url: `/api/org/me/tasks/${openingId}/check`,
        headers: nam,
        payload: { idx, checked: true },
      })
      expect(res.statusCode, res.payload).toBe(201)
    }
    const detail = (
      await inject({ method: 'GET', url: `/api/org/me/tasks/${openingId}`, headers: minh })
    ).json<TaskDetail>()
    expect(detail.items[0]!.checkedByName).toBe('Minh')
    expect(detail.items[5]!.checkedByName).toBe('Nam')
  })

  it('nộp xong tới tay quản lý ca giữ ghế nghiệm thu; quản lý ca bấm đạt', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${openingId}/submit`,
      headers: minh,
      payload: {},
    })
    expect(res.json<{ state: string }>().state).toBe('submitted')

    const inbox = (
      await inject({ method: 'GET', url: '/api/me/inbox', headers: bearer(shiftLead) })
    ).json<InboxCounts>()
    expect(inbox.tasks.toReview).toBeGreaterThanOrEqual(1)

    const ok = await inject({
      method: 'POST',
      url: `/api/org/me/tasks/${openingId}/review`,
      headers: bearer(shiftLead),
      payload: { accept: true },
    })
    expect(ok.statusCode, ok.payload).toBe(201)
    const done = await db.select().from(tasks).where(eq(tasks.id, openingId))
    expect(done[0]!.state).toBe('done')
    expect(done[0]!.doneBy).toBe(fx.waiterId)
  })

  it('hai người cùng ca bấm nộp cùng lúc: một người nộp, người kia nhận 409', async () => {
    // Minh và Nam chuyển sang ca tối (đã công bố) → việc đóng ca xuất hiện. Một
    // người một ngày một ca, nên đổi chính ô lịch hôm nay của hai người
    await db
      .update(scheduleEntries)
      .set({ templateId: eveningId, startMinute: 15 * 60, endMinute: 23 * 60 })
      .where(
        and(
          inArray(scheduleEntries.employeeId, [minhEmployee, namEmployee]),
          eq(scheduleEntries.workDate, today()),
        ),
      )
    await app.get(TasksService).materialize(true)

    const closing = myTask(await mine(nam), 'Đóng ca – Sảnh')
    expect(closing).toBeDefined()
    const send = (headers: Record<string, string>) =>
      inject({
        method: 'POST',
        url: `/api/org/me/tasks/${closing!.id}/submit`,
        headers,
        payload: { note: 'Mất điện khu B, chưa tắt được điều hoà' },
      })
    const [a, b] = await Promise.all([send(minh), send(nam)])
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409])
  })
})

describe('Ranh giới', () => {
  it('màn bếp mang vai trò R4 không mở được việc "của tôi"', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/org/me/tasks',
      headers: { 'x-sora-device': KDS_TOKEN },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json<{ code: string }>().code).toBe('staff_only')
  })

  it('link cá nhân không mở được màn giao việc của quản lý', async () => {
    const res = await inject({ method: 'GET', url: '/api/org/tasks', headers: minh })
    expect(res.statusCode).toBe(403)
  })

  it('hộp việc của Nam đếm việc quá hạn; phục vụ không có nhóm khiếu nại', async () => {
    const inbox = (
      await inject({ method: 'GET', url: '/api/me/inbox', headers: nam })
    ).json<InboxCounts>()
    // "Dán nhãn kệ khô" đã quá hạn từ phần N5
    expect(inbox.tasks.overdue).toBeGreaterThanOrEqual(1)
    expect(inbox.tasks.open).toBeGreaterThanOrEqual(inbox.tasks.overdue)
    expect(inbox.feedback).toBeUndefined()
  })
})
