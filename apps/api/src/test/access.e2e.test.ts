/**
 * Nghiệm thu nhóm A quản trị — A1 · A2 · A4 · A5 · A7 · A8 · A9.
 *
 * Điều phải chứng minh không phải là "lưu được vào bảng". Bảy màn này là chỗ hệ
 * thống tự bảo vệ mình, nên thứ đáng kiểm là những lần nó TỪ CHỐI:
 *   — không ai khoá được tài khoản quản trị cuối cùng (A1)
 *   — ngắt thiết bị là phiên trên máy đó chết theo, không sống thêm 12 tiếng (A4)
 *   — máy in tem không lưu được nếu chưa gán trạm (A5)
 *   — nhật ký ghi lại chính những lần từ chối và chấp nhận đó (A7)
 *   — bật hoá đơn điện tử khi chưa khai đủ thì không bật được (A9)
 *   — và bài viết chưa bật thì website không đọc thấy (A8)
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { devices, staff, staffRoles, staffSessions } from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OWNER_EMAIL = 'chu@tokyosora.vn'
const OWNER_PASSWORD = 'sora-dev-2026'
const MARKETING_EMAIL = 'marketing@tokyosora.vn'
const SEED_DEVICE = 'seed-device-token'

let owner: string
let marketing: string
/** R7 quản lý ca — có `audit.view-log`, KHÔNG có `admin.manage-accounts-roles` */
let manager: string
let ownerId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const asOwner = () => ({ authorization: `Bearer ${owner}` })
const asMarketing = () => ({ authorization: `Bearer ${marketing}` })
const asManager = () => ({ authorization: `Bearer ${manager}` })

async function makeOfficeAccount(code: string, email: string, roles: string[]) {
  const [person] = await db
    .insert(staff)
    .values({ code, fullName: code, email, passwordHash: await hash(OWNER_PASSWORD) })
    .returning({ id: staff.id })
  for (const roleCode of roles) {
    await db.insert(staffRoles).values({ staffId: person!.id, roleCode, branchId: null })
  }
  const login = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email, password: OWNER_PASSWORD },
  })
  expect(login.statusCode, login.payload).toBe(201)
  return { id: person!.id, token: login.json().token as string }
}

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'cashier',
    name: 'Máy thu ngân gốc',
    tokenHash: hashToken(SEED_DEVICE),
  })

  const chu = await makeOfficeAccount('CHU01', OWNER_EMAIL, ['R10'])
  ownerId = chu.id
  owner = chu.token
  marketing = (await makeOfficeAccount('MKT01', MARKETING_EMAIL, ['R9'])).token
  manager = (await makeOfficeAccount('QL99', 'quanly@tokyosora.vn', ['R7'])).token
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ===========================================================================

