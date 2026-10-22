/**
 * VAT theo từng thuế suất trên đơn thật (NĐ 254/2026 · NĐ 174/2025).
 *
 * Món ăn đang được giảm còn 8%, bia rượu chịu thuế TTĐB nên giữ 10% — một bill
 * của quán có cả hai, và hoá đơn GTGT phải ghi tiền thuế theo từng thuế suất.
 * Phép tính có bài kiểm miền riêng (`packages/contracts/src/money.test.ts`); ở
 * đây hỏi điều chỉ đường thật trả lời được: nhóm thuế đóng băng vào dòng đơn,
 * phần giảm hoá đơn chia đúng về từng thuế suất, đơn lưu tiền từng thuế suất, và
 * web nhận đủ thứ để ước ra cùng con số.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import { ParamsService } from '../common/params.service'
import type { Db } from '../db/client'
import { devices, dishes, orderLines, orders, promotions } from '../db/schema'
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

const today = () => businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')

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

  await db.insert(dishes).values({
    id: 'asahi',
    code: 'SORA-BIA-001',
    kind: 'drink',
    nameVi: 'Bia Asahi',
    basePrice: 95_000,
    routingMethod: 'fixed',
    stationGrill: 'ST-01',
    stationNoGrill: 'ST-01',
    stationTakeaway: 'ST-01',
    stationDelivery: 'ST-01',
    vatCode: 'alcohol',
  })

  // Kế toán bật VAT ở A6: món ăn 8%, bia rượu 10%
  const params = app.get(ParamsService)
  await params.set('sales.vatRate', 0.08)
  await params.set('sales.vatRateAlcohol', 0.1)

  const anHourAgo = new Date(Date.now() - 3_600_000)
  await db.insert(promotions).values({
    code: 'KM-HD10',
    name: 'Hoá đơn giảm 10%',
    scope: 'bill',
    kind: 'percent',
    percentBp: 1000,
    startsOn: today(),
    endsOn: today(),
    state: 'active',
    activatedAt: anHourAgo,
    activatedBy: fx.managerId,
    stateChangedAt: anHourAgo,
  })
}, 120_000)

afterAll(async () => close?.())

describe('VAT theo thuế suất trên đơn tại bàn', () => {
  let orderId: number

  beforeAll(async () => {
    const opened = await inject({
      method: 'POST',
      url: `/api/tables/${fx.grillTableId}/open`,
      headers: auth(),
      payload: { guestCount: 4 },
    })
    expect(opened.statusCode, opened.payload).toBe(201)
    const added = await inject({
      method: 'POST',
      url: `/api/table-sessions/${opened.json<{ id: number }>().id}/lines`,
      headers: auth(),
      payload: {
        lines: [
          { dishId: 'bachibo', qty: 2 },
          { dishId: 'asahi', qty: 2 },
        ],
      },
    })
    expect(added.statusCode, added.payload).toBe(201)
    orderId = added.json<{ orderId: number }>().orderId
  })

  it('món ăn 8% và bia 10% tính thuế riêng; giảm hoá đơn chia theo từng dòng', async () => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    // 2 × 285.000 + 2 × 95.000 = 760.000; giảm hoá đơn 10% = 76.000 → 57.000 / 19.000
    expect(order).toMatchObject({
      moneySub: 760_000,
      moneyDiscount: 76_000,
      moneyBillDiscount: 76_000,
      // 8% × 513.000 = 41.040 · 10% × 171.000 = 17.100
      moneyVat: 58_140,
      // 684.000 + 58.140 = 742.140 → làm tròn 742.000
      moneyTotal: 742_000,
      moneyRound: -140,
    })
    expect(order!.vatBreakdown).toEqual([
      { rateBp: 800, goods: 570_000, discount: 57_000, service: 0, net: 513_000, vat: 41_040 },
      { rateBp: 1000, goods: 190_000, discount: 19_000, service: 0, net: 171_000, vat: 17_100 },
    ])
  })

  it('nhóm thuế đóng băng vào dòng lúc gọi — Office đổi nhóm thuế sau đó không đổi đơn', async () => {
    await db.update(dishes).set({ vatCode: 'standard' }).where(eq(dishes.id, 'asahi'))
    try {
      const sessionLines = await db
        .select({ vatCode: orderLines.vatCode, dishId: orderLines.dishId })
        .from(orderLines)
        .where(and(eq(orderLines.orderId, orderId), isNull(orderLines.parentLineId)))
        .orderBy(asc(orderLines.id))
      expect(sessionLines).toEqual([
        { dishId: 'bachibo', vatCode: 'standard' },
        { dishId: 'asahi', vatCode: 'alcohol' },
      ])

      // Gọi thêm một món để đơn tính lại tiền
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
      const more = await inject({
        method: 'POST',
        url: `/api/table-sessions/${order!.tableSessionId}/lines`,
        headers: auth(),
        payload: { lines: [{ dishId: 'miso', qty: 1 }] },
      })
      expect(more.statusCode, more.payload).toBe(201)

      const [after] = await db.select().from(orders).where(eq(orders.id, orderId))
      // Bia gọi lúc trước vẫn 10%: dòng 10% còn nguyên tiền món của hai chai bia
      expect(after!.vatBreakdown.find((r) => r.rateBp === 1000)?.goods).toBe(190_000)
    } finally {
      await db.update(dishes).set({ vatCode: 'alcohol' }).where(eq(dishes.id, 'asahi'))
    }
  })
})

describe('VAT theo thuế suất trên thực đơn online', () => {
  it('thực đơn mang nhóm thuế từng món và cả hai thuế suất — web ước ra đúng tiền máy chủ tính', async () => {
    await db.update(dishes).set({ onlineVisible: true }).where(eq(dishes.id, 'asahi'))
    const res = await inject({ method: 'GET', url: `/api/online/menu?branch=${fx.branchId}` })
    expect(res.statusCode, res.payload).toBe(200)
    const menu = res.json<{
      dishes: { id: string; vatCode: string }[]
      pricing: { vatRate: number; vatRateAlcohol: number; roundingUnit: number }
    }>()
    expect(menu.pricing).toEqual({ vatRate: 0.08, vatRateAlcohol: 0.1, roundingUnit: 1000 })
    expect(menu.dishes.find((d) => d.id === 'asahi')?.vatCode).toBe('alcohol')
  })
})
