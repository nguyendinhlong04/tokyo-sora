/**
 * Nghiệm thu Sora Office — quản trị cấu hình (A6 · A10 · A3).
 *
 * Điều phải chứng minh không phải là "lưu được vào bảng", mà là **engine đọc con
 * số mới ngay**: đổi tham số thì khung giờ đơn online đổi theo, sửa giờ mở cửa
 * thì lưới đặt bàn đổi theo, thêm bàn thì sức chứa đặt bàn đổi theo. Trước khi có
 * ba màn này, mọi con số đó chỉ đổi được bằng cách sửa seeder rồi chạy lại.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import { branches, devices, parameters, reservations, staff, staffRoles } from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const SEED_DEVICE = 'seed-device-token'
const OFFICE_EMAIL = 'chu@tokyosora.vn'
const OFFICE_PASSWORD = 'sora-dev-2026'
const HANOI = 'Asia/Ho_Chi_Minh'
const TOMORROW = businessDateOf(new Date(Date.now() + 86_400_000), HANOI)

/** Phiên Office (R10, không thiết bị) và phiên phục vụ (R1, có thiết bị) */
let owner: string
let waiter: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const asOwner = () => ({ authorization: `Bearer ${owner}` })
const asWaiter = () => ({ authorization: `Bearer ${waiter}`, [DEVICE_HEADER]: SEED_DEVICE })

const availability = (guests = 2, seat = 'grill') =>
  inject({
    method: 'GET',
    url: `/api/reservations/availability?branch=${fx.branchId}&date=${TOMORROW}&guests=${guests}&seat=${seat}`,
  }).then((r) => r.json())

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
  await db
    .update(branches)
    .set({ openHours: { raw: '17:00–23:00' } })
    .where(eq(branches.id, fx.branchId))

  // Tài khoản Office: vai trò cấp chuỗi (branch_id NULL), đăng nhập bằng email
  const [person] = await db
    .insert(staff)
    .values({
      code: 'CHU01',
      fullName: 'Chủ quán',
      email: OFFICE_EMAIL,
      passwordHash: await hash(OFFICE_PASSWORD),
    })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: person!.id, roleCode: 'R10', branchId: null })

  const login = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email: OFFICE_EMAIL, password: OFFICE_PASSWORD },
  })
  expect(login.statusCode, login.payload).toBe(201)
  owner = login.json().token

  const pin = await inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { [DEVICE_HEADER]: SEED_DEVICE },
    payload: { branchId: fx.branchId, staffId: fx.waiterId, pin: fx.pins[fx.waiterId] },
  })
  waiter = pin.json().token
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('Đăng nhập Office', () => {
  it('mở được phiên mà không cần thiết bị ghép', async () => {
    const res = await inject({ method: 'GET', url: '/api/auth/me', headers: asOwner() })
    expect(res.statusCode).toBe(200)
    expect(res.json().roles).toContain('R10')
  })

  it('sai mật khẩu thì không nói là email có tồn tại hay không', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/auth/office/login',
      payload: { branchId: fx.branchId, email: OFFICE_EMAIL, password: 'sai-mat-khau' },
    })
    expect(res.statusCode).toBe(401)

    const unknown = await inject({
      method: 'POST',
      url: '/api/auth/office/login',
      payload: { branchId: fx.branchId, email: 'ai-do@tokyosora.vn', password: 'sai-mat-khau' },
    })
    expect(unknown.statusCode).toBe(401)
    expect(unknown.json().message).toBe(res.json().message)
  })

  it('vai trò không phải quản trị thì không vào được màn cấu hình', async () => {
    const res = await inject({ method: 'GET', url: '/api/admin/parameters', headers: asWaiter() })
    expect(res.statusCode).toBe(403)
  })
})

describe('A6 — Trung tâm tham số', () => {
  it('liệt kê giá trị cấp chuỗi và giá trị engine đang thật sự đọc', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/admin/parameters?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(200)
    const lead = res.json().find((p: { key: string }) => p.key === 'online.leadMinutes')
    expect(lead.scope).toBe('chain')
    expect(lead.effectiveValue).toBe(15)
  })

  it('đổi tham số thì engine đọc số mới ngay, không cần khởi động lại', async () => {
    const before = await inject({ method: 'GET', url: `/api/online/slots?branch=${fx.branchId}` })
    expect(before.json().slots.some((s: { open: boolean }) => s.open)).toBe(true)

    const res = await inject({
      method: 'PUT',
      url: '/api/admin/parameters/online.leadMinutes',
      headers: asOwner(),
      payload: { value: 24 * 60, branchId: fx.branchId },
    })
    expect(res.statusCode).toBe(200)

    // Bếp cần 24 giờ chuẩn bị ⇒ hôm nay không còn khung nào nhận đơn
    const after = await inject({ method: 'GET', url: `/api/online/slots?branch=${fx.branchId}` })
    expect(after.json().slots.every((s: { open: boolean }) => !s.open)).toBe(true)
  })

  it('ghi đè của chi nhánh hiện tách khỏi mặc định chuỗi, và bỏ được', async () => {
    const list = await inject({
      method: 'GET',
      url: `/api/admin/parameters?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const lead = list.json().find((p: { key: string }) => p.key === 'online.leadMinutes')
    expect(lead.scope).toBe('branch')
    expect(lead.chainValue).toBe(15)
    expect(lead.effectiveValue).toBe(1440)

    const cleared = await inject({
      method: 'DELETE',
      url: `/api/admin/parameters/online.leadMinutes?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(cleared.statusCode).toBe(200)

    const after = await inject({ method: 'GET', url: `/api/online/slots?branch=${fx.branchId}` })
    expect(after.json().slots.some((s: { open: boolean }) => s.open)).toBe(true)
  })

  it('lịch sử đổi ghi lại ai đổi từ số nào sang số nào', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/admin/parameters/online.leadMinutes/history',
      headers: asOwner(),
    })
    expect(res.json()[0]).toMatchObject({ newValue: 1440, changedBy: 'Chủ quán' })
  })

  it('gõ chữ vào tham số kiểu số thì bị chặn ngay', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/parameters/online.leadMinutes',
      headers: asOwner(),
      payload: { value: 'ba mươi phút', branchId: null },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('kiểu số')
  })
})

