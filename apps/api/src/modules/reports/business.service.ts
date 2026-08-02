import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, eq, gte, inArray, lte, ne, sql, type SQLWrapper } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import type { Db } from '../../db/client'
import {
  approvals,
  areas,
  branches,
  categories,
  dishes,
  orderLines,
  orders,
  payments,
  promotionRedemptions,
  promotions,
  reservations,
  staff,
  stockMoves,
  tableSessions,
  tables,
  ticketItems,
  tickets,
} from '../../db/schema'
import {
  delta,
  listDays,
  resolvePeriod,
  type DateRange,
  type Delta,
  type ResolvedPeriod,
} from './domain/period'
import type { PeriodQuery } from './reports.service'

/** Cùng lý do với `reports.service.ts`: tổng tiền cả kỳ vượt tầm int4 */
const money = (expr: SQLWrapper) => sql<number>`coalesce(sum(${expr}), 0)::float8`
const count = sql<number>`count(*)::int`

/**
 * Doanh thu THỰC của một đơn: tạm tính trừ giảm giá cộng phí phục vụ.
 *
 * KHÔNG lấy `moneyTotal`: nó gồm cả VAT và phí ship, mà VAT là tiền thu hộ nhà
 * nước còn ship là tiền trả hộ người giao — cộng chúng vào doanh thu là tự khai
 * khống đúng bằng hai khoản không phải của quán.
 */
const netRevenue = sql`${orders.moneySub} - ${orders.moneyDiscount} + ${orders.moneyService}`

/** Đơn được tính vào doanh thu: đã trả tiền và không bị huỷ */
const soldOrders = (branchId: string, range: DateRange) =>
  and(
    eq(orders.branchId, branchId),
    gte(orders.businessDate, range.from),
    lte(orders.businessDate, range.to),
    eq(orders.paymentState, 'paid'),
    ne(orders.status, 'cancelled'),
  )

export interface Slice {
  key: string
  label: string
  value: number
  previous: number
  diff: number
  percent: number | null
  /** Tỉ trọng trong kỳ hiện tại */
  share: number
}

/**
 * Nhóm báo cáo kinh doanh — B2 · B4 · B5 · B6 · B7 · B8 · B9.
 *
 * Tách khỏi `ReportsService` (B1 · B3 · F1 · F7) vì file kia đã đủ dài, không vì
 * chúng khác loại: cả hai cùng CHỈ ĐỌC và cùng đi qua `resolvePeriod`, nên hai
 * màn bất kỳ cắt kỳ giống hệt nhau.
 *
 * QUY TẮC XUYÊN SUỐT (§25): mọi con số đều đi kèm con số của kỳ đối chiếu. Một
 * báo cáo không so được kỳ chỉ nói "tháng này bán 400 triệu" — câu đó không giúp
 * ai quyết định gì cho tới khi biết tháng trước bán bao nhiêu.
 *
 * HAI THỨ CỐ TÌNH KHÔNG SUY DIỄN:
 *   · Không có dữ liệu thì trả mảng rỗng, KHÔNG trả 0. Số 0 ở ô food cost trông
 *     y hệt một số đo thật, và người đọc sẽ tin nó.
 *   · Tỉ lệ có mẫu số 0 thì để `null`, không để `Infinity` hay 0.
 */
