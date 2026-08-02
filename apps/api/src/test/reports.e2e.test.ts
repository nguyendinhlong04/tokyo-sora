/**
 * Nghiệm thu nhóm báo cáo B1 · B3 · F1 · F7.
 *
 * Bốn màn này không ghi gì cả, nên bài kiểm không phải là "bấm có chạy không" mà
 * là: **cùng một ngày dữ liệu, bốn màn có nói cùng một câu chuyện không**, và
 * những ô chưa có nguồn có chịu nhận là chưa có nguồn không — thay vì in số 0.
 *
 * Dữ liệu nạp thẳng vào CSDL chứ không đi qua API: báo cáo cần đơn nằm ở NHIỀU
 * ngày làm việc (hôm qua, tuần trước) mà API thì chỉ tạo được đơn của hôm nay.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import {
  bankEvents,
  dishAvailability,
  journalEntries,
  orderLines,
  orders,
  payments,
  shifts,
  staff,
  staffRoles,
  tableSessions,
} from '../db/schema'
import type {
  CashbookReport,
  MenuMatrixReport,
  PnlReport,
  TodayReport,
} from '../modules/reports/reports.service'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'

/** R10 xem được mọi màn · R7 chỉ tới được doanh thu, không tới được kế toán */
let owner: string
let shiftLead: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const asOwner = () => ({ authorization: `Bearer ${owner}` })

/** Ngày neo cố định để bài kiểm không đổi kết quả theo lúc chạy */
const TODAY = '2026-08-02'
const YESTERDAY = '2026-08-01'
const LAST_WEEK = '2026-07-26'

