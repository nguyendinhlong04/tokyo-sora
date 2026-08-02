import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import type { DbOrTx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  feedback,
  orderLines,
  orders,
  payments,
  shifts,
  staff,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { CustomersService } from './customers.service'

/**
 * B13 — Phản hồi khách.
 *
 * §G.1 nói thẳng vì sao màn này tồn tại: "Vòng khách kết thúc ở thanh toán mà
 * không có tai nghe — món dở không ai biết cho tới khi vắng khách."
 *
 * Nguồn dữ liệu là khối đánh giá 1 chạm ở T15 (tại bàn) và O7 (online) — hai bề
 * mặt của khách, chưa dựng. `submit` dưới đây là cửa mà hai bề mặt đó sẽ gọi, và
 * nó KHÔNG cần đăng nhập nhân viên: người bấm là khách, và bằng chứng họ có quyền
 * đánh giá đơn này là họ đang cầm mã đơn.
 *
 * Ngưỡng "mấy sao thì thành khiếu nại" và "hạn phản hồi bao lâu" là tham số A6,
 * không phải hằng số trong mã nguồn (§29.1).
 */
@Injectable()
export class FeedbackService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
  ) {}

  private async rules(branchId: string) {
    return this.params.bundle(
      { 'feedback.complaintStars': 3, 'feedback.responseHours': 24 },
      branchId,
    )
  }

  // ================================================================== Ghi nhận

  /**
   * Khách gửi đánh giá từ T15 / O7.
   *
   * Bấm lại thì SỬA lượt cũ chứ không thêm lượt mới — nếu không, điểm trung bình
   * của một chi nhánh phụ thuộc vào việc ai bấm nhiều hơn. Một khiếu nại đã có
   * người xử lý thì lần bấm sau không mở lại hàng đợi: khách đổi ý sau khi được
   * gọi điện là chuyện tốt, không phải việc mới.
   */
  async submit(input: { orderId: number; stars: number; comment: string | null; source: 'table' | 'online' }) {
    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      throw new BadRequestException('Số sao phải từ 1 đến 5')
    }

    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .select({
          id: orders.id,
          branchId: orders.branchId,
          businessDate: orders.businessDate,
          customer: orders.customer,
          timezone: branches.timezone,
        })
        .from(orders)
        .innerJoin(branches, eq(branches.id, orders.branchId))
        .where(eq(orders.id, input.orderId))
      if (!order) throw new NotFoundException('Không có đơn này')

      const rules = await this.rules(order.branchId)
      const isComplaint = input.stars <= rules['feedback.complaintStars']
      const customerId = await this.customerOf(tx, order.customer, order.businessDate)
      const shiftId = await this.shiftOf(tx, input.orderId)

      const [row] = await tx
        .insert(feedback)
        .values({
          branchId: order.branchId,
          orderId: input.orderId,
          customerId,
          stars: input.stars,
          comment: input.comment?.trim() || null,
          source: input.source,
          shiftId,
          state: 'new',
          dueAt: isComplaint
            ? new Date(Date.now() + rules['feedback.responseHours'] * 3_600_000)
            : null,
          businessDate: order.businessDate,
        })
        .onConflictDoUpdate({
          target: feedback.orderId,
          set: {
            stars: input.stars,
            comment: input.comment?.trim() || null,
          },
        })
        .returning()

      return { id: row!.id, stars: row!.stars, isComplaint }
    })
  }

  // ================================================================== Hàng đợi

  /**
   * Hàng đợi khiếu nại: lượt đánh giá thấp sao chưa xử lý xong.
   *
   * Kèm nguyên món trong bill vì một câu "đồ ăn dở" không hành động được, còn
   * "đồ ăn dở + bill có nầm bò và lẩu kim chi" thì bếp trưởng biết hỏi ai.
   */
  async queue(branchId: string, includeResolved: boolean) {
    const rules = await this.rules(branchId)
    const rows = await this.db
      .select({
        id: feedback.id,
        orderId: feedback.orderId,
        displayCode: orders.displayCode,
        stars: feedback.stars,
        comment: feedback.comment,
        source: feedback.source,
        state: feedback.state,
        assignedTo: feedback.assignedTo,
        assignedName: staff.fullName,
        dueAt: feedback.dueAt,
        resolution: feedback.resolution,
        resolvedAt: feedback.resolvedAt,
        businessDate: feedback.businessDate,
        createdAt: feedback.createdAt,
        moneyTotal: orders.moneyTotal,
      })
      .from(feedback)
      .innerJoin(orders, eq(orders.id, feedback.orderId))
      .leftJoin(staff, eq(staff.id, feedback.assignedTo))
      .where(
        and(
          eq(feedback.branchId, branchId),
          lte(feedback.stars, rules['feedback.complaintStars']),
          includeResolved ? undefined : sql`${feedback.state} <> 'resolved'`,
        ),
      )
      .orderBy(desc(feedback.createdAt))
      .limit(200)

    if (rows.length === 0) return { rules, items: [] }

    const dishes = await this.db
      .select({
        orderId: orderLines.orderId,
        name: orderLines.nameSnapshot,
        qty: orderLines.qty,
      })
      .from(orderLines)
      .where(
        and(
          inArray(orderLines.orderId, rows.map((r) => r.orderId)),
          inArray(orderLines.state, ['queued', 'cooking', 'ready', 'served']),
        ),
      )

    const byOrder = new Map<number, { name: string; qty: number }[]>()
    for (const d of dishes) {
      const list = byOrder.get(d.orderId) ?? []
      list.push({ name: d.name, qty: d.qty })
      byOrder.set(d.orderId, list)
    }

    const now = Date.now()
    return {
      rules,
      items: rows.map((row) => ({
        ...row,
        dishes: byOrder.get(row.orderId) ?? [],
        overdue: row.state !== 'resolved' && row.dueAt !== null && row.dueAt.getTime() < now,
      })),
    }
  }

  /**
   * Gán người xử lý — bước đầu của hàng đợi.
   *
   * Không truyền `staffId` thì gán cho CHÍNH người bấm ("tôi nhận việc này"). Gán
   * cho người khác vẫn mở sẵn ở tham số, nhưng màn B13 chưa dùng: chọn người khác
   * cần một danh bạ nhân viên mà vai trò marketing không đọc được, và một ô nhập
   * mã nhân viên bằng tay là ô sẽ bị gõ nhầm.
   */
  async assign(id: number, staffId: number | null, actor: Actor) {
    const assignee = staffId ?? (actor.kind === 'staff' ? actor.staffId : null)
    if (!assignee) throw new BadRequestException('Không xác định được người nhận việc')

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(feedback)
        .set({ state: 'assigned', assignedTo: assignee })
        .where(and(eq(feedback.id, id), sql`${feedback.state} <> 'resolved'`))
        .returning()
      if (!row) throw new NotFoundException('Không có phản hồi này, hoặc đã xử lý xong')

      await this.audit.write(tx, {
        actor,
        action: 'feedback.assign',
        entity: 'feedback',
        entityId: String(id),
        payload: { assignedTo: assignee },
      })
      return row
    })
  }

  /** Đóng một khiếu nại — bắt buộc ghi đã làm gì, ràng buộc CSDL chặn nếu bỏ trống */
  async resolve(id: number, resolution: string, actor: Actor) {
    if (!resolution.trim()) throw new BadRequestException('Ghi lại đã xử lý thế nào')
    if (actor.kind !== 'staff') throw new BadRequestException('Chỉ nhân viên mới đóng được')

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(feedback)
        .set({
          state: 'resolved',
          resolution: resolution.trim(),
          resolvedBy: actor.staffId,
          resolvedAt: new Date(),
        })
        .where(eq(feedback.id, id))
        .returning()
      if (!row) throw new NotFoundException('Không có phản hồi này')

      await this.audit.write(tx, {
        actor,
        action: 'feedback.resolve',
        entity: 'feedback',
        entityId: String(id),
        payload: { stars: row.stars },
      })
      return row
    })
  }

  // ================================================================= Tổng hợp

  /**
   * Điểm trung bình theo chi nhánh / ca / món — con số nối vào B1 (§25 B13).
   *
   * Điểm theo MÓN là điểm của cả bill gán cho từng món trong bill, không phải
   * điểm khách chấm riêng cho món đó. Nói rõ trong tên trường (`billAverage`) vì
   * hiểu nhầm chỗ này sẽ dẫn tới bỏ một món chỉ vì nó hay đi cùng món dở khác.
   */
  async summary(branchId: string, from: string, to: string) {
    const scope = and(
      eq(feedback.branchId, branchId),
      gte(feedback.businessDate, from),
      lte(feedback.businessDate, to),
    )

    const [overall] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        average: sql<number>`coalesce(avg(${feedback.stars}), 0)::float8`,
        oneStar: sql<number>`count(*) filter (where ${feedback.stars} = 1)::int`,
        fiveStar: sql<number>`count(*) filter (where ${feedback.stars} = 5)::int`,
        open: sql<number>`count(*) filter (where ${feedback.state} <> 'resolved')::int`,
      })
      .from(feedback)
      .where(scope)

    const byShift = await this.db
      .select({
        shiftId: feedback.shiftId,
        openedAt: shifts.openedAt,
        count: sql<number>`count(*)::int`,
        average: sql<number>`avg(${feedback.stars})::float8`,
      })
      .from(feedback)
      .leftJoin(shifts, eq(shifts.id, feedback.shiftId))
      .where(scope)
      .groupBy(feedback.shiftId, shifts.openedAt)
      .orderBy(desc(shifts.openedAt))
      .limit(30)

    const byDish = await this.db
      .select({
        dishId: orderLines.dishId,
        name: orderLines.nameSnapshot,
        count: sql<number>`count(distinct ${feedback.id})::int`,
        billAverage: sql<number>`avg(${feedback.stars})::float8`,
      })
      .from(feedback)
      .innerJoin(orderLines, eq(orderLines.orderId, feedback.orderId))
      .where(and(scope, inArray(orderLines.state, ['queued', 'cooking', 'ready', 'served'])))
      .groupBy(orderLines.dishId, orderLines.nameSnapshot)
      .having(sql`count(distinct ${feedback.id}) >= 2`)
      .orderBy(sql`avg(${feedback.stars}) asc`)
      .limit(20)

    return {
      overall: {
        count: overall?.count ?? 0,
        average: Math.round((overall?.average ?? 0) * 100) / 100,
        oneStar: overall?.oneStar ?? 0,
        fiveStar: overall?.fiveStar ?? 0,
        open: overall?.open ?? 0,
      },
      byShift: byShift.map((r) => ({
        shiftId: r.shiftId,
        openedAt: r.openedAt,
        count: r.count,
        average: Math.round(r.average * 100) / 100,
      })),
      byDish: byDish.map((r) => ({
        dishId: r.dishId,
        name: r.name,
        count: r.count,
        billAverage: Math.round(r.billAverage * 100) / 100,
      })),
    }
  }

  // ================================================================== Nội bộ

  private async customerOf(
    tx: DbOrTx,
    customer: unknown,
    businessDate: string,
  ): Promise<number | null> {
    if (!customer || typeof customer !== 'object') return null
    const phone = (customer as { phone?: unknown }).phone
    if (typeof phone !== 'string') return null
    return this.customers.touch(tx, { phone, businessDate })
  }

  /** Ca mà bill được thu tiền — nguồn cho "điểm trung bình theo ca" */
  private async shiftOf(tx: DbOrTx, orderId: number): Promise<number | null> {
    const [row] = await tx
      .select({ shiftId: payments.shiftId })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.state, 'paid')))
      .orderBy(desc(payments.id))
      .limit(1)
    return row?.shiftId ?? null
  }
}