@Injectable()
export class BusinessReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
  ) {}

  // ==================================================== B2 · Doanh thu

  /**
   * Doanh thu cắt theo năm lát: ngày · khung giờ · khu vực · hình thức · kênh ·
   * cách trả tiền. Lát nào cũng kèm con số kỳ đối chiếu.
   *
   * Năm lát chứ không phải một bảng có bộ lọc: người đọc muốn biết "tối nay yếu
   * hơn tối qua ở đâu", và câu đó chỉ trả lời được khi nhìn nhiều lát cạnh nhau.
   */
  async revenue(branchId: string, input: PeriodQuery) {
    const period = await this.resolve(branchId, input)

    const [current, baseline] = await Promise.all([
      this.revenueSlices(branchId, period.current),
      this.revenueSlices(branchId, period.baseline),
    ])

    const merge = (
      now: { key: string; label: string; value: number }[],
      before: { key: string; label: string; value: number }[],
    ): Slice[] => {
      const total = now.reduce((s, r) => s + r.value, 0)
      const keys = [...new Set([...now.map((r) => r.key), ...before.map((r) => r.key)])]
      return keys
        .map((key) => {
          const a = now.find((r) => r.key === key)
          const b = before.find((r) => r.key === key)
          const d = delta(a?.value ?? 0, b?.value ?? 0)
          return {
            key,
            label: a?.label ?? b?.label ?? key,
            ...d,
            share: total > 0 ? (a?.value ?? 0) / total : 0,
          }
        })
        .sort((x, y) => y.value - x.value)
    }

    return {
      branchId,
      period,
      total: delta(current.totalVnd, baseline.totalVnd),
      orders: delta(current.orderCount, baseline.orderCount),
      guests: delta(current.guestCount, baseline.guestCount),
      /** Bình quân mỗi khách — con số nói chất lượng bán hàng rõ hơn tổng doanh thu */
      perGuest: delta(
        current.guestCount > 0 ? Math.round(current.totalVnd / current.guestCount) : 0,
        baseline.guestCount > 0 ? Math.round(baseline.totalVnd / baseline.guestCount) : 0,
      ),
      /** Chuỗi theo ngày để vẽ đường; kỳ đối chiếu chồng mờ lên trên */
      daily: listDays(period.current).map((day, index) => ({
        day,
        value: current.byDay.find((r) => r.key === day)?.value ?? 0,
        baselineDay: listDays(period.baseline)[index] ?? null,
        baseline:
          baseline.byDay.find((r) => r.key === (listDays(period.baseline)[index] ?? ''))?.value ?? 0,
      })),
      byHour: merge(current.byHour, baseline.byHour).sort((a, b) => Number(a.key) - Number(b.key)),
      byArea: merge(current.byArea, baseline.byArea),
      byType: merge(current.byType, baseline.byType),
      byChannel: merge(current.byChannel, baseline.byChannel),
      byPayment: merge(current.byPayment, baseline.byPayment),
    }
  }

  private async revenueSlices(branchId: string, range: DateRange) {
    const where = soldOrders(branchId, range)

    const [totals, byDay, byHour, byArea, byType, byChannel, byPayment] = await Promise.all([
      this.db
        .select({ total: money(netRevenue), orders: count })
        .from(orders)
        .where(where),
      this.db
        .select({ key: orders.businessDate, value: money(netRevenue) })
        .from(orders)
        .where(where)
        .groupBy(orders.businessDate),
      this.db
        .select({
          key: sql<string>`extract(hour from ${orders.createdAt} at time zone 'Asia/Ho_Chi_Minh')::int::text`,
          value: money(netRevenue),
        })
        .from(orders)
        .where(where)
        .groupBy(sql`1`),
      this.db
        .select({ key: sql<string>`coalesce(${areas.name}, 'Mang về / giao')`, value: money(netRevenue) })
        .from(orders)
        .leftJoin(tableSessions, eq(tableSessions.id, orders.tableSessionId))
        .leftJoin(tables, eq(tables.id, tableSessions.tableId))
        .leftJoin(areas, eq(areas.id, tables.areaId))
        .where(where)
        .groupBy(sql`1`),
      this.db
        .select({ key: orders.type, value: money(netRevenue) })
        .from(orders)
        .where(where)
        .groupBy(orders.type),
      this.db
        .select({ key: orders.channel, value: money(netRevenue) })
        .from(orders)
        .where(where)
        .groupBy(orders.channel),
      this.db
        .select({ key: payments.kind, value: money(payments.amount) })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(where, eq(payments.state, 'paid')))
        .groupBy(payments.kind),
    ])

    /** Khách đếm từ phiên bàn; đơn mang về và giao tính một khách */
    const [guests] = await this.db
      .select({
        guests: sql<number>`coalesce(sum(coalesce(${tableSessions.guestCount}, 1)), 0)::float8`,
      })
      .from(orders)
      .leftJoin(tableSessions, eq(tableSessions.id, orders.tableSessionId))
      .where(where)

    const label = (dict: Record<string, string>) => (key: string) => dict[key] ?? key
    const TYPE = label({ dinein: 'Tại bàn', takeaway: 'Mang về', delivery: 'Giao hàng' })
    const CHANNEL = label({ pos: 'Quầy / phục vụ', table: 'Khách tự gọi', web: 'Website' })
    const PAY = label({ cash: 'Tiền mặt', vietqr: 'Chuyển khoản', card: 'Thẻ', cod: 'Thu hộ' })

    const norm = (rows: { key: string | null; value: number }[], toLabel = (k: string) => k) =>
      rows.map((r) => ({ key: r.key ?? '?', label: toLabel(r.key ?? '?'), value: Number(r.value) }))

    return {
      totalVnd: Number(totals[0]?.total ?? 0),
      orderCount: Number(totals[0]?.orders ?? 0),
      guestCount: Number(guests?.guests ?? 0),
      byDay: norm(byDay),
      byHour: norm(byHour, (h) => `${String(h).padStart(2, '0')}:00`),
      byArea: norm(byArea),
      byType: norm(byType, TYPE),
      byChannel: norm(byChannel, CHANNEL),
      byPayment: norm(byPayment, PAY),
    }
  }

  // =============================================== B4 · Giá vốn & lãi gộp

  /**
   * Food cost theo ngày so với mục tiêu, và đóng góp lãi gộp theo nhóm món.
   *
   * Giá vốn lấy từ SỔ KHO (`stock_moves` loại `sale`), không tính lại từ công
   * thức: sổ kho ghi số thật đã xuất tại thời điểm bán, còn công thức là ý định.
   * Hai con số đó lệch nhau chính là hao hụt — và đó là việc của S11, không phải
   * của màn này.
   */
  async costAndMargin(branchId: string, input: PeriodQuery) {
    const period = await this.resolve(branchId, input)
    const target = await this.params.getNumber('report.foodCostTarget', 0.35, branchId)

    const [current, baseline] = await Promise.all([
      this.costSlices(branchId, period.current),
      this.costSlices(branchId, period.baseline),
    ])

    const ratio = (cogs: number, revenue: number) => (revenue > 0 ? cogs / revenue : null)

    return {
      branchId,
      period,
      target,
      revenue: delta(current.revenueVnd, baseline.revenueVnd),
      cogs: delta(current.cogsVnd, baseline.cogsVnd),
      grossMargin: delta(
        current.revenueVnd - current.cogsVnd,
        baseline.revenueVnd - baseline.cogsVnd,
      ),
      foodCost: {
        value: ratio(current.cogsVnd, current.revenueVnd),
        previous: ratio(baseline.cogsVnd, baseline.revenueVnd),
        overTarget: ratio(current.cogsVnd, current.revenueVnd) !== null
          ? ratio(current.cogsVnd, current.revenueVnd)! > target
          : null,
      },
      /** Đường food cost từng ngày để nhìn ngày nào bung ra khỏi mục tiêu */
      daily: listDays(period.current).map((day) => {
        const revenue = current.revenueByDay.get(day) ?? 0
        const cogs = current.cogsByDay.get(day) ?? 0
        return {
          day,
          revenueVnd: revenue,
          cogsVnd: cogs,
          foodCost: ratio(cogs, revenue),
          overTarget: revenue > 0 ? cogs / revenue > target : null,
        }
      }),
      /**
       * Đóng góp lãi gộp theo nhóm món. Sắp theo TIỀN lãi gộp chứ không theo tỉ
       * lệ: một nhóm food cost 20% mà bán được hai đĩa đóng góp ít hơn nhóm 40%
       * bán cả trăm đĩa, và người quyết định thực đơn cần thấy điều đó.
       */
      byCategory: current.byCategory
        .map((row) => {
          const before = baseline.byCategory.find((b) => b.key === row.key)
          return {
            key: row.key,
            label: row.label,
            revenueVnd: row.revenueVnd,
            cogsVnd: row.cogsVnd,
            grossVnd: row.revenueVnd - row.cogsVnd,
            foodCost: ratio(row.cogsVnd, row.revenueVnd),
            grossDelta: delta(
              row.revenueVnd - row.cogsVnd,
              before ? before.revenueVnd - before.cogsVnd : 0,
            ),
          }
        })
        .sort((a, b) => b.grossVnd - a.grossVnd),
    }
  }

  private async costSlices(branchId: string, range: DateRange) {
    const [revenueRows, cogsRows, byCategory] = await Promise.all([
      this.db
        .select({ day: orders.businessDate, value: money(netRevenue) })
        .from(orders)
        .where(soldOrders(branchId, range))
        .groupBy(orders.businessDate),
      this.db
        .select({ day: stockMoves.businessDate, value: money(sql`-${stockMoves.costVnd}`) })
        .from(stockMoves)
        .where(
          and(
            eq(stockMoves.branchId, branchId),
            eq(stockMoves.kind, 'sale'),
            gte(stockMoves.businessDate, range.from),
            lte(stockMoves.businessDate, range.to),
          ),
        )
        .groupBy(stockMoves.businessDate),
      this.db
        .select({
          key: sql<string>`coalesce(${categories.id}, 'khac')`,
          label: sql<string>`coalesce(${categories.nameVi}, 'Chưa xếp nhóm')`,
          revenueVnd: money(sql`${orderLines.unitPrice} * ${orderLines.qty}`),
          cogsVnd: money(sql`coalesce((
            select -sum(m.cost_vnd) from ${stockMoves} m where m.order_line_id = ${orderLines.id}
          ), 0)`),
        })
        .from(orderLines)
        .innerJoin(orders, eq(orders.id, orderLines.orderId))
        .leftJoin(dishes, eq(dishes.id, orderLines.dishId))
        .leftJoin(categories, eq(categories.id, dishes.categoryId))
        .where(and(soldOrders(branchId, range), ne(orderLines.state, 'voided')))
        .groupBy(sql`1, 2`),
    ])

    return {
      revenueVnd: revenueRows.reduce((s, r) => s + Number(r.value), 0),
      cogsVnd: cogsRows.reduce((s, r) => s + Number(r.value), 0),
      revenueByDay: new Map(revenueRows.map((r) => [r.day, Number(r.value)])),
      cogsByDay: new Map(cogsRows.map((r) => [r.day, Number(r.value)])),
      byCategory: byCategory.map((r) => ({
        key: r.key,
        label: r.label,
        revenueVnd: Number(r.revenueVnd),
        cogsVnd: Number(r.cogsVnd),
      })),
    }
  }

  // ================================================ B5 · Hiệu suất bếp

  /**
   * Thời gian từ lúc vé vào hàng tới lúc bếp báo xong, theo trạm và theo giờ.
   *
   * Đồng hồ tính từ `queuedAt`, KHÔNG từ lúc khách bấm đặt: vé `waiting` là đợt
   * chưa được bấm "Ra đợt", và tính cả quãng đó vào thời gian bếp là đổ lỗi cho
   * bếp về một quyết định của phục vụ.
   *
   * Tách hai kênh (§25 B5): đơn tại bàn và đơn online có nhịp khác hẳn nhau, gộp
   * lại thì trung bình không mô tả cái nào cả.
   */
  async kitchenPerformance(branchId: string, input: PeriodQuery) {
    const period = await this.resolve(branchId, input)

    const inRange = (range: DateRange) =>
      and(
        eq(tickets.branchId, branchId),
        eq(tickets.state, 'closed'),
        sql`${tickets.queuedAt} is not null and ${tickets.readyAt} is not null`,
        gte(sql`(${tickets.queuedAt} at time zone 'Asia/Ho_Chi_Minh')::date`, range.from),
        lte(sql`(${tickets.queuedAt} at time zone 'Asia/Ho_Chi_Minh')::date`, range.to),
      )

    const seconds = sql<number>`extract(epoch from ${tickets.readyAt} - ${tickets.queuedAt})`
    const late = sql<number>`count(*) filter (where ${tickets.readyAt} > ${tickets.dueAt})::int`

    const [overall, previous, byStation, byHour, slowest] = await Promise.all([
      this.db
        .select({ avg: sql<number>`coalesce(avg(${seconds}), 0)::float8`, total: count, late })
        .from(tickets)
        .where(inRange(period.current)),
      this.db
        .select({ avg: sql<number>`coalesce(avg(${seconds}), 0)::float8`, total: count, late })
        .from(tickets)
        .where(inRange(period.baseline)),
      this.db
        .select({
          key: tickets.stationId,
          avg: sql<number>`coalesce(avg(${seconds}), 0)::float8`,
          p90: sql<number>`coalesce(percentile_disc(0.9) within group (order by ${seconds}), 0)::float8`,
          total: count,
          late,
          source: tickets.source,
        })
        .from(tickets)
        .where(inRange(period.current))
        .groupBy(tickets.stationId, tickets.source),
      this.db
        .select({
          key: sql<string>`extract(hour from ${tickets.queuedAt} at time zone 'Asia/Ho_Chi_Minh')::int::text`,
          avg: sql<number>`coalesce(avg(${seconds}), 0)::float8`,
          total: count,
          late,
        })
        .from(tickets)
        .where(inRange(period.current))
        .groupBy(sql`1`),
      this.db
        .select({
          dishId: ticketItems.dishId,
          name: ticketItems.nameSnapshot,
          avg: sql<number>`coalesce(avg(${seconds}), 0)::float8`,
          total: count,
          late,
        })
        .from(ticketItems)
        .innerJoin(tickets, eq(tickets.id, ticketItems.ticketId))
        .where(inRange(period.current))
        .groupBy(ticketItems.dishId, ticketItems.nameSnapshot)
        .having(sql`count(*) >= 3`),
    ])

    const lateRate = (row?: { total: number; late: number }) =>
      row && Number(row.total) > 0 ? Number(row.late) / Number(row.total) : null

    /** Gộp hai kênh của cùng một trạm thành một dòng, giữ riêng hai con số */
    const stations = new Map<
      string,
      { key: string; total: number; late: number; avgSeconds: number; p90Seconds: number; bySource: Record<string, number> }
    >()
    for (const row of byStation) {
      const entry = stations.get(row.key) ?? {
        key: row.key,
        total: 0,
        late: 0,
        avgSeconds: 0,
        p90Seconds: 0,
        bySource: {},
      }
      const n = Number(row.total)
      entry.avgSeconds = Math.round(
        (entry.avgSeconds * entry.total + Number(row.avg) * n) / (entry.total + n || 1),
      )
      entry.p90Seconds = Math.max(entry.p90Seconds, Math.round(Number(row.p90)))
      entry.total += n
      entry.late += Number(row.late)
      entry.bySource[row.source] = Math.round(Number(row.avg))
      stations.set(row.key, entry)
    }

    return {
      branchId,
      period,
      /** Thời gian trung bình, GIÂY — làm tròn ở đây, không để màn hình tự chia */
      avgSeconds: delta(Math.round(Number(overall[0]?.avg ?? 0)), Math.round(Number(previous[0]?.avg ?? 0))),
      tickets: delta(Number(overall[0]?.total ?? 0), Number(previous[0]?.total ?? 0)),
      lateRate: {
        value: lateRate(overall[0]),
        previous: lateRate(previous[0]),
      },
      byStation: [...stations.values()]
        .map((s) => ({ ...s, lateRate: s.total > 0 ? s.late / s.total : null }))
        .sort((a, b) => b.total - a.total),
      byHour: byHour
        .map((r) => ({
          key: r.key,
          label: `${String(r.key).padStart(2, '0')}:00`,
          avgSeconds: Math.round(Number(r.avg)),
          tickets: Number(r.total),
          lateRate: Number(r.total) > 0 ? Number(r.late) / Number(r.total) : null,
        }))
        .sort((a, b) => Number(a.key) - Number(b.key)),
      /** Món hay trễ — chỉ tính món đã ra ít nhất 3 lần, dưới đó là ngẫu nhiên */
      slowestDishes: slowest
        .map((r) => ({
          dishId: r.dishId,
          name: r.name,
          avgSeconds: Math.round(Number(r.avg)),
          served: Number(r.total),
          lateRate: Number(r.total) > 0 ? Number(r.late) / Number(r.total) : null,
        }))
        .sort((a, b) => (b.lateRate ?? 0) - (a.lateRate ?? 0) || b.avgSeconds - a.avgSeconds)
        .slice(0, 20),
    }
  }

  // ================================================= B6 · Vòng quay bàn

  /**
   * Thời gian ngồi và số lượt mỗi bàn mỗi ngày.
   *
   * Chỉ tính phiên ĐÃ ĐÓNG: phiên đang mở chưa có thời gian ngồi, và lấy "tới
   * bây giờ" làm thời gian kết thúc sẽ kéo trung bình lên mỗi khi ai đó mở màn
   * lúc quán đang đông.
   */
  async tableTurnover(branchId: string, input: PeriodQuery) {
    const period = await this.resolve(branchId, input)

    const closed = (range: DateRange) =>
      and(
        eq(tableSessions.branchId, branchId),
        eq(tableSessions.status, 'closed'),
        sql`${tableSessions.closedAt} is not null`,
        gte(tableSessions.businessDate, range.from),
        lte(tableSessions.businessDate, range.to),
      )

    const minutes = sql<number>`extract(epoch from ${tableSessions.closedAt} - ${tableSessions.openedAt}) / 60`

    const [now, before, byTable, byHour] = await Promise.all([
      this.db
        .select({
          avg: sql<number>`coalesce(avg(${minutes}), 0)::float8`,
          sessions: count,
          guests: sql<number>`coalesce(sum(${tableSessions.guestCount}), 0)::float8`,
        })
        .from(tableSessions)
        .where(closed(period.current)),
      this.db
        .select({
          avg: sql<number>`coalesce(avg(${minutes}), 0)::float8`,
          sessions: count,
          guests: sql<number>`coalesce(sum(${tableSessions.guestCount}), 0)::float8`,
        })
        .from(tableSessions)
        .where(closed(period.baseline)),
      this.db
        .select({
          tableId: tables.id,
          code: tables.code,
          areaName: areas.name,
          seatMax: tables.seatMax,
          sessions: count,
          avg: sql<number>`coalesce(avg(${minutes}), 0)::float8`,
          guests: sql<number>`coalesce(sum(${tableSessions.guestCount}), 0)::float8`,
          revenue: sql<number>`coalesce((
            select sum(o.money_sub - o.money_discount + o.money_service)
            from ${orders} o
            where o.table_session_id in (
              select s2.id from ${tableSessions} s2 where s2.table_id = ${tables.id}
                and s2.business_date between ${period.current.from} and ${period.current.to}
            ) and o.payment_state = 'paid' and o.status <> 'cancelled'
          ), 0)::float8`,
        })
        .from(tableSessions)
        .innerJoin(tables, eq(tables.id, tableSessions.tableId))
        .leftJoin(areas, eq(areas.id, tables.areaId))
        .where(closed(period.current))
        .groupBy(tables.id, tables.code, areas.name, tables.seatMax),
      this.db
        .select({
          key: sql<string>`extract(hour from ${tableSessions.openedAt} at time zone 'Asia/Ho_Chi_Minh')::int::text`,
          sessions: count,
          avg: sql<number>`coalesce(avg(${minutes}), 0)::float8`,
        })
        .from(tableSessions)
        .where(closed(period.current))
        .groupBy(sql`1`),
    ])

    const days = period.days
    const totalSessions = Number(now[0]?.sessions ?? 0)

    return {
      branchId,
      period,
      avgMinutes: delta(Math.round(Number(now[0]?.avg ?? 0)), Math.round(Number(before[0]?.avg ?? 0))),
      sessions: delta(totalSessions, Number(before[0]?.sessions ?? 0)),
      guests: delta(Number(now[0]?.guests ?? 0), Number(before[0]?.guests ?? 0)),
      /** Lượt mỗi bàn mỗi ngày — con số mà §25 B6 gọi tên */
      turnsPerTableDay: byTable.length > 0 ? totalSessions / byTable.length / days : null,
      byTable: byTable
        .map((r) => ({
          tableId: r.tableId,
          code: r.code,
          areaName: r.areaName,
          seatMax: r.seatMax,
          sessions: Number(r.sessions),
          turnsPerDay: Number(r.sessions) / days,
          avgMinutes: Math.round(Number(r.avg)),
          guests: Number(r.guests),
          revenueVnd: Number(r.revenue),
          /** Lấp đầy chỗ: khách trung bình mỗi lượt so với sức chứa */
          occupancy: r.seatMax > 0 ? Number(r.guests) / Number(r.sessions) / r.seatMax : null,
        }))
        .sort((a, b) => b.sessions - a.sessions),
      byHour: byHour
        .map((r) => ({
          key: r.key,
          label: `${String(r.key).padStart(2, '0')}:00`,
          sessions: Number(r.sessions),
          avgMinutes: Math.round(Number(r.avg)),
        }))
        .sort((a, b) => Number(a.key) - Number(b.key)),
    }
  }

  // ==================================================== B7 · Nhân sự

  /**
   * Doanh thu theo người phục vụ, số huỷ, số lần cần duyệt.
   *
   * Ba con số này đứng cạnh nhau là có lý do: doanh thu cao mà số lần cần duyệt
   * cũng cao thì đó không phải người bán giỏi, đó là người đang giảm giá để bán.
   * Tách chúng ra hai màn là bỏ mất chính so sánh ấy.
   *
   * KHÔNG có tên và số lương ở đây — đây là màn `report.branch-revenue` mà quản
   * lý ca mở được, và nguyên tắc cứng thứ tư nói họ không thấy lương.
   */
  async staffPerformance(branchId: string, input: PeriodQuery) {
    const period = await this.resolve(branchId, input)

    const byStaff = async (range: DateRange) =>
      this.db
        .select({
          staffId: orders.createdById,
          revenue: money(netRevenue),
          orders: count,
        })
        .from(orders)
        .where(and(soldOrders(branchId, range), eq(orders.createdByKind, 'staff')))
        .groupBy(orders.createdById)

    const [now, before, cancels, approvalRows, people] = await Promise.all([
      byStaff(period.current),
      byStaff(period.baseline),
      this.db
        .select({ staffId: orders.createdById, cancels: count })
        .from(orders)
        .where(
          and(
            eq(orders.branchId, branchId),
            eq(orders.status, 'cancelled'),
            eq(orders.createdByKind, 'staff'),
            gte(orders.businessDate, period.current.from),
            lte(orders.businessDate, period.current.to),
          ),
        )
        .groupBy(orders.createdById),
      this.db
        .select({ staffId: approvals.requestedBy, requests: count })
        .from(approvals)
        .where(
          and(
            eq(approvals.branchId, branchId),
            gte(sql`(${approvals.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date`, period.current.from),
            lte(sql`(${approvals.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date`, period.current.to),
          ),
        )
        .groupBy(approvals.requestedBy),
      this.db.select({ id: staff.id, fullName: staff.fullName }).from(staff),
    ])

    const nameOf = (id: string | null) =>
      people.find((p) => String(p.id) === String(id))?.fullName ?? 'Không rõ'

    const keys = [...new Set([...now.map((r) => r.staffId), ...before.map((r) => r.staffId)])]
    const rows = keys
      .filter((id): id is string => id !== null)
      .map((staffId) => {
        const a = now.find((r) => r.staffId === staffId)
        const b = before.find((r) => r.staffId === staffId)
        const orderCount = Number(a?.orders ?? 0)
        return {
          staffId,
          fullName: nameOf(staffId),
          revenue: delta(Number(a?.revenue ?? 0), Number(b?.revenue ?? 0)),
          orders: orderCount,
          perOrderVnd: orderCount > 0 ? Math.round(Number(a?.revenue ?? 0) / orderCount) : 0,
          cancels: Number(cancels.find((c) => c.staffId === staffId)?.cancels ?? 0),
          approvalRequests: Number(
            approvalRows.find((r) => String(r.staffId) === String(staffId))?.requests ?? 0,
          ),
        }
      })
      .sort((a, b) => b.revenue.value - a.revenue.value)

    return {
      branchId,
      period,
      rows,
      totals: {
        revenueVnd: rows.reduce((s, r) => s + r.revenue.value, 0),
        cancels: rows.reduce((s, r) => s + r.cancels, 0),
        approvalRequests: rows.reduce((s, r) => s + r.approvalRequests, 0),
      },
    }
  }

  // =============================================== B8 · Khuyến mãi & set

  /**
   * Hiệu quả của SET, của CHƯƠNG TRÌNH KHUYẾN MÃI, và của giảm giá tay.
   *
   * Ba khối riêng vì ba thứ khác nhau, và gộp chúng lại là cách chắc chắn để
   * không biết tiền đi đâu:
   *   · **Set** — food cost theo LỰA CHỌN THẬT của khách. Một set "chọn 4 trong
   *     10" có dải giá vốn rộng, và giá vốn trung bình theo lý thuyết không nói
   *     được khách thật sự chọn món đắt hay món rẻ.
   *   · **Chương trình** — lượt hưởng và tiền giảm của từng chương trình soạn ở
   *     B11. Đây là chỗ §25 B8 nói "hiệu quả chương trình".
   *   · **Giảm giá tay** — thu ngân bấm giảm tại quầy, không thuộc chương trình
   *     nào. Tác động của nó lên bình quân mỗi đơn là câu hỏi riêng.
   */
  async setsAndPromotions(branchId: string, input: PeriodQuery) {
    const period = await this.resolve(branchId, input)

    const setRows = async (range: DateRange) =>
      this.db
        .select({
          dishId: orderLines.dishId,
          name: orderLines.nameSnapshot,
          sold: sql<number>`coalesce(sum(${orderLines.qty}), 0)::float8`,
          revenue: money(sql`${orderLines.unitPrice} * ${orderLines.qty}`),
          /** Giá vốn thật: cộng bút toán kho của CHÍNH dòng set và các dòng con */
          cogs: money(sql`coalesce((
            select -sum(m.cost_vnd) from ${stockMoves} m
            where m.order_line_id = ${orderLines.id}
               or m.order_line_id in (
                 select c.id from ${orderLines} c where c.parent_line_id = ${orderLines.id}
               )
          ), 0)`),
        })
        .from(orderLines)
        .innerJoin(orders, eq(orders.id, orderLines.orderId))
        .where(
          and(
            soldOrders(branchId, range),
            eq(orderLines.kind, 'set_parent'),
            ne(orderLines.state, 'voided'),
          ),
        )
        .groupBy(orderLines.dishId, orderLines.nameSnapshot)

    const discountStats = async (range: DateRange) =>
      this.db
        .select({
          discounted: sql<number>`count(*) filter (where ${orders.moneyDiscount} > 0)::int`,
          total: count,
          discountVnd: money(orders.moneyDiscount),
          revenue: money(netRevenue),
          avgWithDiscount: sql<number>`coalesce(avg(${netRevenue}) filter (where ${orders.moneyDiscount} > 0), 0)::float8`,
          avgWithout: sql<number>`coalesce(avg(${netRevenue}) filter (where ${orders.moneyDiscount} = 0), 0)::float8`,
        })
        .from(orders)
        .where(soldOrders(branchId, range))

    /** Lượt hưởng chương trình B11 — nguồn thật của "hiệu quả chương trình" */
    const promoRows = async (range: DateRange) =>
      this.db
        .select({
          promotionId: promotionRedemptions.promotionId,
          code: promotions.code,
          name: promotions.name,
          kind: promotions.kind,
          uses: sql<number>`count(*)::int`,
          discountVnd: money(promotionRedemptions.discountVnd),
          revenueVnd: money(netRevenue),
        })
        .from(promotionRedemptions)
        .innerJoin(promotions, eq(promotions.id, promotionRedemptions.promotionId))
        .innerJoin(orders, eq(orders.id, promotionRedemptions.orderId))
        .where(
          and(
            eq(promotionRedemptions.branchId, branchId),
            gte(promotionRedemptions.businessDate, range.from),
            lte(promotionRedemptions.businessDate, range.to),
          ),
        )
        .groupBy(promotionRedemptions.promotionId, promotions.code, promotions.name, promotions.kind)

    const [sets, setsBefore, discount, discountBefore, promos, promosBefore] = await Promise.all([
      setRows(period.current),
      setRows(period.baseline),
      discountStats(period.current),
      discountStats(period.baseline),
      promoRows(period.current),
      promoRows(period.baseline),
    ])

    const d = discount[0]
    const db_ = discountBefore[0]

    return {
      branchId,
      period,
      sets: sets
        .map((row) => {
          const before = setsBefore.find((b) => b.dishId === row.dishId)
          const revenue = Number(row.revenue)
          const cogs = Number(row.cogs)
          return {
            dishId: row.dishId,
            name: row.name,
            sold: Number(row.sold),
            soldDelta: delta(Number(row.sold), Number(before?.sold ?? 0)),
            revenueVnd: revenue,
            cogsVnd: cogs,
            grossVnd: revenue - cogs,
            /** Food cost tính trên lựa chọn THẬT, không trên dải lý thuyết */
            foodCost: revenue > 0 ? cogs / revenue : null,
          }
        })
        .sort((a, b) => b.revenueVnd - a.revenueVnd),
      promotions: promos
        .map((row) => {
          const before = promosBefore.find((b) => b.promotionId === row.promotionId)
          const revenue = Number(row.revenueVnd)
          const discountVnd = Number(row.discountVnd)
          return {
            promotionId: row.promotionId,
            code: row.code,
            name: row.name,
            kind: row.kind,
            uses: row.uses,
            usesDelta: delta(row.uses, Number(before?.uses ?? 0)),
            discountVnd,
            revenueVnd: revenue,
            /** Bình quân đơn có chương trình — so với `avgWithoutDiscountVnd` bên dưới */
            avgTicketVnd: row.uses > 0 ? Math.round(revenue / row.uses) : 0,
            /** Bao nhiêu phần trăm doanh thu của những đơn đó đã cho đi */
            giveawayRate: revenue + discountVnd > 0 ? discountVnd / (revenue + discountVnd) : null,
          }
        })
        .sort((a, b) => b.discountVnd - a.discountVnd),
      discount: {
        ordersWithDiscount: Number(d?.discounted ?? 0),
        ordersTotal: Number(d?.total ?? 0),
        rate: Number(d?.total ?? 0) > 0 ? Number(d?.discounted ?? 0) / Number(d?.total ?? 0) : null,
        amountVnd: delta(Number(d?.discountVnd ?? 0), Number(db_?.discountVnd ?? 0)),
        /** Đơn có giảm giá to hơn hay nhỏ hơn đơn không giảm — câu hỏi thật của B8 */
        avgWithDiscountVnd: Math.round(Number(d?.avgWithDiscount ?? 0)),
        avgWithoutDiscountVnd: Math.round(Number(d?.avgWithout ?? 0)),
      },
    }
  }

  // ============================================ B9 · Online & đặt bàn

  /**
   * Đơn online theo giờ, tỉ lệ huỷ, thời gian giao; và tỉ lệ no-show đặt bàn.
   *
   * Hai luồng ở một màn vì chúng cùng trả lời một câu: **khách hẹn trước thì có
   * đến không**. Đơn online huỷ và suất đặt bàn no-show là cùng một loại thiệt
   * hại — bếp đã chuẩn bị, chỗ đã giữ, mà không ai tới.
   */
  async onlineAndReservations(branchId: string, input: PeriodQuery) {
    const period = await this.resolve(branchId, input)

    const onlineIn = (range: DateRange) =>
      and(
        eq(orders.branchId, branchId),
        inArray(orders.channel, ['web', 'grab', 'shopee', 'be']),
        gte(orders.businessDate, range.from),
        lte(orders.businessDate, range.to),
      )

    const deliverySeconds = sql<number>`extract(epoch from ${orders.doneAt} - ${orders.confirmedAt})`

    const [now, before, byHour, reservationNow, reservationBefore] = await Promise.all([
      this.db
        .select({
          total: count,
          cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
          revenue: money(sql`case when ${orders.paymentState} = 'paid' and ${orders.status} <> 'cancelled' then ${netRevenue} else 0 end`),
          avgDelivery: sql<number>`coalesce(avg(${deliverySeconds}) filter (
            where ${orders.type} = 'delivery' and ${orders.doneAt} is not null and ${orders.confirmedAt} is not null
          ), 0)::float8`,
        })
        .from(orders)
        .where(onlineIn(period.current)),
      this.db
        .select({
          total: count,
          cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
          revenue: money(sql`case when ${orders.paymentState} = 'paid' and ${orders.status} <> 'cancelled' then ${netRevenue} else 0 end`),
          avgDelivery: sql<number>`coalesce(avg(${deliverySeconds}) filter (
            where ${orders.type} = 'delivery' and ${orders.doneAt} is not null and ${orders.confirmedAt} is not null
          ), 0)::float8`,
        })
        .from(orders)
        .where(onlineIn(period.baseline)),
      this.db
        .select({
          key: sql<string>`extract(hour from coalesce(${orders.slotAt}, ${orders.createdAt}) at time zone 'Asia/Ho_Chi_Minh')::int::text`,
          total: count,
          cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
        })
        .from(orders)
        .where(onlineIn(period.current))
        .groupBy(sql`1`),
      this.reservationStats(branchId, period.current),
      this.reservationStats(branchId, period.baseline),
    ])

    const rate = (row?: { total: number; cancelled: number }) =>
      row && Number(row.total) > 0 ? Number(row.cancelled) / Number(row.total) : null

    return {
      branchId,
      period,
      online: {
        orders: delta(Number(now[0]?.total ?? 0), Number(before[0]?.total ?? 0)),
        revenue: delta(Number(now[0]?.revenue ?? 0), Number(before[0]?.revenue ?? 0)),
        cancelRate: { value: rate(now[0]), previous: rate(before[0]) },
        avgDeliverySeconds: delta(
          Math.round(Number(now[0]?.avgDelivery ?? 0)),
          Math.round(Number(before[0]?.avgDelivery ?? 0)),
        ),
        byHour: byHour
          .map((r) => ({
            key: r.key,
            label: `${String(r.key).padStart(2, '0')}:00`,
            orders: Number(r.total),
            cancelled: Number(r.cancelled),
          }))
          .sort((a, b) => Number(a.key) - Number(b.key)),
      },
      reservations: {
        total: delta(reservationNow.total, reservationBefore.total),
        seated: delta(reservationNow.seated, reservationBefore.seated),
        noShowRate: { value: reservationNow.noShowRate, previous: reservationBefore.noShowRate },
        cancelRate: { value: reservationNow.cancelRate, previous: reservationBefore.cancelRate },
        bySeatKind: reservationNow.bySeatKind,
      },
    }
  }

  private async reservationStats(branchId: string, range: DateRange) {
    const where = and(
      eq(reservations.branchId, branchId),
      gte(reservations.businessDate, range.from),
      lte(reservations.businessDate, range.to),
    )

    const [totals, bySeat] = await Promise.all([
      this.db
        .select({
          total: count,
          seated: sql<number>`count(*) filter (where ${reservations.status} in ('seated','done'))::int`,
          noShow: sql<number>`count(*) filter (where ${reservations.status} = 'no_show')::int`,
          cancelled: sql<number>`count(*) filter (where ${reservations.status} = 'cancelled')::int`,
          guests: sql<number>`coalesce(sum(${reservations.guestCount}), 0)::float8`,
        })
        .from(reservations)
        .where(where),
      this.db
        .select({
          key: reservations.seatKind,
          total: count,
          noShow: sql<number>`count(*) filter (where ${reservations.status} = 'no_show')::int`,
        })
        .from(reservations)
        .where(where)
        .groupBy(reservations.seatKind),
    ])

    const total = Number(totals[0]?.total ?? 0)
    const SEAT = { standard: 'Bàn thường', grill: 'Bàn nướng', private: 'Phòng riêng' } as const

    return {
      total,
      seated: Number(totals[0]?.seated ?? 0),
      guests: Number(totals[0]?.guests ?? 0),
      noShowRate: total > 0 ? Number(totals[0]?.noShow ?? 0) / total : null,
      cancelRate: total > 0 ? Number(totals[0]?.cancelled ?? 0) / total : null,
      bySeatKind: bySeat.map((r) => ({
        key: r.key,
        label: SEAT[r.key as keyof typeof SEAT] ?? r.key,
        total: Number(r.total),
        noShow: Number(r.noShow),
        noShowRate: Number(r.total) > 0 ? Number(r.noShow) / Number(r.total) : null,
      })),
    }
  }

  // ============================================================== phụ trợ

  /** Ngày neo mặc định là HÔM NAY theo múi giờ chi nhánh, không theo giờ máy chủ */
  private async resolve(branchId: string, input: PeriodQuery): Promise<ResolvedPeriod> {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    const anchor =
      input.anchor ??
      new Intl.DateTimeFormat('en-CA', {
        timeZone: branch.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
    return resolvePeriod({ ...input, anchor })
  }
}

export type { Delta }
