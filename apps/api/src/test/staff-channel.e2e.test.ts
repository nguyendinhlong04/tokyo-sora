/**
 * Nghiệm thu Kênh nhân viên và kiosk chấm công — H8 · H9 · H10.
 *
 * Ba thứ phải chứng minh, cả ba đều là RANH GIỚI chứ không phải tính năng:
 *   1. **Link cá nhân mở đúng việc của một người.** Thu ngân Hoa vào bằng link
 *      trên điện thoại mình thì đọc được lịch, công, phiếu lương của Hoa — và
 *      KHÔNG mở nổi một cái bàn nào, dù vai trò R2 của cô cho phép mở bàn khi
 *      đứng ở máy trong quán.
 *   2. **Chấm công phải đứng ở kiosk của chi nhánh.** Cùng một người, cùng một
 *      PIN: bấm ở kiosk thì được, bấm từ điện thoại thì không.
 *   3. **Phiếu lương chỉ tồn tại sau khi chủ duyệt.** Kỳ nháp không phải phiếu.
 */
import { hash } from '@node-rs/argon2'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import {
  employees,
  payrollLines,
  payrollPeriods,
  scheduleEntries,
  staff,
  staffRoles,
  timeEntries,
} from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'
/** R10 chủ quán — người duy nhất sinh được mã ghép thiết bị (A4) */
let owner: string
/** R13 quản lý nhân sự — người cấp link cá nhân */
let hrManager: string
/** R7 quản lý ca — có lịch, có công, KHÔNG có lương */
let shiftLead: string
/** Kiosk đã ghép của chi nhánh */
let kioskToken: string

let hoaEmployeeId: number
let minhEmployeeId: number
/** Link cá nhân của Hoa, và cookie phiên mở bằng nó */
let hoaChannel: string
let hoaCookie: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const cookie = (value: string) => ({ cookie: `sora_staff=${value}` })

/** Ngày làm việc THẬT của chi nhánh — kiosk chấm theo đồng hồ, không theo hằng số */
const today = () => businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')
const shiftDay = (offset: number) => {
  const at = new Date(`${today()}T00:00:00Z`)
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

/** Mở kênh bằng link cá nhân + PIN, trả về cookie phiên */
async function channelLogin(token: string, pin: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/channel/login',
    payload: { token, pin },
  })
  return res
}

async function issueLink(employeeId: number, actor = hrManager) {
  const res = await inject({
    method: 'POST',
    url: `/api/hr/employees/${employeeId}/channel-link`,
    headers: bearer(actor),
  })
  return res
}

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  const passwordHash = await hash(OFFICE_PASSWORD)
  const [ns] = await db
    .insert(staff)
    .values({ code: 'NS02', fullName: 'Nhân sự Mai', email: 'ns@tokyosora.vn', passwordHash })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: ns!.id, roleCode: 'R13', branchId: fx.branchId })
  const [chu] = await db
    .insert(staff)
    .values({ code: 'CHU02', fullName: 'Chủ quán', email: 'chu@tokyosora.vn', passwordHash })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: chu!.id, roleCode: 'R10', branchId: null })

  // Quản lý ca Lan mượn tài khoản Office để kiểm ranh giới quyền của R7
  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db.insert(staffRoles).values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  // Hồ sơ nhân sự cho Hoa (thu ngân R2) và Minh (phục vụ R1)
  const [hoa] = await db
    .insert(employees)
    .values({
      staffId: fx.cashierId,
      branchId: fx.branchId,
      position: 'Thu ngân',
      payKind: 'hourly',
      hourlyRateVnd: 35_000,
      startedOn: '2026-01-05',
    })
    .returning({ id: employees.id })
  hoaEmployeeId = hoa!.id
  const [minh] = await db
    .insert(employees)
    .values({
      staffId: fx.waiterId,
      branchId: fx.branchId,
      position: 'Phục vụ',
      payKind: 'hourly',
      hourlyRateVnd: 30_000,
      startedOn: '2026-02-01',
    })
    .returning({ id: employees.id })
  minhEmployeeId = minh!.id

  // Ca hôm nay ĐÃ CÔNG BỐ (kiosk đối chiếu giờ vào với nó) và một ca NHÁP ngày mai
  await db.insert(scheduleEntries).values([
    {
      branchId: fx.branchId,
      employeeId: hoaEmployeeId,
      workDate: today(),
      startMinute: 15 * 60,
      endMinute: 23 * 60,
      breakMinutes: 30,
      state: 'published',
      publishedAt: new Date(),
    },
    {
      branchId: fx.branchId,
      employeeId: hoaEmployeeId,
      workDate: shiftDay(1),
      startMinute: 8 * 60,
      endMinute: 16 * 60,
      state: 'draft',
    },
  ])

  owner = await officeLogin('chu@tokyosora.vn')
  hrManager = await officeLogin('ns@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')

  // Kiosk gắn cứng chi nhánh — ghép một lần như người lắp máy làm ở quán
  const pairing = await inject({
    method: 'POST',
    url: '/api/auth/pairing-codes',
    headers: bearer(owner),
    payload: { branchId: fx.branchId, kind: 'kiosk' },
  })
  const { code } = pairing.json<{ code: string }>()
  const paired = await inject({
    method: 'POST',
    url: '/api/auth/pair',
    payload: { code, name: 'Kiosk cửa sau' },
  })
  kioskToken = paired.json<{ token: string }>().token
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------- H8

