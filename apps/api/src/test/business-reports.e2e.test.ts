/**
 * Nghiệm thu nhóm báo cáo kinh doanh — B2 · B4 · B5 · B6 · B7 · B8 · B9.
 *
 * Bảy màn chỉ ĐỌC, nên bài kiểm không phải "gọi có chạy không" mà là ba điều mà
 * một báo cáo sai sẽ vi phạm và không ai phát hiện ra:
 *   1. **Doanh thu là tạm tính − giảm giá + phí phục vụ**, không phải tổng tiền:
 *      VAT là tiền thu hộ nhà nước, ship là tiền trả hộ người giao.
 *   2. **Mọi con số đi kèm kỳ đối chiếu**, và hai kỳ luôn cùng độ dài.
 *   3. **Không suy diễn khi thiếu nguồn**: mẫu số 0 thì tỉ lệ để `null`, không
 *      để 0 và cũng không để vô cực.
 *
 * Dữ liệu nạp thẳng vào CSDL: báo cáo cần đơn nằm ở nhiều ngày làm việc, mà API
 * chỉ tạo được đơn của hôm nay.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import {
  approvals,
  ingredients,
  orderLines,
  orders,
  payments,
  reservations,
  staff,
  staffRoles,
  stockMoves,
  tableSessions,
  ticketItems,
  tickets,
} from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'

/** R10 xem mọi màn · R7 quản lý ca không tới được màn có giá vốn */
let owner: string
let shiftLead: string
let waiterStaffId: number

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)

/** Kỳ cố định để bài kiểm không đổi kết quả theo lúc chạy */
const DAY1 = '2026-08-03'
const DAY2 = '2026-08-04'
/** Kỳ đối chiếu `ky-truoc` của khoảng 03–04/08 là 01–02/08 */
const PREV = '2026-08-01'

const period = `kind=tuy-chon&from=${DAY1}&to=${DAY2}&compare=ky-truoc`

