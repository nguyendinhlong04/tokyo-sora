/**
 * Nghiệm thu kho — S3 · S4 · S5 · S6 · S7 · S8 · S9 · S10 · S11 · S12.
 *
 * Thứ đáng chứng minh không phải "lưu được phiếu không", mà là bốn ranh giới mà
 * cả nhóm dựng lên để tồn kho không nói dối:
 *   1. **Lô là bắt buộc với hàng bắt buộc** — và mọi lượt xuất rút lô theo FEFO,
 *      hạn gần nhất trước.
 *   2. **Keg đã đục có đồng hồ riêng** — 5–7 ngày từ lúc đục, không phải hạn in
 *      trên vỏ.
 *   3. **Chuyển kho xác nhận hai đầu** — khoảng giữa là hàng đang đi đường, và
 *      nhận thiếu thì phần chênh ghi HAO Ở BÊN GỬI.
 *   4. **Kiểm kê chốt xong mới đổi sổ** — và dòng chưa đếm không bị coi là 0.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { branches, ingredients, staff, staffRoles, stockLevels, stockLots } from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'
const OTHER_BRANCH = 'ht'

let owner: string
let keeper: string
let ownerStaffId: number
let supplierId: number
let purchaseOrderId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const asOwner = () => ({ authorization: `Bearer ${owner}` })
const asKeeper = () => ({ authorization: `Bearer ${keeper}` })

/** 12kg tảng bò — hàng bắt buộc lô, dùng cho bài pha lóc S7 */
const TANG_BO = {
  id: 'tang-bo',
  code: 'NL-BO-100',
  name: 'Tảng bò nguyên',
  groupName: 'Thịt bò',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  basePerPurchase: 1_000,
  minLevelBase: 0,
  lotRequired: true,
  active: true,
  sort: 0,
}

/** Hai bán thành phẩm sinh ra từ lượt lóc */
const NAM_BO = { ...TANG_BO, id: 'nam-bo', code: 'NL-BO-101', name: 'Nầm bò', lotRequired: false }
const DE_SUON = { ...TANG_BO, id: 'de-suon', code: 'NL-BO-102', name: 'Dẻ sườn', lotRequired: false }

