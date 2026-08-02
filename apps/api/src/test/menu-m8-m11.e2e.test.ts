/**
 * Nghiệm thu nhóm Món còn lại — M8 · M9 · M10 · M11.
 *
 * Bốn màn, bốn câu hỏi khác nhau, nhưng cùng một mối lo: **con số hiện ra có phải
 * là con số thật không**.
 *   · M8 — nồi nước dùng 64.000₫ ra 8.000ml thì mỗi ml đúng 8₫, và món chèn nước
 *     dùng vào phải tính đúng 8₫ đó chứ không phải 0₫.
 *   · M9 — bản chụp phải giữ được công thức HỒI ĐÓ, kể cả khi hôm nay nguyên liệu
 *     đã đổi tên hay đã bị bỏ khỏi bảng.
 *   · M10 — kéo thả không được cắt lìa một nhánh khỏi cây, và xoá nhóm không được
 *     làm mấy chục món rơi ra ngoài mà không ai biết.
 *   · M11 — set "chọn 1 trong 2" phải cho DẢI giá vốn, và trần của dải phải là
 *     món đắt nhất chứ không phải trung bình.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import { devices, dishes, staff, staffRoles } from '../db/schema'
import { ALL_DAYS, dayBitOf } from '../modules/catalog/domain/sale-window'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>
let owner: string
let cashier: string

const SEED_DEVICE = 'seed-device-token'
const OFFICE_PASSWORD = 'sora-dev-2026'
const TZ = 'Asia/Ho_Chi_Minh'

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const asOwner = () => ({ authorization: `Bearer ${owner}` })

const ingredient = (over: Record<string, unknown>) => ({
  groupName: null,
  baseUnit: 'g',
  purchaseUnit: 'kg',
  basePerPurchase: 1_000,
  minLevelBase: 0,
  lotRequired: false,
  isSemiFinished: false,
  active: true,
  sort: 0,
  ...over,
})

/** Nhập hàng để nguyên liệu có giá bình quân — M8 và M11 đều cần giá thật để chia */
async function receive(ingredientId: string, qtyPurchase: number, totalVnd: number) {
  const res = await inject({
    method: 'POST',
    url: '/api/inventory/receipts',
    headers: asOwner(),
    payload: { branchId: fx.branchId, ingredientId, qtyPurchase, totalVnd },
  })
  expect(res.statusCode, res.payload).toBe(201)
}

async function setRecipe(dishId: string, lines: { ingredientId: string; qtyBase: number; wasteBp?: number }[]) {
  const res = await inject({
    method: 'PUT',
    url: `/api/inventory/recipes/${dishId}`,
    headers: asOwner(),
    payload: { lines: lines.map((l) => ({ wasteBp: 0, ...l })) },
  })
  expect(res.statusCode, res.payload).toBe(200)
  return res.json()
}

async function setPrep(prepId: string, yieldBase: number, lines: { ingredientId: string; qtyBase: number }[]) {
  return inject({
    method: 'PUT',
    url: `/api/inventory/preps/${prepId}`,
    headers: asOwner(),
    payload: { yieldBase, lines: lines.map((l) => ({ ...l, wasteBp: 0 })) },
  })
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

  owner = (
    await inject({
      method: 'POST',
      url: '/api/auth/office/login',
      payload: { branchId: fx.branchId, email: 'chu@tokyosora.vn', password: OFFICE_PASSWORD },
    })
  ).json<{ token: string }>().token

  cashier = (
    await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
      payload: { branchId: fx.branchId, staffId: fx.cashierId, pin: fx.pins[fx.cashierId] },
    })
  ).json<{ token: string }>().token

  // Nguyên liệu thô: xương 18₫/g · rau 20₫/g · thịt bò 300₫/g
  for (const body of [
    ingredient({ id: 'xuong-bo', code: 'NL-X-001', name: 'Xương bò' }),
    ingredient({ id: 'rau-thom', code: 'NL-X-002', name: 'Rau thơm' }),
    ingredient({ id: 'thit-bo', code: 'NL-X-003', name: 'Thịt bò' }),
    ingredient({
      id: 'nuoc-dung',
      code: 'BTP-001',
      name: 'Nước dùng',
      baseUnit: 'ml',
      purchaseUnit: 'lít',
      isSemiFinished: true,
    }),
    ingredient({
      id: 'sot-nen',
      code: 'BTP-002',
      name: 'Sốt nền',
      baseUnit: 'ml',
      purchaseUnit: 'lít',
      isSemiFinished: true,
    }),
  ]) {
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/ingredients',
      headers: asOwner(),
      payload: body,
    })
    expect(res.statusCode, res.payload).toBe(201)
  }

  await receive('xuong-bo', 1, 18_000)
  await receive('rau-thom', 1, 20_000)
  await receive('thit-bo', 1, 300_000)
}, 120_000)

