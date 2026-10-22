import { Inject, Injectable } from '@nestjs/common'
import type { KpiMetricCode, KpiRules } from '@sora/contracts'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { DbOrTx } from '../../common/tx'
import type { Db } from '../../db/client'
import { branches, kpiCycles, orders, tickets, timeEntries } from '../../db/schema'
import { doneTickets, lateTicketCount, netRevenue, soldOrders } from '../reports/sql'

/** Người được chấm — đủ để quy số về cá nhân, ca trực, bộ phận hoặc chi nhánh */
export interface MetricSubject {
  reviewId: number
  staffId: number
  employeeId: number
  branchId: string
  unitId: number | null
  /** Trạm KDS của tổ bếp (nếu ghế nằm trong tổ) — tỉ lệ trễ quy về trạm */
  stationId: string | null
}

export interface MetricWindow {
  /** Ngày đầu và ngày cuối của kỳ, gồm cả hai (giờ chi nhánh) */
  from: string
  to: string
}

export interface MetricValue {
  /** null = không có dữ liệu — KHÔNG phải 0 */
  actualMilli: number | null
  sampleCount: number | null
}

type Row = Record<string, unknown>

const milli = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 1000)
const ratio = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null)
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

/**
 * Nguồn số của KPI tự động — một hàm cho mỗi chỉ số, đúng định nghĩa của báo cáo
 * đang có (reports/sql.ts cho doanh thu và vé bếp, view customer_ratings cho điểm
 * khách chấm, sổ kho cho giá vốn). KPI doanh thu phải ra ĐÚNG con số B2.
 *
 * Chỉ số "chi nhánh" tính một lần cho cả kỳ; chỉ số cá nhân / ca trực tính theo
 * từng người. Không đủ mẫu hay không có dữ liệu thì `null`, nơi chấm tự bỏ qua.
 */