/** Giờ địa phương (UTC+7) → mốc tuyệt đối */
const at = (date: string, hour: number, minute = 0) =>
  new Date(`${date}T${String(hour - 7).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)

interface LineSpec {
  dishId: string
  code: string
  name: string
  qty: number
  unitPrice: number
}

async function makeOrder(spec: {
  code: string
  date: string
  hour: number
  lines: LineSpec[]
  guests?: number
  ship?: number
  status?: 'done' | 'cancelled'
  tableId?: number
}) {
  const sub = spec.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  const ship = spec.ship ?? 0

  let sessionId: number | null = null
  if (spec.guests) {
    const [session] = await db
      .insert(tableSessions)
      .values({
        branchId: fx.branchId,
        tableId: spec.tableId ?? fx.grillTableId,
        // Đóng sẵn: chỉ MỘT phiên chưa đóng được tồn tại trên một bàn
        status: 'closed',
        guestCount: spec.guests,
        openedAt: at(spec.date, spec.hour),
        closedAt: at(spec.date, spec.hour + 2),
        businessDate: spec.date,
      })
      .returning({ id: tableSessions.id })
    sessionId = session!.id
  }

  const [order] = await db
    .insert(orders)
    .values({
      displayCode: spec.code,
      branchId: fx.branchId,
      channel: sessionId ? 'pos' : 'web',
      type: sessionId ? 'dinein' : 'delivery',
      status: spec.status ?? 'done',
      tableSessionId: sessionId,
      moneySub: sub,
      moneyShip: ship,
      moneyTotal: sub + ship,
      ...(spec.status === 'cancelled' ? { cancelReason: 'Khách đổi ý' } : {}),
      createdByKind: 'staff',
      businessDate: spec.date,
      createdAt: at(spec.date, spec.hour),
    })
    .returning({ id: orders.id })

  for (const line of spec.lines) {
    await db.insert(orderLines).values({
      orderId: order!.id,
      dishId: line.dishId,
      dishCode: line.code,
      nameSnapshot: line.name,
      qty: line.qty,
      unitPrice: line.unitPrice,
      priceTotal: line.qty * line.unitPrice,
      state: 'served',
    })
  }

  return { orderId: order!.id, sessionId, total: sub + ship }
}

const BACHIBO: LineSpec = {
  dishId: 'bachibo',
  code: 'SORA-BO-001',
  name: 'Ba chỉ bò',
  qty: 2,
  unitPrice: 285_000,
}
const MISO: LineSpec = {
  dishId: 'miso',
  code: 'SORA-SUP-001',
  name: 'Canh miso rong biển',
  qty: 1,
  unitPrice: 45_000,
}
const SODIEP: LineSpec = {
  dishId: 'sodiep',
  code: 'SORA-HS-001',
  name: 'Sò điệp Hokkaido',
  qty: 1,
  unitPrice: 245_000,
}
const DUAMUOI: LineSpec = {
  dishId: 'duamuoi',
  code: 'SORA-KV-001',
  name: 'Dưa muối ba vị',
  qty: 3,
  unitPrice: 65_000,
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

  const passwordHash = await hash(OFFICE_PASSWORD)
  const [chu] = await db
    .insert(staff)
    .values({ code: 'CHU01', fullName: 'Chủ quán', email: 'chu@tokyosora.vn', passwordHash })
    .returning({ id: staff.id })
  await db.insert(staffRoles).values({ staffId: chu!.id, roleCode: 'R10', branchId: null })

  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash })
    .where(eq(staff.id, fx.managerId))
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db.insert(staffRoles).values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })

  owner = await officeLogin('chu@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')

  // ---- Hôm nay: 3 đơn sống + 1 đơn huỷ (đơn huỷ phải biến mất khỏi mọi con số)
  const dineIn = await makeOrder({
    code: 'PO-0802-0001',
    date: TODAY,
    hour: 19,
    guests: 4,
    lines: [BACHIBO, MISO],
  })
  const second = await makeOrder({
    code: 'PO-0802-0002',
    date: TODAY,
    hour: 20,
    guests: 2,
    tableId: fx.plainTableId,
    lines: [SODIEP],
  })
  const delivery = await makeOrder({
    code: 'ON-0802-0003',
    date: TODAY,
    hour: 19,
    ship: 20_000,
    lines: [DUAMUOI],
  })
  await makeOrder({
    code: 'PO-0802-0004',
    date: TODAY,
    hour: 21,
    guests: 3,
    tableId: fx.spareTableId,
    status: 'cancelled',
    lines: [{ ...BACHIBO, qty: 1 }],
  })

  // ---- Hôm qua và cùng thứ tuần trước — chỉ cần tổng để so
  await makeOrder({
    code: 'PO-0801-0001',
    date: YESTERDAY,
    hour: 19,
    guests: 5,
    lines: [
      { dishId: 'thanbo', code: 'SORA-BO-002', name: 'Thăn bò', qty: 1, unitPrice: 500_000 },
      MISO,
    ],
  })
  await makeOrder({
    code: 'PO-0726-0001',
    date: LAST_WEEK,
    hour: 19,
    guests: 4,
    lines: [{ ...BACHIBO, qty: 1, unitPrice: 800_000 }],
  })

  // ---- Ca thu ngân của hôm nay + tiền
  const [shift] = await db
    .insert(shifts)
    .values({
      branchId: fx.branchId,
      cashierId: fx.cashierId,
      state: 'closed',
      openingCash: 2_000_000,
      openedAt: at(TODAY, 16),
      closedAt: at(TODAY, 23, 30),
      closingExpected: 2_615_000,
      closingCashCounted: 2_600_000,
      businessDate: TODAY,
    })
    .returning({ id: shifts.id })

  await db.insert(payments).values({
    branchId: fx.branchId,
    orderId: dineIn.orderId,
    tableSessionId: dineIn.sessionId,
    shiftId: shift!.id,
    kind: 'cash',
    amount: 615_000,
    state: 'paid',
    paidAt: at(TODAY, 21),
    createdByKind: 'staff',
    businessDate: TODAY,
  })
  await db.insert(payments).values({
    branchId: fx.branchId,
    orderId: second.orderId,
    tableSessionId: second.sessionId,
    shiftId: shift!.id,
    kind: 'vietqr',
    amount: 245_000,
    state: 'paid',
    vaNumber: 'VA0000123',
    bankRef: 'FT26080200001',
    paidAt: at(TODAY, 22),
    createdByKind: 'staff',
    businessDate: TODAY,
  })
  // Đơn giao đã sinh QR nhưng tiền chưa vào — thứ phải soi lúc đóng ca
  await db.insert(payments).values({
    branchId: fx.branchId,
    orderId: delivery.orderId,
    shiftId: shift!.id,
    kind: 'vietqr',
    amount: 215_000,
    state: 'pending',
    vaNumber: 'VA0000124',
    createdByKind: 'staff',
    businessDate: TODAY,
  })

  await db.insert(journalEntries).values({
    branchId: fx.branchId,
    kind: 'shift_adjust',
    amount: -15_000,
    memo: `Lệch quỹ đóng ca #${shift!.id}`,
    businessDate: TODAY,
  })

  // Ngân hàng báo có một khoản không khớp lượt trả nào
  await db.insert(bankEvents).values({
    provider: 'vietinbank',
    bankRef: 'FT26080200099',
    vaNumber: 'VA9999999',
    amount: 300_000,
    raw: { note: 'chuyen tien' },
    matchState: 'unmatched',
    receivedAt: at(TODAY, 22, 30),
  })

  // Bếp gạt hết món
  await db.insert(dishAvailability).values({
    branchId: fx.branchId,
    dishId: 'sodiep',
    businessDate: TODAY,
    status: 'limited',
    remaining: 3,
  })
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------- B1

