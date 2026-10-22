/**
 * Nghiệm thu §9.6 — khuyến mãi áp CHUNG, tiền giảm ghi THẲNG vào đơn.
 *
 * Phép chấm có bài kiểm miền riêng (`packages/contracts/src/promotions.test.ts`).
 * Ở đây chỉ hỏi những điều mà chỉ đường thật — HTTP, transaction, Postgres — trả
 * lời được:
 *
 *   1. Món gọi lúc chương trình chạy được giảm trên CHÍNH dòng đơn, và giữ nguyên
 *      khi chương trình dừng sau đó.
 *   2. "Mua N tặng M" đếm cả phần gọi ở lượt trước.
 *   3. Chương trình hoá đơn chấm lại mỗi lần đơn đổi, chỉ trên dòng chưa giảm, và
 *      vẫn giữ cho đơn đã mở trước lúc chương trình bị dừng.
 *   4. Sổ lượt hưởng mà B8 đọc khớp từng đồng với đơn, kể cả sau khi huỷ món.
 *   5. App đọc được chương trình đang chạy mà không cần đăng nhập — trừ chương
 *      trình cần mã.
 *
 * Chương trình được ghi thẳng vào CSDL ở trạng thái đang chạy: soạn và duyệt đã
 * có bài kiểm ở `crm.e2e.test.ts`, bài này kiểm phần áp vào đơn.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import { devices, orderLines, orders, promotionRedemptions, promotions } from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const SEED_DEVICE = 'seed-device-token'
let cashier: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const auth = () => ({ authorization: `Bearer ${cashier}`, [DEVICE_HEADER]: SEED_DEVICE })

/**
 * Lịch chạy phủ quanh HÔM NAY theo giờ chi nhánh: luồng gọi món đọc đồng hồ thật,
 * nên chương trình phải chạy vào đúng ngày bộ test chạy — chạy sát nửa đêm cũng vậy.
 */
const dayOffset = (days: number) =>
  businessDateOf(new Date(Date.now() + days * 86_400_000), 'Asia/Ho_Chi_Minh')

const ids = {} as Record<'bo20' | 'than2t1' | 'setDongGia' | 'hd10' | 'canMa', number>

async function insertPromotion(values: Partial<typeof promotions.$inferInsert>) {
  const anHourAgo = new Date(Date.now() - 3_600_000)
  const [row] = await db
    .insert(promotions)
    .values({
      code: 'KM',
      name: 'Chương trình',
      kind: 'percent',
      startsOn: dayOffset(-1),
      endsOn: dayOffset(30),
      state: 'active',
      activatedAt: anHourAgo,
      activatedBy: fx.managerId,
      stateChangedAt: anHourAgo,
      ...values,
    })
    .returning({ id: promotions.id })
  return row!.id
}

/** Dừng một chương trình đúng như B11 làm: đổi trạng thái và đóng dấu giờ */
async function pause(id: number) {
  await db
    .update(promotions)
    .set({ state: 'paused', stateChangedAt: new Date() })
    .where(eq(promotions.id, id))
}

async function openTable(tableId: number) {
  const res = await inject({
    method: 'POST',
    url: `/api/tables/${tableId}/open`,
    headers: auth(),
    payload: { guestCount: 4 },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ id: number }>().id
}

async function addLines(sessionId: number, lines: { dishId: string; qty: number }[]) {
  const res = await inject({
    method: 'POST',
    url: `/api/table-sessions/${sessionId}/lines`,
    headers: auth(),
    payload: { lines },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ orderId: number }>().orderId
}

/** Dòng CHA của đơn theo thứ tự gọi — dòng con của set không mang tiền */
const parentLines = (orderId: number) =>
  db
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.orderId, orderId), isNull(orderLines.parentLineId)))
    .orderBy(asc(orderLines.id))