afterAll(async () => {
  await close?.()
})

// =========================================================== M8

describe('M8 — Bán thành phẩm', () => {
  it('tiền một mẻ chia cho sản lượng ra giá mỗi ml', async () => {
    // 3.000g xương × 18₫ + 500g rau × 20₫ = 64.000₫ cho 8.000ml ⇒ 8₫/ml
    const res = await setPrep('nuoc-dung', 8_000, [
      { ingredientId: 'xuong-bo', qtyBase: 3_000 },
      { ingredientId: 'rau-thom', qtyBase: 500 },
    ])
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json()).toMatchObject({ batchCostVnd: 64_000, standardMilli: 8_000 })
  })

  it('bán thành phẩm chưa từng có giá thì lần lưu đầu MỒI giá cho nó', async () => {
    const list = await inject({ method: 'GET', url: '/api/inventory/preps', headers: asOwner() })
    const row = list.json<{ id: string; costPerBaseMilli: number; standardMilli: number }[]>()
      .find((r) => r.id === 'nuoc-dung')!
    expect(row.costPerBaseMilli).toBe(8_000)
    expect(row.standardMilli).toBe(8_000)
  })

  it('công thức món chèn bán thành phẩm vào tính đúng giá của nó, không phải 0₫', async () => {
    // 200ml nước dùng × 8₫ = 1.600₫
    await setRecipe('miso', [{ ingredientId: 'nuoc-dung', qtyBase: 200 }])
    const res = await inject({
      method: 'GET',
      url: '/api/inventory/recipes/miso',
      headers: asOwner(),
    })
    expect(res.json<{ costVnd: number }>().costVnd).toBe(1_600)
  })

  it('công thức chuẩn KHÔNG đè lên giá thật ở những lần lưu sau', async () => {
    // Đổi công thức cho đắt hơn hẳn: giá đang dùng phải giữ nguyên 8₫/ml
    const res = await setPrep('nuoc-dung', 8_000, [
      { ingredientId: 'xuong-bo', qtyBase: 6_000 },
      { ingredientId: 'rau-thom', qtyBase: 500 },
    ])
    expect(res.json()).toMatchObject({ standardMilli: 14_750, seededMilli: null })

    const list = await inject({ method: 'GET', url: '/api/inventory/preps', headers: asOwner() })
    const row = list.json<{ id: string; costPerBaseMilli: number }[]>().find((r) => r.id === 'nuoc-dung')!
    expect(row.costPerBaseMilli).toBe(8_000)
  })

  it('có dòng công thức mà chưa khai sản lượng thì không chia được — chặn lưu', async () => {
    const res = await setPrep('nuoc-dung', 0, [{ ingredientId: 'xuong-bo', qtyBase: 1_000 }])
    expect(res.statusCode).toBe(400)
  })

  it('nguyên liệu thường không có công thức mẻ', async () => {
    const res = await setPrep('thit-bo', 1_000, [{ ingredientId: 'xuong-bo', qtyBase: 100 }])
    expect(res.statusCode).toBe(400)
  })

  it('công thức lồng vòng bị chặn: sốt nền dùng nước dùng, nước dùng dùng lại sốt nền', async () => {
    const first = await setPrep('sot-nen', 2_000, [{ ingredientId: 'nuoc-dung', qtyBase: 500 }])
    expect(first.statusCode, first.payload).toBe(200)

    const loop = await setPrep('nuoc-dung', 8_000, [{ ingredientId: 'sot-nen', qtyBase: 100 }])
    expect(loop.statusCode).toBe(400)
    expect(loop.json<{ message: string }>().message).toContain('lồng vòng')
  })

  it('bỏ cờ bán thành phẩm khi còn công thức mẻ thì bị chặn', async () => {
    const res = await inject({
      method: 'PATCH',
      url: '/api/inventory/ingredients/nuoc-dung',
      headers: asOwner(),
      payload: { isSemiFinished: false },
    })
    expect(res.statusCode).toBe(409)
  })
})

// =========================================================== M9

