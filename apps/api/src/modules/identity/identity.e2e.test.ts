import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { branches, devices, staff, staffRoles } from '../../db/schema'
import { bootTestApp, type Fixtures } from '../../test/harness'
import { DEVICE_HEADER } from './auth.guard'
import { IdentityService } from './identity.service'
import { hashToken } from './tokens'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let identity: IdentityService
let close: () => Promise<void>

/**
 * Thiết bị "gốc" của chi nhánh. Bài toán con gà quả trứng: sinh mã ghép cần quyền
 * quản trị, mà đăng nhập lại cần thiết bị đã ghép. Ngoài đời, máy đầu tiên được
 * ghép lúc mở quán bằng bản ghi tạo trực tiếp trong CSDL — mô phỏng đúng như vậy.
 */
const SEED_DEVICE_TOKEN = 'seed-device-token'
let ownerToken: string

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close
  identity = app.get(IdentityService)

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'cashier',
    name: 'Máy thu ngân gốc',
    tokenHash: hashToken(SEED_DEVICE_TOKEN),
  })
  // Quản lý ca trong harness đã kiêm vai trò chủ (R7 + R10) nên test được cả
  // nhánh quản trị mà không phải cấp thêm quyền ở đây.

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { [DEVICE_HEADER]: SEED_DEVICE_TOKEN },
    payload: { branchId: fx.branchId, staffId: fx.managerId, pin: fx.pins[fx.managerId] },
  })
  ownerToken = res.json<{ token: string }>().token
}, 120_000)

afterAll(async () => {
  await close?.()
})

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)

async function createPairingCode(kind = 'pos', stationId: string | null = null) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/pairing-codes',
    headers: { authorization: `Bearer ${ownerToken}`, [DEVICE_HEADER]: SEED_DEVICE_TOKEN },
    payload: { branchId: fx.branchId, kind, stationId },
  })
  expect(res.statusCode).toBe(201)
  return res.json<{ code: string }>().code
}

async function pairDevice(kind = 'pos') {
  const code = await createPairingCode(kind)
  const res = await inject({
    method: 'POST',
    url: '/api/auth/pair',
    payload: { code, name: `Máy ${kind}` },
  })
  expect(res.statusCode).toBe(201)
  return res.json<{ token: string; deviceId: number }>()
}

async function loginAs(staffId: number, deviceToken: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { [DEVICE_HEADER]: deviceToken },
    payload: { branchId: fx.branchId, staffId, pin: fx.pins[staffId] },
  })
  return res
}

describe('Ghép thiết bị (K1/A4)', () => {
  it('mã ghép sai bị từ chối', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code: '000000', name: 'Máy giả' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('mã không đúng định dạng 6 số bị chặn ở tầng kiểm dữ liệu, có chỉ rõ trường sai', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code: 'abc', name: 'Máy giả' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json<{ code: string; issues: { path: string }[] }>()
    expect(body.code).toBe('validation_error')
    expect(body.issues[0]!.path).toBe('code')
  })

  it('ghép thành công và mã CHỈ DÙNG ĐƯỢC MỘT LẦN', async () => {
    const code = await createPairingCode('kds', 'ST-06')

    const first = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code, name: 'Màn bếp nướng' },
    })
    expect(first.statusCode).toBe(201)
    expect(first.json<{ token: string }>().token).toBeTruthy()

    const second = await inject({
      method: 'POST',
      url: '/api/auth/pair',
      payload: { code, name: 'Máy cướp mã' },
    })
    expect(second.statusCode).toBe(401)
  })

  it('token thiết bị trả về đúng một lần, CSDL chỉ giữ bản băm', async () => {
    const device = await pairDevice()
    const row = await db.query.devices.findFirst({
      where: (d, { eq }) => eq(d.id, device.deviceId),
    })
    expect(row!.tokenHash).toBe(hashToken(device.token))
    expect(row!.tokenHash).not.toBe(device.token)
  })
})

describe('Đăng nhập ca bằng PIN (P1)', () => {
  it('PIN đúng trên thiết bị đã ghép → có phiên, cookie httpOnly', async () => {
    const device = await pairDevice()
    const res = await loginAs(fx.cashierId, device.token)
    expect(res.statusCode).toBe(201)
    expect(res.json<{ staff: { roles: string[] } }>().staff.roles).toContain('R2')
    expect(String(res.headers['set-cookie'])).toContain('HttpOnly')
  })

  it('PIN sai bị từ chối', async () => {
    const device = await pairDevice()
    const res = await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: device.token },
      payload: { branchId: fx.branchId, staffId: fx.cashierId, pin: '9999' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('PIN đúng nhưng KHÔNG đứng ở thiết bị đã ghép thì vô dụng', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { branchId: fx.branchId, staffId: fx.cashierId, pin: fx.pins[fx.cashierId] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('thiết bị bị thu hồi từ xa (A4) thì không dùng được nữa', async () => {
    const device = await pairDevice()
    const before = await inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { [DEVICE_HEADER]: device.token },
    })
    expect(before.statusCode).toBe(200)

    await identity.revokeDevice(device.deviceId)

    const after = await inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { [DEVICE_HEADER]: device.token },
    })
    expect(after.statusCode).toBe(401)
  })
})