@Injectable()
export class MetricsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async compute(
    codes: readonly KpiMetricCode[],
    subjects: readonly MetricSubject[],
    window: MetricWindow,
    rules: KpiRules,
    db: DbOrTx = this.db,
  ): Promise<Map<number, Map<KpiMetricCode, MetricValue>>> {
    const out = new Map<number, Map<KpiMetricCode, MetricValue>>()
    for (const s of subjects) out.set(s.reviewId, new Map())
    if (codes.length === 0 || subjects.length === 0) return out
    const branchId = subjects[0]!.branchId
    const [branch] = await db
      .select({ timezone: branches.timezone })
      .from(branches)
      .where(eq(branches.id, branchId))
    const tz = branch?.timezone ?? 'Asia/Ho_Chi_Minh'
    const branchCache = new Map<KpiMetricCode, MetricValue>()

    for (const code of codes) {
      for (const s of subjects) {
        let value: MetricValue
        if (BRANCH_WIDE.has(code)) {
          if (!branchCache.has(code)) {
            branchCache.set(code, await this.branchMetric(code, branchId, window, tz, db))
          }
          value = branchCache.get(code)!
        } else {
          value = await this.personMetric(code, s, window, tz, rules, db)
        }
        out.get(s.reviewId)!.set(code, value)
      }
    }
    return out
  }

  /** Phút công đã chấm của một người trong kỳ — hệ số giờ của thưởng gợi ý */
  async workedMinutes(employeeId: number, cycleId: number, db: DbOrTx = this.db) {
    const [cycle] = await db.select().from(kpiCycles).where(eq(kpiCycles.id, cycleId))
    if (!cycle) return 0
    const [row] = await db
      .select({
        minutes: sql<number>`coalesce(sum(greatest(0, extract(epoch from ${timeEntries.clockOut} - ${timeEntries.clockIn}) / 60 - ${timeEntries.breakMinutes})), 0)::float8`,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, employeeId),
          gte(timeEntries.workDate, cycle.periodStart),
          lte(timeEntries.workDate, cycle.periodEnd),
          sql`${timeEntries.clockOut} IS NOT NULL`,
        ),
      )
    return Math.round(num(row?.minutes))
  }

  // ================================================================ Chỉ số chi nhánh

  private async branchMetric(
    code: KpiMetricCode,
    branchId: string,
    w: MetricWindow,
    tz: string,
    db: DbOrTx,
  ): Promise<MetricValue> {
    const range = { from: w.from, to: w.to }
    const one = async (query: ReturnType<typeof sql>) =>
      (await db.execute<Row>(query)).rows[0] ?? {}
    switch (code) {
      case 'cn.doanh-thu-thuan':
      case 'kh.doanh-thu-web': {
        const [row] = await db
          .select({
            v: sql<number>`coalesce(sum(${netRevenue}), 0)::float8`,
            n: sql<number>`count(*)::int`,
          })
          .from(orders)
          .where(
            and(
              soldOrders(branchId, range),
              code === 'kh.doanh-thu-web' ? eq(orders.channel, 'web') : undefined,
            ),
          )
        return { actualMilli: milli(num(row?.v)), sampleCount: row?.n ?? 0 }
      }
      case 'cn.doanh-thu-gio-cong': {
        const [rev] = await db
          .select({ v: sql<number>`coalesce(sum(${netRevenue}), 0)::float8` })
          .from(orders)
          .where(soldOrders(branchId, range))
        const hours = await one(sql`
          SELECT coalesce(sum(greatest(0, extract(epoch from clock_out - clock_in) / 60 - break_minutes)), 0)::float8 / 60 AS h
            FROM time_entries
           WHERE branch_id = ${branchId} AND work_date BETWEEN ${w.from} AND ${w.to}
             AND clock_out IS NOT NULL`)
        const h = num(hours.h)
        return { actualMilli: h > 0 ? milli(num(rev?.v) / h) : null, sampleCount: Math.round(h) }
      }
      case 'bep.food-cost':
      case 'bep.hao-hut': {
        // Giá vốn = sổ kho kind 'sale' (định nghĩa B4); hao hụt = xuất huỷ ÷ giá vốn
        const stock = await one(sql`
          SELECT coalesce(-sum(cost_vnd) FILTER (WHERE kind = 'sale'), 0)::float8 AS cogs,
                 coalesce(-sum(cost_vnd) FILTER (WHERE kind = 'write_off'), 0)::float8 AS waste
            FROM stock_moves
           WHERE branch_id = ${branchId} AND business_date BETWEEN ${w.from} AND ${w.to}`)
        if (code === 'bep.hao-hut') {
          return { actualMilli: milli(ratio(num(stock.waste), num(stock.cogs))), sampleCount: null }
        }
        const [rev] = await db
          .select({ v: sql<number>`coalesce(sum(${netRevenue}), 0)::float8` })
          .from(orders)
          .where(soldOrders(branchId, range))
        return { actualMilli: milli(ratio(num(stock.cogs), num(rev?.v))), sampleCount: null }
      }
      case 'kho.xuat-huy': {
        const row = await one(sql`
          SELECT coalesce(-sum(cost_vnd), 0)::float8 AS v
            FROM stock_moves
           WHERE branch_id = ${branchId} AND kind = 'write_off'
             AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(num(row.v)), sampleCount: null }
      }
      case 'kho.so-lan-kiem-ke':
      case 'kho.lech-kiem-ke': {
        // Số tiền điều chỉnh thật nằm ở sổ kho (count_adjust gắn phiếu kiểm kê)
        const row = await one(sql`
          WITH closed AS (
            SELECT id FROM stock_counts
             WHERE branch_id = ${branchId} AND state = 'closed'
               AND (closed_at AT TIME ZONE ${tz})::date BETWEEN ${w.from} AND ${w.to}
          )
          SELECT (SELECT count(*) FROM closed)::int AS n,
                 coalesce((SELECT sum(abs(m.cost_vnd)) FROM stock_moves m
                            WHERE m.doc_kind = 'stock_count'
                              AND m.doc_id IN (SELECT id FROM closed)), 0)::float8 AS adjust`)
        if (code === 'kho.so-lan-kiem-ke')
          return { actualMilli: milli(num(row.n)), sampleCount: num(row.n) }
        if (num(row.n) === 0) return { actualMilli: null, sampleCount: 0 }
        const cogs = await one(sql`
          SELECT coalesce(-sum(cost_vnd), 0)::float8 AS v
            FROM stock_moves
           WHERE branch_id = ${branchId} AND kind = 'sale'
             AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(ratio(num(row.adjust), num(cogs.v))), sampleCount: num(row.n) }
      }
      case 'kh.diem-hai-long': {
        const row = await one(sql`
          SELECT avg(stars)::float8 AS v, count(*)::int AS n
            FROM customer_ratings
           WHERE branch_id = ${branchId} AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: num(row.n) > 0 ? milli(num(row.v)) : null, sampleCount: num(row.n) }
      }
      case 'kh.khieu-nai-dung-han': {
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE resolved_at <= due_at)::int AS ok, count(*)::int AS n
            FROM feedback
           WHERE branch_id = ${branchId} AND due_at IS NOT NULL
             AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'kh.khach-moi': {
        // Khách không gắn chi nhánh: quy về chi nhánh của lần gặp đầu (đơn hoặc đặt bàn)
        const row = await one(sql`
          SELECT count(DISTINCT c.id)::int AS n
            FROM customers c
           WHERE c.first_seen_on BETWEEN ${w.from} AND ${w.to}
             AND (EXISTS (SELECT 1 FROM orders o
                           WHERE o.branch_id = ${branchId} AND o.business_date = c.first_seen_on
                             AND regexp_replace(o.customer ->> 'phone', '\\D', '', 'g') = c.phone)
               OR EXISTS (SELECT 1 FROM reservations r
                           WHERE r.branch_id = ${branchId} AND r.business_date = c.first_seen_on
                             AND regexp_replace(r.customer_phone, '\\D', '', 'g') = c.phone))`)
        return { actualMilli: milli(num(row.n)), sampleCount: num(row.n) }
      }
      case 'kh.no-show': {
        // 'done' không bao giờ được đặt — suất đã đến tính bằng seated hoặc done
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE status = 'no_show')::int AS bad,
                 count(*) FILTER (WHERE status IN ('confirmed','seated','done','no_show'))::int AS n
            FROM reservations
           WHERE branch_id = ${branchId} AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(ratio(num(row.bad), num(row.n))), sampleCount: num(row.n) }
      }
      case 'lt.nhac-hen': {
        // Suất có đủ thời gian để nhắc (đặt trước giờ nhắc 24 giờ); được nhắc = có lần
        // gọi "reached" hoặc khách tự xác nhận lại
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE r.guest_confirmed_at IS NOT NULL OR EXISTS (
                   SELECT 1 FROM reservation_reminders rr
                    WHERE rr.reservation_id = r.id AND rr.outcome = 'reached'))::int AS ok,
                 count(*)::int AS n
            FROM reservations r
           WHERE r.branch_id = ${branchId} AND r.business_date BETWEEN ${w.from} AND ${w.to}
             AND r.status <> 'cancelled'
             AND r.created_at < r.slot_at - interval '24 hours'`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'ol.xac-nhan': {
        const row = await one(sql`
          SELECT percentile_disc(0.9) WITHIN GROUP (
                   ORDER BY extract(epoch from confirmed_at - created_at) / 60)::float8 AS p90,
                 count(*)::int AS n
            FROM orders
           WHERE branch_id = ${branchId} AND channel = 'web' AND confirmed_at IS NOT NULL
             AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: num(row.n) > 0 ? milli(num(row.p90)) : null, sampleCount: num(row.n) }
      }
      case 'ol.dung-gio': {
        // Chỉ đơn web: đơn Grab/Shopee/Be không có giờ hẹn thật (slot_at = khung hiện tại)
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE done_at <= slot_at)::int AS ok, count(*)::int AS n
            FROM orders
           WHERE branch_id = ${branchId} AND channel = 'web' AND slot_at IS NOT NULL
             AND status = 'done' AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'kt.khoa-so': {
        // Kỳ tháng M chấm việc khoá sổ tháng M−1: hạn ngày 5 tháng M — số ngày trễ
        const month = `${w.from.slice(0, 7)}-01`
        const row = await one(sql`
          SELECT greatest(0, (coalesce((pl.locked_at AT TIME ZONE ${tz})::date,
                                       (now() AT TIME ZONE ${tz})::date)
                              - (${month}::date + 4)))::int AS late
            FROM (SELECT 1) one
            LEFT JOIN period_locks pl
              ON pl.branch_id = ${branchId} AND pl.month = (${month}::date - interval '1 month')::date`)
        return { actualMilli: milli(num(row.late)), sampleCount: 1 }
      }
      case 'kt.duyet-phieu-chi': {
        // Phiếu phải có người duyệt thật (bỏ phiếu quỹ nhỏ tự duyệt lúc tạo)
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE state = 'approved'
                                    AND approved_at - created_at <= interval '48 hours')::int AS ok,
                 count(*)::int AS n
            FROM expense_vouchers
           WHERE branch_id = ${branchId}
             AND (created_at AT TIME ZONE ${tz})::date BETWEEN ${w.from} AND ${w.to}
             AND (state = 'draft' OR approved_by IS DISTINCT FROM created_by)
             AND recurring_id IS NULL`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'tc.su-co-dung-han': {
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE t.submitted_at <= t.due_at
                                    OR (t.done_at IS NOT NULL AND t.done_at <= t.due_at))::int AS ok,
                 count(*)::int AS n
            FROM tasks t
            JOIN incidents i ON i.id = t.entity_id AND t.entity = 'incident'
           WHERE i.branch_id = ${branchId} AND t.state <> 'cancelled'
             AND (t.due_at AT TIME ZONE ${tz})::date BETWEEN ${w.from} AND ${w.to}
             AND (t.state IN ('submitted','done') OR t.due_at < now())`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'nt.ve-sinh':
      case 'nt.khach-bi-mat': {
        const row = await one(sql`
          SELECT avg(score_milli)::float8 AS v, count(*)::int AS n
            FROM kpi_observations
           WHERE branch_id = ${branchId} AND voided_at IS NULL
             AND kind = ${code === 'nt.ve-sinh' ? 've-sinh' : 'khach-bi-mat'}
             AND observed_on BETWEEN ${w.from} AND ${w.to}`)
        return {
          actualMilli: num(row.n) > 0 ? Math.round(num(row.v)) : null,
          sampleCount: num(row.n),
        }
      }
      default:
        // Chỉ số nhập tay (nt.thai-do, nt.tay-nghe) không có nguồn tự động
        return { actualMilli: null, sampleCount: null }
    }
  }

  // ================================================================ Chỉ số người

  private async personMetric(
    code: KpiMetricCode,
    s: MetricSubject,
    w: MetricWindow,
    tz: string,
    rules: KpiRules,
    db: DbOrTx,
  ): Promise<MetricValue> {
    const one = async (query: ReturnType<typeof sql>) =>
      (await db.execute<Row>(query)).rows[0] ?? {}
    /** Mốc vào ca của một ô lịch, theo giờ chi nhánh */
    const shiftStart = sql.raw(
      `((se.work_date + make_interval(mins => se.start_minute))::timestamp AT TIME ZONE '${tz.replace(/'/g, "''")}')`,
    )
    const shiftEnd = sql.raw(
      `((se.work_date + make_interval(mins => se.end_minute))::timestamp AT TIME ZONE '${tz.replace(/'/g, "''")}')`,
    )
    switch (code) {
      case 'bep.ti-le-tre': {
        // Quy về trạm của tổ; người không ở tổ (bếp trưởng, phụ bếp) thì cả bếp chi nhánh
        const [row] = await db
          .select({ total: sql<number>`count(*)::int`, late: lateTicketCount })
          .from(tickets)
          .where(
            and(
              doneTickets(s.branchId, { from: w.from, to: w.to }),
              s.stationId ? eq(tickets.stationId, s.stationId) : undefined,
            ),
          )
        return {
          actualMilli: milli(ratio(row?.late ?? 0, row?.total ?? 0)),
          sampleCount: row?.total ?? 0,
        }
      }
      case 'san.phan-hoi-ban': {
        const row = await one(sql`
          SELECT percentile_disc(0.9) WITHIN GROUP (
                   ORDER BY extract(epoch from tr.handled_at - tr.created_at) / 60)::float8 AS p90,
                 count(*)::int AS n
            FROM table_requests tr
            JOIN schedule_entries se
              ON se.branch_id = tr.branch_id AND se.employee_id = ${s.employeeId}
             AND se.state = 'published' AND se.work_date BETWEEN ${w.from} AND ${w.to}
             AND tr.created_at >= ${shiftStart} AND tr.created_at < ${shiftEnd}
           WHERE tr.branch_id = ${s.branchId} AND tr.handled_at IS NOT NULL`)
        return { actualMilli: num(row.n) > 0 ? milli(num(row.p90)) : null, sampleCount: num(row.n) }
      }
      case 'tn.ket-khop': {
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE abs(closing_cash_counted - closing_expected) <= ${rules.cashToleranceVnd})::int AS ok,
                 count(*)::int AS n
            FROM shifts
           WHERE cashier_id = ${s.staffId} AND branch_id = ${s.branchId} AND state = 'closed'
             AND closing_cash_counted IS NOT NULL
             AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'tn.qr-treo': {
        const row = await one(sql`
          SELECT count(DISTINCT p.id)::int AS n
            FROM payments p
            JOIN shifts sh
              ON sh.cashier_id = ${s.staffId} AND sh.branch_id = p.branch_id
             AND p.created_at >= sh.opened_at AND p.created_at <= coalesce(sh.closed_at, now())
           WHERE p.branch_id = ${s.branchId} AND p.kind = 'vietqr' AND p.state = 'pending'
             AND p.created_at < now() - interval '1 day'
             AND p.business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(num(row.n)), sampleCount: num(row.n) }
      }
      case 'cc.dung-gio': {
        const grace = await one(sql`
          SELECT coalesce((SELECT (value)::text::int FROM parameters
                            WHERE key = 'payroll.lateGraceMinutes' AND branch_id = ${s.branchId}),
                          (SELECT (value)::text::int FROM parameters
                            WHERE key = 'payroll.lateGraceMinutes' AND branch_id IS NULL), 5) AS g`)
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE round(extract(epoch from te.clock_in - ${shiftStart}) / 60) <= ${num(grace.g)})::int AS ok,
                 count(*)::int AS n
            FROM time_entries te
            JOIN schedule_entries se
              ON se.employee_id = te.employee_id AND se.work_date = te.work_date
             AND se.branch_id = te.branch_id AND se.state = 'published'
           WHERE te.employee_id = ${s.employeeId} AND te.work_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'cc.vang': {
        // Cùng luật với H4: ca đã công bố đã qua, không có công, không có phép đã duyệt
        const row = await one(sql`
          SELECT count(*)::int AS n
            FROM schedule_entries se
           WHERE se.employee_id = ${s.employeeId} AND se.state = 'published'
             AND se.work_date BETWEEN ${w.from} AND ${w.to}
             AND se.work_date < (now() AT TIME ZONE ${tz})::date
             AND NOT EXISTS (SELECT 1 FROM time_entries te
                              WHERE te.employee_id = se.employee_id AND te.work_date = se.work_date)
             AND NOT EXISTS (SELECT 1 FROM leave_requests lr
                              WHERE lr.employee_id = se.employee_id AND lr.state = 'approved'
                                AND se.work_date BETWEEN lr.from_date AND lr.to_date)`)
        return { actualMilli: milli(num(row.n)), sampleCount: num(row.n) }
      }
      case 'tc.viec-dung-han': {
        // Việc giao đích danh đến hạn trong kỳ: đúng hạn = nộp trước hạn
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE submitted_at IS NOT NULL AND submitted_at <= due_at)::int AS ok,
                 count(*)::int AS n
            FROM tasks
           WHERE assignee_staff_id = ${s.staffId} AND state <> 'cancelled'
             AND (due_at AT TIME ZONE ${tz})::date BETWEEN ${w.from} AND ${w.to}
             AND (state IN ('submitted','done') OR due_at < now())`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'tc.checklist': {
        // Việc định kỳ của ghế người đó, đúng những ngày (và ca) người đó đứng
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE t.submitted_at IS NOT NULL AND t.submitted_at <= t.due_at)::int AS ok,
                 count(*)::int AS n
            FROM tasks t
            LEFT JOIN shift_templates st ON st.id = t.shift_template_id
           WHERE t.template_id IS NOT NULL AND t.branch_id = ${s.branchId} AND t.state <> 'cancelled'
             AND t.occurrence_date BETWEEN ${w.from} AND ${w.to}
             AND (t.state IN ('submitted','done') OR t.due_at < now())
             AND EXISTS (SELECT 1 FROM position_assignments pa
                          WHERE pa.position_id = t.assignee_position_id AND pa.staff_id = ${s.staffId}
                            AND pa.from_date <= t.occurrence_date
                            AND (pa.to_date IS NULL OR pa.to_date > t.occurrence_date))
             AND EXISTS (SELECT 1 FROM schedule_entries se
                          WHERE se.employee_id = ${s.employeeId} AND se.branch_id = t.branch_id
                            AND se.work_date = t.occurrence_date AND se.state = 'published'
                            AND (t.shift_template_id IS NULL OR se.template_id = t.shift_template_id
                                 OR (se.template_id IS NULL AND se.start_minute = st.start_minute
                                     AND se.end_minute = st.end_minute)))`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'tc.bao-cao-dung-han': {
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE on_time)::int AS ok, count(*)::int AS n
            FROM work_reports
           WHERE author_id = ${s.staffId} AND state <> 'draft'
             AND business_date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      case 'tc.xac-nhan-van-ban': {
        const row = await one(sql`
          SELECT count(*) FILTER (WHERE r.acked_at IS NOT NULL)::int AS ok, count(*)::int AS n
            FROM org_document_receipts r
            JOIN org_documents d ON d.id = r.document_id
           WHERE r.staff_id = ${s.staffId} AND d.requires_ack AND d.state = 'issued'
             AND (d.signed_at AT TIME ZONE ${tz})::date BETWEEN ${w.from} AND ${w.to}`)
        return { actualMilli: milli(ratio(num(row.ok), num(row.n))), sampleCount: num(row.n) }
      }
      default:
        return this.branchMetric(code, s.branchId, w, tz, db)
    }
  }
}

/** Chỉ số tính một lần cho cả chi nhánh — mọi phiếu trong kỳ dùng chung con số */
const BRANCH_WIDE = new Set<KpiMetricCode>([
  'cn.doanh-thu-thuan',
  'cn.doanh-thu-gio-cong',
  'kh.doanh-thu-web',
  'bep.food-cost',
  'bep.hao-hut',
  'kho.lech-kiem-ke',
  'kho.so-lan-kiem-ke',
  'kho.xuat-huy',
  'kh.diem-hai-long',
  'kh.khieu-nai-dung-han',
  'kh.khach-moi',
  'kh.no-show',
  'lt.nhac-hen',
  'ol.xac-nhan',
  'ol.dung-gio',
  'kt.khoa-so',
  'kt.duyet-phieu-chi',
  'tc.su-co-dung-han',
  'nt.ve-sinh',
  'nt.khach-bi-mat',
])