describe('B1 — Hôm nay', () => {
  const load = async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/today?branch=${fx.branchId}&date=${TODAY}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    return res.json<TodayReport>()
  }

  it('doanh thu cộng đúng và đơn huỷ không được tính', async () => {
    const body = await load()
    // 615.000 + 245.000 + (195.000 + 20.000 ship) — đơn huỷ 285.000 đứng ngoài
    expect(body.revenue.value).toBe(1_075_000)
    expect(body.orderCount.value).toBe(3)
  })

  it('mỗi ô có cả hai mốc: hôm qua và cùng thứ tuần trước', async () => {
    const body = await load()
    expect(body.revenue.vsYesterday.previous).toBe(545_000)
    expect(body.revenue.vsLastWeek.previous).toBe(800_000)
    expect(body.revenue.vsYesterday.percent).toBeCloseTo(1_075_000 / 545_000 - 1)
  })

  it('đếm khách: khách tại bàn theo phiên, đơn giao mỗi đơn một lượt', async () => {
    const body = await load()
    expect(body.guests.value).toBe(7) // 4 + 2 tại bàn, 1 đơn giao; bàn của đơn huỷ không tính
    expect(body.perGuest.value).toBe(Math.round(1_075_000 / 7))
  })

  it('biểu đồ theo giờ cắt theo múi giờ chi nhánh và chồng đường tuần trước', async () => {
    const body = await load()
    const hour = (h: number) => body.hourly.find((row) => row.hour === h)!
    expect(hour(19).revenue).toBe(830_000) // 615.000 tại bàn + 215.000 đơn giao
    expect(hour(19).baselineRevenue).toBe(800_000)
    expect(hour(20).revenue).toBe(245_000)
  })

  it('food cost nhận là chưa tính được thay vì in số 0', async () => {
    const body = await load()
    expect(body.foodCost.value).toBeNull()
    expect(body.foodCost.blockedBy).toContain('M4')
    expect(body.stockAlert.value).toBeNull()
  })

  it('cảnh báo món bếp đang gạt', async () => {
    const body = await load()
    expect(body.soldOut).toHaveLength(1)
    expect(body.soldOut[0]).toMatchObject({ dishId: 'sodiep', status: 'limited', remaining: 3 })
  })
})

// ---------------------------------------------------------------- B3

describe('B3 — Phân tích món', () => {
  const load = async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/menu-matrix?branch=${fx.branchId}&kind=tuy-chon&compare=ky-truoc&from=${TODAY}&to=${TODAY}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    return res.json<MenuMatrixReport>()
  }

  const row = (body: MenuMatrixReport, dishId: string) =>
    body.rows.find((r) => r.dishId === dishId)!

  it('xếp đủ bốn ô từ dữ liệu thật', async () => {
    const body = await load()
    expect(row(body, 'bachibo').quadrant).toBe('ngoi-sao')
    expect(row(body, 'duamuoi').quadrant).toBe('bo-sua')
    expect(row(body, 'sodiep').quadrant).toBe('cau-do')
    expect(row(body, 'miso').quadrant).toBe('bo-di')
  })

  it('tổng doanh thu món khớp doanh thu bán hàng của F7 (không gồm phí giao)', async () => {
    const body = await load()
    expect(body.totals.revenue).toBe(1_055_000)
    expect(body.totals.qty).toBe(7)
  })

  it('nói rõ trục đóng góp đang dùng giá bán, chưa phải giá vốn', async () => {
    const body = await load()
    expect(body.costBasis).toBe('gia-ban')
    expect(body.costNote).toContain('GIÁ BÁN')
  })

  it('chỉ ra món đã dịch chuyển ô so với kỳ trước', async () => {
    const body = await load()
    // Hôm qua canh miso là Bò sữa (bán chạy, đóng góp thấp), hôm nay tụt xuống Bỏ đi
    expect(row(body, 'miso').previousQuadrant).toBe('bo-sua')
    // Ba chỉ bò hôm qua không bán ⇒ không có ô cũ, khác với "ô Bỏ đi"
    expect(row(body, 'bachibo').previousQuadrant).toBeNull()
  })

  it('đơn huỷ không đẩy món vào ma trận', async () => {
    const body = await load()
    expect(row(body, 'bachibo').qty).toBe(2) // đơn huỷ có thêm 1 phần ba chỉ bò
  })
})

// ---------------------------------------------------------------- F1

