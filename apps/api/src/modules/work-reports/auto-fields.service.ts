import { Inject, Injectable } from '@nestjs/common'
import {
  checkPermission,
  REPORT_AUTO_FIELDS,
  type AutoValue,
  type ReportAutoKey,
  type Role,
} from '@sora/contracts'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { DbOrTx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  orders,
  payments,
  scheduleEntries,
  shifts,
  shiftTemplates,
  tableSessions,
  tasks,
  ticketItems,
  tickets,
} from '../../db/schema'
import { doneTickets, lateTicketCount, netRevenue, soldOrders } from '../reports/sql'

export interface AutoContext {
  branchId: string
  /** Ngày báo cáo, giờ chi nhánh */
  date: string
  /** Báo cáo theo ca: ca nào — số nhân sự, checklist tính riêng cho ca */
  shiftTemplateId: number | null
  /** Vai trò THẬT của người xem/nộp — số tiền chỉ hiện với người có quyền */
  roles: Role[]
}

const NO_ACCESS: AutoValue = { value: null, note: 'Không có quyền xem' }

/**
 * Trường tự điền của báo cáo công việc. Mỗi số dùng ĐÚNG định nghĩa của báo cáo
 * kinh doanh (reports/sql.ts) — báo cáo cuối ngày nói doanh thu khác B2 là báo
 * cáo cuối ngày sai.
 *
 * Không có dữ liệu thì `null` kèm lý do, không phải 0: "chưa đóng ca két" và
 * "két khớp" là hai câu khác nhau.
 */