describe('A1 — Tài khoản', () => {
  let newAccountId = 0

  it('không lập được tài khoản thiếu cách đăng nhập', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/accounts',
      headers: asOwner(),
      payload: {
        code: 'PV90',
        fullName: 'Không vào được',
        roles: [{ roleCode: 'R1', branchId: fx.branchId }],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('ít nhất một cách đăng nhập')
  })

  it('không lập được tài khoản không có vai trò — đăng nhập sẽ bị từ chối ngay', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/accounts',
      headers: asOwner(),
      payload: { code: 'PV91', fullName: 'Không vai trò', pin: '2468', roles: [] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('ít nhất một vai trò')
  })

  it('lập tài khoản PIN rồi đăng nhập được ngay ở POS', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/accounts',
      headers: asOwner(),
      payload: {
        code: 'PV92',
        fullName: 'Người mới',
        pin: '2468',
        roles: [{ roleCode: 'R1', branchId: fx.branchId }],
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json()).toMatchObject({ hasPin: true, hasPassword: false, active: true })
    newAccountId = res.json().id

    const login = await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
      payload: { branchId: fx.branchId, staffId: newAccountId, pin: '2468' },
    })
    expect(login.statusCode, login.payload).toBe(201)
  })

  it('PIN toàn một chữ số bị chặn', async () => {
    const res = await inject({
      method: 'PUT',
      url: `/api/admin/accounts/${newAccountId}/pin`,
      headers: asOwner(),
      payload: { value: '1111' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('đổi PIN thì phiên đang mở của người đó chết theo', async () => {
    const login = await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
      payload: { branchId: fx.branchId, staffId: newAccountId, pin: '2468' },
    })
    const token = login.json().token as string

    const before = await inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}`, [DEVICE_HEADER]: SEED_DEVICE },
    })
    expect(before.statusCode).toBe(200)

    const reset = await inject({
      method: 'PUT',
      url: `/api/admin/accounts/${newAccountId}/pin`,
      headers: asOwner(),
      payload: { value: '3579' },
    })
    expect(reset.statusCode).toBe(200)

    // Phiên cũ chỉ còn là danh tính thiết bị — không còn vai trò nhân viên
    const after = await inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}`, [DEVICE_HEADER]: SEED_DEVICE },
    })
    expect(after.json().kind).toBe('device')
  })

  it('mã nhân viên trùng thì nói rõ trùng cái gì, không trả 500', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/accounts',
      headers: asOwner(),
      payload: {
        code: 'PV92',
        fullName: 'Trùng mã',
        pin: '2469',
        roles: [{ roleCode: 'R1', branchId: fx.branchId }],
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('Mã nhân viên')
  })

  it('không khoá được tài khoản Chủ / Admin cuối cùng', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/accounts/${ownerId}`,
      headers: asOwner(),
      payload: { active: false },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('cuối cùng')
  })

  it('cũng không rút được vai trò R10 của tài khoản quản trị cuối cùng', async () => {
    const res = await inject({
      method: 'PUT',
      url: `/api/admin/accounts/${ownerId}/roles`,
      headers: asOwner(),
      payload: { roles: [{ roleCode: 'R8', branchId: null }] },
    })
    expect(res.statusCode).toBe(409)
  })

  it('có tài khoản R10 thứ hai thì khoá được cái thứ nhất', async () => {
    const second = await inject({
      method: 'POST',
      url: '/api/admin/accounts',
      headers: asOwner(),
      payload: {
        code: 'CHU02',
        fullName: 'Chủ dự phòng',
        email: 'chu2@tokyosora.vn',
        password: 'sora-dev-2026',
        roles: [{ roleCode: 'R10', branchId: null }],
      },
    })
    expect(second.statusCode, second.payload).toBe(201)

    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/accounts/${ownerId}`,
      headers: asOwner(),
      payload: { active: false },
    })
    expect(res.statusCode).toBe(200)

    // Trả lại trạng thái cũ cho các bộ test sau — phiên của owner đã bị cắt
    await db.update(staff).set({ active: true }).where(eq(staff.id, ownerId))
    await db.update(staffSessions).set({ revokedAt: null }).where(eq(staffSessions.staffId, ownerId))
  })

  it('marketing không mở được màn tài khoản', async () => {
    const res = await inject({ method: 'GET', url: '/api/admin/accounts', headers: asMarketing() })
    expect(res.statusCode).toBe(403)
  })
})

describe('A2 — Vai trò & quyền', () => {
  it('nói được ai đang giữ vai trò nào, tách phạm vi chuỗi khỏi phạm vi chi nhánh', async () => {
    const res = await inject({ method: 'GET', url: '/api/admin/roles', headers: asOwner() })
    expect(res.statusCode).toBe(200)

    const body = res.json()
    const owner = body.roles.find((r: { code: string }) => r.code === 'R10')
    expect(owner.chainWide.some((h: { fullName: string }) => h.fullName === 'CHU01')).toBe(true)

    const waiter = body.roles.find((r: { code: string }) => r.code === 'R1')
    expect(waiter.byBranch[fx.branchId].length).toBeGreaterThan(0)
    expect(waiter.chainWide).toHaveLength(0)
  })
})