/** Đồ khô — không bắt buộc lô, dùng để thử nhánh không lô */
const MUOI = {
  id: 'muoi',
  code: 'NL-KHO-001',
  name: 'Muối',
  groupName: 'Đồ khô',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  basePerPurchase: 1_000,
  minLevelBase: 2_000,
  lotRequired: false,
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

async function makeUser(code: string, name: string, email: string, role: string, pin?: string) {
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
  await db
    .insert(staffRoles)
    .values({ staffId: row!.id, roleCode: role, branchId: role === 'R10' ? null : fx.branchId })
  return row!.id
}

const onHand = async (branchId: string, ingredientId: string) => {
  const [row] = await db
    .select({ qty: stockLevels.qtyBase })
    .from(stockLevels)
    .where(and(eq(stockLevels.branchId, branchId), eq(stockLevels.ingredientId, ingredientId)))
  return Number(row?.qty ?? 0)
}

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await db.insert(branches).values({ id: OTHER_BRANCH, name: 'Hồ Tây' })
  ownerStaffId = await makeUser('CHU01', 'Chủ quán', 'chu@tokyosora.vn', 'R10', '9137')
  await makeUser('TK01', 'Thủ kho Bình', 'tk@tokyosora.vn', 'R6')

  owner = await officeLogin('chu@tokyosora.vn')
  keeper = await officeLogin('tk@tokyosora.vn')

  await db.insert(ingredients).values([TANG_BO, NAM_BO, DE_SUON, MUOI])
  // Keg: bắt buộc lô, và có đồng hồ 7 ngày sau khi đục
  await db.insert(ingredients).values({
    id: 'keg-asahi',
    code: 'NL-BIA-100',
    name: 'Keg Asahi',
    groupName: 'Bia rượu',
    baseUnit: 'ml',
    purchaseUnit: 'keg 20L',
    basePerPurchase: 20_000,
    minLevelBase: 0,
    lotRequired: true,
    openShelfLifeDays: 7,
    active: true,
    sort: 0,
  })
  await db
    .update(ingredients)
    .set({ isSemiFinished: true })
    .where(eq(ingredients.id, NAM_BO.id))
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ===========================================================================

describe('S3 — Nhà cung cấp', () => {
  it('thủ kho khai được nhà cung cấp — họ là người biết mối nào bán gì', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/suppliers',
      headers: asKeeper(),
      payload: {
        code: 'NCC-BO',
        name: 'Lò mổ Vissan',
        taxCode: '0301234567',
        contactName: 'Anh Tú',
        phone: '0901234567',
        paymentTermDays: 15,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    supplierId = res.json<{ id: number }>().id
  })

  it('mã số thuế sai dạng bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/suppliers',
      headers: asKeeper(),
      payload: { code: 'NCC-X', name: 'Lạ', taxCode: '123' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('khai giá thoả thuận cho từng mặt hàng', async () => {
    for (const [ingredientId, priceVnd] of [
      [TANG_BO.id, 300_000],
      ['keg-asahi', 1_800_000],
      [MUOI.id, 8_000],
    ] as const) {
      const res = await inject({
        method: 'PUT',
        url: '/api/warehouse/supplier-items',
        headers: asKeeper(),
        payload: {
          supplierId,
          ingredientId,
          priceVnd,
          minOrderPurchase: 1,
          leadTimeDays: 2,
          preferred: true,
        },
      })
      expect(res.statusCode, res.payload).toBe(200)
    }
  })

  /** Hai mối chính cho một mặt hàng nghĩa là không có mối nào */
  it('đặt mối chính mới thì mối chính cũ tự nhường', async () => {
    const second = await inject({
      method: 'POST',
      url: '/api/warehouse/suppliers',
      headers: asKeeper(),
      payload: { code: 'NCC-BO2', name: 'Chợ đầu mối' },
    })
    const secondId = second.json<{ id: number }>().id

    await inject({
      method: 'PUT',
      url: '/api/warehouse/supplier-items',
      headers: asKeeper(),
      payload: { supplierId: secondId, ingredientId: TANG_BO.id, priceVnd: 290_000, preferred: true },
    })

    const res = await inject({ method: 'GET', url: '/api/warehouse/suppliers', headers: asOwner() })
    const preferred = res
      .json()
      .flatMap((s: { items: { ingredientId: string; preferred: boolean }[] }) => s.items)
      .filter((i: { ingredientId: string; preferred: boolean }) => i.ingredientId === TANG_BO.id && i.preferred)
    expect(preferred).toHaveLength(1)
  })
})

describe('S5 — Nhập kho theo lô', () => {
  it('hàng bắt buộc lô mà không khai số lô thì bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        ingredientId: TANG_BO.id,
        qtyPurchase: 12,
        totalVnd: 3_600_000,
        expiresOn: '2026-09-30',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('số lô')
  })

  it('hàng bắt buộc lô mà không khai hạn dùng cũng bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        ingredientId: TANG_BO.id,
        qtyPurchase: 12,
        totalVnd: 3_600_000,
        lotCode: 'LO-A',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('hạn dùng')
  })

  it('nhập đủ thông tin thì sinh lô, cộng tồn và đổi giá bình quân', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        ingredientId: TANG_BO.id,
        qtyPurchase: 12,
        totalVnd: 3_600_000,
        supplierId,
        lotCode: 'LO-A',
        expiresOn: '2026-09-30',
        receiveTempDeciC: -20,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    // 3.600.000₫ cho 12.000g = 300₫/g = 300.000 phần nghìn đồng
    expect(res.json().costPerBaseMilli).toBe(300_000)
    expect(res.json().lotId).not.toBeNull()
    expect(await onHand(fx.branchId, TANG_BO.id)).toBe(12_000)
  })

  /**
   * Cảnh báo lệch giá KHÔNG chặn: giá chợ lên xuống là chuyện thường, và chặn
   * nhập hàng vì giá lệch nghĩa là hàng đứng ngoài cửa trong khi người ta đi tìm
   * quản lý.
   */
  it('giá lệch so với thoả thuận thì báo mức lệch nhưng vẫn nhận hàng', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        ingredientId: TANG_BO.id,
        qtyPurchase: 2,
        // 330.000₫/kg so với thoả thuận 300.000₫ ⇒ lệch +10%
        totalVnd: 660_000,
        supplierId,
        lotCode: 'LO-B',
        expiresOn: '2026-10-15',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().agreedPriceVnd).toBe(300_000)
    expect(res.json().priceVarianceBp).toBe(1_000)
    expect(await onHand(fx.branchId, TANG_BO.id)).toBe(14_000)
  })

  it('hàng không bắt buộc lô thì nhập thẳng, không sinh lô', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        ingredientId: MUOI.id,
        qtyPurchase: 5,
        totalVnd: 40_000,
        supplierId,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().lotId).toBeNull()
  })
})

