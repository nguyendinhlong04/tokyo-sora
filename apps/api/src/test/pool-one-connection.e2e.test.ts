/**
 * Pool MỘT kết nối, đúng như production (Vercel không đặt `DATABASE_POOL_MAX` → 1).
 *
 * Transaction giữ kết nối duy nhất của pool; truy vấn nào trong lúc đó đi qua
 * `this.db` thay vì `tx` sẽ xin kết nối thứ hai, chờ tới `connectionTimeoutMillis`
 * (10 s) rồi ném lỗi — request thành 500. Máy dev pool 10 nên không bao giờ thấy.
 * Mỗi ca dưới đây đi qua một luồng từng kẹt đúng kiểu đó (CLAUDE.md §11 mục 8).
 *
 * Các file e2e khác giữ pool mặc định: ca đua thật giữa hai request cần hai kết nối,
 * pool 1 sẽ xếp chúng nối đuôi nhau và ca đó không còn kiểm được gì.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DB } from '../common/db.module'
import { ParamsService } from '../common/params.service'
import type { Db } from '../db/client'
import { devices, expenseCategories, staff, staffRoles } from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const DEVICE = 'pool-one-device'
const ACCOUNTANT_PIN = '3308'
let accountantId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const auth = (token: string) => ({ authorization: `Bearer ${token}`, [DEVICE_HEADER]: DEVICE })

async function login(staffId: number, pin = fx.pins[staffId]) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { [DEVICE_HEADER]: DEVICE },
    payload: { branchId: fx.branchId, staffId, pin },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

beforeAll(async () => {
  // `createPool()` đọc biến này lúc Nest dựng DbModule; trả lại ngay sau khi dựng
  const previous = process.env.DATABASE_POOL_MAX
  process.env.DATABASE_POOL_MAX = '1'
  try {
    const boot = await bootTestApp()
    app = boot.app
    db = boot.db
    fx = boot.fixtures
    close = boot.close
  } finally {
    if (previous === undefined) delete process.env.DATABASE_POOL_MAX
    else process.env.DATABASE_POOL_MAX = previous
  }

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'cashier',
    name: 'Máy thu ngân pool 1',
    tokenHash: hashToken(DEVICE),
  })
  // Duyệt phiếu chi phải là người KHÁC người ghi — harness chỉ có một người giữ R10
  const [row] = await db
    .insert(staff)
    .values({ code: 'KT01', fullName: 'Kế toán Vân', pinHash: await hash(ACCOUNTANT_PIN) })
    .returning({ id: staff.id })
  accountantId = row!.id
  await db
    .insert(staffRoles)
    .values({ staffId: accountantId, roleCode: 'R8', branchId: fx.branchId })
  await db
    .insert(expenseCategories)
    .values({ id: 'mat-bang', name: 'Mặt bằng', pnlLine: 'rent', sort: 0 })
}, 120_000)

afterAll(async () => {
  await close?.()
})

// Chạy TRƯỚC mọi đăng nhập: đăng nhập đọc tham số ngoài transaction và làm ấm cache,
// che mất đúng trường hợp cần kiểm — instance vừa khởi động, lần đọc đầu nằm trong tx.
describe('Tham số A6 — instance vừa khởi động', () => {
  it('đọc tham số trong transaction không chờ pool', async () => {
    const appDb = app.get<Db>(DB)
    const params = app.get(ParamsService)
    const rounding = await appDb.transaction(() =>
      params.getNumber('sales.roundingUnit', -1, fx.branchId),
    )
    expect(rounding).toBe(1000)
  })
})

describe('Duyệt PIN △ trong transaction (P8 huỷ món đã gửi bếp)', () => {
  it('quản lý duyệt bằng PIN → huỷ được', async () => {
    const cashier = await login(fx.cashierId)
    const waiter = await login(fx.waiterId)

    const opened = await inject({
      method: 'POST',
      url: `/api/tables/${fx.plainTableId}/open`,
      headers: auth(cashier),
      payload: { guestCount: 2 },
    })
    expect(opened.statusCode, opened.payload).toBe(201)
    const sessionId = opened.json<{ id: number }>().id

    const added = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/lines`,
      headers: auth(cashier),
      payload: { lines: [{ dishId: 'miso', qty: 1 }] },
    })
    expect(added.statusCode, added.payload).toBe(201)
    const sent = await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/send`,
      headers: auth(cashier),
    })
    expect(sent.statusCode, sent.payload).toBe(201)

    const order = await inject({
      method: 'GET',
      url: `/api/table-sessions/${sessionId}/order`,
      headers: auth(cashier),
    })
    const lineId = order
      .json<{ lines: { id: number; kind: string }[] }>()
      .lines.find((l) => l.kind === 'dish')!.id

    const res = await inject({
      method: 'POST',
      url: `/api/order-lines/${lineId}/void`,
      headers: auth(waiter),
      payload: {
        reason: 'khách đổi ý',
        approval: {
          approverStaffId: fx.managerId,
          approverPin: fx.pins[fx.managerId],
          reason: 'chưa lên bếp',
        },
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json<{ approvalId: number }>().approvalId).toBeGreaterThan(0)
  })
})

describe('H7 tính nháp — giờ công và tạm ứng đọc trong transaction', () => {
  it('chốt công rồi tính nháp ra dòng lương', async () => {
    const owner = await login(fx.managerId)

    const employee = await inject({
      method: 'POST',
      url: '/api/hr/employees',
      headers: auth(owner),
      payload: {
        staffId: fx.chefId,
        branchId: fx.branchId,
        position: 'Bếp chính',
        payKind: 'hourly',
        hourlyRateVnd: 30_000,
        monthlySalaryVnd: 0,
        fixedAllowanceVnd: 0,
        startedOn: '2026-01-05',
        endedOn: null,
        bankAccount: null,
        active: true,
      },
    })
    expect(employee.statusCode, employee.payload).toBe(201)

    const period = await inject({
      method: 'POST',
      url: '/api/hr/payroll/periods',
      headers: auth(owner),
      payload: { branchId: fx.branchId, periodStart: '2026-09-01', periodEnd: '2026-09-30' },
    })
    expect(period.statusCode, period.payload).toBe(201)
    const periodId = period.json<{ id: number }>().id

    const locked = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/lock`,
      headers: auth(owner),
    })
    expect(locked.statusCode, locked.payload).toBe(201)

    const draft = await inject({
      method: 'POST',
      url: `/api/hr/payroll/periods/${periodId}/compute`,
      headers: auth(owner),
      payload: {},
    })
    expect(draft.statusCode, draft.payload).toBe(201)
    expect(draft.json<{ lines: number }>().lines).toBe(1)
  })
})

describe('Duyệt phiếu chi — khoá sổ F6 kiểm trong transaction', () => {
  it('kế toán duyệt phiếu chi chờ duyệt', async () => {
    const owner = await login(fx.managerId)
    const accountant = await login(accountantId, ACCOUNTANT_PIN)

    // Trên mức chi vặt (2 triệu) thì phiếu nằm chờ duyệt
    const created = await inject({
      method: 'POST',
      url: '/api/expenses/vouchers',
      headers: auth(owner),
      payload: {
        branchId: fx.branchId,
        categoryId: 'mat-bang',
        amountVnd: 3_000_000,
        method: 'transfer',
        amortizeFrom: '2026-09-01',
        paidOn: '2026-09-10',
      },
    })
    expect(created.statusCode, created.payload).toBe(201)
    expect(created.json<{ state: string }>().state).toBe('draft')

    const approved = await inject({
      method: 'POST',
      url: `/api/expenses/vouchers/${created.json<{ id: number }>().id}/approve`,
      headers: auth(accountant),
    })
    expect(approved.statusCode, approved.payload).toBe(201)
    expect(approved.json<{ state: string }>().state).toBe('approved')
  })
})

describe('M10 — báo đổi cây danh mục cho mọi chi nhánh', () => {
  it('tạo rồi sửa nhóm', async () => {
    const owner = await login(fx.managerId)

    const created = await inject({
      method: 'POST',
      url: '/api/admin/categories',
      headers: auth(owner),
      payload: { id: 'nuong', nameVi: 'Món nướng' },
    })
    expect(created.statusCode, created.payload).toBe(201)

    const updated = await inject({
      method: 'PATCH',
      url: '/api/admin/categories/nuong',
      headers: auth(owner),
      payload: { nameVi: 'Nướng than' },
    })
    expect(updated.statusCode, updated.payload).toBe(200)
  })
})
