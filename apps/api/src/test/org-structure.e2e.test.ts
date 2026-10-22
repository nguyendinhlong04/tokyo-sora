/**
 * Nghiệm thu sơ đồ tổ chức — N2 · N3.
 *
 * Ba thứ phải chứng minh:
 *   1. **Cây không bao giờ có vòng, mỗi đơn vị một trưởng** — vì "cấp trên trực
 *      tiếp" và phạm vi giao việc đều suy ra từ cây.
 *   2. **Phạm vi theo cây:** quản lý ca chỉ thấy cây chi nhánh mình; người nhìn
 *      toàn chuỗi mới sửa được sơ đồ; không ai tự gán chức cho mình.
 *   3. **Sơ đồ và hồ sơ H1 nói cùng một điều:** gán chức danh chính là chữ chức
 *      danh trên hồ sơ đổi theo, và H1 không sửa ngược được.
 */
import { hash } from '@node-rs/argon2'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { OrgChart } from '@sora/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import { branches, devices, employees, staff, staffRoles } from '../db/schema'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'
const KDS_TOKEN = 'org-test-kds-token'

let owner: string
let hrManager: string
let shiftLead: string
let hrStaffId: number
let branchLeadId: number
let minhEmployeeId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

/** Ngày THẬT theo giờ Việt Nam ± số ngày — "sắp tới" phải đúng bất kể chạy test hôm nào */
const day = (offset: number) => {
  const at = new Date(`${businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')}T00:00:00Z`)
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

async function makeOfficeUser(
  code: string,
  name: string,
  email: string,
  role: string,
  branchId: string | null,
) {
  const passwordHash = await hash(OFFICE_PASSWORD)
  const [row] = await db
    .insert(staff)
    .values({ code, fullName: name, email, passwordHash })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: row!.id, roleCode: role, branchId })
  return row!.id
}

async function chart(token: string) {
  const res = await inject({ method: 'GET', url: '/api/org/chart', headers: bearer(token) })
  expect(res.statusCode, res.payload).toBe(200)
  return res.json<OrgChart>()
}

const unitNamed = (c: OrgChart, name: string) => c.units.find((u) => u.name === name)
const positionIn = (c: OrgChart, unitName: string, title: string) =>
  c.positions.find((p) => p.unitId === unitNamed(c, unitName)?.id && p.title === title)

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  // Chi nhánh thứ hai, có một phục vụ chưa xếp ghế — để thử ranh giới phạm vi
  await db.insert(branches).values({ id: 'ht', name: 'Hồ Tây' })
  const [tam] = await db
    .insert(staff)
    .values({ code: 'PV09', fullName: 'Tâm' })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: tam!.id, roleCode: 'R1', branchId: 'ht' })

  await makeOfficeUser('CHU09', 'Chủ quán', 'chu@tokyosora.vn', 'R10', null)
  hrStaffId = await makeOfficeUser('NS09', 'Nhân sự Mai', 'ns@tokyosora.vn', 'R13', null)
  branchLeadId = await makeOfficeUser('QLCN09', 'Quân', 'quan@tokyosora.vn', 'R7', fx.branchId)

  // Quản lý ca Lan: CHỈ R7 (harness cho QL01 cả R10) để thấy đúng ranh giới
  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash: await hash(OFFICE_PASSWORD) })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db
    .insert(staffRoles)
    .values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  const [minh] = await db
    .insert(employees)
    .values({
      staffId: fx.waiterId,
      branchId: fx.branchId,
      position: 'Phục vụ bàn',
      payKind: 'hourly',
      hourlyRateVnd: 25_000,
      startedOn: '2026-01-05',
    })
    .returning({ id: employees.id })
  minhEmployeeId = minh!.id

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'kds',
    name: 'Màn bếp nướng',
    stationId: 'ST-06',
    tokenHash: hashToken(KDS_TOKEN),
  })

  owner = await officeLogin('chu@tokyosora.vn')
  hrManager = await officeLogin('ns@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')
}, 120_000)

afterAll(async () => {
  await close?.()
})