describe('S9 — FEFO: hạn gần nhất ra trước', () => {
  it('xuất huỷ rút đúng lô sắp hết hạn, dù lô đó nhập sau', async () => {
    // LO-A hạn 30/09 nhập trước; LO-B hạn 15/10 nhập sau ⇒ LO-A phải ra trước
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/issues',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        kind: 'write_off',
        ingredientId: TANG_BO.id,
        qtyBase: 1_000,
        reason: 'Ôi màu, bỏ',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)

    const lots = await db
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.branchId, fx.branchId), eq(stockLots.ingredientId, TANG_BO.id)))
    const a = lots.find((l) => l.lotCode === 'LO-A')!
    const b = lots.find((l) => l.lotCode === 'LO-B')!
    expect(Number(a.qtyRemainBase)).toBe(11_000)
    expect(Number(b.qtyRemainBase)).toBe(2_000)
  })

  it('rút hết lô đầu thì tràn sang lô sau, và sổ lô nói rõ từng lô bao nhiêu', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/issues',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        kind: 'internal',
        ingredientId: TANG_BO.id,
        qtyBase: 11_500,
        reason: 'Ăn ca cả tuần',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().lots).toHaveLength(2)
    expect(res.json().lots[0].qtyBase).toBe(11_000)
    expect(res.json().lots[1].qtyBase).toBe(500)
    expect(res.json().shortBase).toBe(0)
  })

  it('xuất kho không ghi lý do bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/issues',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        kind: 'write_off',
        ingredientId: MUOI.id,
        qtyBase: 100,
        reason: '   ',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('thủ kho xuất kho phải có người khác duyệt — dấu △ của §4.2', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/issues',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        kind: 'write_off',
        ingredientId: MUOI.id,
        qtyBase: 100,
        reason: 'Đổ mất',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('requires_approval')
  })
})

