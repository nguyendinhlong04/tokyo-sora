/**
 * Nghiệm thu O10 · O11 — cấu hình kênh online.
 *
 * Hai màn này quyết định thứ khách nhìn thấy khi mở /dat-mon: món nào bán, giá
 * bao nhiêu, giao tới đâu và tới mấy giờ. Nên bài kiểm là: sửa ở Office thì
 * thực đơn online và bảng phí đổi theo NGAY, và những cấu hình sai bị chặn tại
 * chỗ thay vì để lộ ra ở phía khách.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { deliveryZones, dishes, parameters, staff, staffRoles } from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'
let owner: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const asOwner = () => ({ authorization: `Bearer ${owner}` })

const onlineMenu = () =>
  inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` }).then((r) => r.json())

const zone = (patch: Record<string, unknown> = {}) => ({
  branchId: fx.branchId,
  name: 'Vòng 1 · quanh quán',
  wards: ['Dịch Vọng', 'Quan Hoa'],
  feeVnd: 15_000,
  minOrderVnd: 150_000,
  etaMinutes: 25,
  active: true,
  sort: 1,
  ...patch,
})

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  const [chu] = await db
    .insert(staff)
    .values({
      code: 'CHU01',
      fullName: 'Chủ quán',
      email: 'chu@tokyosora.vn',
      passwordHash: await hash(OFFICE_PASSWORD),
    })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: chu!.id, roleCode: 'R10', branchId: null })

  const login = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email: 'chu@tokyosora.vn', password: OFFICE_PASSWORD },
  })
  owner = login.json().token

  // Bộ món của harness chưa bật kênh online — bật hai món để có gì mà cấu hình
  await db.update(dishes).set({ onlineVisible: true, shortDesc: 'Ba chỉ bò nướng than' }).where(eq(dishes.id, 'bachibo'))
  await db.update(dishes).set({ onlineVisible: true, shortDesc: 'Sò điệp Hokkaido' }).where(eq(dishes.id, 'sodiep'))
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('O10 — vùng giao & phí', () => {
  let zoneId: number

  it('tạo vùng và lưu tên phường ở dạng khớp được', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/delivery-zones',
      headers: asOwner(),
      payload: zone(),
    })
    expect(res.statusCode, res.payload).toBe(201)
    zoneId = res.json().id
    // Giữ nguyên chữ người nhập — khớp là việc của `wardMatches` lúc khách tra
    expect(res.json().wards).toEqual(['Dịch Vọng', 'Quan Hoa'])
  })

  it('khách tra phường trong vùng thì ra đúng phí và thời gian', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/online/quote?branch=${fx.branchId}&ward=${encodeURIComponent('Phường Dịch Vọng')}`,
    })
    expect(res.json()).toMatchObject({ inZone: true, feeVnd: 15_000, etaMinutes: 25 })
  })

  it('một phường nằm trong hai vùng thì bị chặn ngay khi lưu', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/delivery-zones',
      headers: asOwner(),
      payload: zone({ name: 'Vòng 2', wards: ['Quan Hoa', 'Mai Dịch'], sort: 2 }),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('ward_in_two_zones')
    expect(res.json().message).toContain('Vòng 1')
  })

  it('vùng không có phường nào thì vô nghĩa, chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/delivery-zones',
      headers: asOwner(),
      payload: zone({ name: 'Vùng rỗng', wards: [] }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('sửa phí là khách thấy phí mới ngay', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/delivery-zones/${zoneId}`,
      headers: asOwner(),
      payload: { feeVnd: 25_000, minOrderVnd: 200_000 },
    })
    expect(res.statusCode).toBe(200)

    const quote = await inject({
      method: 'GET',
      url: `/api/online/quote?branch=${fx.branchId}&ward=dich%20vong`,
    })
    expect(quote.json()).toMatchObject({ feeVnd: 25_000, minOrderVnd: 200_000 })
  })

  it('tắt vùng thì địa chỉ đó thành ngoài vùng giao', async () => {
    await inject({
      method: 'PATCH',
      url: `/api/admin/delivery-zones/${zoneId}`,
      headers: asOwner(),
      payload: { active: false },
    })

    const quote = await inject({
      method: 'GET',
      url: `/api/online/quote?branch=${fx.branchId}&ward=dich%20vong`,
    })
    expect(quote.json().inZone).toBe(false)
  })

  it('xoá vùng thì bảng phí không còn dòng đó', async () => {
    await inject({
      method: 'DELETE',
      url: `/api/admin/delivery-zones/${zoneId}`,
      headers: asOwner(),
    })
    const rows = await db.select().from(deliveryZones).where(eq(deliveryZones.branchId, fx.branchId))
    expect(rows).toHaveLength(0)
  })
})

describe('O11 — menu online', () => {
  it('giá online cấp chuỗi đè lên giá tại quán, chỉ ở kênh online', async () => {
    const res = await inject({
      method: 'PATCH',
      url: '/api/admin/dishes/bachibo',
      headers: asOwner(),
      payload: { onlinePrice: 315_000 },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const menu = await onlineMenu()
    expect(menu.dishes.find((d: { id: string }) => d.id === 'bachibo').price).toBe(315_000)

    // Thực đơn tại quán vẫn giá cũ
    const site = await inject({ method: 'GET', url: '/api/site/menu' })
    expect(site.json().dishes.find((d: { id: string }) => d.id === 'bachibo').price).toBe(285_000)
  })

  it('giá online của chi nhánh đè lên giá online của chuỗi', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/bachibo/branches/${fx.branchId}`,
      headers: asOwner(),
      payload: { price: null, active: null, onlinePrice: 299_000 },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const menu = await onlineMenu()
    expect(menu.dishes.find((d: { id: string }) => d.id === 'bachibo').price).toBe(299_000)
  })

  it('tắt kênh online cho riêng chi nhánh mà vẫn bán tại bàn', async () => {
    await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/sodiep/branches/${fx.branchId}`,
      headers: asOwner(),
      payload: { price: null, active: null, onlineVisible: false },
    })

    const menu = await onlineMenu()
    expect(menu.dishes.some((d: { id: string }) => d.id === 'sodiep')).toBe(false)

    // Vẫn còn trong danh mục và vẫn bán được tại bàn
    const list = await inject({
      method: 'GET',
      url: `/api/admin/dishes?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const row = list.json().find((d: { id: string }) => d.id === 'sodiep')
    expect(row.effectiveActive).toBe(true)
    expect(row.effectiveOnlineVisible).toBe(false)
  })

  it('chi nhánh bật riêng một món mà cấp chuỗi đang tắt', async () => {
    const before = await onlineMenu()
    expect(before.dishes.some((d: { id: string }) => d.id === 'thanbo')).toBe(false)

    await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/thanbo/branches/${fx.branchId}`,
      headers: asOwner(),
      payload: { price: null, active: null, onlineVisible: true },
    })

    const after = await onlineMenu()
    expect(after.dishes.some((d: { id: string }) => d.id === 'thanbo')).toBe(true)
  })

  it('trần đơn mỗi khung sửa được và khung giờ đổi theo', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/parameters/online.slotCapacity',
      headers: asOwner(),
      payload: { value: 2, branchId: fx.branchId },
    })
    expect(res.statusCode).toBe(200)

    const slots = await inject({ method: 'GET', url: `/api/online/slots?branch=${fx.branchId}` })
    expect(slots.json().slots[0].capacity).toBe(2)
  })
})

describe('Giờ ngừng nhận: đơn giao chốt sớm hơn đơn mang về', () => {
  beforeAll(async () => {
    /**
     * Ghi qua API chứ không chèn thẳng bảng: `ParamsService` giữ cache trong tiến
     * trình và chỉ nạp lại khi đi qua `set()`. Chèn thẳng thì bảng có giá trị mới
     * mà engine vẫn đọc giá trị cũ — đúng cái bẫy màn A6 phải tránh.
     */
    await db.insert(parameters).values([
      { key: 'online.lastOrderMinuteDelivery', branchId: null, value: 23 * 60, unit: 'phút từ 00:00' },
    ])
    await inject({
      method: 'PUT',
      url: '/api/admin/parameters/online.lastOrderMinuteDelivery',
      headers: asOwner(),
      payload: { value: 20 * 60, branchId: null },
    })
  })

  it('lưới khung giờ của đơn giao dừng sớm hơn', async () => {
    const takeaway = await inject({
      method: 'GET',
      url: `/api/online/slots?branch=${fx.branchId}&type=takeaway`,
    })
    const delivery = await inject({
      method: 'GET',
      url: `/api/online/slots?branch=${fx.branchId}&type=delivery`,
    })

    const last = (res: typeof takeaway) => res.json().slots.at(-1).at as string
    expect(new Date(last(delivery)).getTime()).toBeLessThan(new Date(last(takeaway)).getTime())
  })

  it('sửa giờ ngừng nhận đơn giao ở Office thì lưới đổi theo', async () => {
    await inject({
      method: 'PUT',
      url: '/api/admin/parameters/online.lastOrderMinuteDelivery',
      headers: asOwner(),
      payload: { value: 18 * 60, branchId: fx.branchId },
    })

    const delivery = await inject({
      method: 'GET',
      url: `/api/online/slots?branch=${fx.branchId}&type=delivery`,
    })
    const lastAt = new Date(delivery.json().slots.at(-1).at)
    expect(lastAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })).toBe('18:00')
  })
})
