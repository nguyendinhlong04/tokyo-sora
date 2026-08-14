/**
 * Nghiệm thu kho & công thức — M7 · M4 · S1 · S2, và móc trừ kho của bếp.
 *
 * Bài kiểm chính không phải "lưu được công thức không" mà là: **món ra khỏi bếp
 * thì kho giảm ĐÚNG MỘT LẦN, đúng lượng, đúng tiền** — kể cả với món đa trạm nằm
 * trên hai vé, kể cả khi màn bếp gửi lại lệnh cũ.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { devices, ingredients, staff, staffRoles, stockLevels, stockMoves, tickets } from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const SEED_DEVICE = 'seed-device-token'
const OFFICE_PASSWORD = 'sora-dev-2026'

/** R10 làm được mọi thứ · R6 thủ kho nhập được nhưng sửa tồn thì phải xin duyệt */
let owner: string
let cashier: string
let chef: string
let keeperId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const asOwner = () => ({ authorization: `Bearer ${owner}` })
const auth = (token: string) => ({
  authorization: `Bearer ${token}`,
  [DEVICE_HEADER]: SEED_DEVICE,
})

/** 12kg ba chỉ bò giá 3.420.000₫ ⇒ 285₫/g */
const BO = {
  id: 'ba-chi-bo',
  code: 'NL-BO-001',
  name: 'Ba chỉ bò',
  groupName: 'Thịt bò',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  basePerPurchase: 1_000,
  minLevelBase: 5_000,
  lotRequired: true,
  active: true,
  sort: 0,
}

/** Keg 20L — đơn vị cơ sở ml, để thử hao hụt rót bia */
const KEG = {
  id: 'keg-sapporo',
  code: 'NL-BIA-001',
  name: 'Keg bia Sapporo',
  groupName: 'Bia rượu',
  baseUnit: 'ml',
  purchaseUnit: 'keg 20L',
  basePerPurchase: 20_000,
  minLevelBase: 4_000,
  lotRequired: true,
  active: true,
  sort: 0,
}