describe('A10 — Chi nhánh', () => {
  it('giờ mở cửa sai định dạng bị chặn, vì lưới đặt bàn đọc chính chuỗi đó', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/branches/${fx.branchId}`,
      headers: asOwner(),
      payload: { openHours: 'tối nào cũng mở' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('11:00–14:00')
  })

  it('sửa giờ mở cửa là lưới đặt bàn đổi theo', async () => {
    const before = await availability()
    expect(before.slots[0].label).toBe('17:00')

    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/branches/${fx.branchId}`,
      headers: asOwner(),
      payload: { openHours: '11:00–14:00 · 17:00–23:00' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().openHours).toBe('11:00–14:00 · 17:00–23:00')

    const after = await availability()
    expect(after.slots[0].label).toBe('11:00')
  })
})

describe('A3 — Sơ đồ bàn', () => {
  let areaId: number
  let tableId: number

  it('thêm khu và bàn, sức chứa đặt bàn tăng theo', async () => {
    const before = await availability(6, 'private')
    expect(before.capacity).toBe(0)

    const area = await inject({
      method: 'POST',
      url: '/api/admin/areas',
      headers: asOwner(),
      payload: { branchId: fx.branchId, name: 'Phòng riêng' },
    })
    expect(area.statusCode).toBe(201)
    areaId = area.json().id

    const table = await inject({
      method: 'POST',
      url: '/api/admin/tables',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        areaId,
        code: 'P1',
        kind: 'private',
        hasGrill: true,
        grillType: 'than',
        seatMin: 4,
        seatMax: 8,
        active: true,
      },
    })
    expect(table.statusCode, table.payload).toBe(201)
    tableId = table.json().id

    const after = await availability(6, 'private')
    expect(after.capacity).toBe(1)
    expect(after.slots.some((s: { open: boolean }) => s.open)).toBe(true)
  })

  it('bàn khai có bếp mà không nói loại bếp thì bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/tables',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        areaId,
        code: 'P2',
        kind: 'private',
        hasGrill: true,
        grillType: null,
        seatMin: 2,
        seatMax: 6,
        active: true,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('loại bếp')
  })

  it('trùng số bàn trong cùng chi nhánh thì báo rõ', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/tables',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        areaId,
        code: 'P1',
        kind: 'private',
        hasGrill: false,
        grillType: null,
        seatMin: 2,
        seatMax: 6,
        active: true,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('P1')
  })

  it('ngừng dùng bàn đang giữ cho khách thì bị chặn, kèm tên khách', async () => {
    const slotAt = new Date(Date.now() + 3 * 3_600_000)
    await db.insert(reservations).values({
      displayCode: 'DB-A3-001',
      branchId: fx.branchId,
      seatKind: 'private',
      guestCount: 6,
      slotAt,
      endAt: new Date(slotAt.getTime() + 135 * 60_000),
      status: 'confirmed',
      customerName: 'Công ty FPT',
      customerPhone: '024 7300 8866',
      tableId,
      source: 'phone',
      businessDate: businessDateOf(slotAt, HANOI),
    })

    const res = await inject({
      method: 'DELETE',
      url: `/api/admin/tables/${tableId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('reservation_affected')
    expect(res.json().message).toContain('Công ty FPT')
  })

  it('xoá khu còn bàn thì bị chặn', async () => {
    const res = await inject({
      method: 'DELETE',
      url: `/api/admin/areas/${areaId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('còn 1 bàn')
  })

  it('bàn ngừng dùng biến khỏi phép đếm sức chứa', async () => {
    await db.delete(reservations).where(eq(reservations.displayCode, 'DB-A3-001'))

    const res = await inject({
      method: 'DELETE',
      url: `/api/admin/tables/${tableId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(200)

    const after = await availability(6, 'private')
    expect(after.capacity).toBe(0)
  })
})

describe('Tham số vẫn đọc được sau khi Office sửa', () => {
  it('bản ghi cuối trong bảng tham số khớp với thứ engine đang dùng', async () => {
    const rows = await db
      .select()
      .from(parameters)
      .where(eq(parameters.key, 'online.leadMinutes'))
    // Ghi đè của chi nhánh đã bị bỏ ở bài trước, chỉ còn dòng cấp chuỗi
    expect(rows).toHaveLength(1)
    expect(rows[0]!.branchId).toBeNull()
  })
})