describe('A4 — Thiết bị', () => {
  let pairedId = 0
  let staffToken = ''

  it('ghép máy mới qua mã 6 số, và mã chỉ dùng được một lần', async () => {
    const code = await inject({
      method: 'POST',
      url: '/api/auth/pairing-codes',
      headers: asOwner(),
      payload: { branchId: fx.branchId, kind: 'pos' },
    })
    expect(code.statusCode, code.payload).toBe(201)

    const paired = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code: code.json().code, name: 'Tablet bàn 12' },
    })
    expect(paired.statusCode).toBe(201)
    pairedId = paired.json().deviceId

    const again = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code: code.json().code, name: 'Máy chép trộm' },
    })
    expect(again.statusCode).toBe(401)

    const deviceToken = paired.json().token as string
    const login = await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: deviceToken },
      payload: { branchId: fx.branchId, staffId: fx.waiterId, pin: fx.pins[fx.waiterId] },
    })
    expect(login.statusCode, login.payload).toBe(201)
    staffToken = login.json().token
  })

  it('danh sách nói rõ ai đang đăng nhập trên từng máy', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/admin/devices?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(200)
    const row = res.json().devices.find((d: { id: number }) => d.id === pairedId)
    expect(row.signedIn).toContain('Minh')
  })

  it('NGẮT TỪ XA cắt luôn phiên nhân viên đang mở trên máy đó', async () => {
    const before = await inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${staffToken}` },
    })
    expect(before.json().kind).toBe('staff')

    const res = await inject({
      method: 'DELETE',
      url: `/api/admin/devices/${pairedId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().sessionsKilled).toBe(1)

    // Không còn danh tính nào: token phiên chết, token thiết bị cũng chết
    const after = await inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${staffToken}` },
    })
    expect(after.statusCode).toBe(401)
  })

  it('ngắt hai lần thì lần sau nói rõ đã ngắt rồi', async () => {
    const res = await inject({
      method: 'DELETE',
      url: `/api/admin/devices/${pairedId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(409)
  })

  it('máy đã ngắt vẫn còn trên danh sách để tra lại', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/admin/devices?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const row = res.json().devices.find((d: { id: number }) => d.id === pairedId)
    expect(row.revokedAt).not.toBeNull()
  })
})

describe('A5 — Máy in', () => {
  let billId = 0

  it('máy in tem phải gán trạm', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/printers',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        name: 'Tem không trạm',
        kind: 'tem',
        stationId: null,
        host: '10.0.0.30',
        template: 'tem-40x30',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('gán trạm')
  })

  it('mẫu in phải hợp với loại máy', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/printers',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        name: 'Bill khổ tem',
        kind: 'bill',
        stationId: null,
        host: '10.0.0.31',
        template: 'tem-40x30',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('không dùng được')
  })

  it('lưu được máy in bill và máy in tem đúng chuẩn', async () => {
    const bill = await inject({
      method: 'POST',
      url: '/api/admin/printers',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        name: 'Quầy thu ngân',
        kind: 'bill',
        stationId: null,
        host: '10.0.0.21',
        template: 'k80-bill',
      },
    })
    expect(bill.statusCode, bill.payload).toBe(201)
    billId = bill.json().id

    const tem = await inject({
      method: 'POST',
      url: '/api/admin/printers',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        name: 'Tem đóng gói',
        kind: 'tem',
        stationId: 'ST-01',
        host: '10.0.0.22',
        template: 'tem-40x30',
      },
    })
    expect(tem.statusCode, tem.payload).toBe(201)
    expect(tem.json().stationName).toBe('Khai vị lạnh')
  })

  it('trùng tên trong cùng chi nhánh thì nói rõ trùng', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/printers',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        name: 'Quầy thu ngân',
        kind: 'bill',
        stationId: null,
        host: '10.0.0.29',
        template: 'k80-bill',
      },
    })
    expect(res.statusCode).toBe(409)
  })

  it('máy in ĐANG BẬT đi theo bundle cấu hình xuống cầu in', async () => {
    const published = await inject({
      method: 'POST',
      url: `/api/office/config/publish?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(published.statusCode, published.payload).toBe(201)

    const bundle = await inject({
      method: 'GET',
      url: `/api/config?branch=${fx.branchId}`,
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
    })
    expect(bundle.statusCode).toBe(200)
    const names = bundle.json().printers.map((p: { name: string }) => p.name)
    expect(names).toContain('Quầy thu ngân')
    expect(names).toContain('Tem đóng gói')
  })

  it('tắt máy in thì bundle mới không còn nó nữa', async () => {
    const off = await inject({
      method: 'PATCH',
      url: `/api/admin/printers/${billId}`,
      headers: asOwner(),
      payload: { active: false },
    })
    expect(off.statusCode).toBe(200)

    await inject({
      method: 'POST',
      url: `/api/office/config/publish?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const bundle = await inject({
      method: 'GET',
      url: `/api/config?branch=${fx.branchId}`,
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
    })
    const names = bundle.json().printers.map((p: { name: string }) => p.name)
    expect(names).not.toContain('Quầy thu ngân')
  })
})

