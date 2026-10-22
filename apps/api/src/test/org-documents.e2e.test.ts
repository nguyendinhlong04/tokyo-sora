/**
 * Nghiệm thu văn bản nội bộ — N4 và hộp thư của Kênh nhân viên (N13).
 *
 * Bốn thứ phải chứng minh:
 *   1. **PIN là chữ ký.** Ký sai PIN không ra văn bản; người ký phải có quyền theo
 *      loại văn bản và phạm vi phủ hết nơi nhận; có chặn thử sai.
 *   2. **Ký xong là đóng băng** — không sửa, chỉ thu hồi; quyết định nhân sự thì
 *      cả thu hồi cũng không, sai thì ban hành quyết định khác.
 *   3. **Quyết định bổ nhiệm đổi sơ đồ ngay lúc ký**, và người được bổ nhiệm nhận
 *      chính quyết định đó.
 *   4. **Tới đúng người, đọc/xác nhận ghi một lần** — người vào sau vẫn phải xác
 *      nhận quy định còn hiệu lực.
 */
import { hash } from '@node-rs/argon2'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import {
  IDEMPOTENCY_HEADER,
  type DocumentDetail,
  type InboxCounts,
  type MyDocument,
  type OrgChart,
} from '@sora/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import { branches, devices, employees, positionAssignments, staff, staffRoles } from '../db/schema'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'
const OWNER_PIN = '2101'
const CHAIN_PIN = '2102'
const KDS_TOKEN = 'doc-test-kds-token'

let owner: string
let chainLead: string
let hrManager: string
let shiftLead: string
let marketing: string
let ownerId: number
let minhEmployeeId: number
/** Phiên Kênh nhân viên của Minh (link cá nhân + PIN) */
let minhCookie: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const cookie = (value: string) => ({ cookie: `sora_staff=${value}` })
const today = () => businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')
const yyMM = () => `${today().slice(2, 4)}${today().slice(5, 7)}`

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
  pin: string | null,
) {
  const [row] = await db
    .insert(staff)
    .values({
      code,
      fullName: name,
      email,
      passwordHash: await hash(OFFICE_PASSWORD),
      pinHash: pin ? await hash(pin) : null,
    })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({
    staffId: row!.id,
    roleCode: role,
    branchId: ['R10', 'R11', 'R13'].includes(role) ? null : fx.branchId,
  })
  return row!.id
}

async function chart(token = owner) {
  return (
    await inject({ method: 'GET', url: '/api/org/chart', headers: bearer(token) })
  ).json<OrgChart>()
}

const positionIn = (c: OrgChart, unitName: string, title: string) => {
  const unit = c.units.find((u) => u.name === unitName)
  return c.positions.find((p) => p.unitId === unit?.id && p.title === title)!
}

function draft(token: string, body: Record<string, unknown>) {
  return inject({
    method: 'POST',
    url: '/api/org/documents',
    headers: bearer(token),
    payload: {
      kind: 'thong-bao',
      title: 'Thông báo',
      body: 'Nội dung thông báo.',
      effectiveFrom: today(),
      ...body,
    },
  })
}

const sign = (token: string, id: number, pin: string, key?: string) =>
  inject({
    method: 'POST',
    url: `/api/org/documents/${id}/sign`,
    headers: { ...bearer(token), ...(key ? { [IDEMPOTENCY_HEADER]: key } : {}) },
    payload: { pin },
  })