/**
 * Lưới này phải kể ĐÚNG những người `loginWithPin` sẽ nhận. Lệch một bên là màn
 * hình nói dối: hoặc giấu người vào ca được, hoặc mời chạm vào một ngõ cụt.
 */
describe('Lưới chọn nhân viên vào ca (P1)', () => {
  const staffAt = async (branchId: string) => {
    const res = await inject({
      method: 'GET',
      url: `/api/auth/staff?branchId=${branchId}`,
      headers: { [DEVICE_HEADER]: SEED_DEVICE_TOKEN },
    })
    expect(res.statusCode).toBe(200)
    return res.json<{ id: number; fullName: string; roles: string[] }[]>()
  }

  it('người giữ vai trò TOÀN CHUỖI hiện ở mọi chi nhánh', async () => {
    const [row] = await db
      .insert(staff)
      .values({ code: 'CHUOI-T1', fullName: 'Quản lý chuỗi', pinHash: await hash('4411') })
      .returning({ id: staff.id })
    await db.insert(staffRoles).values({ staffId: row!.id, roleCode: 'R11', branchId: null })

    const found = (await staffAt(fx.branchId)).find((p) => p.id === row!.id)
    expect(found).toBeDefined()
    expect(found!.roles).toEqual(['R11'])
  })

  it('cùng một vai trò gán cả ở chi nhánh lẫn toàn chuỗi chỉ kể một lần', async () => {
    const [row] = await db
      .insert(staff)
      .values({ code: 'KIEM-T2', fullName: 'Kiêm hai phạm vi', pinHash: await hash('4412') })
      .returning({ id: staff.id })
    await db.insert(staffRoles).values([
      { staffId: row!.id, roleCode: 'R2', branchId: null },
      { staffId: row!.id, roleCode: 'R2', branchId: fx.branchId },
    ])

    const found = (await staffAt(fx.branchId)).find((p) => p.id === row!.id)
    expect(found!.roles).toEqual(['R2'])
  })

  it('người CHƯA đặt PIN không hiện — chạm vào ô của họ là ngõ cụt', async () => {
    const [row] = await db
      .insert(staff)
      .values({ code: 'KETOAN-T3', fullName: 'Kế toán chỉ có mật khẩu', pinHash: null })
      .returning({ id: staff.id })
    await db.insert(staffRoles).values({ staffId: row!.id, roleCode: 'R8', branchId: fx.branchId })

    expect((await staffAt(fx.branchId)).some((p) => p.id === row!.id)).toBe(false)
  })

  it('người của chi nhánh KHÁC không lọt sang', async () => {
    await db.insert(branches).values({ id: 'zz', name: 'Chi nhánh khác' })
    const [row] = await db
      .insert(staff)
      .values({ code: 'KHAC-T4', fullName: 'Người chi nhánh khác', pinHash: await hash('4413') })
      .returning({ id: staff.id })
    await db.insert(staffRoles).values({ staffId: row!.id, roleCode: 'R1', branchId: 'zz' })

    expect((await staffAt(fx.branchId)).some((p) => p.id === row!.id)).toBe(false)
    expect((await staffAt('zz')).some((p) => p.id === row!.id)).toBe(true)
  })
})

describe('Phân quyền theo ma trận §4.2', () => {
  it('phục vụ (R1) không sinh được mã ghép thiết bị', async () => {
    const device = await pairDevice()
    const token = (await loginAs(fx.waiterId, device.token)).json<{ token: string }>().token

    const res = await inject({
      method: 'POST',
      url: '/api/auth/pairing-codes',
      headers: { authorization: `Bearer ${token}`, [DEVICE_HEADER]: device.token },
      payload: { branchId: fx.branchId, kind: 'pos' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('không có danh tính thì route nghiệp vụ trả 401', async () => {
    const res = await inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('route health vẫn mở để giám sát gọi được', async () => {
    const res = await inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ ok: boolean }>().ok).toBe(true)
  })
})

describe('Đăng xuất', () => {
  it('phiên đã đăng xuất không dùng lại được', async () => {
    const device = await pairDevice()
    const token = (await loginAs(fx.chefId, device.token)).json<{ token: string }>().token

    await inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    })

    const res = await inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
  })
})