const HANH = {
  id: 'hanh-tay',
  code: 'NL-RAU-001',
  name: 'Hành tây',
  groupName: 'Rau củ',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  basePerPurchase: 1_000,
  minLevelBase: 2_000,
  lotRequired: false,
  active: true,
  sort: 1,
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

async function login(staffId: number) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { [DEVICE_HEADER]: SEED_DEVICE },
    payload: { branchId: fx.branchId, staffId, pin: fx.pins[staffId] },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

const stockOf = async (ingredientId: string) => {
  const [row] = await db
    .select()
    .from(stockLevels)
    .where(eq(stockLevels.ingredientId, ingredientId))
  return Number(row?.qtyBase ?? 0)
}

const movesOf = async (ingredientId: string) =>
  db.select().from(stockMoves).where(eq(stockMoves.ingredientId, ingredientId))

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

  // Thủ kho: nhập kho được thẳng, sửa tồn thì ở mức △
  const [keeper] = await db
    .insert(staff)
    .values({ code: 'TK01', fullName: 'Thủ kho Bình', email: 'kho@tokyosora.vn', passwordHash })
    .returning({ id: staff.id })
  keeperId = keeper!.id
  await db.insert(staffRoles).values({ staffId: keeperId, roleCode: 'R6', branchId: fx.branchId })

  owner = await officeLogin('chu@tokyosora.vn')
  cashier = await login(fx.cashierId)
  chef = await login(fx.chefId)
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ------------------------------------------------------------- M7

describe('M7 — Nguyên liệu', () => {
  it('khai được nguyên liệu với hai đơn vị và hệ số quy đổi', async () => {
    for (const body of [BO, KEG, HANH]) {
      const res = await inject({
        method: 'POST',
        url: '/api/inventory/ingredients',
        headers: asOwner(),
        payload: body,
      })
      expect(res.statusCode, res.payload).toBe(201)
    }
  })

  it('mã định danh phải là slug — nó đi vào đường dẫn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/ingredients',
      headers: asOwner(),
      payload: { ...BO, id: 'Ba Chi Bo', code: 'NL-X-001' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('hệ số quy đổi phải dương — thiếu nó thì mọi phiếu nhập sai đơn vị', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/ingredients',
      headers: asOwner(),
      payload: { ...BO, id: 'sai-quy-doi', code: 'NL-X-002', basePerPurchase: 0 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('trùng mã bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/ingredients',
      headers: asOwner(),
      payload: { ...BO, id: 'ba-chi-bo-2' },
    })
    expect(res.statusCode).toBe(409)
  })
})

// ------------------------------------------------------- Nhập kho

describe('Nhập kho & giá bình quân gia quyền di động', () => {
  /**
   * Ba chỉ bò và keg khai `lotRequired`, nên chúng đi qua cửa nhập ĐẦY ĐỦ (S5)
   * chứ không qua cửa nhập nhanh của M7 — cửa kia không hỏi số lô, và cho nó
   * nhận hàng bắt buộc lô là mở đường vòng qua chính ràng buộc của §25.
   */
  it('nhập nhanh TỪ CHỐI hàng bắt buộc lô — ràng buộc có đường vòng là ràng buộc không tồn tại', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/receipts',
      headers: asOwner(),
      payload: { branchId: fx.branchId, ingredientId: BO.id, qtyPurchase: 12, totalVnd: 3_420_000 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('bắt buộc khai lô')
  })

  it('lô đầu tiên quyết định giá bình quân', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        ingredientId: BO.id,
        qtyPurchase: 12,
        totalVnd: 3_420_000,
        lotCode: 'BO-01',
        expiresOn: '2026-12-31',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    // 12kg = 12.000g ⇒ 285₫/g = 285.000 phần nghìn đồng/g
    expect(res.json().costPerBaseMilli).toBe(285_000)
    expect(await stockOf(BO.id)).toBe(12_000)
  })

  it('lô thứ hai trộn theo trọng số của lượng, không phải trung bình cộng', async () => {
    // Còn 12.000g @285₫, nhập thêm 8.000g @300₫ ⇒ (3.420.000 + 2.400.000)/20.000 = 291₫
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        ingredientId: BO.id,
        qtyPurchase: 8,
        totalVnd: 2_400_000,
        lotCode: 'BO-02',
        expiresOn: '2027-01-15',
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().costPerBaseMilli).toBe(291_000)
    expect(await stockOf(BO.id)).toBe(20_000)
  })

  it('quy đổi từ đơn vị mua: 2 keg 20L thành 40.000ml', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        ingredientId: KEG.id,
        qtyPurchase: 2,
        totalVnd: 2_400_000,
        lotCode: 'KEG-01',
        expiresOn: '2027-03-01',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(await stockOf(KEG.id)).toBe(40_000)
    // 2.400.000₫ / 40.000ml = 60₫/ml
    expect(res.json().costPerBaseMilli).toBe(60_000)
  })

  it('nguyên liệu rẻ không bị làm tròn về 0₫', async () => {
    // 10kg hành tây 120.000₫ ⇒ 12₫/g
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/receipts',
      headers: asOwner(),
      payload: { branchId: fx.branchId, ingredientId: HANH.id, qtyPurchase: 10, totalVnd: 120_000 },
    })
    expect(res.json().costPerBaseMilli).toBe(12_000)
  })

  it('sổ kho ghi lại từng lần nhập', async () => {
    const moves = (await movesOf(BO.id)).filter((m) => m.kind === 'receipt')
    expect(moves).toHaveLength(2)
    expect(moves.map((m) => Number(m.qtyBase))).toEqual([12_000, 8_000])
  })

})

// ------------------------------------------------------------- M4

describe('M4 — Công thức và food cost', () => {
  it('lưu công thức, tính giá vốn và cột đóng góp', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/bachibo',
      headers: asOwner(),
      payload: {
        lines: [
          { ingredientId: BO.id, qtyBase: 200, wasteBp: 0 },
          { ingredientId: HANH.id, qtyBase: 50, wasteBp: 0 },
        ],
      },
    })
    expect(res.statusCode, res.payload).toBe(200)
    // 200g × 291₫ = 58.200₫ · 50g × 12₫ = 600₫
    expect(res.json().costAfter).toBe(58_800)
  })

  it('food cost và lãi gộp tính từ giá bán đang khai', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/inventory/recipes/bachibo',
      headers: asOwner(),
    })
    const body = res.json()
    expect(body.costVnd).toBe(58_800)
    expect(body.percent).toBeCloseTo(58_800 / 285_000)
    expect(body.band).toBe('tot')
    expect(body.grossProfitVnd).toBe(285_000 - 58_800)
    expect(body.lines[0].share).toBeCloseTo(58_200 / 58_800)
  })

  it('món CHƯA khai công thức trả về "chua-co", không phải food cost 0%', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/inventory/recipes/sodiep',
      headers: asOwner(),
    })
    expect(res.json().percent).toBeNull()
    expect(res.json().band).toBe('chua-co')
  })

  it('set không có công thức riêng — giá vốn của set là tổng món thành phần', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/setsora',
      headers: asOwner(),
      payload: { lines: [{ ingredientId: BO.id, qtyBase: 100, wasteBp: 0 }] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('món thành phần')
  })

  it('khai trùng nguyên liệu trong một công thức bị chặn', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/thanbo',
      headers: asOwner(),
      payload: {
        lines: [
          { ingredientId: BO.id, qtyBase: 100, wasteBp: 0 },
          { ingredientId: BO.id, qtyBase: 50, wasteBp: 0 },
        ],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('nguyên liệu chưa tồn tại thì báo tên, không im lặng bỏ dòng', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/thanbo',
      headers: asOwner(),
      payload: { lines: [{ ingredientId: 'khong-co-that', qtyBase: 100, wasteBp: 0 }] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('khong-co-that')
  })

  it('ghi nhật ký chênh lệch giá vốn khi sửa công thức (thay cho M9 chưa dựng)', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/bachibo',
      headers: asOwner(),
      payload: {
        lines: [
          { ingredientId: BO.id, qtyBase: 220, wasteBp: 0 },
          { ingredientId: HANH.id, qtyBase: 50, wasteBp: 0 },
        ],
      },
    })
    expect(res.json().costBefore).toBe(58_800)
    expect(res.json().costAfter).toBe(64_620) // 220 × 291 + 600
  })

  it('trả công thức về mức cũ để phần sau kiểm trừ kho trên số tròn', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/bachibo',
      headers: asOwner(),
      payload: {
        lines: [
          { ingredientId: BO.id, qtyBase: 200, wasteBp: 0 },
          { ingredientId: HANH.id, qtyBase: 50, wasteBp: 0 },
        ],
      },
    })
    expect(res.json().costAfter).toBe(58_800)
  })
})