const inbox = async (headers: Record<string, string>) =>
  (await inject({ method: 'GET', url: '/api/me/inbox', headers })).json<InboxCounts>()

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await db.insert(branches).values({ id: 'ht', name: 'Hồ Tây' })
  const [tam] = await db
    .insert(staff)
    .values({ code: 'PV09', fullName: 'Tâm' })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: tam!.id, roleCode: 'R1', branchId: 'ht' })

  ownerId = await makeOfficeUser('CHU09', 'Chủ quán', 'chu@tokyosora.vn', 'R10', OWNER_PIN)
  await makeOfficeUser('CHUOI09', 'Quản lý chuỗi', 'chuoi@tokyosora.vn', 'R11', CHAIN_PIN)
  await makeOfficeUser('NS09', 'Nhân sự Mai', 'ns@tokyosora.vn', 'R13', null)
  await makeOfficeUser('MKT09', 'Marketing', 'mkt@tokyosora.vn', 'R9', null)

  // Quản lý ca Lan: CHỈ R7, có PIN 1103 từ harness
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
      position: 'Phục vụ',
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
  chainLead = await officeLogin('chuoi@tokyosora.vn')
  hrManager = await officeLogin('ns@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')
  marketing = await officeLogin('mkt@tokyosora.vn')

  // Sơ đồ theo mẫu, Minh ngồi ghế phục vụ ở Cầu Giấy
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
  const seated = await inject({
    method: 'POST',
    url: '/api/org/assignments',
    headers: bearer(hrManager),
    payload: {
      staffIds: [fx.waiterId],
      positionId: positionIn(c, 'Sảnh', 'Phục vụ').id,
      fromDate: '2026-01-05',
      note: 'Dựng sơ đồ lần đầu',
    },
  })
  expect(seated.statusCode, seated.payload).toBe(201)

  // Minh mở Kênh nhân viên bằng link cá nhân + PIN
  const link = await inject({
    method: 'POST',
    url: `/api/hr/employees/${minhEmployeeId}/channel-link`,
    headers: bearer(hrManager),
  })
  expect(link.statusCode, link.payload).toBe(201)
  const login = await inject({
    method: 'POST',
    url: '/api/auth/channel/login',
    payload: { token: link.json<{ token: string }>().token, pin: fx.pins[fx.waiterId] },
  })
  expect(login.statusCode, login.payload).toBe(201)
  minhCookie = login.cookies.find((c) => c.name === 'sora_staff')!.value
}, 120_000)

afterAll(async () => {
  await close?.()
})

let branchNoticeId = 0