describe('H8 — vào kênh bằng link cá nhân + PIN', () => {
  it('quản lý CA không cấp được link — link mở tới phiếu lương', async () => {
    const res = await issueLink(hoaEmployeeId, shiftLead)
    expect(res.statusCode).toBe(403)
  })

  it('quản lý nhân sự cấp link, token chỉ trả về đúng một lần', async () => {
    const res = await issueLink(hoaEmployeeId)
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<{ token: string; fullName: string }>()
    expect(body.fullName).toBe('Hoa')
    expect(body.token.length).toBeGreaterThan(20)
    hoaChannel = body.token
  })

  it('link đúng mà PIN sai thì không vào được', async () => {
    const res = await channelLogin(hoaChannel, '9999')
    expect(res.statusCode).toBe(401)
  })

  it('link bịa thì dừng ngay ở cửa', async () => {
    const res = await channelLogin('khong-phai-link-that-cua-ai-ca', fx.pins[fx.cashierId]!)
    expect(res.statusCode).toBe(401)
  })

  it('link + PIN của chính mình mở được kênh', async () => {
    const res = await channelLogin(hoaChannel, fx.pins[fx.cashierId]!)
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ staff: { fullName: string } }>().staff.fullName).toBe('Hoa')
    hoaCookie = res.cookies.find((c) => c.name === 'sora_staff')!.value
    expect(hoaCookie).toBeTruthy()

    const me = await inject({ method: 'GET', url: '/api/hr/me', headers: cookie(hoaCookie) })
    expect(me.statusCode, me.payload).toBe(200)
    const profile = me.json<{ fullName: string; position: string; branchName: string }>()
    expect(profile).toMatchObject({ fullName: 'Hoa', position: 'Thu ngân', branchName: 'Cầu Giấy' })
    // Hồ sơ rút gọn KHÔNG mang đơn giá lương ra khỏi màn H1
    expect(profile).not.toHaveProperty('hourlyRateVnd')
  })

  it('cấp lại link thì link cũ chết ngay', async () => {
    const again = await issueLink(hoaEmployeeId)
    const fresh = again.json<{ token: string }>().token
    expect(fresh).not.toBe(hoaChannel)

    const old = await channelLogin(hoaChannel, fx.pins[fx.cashierId]!)
    expect(old.statusCode).toBe(401)

    const ok = await channelLogin(fresh, fx.pins[fx.cashierId]!)
    expect(ok.statusCode).toBe(201)
    hoaChannel = fresh
    hoaCookie = ok.cookies.find((c) => c.name === 'sora_staff')!.value
  })
})