const orderOf = async (orderId: number) =>
  (await db.select().from(orders).where(eq(orders.id, orderId)))[0]!

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
  cashier = (
    await inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [DEVICE_HEADER]: SEED_DEVICE },
      payload: { branchId: fx.branchId, staffId: fx.cashierId, pin: fx.pins[fx.cashierId] },
    })
  ).json<{ token: string }>().token

  ids.bo20 = await insertPromotion({
    code: 'KM-BO20',
    name: 'Ba chỉ bò giảm 20%',
    scope: 'item',
    percentBp: 2000,
    targetDishIds: ['bachibo'],
  })
  // Mua 2 tặng 1 trọn phần: phần tặng bằng nửa giá trị phần mua — vừa đúng trần luật
  ids.than2t1 = await insertPromotion({
    code: 'KM-THAN-2T1',
    name: 'Thăn bò mua 2 tặng 1',
    scope: 'item',
    kind: 'buy_x_get_y',
    buyQty: 2,
    getQty: 1,
    getPercent: 100,
    targetDishIds: ['thanbo'],
  })
  ids.setDongGia = await insertPromotion({
    code: 'KM-SET-DG',
    name: 'Set Sora đồng giá',
    scope: 'item',
    kind: 'set_price',
    setPriceVnd: 1_150_000,
    targetDishIds: ['setsora'],
  })
  ids.hd10 = await insertPromotion({
    code: 'KM-HD10',
    name: 'Hoá đơn từ 300k giảm 10%',
    scope: 'bill',
    percentBp: 1000,
    minOrderVnd: 300_000,
  })
  ids.canMa = await insertPromotion({
    code: 'KM-MA',
    name: 'Voucher 100k',
    scope: 'bill',
    kind: 'amount',
    amountVnd: 100_000,
    requiresVoucher: true,
  })
}, 120_000)

afterAll(async () => close?.())