/** Giờ địa phương (UTC+7) → mốc tuyệt đối */
const at = (date: string, hour: number, minute = 0) =>
  new Date(`${date}T${String(hour - 7).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)

interface OrderSpec {
  code: string
  date: string
  hour: number
  /** Tạm tính */
  sub: number
  discount?: number
  service?: number
  ship?: number
  vat?: number
  channel?: 'pos' | 'web'
  type?: 'dinein' | 'takeaway' | 'delivery'
  status?: 'done' | 'cancelled'
  paid?: boolean
  guests?: number
  tableId?: number
  staffId?: number
  payKind?: 'cash' | 'vietqr'
  /** Món trên đơn, kèm giá vốn thật ghi vào sổ kho */
  lines?: { dishId: string; code: string; name: string; qty: number; unitPrice: number; cogsVnd?: number }[]
  setLine?: { dishId: string; code: string; name: string; unitPrice: number; cogsVnd: number }
}

async function makeOrder(spec: OrderSpec) {
  const discount = spec.discount ?? 0
  const service = spec.service ?? 0
  const vat = spec.vat ?? 0
  const ship = spec.ship ?? 0
  const paid = spec.paid ?? true

  let sessionId: number | null = null
  if (spec.guests) {
    const [session] = await db
      .insert(tableSessions)
      .values({
        branchId: fx.branchId,
        tableId: spec.tableId ?? fx.grillTableId,
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
      channel: spec.channel ?? (sessionId ? 'pos' : 'web'),
      type: spec.type ?? (sessionId ? 'dinein' : 'delivery'),
      status: spec.status ?? 'done',
      tableSessionId: sessionId,
      moneySub: spec.sub,
      moneyDiscount: discount,
      moneyService: service,
      moneyVat: vat,
      moneyShip: ship,
      moneyTotal: spec.sub - discount + service + vat + ship,
      paymentState: paid ? 'paid' : 'unpaid',
      ...(spec.status === 'cancelled' ? { cancelReason: 'Khách đổi ý' } : {}),
      createdByKind: 'staff',
      createdById: String(spec.staffId ?? waiterStaffId),
      businessDate: spec.date,
      createdAt: at(spec.date, spec.hour),
      confirmedAt: at(spec.date, spec.hour),
      doneAt: at(spec.date, spec.hour, 35),
    })
    .returning({ id: orders.id })

  if (paid && spec.status !== 'cancelled') {
    await db.insert(payments).values({
      orderId: order!.id,
      branchId: fx.branchId,
      kind: spec.payKind ?? 'cash',
      amount: spec.sub - discount + service + vat + ship,
      state: 'paid',
      paidAt: at(spec.date, spec.hour, 40),
      createdByKind: 'staff',
      createdById: String(spec.staffId ?? waiterStaffId),
      businessDate: spec.date,
    })
  }

  for (const line of spec.lines ?? []) {
    const [row] = await db
      .insert(orderLines)
      .values({
        orderId: order!.id,
        dishId: line.dishId,
        dishCode: line.code,
        nameSnapshot: line.name,
        qty: line.qty,
        unitPrice: line.unitPrice,
        priceTotal: line.qty * line.unitPrice,
        state: 'served',
      })
      .returning({ id: orderLines.id })

    if (line.cogsVnd) {
      await db.insert(stockMoves).values({
        branchId: fx.branchId,
        ingredientId: 'nl-bo',
        kind: 'sale',
        qtyBase: -line.qty,
        costVnd: -line.cogsVnd,
        orderLineId: row!.id,
        businessDate: spec.date,
      })
    }
  }

  /** Dòng set cha + một dòng con — để B8 cộng giá vốn của cả hai */
  if (spec.setLine) {
    const [parent] = await db
      .insert(orderLines)
      .values({
        orderId: order!.id,
        kind: 'set_parent',
        dishId: spec.setLine.dishId,
        dishCode: spec.setLine.code,
        nameSnapshot: spec.setLine.name,
        qty: 1,
        unitPrice: spec.setLine.unitPrice,
        priceTotal: spec.setLine.unitPrice,
        state: 'served',
      })
      .returning({ id: orderLines.id })

    const [child] = await db
      .insert(orderLines)
      .values({
        orderId: order!.id,
        parentLineId: parent!.id,
        dishId: 'bachibo',
        dishCode: 'SORA-BO-001',
        nameSnapshot: 'Ba chỉ bò',
        qty: 1,
        unitPrice: 0,
        priceTotal: 0,
        state: 'served',
      })
      .returning({ id: orderLines.id })

    // Giá vốn của set nằm ở DÒNG CON — đó là chỗ nguyên liệu thật sự bị trừ
    await db.insert(stockMoves).values({
      branchId: fx.branchId,
      ingredientId: 'nl-bo',
      kind: 'sale',
      qtyBase: -1,
      costVnd: -spec.setLine.cogsVnd,
      orderLineId: child!.id,
      businessDate: spec.date,
    })
  }

  return order!.id
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

  /**
   * Quản lý ca dùng chính tài khoản Lan của harness, nhưng CHỈ giữ R7: harness
   * cho Lan cả R10, mà bài kiểm này cần một người thật sự không xem được giá vốn.
   */
  await db.delete(staffRoles).where(eq(staffRoles.staffId, fx.managerId))
  await db.insert(staffRoles).values({ staffId: fx.managerId, roleCode: 'R7', branchId: fx.branchId })
  await db
    .update(staff)
    .set({ email: 'lan@tokyosora.vn', passwordHash })
    .where(eq(staff.id, fx.managerId))

  waiterStaffId = fx.waiterId
  owner = await officeLogin('chu@tokyosora.vn')
  shiftLead = await officeLogin('lan@tokyosora.vn')

  await db.insert(ingredients).values({
    id: 'nl-bo',
    code: 'NL-BO-R',
    name: 'Bò cho báo cáo',
    baseUnit: 'g',
    purchaseUnit: 'kg',
    basePerPurchase: 1_000,
    costPerBaseMilli: 285_000,
  })

  // ---- Kỳ hiện tại: 03–04/08
  await makeOrder({
    code: 'BC-001',
    date: DAY1,
    hour: 18,
    sub: 1_000_000,
    service: 50_000,
    vat: 105_000,
    guests: 4,
    payKind: 'cash',
    lines: [
      { dishId: 'bachibo', code: 'SORA-BO-001', name: 'Ba chỉ bò', qty: 2, unitPrice: 285_000, cogsVnd: 300_000 },
      { dishId: 'miso', code: 'SORA-SUP-001', name: 'Canh miso', qty: 1, unitPrice: 45_000, cogsVnd: 10_000 },
    ],
  })
  await makeOrder({
    code: 'BC-002',
    date: DAY1,
    hour: 20,
    sub: 600_000,
    discount: 60_000,
    guests: 2,
    tableId: fx.plainTableId,
    payKind: 'vietqr',
    lines: [
      { dishId: 'bachibo', code: 'SORA-BO-001', name: 'Ba chỉ bò', qty: 1, unitPrice: 285_000, cogsVnd: 150_000 },
    ],
  })
  await makeOrder({
    code: 'BC-003',
    date: DAY2,
    hour: 12,
    sub: 400_000,
    ship: 30_000,
    channel: 'web',
    type: 'delivery',
    payKind: 'vietqr',
  })
  /** Đơn online bị huỷ — vào tỉ lệ huỷ của B9, KHÔNG vào doanh thu của B2 */
  await makeOrder({
    code: 'BC-004',
    date: DAY2,
    hour: 13,
    sub: 500_000,
    channel: 'web',
    type: 'delivery',
    status: 'cancelled',
    paid: false,
  })
  /** Đơn có set — nguồn của B8 */
  await makeOrder({
    code: 'BC-005',
    date: DAY2,
    hour: 19,
    sub: 1_280_000,
    guests: 3,
    tableId: fx.spareTableId,
    setLine: { dishId: 'setsora', code: 'SORA-SET-001', name: 'Set Sora', unitPrice: 1_280_000, cogsVnd: 500_000 },
  })

  // ---- Kỳ đối chiếu: 01–02/08
  await makeOrder({ code: 'BC-P01', date: PREV, hour: 19, sub: 800_000, guests: 2, tableId: fx.plainTableId })
  await makeOrder({ code: 'BC-P02', date: '2026-08-02', hour: 19, sub: 200_000, channel: 'web', type: 'delivery' })

  // ---- Vé bếp cho B5: một vé đúng giờ, một vé trễ
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.displayCode, 'BC-001'))
  const [onTime] = await db
    .insert(tickets)
    .values({
      displayCode: 'A-0001',
      orderId: order!.id,
      branchId: fx.branchId,
      stationId: 'ST-02',
      source: 'pos',
      batchNo: 1,
      state: 'closed',
      prepSeconds: 600,
      queuedAt: at(DAY1, 18, 5),
      readyAt: at(DAY1, 18, 13),
      dueAt: at(DAY1, 18, 15),
    })
    .returning({ id: tickets.id })
  const [late] = await db
    .insert(tickets)
    .values({
      displayCode: 'A-0002',
      orderId: order!.id,
      branchId: fx.branchId,
      stationId: 'ST-06',
      source: 'online',
      batchNo: 2,
      state: 'closed',
      prepSeconds: 600,
      queuedAt: at(DAY1, 18, 20),
      readyAt: at(DAY1, 18, 50),
      dueAt: at(DAY1, 18, 30),
    })
    .returning({ id: tickets.id })

  const [line] = await db.select({ id: orderLines.id }).from(orderLines).limit(1)
  for (const [ticketId, dishId, name] of [
    [onTime!.id, 'bachibo', 'Ba chỉ bò'],
    [late!.id, 'sodiep', 'Sò điệp Hokkaido'],
    [late!.id, 'sodiep', 'Sò điệp Hokkaido'],
    [late!.id, 'sodiep', 'Sò điệp Hokkaido'],
  ] as const) {
    await db.insert(ticketItems).values({
      ticketId,
      orderLineId: line!.id,
      dishId,
      nameSnapshot: name,
      qty: 1,
      state: 'done',
      // Món đã xong BẮT BUỘC có mốc giờ — cửa sổ hoàn tác giờ tính trên từng món
      doneAt: new Date(),
    })
  }

  // ---- Đặt bàn cho B9: một suất ngồi, một suất no-show
  await db.insert(reservations).values([
    {
      displayCode: 'DB-2608-0001',
      branchId: fx.branchId,
      seatKind: 'grill',
      guestCount: 4,
      slotAt: at(DAY1, 18),
      endAt: at(DAY1, 20),
      status: 'done',
      source: 'web',
      customerName: 'Khách A',
      customerPhone: '0900000001',
      businessDate: DAY1,
    },
    {
      displayCode: 'DB-2608-0002',
      branchId: fx.branchId,
      seatKind: 'private',
      guestCount: 6,
      slotAt: at(DAY2, 19),
      endAt: at(DAY2, 21),
      status: 'no_show',
      source: 'web',
      customerName: 'Khách B',
      customerPhone: '0900000002',
      businessDate: DAY2,
    },
  ])

  // ---- Một lượt duyệt cho B7
  await db.insert(approvals).values({
    branchId: fx.branchId,
    action: 'bill.discount-upto-10',
    requestedBy: waiterStaffId,
    approvedBy: fx.managerId,
    reason: 'Khách quen',
    entity: 'order',
    entityId: '1',
    createdAt: at(DAY1, 20, 30),
  })
}, 120_000)

afterAll(async () => {
  await close?.()
})

const get = (path: string, token = owner) =>
  inject({ method: 'GET', url: path, headers: { authorization: `Bearer ${token}` } })

// ===========================================================================

describe('B2 — Doanh thu', () => {
  /**
   * Doanh thu = tạm tính − giảm giá + phí phục vụ. VAT và ship KHÔNG vào:
   * VAT là tiền thu hộ nhà nước, ship là tiền trả hộ người giao. Cộng chúng vào
   * là tự khai khống đúng bằng hai khoản không phải của quán.
   */
  it('không cộng VAT và ship vào doanh thu', async () => {
    const res = await get(`/api/reports/revenue?branch=${fx.branchId}&${period}`)
    expect(res.statusCode, res.payload).toBe(200)
    // 1.050.000 + 540.000 + 400.000 + 1.280.000 = 3.270.000 (đơn huỷ không tính)
    expect(res.json().total.value).toBe(3_270_000)
  })

  it('so với kỳ liền trước cùng độ dài', async () => {
    const res = await get(`/api/reports/revenue?branch=${fx.branchId}&${period}`)
    const body = res.json()
    expect(body.period.baseline).toEqual({ from: PREV, to: '2026-08-02' })
    expect(body.total.previous).toBe(1_000_000)
    expect(body.total.diff).toBe(2_270_000)
  })

  it('cắt được theo giờ, khu, hình thức, kênh và cách trả tiền', async () => {
    const res = await get(`/api/reports/revenue?branch=${fx.branchId}&${period}`)
    const body = res.json()

    expect(body.byHour.map((r: { key: string }) => r.key)).toEqual(['12', '18', '19', '20'])
    expect(body.byType.find((r: { key: string }) => r.key === 'dinein').value).toBe(2_870_000)
    expect(body.byType.find((r: { key: string }) => r.key === 'delivery').value).toBe(400_000)
    expect(body.byChannel.find((r: { key: string }) => r.key === 'pos').label).toBe('Quầy / phục vụ')
    expect(body.byPayment.find((r: { key: string }) => r.key === 'vietqr')).toBeDefined()
    // Tỉ trọng của các lát cộng lại bằng 1
    const share = body.byType.reduce((s: number, r: { share: number }) => s + r.share, 0)
    expect(share).toBeCloseTo(1)
  })

  it('chuỗi theo ngày ghép đúng ngày của kỳ đối chiếu để chồng mờ lên nhau', async () => {
    const res = await get(`/api/reports/revenue?branch=${fx.branchId}&${period}`)
    const daily = res.json().daily
    expect(daily).toHaveLength(2)
    expect(daily[0]).toMatchObject({ day: DAY1, baselineDay: PREV, baseline: 800_000 })
  })

  it('đơn CHƯA trả tiền và đơn đã huỷ không vào doanh thu', async () => {
    const res = await get(`/api/reports/revenue?branch=${fx.branchId}&${period}`)
    // BC-004 huỷ 500.000 không có mặt ở bất kỳ lát nào
    expect(res.json().total.value).toBe(3_270_000)
  })
})

describe('B4 — Giá vốn & lãi gộp', () => {
  it('food cost tính từ SỔ KHO, không tính lại từ công thức', async () => {
    const res = await get(`/api/reports/cost-margin?branch=${fx.branchId}&${period}`)
    expect(res.statusCode, res.payload).toBe(200)
    // 300.000 + 10.000 + 150.000 + 500.000 = 960.000
    expect(res.json().cogs.value).toBe(960_000)
    expect(res.json().grossMargin.value).toBe(3_270_000 - 960_000)
  })

  it('nói rõ có vượt mục tiêu food cost hay không', async () => {
    const res = await get(`/api/reports/cost-margin?branch=${fx.branchId}&${period}`)
    const body = res.json()
    expect(body.target).toBe(0.35)
    expect(body.foodCost.value).toBeCloseTo(960_000 / 3_270_000)
    expect(body.foodCost.overTarget).toBe(false)
  })

  /** Ngày không bán gì thì tỉ lệ để trống, không để 0 — 0% food cost là số vô nghĩa */
  it('ngày không có doanh thu thì food cost để trống, không để 0', async () => {
    const res = await get(
      `/api/reports/cost-margin?branch=${fx.branchId}&kind=tuy-chon&from=2026-07-01&to=2026-07-02&compare=ky-truoc`,
    )
    expect(res.json().daily.every((d: { foodCost: number | null }) => d.foodCost === null)).toBe(true)
    expect(res.json().foodCost.value).toBeNull()
  })

  /**
   * Quản lý ca CÓ đọc được màn này: §4.2 cho R7 dòng `report.margin-foodcost`
   * (cùng với bếp trưởng R5). Ranh giới của §4.3.3 nằm ở chỗ khác — R7 không có
   * `report.pnl-full`, nên họ thấy food cost của chi nhánh mình mà không thấy
   * chi tiết lương từng người trên Lãi/Lỗ.
   */
  it('quản lý ca đọc được food cost, nhưng KHÔNG đọc được Lãi/Lỗ đầy đủ', async () => {
    const margin = await get(`/api/reports/cost-margin?branch=${fx.branchId}&${period}`, shiftLead)
    expect(margin.statusCode).toBe(200)

    const pnl = await get(`/api/reports/pnl?branch=${fx.branchId}&${period}`, shiftLead)
    expect(pnl.statusCode).toBe(200)
    expect(JSON.stringify(pnl.json())).not.toContain('netPay')
  })
})

describe('B5 — Hiệu suất bếp', () => {
  /**
   * Đồng hồ tính từ `queuedAt`, không từ lúc khách bấm đặt: vé `waiting` là đợt
   * chưa bấm "Ra đợt", tính cả quãng đó vào là đổ lỗi cho bếp về quyết định của
   * phục vụ.
   */
  it('đo từ lúc vé vào hàng tới lúc bếp báo xong', async () => {
    const res = await get(`/api/reports/kitchen?branch=${fx.branchId}&${period}`)
    expect(res.statusCode, res.payload).toBe(200)
    // Vé 1: 8 phút · vé 2: 30 phút ⇒ trung bình 19 phút = 1140 giây
    expect(res.json().avgSeconds.value).toBe(1_140)
    expect(res.json().tickets.value).toBe(2)
  })

  it('tỉ lệ trễ SLA đếm vé ra sau hạn', async () => {
    const res = await get(`/api/reports/kitchen?branch=${fx.branchId}&${period}`)
    expect(res.json().lateRate.value).toBe(0.5)
  })

  it('tách hai kênh tại bàn và online của cùng một trạm', async () => {
    const res = await get(`/api/reports/kitchen?branch=${fx.branchId}&${period}`)
    const stations = res.json().byStation
    expect(stations.find((s: { key: string }) => s.key === 'ST-02').bySource.pos).toBe(480)
    expect(stations.find((s: { key: string }) => s.key === 'ST-06').bySource.online).toBe(1_800)
  })

  /** Món ra dưới ba lần thì thống kê là ngẫu nhiên, không phải xu hướng */
  it('món hay trễ chỉ tính món đã ra ít nhất ba lần', async () => {
    const res = await get(`/api/reports/kitchen?branch=${fx.branchId}&${period}`)
    const dishes = res.json().slowestDishes.map((d: { dishId: string }) => d.dishId)
    expect(dishes).toContain('sodiep')
    expect(dishes).not.toContain('bachibo')
  })
})

describe('B6 — Vòng quay bàn', () => {
  it('chỉ tính phiên ĐÃ ĐÓNG, và ra đúng thời gian ngồi', async () => {
    const res = await get(`/api/reports/table-turnover?branch=${fx.branchId}&${period}`)
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().sessions.value).toBe(3)
    expect(res.json().avgMinutes.value).toBe(120)
  })

  it('đếm lượt mỗi bàn mỗi ngày và tỉ lệ lấp đầy chỗ', async () => {
    const res = await get(`/api/reports/table-turnover?branch=${fx.branchId}&${period}`)
    const body = res.json()
    expect(body.turnsPerTableDay).toBeCloseTo(3 / 3 / 2)

    const grill = body.byTable.find((t: { code: string }) => t.code === 'A4')
    expect(grill.sessions).toBe(1)
    expect(grill.guests).toBe(4)
    // Bàn A4 sức chứa tối đa 6, đón 4 khách ⇒ lấp đầy 2/3
    expect(grill.occupancy).toBeCloseTo(4 / 6)
  })
})

describe('B7 — Nhân sự', () => {
  it('doanh thu, số huỷ và số lần cần duyệt đứng cạnh nhau', async () => {
    const res = await get(`/api/reports/staff?branch=${fx.branchId}&${period}`)
    expect(res.statusCode, res.payload).toBe(200)

    const row = res.json().rows.find((r: { staffId: string }) => r.staffId === String(waiterStaffId))
    expect(row.revenue.value).toBe(3_270_000)
    expect(row.cancels).toBe(1)
    expect(row.approvalRequests).toBe(1)
    expect(row.fullName).toBe('Minh')
  })

  /** Đây là màn `report.branch-revenue` mà quản lý ca mở được — không có lương ở đây */
  it('KHÔNG có con số lương nào trong phản hồi', async () => {
    const res = await get(`/api/reports/staff?branch=${fx.branchId}&${period}`, shiftLead)
    expect(res.statusCode).toBe(200)
    const raw = JSON.stringify(res.json())
    expect(raw).not.toContain('netPay')
    expect(raw).not.toContain('hourlyRate')
  })
})

describe('B8 — Set & giảm giá', () => {
  /**
   * "Food cost theo lựa chọn thật" là điểm của màn này: giá vốn cộng từ bút toán
   * kho của dòng set VÀ các dòng con, không lấy dải lý thuyết của công thức.
   */
  it('giá vốn set cộng cả dòng con — đó là chỗ nguyên liệu thật sự bị trừ', async () => {
    const res = await get(`/api/reports/sets?branch=${fx.branchId}&${period}`)
    expect(res.statusCode, res.payload).toBe(200)

    const set = res.json().sets.find((s: { dishId: string }) => s.dishId === 'setsora')
    expect(set.sold).toBe(1)
    expect(set.revenueVnd).toBe(1_280_000)
    expect(set.cogsVnd).toBe(500_000)
    expect(set.foodCost).toBeCloseTo(500_000 / 1_280_000)
  })

  it('so bình quân đơn có giảm giá với đơn không giảm', async () => {
    const res = await get(`/api/reports/sets?branch=${fx.branchId}&${period}`)
    const d = res.json().discount
    expect(d.ordersWithDiscount).toBe(1)
    expect(d.amountVnd.value).toBe(60_000)
    expect(d.avgWithDiscountVnd).toBe(540_000)
    expect(d.avgWithoutDiscountVnd).toBeGreaterThan(0)
  })

  /**
   * Khối chương trình tách hẳn khỏi khối giảm giá tay: kỳ này không có lượt
   * hưởng chương trình nào, nhưng 60.000đ giảm giá tay ở trên vẫn phải hiện.
   * Gộp hai thứ lại là không biết tiền đi đâu (xem `crm.e2e.test.ts` cho kỳ CÓ
   * chương trình chạy).
   */
  it('khối chương trình khuyến mãi tách khỏi khối giảm giá tay', async () => {
    const res = await get(`/api/reports/sets?branch=${fx.branchId}&${period}`)
    expect(res.json().promotions).toEqual([])
    expect(res.json().discount.amountVnd.value).toBe(60_000)
  })
})

describe('B9 — Online & đặt bàn', () => {
  it('đơn online: đếm cả đơn huỷ vào tỉ lệ huỷ, nhưng không vào doanh thu', async () => {
    const res = await get(`/api/reports/online?branch=${fx.branchId}&${period}`)
    expect(res.statusCode, res.payload).toBe(200)

    const online = res.json().online
    expect(online.orders.value).toBe(2)
    expect(online.cancelRate.value).toBe(0.5)
    expect(online.revenue.value).toBe(400_000)
  })

  it('thời gian giao đo từ lúc xác nhận tới lúc xong', async () => {
    const res = await get(`/api/reports/online?branch=${fx.branchId}&${period}`)
    expect(res.json().online.avgDeliverySeconds.value).toBe(2_100)
  })

  it('tỉ lệ no-show đặt bàn, tách theo kiểu chỗ', async () => {
    const res = await get(`/api/reports/online?branch=${fx.branchId}&${period}`)
    const r = res.json().reservations
    expect(r.total.value).toBe(2)
    expect(r.noShowRate.value).toBe(0.5)

    const priv = r.bySeatKind.find((s: { key: string }) => s.key === 'private')
    expect(priv.label).toBe('Phòng riêng')
    expect(priv.noShowRate).toBe(1)
  })

  it('kỳ không có suất đặt nào thì tỉ lệ để trống, không để 0', async () => {
    const res = await get(
      `/api/reports/online?branch=${fx.branchId}&kind=tuy-chon&from=2026-07-01&to=2026-07-02&compare=ky-truoc`,
    )
    expect(res.json().reservations.noShowRate.value).toBeNull()
    expect(res.json().online.cancelRate.value).toBeNull()
  })
})