describe('M9 — Lịch sử phiên bản công thức', () => {
  it('mỗi lần lưu có thay đổi là một phiên bản, đánh số từ 1', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/inventory/recipe-versions/prep/nuoc-dung',
      headers: asOwner(),
    })
    const body = res.json<{ versions: { version: number; costVnd: number }[] }>()
    expect(body.versions.map((v) => v.version)).toEqual([2, 1])
    expect(body.versions[1]!.costVnd).toBe(64_000)
  })

  it('lưu lại y nguyên thì KHÔNG đẻ thêm phiên bản', async () => {
    const before = await inject({
      method: 'GET',
      url: '/api/inventory/recipe-versions/prep/nuoc-dung',
      headers: asOwner(),
    })
    const count = before.json<{ versions: unknown[] }>().versions.length

    const again = await setPrep('nuoc-dung', 8_000, [
      { ingredientId: 'xuong-bo', qtyBase: 6_000 },
      { ingredientId: 'rau-thom', qtyBase: 500 },
    ])
    expect(again.json<{ version: number | null }>().version).toBeNull()

    const after = await inject({
      method: 'GET',
      url: '/api/inventory/recipe-versions/prep/nuoc-dung',
      headers: asOwner(),
    })
    expect(after.json<{ versions: unknown[] }>().versions.length).toBe(count)
  })

  it('so hai bản nói được dòng nào sửa và giá vốn nhảy bao nhiêu', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/inventory/recipe-versions/prep/nuoc-dung/compare?from=1&to=2',
      headers: asOwner(),
    })
    const body = res.json<{
      from: { costVnd: number }
      to: { costVnd: number }
      lines: { ingredientId: string; change: string }[]
    }>()
    expect(body.from.costVnd).toBe(64_000)
    expect(body.to.costVnd).toBe(118_000)

    const byId = new Map(body.lines.map((l) => [l.ingredientId, l.change]))
    expect(byId.get('xuong-bo')).toBe('changed')
    expect(byId.get('rau-thom')).toBe('same')
  })

  it('bản chụp giữ tên nguyên liệu LÚC ĐÓ, đổi tên hôm nay không viết lại lịch sử', async () => {
    await inject({
      method: 'PATCH',
      url: '/api/inventory/ingredients/rau-thom',
      headers: asOwner(),
      payload: { name: 'Rau thơm Đà Lạt' },
    })

    const res = await inject({
      method: 'GET',
      url: '/api/inventory/recipe-versions/prep/nuoc-dung/compare?from=1&to=2',
      headers: asOwner(),
    })
    const line = res
      .json<{ lines: { ingredientId: string; name: string }[] }>()
      .lines.find((l) => l.ingredientId === 'rau-thom')!
    expect(line.name).toBe('Rau thơm')
  })

  it('dòng thời gian gộp cả công thức món lẫn công thức mẻ', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/inventory/recipe-changes',
      headers: asOwner(),
    })
    const rows = res.json<{ subjectKind: string; subjectId: string; subjectName: string }[]>()
    expect(rows.some((r) => r.subjectKind === 'prep' && r.subjectId === 'nuoc-dung')).toBe(true)
    expect(rows.some((r) => r.subjectKind === 'dish' && r.subjectId === 'miso')).toBe(true)
    // Tên hiển thị lấy từ đúng bảng của từng loại
    expect(rows.find((r) => r.subjectId === 'miso')!.subjectName).toBe('Canh miso rong biển')
  })
})

// =========================================================== M10

