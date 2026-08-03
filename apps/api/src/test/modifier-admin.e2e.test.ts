/**
 * M5 — Tuỳ chọn.
 *
 * Nhóm tuỳ chọn là dữ liệu dùng chung: sửa một chỗ thì mọi món dùng nhóm đó đổi
 * theo, và POS phải đọc được ngay ở lần lấy cấu hình sau. Bộ này kiểm đúng bốn
 * điều đó — cộng hai ràng buộc mà CSDL không giữ hộ được.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { devices, modifierGroups, modifierOptions } from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const SEED_DEVICE = 'seed-device-token'
/** R10 — chủ quán, có `menu.edit-price` ở mức toàn quyền */
let owner: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const auth = () => ({ authorization: `Bearer ${owner}`, [DEVICE_HEADER]: SEED_DEVICE })

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'cashier',
    name: 'Máy Office',
    tokenHash: hashToken(SEED_DEVICE),
  })

  owner = (
    await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
      payload: { branchId: fx.branchId, staffId: fx.managerId, pin: fx.pins[fx.managerId] },
    })
  ).json<{ token: string }>().token
}, 120_000)

afterAll(async () => {
  await close?.()
})

describe('Nhóm tuỳ chọn', () => {
  it('danh sách hiện số món đang dùng và dải chênh giá', async () => {
    const res = await inject({ method: 'GET', url: '/api/admin/modifier-groups', headers: auth() })
    expect(res.statusCode, res.payload).toBe(200)

    const rows = res.json<
      { id: string; dishCount: number; priceMin: number; priceMax: number; options: unknown[] }[]
    >()
    const them = rows.find((r) => r.id === 'yaki-them')
    // Fixture gắn nhóm "Thêm" vào đúng một món, hai lựa chọn 15k và 25k
    expect(them?.dishCount).toBe(1)
    expect(them?.options).toHaveLength(2)
    expect(them?.priceMin).toBe(15_000)
    expect(them?.priceMax).toBe(25_000)
  })

  it('tạo nhóm mới, mã lựa chọn sinh từ tên và đọc được bằng mắt', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/modifier-groups/do-chin',
      headers: auth(),
      payload: {
        name: 'Độ chín',
        required: true,
        multi: false,
        pickMin: 1,
        pickMax: 1,
        options: [
          { name: 'Tái', priceDelta: 0, affectsStock: false },
          { name: 'Chín vừa', priceDelta: 0, affectsStock: false },
        ],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const options = await db
      .select()
      .from(modifierOptions)
      .where(eq(modifierOptions.groupId, 'do-chin'))
    expect(options.map((o) => o.id).sort()).toEqual(['do-chin-chin-vua', 'do-chin-tai'])
  })

  it('sửa tên lựa chọn thì GIỮ NGUYÊN mã — giỏ hàng đang mở trên POS không hỏng', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/modifier-groups/do-chin',
      headers: auth(),
      payload: {
        name: 'Độ chín',
        required: true,
        multi: false,
        pickMin: 1,
        pickMax: 1,
        options: [
          { id: 'do-chin-tai', name: 'Tái vừa', priceDelta: 0, affectsStock: false },
          { id: 'do-chin-chin-vua', name: 'Chín vừa', priceDelta: 10_000, affectsStock: true },
        ],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const [tai] = await db
      .select()
      .from(modifierOptions)
      .where(eq(modifierOptions.id, 'do-chin-tai'))
    expect(tai).toMatchObject({ name: 'Tái vừa', priceDelta: 0 })

    const [chin] = await db
      .select()
      .from(modifierOptions)
      .where(eq(modifierOptions.id, 'do-chin-chin-vua'))
    // "Có trừ kho không" là cột thật, không phải ghi chú
    expect(chin).toMatchObject({ affectsStock: true, priceDelta: 10_000 })
  })

  it('bỏ một lựa chọn khỏi danh sách thì lựa chọn đó biến mất', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/modifier-groups/do-chin',
      headers: auth(),
      payload: {
        name: 'Độ chín',
        required: false,
        multi: false,
        pickMin: 0,
        pickMax: 1,
        options: [{ id: 'do-chin-tai', name: 'Tái vừa', priceDelta: 0, affectsStock: false }],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json<{ dropped: number }>().dropped).toBe(1)

    const left = await db
      .select()
      .from(modifierOptions)
      .where(eq(modifierOptions.groupId, 'do-chin'))
    expect(left.map((o) => o.id)).toEqual(['do-chin-tai'])
  })

  it('nhóm mã cũ kiểu modYaki-vi vẫn sửa được — chỉ mã MỚI mới soi dạng', async () => {
    await db.insert(modifierGroups).values({
      id: 'modYaki-vi',
      name: 'Chọn vị',
      required: true,
      multi: false,
      pickMin: 1,
      pickMax: 1,
    })
    await db.insert(modifierOptions).values([
      { id: 'modYaki-vi-muoi', groupId: 'modYaki-vi', name: 'Muối tiêu chanh', priceDelta: 0 },
      { id: 'modYaki-vi-miso', groupId: 'modYaki-vi', name: 'Miso cay', priceDelta: 0 },
    ])

    const ok = await inject({
      method: 'PUT',
      url: '/api/admin/modifier-groups/modYaki-vi',
      headers: auth(),
      payload: {
        name: 'Chọn vị chấm',
        required: true,
        multi: false,
        pickMin: 1,
        pickMax: 1,
        options: [
          { id: 'modYaki-vi-muoi', name: 'Muối tiêu chanh', priceDelta: 0, affectsStock: false },
          { id: 'modYaki-vi-miso', name: 'Miso cay', priceDelta: 5_000, affectsStock: true },
        ],
      },
    })
    expect(ok.statusCode, ok.payload).toBe(200)

    const rejected = await inject({
      method: 'PUT',
      url: '/api/admin/modifier-groups/modMoi-Toanh',
      headers: auth(),
      payload: {
        name: 'Nhóm mới sai mã',
        required: false,
        multi: true,
        pickMin: 0,
        pickMax: 2,
        options: [{ name: 'A', priceDelta: 0, affectsStock: false }],
      },
    })
    expect(rejected.statusCode).toBe(400)
  })

  it('nhóm bắt buộc mà chỉ có một lựa chọn thì bị chặn', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/modifier-groups/do-chin',
      headers: auth(),
      payload: {
        name: 'Độ chín',
        required: true,
        multi: false,
        pickMin: 1,
        pickMax: 1,
        options: [{ id: 'do-chin-tai', name: 'Tái vừa', priceDelta: 0, affectsStock: false }],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ message: string }>().message).toContain('hai lựa chọn')
  })

  it('nhóm chọn một thì tối đa luôn là 1, dù gửi lên số khác', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/modifier-groups/do-chin',
      headers: auth(),
      payload: {
        name: 'Độ chín',
        required: false,
        multi: false,
        pickMin: 0,
        pickMax: 5,
        options: [
          { id: 'do-chin-tai', name: 'Tái vừa', priceDelta: 0, affectsStock: false },
          { name: 'Chín kỹ', priceDelta: 0, affectsStock: false },
        ],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const list = await inject({ method: 'GET', url: '/api/admin/modifier-groups', headers: auth() })
    const group = list.json<{ id: string; pickMax: number | null }[]>().find((g) => g.id === 'do-chin')
    expect(group?.pickMax).toBe(1)
  })
})