describe('§9.6 — Giảm ghi thẳng vào đơn', () => {
  let sessionId: number
  let orderId: number

  it('món gọi lúc chương trình món đang chạy được giảm ngay trên dòng đơn', async () => {
    sessionId = await openTable(fx.grillTableId)
    orderId = await addLines(sessionId, [{ dishId: 'bachibo', qty: 2 }])

    const [line] = await parentLines(orderId)
    expect(line).toMatchObject({
      unitPrice: 285_000,
      promotionId: ids.bo20,
      discountVnd: 114_000,
      promoQty: 2,
      priceTotal: 456_000,
    })
    // Tiền món của đơn giữ giá niêm yết; mọi phần giảm nằm ở money_discount
    const order = await orderOf(orderId)
    expect(order).toMatchObject({ moneySub: 570_000, moneyDiscount: 114_000 })
    // Dòng duy nhất đã được giảm món — giảm hoá đơn không có gì để tính lên
    expect(order.billPromotionId).toBeNull()
  })

  it('set đồng giá: phần giảm nằm ở dòng set cha, dòng con vẫn giá 0', async () => {
    await addLines(sessionId, [{ dishId: 'setsora', qty: 1 }])
    const set = (await parentLines(orderId)).find((l) => l.dishId === 'setsora')!
    expect(set).toMatchObject({
      unitPrice: 1_280_000,
      promotionId: ids.setDongGia,
      discountVnd: 130_000,
      priceTotal: 1_150_000,
    })
    const children = await db.select().from(orderLines).where(eq(orderLines.parentLineId, set.id))
    expect(children.length).toBeGreaterThan(0)
    expect(children.every((c) => c.discountVnd === 0 && c.promotionId === null)).toBe(true)
  })

  it('mua 2 tặng 1 đếm cả hai phần gọi ở lượt trước', async () => {
    await addLines(sessionId, [{ dishId: 'thanbo', qty: 2 }])
    await addLines(sessionId, [{ dishId: 'thanbo', qty: 1 }])

    const than = (await parentLines(orderId)).filter((l) => l.dishId === 'thanbo')
    expect(than).toHaveLength(2)
    expect(than[0]).toMatchObject({ qty: 2, promotionId: null, discountVnd: 0 })
    expect(than[1]).toMatchObject({
      qty: 1,
      promotionId: ids.than2t1,
      discountVnd: 420_000,
      promoQty: 1,
      priceTotal: 0,
    })
  })

  it('giảm hoá đơn chỉ tính trên các dòng chưa được giảm món', async () => {
    await addLines(sessionId, [{ dishId: 'miso', qty: 2 }])

    // Chưa giảm: 2 thăn bò phải mua (840k) + 2 súp miso (90k) = 930k → 10% = 93k
    const order = await orderOf(orderId)
    expect(order).toMatchObject({
      moneySub: 570_000 + 1_280_000 + 840_000 + 420_000 + 90_000,
      billPromotionId: ids.hd10,
      moneyBillDiscount: 93_000,
      moneyDiscount: 114_000 + 130_000 + 420_000 + 93_000,
    })
  })

  it('dừng chương trình món giữa bữa: món đã gọi giữ giá, món gọi sau trả giá thường', async () => {
    await pause(ids.bo20)
    await addLines(sessionId, [{ dishId: 'bachibo', qty: 1 }])

    const bo = (await parentLines(orderId)).filter((l) => l.dishId === 'bachibo')
    expect(bo[0]).toMatchObject({ promotionId: ids.bo20, discountVnd: 114_000 })
    expect(bo[1]).toMatchObject({ promotionId: null, discountVnd: 0, priceTotal: 285_000 })
    // Phần bò mới chưa được giảm món nên vào phần tính giảm hoá đơn: 930k + 285k
    expect((await orderOf(orderId)).moneyBillDiscount).toBe(121_500)
  })

  it('dừng chương trình hoá đơn: đơn mở TRƯỚC lúc dừng vẫn được giữ, đơn mở sau thì không', async () => {
    await pause(ids.hd10)

    await addLines(sessionId, [{ dishId: 'miso', qty: 1 }])
    const kept = await orderOf(orderId)
    expect(kept.billPromotionId).toBe(ids.hd10)
    expect(kept.moneyBillDiscount).toBe(126_000)

    const later = await addLines(await openTable(fx.plainTableId), [{ dishId: 'miso', qty: 8 }])
    const fresh = await orderOf(later)
    expect(fresh.moneySub).toBe(360_000)
    expect(fresh.billPromotionId).toBeNull()
    expect(fresh.moneyDiscount).toBe(0)
  })

  it('huỷ món thì sổ lượt hưởng tính lại theo đơn, từng đồng', async () => {
    const free = (await parentLines(orderId)).find((l) => l.promotionId === ids.than2t1)!
    const res = await inject({
      method: 'POST',
      url: `/api/order-lines/${free.id}/void`,
      headers: auth(),
      payload: { reason: 'Khách đổi ý' },
    })
    expect(res.statusCode, res.payload).toBe(201)

    const rows = await db
      .select({
        promotionId: promotionRedemptions.promotionId,
        discountVnd: promotionRedemptions.discountVnd,
      })
      .from(promotionRedemptions)
      .where(eq(promotionRedemptions.orderId, orderId))
      .orderBy(asc(promotionRedemptions.promotionId))
    expect(rows).toEqual(
      [
        { promotionId: ids.bo20, discountVnd: 114_000 },
        { promotionId: ids.setDongGia, discountVnd: 130_000 },
        { promotionId: ids.hd10, discountVnd: 126_000 },
      ].sort((a, b) => a.promotionId - b.promotionId),
    )

    const order = await orderOf(orderId)
    const [sum] = await db
      .select({ total: sql<number>`sum(${promotionRedemptions.discountVnd})::int` })
      .from(promotionRedemptions)
      .where(eq(promotionRedemptions.orderId, orderId))
    expect(sum!.total).toBe(order.moneyDiscount)
  })

  it('CSDL chặn dòng có tiền giảm mà không nói chương trình nào', async () => {
    const [line] = await parentLines(orderId)
    // Tiền dòng vẫn khớp công thức — chỉ thiếu tên chương trình, và thế là đủ để bị chặn
    await expect(
      db
        .update(orderLines)
        .set({
          promotionId: null,
          discountVnd: 1_000,
          priceTotal: sql`${orderLines.qty} * ${orderLines.unitPrice} - 1000`,
        })
        .where(eq(orderLines.id, line!.id)),
    ).rejects.toThrow()
  })
})

describe('§9.6 — App đọc chương trình đang chạy', () => {
  it('không cần đăng nhập, không lộ chương trình cần mã hay đã dừng', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/crm/promotions/live?branch=${fx.branchId}`,
    })
    expect(res.statusCode, res.payload).toBe(200)
    const body = res.json<{
      maxDiscountRate: number
      clock: { businessDate: string }
      rules: { code: string }[]
    }>()
    expect(body.maxDiscountRate).toBe(0.5)
    // Giờ của chi nhánh do máy chủ tính — iPad không tự đoán múi giờ
    expect([dayOffset(0), dayOffset(1)]).toContain(body.clock.businessDate)
    expect(body.rules.map((r) => r.code).sort()).toEqual(['KM-SET-DG', 'KM-THAN-2T1'])
  })

  it('chi nhánh không có thì báo rõ', async () => {
    const res = await inject({ method: 'GET', url: '/api/crm/promotions/live?branch=khong-co' })
    expect(res.statusCode).toBe(404)
  })
})