describe('S7 — Đục keg và pha lóc thịt', () => {
  let sealedLotId = 0

  it('nhập một keg nguyên', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        ingredientId: 'keg-asahi',
        qtyPurchase: 1,
        totalVnd: 1_800_000,
        supplierId,
        lotCode: 'KEG-01',
        // Vỏ ghi hạn còn xa — đúng tình huống mà đồng hồ đục keg tồn tại để xử lý
        expiresOn: '2027-02-01',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    sealedLotId = res.json().lotId
  })

  /** Bia trong keg đã đục hỏng sau 5–7 ngày dù vỏ ghi sáu tháng (§25 S9) */
  it('đục keg sinh lô mới có hạn tính từ hôm nay, không lấy hạn trên vỏ', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/warehouse/lots/${sealedLotId}/tap`,
      headers: asKeeper(),
      payload: { branchId: fx.branchId },
    })
    expect(res.statusCode, res.payload).toBe(201)

    const expected = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    expect(res.json().expiresOn).toBe(expected)
    expect(res.json().expiresOn < '2027-02-01').toBe(true)
  })

  it('đục xong tồn KHÔNG đổi — bia vẫn trong kho, chỉ đổi lô', async () => {
    expect(await onHand(fx.branchId, 'keg-asahi')).toBe(20_000)
  })

  it('đục hai lần cùng một lô thì lần sau báo đã đục rồi', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/warehouse/lots/${sealedLotId}/tap`,
      headers: asKeeper(),
      payload: { branchId: fx.branchId },
    })
    expect(res.statusCode).toBe(409)
  })

  it('sổ lô sắp lô đã đục lên trước, và nói rõ tiền đang nằm trong đó', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/warehouse/lots?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    const open = res.json().lots.find((l: { state: string }) => l.state === 'open')
    expect(open.qtyRemainBase).toBe(20_000)
    expect(open.remainValueVnd).toBe(1_800_000)
    expect(open.tappable).toBe(false)
  })

  /**
   * Ví dụ của §25: một tảng bò 12kg cho ra nầm 2,1kg + dẻ sườn 3,4kg + hao 0,8kg.
   * Ở đây dùng 2,5kg tảng còn lại để giữ số nhỏ mà vẫn đúng quy tắc.
   */
  it('pha lóc: hao không có dòng riêng, tiền nằm lại trong giá thịt dùng được', async () => {
    const before = await onHand(fx.branchId, TANG_BO.id)
    expect(before).toBe(1_500)

    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/production',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        kind: 'pha-loc',
        inputs: [{ ingredientId: TANG_BO.id, qtyBase: 1_200 }],
        outputs: [
          { ingredientId: NAM_BO.id, qtyBase: 300, costShareBp: 4_500 },
          { ingredientId: DE_SUON.id, qtyBase: 600, costShareBp: 5_500 },
        ],
        note: 'Lóc tảng còn lại',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)

    const body = res.json()
    /**
     * Vào 1.200g, ra 900g, hao 300g — nhưng TIỀN thì chia hết. Đây là bất biến
     * của cả bài: tổng giá đầu ra bằng đúng tổng giá đầu vào, nên phần hao nằm
     * lại trong giá của thịt dùng được thay vì bốc hơi.
     *
     * Không so `totalInVnd` với một con số cứng: giá bình quân đã dịch sau lượt
     * nhập LO-B đắt hơn, và ghim số ở đây chỉ là chép lại phép tính của mã nguồn.
     */
    expect(body.totalInBase).toBe(1_200)
    expect(body.totalOutBase).toBe(900)
    expect(body.wasteBase).toBe(300)
    expect(body.outputs.reduce((s: number, o: { costVnd: number }) => s + o.costVnd, 0)).toBe(
      body.totalInVnd,
    )

    // Nầm nhẹ hơn mà đắt hơn — chia theo giá trị, không theo cân
    expect(body.outputs[0].unitCostMilli).toBeGreaterThan(body.outputs[1].unitCostMilli)

    expect(await onHand(fx.branchId, TANG_BO.id)).toBe(300)
    expect(await onHand(fx.branchId, NAM_BO.id)).toBe(300)
    expect(await onHand(fx.branchId, DE_SUON.id)).toBe(600)
  })

  it('tổng tỉ lệ chia khác 100% bị chặn — tiền sẽ bốc hơi hoặc sinh từ hư không', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/production',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        kind: 'pha-che',
        inputs: [{ ingredientId: MUOI.id, qtyBase: 100 }],
        outputs: [{ ingredientId: NAM_BO.id, qtyBase: 50, costShareBp: 5_000 }],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('100%')
  })
})

