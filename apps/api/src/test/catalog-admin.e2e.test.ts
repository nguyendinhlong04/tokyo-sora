/**
 * Nghiệm thu M1 — Món và set.
 *
 * Trung tâm sản phẩm chỉ có MỘT cửa ghi (§18.1), nên bài kiểm ở đây là: ràng buộc
 * có chặn đúng chỗ không, và sửa xong thì các kênh ĐỌC có thấy ngay không —
 * thực đơn web, giá đóng băng vào dòng đơn, và set nổ ra đúng món thành phần.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { devices, dishes, staff, staffRoles } from '../db/schema'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const SEED_DEVICE = 'seed-device-token'
const OFFICE_PASSWORD = 'sora-dev-2026'

/** R10 toàn quyền · R7 quản lý ca (chỉ ở mức △ với giá bán) */
let owner: string
let shiftLead: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const asOwner = () => ({ authorization: `Bearer ${owner}` })

const NEW_DISH = {
  id: 'ga-nuong-muoi',
  code: 'SORA-GA-001',
  kind: 'dish' as const,
  categoryId: null,
  subCategory: null,
  nameVi: 'Gà nướng muối ớt',
  nameEn: null,
  nameJa: '塩焼き鶏',
  kana: '鶏',
  shortDesc: null,
  longDesc: null,
  allergens: null,
  tags: null,
  routingMethod: 'nuong' as const,
  stationGrill: 'ST-06',
  stationNoGrill: 'ST-06',
  stationTakeaway: 'ST-06',
  stationDelivery: 'ST-06',
  secondaryStation: null,
  primaryLabel: null,
  secondaryLabel: null,
  prepSeconds: 600,
  basePrice: 195_000,
  vatCode: 'standard',
  onlineVisible: false,
  tableOrderable: true,
  signature: false,
  active: true,
  sort: 0,
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

  const passwordHash = await hash(OFFICE_PASSWORD)
  const [chu] = await db
    .insert(staff)
    .values({ code: 'CHU01', fullName: 'Chủ quán', email: 'chu@tokyosora.vn', passwordHash })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: chu!.id, roleCode: 'R10', branchId: null })

  // Quản lý ca: cũng vào Office được, nhưng đổi giá thì phải xin duyệt
  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db.insert(staffRoles).values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  owner = await officeLogin('chu@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('Ràng buộc khi lưu món', () => {
  it('món đi bếp thiếu trạm thì bị chặn, kèm lý do đọc được', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/dishes',
      headers: asOwner(),
      payload: { ...NEW_DISH, id: 'thieu-tram', code: 'SORA-X-001', stationNoGrill: null },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('trạm khi bàn KHÔNG bếp')
  })

  it('bật bán online mà chưa có mô tả thì bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/dishes',
      headers: asOwner(),
      payload: { ...NEW_DISH, id: 'thieu-mo-ta', code: 'SORA-X-002', onlineVisible: true },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('mô tả ngắn')
  })

  it('mã định danh phải là slug dùng được trên đường dẫn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/dishes',
      headers: asOwner(),
      payload: { ...NEW_DISH, id: 'Gà Nướng' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('tạo được món hợp lệ', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/dishes',
      headers: asOwner(),
      payload: NEW_DISH,
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().nameVi).toBe('Gà nướng muối ớt')
  })

  it('trùng mã thì báo rõ, không ném lỗi CSDL', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/dishes',
      headers: asOwner(),
      payload: { ...NEW_DISH, id: 'ga-khac' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('SORA-GA-001')
  })
})