@Injectable()
export class AutoFieldsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async compute(
    keys: readonly ReportAutoKey[],
    ctx: AutoContext,
    db: DbOrTx = this.db,
  ): Promise<Record<ReportAutoKey, AutoValue>> {
    const out = {} as Record<ReportAutoKey, AutoValue>
    for (const key of new Set(keys)) {
      const need = REPORT_AUTO_FIELDS[key].need
      out[key] =
        need && checkPermission(need, ctx.roles) !== 'allow'
          ? NO_ACCESS
          : await this.one(key, ctx, db)
    }
    return out
  }

  /** Che số tiền với người xem không có quyền — số đã đóng băng vẫn nằm trong bản nộp */
  mask(
    values: Record<string, AutoValue>,
    autoOf: Record<string, ReportAutoKey | undefined>,
    roles: Role[],
  ): Record<string, AutoValue> {
    const out: Record<string, AutoValue> = {}
    for (const [field, value] of Object.entries(values)) {
      const key = autoOf[field]
      const need = key ? REPORT_AUTO_FIELDS[key].need : null
      out[field] = need && checkPermission(need, roles) !== 'allow' ? NO_ACCESS : value
    }
    return out
  }

  private async one(key: ReportAutoKey, ctx: AutoContext, db: DbOrTx): Promise<AutoValue> {
    const day = { from: ctx.date, to: ctx.date }
    switch (key) {
      case 'doanh-thu-thuan': {
        const [row] = await db
          .select({ v: sql<number>`coalesce(sum(${netRevenue}), 0)::float8` })
          .from(orders)
          .where(soldOrders(ctx.branchId, day))
        return { value: Math.round(Number(row?.v ?? 0)) }
      }
      case 'so-don': {
        const [row] = await db
          .select({ v: sql<number>`count(*)::int` })
          .from(orders)
          .where(soldOrders(ctx.branchId, day))
        return { value: row?.v ?? 0 }
      }
      case 'so-khach': {
        // Cùng cách đếm của B2: khách từ phiên bàn, đơn mang về và giao tính một khách
        const [row] = await db
          .select({
            v: sql<number>`coalesce(sum(coalesce(${tableSessions.guestCount}, 1)), 0)::int`,
          })
          .from(orders)
          .leftJoin(tableSessions, eq(tableSessions.id, orders.tableSessionId))
          .where(soldOrders(ctx.branchId, day))
        return { value: row?.v ?? 0 }
      }
      case 'don-huy': {
        const [row] = await db
          .select({ v: sql<number>`count(*)::int` })
          .from(orders)
          .where(
            and(
              eq(orders.branchId, ctx.branchId),
              eq(orders.businessDate, ctx.date),
              eq(orders.status, 'cancelled'),
            ),
          )
        return { value: row?.v ?? 0 }
      }
      case 'mon-huy-sau-gui-bep': {
        // Món đã tới bếp (có dòng vé) rồi mới huỷ — món huỷ khi còn nháp không tính
        const [row] = await db
          .select({ v: sql<number>`count(*)::int` })
          .from(ticketItems)
          .innerJoin(tickets, eq(tickets.id, ticketItems.ticketId))
          .innerJoin(orders, eq(orders.id, tickets.orderId))
          .where(
            and(
              eq(orders.branchId, ctx.branchId),
              eq(orders.businessDate, ctx.date),
              eq(ticketItems.state, 'voided'),
            ),
          )
        return { value: row?.v ?? 0 }
      }
      case 've-tre': {
        const [row] = await db
          .select({ total: sql<number>`count(*)::int`, late: lateTicketCount })
          .from(tickets)
          .where(doneTickets(ctx.branchId, day))
        const total = row?.total ?? 0
        if (total === 0) return { value: null, note: 'Chưa có vé nào xong' }
        const late = row?.late ?? 0
        return {
          value: `${late}/${total} (${((late / total) * 100).toFixed(1).replace('.', ',')}%)`,
        }
      }
      case 'khieu-nai':
      case 'diem-hai-long': {
        const result = await db.execute<{ low: number; avg: number | null; n: number }>(sql`
          SELECT count(*) FILTER (WHERE stars <= 2)::int AS low,
                 avg(stars)::float8 AS avg,
                 count(*)::int AS n
            FROM customer_ratings
           WHERE branch_id = ${ctx.branchId} AND business_date = ${ctx.date}
        `)
        const row = result.rows[0]
        if (key === 'khieu-nai') return { value: row?.low ?? 0 }
        if (!row?.n) return { value: null, note: 'Chưa có lượt chấm' }
        return { value: Math.round(Number(row.avg) * 100) / 100 }
      }
      case 'chenh-lech-ket': {
        const [row] = await db
          .select({
            v: sql<number>`coalesce(sum(${shifts.closingCashCounted} - ${shifts.closingExpected}), 0)::float8`,
            n: sql<number>`count(*)::int`,
          })
          .from(shifts)
          .where(
            and(
              eq(shifts.branchId, ctx.branchId),
              eq(shifts.businessDate, ctx.date),
              eq(shifts.state, 'closed'),
              isNotNull(shifts.closingCashCounted),
            ),
          )
        if (!row?.n) return { value: null, note: 'Chưa đóng ca két' }
        return { value: Math.round(Number(row.v)) }
      }
      case 'qr-treo': {
        const [row] = await db
          .select({ v: sql<number>`count(*)::int` })
          .from(payments)
          .where(
            and(
              eq(payments.branchId, ctx.branchId),
              eq(payments.businessDate, ctx.date),
              eq(payments.kind, 'vietqr'),
              eq(payments.state, 'pending'),
            ),
          )
        return { value: row?.v ?? 0 }
      }
      case 'nhan-su-ca': {
        const [shift] = ctx.shiftTemplateId
          ? await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, ctx.shiftTemplateId))
          : []
        const [row] = await db
          .select({ v: sql<number>`count(*)::int` })
          .from(scheduleEntries)
          .where(
            and(
              eq(scheduleEntries.branchId, ctx.branchId),
              eq(scheduleEntries.workDate, ctx.date),
              eq(scheduleEntries.state, 'published'),
              shift
                ? sql`(${scheduleEntries.templateId} = ${shift.id}
                       OR (${scheduleEntries.templateId} IS NULL
                           AND ${scheduleEntries.startMinute} = ${shift.startMinute}
                           AND ${scheduleEntries.endMinute} = ${shift.endMinute}))`
                : undefined,
            ),
          )
        return { value: row?.v ?? 0 }
      }
      case 'checklist-ca': {
        const [row] = await db
          .select({
            total: sql<number>`count(*) FILTER (WHERE ${tasks.state} <> 'cancelled')::int`,
            done: sql<number>`count(*) FILTER (WHERE ${tasks.state} = 'done')::int`,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.branchId, ctx.branchId),
              eq(tasks.occurrenceDate, ctx.date),
              isNotNull(tasks.templateId),
              ctx.shiftTemplateId ? eq(tasks.shiftTemplateId, ctx.shiftTemplateId) : undefined,
            ),
          )
        if (!row?.total) return { value: null, note: 'Không có việc định kỳ' }
        return { value: `${row.done}/${row.total} xong` }
      }
    }
  }
}