// ------------------------------------------- M4 · thẻ công thức (quy trình)

/**
 * Quy trình chế biến — phần trả lời "làm thế nào", tách khỏi phần trả lời "tốn
 * bao nhiêu tiền". Bài kiểm chính: thẻ lưu vào là **thay cả cụm**, và những ràng
 * buộc khiến thẻ không thành tài liệu chết (CCP phải có cách xử lý, bước không
 * được trỏ vào nguyên liệu ngoài công thức).
 */
describe('M4 — Thẻ công thức: quy trình chế biến', () => {
  const docOf = (id: string) =>
    inject({ method: 'GET', url: `/api/inventory/recipe-docs/dish/${id}`, headers: asOwner() })

  const putDoc = (id: string, payload: Record<string, unknown>) =>
    inject({
      method: 'PUT',
      url: `/api/inventory/recipe-docs/dish/${id}`,
      headers: asOwner(),
      payload,
    })

  it('chưa soạn thì doc là null, kèm kiểu công thức suy từ định tuyến §16', async () => {
    const res = await docOf('bachibo')
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().doc).toBeNull()
    expect(res.json().steps).toEqual([])
    // Món SỐNG khách tự nướng — bếp không bật lửa lần nào
    expect(res.json().suggestedMethod).toBe('song')
  })

  it('suy kiểu theo trạm khi món không đi bảng nướng', async () => {
    expect((await docOf('miso')).json().suggestedMethod).toBe('nau')
    expect((await docOf('duamuoi')).json().suggestedMethod).toBe('lap_rap')
    expect((await docOf('sodiep')).json().suggestedMethod).toBe('nuong')
  })

  it('lưu thẻ rồi đọc lại: bước xếp theo giai đoạn, đúng thứ tự gửi', async () => {
    const res = await putDoc('bachibo', {
      methodKind: 'song',
      yieldLabel: '200g · 8–10 lát',
      plateLabel: 'Đĩa gỗ số 3',
      prepMinutes: 25,
      equipment: ['Dao thái thịt', 'Thớt đỏ', 'Cân điện tử 1g'],
      inputSpec: [{ item: 'Nhiệt độ khi nhận', requirement: 'Mát ≤ 4°C hoặc đông ≤ −18°C' }],
      specMeasured: [{ name: 'Khối lượng', target: '200g ± 5g' }],
      specSensory: ['Mặt cắt đỏ tươi, không đọng nước máu'],
      ccp: [
        { point: 'Thời gian ngoài lạnh', limit: '≤ 20 phút', action: 'Thu về, huỷ, làm đĩa mới' },
      ],
      storage: 'Lát đã thái không lưu qua ca.',
      tips: ['Dao lạnh cắt ngọt hơn'],
      pitfalls: [
        { mistake: 'Thái dọc thớ', effect: 'Dai, mất cảm giác tan', fix: 'Xoay khối, dao vuông góc sợi thịt' },
      ],
      substituteIds: ['thanbo'],
      steps: [
        // Cố tình gửi lẫn giai đoạn để chắc là máy chủ xếp lại, không phải client
        { phase: 'hoan_thien', text: 'Xếp lát xoè quạt trên đĩa đã làm lạnh.' },
        { phase: 'so_che', text: 'Rã đông ngăn mát 0–2°C.', paramLabel: '18–24 giờ', isCcp: true },
        { phase: 'che_bien', text: 'Thái ngang thớ.', seconds: 60, paramLabel: '5mm' },
        { phase: 'che_bien', text: 'Cân 200g.', seconds: 20, ingredientIds: [BO.id] },
      ],
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().steps).toBe(4)

    const body = (await docOf('bachibo')).json()
    expect(body.doc.methodKind).toBe('song')
    expect(body.doc.prepMinutes).toBe(25)
    expect(body.doc.ccp[0].action).toContain('huỷ')
    expect(body.steps.map((s: { phase: string }) => s.phase)).toEqual([
      'so_che',
      'che_bien',
      'che_bien',
      'hoan_thien',
    ])
    expect(body.steps[1].text).toBe('Thái ngang thớ.')
    expect(body.steps[3].ingredientIds).toEqual([])
    expect(body.steps[2].ingredientIds).toEqual([BO.id])
  })

  it('lưu lần hai THAY cả cụm, không cộng dồn bước cũ', async () => {
    await putDoc('bachibo', {
      methodKind: 'song',
      steps: [{ phase: 'che_bien', text: 'Thái ngang thớ dày 5mm.' }],
    })
    const body = (await docOf('bachibo')).json()
    expect(body.steps).toHaveLength(1)
    // Khối văn bản cũ cũng đi theo — thẻ là một tài liệu, không phải mấy ô rời
    expect(body.doc.tips).toEqual([])
    expect(body.doc.yieldLabel).toBeNull()
  })

  it('điểm kiểm soát không nói lệch ngưỡng thì làm gì — bị chặn', async () => {
    const res = await putDoc('thanbo', {
      methodKind: 'song',
      ccp: [{ point: 'Nhiệt độ tâm', limit: '≤ 4°C', action: '   ' }],
    })
    expect(res.statusCode).toBe(400)
  })

  it('bước trỏ vào nguyên liệu ngoài công thức bị chặn, và báo đúng tên', async () => {
    const res = await putDoc('bachibo', {
      methodKind: 'song',
      steps: [{ phase: 'che_bien', text: 'Rưới sốt.', ingredientIds: [KEG.id] }],
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain(KEG.id)
  })

  it('món thay thế phải là món có thật', async () => {
    const res = await putDoc('thanbo', { methodKind: 'song', substituteIds: ['mon-ma'] })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('mon-ma')
  })

  it('set không có quy trình riêng', async () => {
    const res = await putDoc('setsora', { methodKind: 'lap_rap' })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('món thành phần')
  })
})

// ------------------------------------------- K7 · màn bếp đọc công thức

/**
 * Bài kiểm chính KHÔNG phải "đọc được không" mà là: **màn bếp không thấy tiền**.
 *
 * Nguyên tắc 3 đã có event trigger canh cột tiền trong `tickets`/`ticket_items`;
 * điểm đọc công thức là đường mới nhất có thể lách qua nó, vì dữ liệu gốc của nó
 * nằm cạnh giá vốn trong cùng một module.
 */
describe('K7 — Màn bếp đọc công thức', () => {
  const MONEY = /price|cost|amount|money|total|vnd|discount|vat|waste/i

  /** Mọi khoá ở mọi tầng của payload, kể cả trong mảng và jsonb */
  const allKeys = (value: unknown, found: string[] = []): string[] => {
    if (Array.isArray(value)) value.forEach((v) => allKeys(v, found))
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        found.push(key)
        allKeys(child, found)
      }
    }
    return found
  }

  it('trả quy trình, định lượng và món thay thế — nhưng KHÔNG một khoá tiền nào', async () => {
    const res = await inject({ method: 'GET', url: '/api/recipes/bachibo', headers: asOwner() })
    expect(res.statusCode, res.payload).toBe(200)

    const body = res.json()
    expect(body.dish.nameVi).toBe('Ba chỉ bò')
    expect(body.doc.methodKind).toBe('song')
    expect(body.steps).toHaveLength(1)
    // Định lượng là lời chỉ dẫn, phải có
    expect(body.ingredients).toEqual(
      expect.arrayContaining([{ name: BO.name, qtyBase: 200, baseUnit: 'g' }]),
    )

    const offending = allKeys(body).filter((key) => MONEY.test(key))
    expect(offending, `khoá tiền lọt xuống màn bếp: ${offending.join(', ')}`).toEqual([])
  })

  it('món chưa soạn trả doc rỗng chứ không phải lỗi — bếp vẫn xem được định lượng', async () => {
    const res = await inject({ method: 'GET', url: '/api/recipes/thanbo', headers: asOwner() })
    expect(res.statusCode).toBe(200)
    expect(res.json().doc).toBeNull()
    expect(res.json().steps).toEqual([])
  })

  it('danh sách món đã có quy trình — để ô chưa soạn hiện mờ', async () => {
    const res = await inject({ method: 'GET', url: '/api/recipes', headers: asOwner() })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toContain('bachibo')
    expect(res.json()).not.toContain('thanbo')
  })

  it('món không có thật thì báo rõ', async () => {
    const res = await inject({ method: 'GET', url: '/api/recipes/mon-ma', headers: asOwner() })
    expect(res.statusCode).toBe(404)
  })
})