describe('A9 — Hoá đơn điện tử', () => {
  it('không bật được khi chưa khai mã số thuế và ký hiệu', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/einvoice',
      headers: asOwner(),
      payload: { branchId: fx.branchId, enabled: true },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('Chưa đủ để bật')
  })

  it('ký hiệu thiếu chữ M bị chặn ngay lúc khai, không đợi tới lúc phát hành', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/einvoice',
      headers: asOwner(),
      payload: { branchId: fx.branchId, serial: 'C26AAA' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('chữ M')
  })

  it('mã số thuế sai dạng bị chặn', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/einvoice',
      headers: asOwner(),
      payload: { branchId: fx.branchId, taxCode: '123' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('khai đủ rồi thì bật được, và mã số thuế là của cả chuỗi', async () => {
    const chain = await inject({
      method: 'PUT',
      url: '/api/admin/einvoice',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        taxCode: '0101234567',
        provider: 'Viettel',
        certificateSerial: 'CT-2026-001',
        certificateExpiry: '2027-01-01',
      },
    })
    expect(chain.statusCode, chain.payload).toBe(200)

    const serial = await inject({
      method: 'PUT',
      url: '/api/admin/einvoice',
      headers: asOwner(),
      // Chữ thường vào, chữ hoa ra — chuẩn hoá ngay lúc khai
      payload: { branchId: fx.branchId, serial: 'c26maa' },
    })
    expect(serial.json().branch.serial).toBe('C26MAA')

    const on = await inject({
      method: 'PUT',
      url: '/api/admin/einvoice',
      headers: asOwner(),
      payload: { branchId: fx.branchId, enabled: true },
    })
    expect(on.statusCode).toBe(200)
    expect(on.json().branch.enabled).toBe(true)
    expect(on.json().chain.taxCode).toBe('0101234567')
    expect(on.json().certificateDaysLeft).toBeGreaterThan(0)
  })

  it('ký hiệu khai ở A9 chính là ký hiệu miền kế toán đọc lúc phát hành', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/invoices?branch=${fx.branchId}&from=${today}&to=${today}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().serial).toBe('C26MAA')
  })
})

describe('A8 — CMS website', () => {
  let postId = 0

  it('marketing sửa được nội dung website', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/cms/posts',
      headers: asMarketing(),
      payload: {
        title: 'Chúng tôi đổi sang than hoa Bình Định',
        category: 'Bếp',
        excerpt: 'Ba tháng thử mười hai loại than.',
        publishedOn: '2026-07-12',
        published: false,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    postId = res.json().id
  })

  it('bài chưa bật thì website không đọc thấy', async () => {
    const res = await inject({ method: 'GET', url: '/api/site/posts' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)
  })

  it('bật rồi thì hiện ra ngay', async () => {
    await inject({
      method: 'PATCH',
      url: `/api/admin/cms/posts/${postId}`,
      headers: asMarketing(),
      payload: { published: true },
    })
    const res = await inject({ method: 'GET', url: '/api/site/posts' })
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0].title).toContain('than hoa Bình Định')
  })

  it('bài hẹn ngày tương lai thì chưa lọt ra web', async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const created = await inject({
      method: 'POST',
      url: '/api/admin/cms/posts',
      headers: asMarketing(),
      payload: { title: 'Bài hẹn giờ', category: 'Sự kiện', publishedOn: future, published: true },
    })
    expect(created.statusCode).toBe(201)

    const res = await inject({ method: 'GET', url: '/api/site/posts' })
    expect(res.json().map((p: { title: string }) => p.title)).not.toContain('Bài hẹn giờ')
  })

  it('tin tuyển dụng cả chuỗi để trống chi nhánh', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/admin/cms/jobs',
      headers: asMarketing(),
      payload: {
        title: 'Phục vụ bàn',
        branchId: null,
        employment: 'Toàn thời gian · ca tối',
        slots: 6,
        published: true,
      },
    })
    expect(created.statusCode, created.payload).toBe(201)

    const res = await inject({ method: 'GET', url: '/api/site/jobs' })
    expect(res.json()[0]).toMatchObject({ title: 'Phục vụ bàn', branchName: null, slots: 6 })
  })

  it('marketing KHÔNG chạm được vào giá món hay chi nhánh', async () => {
    const dishes = await inject({
      method: 'GET',
      url: `/api/admin/dishes?branch=${fx.branchId}`,
      headers: asMarketing(),
    })
    expect(dishes.statusCode).toBe(403)

    const branch = await inject({
      method: 'PATCH',
      url: `/api/admin/branches/${fx.branchId}`,
      headers: asMarketing(),
      payload: { name: 'Đổi tên chơi' },
    })
    expect(branch.statusCode).toBe(403)
  })
})