describe('F1 — Sổ quỹ & đối soát', () => {
  const load = async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/cashbook?branch=${fx.branchId}&date=${TODAY}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    return res.json<CashbookReport>()
  }

  it('mỗi ca hiện đầu ca, thu tiền mặt trong ca, và chênh lệch kiểm quỹ', async () => {
    const body = await load()
    expect(body.shifts).toHaveLength(1)
    expect(body.shifts[0]).toMatchObject({
      cashier: 'Hoa',
      openingCash: 2_000_000,
      cashIn: 615_000,
      expected: 2_615_000,
      counted: 2_600_000,
      variance: -15_000,
    })
  })

  it('tách tiền theo hình thức trả', async () => {
    const body = await load()
    const kinds = Object.fromEntries(
      body.byKind.map((k: { kind: string; paid: number }) => [k.kind, k.paid]),
    )
    expect(kinds).toEqual({ cash: 615_000, vietqr: 245_000 })
  })

  it('liệt kê giao dịch chuyển khoản kèm mã đơn và mã ngân hàng', async () => {
    const body = await load()
    expect(body.transfers).toHaveLength(1)
    expect(body.transfers[0]).toMatchObject({
      amount: 245_000,
      bankRef: 'FT26080200001',
      orderCode: 'PO-0802-0002',
    })
  })

  it('nêu lượt trả chưa có tiền về và báo có chưa khớp — hai hàng đợi phải soi', async () => {
    const body = await load()
    expect(body.pending).toHaveLength(1)
    expect(body.pending[0]!.amount).toBe(215_000)
    expect(body.unmatchedBankEvents).toHaveLength(1)
    expect(body.unmatchedBankEvents[0]!.bankRef).toBe('FT26080200099')
  })

  it('ghi nhận bút toán lệch quỹ', async () => {
    const body = await load()
    expect(body.adjustments).toHaveLength(1)
    expect(body.adjustments[0]!.amount).toBe(-15_000)
  })

  it('chi tiền mặt và phiếu thu khác nhận là chưa có cửa ghi', async () => {
    const body = await load()
    expect(body.cashOut.value).toBeNull()
    expect(body.cashOut.blockedBy).toContain('C2')
    expect(body.otherIncome.value).toBeNull()
  })
})

// ---------------------------------------------------------------- F7

describe('F7 — Lãi/Lỗ', () => {
  const load = async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/pnl?branch=${fx.branchId}&kind=tuy-chon&compare=ky-truoc&from=${TODAY}&to=${TODAY}`,
      headers: asOwner(),
    })
    expect(res.statusCode, res.payload).toBe(200)
    return res.json<PnlReport>()
  }

  const line = (body: PnlReport, key: string) => body.rows.find((r) => r.key === key)!

  it('doanh thu thuần cộng đúng từ các dòng phía trên', async () => {
    const body = await load()
    expect(line(body, 'sales').amount).toBe(1_055_000)
    expect(line(body, 'ship').amount).toBe(20_000)
    expect(line(body, 'net-revenue').amount).toBe(1_075_000)
  })

  it('kỳ đối chiếu là ngày liền trước', async () => {
    const body = await load()
    expect(body.period.baseline).toEqual({ from: YESTERDAY, to: YESTERDAY })
    expect(line(body, 'sales').baseline).toBe(545_000)
  })

  it('giá vốn, nhân sự và lãi gộp để trống kèm tên màn còn thiếu', async () => {
    const body = await load()
    expect(line(body, 'cogs').amount).toBeNull()
    expect(line(body, 'cogs').blockedBy).toContain('S11')
    expect(line(body, 'labour').blockedBy).toContain('H7')
    expect(line(body, 'gross-profit').amount).toBeNull()
    expect(body.primeCost.value).toBeNull()
  })

  it('tiền thực thu tách khỏi doanh thu — đơn giao chưa trả không được tính là đã thu', async () => {
    const body = await load()
    expect(line(body, 'collected').amount).toBe(860_000) // 615.000 + 245.000
  })

  it('VAT đầu ra đứng ở dòng ghi nhớ, không nằm trong doanh thu', async () => {
    const body = await load()
    expect(line(body, 'vat-out').kind).toBe('memo')
  })
})

// ------------------------------------------------------------ Phân quyền

describe('Phân quyền theo ma trận §4.2', () => {
  const asLead = () => ({ authorization: `Bearer ${shiftLead}` })

  it('quản lý ca xem được doanh thu hôm nay', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/today?branch=${fx.branchId}&date=${TODAY}`,
      headers: asLead(),
    })
    expect(res.statusCode).toBe(200)
  })

  it('quản lý ca KHÔNG mở được sổ quỹ và lãi/lỗ — hai màn kế toán', async () => {
    for (const url of ['cashbook?date=' + TODAY, 'pnl?kind=ngay']) {
      const res = await inject({
        method: 'GET',
        url: `/api/reports/${url}&branch=${fx.branchId}`,
        headers: asLead(),
      })
      expect(res.statusCode, url).toBe(403)
    }
  })

  it('thiếu mã chi nhánh thì báo lỗi rõ, không trả báo cáo rỗng', async () => {
    const res = await inject({ method: 'GET', url: '/api/reports/today', headers: asOwner() })
    expect(res.statusCode).toBe(400)
  })
})
