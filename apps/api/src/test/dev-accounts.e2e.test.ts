/**
 * Tài khoản dev của db:dev-bootstrap (`db/dev-accounts.ts`) trên API thật.
 *
 * Điều phải chứng minh: tài khoản tạo ra đăng nhập được ngay, và tài khoản ĐÃ CÓ
 * thì giữ nguyên mật khẩu, PIN lẫn vai trò. Seed cũ nạp các tài khoản này bằng
 * UPSERT — mỗi lượt chạy đặt lại mật khẩu chủ quán về một hằng công khai trong
 * repo, và lượt đó từng chạy lên production theo DEPLOY.md.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash, verify } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { DEV_OFFICE_PASSWORD, seedDevAccounts } from '../db/dev-accounts'
import { devices, staff, staffRoles } from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const DEVICE = 'dev-accounts-device'
/** Mật khẩu và PIN người thật tự đặt — lượt chạy dev không được đè */
const OWN_PASSWORD = 'mat-khau-rieng-cua-nguoi-that'
const OWN_PIN = '4826'

let firstRun: Awaited<ReturnType<typeof seedDevAccounts>>

const officeLogin = (email: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email, password },
  })

const rolesOf = (code: string) =>
  db
    .select({ roleCode: staffRoles.roleCode, branchId: staffRoles.branchId })
    .from(staffRoles)
    .innerJoin(staff, eq(staff.id, staffRoles.staffId))
    .where(eq(staff.code, code))

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'cashier',
    name: 'Máy thu ngân',
    tokenHash: hashToken(DEVICE),
  })

  // Có từ trước lượt chạy: một thu ngân thật trùng MÃ chủ quán mẫu, một kế toán
  // thật dùng đúng EMAIL kế toán mẫu, một nhân viên thật trùng mã trưởng ca mẫu
  const [cashier] = await db
    .insert(staff)
    .values({
      code: 'CHU01',
      fullName: 'Thu ngân thật',
      email: 'thu.ngan@example.vn',
      passwordHash: await hash(OWN_PASSWORD),
    })
    .returning({ id: staff.id })
  await db
    .insert(staffRoles)
    .values({ staffId: cashier!.id, roleCode: 'R2', branchId: fx.branchId })
  await db.insert(staff).values({
    code: 'KT-THAT',
    fullName: 'Kế toán thật',
    email: 'ketoan@tokyosora.vn',
    passwordHash: await hash(OWN_PASSWORD),
  })
  await db.insert(staff).values({ code: 'LAN', fullName: 'Lan thật', pinHash: await hash(OWN_PIN) })

  firstRun = await seedDevAccounts(db, fx.branchId)
}, 120_000)

afterAll(async () => {
  await close?.()
})

describe('Tài khoản dev (db:dev-bootstrap)', () => {
  it('tạo tài khoản còn thiếu, giữ nguyên tài khoản trùng mã hoặc trùng email', () => {
    expect([...firstRun.kept].sort()).toEqual(['CHU01', 'KETOAN01', 'LAN'])
    expect([...firstRun.created].sort()).toEqual([
      'CHUOI01',
      'DUC',
      'HOA',
      'MARKETING01',
      'MINH',
      'NHANSU01',
      'TUAN',
    ])
  })

  it('tài khoản Office vừa tạo đăng nhập được bằng mật khẩu dev', async () => {
    const res = await officeLogin('chuoi@tokyosora.vn', DEV_OFFICE_PASSWORD)
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().staff.roles).toEqual(['R11'])
  })

  it('nhân viên quán vừa tạo đăng nhập được bằng PIN trên máy đã ghép', async () => {
    const [hoa] = await db.select({ id: staff.id }).from(staff).where(eq(staff.code, 'HOA'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: DEVICE },
      payload: { branchId: fx.branchId, staffId: hoa!.id, pin: '1101' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().staff.roles).toEqual(['R2'])
  })

  it('không đặt lại mật khẩu của tài khoản đã có', async () => {
    expect((await officeLogin('thu.ngan@example.vn', OWN_PASSWORD)).statusCode).toBe(201)
    expect((await officeLogin('thu.ngan@example.vn', DEV_OFFICE_PASSWORD)).statusCode).toBe(401)
    expect((await officeLogin('ketoan@tokyosora.vn', DEV_OFFICE_PASSWORD)).statusCode).toBe(401)
    // Mã CHU01 đã thuộc người khác nên không có tài khoản chu@ nào được sinh ra
    expect((await officeLogin('chu@tokyosora.vn', DEV_OFFICE_PASSWORD)).statusCode).toBe(401)
  })

  it('không thêm vai trò cho tài khoản trùng mã — thu ngân không thành chủ quán', async () => {
    expect(await rolesOf('CHU01')).toEqual([{ roleCode: 'R2', branchId: fx.branchId }])
    expect(await rolesOf('LAN')).toEqual([])
  })

  it('không đặt lại PIN của nhân viên đã có', async () => {
    const [lan] = await db
      .select({ pinHash: staff.pinHash })
      .from(staff)
      .where(eq(staff.code, 'LAN'))
    expect(await verify(lan!.pinHash!, OWN_PIN)).toBe(true)
    expect(await verify(lan!.pinHash!, '1104')).toBe(false)
  })

  it('chạy lại không tạo thêm và không đổi gì', async () => {
    const again = await seedDevAccounts(db, fx.branchId)
    expect(again.created).toEqual([])
    expect(again.kept).toHaveLength(10)
  })
})
