/**
 * Máy chủ CHƯA đấu nối nhà cung cấp hoá đơn điện tử (`EINVOICE_PROVIDER=off`) —
 * mặc định của production cho tới khi có hợp đồng.
 *
 * Phải chứng minh: không ai bật được hoá đơn điện tử, và không ai phát hành được
 * một tờ hoá đơn "trông như thật" mà không hề lên cơ quan thuế.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { orderLines, orders, parameters, staff, staffRoles } from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>
let owner: string
const before = process.env.EINVOICE_PROVIDER

const PASSWORD = 'sora-dev-2026'
const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = () => ({ authorization: `Bearer ${owner}` })

beforeAll(async () => {
  process.env.EINVOICE_PROVIDER = 'off'
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  const [row] = await db
    .insert(staff)
    .values({
      code: 'CHU01',
      fullName: 'Chủ quán',
      email: 'chu@tokyosora.vn',
      passwordHash: await hash(PASSWORD),
    })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: row!.id, roleCode: 'R10', branchId: null })
  owner = (
    await inject({
      method: 'POST',
      url: '/api/auth/office/login',
      payload: { branchId: fx.branchId, email: 'chu@tokyosora.vn', password: PASSWORD },
    })
  ).json<{ token: string }>().token
}, 120_000)

afterAll(async () => {
  await close?.()
  if (before === undefined) delete process.env.EINVOICE_PROVIDER
  else process.env.EINVOICE_PROVIDER = before
})

describe('Chưa đấu nối nhà cung cấp hoá đơn điện tử', () => {
  it('A9 khai đủ vẫn không bật được, và nói rõ vì sao', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/admin/einvoice',
      headers: bearer(),
      payload: {
        branchId: fx.branchId,
        taxCode: '0101234567',
        sellerName: 'CÔNG TY TNHH TOKYO SORA',
        sellerAddress: '12 Trần Thái Tông, Cầu Giấy, Hà Nội',
        serial: 'C26MAA',
        enabled: true,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('provider_not_configured')

    const config = await inject({
      method: 'GET',
      url: `/api/admin/einvoice?branch=${fx.branchId}`,
      headers: bearer(),
    })
    expect(config.json().runtime).toEqual({ provider: 'off', live: false })
    expect(config.json().branch.enabled).toBe(false)
  })

  it('F3 không phát hành được tờ hoá đơn nào', async () => {
    // Bật thẳng trong CSDL — như cấu hình cũ còn sót lại từ trước khi có chốt chặn
    await db.insert(parameters).values({ key: 'einvoice.enabled', branchId: null, value: true })
    const [order] = await db
      .insert(orders)
      .values({
        displayCode: 'PO-1022-0001',
        branchId: fx.branchId,
        channel: 'pos',
        type: 'dinein',
        status: 'done',
        paymentState: 'paid',
        moneySub: 285_000,
        moneyTotal: 285_000,
        createdByKind: 'staff',
        businessDate: '2026-10-22',
      })
      .returning({ id: orders.id })
    await db.insert(orderLines).values({
      orderId: order!.id,
      dishId: 'bachibo',
      dishCode: 'SORA-BO-001',
      nameSnapshot: 'Ba chỉ bò',
      qty: 1,
      unitPrice: 285_000,
      priceTotal: 285_000,
      state: 'served',
    })

    const res = await inject({
      method: 'POST',
      url: `/api/accounting/invoices/issue/${order!.id}`,
      headers: bearer(),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('provider_not_configured')
  })
})
