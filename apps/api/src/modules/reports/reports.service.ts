import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, lte, ne, sql, type SQLWrapper } from 'drizzle-orm'
import { businessDateOf, startOfBusinessDay } from '../../common/business-date'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import {
  bankEvents,
  branches,
  dishAvailability,
  dishes,
  journalEntries,
  orderLines,
  orders,
  payments,
  shifts,
  staff,
  tableSessions,
} from '../../db/schema'
import { classifyMenu, quadrantShift, type MenuItemStat, type Quadrant } from './domain/menu-matrix'
import {
  addDays,
  delta,
  resolvePeriod,
  type DateRange,
  type Delta,
  type PeriodInput,
  type ResolvedPeriod,
} from './domain/period'

/**
 * Tổng tiền phải cộng bằng float8, không phải ::int.
 *
 * `int4` trần ở 2.147.483.647 — một tháng doanh thu của quán đông là vượt. Các
 * chỗ khác trong hệ thống cộng tiền trong phạm vi một đơn hoặc một ca nên ::int
 * an toàn; báo cáo cộng cả quý thì không. float8 giữ nguyên số nguyên tới 2^53
 * (9 triệu tỷ đồng) nên không mất đồng nào, mà node-postgres vẫn trả về `number`
 * — khác với bigint, thứ trả về chuỗi và lặng lẽ biến phép cộng thành nối chuỗi.
 */
const money = (expr: SQLWrapper) => sql<number>`coalesce(sum(${expr}), 0)::float8`
const count = sql<number>`count(*)::int`

/** Đơn đã huỷ không phải doanh thu — điều kiện này lặp ở mọi truy vấn nên đặt tên */
const live = ne(orders.status, 'cancelled')

/** Ô số liệu có mốc so sánh */
export interface Tile {
  value: number
  vsYesterday: Delta
  vsLastWeek: Delta
}

/** Ô chưa tính được — nói rõ THIẾU GÌ chứ không in số 0 giả */
export interface BlockedTile {
  value: null
  blockedBy: string
}

export interface TodayReport {
  branchId: string
  date: string
  yesterday: string
  lastWeek: string
  revenue: Tile
  guests: Tile
  perGuest: Tile
  orderCount: Tile
  foodCost: BlockedTile
  hourly: { hour: number; revenue: number; orders: number; baselineRevenue: number }[]
  /** Cảnh báo hàng: hôm nay bếp đang gạt món nào (86 · còn N phần) */
  soldOut: { dishId: string; code: string; name: string; status: string; remaining: number | null }[]
  stockAlert: BlockedTile
}

export interface MenuMatrixReport {
  branchId: string
  period: ResolvedPeriod
  /** 'gia-ban' = trục đóng góp đang dùng giá bán vì chưa có giá vốn */
  costBasis: 'gia-ban' | 'gia-von'
  costNote: string | null
  popularityCut: number
  contributionCut: number
  totals: { dishes: number; qty: number; revenue: number; contribution: number }
  rows: {
    dishId: string
    code: string
    name: string
    qty: number
    revenue: number
    qtyShare: number
    unitContribution: number
    quadrant: Quadrant
    /** Ô của kỳ đối chiếu; null = kỳ trước không bán món này */
    previousQuadrant: Quadrant | null
    previousQty: number
  }[]
}

export interface CashbookReport {
  branchId: string
  date: string
  shifts: {
    id: number
    cashier: string | null
    state: string
    openedAt: string
    closedAt: string | null
    openingCash: number
    cashIn: number
    expected: number | null
    counted: number | null
    variance: number | null
    note: string | null
  }[]
  byKind: { kind: string; paid: number; count: number }[]
  transfers: {
    paymentId: number
    kind: string
    amount: number
    vaNumber: string | null
    bankRef: string | null
    paidAt: string | null
    orderCode: string | null
  }[]
  /** Lượt trả đã sinh QR mà tiền chưa vào — thứ phải soi cuối ca */
  pending: { paymentId: number; kind: string; amount: number; vaNumber: string | null; createdAt: string }[]
  /** Báo có của ngân hàng chưa khớp được lượt trả nào — bảng này KHÔNG có chi nhánh */
  unmatchedBankEvents: {
    id: number
    provider: string
    bankRef: string
    vaNumber: string | null
    amount: number
    matchState: string
    receivedAt: string
  }[]
  adjustments: { id: number; amount: number; memo: string | null; createdAt: string }[]
  cashOut: BlockedTile
  otherIncome: BlockedTile
}