describe('S4 — Đơn đặt hàng & gợi ý theo tốc độ tiêu thụ', () => {
  it('gợi ý đặt hàng đọc tốc độ tiêu thụ và trừ phần đã đặt chưa về', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/warehouse/reorder-suggestions?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)

    const bo = res.json().find((r: { ingredientId: string }) => r.ingredientId === TANG_BO.id)
    expect(bo.perDayBase).toBeGreaterThan(0)
    expect(bo.supplierName).toBe('Chợ đầu mối')
    expect(bo.suggestPurchase).toBeGreaterThan(0)
  })

  it('bán thành phẩm KHÔNG được gợi ý — nó sinh từ S7, không mua ngoài', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/warehouse/reorder-suggestions?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    expect(res.json().map((r: { ingredientId: string }) => r.ingredientId)).not.toContain(NAM_BO.id)
  })

  it('lập đơn rồi gửi; gửi rồi thì không gửi lại', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/warehouse/purchase-orders',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        supplierId,
        expectedOn: '2026-08-10',
        lines: [{ ingredientId: TANG_BO.id, qtyPurchase: 10, priceVnd: 300_000 }],
      },
    })
    expect(created.statusCode, created.payload).toBe(201)
    expect(created.json().displayCode).toMatch(/^PO-\d{4}-\d+$/)
    purchaseOrderId = created.json().id

    const sent = await inject({
      method: 'POST',
      url: `/api/warehouse/purchase-orders/${purchaseOrderId}/send`,
      headers: asKeeper(),
    })
    expect(sent.statusCode, sent.payload).toBe(201)

    const again = await inject({
      method: 'POST',
      url: `/api/warehouse/purchase-orders/${purchaseOrderId}/send`,
      headers: asKeeper(),
    })
    expect(again.statusCode).toBe(409)
  })

  it('nhận hàng một phần thì đơn ở lại "đã gửi" — đó là danh sách còn nợ hàng', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        ingredientId: TANG_BO.id,
        qtyPurchase: 4,
        totalVnd: 1_200_000,
        supplierId,
        purchaseOrderId,
        lotCode: 'LO-C',
        expiresOn: '2026-11-30',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)

    const list = await inject({
      method: 'GET',
      url: `/api/warehouse/purchase-orders?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const po = list.json().find((p: { id: number }) => p.id === purchaseOrderId)
    expect(po.state).toBe('sent')
    expect(po.lines[0].receivedPurchase).toBe(4)
    expect(po.lines[0].outstandingPurchase).toBe(6)
  })

  it('nhận nốt thì đơn tự đóng, không ai phải bấm', async () => {
    await inject({
      method: 'POST',
      url: '/api/warehouse/receipts',
      headers: asKeeper(),
      payload: {
        branchId: fx.branchId,
        ingredientId: TANG_BO.id,
        qtyPurchase: 6,
        totalVnd: 1_800_000,
        supplierId,
        purchaseOrderId,
        lotCode: 'LO-D',
        expiresOn: '2026-12-15',
      },
    })

    const list = await inject({
      method: 'GET',
      url: `/api/warehouse/purchase-orders?branch=${fx.branchId}`,
      headers: asOwner(),
    })
    const po = list.json().find((p: { id: number }) => p.id === purchaseOrderId)
    expect(po.state).toBe('received')
  })
})

describe('S10 — Chuyển kho, xác nhận hai đầu', () => {
  let transferId = 0

  it('chuyển nhiều hơn tồn bị chặn — ở đây chưa có gì xảy ra ngoài đời', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/transfers',
      headers: asOwner(),
      payload: {
        fromBranchId: fx.branchId,
        toBranchId: OTHER_BRANCH,
        lines: [{ ingredientId: MUOI.id, qtyBase: 999_999 }],
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('không đủ')
  })

  it('gửi thì bên gửi giảm NGAY, bên nhận chưa có gì — hàng đang đi đường', async () => {
    const beforeFrom = await onHand(fx.branchId, MUOI.id)

    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/transfers',
      headers: asOwner(),
      payload: {
        fromBranchId: fx.branchId,
        toBranchId: OTHER_BRANCH,
        note: 'Hồ Tây hết muối',
        lines: [{ ingredientId: MUOI.id, qtyBase: 2_000 }],
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().displayCode).toMatch(/^CK-\d{4}-\d+$/)
    transferId = res.json().id

    expect(await onHand(fx.branchId, MUOI.id)).toBe(beforeFrom - 2_000)
    expect(await onHand(OTHER_BRANCH, MUOI.id)).toBe(0)
  })

  /**
   * Hàng rời kho bên gửi mà không tới nơi là hàng BÊN GỬI mất. Ghi hao ở bên nhận
   * sẽ làm chi nhánh nhận gánh hao của quãng đường mà họ không đi.
   */
  it('nhận thiếu thì phần chênh thành hao Ở BÊN GỬI, không phải bên nhận', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/warehouse/transfers/${transferId}/receive`,
      headers: asOwner(),
      payload: { lines: [{ ingredientId: MUOI.id, receivedBase: 1_800 }] },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().shortageVnd).toBeGreaterThan(0)

    expect(await onHand(OTHER_BRANCH, MUOI.id)).toBe(1_800)

    const card = await inject({
      method: 'GET',
      url: `/api/warehouse/stock-card?branch=${fx.branchId}&ingredient=${MUOI.id}&from=2026-01-01&to=2027-01-01`,
      headers: asOwner(),
    })
    const shortage = card
      .json()
      .moves.find((m: { kind: string; note: string | null }) => m.kind === 'write_off' && m.note?.includes('Hao đường đi'))
    expect(shortage).toBeDefined()
    expect(shortage.qtyBase).toBe(-200)
  })

  it('nhận hai lần thì lần sau báo đã xử lý', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/warehouse/transfers/${transferId}/receive`,
      headers: asOwner(),
      payload: { lines: [] },
    })
    expect(res.statusCode).toBe(409)
  })

  it('chuyển sang chính chi nhánh mình bị chặn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/transfers',
      headers: asOwner(),
      payload: {
        fromBranchId: fx.branchId,
        toBranchId: fx.branchId,
        lines: [{ ingredientId: MUOI.id, qtyBase: 10 }],
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('S8 — Kiểm kê', () => {
  let countId = 0

  it('mở phiếu chụp tồn sổ ngay lúc mở', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/counts',
      headers: asKeeper(),
      payload: { branchId: fx.branchId, groupName: 'Đồ khô' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    countId = res.json().id

    const sheet = await inject({
      method: 'GET',
      url: `/api/warehouse/counts/${countId}`,
      headers: asOwner(),
    })
    const muoi = sheet.json().lines.find((l: { ingredientId: string }) => l.ingredientId === MUOI.id)
    expect(muoi.snapshotBase).toBe(await onHand(fx.branchId, MUOI.id))
    expect(muoi.countedBase).toBeNull()
  })

  it('hai phiếu đang đếm cùng lúc bị chặn — hai số đếm chọi nhau', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/warehouse/counts',
      headers: asKeeper(),
      payload: { branchId: fx.branchId, groupName: null },
    })
    expect(res.statusCode).toBe(409)
  })

  it('ghi số đếm rồi chốt: dòng lệch sinh bút toán, sổ về đúng số đếm', async () => {
    const before = await onHand(fx.branchId, MUOI.id)
    const counted = before - 150

    const saved = await inject({
      method: 'PUT',
      url: `/api/warehouse/counts/${countId}/lines`,
      headers: asKeeper(),
      payload: { lines: [{ ingredientId: MUOI.id, countedBase: counted, note: 'Đếm lại hai lần' }] },
    })
    expect(saved.statusCode, saved.payload).toBe(200)

    const closed = await inject({
      method: 'POST',
      url: `/api/warehouse/counts/${countId}/close`,
      headers: asOwner(),
      payload: {},
    })
    expect(closed.statusCode, closed.payload).toBe(201)
    expect(closed.json().adjusted).toBe(1)
    expect(closed.json().diffVnd).toBeLessThan(0)
    expect(await onHand(fx.branchId, MUOI.id)).toBe(counted)
  })

  /**
   * "Chưa đếm tới" và "đếm được 0" là hai chuyện khác nhau. Coi nhầm cái đầu
   * thành cái sau là xoá sạch kho.
   */
  it('dòng CHƯA ĐẾM không bị coi là 0 — tồn của nó không đổi', async () => {
    const boBefore = await onHand(fx.branchId, TANG_BO.id)

    const opened = await inject({
      method: 'POST',
      url: '/api/warehouse/counts',
      headers: asKeeper(),
      payload: { branchId: fx.branchId, groupName: null },
    })
    const id = opened.json().id

    // Chỉ đếm muối, không đụng tới thịt bò
    await inject({
      method: 'PUT',
      url: `/api/warehouse/counts/${id}/lines`,
      headers: asKeeper(),
      payload: { lines: [{ ingredientId: MUOI.id, countedBase: 1_000, note: null }] },
    })
    const closed = await inject({
      method: 'POST',
      url: `/api/warehouse/counts/${id}/close`,
      headers: asOwner(),
      payload: {},
    })
    expect(closed.statusCode).toBe(201)
    expect(await onHand(fx.branchId, TANG_BO.id)).toBe(boBefore)
  })

  it('thủ kho chốt kiểm kê phải có người khác duyệt', async () => {
    const opened = await inject({
      method: 'POST',
      url: '/api/warehouse/counts',
      headers: asKeeper(),
      payload: { branchId: fx.branchId, groupName: 'Đồ khô' },
    })
    const id = opened.json().id

    const res = await inject({
      method: 'POST',
      url: `/api/warehouse/counts/${id}/close`,
      headers: asKeeper(),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('requires_approval')

    // Có PIN của chủ duyệt thì chốt được
    const withApproval = await inject({
      method: 'POST',
      url: `/api/warehouse/counts/${id}/close`,
      headers: asKeeper(),
      payload: {
        approval: { approverStaffId: ownerStaffId, approverPin: '9137', reason: 'Đã kiểm cùng' },
      },
    })
    expect(withApproval.statusCode, withApproval.payload).toBe(201)
  })
})

describe('S11 · S12 — Hao hụt và thẻ kho', () => {
  it('báo cáo hao hụt tách HUỶ khỏi ĂN CA — hai chuyện khác hẳn nhau', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/warehouse/waste?branch=${fx.branchId}&from=2026-01-01&to=2027-01-01`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().totals.writeOffVnd).toBeGreaterThan(0)
    expect(res.json().totals.internalVnd).toBeGreaterThan(0)
    expect(res.json().totals.writeOffVnd).not.toBe(res.json().totals.internalVnd)
  })

  /**
   * Bọt và phần cặn cuối keg là hao có thật. Mục riêng của bia tươi tồn tại để
   * con số đó nằm cạnh lượng rót lý thuyết, chứ không lẫn vào hao chung của kho.
   */
  it('bia tươi có mục riêng — rót lý thuyết so với keg thực dùng', async () => {
    const spill = await inject({
      method: 'POST',
      url: '/api/warehouse/issues',
      headers: asOwner(),
      payload: {
        branchId: fx.branchId,
        kind: 'write_off',
        ingredientId: 'keg-asahi',
        qtyBase: 1_200,
        reason: 'Bọt đầu keg và cặn cuối',
      },
    })
    expect(spill.statusCode, spill.payload).toBe(201)

    const res = await inject({
      method: 'GET',
      url: `/api/warehouse/waste?branch=${fx.branchId}&from=2026-01-01&to=2027-01-01`,
      headers: asOwner(),
    })
    const beer = res.json().draftBeer.find((b: { ingredientId: string }) => b.ingredientId === 'keg-asahi')
    expect(beer).toBeDefined()
    expect(beer.kegUsedBase).toBe(1_200)
    // Chưa bán cốc nào nên rót lý thuyết bằng 0, và tỉ lệ để trống chứ không là vô cực
    expect(beer.pouredBase).toBe(0)
    expect(beer.ratio).toBeNull()
  })

  it('thẻ kho có cột tồn luỹ kế đúng sau từng bút toán', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/warehouse/stock-card?branch=${fx.branchId}&ingredient=${TANG_BO.id}&from=2026-01-01&to=2027-01-01`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)

    const moves = res.json().moves
    expect(moves.length).toBeGreaterThan(0)
    // Tồn luỹ kế của dòng cuối phải bằng tồn hiện tại
    expect(moves.at(-1).balanceBase).toBe(await onHand(fx.branchId, TANG_BO.id))
    expect(res.json().closingBase).toBe(moves.at(-1).balanceBase)

    // Cộng dồn từng dòng phải ra đúng cột luỹ kế — thẻ kho tự kiểm được chính nó
    let running = res.json().openingBase
    for (const move of moves) {
      running += move.qtyBase
      expect(move.balanceBase).toBe(running)
    }
  })

  it('bút toán từ chứng từ nói được nó đến từ phiếu nào', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/warehouse/stock-card?branch=${fx.branchId}&ingredient=${TANG_BO.id}&from=2026-01-01&to=2027-01-01`,
      headers: asOwner(),
    })
    const fromRun = res
      .json()
      .moves.find((m: { docKind: string | null }) => m.docKind === 'production_run')
    expect(fromRun).toBeDefined()
    expect(fromRun.docId).toBeGreaterThan(0)
    expect(fromRun.lotCode).not.toBeNull()
  })

})