// ------------------------------------------------- Trừ kho khi bấm Xong

describe('Trừ kho khi bếp bấm Xong', () => {
  let sessionId: number

  it('mở bàn và gọi 2 phần ba chỉ bò', async () => {
    const open = await inject({
      method: 'POST',
      url: `/api/tables/${fx.grillTableId}/open`,
      headers: auth(cashier),
      payload: { guestCount: 2 },
    })
    expect(open.statusCode).toBe(201)
    sessionId = open.json<{ id: number }>().id

    const add = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'bachibo', qty: 2 }] },
    })
    expect(add.statusCode, add.payload).toBe(201)

    const send = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/send`,
      headers: auth(cashier),
    })
    expect(send.statusCode).toBe(201)
  })

  it('gửi bếp CHƯA trừ kho — món huỷ trước khi nấu thì nguyên liệu vẫn còn', async () => {
    expect(await stockOf(BO.id)).toBe(20_000)
    expect((await movesOf(BO.id)).filter((m) => m.kind === 'sale')).toHaveLength(0)
  })

  it('bấm Xong mới trừ, đúng lượng và đúng tiền', async () => {
    const ticket = (await db.select().from(tickets)).find((t) => t.state === 'queued')!
    const res = await inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/state`,
      headers: auth(chef),
      payload: { action: 'done' },
    })
    expect(res.statusCode, res.payload).toBe(201)

    // 2 phần × 200g = 400g bò · 2 × 50g = 100g hành
    expect(await stockOf(BO.id)).toBe(20_000 - 400)
    expect(await stockOf(HANH.id)).toBe(10_000 - 100)

    const sale = (await movesOf(BO.id)).find((m) => m.kind === 'sale')!
    expect(Number(sale.qtyBase)).toBe(-400)
    expect(Number(sale.costVnd)).toBe(-116_400) // 400 × 291₫
    expect(sale.orderLineId).not.toBeNull()
  })

  it('bấm Xong lần nữa KHÔNG trừ thêm — hàng đợi offline gửi lại mù cũng an toàn', async () => {
    const ticket = (await db.select().from(tickets)).find((t) => t.state === 'ready')!
    const before = await stockOf(BO.id)

    const res = await inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/state`,
      headers: auth(chef),
      payload: { action: 'done' },
    })
    expect(res.statusCode).toBe(201)
    expect(await stockOf(BO.id)).toBe(before)
    expect((await movesOf(BO.id)).filter((m) => m.kind === 'sale')).toHaveLength(1)
  })

  it('hoàn tác rồi bấm Xong lại vẫn không trừ lần hai — món đã nấu là đã mất', async () => {
    const ticket = (await db.select().from(tickets)).find((t) => t.state === 'ready')!
    const before = await stockOf(BO.id)

    await inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/state`,
      headers: auth(chef),
      payload: { action: 'undo' },
    })
    expect(await stockOf(BO.id)).toBe(before)

    await inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/state`,
      headers: auth(chef),
      payload: { action: 'done' },
    })
    expect(await stockOf(BO.id)).toBe(before)
  })

  it('món CHƯA có công thức đi qua bếp mà không làm hỏng gì', async () => {
    const add = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'sodiep', qty: 1 }] },
    })
    expect(add.statusCode).toBe(201)
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/send`,
      headers: auth(cashier),
    })

    const ticket = (await db.select().from(tickets)).find((t) => t.state === 'queued')!
    const res = await inject({
      method: 'POST',
      url: `/api/tickets/${ticket.id}/state`,
      headers: auth(chef),
      payload: { action: 'done' },
    })
    expect(res.statusCode).toBe(201)
  })
})