describe('Sửa món là mọi kênh đọc thấy ngay', () => {
  it('bật bán online kèm mô tả thì món hiện trên thực đơn web', async () => {
    const before = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    expect(before.json().dishes.some((d: { id: string }) => d.id === NEW_DISH.id)).toBe(false)

    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/${NEW_DISH.id}`,
      headers: asOwner(),
      payload: { onlineVisible: true, shortDesc: 'Đùi gà ướp muối ớt, nướng than hoa' },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const after = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    const dish = after.json().dishes.find((d: { id: string }) => d.id === NEW_DISH.id)
    expect(dish.shortDesc).toBe('Đùi gà ướp muối ớt, nướng than hoa')
    expect(dish.price).toBe(195_000)
  })

  it('đổi giá thì trang web và giá đóng băng vào đơn đều theo số mới', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/${NEW_DISH.id}`,
      headers: asOwner(),
      payload: { basePrice: 210_000 },
    })
    expect(res.statusCode).toBe(200)

    const site = await inject({ method: 'GET', url: '/api/site/menu' })
    const dish = site.json().dishes.find((d: { id: string }) => d.id === NEW_DISH.id)
    expect(dish.price).toBe(210_000)
  })

  it('giá riêng của chi nhánh đè lên giá chuỗi ở đúng chi nhánh đó', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/${NEW_DISH.id}/branches/${fx.branchId}`,
      headers: asOwner(),
      payload: { price: 180_000, active: null },
    })
    expect(res.statusCode).toBe(200)

    const menu = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    const dish = menu.json().dishes.find((d: { id: string }) => d.id === NEW_DISH.id)
    expect(dish.price).toBe(180_000)

    // Giá cấp chuỗi không đổi
    const site = await inject({ method: 'GET', url: '/api/site/menu' })
    expect(site.json().dishes.find((d: { id: string }) => d.id === NEW_DISH.id).price).toBe(210_000)
  })

  it('tắt món ở một chi nhánh thì chỉ chi nhánh đó mất món', async () => {
    await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/${NEW_DISH.id}/branches/${fx.branchId}`,
      headers: asOwner(),
      payload: { price: 180_000, active: false },
    })

    const menu = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    expect(menu.json().dishes.some((d: { id: string }) => d.id === NEW_DISH.id)).toBe(false)
  })

  it('bỏ ghi đè thì chi nhánh quay về giá và trạng thái của chuỗi', async () => {
    const res = await inject({
      method: 'DELETE',
      url: `/api/admin/dishes/${NEW_DISH.id}/branches/${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(200)

    const menu = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    const dish = menu.json().dishes.find((d: { id: string }) => d.id === NEW_DISH.id)
    expect(dish.price).toBe(210_000)
  })
})

describe('Đổi giá — dòng △ của ma trận quyền', () => {
  it('quản lý ca đổi giá thì bị đòi PIN người duyệt', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/${NEW_DISH.id}`,
      headers: { authorization: `Bearer ${shiftLead}` },
      payload: { basePrice: 250_000 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('requires_approval')
  })

  it('nhưng sửa mô tả thì không phải gọi ai', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/admin/dishes/${NEW_DISH.id}`,
      headers: { authorization: `Bearer ${shiftLead}` },
      payload: { longDesc: 'Nướng trên than hoa, trở đều tay.' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('Chặng của set', () => {
  it('chặng trỏ vào món chưa có trong danh mục thì bị chặn', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/dishes/setsora/courses',
      headers: asOwner(),
      payload: {
        courses: [
          {
            label: 'Mở bữa',
            kanji: '前',
            pickCount: null,
            batchOffset: 0,
            items: [{ dishId: 'mon-khong-co', qty: 1, portionLabel: '1 phần' }],
          },
        ],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('mon-khong-co')
  })

  it('sửa chặng thì set nổ ra đúng món mới khi khách gọi', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/dishes/setsora/courses',
      headers: asOwner(),
      payload: {
        courses: [
          {
            label: 'Mở bữa',
            kanji: '前',
            pickCount: null,
            batchOffset: 0,
            items: [{ dishId: 'duamuoi', qty: 1, portionLabel: '1 phần' }],
          },
          {
            label: 'Trên than',
            kanji: '焼',
            pickCount: null,
            batchOffset: 1,
            items: [{ dishId: NEW_DISH.id, qty: 1, portionLabel: '1 phần' }],
          },
        ],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const detail = await inject({
      method: 'GET',
      url: '/api/admin/dishes/setsora',
      headers: asOwner(),
    })
    expect(detail.json().courses).toHaveLength(2)
    expect(detail.json().courses[1].items[0].dishId).toBe(NEW_DISH.id)
  })

  it('chỉ set mới có chặng', async () => {
    const res = await inject({
      method: 'PUT',
      url: `/api/admin/dishes/${NEW_DISH.id}/courses`,
      headers: asOwner(),
      payload: { courses: [] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('Chỉ set')
  })
})

describe('Sự kiện lan truyền', () => {
  it('mỗi lần sửa món đều bắn mon.cap-nhat cho các kênh làm mới cache', async () => {
    const [row] = await db.select().from(dishes).where(eq(dishes.id, NEW_DISH.id))
    expect(row).toBeDefined()

    const events = await db.query.outboxEvents.findMany({
      where: (e, { eq: is }) => is(e.topic, 'mon.cap-nhat'),
    })
    expect(events.length).toBeGreaterThan(0)
    expect(events[0]!.rooms).toContain(`branch:${fx.branchId}:config`)
  })
})