describe('A7 — Nhật ký thao tác', () => {
  it('ghi lại đúng những việc vừa làm ở các màn trên', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await inject({
      method: 'GET',
      url: `/api/admin/audit?from=${today}&to=${today}&branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)

    const actions = res.json().rows.map((r: { action: string }) => r.action)
    expect(actions).toContain('account.created')
    expect(actions).toContain('device.revoked')
    expect(actions).toContain('printer.created')
    expect(actions).toContain('einvoice.configured')
  })

  it('mới nhất đứng trước và có tên người thao tác', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await inject({
      method: 'GET',
      url: `/api/admin/audit?from=${today}&to=${today}&action=printer.created`,
      headers: asOwner(),
    })
    const rows = res.json().rows
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].actorName).toBe('CHU01')
    expect(rows[0].id).toBeGreaterThan(rows.at(-1).id)
  })

  it('lọc theo người thao tác chỉ trả về việc của người đó', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await inject({
      method: 'GET',
      url: `/api/admin/audit?from=${today}&to=${today}&actor=${ownerId}`,
      headers: asOwner(),
    })
    expect(res.json().rows.every((r: { actorId: string }) => r.actorId === String(ownerId))).toBe(true)
  })

  it('phân trang bằng con trỏ, không lặp lại dòng đã đọc', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const first = await inject({
      method: 'GET',
      url: `/api/admin/audit?from=${today}&to=${today}&limit=3`,
      headers: asOwner(),
    })
    expect(first.json().rows).toHaveLength(3)
    expect(first.json().nextBefore).not.toBeNull()

    const second = await inject({
      method: 'GET',
      url: `/api/admin/audit?from=${today}&to=${today}&limit=3&before=${first.json().nextBefore}`,
      headers: asOwner(),
    })
    const firstIds = first.json().rows.map((r: { id: number }) => r.id)
    const secondIds = second.json().rows.map((r: { id: number }) => r.id)
    expect(secondIds.some((id: number) => firstIds.includes(id))).toBe(false)
  })

  it('quản lý ca đọc được nhật ký nhưng không mở được màn tài khoản', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const log = await inject({
      method: 'GET',
      url: `/api/admin/audit?from=${today}&to=${today}`,
      headers: asManager(),
    })
    expect(log.statusCode).toBe(200)

    const accounts = await inject({ method: 'GET', url: '/api/admin/accounts', headers: asManager() })
    expect(accounts.statusCode).toBe(403)
  })

  it('ô lọc chỉ liệt kê hành động có thật trong khoảng đang xem', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await inject({
      method: 'GET',
      url: `/api/admin/audit/filters?from=${today}&to=${today}`,
      headers: asOwner(),
    })
    expect(res.json().actions).toContain('printer.created')
    expect(res.json().actors.some((a: { fullName: string }) => a.fullName === 'CHU01')).toBe(true)
  })
})