describe('Gắn nhóm vào món', () => {
  it('gắn nhóm cho món rồi đọc lại đúng thứ tự', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/dishes/bachibo/modifier-groups',
      headers: auth(),
      payload: { groupIds: ['do-chin', 'yaki-them'] },
    })
    expect(res.statusCode, res.payload).toBe(200)

    const read = await inject({
      method: 'GET',
      url: '/api/admin/dishes/bachibo/modifier-groups',
      headers: auth(),
    })
    expect(read.json<{ groupIds: string[] }>().groupIds).toEqual(['do-chin', 'yaki-them'])
  })

  it('POS thấy nhóm mới ngay ở bản cấu hình phát hành sau đó', async () => {
    const published = await inject({
      method: 'POST',
      url: `/api/office/config/publish?branch=${fx.branchId}`,
      headers: auth(),
    })
    expect(published.statusCode, published.payload).toBe(201)

    const bundle = await inject({
      method: 'GET',
      url: `/api/config?branch=${fx.branchId}`,
      headers: auth(),
    })
    const body = bundle.json<{
      dishes: { id: string; modifierGroupIds: string[] }[]
      modifiers: { id: string; options: { id: string; priceDelta: number }[] }[]
    }>()

    const dish = body.dishes.find((d) => d.id === 'bachibo')
    expect(dish?.modifierGroupIds).toContain('do-chin')
    expect(body.modifiers.find((m) => m.id === 'do-chin')?.options).toHaveLength(2)
  })

  it('xoá nhóm đang có món dùng thì bị chặn, gỡ khỏi món rồi mới xoá được', async () => {
    const blocked = await inject({
      method: 'DELETE',
      url: '/api/admin/modifier-groups/do-chin',
      headers: auth(),
    })
    expect(blocked.statusCode).toBe(409)

    await inject({
      method: 'PUT',
      url: '/api/admin/dishes/bachibo/modifier-groups',
      headers: auth(),
      payload: { groupIds: ['yaki-them'] },
    })

    const removed = await inject({
      method: 'DELETE',
      url: '/api/admin/modifier-groups/do-chin',
      headers: auth(),
    })
    expect(removed.statusCode, removed.payload).toBe(200)

    const list = await inject({ method: 'GET', url: '/api/admin/modifier-groups', headers: auth() })
    expect(list.json<{ id: string }[]>().some((g) => g.id === 'do-chin')).toBe(false)
  })

  it('thu ngân không sửa được nhóm tuỳ chọn', async () => {
    const cashier = (
      await inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { [DEVICE_HEADER]: SEED_DEVICE },
        payload: { branchId: fx.branchId, staffId: fx.cashierId, pin: fx.pins[fx.cashierId] },
      })
    ).json<{ token: string }>().token

    const res = await inject({
      method: 'PUT',
      url: '/api/admin/modifier-groups/yaki-them',
      headers: { authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE },
      payload: {
        name: 'Thêm',
        required: false,
        multi: true,
        pickMin: 0,
        pickMax: 3,
        options: [{ name: 'Tỏi nướng', priceDelta: 0, affectsStock: false }],
      },
    })
    expect(res.statusCode).toBe(403)
  })
})