describe('M10 — Cây danh mục', () => {
  const category = (over: Record<string, unknown>) => ({
    parentId: null,
    nameEn: null,
    nameJa: null,
    kanji: null,
    imageUrl: null,
    onlineVisible: true,
    tableVisible: true,
    ...over,
  })

  it('dựng được cây nhiều cấp và trả về đúng độ sâu', async () => {
    for (const body of [
      category({ id: 'nuong', nameVi: 'Nướng' }),
      category({ id: 'bo-nuong', nameVi: 'Bò nướng', parentId: 'nuong' }),
      category({ id: 'bo-my', nameVi: 'Bò Mỹ', parentId: 'bo-nuong' }),
      category({ id: 'trang-mieng', nameVi: 'Tráng miệng' }),
    ]) {
      const res = await inject({
        method: 'POST',
        url: '/api/admin/categories',
        headers: asOwner(),
        payload: body,
      })
      expect(res.statusCode, res.payload).toBe(201)
    }

    const res = await inject({ method: 'GET', url: '/api/admin/categories', headers: asOwner() })
    const rows = res.json<{ id: string; depth: number }[]>()
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ['nuong', 0],
      ['bo-nuong', 1],
      ['bo-my', 2],
      ['trang-mieng', 0],
    ])
  })

  it('đếm cả món của nhóm con để không ai xoá nhầm một nhánh đang có hàng', async () => {
    await db.update(dishes).set({ categoryId: 'bo-my' }).where(eq(dishes.id, 'bachibo'))

    const res = await inject({ method: 'GET', url: '/api/admin/categories', headers: asOwner() })
    const rows = res.json<{ id: string; dishCount: number; totalDishCount: number }[]>()
    expect(rows.find((r) => r.id === 'bo-my')).toMatchObject({ dishCount: 1, totalDishCount: 1 })
    expect(rows.find((r) => r.id === 'nuong')).toMatchObject({ dishCount: 0, totalDishCount: 1 })
  })

  it('không thả được một nhóm vào chính nhóm con của nó', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/categories/nuong/move',
      headers: asOwner(),
      payload: { parentId: 'bo-my', position: 0 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('kéo thả đổi cha và đánh số lại anh em ở cả hai chỗ', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/categories/bo-nuong/move',
      headers: asOwner(),
      payload: { parentId: null, position: 0 },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const tree = await inject({ method: 'GET', url: '/api/admin/categories', headers: asOwner() })
    const rows = tree.json<{ id: string; parentId: string | null; depth: number; sort: number }[]>()
    expect(rows.find((r) => r.id === 'bo-nuong')).toMatchObject({ parentId: null, depth: 0, sort: 0 })
    // Nhóm gốc còn lại được đánh số liền, không để lỗ
    expect(rows.filter((r) => r.parentId === null).map((r) => r.sort)).toEqual([0, 1, 2])
  })

  it('xoá nhóm còn nhóm con hoặc còn món thì bị chặn, nhóm rỗng thì xoá được', async () => {
    const hasChild = await inject({
      method: 'DELETE',
      url: '/api/admin/categories/bo-nuong',
      headers: asOwner(),
    })
    expect(hasChild.statusCode).toBe(409)

    const hasDish = await inject({
      method: 'DELETE',
      url: '/api/admin/categories/bo-my',
      headers: asOwner(),
    })
    expect(hasDish.statusCode).toBe(409)

    const empty = await inject({
      method: 'DELETE',
      url: '/api/admin/categories/trang-mieng',
      headers: asOwner(),
    })
    expect(empty.statusCode, empty.payload).toBe(200)
  })

  it('nhóm tắt kênh online biến mất khỏi thực đơn online', async () => {
    await inject({
      method: 'PATCH',
      url: '/api/admin/categories/nuong',
      headers: asOwner(),
      payload: { onlineVisible: false },
    })

    const res = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    const ids = res.json<{ categories: { id: string }[] }>().categories.map((c) => c.id)
    expect(ids).not.toContain('nuong')
    expect(ids).toContain('bo-nuong')
  })
})

// =========================================================== M11