describe('H8 — phiên kênh chỉ mở việc của chính mình', () => {
  it('THU NGÂN không mở nổi một cái bàn nào từ điện thoại của mình', async () => {
    // Cùng người này, cùng vai trò R2, đứng ở máy POS thì mở bàn được. Khác nhau
    // ở chỗ cái link chuyển tiếp qua Zalo được, còn máy POS thì không.
    const res = await inject({
      method: 'POST',
      url: `/api/tables/${fx.plainTableId}/open`,
      headers: cookie(hoaCookie),
      payload: { guestCount: 2 },
    })
    expect(res.statusCode).toBe(403)
    expect(res.payload).toContain('Kênh nhân viên')
  })

  it('không mở được bảng công của cả chi nhánh', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/hr/timesheet?branch=${fx.branchId}&from=${shiftDay(-7)}&to=${today()}`,
      headers: cookie(hoaCookie),
    })
    expect(res.statusCode).toBe(403)
  })

  it('không xin nghỉ hộ người khác', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/hr/leaves',
      headers: cookie(hoaCookie),
      payload: {
        branchId: fx.branchId,
        employeeId: minhEmployeeId,
        kind: 'nghi-phep',
        fromDate: shiftDay(3),
        toDate: shiftDay(3),
        reason: 'Nghỉ hộ Minh',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('xin nghỉ cho mình thì vào thẳng hàng đợi duyệt của H5', async () => {
    const sent = await inject({
      method: 'POST',
      url: '/api/hr/leaves',
      headers: cookie(hoaCookie),
      payload: {
        branchId: fx.branchId,
        employeeId: hoaEmployeeId,
        kind: 'nghi-phep',
        fromDate: shiftDay(3),
        toDate: shiftDay(3),
        reason: 'Về quê giỗ',
      },
    })
    expect(sent.statusCode, sent.payload).toBe(201)

    const queue = await inject({
      method: 'GET',
      url: `/api/hr/leaves?branch=${fx.branchId}&state=pending`,
      headers: bearer(shiftLead),
    })
    expect(queue.json<{ id: number }[]>().length).toBe(1)

    const mine = await inject({ method: 'GET', url: '/api/hr/me/leaves', headers: cookie(hoaCookie) })
    expect(mine.json<{ reason: string; state: string }[]>()[0]).toMatchObject({
      reason: 'Về quê giỗ',
      state: 'pending',
    })
  })

  it('đồng nghiệp chỉ hiện tên để chọn người nhận ca — không có gì khác', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/hr/me/colleagues',
      headers: cookie(hoaCookie),
    })
    const rows = res.json<{ employeeId: number; fullName: string }[]>()
    expect(rows).toEqual([{ employeeId: minhEmployeeId, fullName: 'Minh' }])
  })
})

describe('H8 — lịch và công của tôi', () => {
  it('chỉ thấy ca ĐÃ CÔNG BỐ; lịch nháp thì chưa phải lịch', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/hr/me/schedule?week=${today()}`,
      headers: cookie(hoaCookie),
    })
    const body = res.json<{ days: string[]; shifts: { workDate: string; startMinute: number }[] }>()
    expect(body.days.length).toBe(7)
    expect(body.shifts.length).toBe(1)
    expect(body.shifts[0]).toMatchObject({ workDate: today(), startMinute: 15 * 60 })
  })

  it('bảng công của kênh ra ĐÚNG con số quản lý thấy ở H4', async () => {
    await db.insert(timeEntries).values({
      branchId: fx.branchId,
      employeeId: minhEmployeeId,
      workDate: shiftDay(-1),
      clockIn: new Date(`${shiftDay(-1)}T01:00:00Z`),
      clockOut: new Date(`${shiftDay(-1)}T09:00:00Z`),
      breakMinutes: 30,
      source: 'kiosk',
    })
    const minhLink = (await issueLink(minhEmployeeId)).json<{ token: string }>().token
    const minhSession = await channelLogin(minhLink, fx.pins[fx.waiterId]!)
    const minhCookie = minhSession.cookies.find((c) => c.name === 'sora_staff')!.value

    const mine = await inject({
      method: 'GET',
      url: `/api/hr/me/timesheet?from=${shiftDay(-7)}&to=${today()}`,
      headers: cookie(minhCookie),
    })
    const board = await inject({
      method: 'GET',
      url: `/api/hr/timesheet?branch=${fx.branchId}&from=${shiftDay(-7)}&to=${today()}`,
      headers: bearer(shiftLead),
    })

    const mineTotal = mine.json<{ total: { worked: number } }>().total
    const boardRow = board
      .json<{ rows: { employeeId: number; total: { worked: number } }[] }>()
      .rows.find((r) => r.employeeId === minhEmployeeId)!
    expect(mineTotal.worked).toBe(450)
    expect(mineTotal).toEqual(boardRow.total)
  })
})

// ---------------------------------------------------------------------- H9

describe('H9 — phiếu lương của chính chủ', () => {
  beforeAll(async () => {
    const rows = [
      { start: '2026-06-01', end: '2026-06-30', state: 'approved' as const, net: 7_100_000 },
      { start: '2026-07-01', end: '2026-07-31', state: 'draft' as const, net: 6_800_000 },
    ]
    for (const row of rows) {
      const [period] = await db
        .insert(payrollPeriods)
        .values({
          branchId: fx.branchId,
          periodStart: row.start,
          periodEnd: row.end,
          state: row.state,
          lockedAt: row.state === 'approved' ? new Date() : null,
          submittedAt: row.state === 'approved' ? new Date() : null,
          checkedAt: row.state === 'approved' ? new Date() : null,
          approvedAt: row.state === 'approved' ? new Date() : null,
        })
        .returning({ id: payrollPeriods.id })
      await db.insert(payrollLines).values({
        periodId: period!.id,
        employeeId: hoaEmployeeId,
        nameSnapshot: 'Hoa',
        positionSnapshot: 'Thu ngân',
        payKind: 'hourly',
        rateSnapshotVnd: 35_000,
        workedMinutes: 12_480,
        basePayVnd: 7_280_000,
        grossPayVnd: 7_280_000,
        insuranceVnd: 180_000,
        netPayVnd: row.net,
      })
    }
  })

  it('kỳ NHÁP chưa phải phiếu lương — chỉ kỳ đã duyệt mới hiện', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/hr/payroll/my-payslips',
      headers: cookie(hoaCookie),
    })
    expect(res.statusCode, res.payload).toBe(200)
    const slips = res.json<{ line: { netPayVnd: number }; period: { periodStart: string } }[]>()
    expect(slips.length).toBe(1)
    expect(slips[0]!.period.periodStart).toBe('2026-06-01')
    expect(slips[0]!.line.netPayVnd).toBe(7_100_000)
  })

  it('phiếu lương của người khác thì không có đường nào tới', async () => {
    const minhLink = (await issueLink(minhEmployeeId)).json<{ token: string }>().token
    const minhCookie = (await channelLogin(minhLink, fx.pins[fx.waiterId]!)).cookies.find(
      (c) => c.name === 'sora_staff',
    )!.value

    const res = await inject({
      method: 'GET',
      url: '/api/hr/payroll/my-payslips',
      headers: cookie(minhCookie),
    })
    // Cùng một đường dẫn, không tham số nào để sửa: Minh chỉ thấy của Minh
    expect(res.json<unknown[]>()).toEqual([])
  })
})