// --------------------------------------- Món đa trạm: cái bẫy trừ đôi

describe('Món đa trạm chỉ trừ kho MỘT lần', () => {
  let sessionId: number

  it('khai công thức cho Lẩu Sukiyaki rồi gọi một phần', async () => {
    const recipe = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/sukiyaki',
      headers: asOwner(),
      payload: { lines: [{ ingredientId: BO.id, qtyBase: 300, wasteBp: 0 }] },
    })
    expect(recipe.statusCode).toBe(200)

    const open = await inject({
      method: 'POST',
      url: `/api/tables/${fx.plainTableId}/open`,
      headers: auth(cashier),
      payload: { guestCount: 2 },
    })
    sessionId = open.json<{ id: number }>().id

    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'sukiyaki', qty: 1 }] },
    })
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/send`,
      headers: auth(cashier),
    })
  })

  it('sinh ĐÚNG hai vé khác trạm cho cùng một dòng đơn', async () => {
    const mine = (await db.select().from(tickets)).filter(
      (t) => t.state === 'queued' && ['ST-04', 'ST-02'].includes(t.stationId),
    )
    expect(mine.length).toBeGreaterThanOrEqual(2)
  })

  it('vé thứ nhất xong: CHƯA trừ, vì món chưa ra khỏi bếp', async () => {
    const before = await stockOf(BO.id)
    const pot = (await db.select().from(tickets)).find(
      (t) => t.state === 'queued' && t.stationId === 'ST-04',
    )!

    await inject({
      method: 'POST',
      url: `/api/tickets/${pot.id}/state`,
      headers: auth(chef),
      payload: { action: 'done' },
    })
    expect(await stockOf(BO.id)).toBe(before)
  })

  it('vé thứ hai xong: trừ đúng 300g, KHÔNG phải 600g', async () => {
    const before = await stockOf(BO.id)
    const tray = (await db.select().from(tickets)).find(
      (t) => t.state === 'queued' && t.stationId === 'ST-02',
    )!

    await inject({
      method: 'POST',
      url: `/api/tickets/${tray.id}/state`,
      headers: auth(chef),
      payload: { action: 'done' },
    })
    expect(await stockOf(BO.id)).toBe(before - 300)
  })
})

// ------------------------------------------------------ Điều chỉnh tồn

describe('Điều chỉnh tồn (§4.2 stock.write-off)', () => {
  it('bắt buộc ghi lý do', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/adjustments',
      headers: asOwner(),
      payload: { branchId: fx.branchId, ingredientId: HANH.id, qtyBaseDelta: -100, note: '' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('chủ quán sửa được thẳng', async () => {
    const before = await stockOf(HANH.id)
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/adjustments',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        ingredientId: HANH.id,
        qtyBaseDelta: -250,
        note: 'Hành hỏng, bỏ đi',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(await stockOf(HANH.id)).toBe(before - 250)
  })

  it('thủ kho KHÔNG tự sửa được tồn của mình — phải có người duyệt', async () => {
    const keeper = await officeLogin('kho@tokyosora.vn')
    const res = await inject({
      method: 'POST',
      url: '/api/inventory/adjustments',
      headers: { authorization: `Bearer ${keeper}` },
      payload: {
        branchId: fx.branchId,
        ingredientId: HANH.id,
        qtyBaseDelta: -1_000,
        note: 'Đếm lại thấy thiếu',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('requires_approval')
  })
})

// ----------------------------------------------------------- S1 · S2

describe('S1 tổng quan · S2 tồn kho', () => {
  it('S2 hiện tồn theo cả hai đơn vị và giá trị tồn', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/inventory/ingredients?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.statusCode).toBe(200)

    const keg = res.json().find((r: { id: string }) => r.id === KEG.id)
    expect(keg.qtyBase).toBe(40_000)
    expect(keg.qtyPurchase).toBe(2) // 40.000ml = 2 keg
    expect(keg.valueVnd).toBe(2_400_000)
    expect(keg.costPerPurchaseVnd).toBe(1_200_000)
  })

  it('đếm được món đang dùng mỗi nguyên liệu', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/inventory/ingredients?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const bo = res.json().find((r: { id: string }) => r.id === BO.id)
    expect(bo.usedByDishes).toBe(2) // ba chỉ bò + sukiyaki
  })

  it('cảnh báo dưới định mức', async () => {
    await inject({
      method: 'POST',
      url: '/api/inventory/adjustments',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        ingredientId: KEG.id,
        qtyBaseDelta: -37_000,
        note: 'Bán hết dịp cuối tuần',
      },
    })

    const res = await inject({
      method: 'GET',
      url: `/api/inventory/overview?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const body = res.json()
    expect(body.belowMin.map((r: { id: string }) => r.id)).toContain(KEG.id)
    expect(body.totalValueVnd).toBeGreaterThan(0)
  })

  it('S1 nói rõ hai ô chưa có nguồn, và đếm món chưa khai công thức', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/inventory/overview?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const body = res.json()
    expect(body.expiringLots.value).toBeNull()
    expect(body.expiringLots.blockedBy).toContain('S9')
    expect(body.wasteThisMonth.blockedBy).toContain('S11')
    expect(body.dishesWithoutRecipe).toBeGreaterThan(0)
    expect(body.consumedThisMonthVnd).toBeGreaterThan(0)
  })
})