describe('N4 — thông báo chi nhánh: quản lý ca soạn và tự ký', () => {
  it('PIN sai không ra văn bản; PIN đúng cấp số và gửi đúng người trong chi nhánh', async () => {
    const created = await draft(shiftLead, {
      title: 'Lịch tổng vệ sinh thứ hai',
      targets: [{ kind: 'chi-nhanh', branchId: fx.branchId }],
      requiresAck: true,
    })
    expect(created.statusCode, created.payload).toBe(201)
    branchNoticeId = created.json<{ id: number }>().id

    const wrong = await sign(shiftLead, branchNoticeId, '9999')
    expect(wrong.statusCode).toBe(403)
    expect(wrong.json<{ code: string }>().code).toBe('pin_invalid')

    const ok = await sign(shiftLead, branchNoticeId, fx.pins[fx.managerId]!, 'ky-lich-ve-sinh')
    expect(ok.statusCode, ok.payload).toBe(201)
    expect(ok.json<{ number: string }>().number).toBe(`TB-${yyMM()}-0001`)

    // Mạng chập chờn, máy gửi lại cùng khoá: trả lại đúng kết quả cũ, không cấp số thứ hai
    const replay = await sign(shiftLead, branchNoticeId, fx.pins[fx.managerId]!, 'ky-lich-ve-sinh')
    expect(replay.statusCode, replay.payload).toBe(201)
    expect(replay.json<{ number: string }>().number).toBe(`TB-${yyMM()}-0001`)

    const detail = (
      await inject({
        method: 'GET',
        url: `/api/org/documents/${branchNoticeId}`,
        headers: bearer(shiftLead),
      })
    ).json<DocumentDetail>()
    const names = detail.pending!.map((p) => p.fullName)
    expect(names).toContain('Minh')
    expect(names).not.toContain('Tâm')
  })

  it('đã ký thì không sửa, không xoá', async () => {
    const res = await inject({
      method: 'PUT',
      url: `/api/org/documents/${branchNoticeId}`,
      headers: bearer(shiftLead),
      payload: {
        kind: 'thong-bao',
        title: 'Sửa sau khi ký',
        body: 'x',
        effectiveFrom: today(),
        targets: [{ kind: 'chi-nhanh', branchId: fx.branchId }],
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('document_not_draft')
  })

  it('quản lý ca không ký được thông báo "toàn chuỗi"', async () => {
    const created = await draft(shiftLead, {
      title: 'Gửi cả chuỗi',
      targets: [{ kind: 'toan-chuoi' }],
    })
    const res = await sign(shiftLead, created.json<{ id: number }>().id, fx.pins[fx.managerId]!)
    expect(res.statusCode).toBe(403)
    expect(res.json<{ code: string }>().code).toBe('signer_out_of_scope')
  })
})

describe('N13 — hộp thư của Minh trên Kênh nhân viên', () => {
  it('thấy văn bản chưa đọc, đọc và xác nhận — ghi một lần, gọi lại không đổi', async () => {
    expect((await inbox(cookie(minhCookie))).documents).toMatchObject({ unread: 1, toAck: 1 })

    const list = (
      await inject({ method: 'GET', url: '/api/org/me/documents', headers: cookie(minhCookie) })
    ).json<MyDocument[]>()
    expect(list.map((d) => d.id)).toContain(branchNoticeId)

    const ack = await inject({
      method: 'POST',
      url: `/api/org/me/documents/${branchNoticeId}/receipt`,
      headers: cookie(minhCookie),
      payload: { ack: true },
    })
    expect(ack.statusCode, ack.payload).toBe(201)
    const first = ack.json<{ ackedAt: string }>().ackedAt

    const again = await inject({
      method: 'POST',
      url: `/api/org/me/documents/${branchNoticeId}/receipt`,
      headers: cookie(minhCookie),
      payload: { ack: true },
    })
    expect(again.json<{ ackedAt: string }>().ackedAt).toBe(first)
    expect((await inbox(cookie(minhCookie))).documents).toMatchObject({ unread: 0, toAck: 0 })
  })

  it('link cá nhân không mở được sổ văn bản của quản lý', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/org/documents',
      headers: cookie(minhCookie),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('N4 — quyết định bổ nhiệm: nhân sự soạn, người đại diện ký', () => {
  let decisionId = 0

  it('trình cho quản lý ca thì bị từ chối — quyết định do quản lý chuỗi hoặc chủ ký', async () => {
    const c = await chart()
    const created = await draft(hrManager, {
      kind: 'quyet-dinh',
      decisionType: 'bo-nhiem',
      title: 'Bổ nhiệm thu ngân',
      targets: [{ kind: 'chi-nhanh', branchId: fx.branchId }],
      changes: [
        {
          staffId: fx.waiterId,
          positionId: positionIn(c, 'Sảnh', 'Thu ngân').id,
          assignmentKind: 'chinh',
        },
      ],
    })
    expect(created.statusCode, created.payload).toBe(201)
    decisionId = created.json<{ id: number }>().id

    const toLead = await inject({
      method: 'POST',
      url: `/api/org/documents/${decisionId}/submit`,
      headers: bearer(hrManager),
      payload: { signerId: fx.managerId },
    })
    expect(toLead.statusCode).toBe(403)
    expect(toLead.json<{ code: string }>().code).toBe('signer_not_permitted')
  })

  it('chủ ký: chức cũ đóng, chức mới mở, hồ sơ H1 đổi chữ, Minh nhận quyết định', async () => {
    const submitted = await inject({
      method: 'POST',
      url: `/api/org/documents/${decisionId}/submit`,
      headers: bearer(hrManager),
      payload: { signerId: ownerId },
    })
    expect(submitted.statusCode, submitted.payload).toBe(201)
    expect((await inbox(bearer(owner))).documents.toSign).toBe(1)

    // Gửi lại cùng một khoá: không cấp số thứ hai
    const key = 'ky-quyet-dinh-bo-nhiem-1'
    const signed = await sign(owner, decisionId, OWNER_PIN, key)
    expect(signed.statusCode, signed.payload).toBe(201)
    const replay = await sign(owner, decisionId, OWNER_PIN, key)
    expect(replay.json()).toEqual(signed.json())
    const otherKey = await sign(owner, decisionId, OWNER_PIN, 'khoa-khac')
    expect(otherKey.statusCode).toBe(409)
    expect(otherKey.json<{ code: string }>().code).toBe('document_not_pending')

    const open = await db
      .select()
      .from(positionAssignments)
      .where(and(eq(positionAssignments.staffId, fx.waiterId), isNull(positionAssignments.toDate)))
    expect(open).toHaveLength(1)
    expect(open[0]!.documentId).toBe(decisionId)

    const [profile] = await db.select().from(employees).where(eq(employees.id, minhEmployeeId))
    expect(profile!.position).toBe('Thu ngân')

    const mine = (
      await inject({ method: 'GET', url: '/api/org/me/documents', headers: cookie(minhCookie) })
    ).json<MyDocument[]>()
    expect(mine.map((d) => d.id)).toContain(decisionId)
  })

  it('quyết định nhân sự không thu hồi được — sai thì ban hành quyết định khác', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/org/documents/${decisionId}/revoke`,
      headers: bearer(owner),
      payload: { reason: 'Nhầm người' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('decision_not_revocable')
  })

  it('không ai ký quyết định nhân sự về chính mình', async () => {
    const c = await chart()
    const created = await draft(hrManager, {
      kind: 'quyet-dinh',
      decisionType: 'bo-nhiem',
      title: 'Bổ nhiệm giám đốc',
      targets: [{ kind: 'toan-chuoi' }],
      changes: [
        {
          staffId: ownerId,
          positionId: positionIn(c, 'Ban điều hành', 'Giám đốc điều hành').id,
          assignmentKind: 'chinh',
        },
      ],
    })
    const res = await inject({
      method: 'POST',
      url: `/api/org/documents/${created.json<{ id: number }>().id}/submit`,
      headers: bearer(hrManager),
      payload: { signerId: ownerId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('self_decision')
  })
})

describe('N4 — thu hồi thông báo, quy định cho người vào sau', () => {
  it('thu hồi kèm lý do thì văn bản rời hộp thư của người nhận', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/org/documents/${branchNoticeId}/revoke`,
      headers: bearer(shiftLead),
      payload: { reason: 'Đổi ngày tổng vệ sinh' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    const mine = (
      await inject({ method: 'GET', url: '/api/org/me/documents', headers: cookie(minhCookie) })
    ).json<MyDocument[]>()
    expect(mine.map((d) => d.id)).not.toContain(branchNoticeId)
  })

  it('người vào làm sau vẫn phải xác nhận quy định còn hiệu lực', async () => {
    const created = await draft(chainLead, {
      kind: 'quy-dinh',
      title: 'Quy định vệ sinh an toàn thực phẩm',
      targets: [{ kind: 'toan-chuoi' }],
      requiresAck: true,
    })
    expect((await sign(chainLead, created.json<{ id: number }>().id, CHAIN_PIN)).statusCode).toBe(
      201,
    )

    // Người mới vào SAU khi quy định được ký
    const passwordHash = await hash(OFFICE_PASSWORD)
    const [newbie] = await db
      .insert(staff)
      .values({ code: 'PV20', fullName: 'Người mới', email: 'moi@tokyosora.vn', passwordHash })
      .returning({ id: staff.id })
    await db
      .insert(staffRoles)
      .values({ staffId: newbie!.id, roleCode: 'R5', branchId: fx.branchId })
    const token = await officeLogin('moi@tokyosora.vn')
    expect((await inbox(bearer(token))).documents.toAck).toBe(1)
  })
})

describe('Ranh giới', () => {
  it('ký sai PIN quá năm lần là khoá — PIN là chữ ký, không cho dò', async () => {
    const created = await draft(chainLead, {
      title: 'Thử khoá PIN',
      targets: [{ kind: 'chi-nhanh', branchId: fx.branchId }],
    })
    const id = created.json<{ id: number }>().id
    for (let i = 0; i < 5; i++) {
      expect((await sign(chainLead, id, '0000')).json<{ code: string }>().code).toBe('pin_invalid')
    }
    const locked = await sign(chainLead, id, CHAIN_PIN)
    expect(locked.statusCode).toBe(403)
    expect(locked.payload).toContain('quá nhiều lần')
  })

  it('marketing có hộp thư của mình; màn bếp thì không', async () => {
    expect(
      (await inject({ method: 'GET', url: '/api/me/inbox', headers: bearer(marketing) }))
        .statusCode,
    ).toBe(200)
    const kds = await inject({
      method: 'GET',
      url: '/api/me/inbox',
      headers: { 'x-sora-device': KDS_TOKEN },
    })
    expect(kds.statusCode).toBe(403)
    expect(kds.json<{ code: string }>().code).toBe('staff_only')
  })
})