describe('N2 — dựng sơ đồ theo mẫu chuẩn', () => {
  it('migration đã có gốc công ty; chi nhánh tạo sau hiện ở mục "chưa có trên sơ đồ"', async () => {
    const c = await chart(owner)
    expect(c.chainWide).toBe(true)
    expect(c.canManage).toBe(true)
    expect(c.units.filter((u) => u.parentId === null)).toHaveLength(1)
    expect(c.missingBranches.map((b) => b.id).sort()).toEqual([fx.branchId, 'ht'].sort())
  })

  it('quản lý ca KHÔNG sửa được sơ đồ', async () => {
    const root = (await chart(owner)).units.find((u) => u.parentId === null)!
    const res = await inject({
      method: 'POST',
      url: '/api/org/units',
      headers: bearer(shiftLead),
      payload: { parentId: root.id, kind: 'khoi', name: 'Khối của Lan' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('quản lý nhân sự dựng khung chuỗi rồi chi nhánh — áp lần hai không nhân đôi', async () => {
    const chain = await inject({
      method: 'POST',
      url: '/api/org/apply-standard',
      headers: bearer(hrManager),
      payload: { target: 'chuoi' },
    })
    expect(chain.statusCode, chain.payload).toBe(201)
    expect(chain.json<{ unitsCreated: number }>().unitsCreated).toBeGreaterThan(3)

    const branch = await inject({
      method: 'POST',
      url: '/api/org/apply-standard',
      headers: bearer(hrManager),
      payload: { target: fx.branchId },
    })
    expect(branch.statusCode, branch.payload).toBe(201)

    const again = await inject({
      method: 'POST',
      url: '/api/org/apply-standard',
      headers: bearer(hrManager),
      payload: { target: fx.branchId },
    })
    expect(again.json()).toEqual({ unitsCreated: 0, positionsCreated: 0 })

    const c = await chart(owner)
    const ops = unitNamed(c, 'Khối vận hành')!
    const cg = c.units.find((u) => u.branchId === fx.branchId)!
    expect(cg.parentId).toBe(ops.id)
    expect(positionIn(c, 'Bếp', 'Bếp trưởng')?.isHead).toBe(true)
    expect(positionIn(c, 'Sảnh', 'Phục vụ')?.duties.length).toBeGreaterThan(0)
    // Tổ bếp nướng gắn đúng trạm ST-06 — số đo bếp quy về được tổ
    expect(unitNamed(c, 'Tổ bếp nướng')?.stationId).toBe('ST-06')
    expect(c.missingBranches.map((b) => b.id)).toEqual(['ht'])
  })

  it('không đặt được khối vào dưới chính chi nhánh con của nó', async () => {
    const c = await chart(owner)
    const ops = unitNamed(c, 'Khối vận hành')!
    const cg = c.units.find((u) => u.branchId === fx.branchId)!
    const res = await inject({
      method: 'PUT',
      url: `/api/org/units/${ops.id}`,
      headers: bearer(hrManager),
      payload: { parentId: cg.id },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('org_unit_cycle')
  })

  it('mỗi đơn vị một trưởng', async () => {
    const c = await chart(owner)
    const res = await inject({
      method: 'POST',
      url: '/api/org/positions',
      headers: bearer(hrManager),
      payload: { unitId: unitNamed(c, 'Bếp')!.id, title: 'Bếp trưởng thứ hai', isHead: true },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('position_head_exists')
  })
})

describe('N2 — gán chức danh', () => {
  it('không ai tự gán chức danh cho mình', async () => {
    const c = await chart(owner)
    const res = await inject({
      method: 'POST',
      url: '/api/org/assignments',
      headers: bearer(hrManager),
      payload: {
        staffIds: [hrStaffId],
        positionId: positionIn(c, 'Khối vận hành', 'Quản lý chuỗi')!.id,
        fromDate: day(-21),
        note: 'Tự bổ nhiệm',
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('self_assignment')
  })

  it('gán phục vụ: chữ chức danh trên hồ sơ H1 đổi theo, và H1 không sửa ngược được', async () => {
    const c = await chart(owner)
    const res = await inject({
      method: 'POST',
      url: '/api/org/assignments',
      headers: bearer(hrManager),
      payload: {
        staffIds: [fx.waiterId],
        positionId: positionIn(c, 'Sảnh', 'Phục vụ')!.id,
        fromDate: day(-21),
        note: 'Dựng sơ đồ lần đầu',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)

    const [profile] = await db.select().from(employees).where(eq(employees.id, minhEmployeeId))
    expect(profile!.position).toBe('Phục vụ')

    const h1 = await inject({
      method: 'PUT',
      url: `/api/hr/employees/${minhEmployeeId}`,
      headers: bearer(hrManager),
      payload: {
        staffId: fx.waiterId,
        branchId: fx.branchId,
        position: 'Bếp chính',
        payKind: 'hourly',
        hourlyRateVnd: 25_000,
        startedOn: '2026-01-05',
      },
    })
    expect(h1.statusCode).toBe(409)
    expect(h1.json<{ code: string }>().code).toBe('position_managed_by_org')
  })

  it('đã giữ chức chính thì phải chọn điều chuyển — chức cũ đóng đúng ngày nhận chức mới', async () => {
    const c = await chart(owner)
    const cashier = positionIn(c, 'Sảnh', 'Thu ngân')!.id
    const payload = {
      staffIds: [fx.waiterId],
      positionId: cashier,
      fromDate: day(10),
      note: 'Chuyển sang thu ngân',
    }
    const first = await inject({
      method: 'POST',
      url: '/api/org/assignments',
      headers: bearer(hrManager),
      payload,
    })
    expect(first.statusCode).toBe(409)
    expect(first.json<{ code: string }>().code).toBe('assignment_main_exists')

    const moved = await inject({
      method: 'POST',
      url: '/api/org/assignments',
      headers: bearer(hrManager),
      payload: { ...payload, replaceMain: true },
    })
    expect(moved.statusCode, moved.payload).toBe(201)

    const waiterSeat = positionIn(c, 'Sảnh', 'Phục vụ')!.id
    const history = await inject({
      method: 'GET',
      url: `/api/org/positions/${waiterSeat}/history`,
      headers: bearer(owner),
    })
    const rows = history.json<{ staffId: number; toDate: string | null }[]>()
    expect(rows.find((r) => r.staffId === fx.waiterId)?.toDate).toBe(day(10))

    // Hôm nay (trước 01/11) Minh vẫn là phục vụ; thu ngân là bổ nhiệm sắp tới
    const after = await chart(owner)
    expect(positionIn(after, 'Sảnh', 'Thu ngân')!.holders[0]?.upcoming).toBe(true)
  })

  it('kết thúc chức danh chỉ một lần', async () => {
    const c = await chart(owner)
    const seat = positionIn(c, 'Sảnh', 'Thu ngân')!
    const id = seat.holders[0]!.assignmentId
    const end = (toDate: string) =>
      inject({
        method: 'POST',
        url: `/api/org/assignments/${id}/end`,
        headers: bearer(hrManager),
        payload: { toDate, note: 'Thôi việc' },
      })
    expect((await end(day(40))).statusCode).toBe(201)
    const twice = await end(day(55))
    expect(twice.statusCode).toBe(409)
    expect(twice.json<{ code: string }>().code).toBe('assignment_not_open')
  })
})

describe('N2 — phạm vi theo cây và cấp trên trực tiếp', () => {
  it('quản lý ca chỉ nhận cây chi nhánh mình, không có nút sửa', async () => {
    const c = await chart(shiftLead)
    expect(c.chainWide).toBe(false)
    expect(c.canManage).toBe(false)
    expect(c.units.some((u) => u.branchId === fx.branchId)).toBe(true)
    expect(unitNamed(c, 'Khối văn phòng')).toBeUndefined()
    // Tâm ở Hồ Tây chưa xếp ghế — ngoài phạm vi của quản lý ca Cầu Giấy
    expect(c.unassigned.some((p) => p.fullName === 'Tâm')).toBe(false)
  })

  it('cấp trên trực tiếp của quản lý ca là người ngồi ghế trưởng chi nhánh', async () => {
    const c = await chart(owner)
    const assign = (staffId: number, unit: string, title: string) =>
      inject({
        method: 'POST',
        url: '/api/org/assignments',
        headers: bearer(hrManager),
        payload: {
          staffIds: [staffId],
          positionId: positionIn(c, unit, title)!.id,
          fromDate: day(-21),
          note: 'Dựng sơ đồ lần đầu',
        },
      })
    const cgUnit = c.units.find((u) => u.branchId === fx.branchId)!.name
    expect((await assign(branchLeadId, cgUnit, 'Quản lý chi nhánh')).statusCode).toBe(201)
    expect((await assign(fx.managerId, 'Sảnh', 'Quản lý ca')).statusCode).toBe(201)

    const me = await inject({ method: 'GET', url: '/api/org/me', headers: bearer(shiftLead) })
    expect(me.statusCode, me.payload).toBe(200)
    const body = me.json<{ positions: { title: string }[]; managers: { staffId: number }[] }>()
    expect(body.positions.map((p) => p.title)).toEqual(['Quản lý ca'])
    expect(body.managers.map((m) => m.staffId)).toEqual([branchLeadId])
  })

  it('màn bếp (thiết bị mang R4) không hỏi được "của tôi" — đó là việc của người', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/org/me',
      headers: { 'x-sora-device': KDS_TOKEN },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json<{ code: string }>().code).toBe('staff_only')
  })
})