describe('M11 — Set & Combo', () => {
  const setUrl = () => `/api/admin/sets?branch=${fx.branchId}`

  /** Ba chỉ 30.000₫ · thăn 60.000₫ · dưa muối 2.000₫ · kem 4.000₫ mỗi phần */
  it('dải giá vốn của nhóm CỐ ĐỊNH có đáy bằng trần', async () => {
    await setRecipe('bachibo', [{ ingredientId: 'thit-bo', qtyBase: 100 }])
    await setRecipe('thanbo', [{ ingredientId: 'thit-bo', qtyBase: 200 }])
    await setRecipe('duamuoi', [{ ingredientId: 'rau-thom', qtyBase: 100 }])
    await setRecipe('kemtra', [{ ingredientId: 'rau-thom', qtyBase: 200 }])

    const res = await inject({ method: 'GET', url: setUrl(), headers: asOwner() })
    const set = res.json<{ id: string; costMinVnd: number; costMaxVnd: number }[]>()
      .find((s) => s.id === 'setsora')!
    // 2.000 + (30.000 + 60.000) + 4.000×2 = 100.000₫, không có dải
    expect(set.costMinVnd).toBe(100_000)
    expect(set.costMaxVnd).toBe(100_000)
  })

  it('nhóm "chọn N" cho dải, và trần là N LẦN món đắt nhất vì khách chọn trùng được', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/dishes/setsora/courses',
      headers: asOwner(),
      payload: {
        courses: [
          {
            label: 'Mở bữa',
            kanji: null,
            pickCount: null,
            batchOffset: 0,
            items: [{ dishId: 'duamuoi', qty: 1, portionLabel: '1 phần' }],
          },
          {
            label: 'Bò trên than',
            kanji: null,
            pickCount: 2,
            batchOffset: 1,
            items: [
              { dishId: 'bachibo', qty: 1, portionLabel: '100g' },
              { dishId: 'thanbo', qty: 1, portionLabel: '100g' },
            ],
          },
        ],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const list = await inject({ method: 'GET', url: setUrl(), headers: asOwner() })
    const set = list
      .json<{ id: string; costMinVnd: number; costMaxVnd: number; foodCostMax: number | null }[]>()
      .find((s) => s.id === 'setsora')!

    expect(set.costMinVnd).toBe(2_000 + 2 * 30_000)
    expect(set.costMaxVnd).toBe(2_000 + 2 * 60_000)
    // Food cost đầu đắt: 122.000 / 1.280.000
    expect(set.foodCostMax).toBeCloseTo(122_000 / 1_280_000, 5)
  })

  it('món thành phần chưa khai công thức thì nêu tên và bỏ trống food cost', async () => {
    await setRecipe('duamuoi', [])

    const res = await inject({ method: 'GET', url: setUrl(), headers: asOwner() })
    const set = res
      .json<{ id: string; unknownDishes: string[]; foodCostMax: number | null }[]>()
      .find((s) => s.id === 'setsora')!
    expect(set.unknownDishes).toEqual(['Dưa muối ba vị'])
    expect(set.foodCostMax).toBeNull()

    await setRecipe('duamuoi', [{ ingredientId: 'rau-thom', qtyBase: 100 }])
  })

  it('khung giờ bán phải khai cả cặp và giờ đóng phải sau giờ mở', async () => {
    const lonely = await inject({
      method: 'PATCH',
      url: '/api/admin/dishes/setsora',
      headers: asOwner(),
      payload: { saleStartMinute: 11 * 60, saleEndMinute: null },
    })
    expect(lonely.statusCode).toBe(400)

    const backwards = await inject({
      method: 'PATCH',
      url: '/api/admin/dishes/setsora',
      headers: asOwner(),
      payload: { saleStartMinute: 14 * 60, saleEndMinute: 11 * 60 },
    })
    expect(backwards.statusCode).toBe(400)
  })

  it('ngoài lịch bán thì thực đơn online ẩn món và POS bị từ chối lúc bấm', async () => {
    // Bán online thì phải có mô tả ngắn (§18.1) — khai luôn để PATCH sau không vướng
    await db
      .update(dishes)
      .set({ onlineVisible: true, shortDesc: 'Set ba chặng cho hai người' })
      .where(eq(dishes.id, 'setsora'))

    const before = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    expect(before.json<{ dishes: { id: string }[] }>().dishes.map((d) => d.id)).toContain('setsora')

    // Bán mọi ngày TRỪ hôm nay — cách duy nhất viết được một bài kiểm chạy giờ nào cũng đúng
    const todayBit = dayBitOf(businessDateOf(new Date(), TZ))
    const patch = await inject({
      method: 'PATCH',
      url: '/api/admin/dishes/setsora',
      headers: asOwner(),
      payload: { saleDays: ALL_DAYS ^ (1 << todayBit) },
    })
    expect(patch.statusCode, patch.payload).toBe(200)

    const after = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    expect(after.json<{ dishes: { id: string }[] }>().dishes.map((d) => d.id)).not.toContain('setsora')

    const session = await inject({
      method: 'POST',
      url: `/api/tables/${fx.spareTableId}/open`,
      headers: { authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE },
      payload: { guestCount: 2 },
    })
    expect(session.statusCode, session.payload).toBe(201)

    const add = await inject({
      method: 'POST',
      url: `/api/table-sessions/${session.json<{ id: number }>().id}/lines`,
      headers: { authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE },
      payload: { lines: [{ dishId: 'setsora', qty: 1 }] },
    })
    expect(add.statusCode).toBe(409)
    expect(add.json<{ code: string }>().code).toBe('dish_off_schedule')

    // Món không khai lịch vẫn gọi bình thường — lịch của set không lan sang món khác
    const other = await inject({
      method: 'POST',
      url: `/api/table-sessions/${session.json<{ id: number }>().id}/lines`,
      headers: { authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE },
      payload: { lines: [{ dishId: 'bachibo', qty: 1 }] },
    })
    expect(other.statusCode, other.payload).toBe(201)
  })
})