// --------------------------------------------------------------------- H10

describe('H10 — kiosk chấm công', () => {
  /** Đăng nhập PIN TRÊN KIOSK: thiết bị là yếu tố sở hữu, PIN là yếu tố biết */
  async function kioskLogin(staffId: number, pin: string) {
    const res = await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: kioskToken },
      payload: { branchId: fx.branchId, staffId, pin },
    })
    expect(res.statusCode, res.payload).toBe(201)
    return res.json<{ token: string }>().token
  }

  const punch = (session: string) =>
    inject({
      method: 'POST',
      url: '/api/hr/punch',
      headers: { ...bearer(session), [DEVICE_HEADER]: kioskToken },
    })

  it('điện thoại cá nhân KHÔNG chấm công được — kiosk gắn chi nhánh mới chấm', async () => {
    // Chốt chặn ở đây là THIẾT BỊ, không phải quyền: chấm công vốn là việc của
    // chính mình nên nó đi qua đúng khoá `staff.view-own-record` như mọi màn khác
    // của kênh. Cái thiếu là cái máy đứng trong quán.
    const res = await inject({ method: 'POST', url: '/api/hr/punch', headers: cookie(hoaCookie) })
    expect(res.statusCode).toBe(400)
    expect(res.payload).toContain('kiosk đã ghép')
  })

  it('phiên Office cũng không chấm được — không có thiết bị nào của quán', async () => {
    const res = await inject({ method: 'POST', url: '/api/hr/punch', headers: bearer(hrManager) })
    expect(res.statusCode).toBe(400)
  })

  it('bấm lần đầu là VÀO CA, và màn chào kèm giờ lịch để biết mình muộn chưa', async () => {
    const session = await kioskLogin(fx.cashierId, fx.pins[fx.cashierId]!)
    const res = await punch(session)
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<{
      direction: string
      fullName: string
      at: string
      scheduledStartMinute: number | null
    }>()
    expect(body.direction).toBe('in')
    expect(body.fullName).toBe('Hoa')
    // "Chào Hoa · Vào ca 15:02 · lịch 15:00" — con số 15:00 lấy từ ca đã công bố
    expect(body.scheduledStartMinute).toBe(15 * 60)
    expect(new Date(body.at).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('bấm lần hai là RA CA, hệ tự biết chiều nào — không bắt chọn nút', async () => {
    // Dời giờ vào lùi một tiếng để giờ công ra con số kiểm được, thay vì phụ thuộc
    // vào khoảng cách giữa hai lượt gọi HTTP
    await db
      .update(timeEntries)
      .set({ clockIn: new Date(Date.now() - 60 * 60_000), breakMinutes: 0 })
      .where(eq(timeEntries.employeeId, hoaEmployeeId))

    const session = await kioskLogin(fx.cashierId, fx.pins[fx.cashierId]!)
    const res = await punch(session)
    expect(res.statusCode, res.payload).toBe(201)
    const body = res.json<{ direction: string; workedMinutes: number }>()
    expect(body.direction).toBe('out')
    expect(body.workedMinutes).toBeGreaterThanOrEqual(59)
    expect(body.workedMinutes).toBeLessThanOrEqual(61)
  })

  it('chấm lần thứ ba bị chặn — sửa nhầm là việc của quản lý ở bảng công', async () => {
    const session = await kioskLogin(fx.cashierId, fx.pins[fx.cashierId]!)
    const res = await punch(session)
    expect(res.statusCode).toBe(409)
    expect(res.payload).toContain('đã chấm ra')
  })

  it('giờ kiosk ghi mang nguồn "kiosk" — H4 phân biệt được với giờ gõ tay', async () => {
    const [entry] = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.employeeId, hoaEmployeeId))
    expect(entry!.source).toBe('kiosk')
    expect(entry!.editReason).toBeNull()
  })
})