export interface PnlRow {
  key: string
  label: string
  /** null = chưa có nguồn; `blockedBy` nói rõ màn nào mở khoá */
  amount: number | null
  baseline: number | null
  kind: 'revenue' | 'deduction' | 'cost' | 'subtotal' | 'memo'
  blockedBy?: string
  note?: string
}

export interface PnlReport {
  branchId: string
  period: ResolvedPeriod
  rows: PnlRow[]
  orderCount: number
  primeCost: BlockedTile
}

/**
 * Nhóm báo cáo đọc-thuần: B1 · B3 · F1 · F7.
 *
 * Nguyên tắc của cả bốn màn: **không có bảng mới, không có cửa ghi mới**. Tất cả
 * số liệu suy ra từ đơn hàng, lượt trả tiền, ca thu ngân và sổ doanh thu đã có.
 * Đổi lại, những dòng cần kho (giá vốn) hoặc cần nhân sự (kỳ lương) chưa có
 * nguồn — chúng trả `null` kèm tên màn còn thiếu, chứ KHÔNG trả 0. Một con số 0
 * ở dòng "Giá vốn hàng bán" sẽ biến báo cáo lãi/lỗ thành báo cáo lãi.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // =========================================================== B1 · Hôm nay

  async today(branchId: string, requested: string | null): Promise<TodayReport> {
    const branch = await this.requireBranch(branchId)
    const date = requested ?? businessDateOf(new Date(), branch.timezone)

    const yesterday = addDays(date, -1)
    const lastWeek = addDays(date, -7)
    const days = [date, yesterday, lastWeek]

    const orderRows = await this.db
      .select({
        businessDate: orders.businessDate,
        orders: count,
        revenue: money(orders.moneyTotal),
        /** Đơn không gắn phiên bàn = mang về / giao hàng: mỗi đơn tính một lượt khách */
        offPremise: sql<number>`count(*) filter (where ${orders.tableSessionId} is null)::int`,
      })
      .from(orders)
      .where(and(eq(orders.branchId, branchId), inArray(orders.businessDate, days), live))
      .groupBy(orders.businessDate)

    const guestRows = await this.db
      .select({
        businessDate: tableSessions.businessDate,
        guests: sql<number>`coalesce(sum(${tableSessions.guestCount}), 0)::int`,
      })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.branchId, branchId),
          inArray(tableSessions.businessDate, days),
          // Bàn mở rồi khách bỏ đi chưa gọi gì thì không tính là khách đã phục vụ
          sql`exists (select 1 from ${orders} o where o.table_session_id = ${tableSessions.id} and o.status <> 'cancelled')`,
        ),
      )
      .groupBy(tableSessions.businessDate)

    const metric = (day: string) => {
      const o = orderRows.find((r) => r.businessDate === day)
      const guests = Number(guestRows.find((r) => r.businessDate === day)?.guests ?? 0) +
        Number(o?.offPremise ?? 0)
      const revenue = Number(o?.revenue ?? 0)
      return {
        revenue,
        guests,
        orders: Number(o?.orders ?? 0),
        perGuest: guests === 0 ? 0 : Math.round(revenue / guests),
      }
    }

    const now = metric(date)
    const prev = metric(yesterday)
    const week = metric(lastWeek)
    const tile = (pick: (m: ReturnType<typeof metric>) => number): Tile => ({
      value: pick(now),
      vsYesterday: delta(pick(now), pick(prev)),
      vsLastWeek: delta(pick(now), pick(week)),
    })

    return {
      branchId,
      date,
      yesterday,
      lastWeek,
      revenue: tile((m) => m.revenue),
      guests: tile((m) => m.guests),
      perGuest: tile((m) => m.perGuest),
      orderCount: tile((m) => m.orders),
      foodCost: {
        value: null,
        blockedBy: 'Cần công thức món (M4) và tiêu hao kho (S11) — chưa dựng',
      },
      hourly: await this.hourly(branchId, branch.timezone, date, lastWeek),
      soldOut: await this.soldOut(branchId, date),
      stockAlert: { value: null, blockedBy: 'Cảnh báo tồn kho cần S1 · S2 — chưa dựng' },
    }
  }

  /**
   * Doanh thu theo giờ, chồng đường cùng kỳ tuần trước.
   *
   * Giờ cắt theo MÚI GIỜ CHI NHÁNH: máy chủ chạy UTC nên `extract(hour from
   * created_at)` trần sẽ đẩy giờ cao điểm 19h về 12h.
   */
  private async hourly(branchId: string, tz: string, date: string, baseline: string) {
    const rows = await this.db
      .select({
        businessDate: orders.businessDate,
        hour: sql<number>`extract(hour from ${orders.createdAt} at time zone ${tz})::int`,
        revenue: money(orders.moneyTotal),
        orders: count,
      })
      .from(orders)
      .where(and(eq(orders.branchId, branchId), inArray(orders.businessDate, [date, baseline]), live))
      .groupBy(orders.businessDate, sql`2`)

    if (rows.length === 0) return []

    // Điền đủ các giờ ở giữa: cột trống giữa hai cột có số là thông tin, bỏ trống
    // trục làm biểu đồ nói dối về nhịp buổi tối.
    const hours = rows.map((r) => Number(r.hour))
    const out = []
    for (let hour = Math.min(...hours); hour <= Math.max(...hours); hour++) {
      const cur = rows.find((r) => r.businessDate === date && Number(r.hour) === hour)
      const base = rows.find((r) => r.businessDate === baseline && Number(r.hour) === hour)
      out.push({
        hour,
        revenue: Number(cur?.revenue ?? 0),
        orders: Number(cur?.orders ?? 0),
        baselineRevenue: Number(base?.revenue ?? 0),
      })
    }
    return out
  }

  private async soldOut(branchId: string, date: string) {
    const rows = await this.db
      .select({
        dishId: dishAvailability.dishId,
        code: dishes.code,
        name: dishes.nameVi,
        status: dishAvailability.status,
        remaining: dishAvailability.remaining,
      })
      .from(dishAvailability)
      .innerJoin(dishes, eq(dishes.id, dishAvailability.dishId))
      .where(
        and(eq(dishAvailability.branchId, branchId), eq(dishAvailability.businessDate, date)),
      )
      .orderBy(asc(dishes.nameVi))
    return rows
  }

  // ==================================================== B3 · Phân tích món

  async menuMatrix(branchId: string, input: PeriodInput): Promise<MenuMatrixReport> {
    await this.requireBranch(branchId)
    const period = resolvePeriod(input)

    const [current, baseline] = await Promise.all([
      this.dishStats(branchId, period.current),
      this.dishStats(branchId, period.baseline),
    ])

    const matrix = classifyMenu(current)
    const shift = quadrantShift(matrix, classifyMenu(baseline))
    const previousQty = new Map(baseline.map((b) => [b.dishId, b.qty]))

    return {
      branchId,
      period,
      costBasis: 'gia-ban',
      costNote:
        'Trục đóng góp đang dùng GIÁ BÁN vì chưa có giá vốn: công thức (M4) và giá bình quân từ kho (S2) chưa dựng. Món giá cao mà nguyên liệu cũng đắt sẽ nằm cao hơn thực tế.',
      popularityCut: matrix.popularityCut,
      contributionCut: matrix.contributionCut,
      totals: matrix.totals,
      rows: matrix.rows.map((r) => ({
        dishId: r.dishId,
        code: r.code,
        name: r.name,
        qty: r.qty,
        revenue: r.revenue,
        qtyShare: r.qtyShare,
        unitContribution: r.unitContribution,
        quadrant: r.quadrant,
        previousQuadrant: shift.get(r.dishId) ?? null,
        previousQty: previousQty.get(r.dishId) ?? 0,
      })),
    }
  }

  /**
   * Số phần và doanh thu từng món trong một khoảng ngày.
   *
   * Chỉ đếm dòng CHA (`parent_line_id is null`): dòng con của set mang giá 0 nên
   * gộp vào sẽ đẻ ra một đống món "đóng góp 0₫" nằm hết ở ô Bỏ đi. Đơn vị của ma
   * trận là thứ khách chọn và trả tiền; tiêu hao món thành phần bên trong set là
   * câu hỏi của kho, trả lời ở S11 khi có công thức.
   *
   * Cùng tập dòng mà `recomputeTotals` dùng để chốt `orders.money_sub`, nên tổng
   * doanh thu ở đây khớp với F7.
   */
  private async dishStats(branchId: string, range: DateRange): Promise<MenuItemStat[]> {
    const rows = await this.db
      .select({
        dishId: orderLines.dishId,
        code: orderLines.dishCode,
        name: sql<string>`max(${orderLines.nameSnapshot})`,
        qty: sql<number>`coalesce(sum(${orderLines.qty}), 0)::int`,
        revenue: money(orderLines.priceTotal),
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orders.branchId, branchId),
          gte(orders.businessDate, range.from),
          lte(orders.businessDate, range.to),
          live,
          ne(orderLines.state, 'voided'),
          sql`${orderLines.parentLineId} is null`,
        ),
      )
      .groupBy(orderLines.dishId, orderLines.dishCode)

    return rows.map((r) => ({
      dishId: r.dishId,
      code: r.code,
      name: r.name,
      qty: Number(r.qty),
      revenue: Number(r.revenue),
      // Giá vốn chưa có ⇒ đóng góp = doanh thu. Đây là ĐÚNG MỘT chỗ phải sửa khi
      // S2/M4 xong: `contribution: revenue - qty * unitCost`.
      contribution: Number(r.revenue),
    }))
  }

  // ========================================================== F1 · Sổ quỹ

  async cashbook(branchId: string, requested: string | null): Promise<CashbookReport> {
    const branch = await this.requireBranch(branchId)
    const date = requested ?? businessDateOf(new Date(), branch.timezone)

    const shiftRows = await this.db
      .select({
        id: shifts.id,
        cashier: staff.fullName,
        state: shifts.state,
        openedAt: shifts.openedAt,
        closedAt: shifts.closedAt,
        openingCash: shifts.openingCash,
        expected: shifts.closingExpected,
        counted: shifts.closingCashCounted,
        note: shifts.note,
      })
      .from(shifts)
      .leftJoin(staff, eq(staff.id, shifts.cashierId))
      .where(and(eq(shifts.branchId, branchId), eq(shifts.businessDate, date)))
      .orderBy(asc(shifts.openedAt))

    const cashByShift = await this.db
      .select({ shiftId: payments.shiftId, cash: money(payments.amount) })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          eq(payments.businessDate, date),
          eq(payments.kind, 'cash'),
          eq(payments.state, 'paid'),
        ),
      )
      .groupBy(payments.shiftId)

    const byKind = await this.db
      .select({ kind: payments.kind, paid: money(payments.amount), count })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          eq(payments.businessDate, date),
          eq(payments.state, 'paid'),
        ),
      )
      .groupBy(payments.kind)

    const transfers = await this.db
      .select({
        paymentId: payments.id,
        kind: payments.kind,
        amount: payments.amount,
        vaNumber: payments.vaNumber,
        bankRef: payments.bankRef,
        paidAt: payments.paidAt,
        orderCode: orders.displayCode,
      })
      .from(payments)
      .leftJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.branchId, branchId),
          eq(payments.businessDate, date),
          eq(payments.state, 'paid'),
          ne(payments.kind, 'cash'),
        ),
      )
      .orderBy(asc(payments.paidAt))

    const pending = await this.db
      .select({
        paymentId: payments.id,
        kind: payments.kind,
        amount: payments.amount,
        vaNumber: payments.vaNumber,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          eq(payments.businessDate, date),
          inArray(payments.state, ['pending', 'mismatch']),
        ),
      )
      .orderBy(asc(payments.createdAt))

    // `bank_events` không có cột chi nhánh — báo có chưa khớp thì chưa biết của ai.
    // Cắt theo giờ nhận, quy về ngày làm việc của chi nhánh đang xem.
    const dayStart = startOfBusinessDay(date, branch.timezone)
    const dayEnd = startOfBusinessDay(addDays(date, 1), branch.timezone)
    const unmatchedBankEvents = await this.db
      .select()
      .from(bankEvents)
      .where(
        and(
          ne(bankEvents.matchState, 'matched'),
          gte(bankEvents.receivedAt, dayStart),
          lte(bankEvents.receivedAt, dayEnd),
        ),
      )
      .orderBy(desc(bankEvents.receivedAt))

    const adjustments = await this.db
      .select({
        id: journalEntries.id,
        amount: journalEntries.amount,
        memo: journalEntries.memo,
        createdAt: journalEntries.createdAt,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.branchId, branchId),
          eq(journalEntries.businessDate, date),
          eq(journalEntries.kind, 'shift_adjust'),
        ),
      )
      .orderBy(asc(journalEntries.createdAt))

    return {
      branchId,
      date,
      shifts: shiftRows.map((s) => {
        const cashIn = Number(cashByShift.find((c) => c.shiftId === s.id)?.cash ?? 0)
        return {
          id: s.id,
          cashier: s.cashier,
          state: s.state,
          openedAt: s.openedAt.toISOString(),
          closedAt: s.closedAt?.toISOString() ?? null,
          openingCash: s.openingCash,
          cashIn,
          expected: s.expected,
          counted: s.counted,
          variance: s.counted === null || s.expected === null ? null : s.counted - s.expected,
          note: s.note,
        }
      }),
      byKind: byKind.map((k) => ({ kind: k.kind, paid: Number(k.paid), count: Number(k.count) })),
      transfers: transfers.map((t) => ({ ...t, paidAt: t.paidAt?.toISOString() ?? null })),
      pending: pending.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      unmatchedBankEvents: unmatchedBankEvents.map((e) => ({
        id: e.id,
        provider: e.provider,
        bankRef: e.bankRef,
        vaNumber: e.vaNumber,
        amount: e.amount,
        matchState: e.matchState,
        receivedAt: e.receivedAt.toISOString(),
      })),
      adjustments: adjustments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      cashOut: { value: null, blockedBy: 'Chi tiền mặt cần Sổ phiếu chi (C2) — chưa dựng' },
      otherIncome: {
        value: null,
        blockedBy: 'Phiếu thu khác ghi tại chính F1, cần thêm bảng và cửa ghi — chưa dựng',
      },
    }
  }

  // ============================================================= F7 · P&L

  async profitLoss(branchId: string, input: PeriodInput): Promise<PnlReport> {
    await this.requireBranch(branchId)
    const period = resolvePeriod(input)

    const [now, before] = await Promise.all([
      this.revenueOf(branchId, period.current),
      this.revenueOf(branchId, period.baseline),
    ])

    const netRevenue = now.sub + now.service + now.ship + now.round - now.discount - now.refund
    const baseNet =
      before.sub + before.service + before.ship + before.round - before.discount - before.refund

    const rows: PnlRow[] = [
      {
        key: 'sales',
        label: 'Doanh thu bán hàng (món)',
        amount: now.sub,
        baseline: before.sub,
        kind: 'revenue',
      },
      {
        key: 'service',
        label: 'Phí phục vụ',
        amount: now.service,
        baseline: before.service,
        kind: 'revenue',
      },
      {
        key: 'ship',
        label: 'Phí giao hàng thu khách',
        amount: now.ship,
        baseline: before.ship,
        kind: 'revenue',
      },
      {
        key: 'discount',
        label: 'Giảm giá',
        amount: -now.discount,
        baseline: -before.discount,
        kind: 'deduction',
        note:
          now.discount === 0
            ? 'Luồng giảm giá trên POS chưa nối vào đơn — mọi đơn hiện ghi giảm giá 0₫'
            : undefined,
      },
      {
        key: 'refund',
        label: 'Hoàn tiền',
        amount: -now.refund,
        baseline: -before.refund,
        kind: 'deduction',
      },
      {
        key: 'round',
        label: 'Chênh lệch làm tròn',
        amount: now.round,
        baseline: before.round,
        kind: 'revenue',
      },
      {
        key: 'other-income',
        label: 'Doanh thu khác',
        amount: null,
        baseline: null,
        kind: 'revenue',
        blockedBy: 'Phiếu thu khác (F1) — chưa dựng',
      },
      {
        key: 'net-revenue',
        label: 'Doanh thu thuần',
        amount: netRevenue,
        baseline: baseNet,
        kind: 'subtotal',
      },
      {
        key: 'cogs',
        label: 'Giá vốn hàng bán',
        amount: null,
        baseline: null,
        kind: 'cost',
        blockedBy: 'Kho (S5 · S6 · S11) + công thức (M4) — chưa dựng',
      },
      {
        key: 'gross-profit',
        label: 'Lãi gộp',
        amount: null,
        baseline: null,
        kind: 'subtotal',
        blockedBy: 'Chờ giá vốn hàng bán',
      },
      {
        key: 'labour',
        label: 'Nhân sự',
        amount: null,
        baseline: null,
        kind: 'cost',
        blockedBy: 'Kỳ lương (H7) — chưa dựng',
      },
      {
        key: 'rent',
        label: 'Mặt bằng',
        amount: null,
        baseline: null,
        kind: 'cost',
        blockedBy: 'Sổ phiếu chi (C2) + chi phí định kỳ (C3) — chưa dựng',
      },
      {
        key: 'utilities',
        label: 'Tiện ích',
        amount: null,
        baseline: null,
        kind: 'cost',
        blockedBy: 'Sổ phiếu chi (C2) + chi phí định kỳ (C3) — chưa dựng',
      },
      {
        key: 'depreciation',
        label: 'Khấu hao',
        amount: null,
        baseline: null,
        kind: 'cost',
        blockedBy: 'Tài sản & khấu hao (C4) — chưa dựng',
      },
      {
        key: 'marketing',
        label: 'Marketing',
        amount: null,
        baseline: null,
        kind: 'cost',
        blockedBy: 'Sổ phiếu chi (C2) — chưa dựng',
      },
      {
        key: 'payment-fee',
        label: 'Phí thanh toán',
        amount: null,
        baseline: null,
        kind: 'cost',
        blockedBy: 'Chưa có biểu phí nhà cung cấp trong Trung tâm tham số (A6)',
      },
      {
        key: 'other-opex',
        label: 'Vận hành khác',
        amount: null,
        baseline: null,
        kind: 'cost',
        blockedBy: 'Sổ phiếu chi (C2) — chưa dựng',
      },
      {
        key: 'operating-profit',
        label: 'Lợi nhuận hoạt động',
        amount: null,
        baseline: null,
        kind: 'subtotal',
        blockedBy: 'Chờ đủ các dòng chi phí',
      },
      {
        key: 'vat-out',
        label: 'VAT đầu ra (thu hộ, không phải doanh thu)',
        amount: now.vat,
        baseline: before.vat,
        kind: 'memo',
      },
      {
        key: 'collected',
        label: 'Tiền đã thực thu trong kỳ',
        amount: now.collected,
        baseline: before.collected,
        kind: 'memo',
        note: 'Đối chiếu với sổ quỹ F1 — khác doanh thu vì đơn ghi nhận ngay, tiền có thể về sau',
      },
    ]

    return {
      branchId,
      period,
      rows,
      orderCount: now.orders,
      primeCost: {
        value: null,
        blockedBy: 'Prime cost = giá vốn + nhân sự — thiếu cả hai, chưa cảnh báo được ngưỡng 60%',
      },
    }
  }

  private async revenueOf(branchId: string, range: DateRange) {
    const within = and(
      eq(orders.branchId, branchId),
      gte(orders.businessDate, range.from),
      lte(orders.businessDate, range.to),
      live,
    )

    const [row] = await this.db
      .select({
        orders: count,
        sub: money(orders.moneySub),
        discount: money(orders.moneyDiscount),
        service: money(orders.moneyService),
        vat: money(orders.moneyVat),
        ship: money(orders.moneyShip),
        round: money(orders.moneyRound),
        total: money(orders.moneyTotal),
      })
      .from(orders)
      .where(within)

    const [cash] = await this.db
      .select({
        collected: money(payments.amount),
      })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          gte(payments.businessDate, range.from),
          lte(payments.businessDate, range.to),
          eq(payments.state, 'paid'),
        ),
      )

    const [refunded] = await this.db
      .select({ refund: money(payments.amount) })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          gte(payments.businessDate, range.from),
          lte(payments.businessDate, range.to),
          eq(payments.state, 'refunded'),
        ),
      )

    return {
      orders: Number(row?.orders ?? 0),
      sub: Number(row?.sub ?? 0),
      discount: Number(row?.discount ?? 0),
      service: Number(row?.service ?? 0),
      vat: Number(row?.vat ?? 0),
      ship: Number(row?.ship ?? 0),
      round: Number(row?.round ?? 0),
      total: Number(row?.total ?? 0),
      collected: Number(cash?.collected ?? 0),
      refund: Number(refunded?.refund ?? 0),
    }
  }

  // --------------------------------------------------------------- phụ trợ

  private async requireBranch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return branch
  }
}