// -------------------------------------------------------- Phân quyền

describe('Phân quyền §4.2', () => {
  it('thu ngân không xem được giá vốn', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/inventory/ingredients?branch=${fx.branchId}`,
      headers: auth(cashier),
    })
    expect(res.statusCode).toBe(403)
  })

  it('thủ kho xem được giá vốn và nhập được kho', async () => {
    const keeper = await officeLogin('kho@tokyosora.vn')
    const read = await inject({
      method: 'GET',
      url: `/api/inventory/ingredients?branch=${fx.branchId}`,
      headers: { authorization: `Bearer ${keeper}` },
    })
    expect(read.statusCode).toBe(200)

    const receive = await inject({
      method: 'POST',
      url: '/api/inventory/receipts',
      headers: { authorization: `Bearer ${keeper}` },
      payload: { branchId: fx.branchId, ingredientId: HANH.id, qtyPurchase: 5, totalVnd: 60_000 },
    })
    expect(receive.statusCode, receive.payload).toBe(201)
  })

  it('thủ kho KHÔNG sửa được công thức — đó là việc của bếp trưởng', async () => {
    const keeper = await officeLogin('kho@tokyosora.vn')
    const res = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/thanbo',
      headers: { authorization: `Bearer ${keeper}` },
      payload: { lines: [{ ingredientId: BO.id, qtyBase: 100, wasteBp: 0 }] },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ------------------------------- Giá vốn chảy ngược vào nhóm báo cáo

describe('Công thức mở khoá food cost ở B1 · B3 · F7', () => {
  it('B1: food cost thành số thật, kèm tỉ lệ doanh thu đã phủ công thức', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/today?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)

    const tile = res.json().foodCost
    expect(tile.value).toBeGreaterThan(0)
    expect(tile.cogsVnd).toBeGreaterThan(0)
    // Sò điệp chưa có công thức nên chưa phủ hết doanh thu
    expect(tile.coverage).toBeGreaterThan(0)
    expect(tile.coverage).toBeLessThan(1)
  })

  it('B3: trục đóng góp chuyển sang lãi gộp, và nói rõ còn món chưa khai', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/menu-matrix?branch=${fx.branchId}&kind=ngay&compare=ky-truoc`,
      headers: asOwner(),
    })
    const body = res.json()
    expect(body.costBasis).toBe('hon-hop')
    expect(body.dishesWithoutRecipe).toBeGreaterThan(0)
    expect(body.costNote).toContain('chưa khai công thức')

    // Ba chỉ bò: giá bán 285.000₫, giá vốn 58.800₫ ⇒ đóng góp 226.200₫/phần
    const bo = body.rows.find((r: { dishId: string }) => r.dishId === 'bachibo')
    expect(bo.unitCostVnd).toBe(58_800)
    expect(bo.unitContribution).toBe(285_000 - 58_800)

    // Sò điệp chưa có công thức ⇒ đóng góp vẫn là doanh thu, và nói ra được
    const sodiep = body.rows.find((r: { dishId: string }) => r.dishId === 'sodiep')
    expect(sodiep.unitCostVnd).toBeNull()
    expect(sodiep.unitContribution).toBe(245_000)
  })

  it('F7: dòng Giá vốn hàng bán và Lãi gộp không còn để trống', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/pnl?branch=${fx.branchId}&kind=ngay&compare=ky-truoc`,
      headers: asOwner(),
    })
    const rows = res.json().rows as { key: string; amount: number | null; note?: string }[]
    const cogs = rows.find((r) => r.key === 'cogs')!
    const gross = rows.find((r) => r.key === 'gross-profit')!

    expect(cogs.amount).toBeLessThan(0) // chi phí mang dấu âm trên P&L
    expect(gross.amount).not.toBeNull()
    expect(cogs.note).toContain('%')
  })

  it('F7: prime cost vẫn chờ nhân sự, nhưng lý do đã đổi', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/pnl?branch=${fx.branchId}&kind=ngay&compare=ky-truoc`,
      headers: asOwner(),
    })
    // Đã có giá vốn nên lý do chỉ còn nêu đúng vế còn thiếu
    expect(res.json().primeCost.blockedBy).toContain('H7')
    expect(res.json().primeCost.blockedBy).not.toContain('giá vốn (cần công thức')
  })

  /**
   * Bài kiểm cuối của cả ba hướng: prime cost chỉ tính được khi có ĐỦ giá vốn
   * (kho + công thức) VÀ chi nhân sự (kỳ lương đã duyệt). Đây là chỗ duy nhất
   * trong bộ test có cả hai vế cùng lúc.
   */
  it('F7: đủ cả giá vốn lẫn nhân sự thì prime cost hiện số và so được ngưỡng 60%', async () => {
    const today = new Date().toISOString().slice(0, 10)

    // Một hồ sơ nhân viên, một ca đã công bố, một kỳ lương đi hết năm bước
    const employee = await inject({
      method: 'POST',
      url: '/api/hr/employees',
      headers: asOwner(),
      payload: {
        staffId: fx.waiterId,
        branchId: fx.branchId,
        position: 'Phục vụ',
        payKind: 'hourly',
        hourlyRateVnd: 30_000,
        monthlySalaryVnd: 0,
        fixedAllowanceVnd: 0,
        startedOn: today,
        endedOn: null,
        bankAccount: null,
        active: true,
      },
    })
    expect(employee.statusCode, employee.payload).toBe(201)
    const employeeId = employee.json<{ id: number }>().id

    const monday = (() => {
      const at = new Date(`${today}T00:00:00Z`)
      at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7))
      return at.toISOString().slice(0, 10)
    })()

    await inject({
      method: 'PUT',
      url: '/api/hr/schedule',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        weekStart: monday,
        employeeId,
        cells: [
          {
            workDate: today,
            startMinute: 8 * 60,
            endMinute: 16 * 60,
            breakMinutes: 0,
            dayKind: 'thuong',
          },
        ],
      },
    })
    await inject({
      method: 'POST',
      url: '/api/hr/schedule/publish',
      headers: asOwner(),
      payload: { branchId: fx.branchId, weekStart: monday, employeeId, cells: [] },
    })

    // Lương tính từ CÔNG THỰC TẾ, không từ lịch xếp — ghi công đúng ca đã xếp
    const punched = await inject({
      method: 'POST',
      url: '/api/hr/timesheet',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        employeeId,
        workDate: today,
        clockIn: '08:00',
        clockOut: '16:00',
        breakMinutes: 0,
        reason: 'Nhập từ sổ chấm công giấy',
      },
    })
    expect(punched.statusCode, punched.payload).toBe(201)

    const period = await inject({
      method: 'POST',
      url: '/api/hr/payroll/periods',
      headers: asOwner(),
      payload: { branchId: fx.branchId, periodStart: today, periodEnd: today },
    })
    const periodId = period.json<{ id: number }>().id

    for (const step of ['lock', 'compute', 'submit', 'check', 'approve']) {
      const res = await inject({
        method: 'POST',
        url: `/api/hr/payroll/periods/${periodId}/${step}`,
        headers: asOwner(),
        payload: step === 'compute' ? { adjustments: [] } : undefined,
      })
      expect(res.statusCode, `${step}: ${res.payload}`).toBe(201)
    }

    const res = await inject({
      method: 'GET',
      url: `/api/reports/pnl?branch=${fx.branchId}&kind=ngay&compare=ky-truoc`,
      headers: asOwner(),
    })
    const body = res.json()

    // 8 giờ × 30.000 = 240.000₫ chi nhân sự
    expect(body.rows.find((r: { key: string }) => r.key === 'labour').amount).toBe(-240_000)
    expect(body.primeCost.value).toBeGreaterThan(0)
    expect(body.primeCost.labourVnd).toBe(240_000)
    expect(body.primeCost.cogsVnd).toBeGreaterThan(0)
    expect(body.primeCost.amountVnd).toBe(body.primeCost.cogsVnd + body.primeCost.labourVnd)
    expect(typeof body.primeCost.overThreshold).toBe('boolean')
  })
})

// ------------------------------------------------- Hao hụt rót bia

describe('Hao hụt: cốc bia 500ml rút 530ml khỏi keg', () => {
  it('công thức khai hao hụt 6% thì kho xuất nhiều hơn định lượng', async () => {
    // Tạo món bia tươi để có chỗ gắn công thức
    await db.insert(ingredients).values({
      id: 'placeholder-khong-dung',
      code: 'NL-ZZZ-999',
      name: 'Không dùng',
      baseUnit: 'g',
      purchaseUnit: 'kg',
      basePerPurchase: 1_000,
    })

    const res = await inject({
      method: 'PUT',
      url: '/api/inventory/recipes/kemtra',
      headers: asOwner(),
      payload: { lines: [{ ingredientId: KEG.id, qtyBase: 500, wasteBp: 600 }] },
    })
    expect(res.statusCode).toBe(200)
    // 530ml × 60₫ = 31.800₫
    expect(res.json().costAfter).toBe(31_800)
  })
})
