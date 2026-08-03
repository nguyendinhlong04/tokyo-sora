import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import type { Db } from '../../db/client'
import { orderLines, orders, ticketItems, tickets } from '../../db/schema'
import { CustomersService } from '../crm/customers.service'
import { actorRoles, type Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { OrderingService } from '../ordering/ordering.service'
import {
  applyTransition,
  nextStatuses,
  type ActorRole,
  type OrderStatus,
  type OrderType,
} from '../ordering/domain/order-state'

/** Trạng thái còn phải làm gì đó — bảng O8 chỉ quan tâm mấy cột này */
const LIVE_STATUSES: OrderStatus[] = ['new', 'confirmed', 'cooking', 'ready', 'delivering']

@Injectable()
export class DispatchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ordering: OrderingService,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * O8 Bảng điều phối.
   *
   * Sắp theo GIỜ HẸN chứ không theo giờ đặt: đơn hẹn 19:00 đặt từ sáng vẫn phải
   * nằm sau đơn hẹn 12:00 đặt lúc 11:30. Đơn không hẹn giờ (tại bàn) xếp theo
   * giờ tạo.
   */
  async board(branchId: string, filter: { businessDate?: string; status?: OrderStatus } = {}) {
    const rows = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branchId),
          sql`${orders.type} <> 'dinein'`,
          filter.businessDate ? eq(orders.businessDate, filter.businessDate) : undefined,
          filter.status
            ? eq(orders.status, filter.status)
            : inArray(orders.status, LIVE_STATUSES),
        ),
      )
      .orderBy(asc(sql`coalesce(${orders.slotAt}, ${orders.createdAt})`))

    const itemCounts = await this.itemCountsOf(rows.map((o) => o.id))

    return {
      serverTime: new Date(),
      orders: rows.map((o) => this.card(o, itemCounts.get(o.id) ?? 0)),
    }
  }

  /** Số món của từng đơn — thẻ trên bảng chỉ cần con số, không cần cả danh sách */
  private async itemCountsOf(orderIds: number[]) {
    if (orderIds.length === 0) return new Map<number, number>()
    const rows = await this.db
      .select({ orderId: orderLines.orderId, count: sql<number>`sum(${orderLines.qty})::int` })
      .from(orderLines)
      .where(
        and(
          inArray(orderLines.orderId, orderIds),
          sql`${orderLines.parentLineId} IS NULL`,
          sql`${orderLines.state} <> 'voided'`,
        ),
      )
      .groupBy(orderLines.orderId)
    return new Map(rows.map((r) => [r.orderId, Number(r.count)]))
  }

  /** O9 Chi tiết đơn */
  async detail(orderId: number, actor: Actor) {
    const order = await this.mustFind(orderId)
    const lines = await this.db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(orderLines.id))

    return {
      ...this.card(order),
      customer: order.customer,
      shipper: order.shipper,
      cancelReason: order.cancelReason,
      money: {
        sub: order.moneySub,
        service: order.moneyService,
        vat: order.moneyVat,
        ship: order.moneyShip,
        round: order.moneyRound,
        total: order.moneyTotal,
      },
      lines: lines.map((l) => ({
        id: l.id,
        parentLineId: l.parentLineId,
        nameSnapshot: l.nameSnapshot,
        qty: l.qty,
        unitPrice: l.unitPrice,
        priceTotal: l.priceTotal,
        note: l.note,
        modifiers: l.modifiers,
        state: l.state,
      })),
      /** Nút nào bấm được với vai trò hiện tại — POS không đoán, hỏi máy chủ */
      nextStatuses: nextStatuses(order.status as OrderStatus, {
        orderType: order.type as OrderType,
        roles: this.rolesOf(actor),
      }),
    }
  }

  /**
   * Đổi trạng thái đơn (O9 · dải điều phối P16).
   *
   * `confirmed` là mốc đơn XUỐNG BẾP: trước đó bếp không thấy gì, vì đơn chưa
   * xác nhận có thể là đơn ma hoặc đơn khách bấm nhầm rồi huỷ ngay.
   */
  async setStatus(orderId: number, to: OrderStatus, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
      if (!order) throw new NotFoundException('Không có đơn này')

      const result = applyTransition(order.status as OrderStatus, to, {
        orderType: order.type as OrderType,
        roles: this.rolesOf(actor),
      })
      if (!result.ok) {
        // Thiếu quyền là 403; còn lại là xung đột trạng thái — hai thứ khác nhau,
        // POS hiện hai câu khác nhau
        if (result.code === 'forbidden') {
          throw new ForbiddenException({ code: result.code, message: result.message })
        }
        throw new ConflictException({ code: result.code, message: result.message })
      }
      if (!result.changed) return { orderId, status: order.status, changed: false }

      const now = new Date()
      await tx
        .update(orders)
        .set({
          status: to,
          confirmedAt: to === 'confirmed' ? now : order.confirmedAt,
          readyAt: to === 'ready' ? now : order.readyAt,
          doneAt: to === 'done' ? now : order.doneAt,
          version: sql`${orders.version} + 1`,
        })
        .where(eq(orders.id, orderId))

      // Xác nhận đơn = gửi bếp. Vé sinh qua đúng miền định tuyến của đơn tại bàn.
      const tickets = to === 'confirmed' ? await this.ordering.fireOnlineOrder(tx, order, actor) : 0

      await this.audit.write(tx, {
        actor,
        action: `order.status.${to}`,
        entity: 'order',
        entityId: String(orderId),
        payload: { from: order.status, to },
      })

      await emit(tx, {
        branchId: order.branchId,
        topic: 'order.updated',
        rooms: [rooms.orders(order.branchId)],
        payload: { orderId, displayCode: order.displayCode, status: to },
      })

      return { orderId, status: to, changed: true, tickets }
    })
  }

  /** O9 huỷ đơn — luôn kèm lý do, luôn vào nhật ký */
  async cancel(orderId: number, reason: string, actor: Actor) {
    if (!reason.trim()) throw new BadRequestException('Huỷ đơn phải có lý do')

    return this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
      if (!order) throw new NotFoundException('Không có đơn này')

      const result = applyTransition(order.status as OrderStatus, 'cancelled', {
        orderType: order.type as OrderType,
        roles: this.rolesOf(actor),
      })
      if (!result.ok) throw new ConflictException({ code: result.code, message: result.message })
      if (!result.changed) return { orderId, changed: false }

      await tx
        .update(orders)
        .set({
          status: 'cancelled',
          cancelReason: reason.trim(),
          cancelledAt: new Date(),
          version: sql`${orders.version} + 1`,
        })
        .where(eq(orders.id, orderId))

      /**
       * Huỷ đơn phải RÚT VÉ khỏi bếp.
       *
       * Đơn được xác nhận là vé đã nằm trên màn bếp rồi. Huỷ đơn mà để vé lại thì
       * bếp cứ nấu tiếp một đơn không còn ai lấy — và họ chỉ biết khi mang ra
       * quầy. Vé rút đi kèm sự kiện để màn bếp bỏ nó ngay, không đợi tải lại.
       */
      const live = await tx
        .select({ id: tickets.id, stationId: tickets.stationId })
        .from(tickets)
        .where(
          and(
            eq(tickets.orderId, orderId),
            inArray(tickets.state, ['waiting', 'queued', 'cooking', 'ready']),
          ),
        )

      if (live.length > 0) {
        const ids = live.map((t) => t.id)
        await tx.update(tickets).set({ state: 'voided' }).where(inArray(tickets.id, ids))
        await tx
          .update(ticketItems)
          .set({ state: 'voided' })
          .where(inArray(ticketItems.ticketId, ids))

        for (const ticket of live) {
          await emit(tx, {
            branchId: order.branchId,
            topic: 'ticket.void',
            rooms: [rooms.station(order.branchId, ticket.stationId), rooms.expo(order.branchId)],
            payload: { ticketId: ticket.id, reason: reason.trim() },
          })
        }
      }

      /**
       * §25 B14: "huỷ/hoàn bill tự thu hồi điểm". Đơn đã trả rồi mới huỷ thì
       * điểm đã tích phải rút lại — nếu không, huỷ đơn liên tục là một cách in
       * điểm. Đơn chưa tích điểm thì hàm này không ghi gì.
       */
      const reclaimed = await this.customers.reclaimForVoidedOrder(tx, {
        orderId,
        businessDate: order.businessDate,
      })

      await this.audit.write(tx, {
        actor,
        action: 'order.cancelled',
        entity: 'order',
        entityId: String(orderId),
        payload: { reason: reason.trim(), from: order.status, pointsReclaimed: reclaimed },
      })

      await emit(tx, {
        branchId: order.branchId,
        topic: 'order.cancelled',
        rooms: [rooms.orders(order.branchId)],
        payload: { orderId, displayCode: order.displayCode, reason: reason.trim() },
      })

      return { orderId, changed: true }
    })
  }

  /** Drawer gán shipper ở P16 / O9 */
  async assignShipper(
    orderId: number,
    shipper: { name: string; phone?: string | null; provider?: string | null },
    actor: Actor,
  ) {
    return this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
      if (!order) throw new NotFoundException('Không có đơn này')
      if (order.type !== 'delivery') {
        throw new BadRequestException('Chỉ đơn giao hàng mới cần shipper')
      }

      await tx
        .update(orders)
        .set({
          shipper: {
            name: shipper.name,
            phone: shipper.phone ?? null,
            provider: shipper.provider ?? null,
            assignedAt: new Date().toISOString(),
          },
          version: sql`${orders.version} + 1`,
        })
        .where(eq(orders.id, orderId))

      await this.audit.write(tx, {
        actor,
        action: 'order.shipper.assigned',
        entity: 'order',
        entityId: String(orderId),
        payload: { shipper: shipper.name },
      })

      return { orderId, shipper: shipper.name }
    })
  }

  /**
   * Sổ shipper quen của drawer gán ship (P16).
   *
   * Không có bảng shipper riêng và cố ý như vậy: người giao ở đây là mấy anh chạy
   * quen quanh phố, không phải nhân sự có hồ sơ. Sổ này là những cái tên ĐÃ TỪNG
   * giao cho chi nhánh, gần nhất lên trước — vừa đủ để bấm một cái thay vì gõ lại
   * số điện thoại, mà không đẻ ra một danh mục phải bảo trì.
   */
  async shipperBook(branchId: string) {
    const rows = await this.db
      .select({ shipper: orders.shipper, at: orders.createdAt })
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branchId),
          eq(orders.type, 'delivery'),
          sql`${orders.shipper} IS NOT NULL`,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(300)

    const seen = new Map<string, { name: string; phone: string | null; trips: number }>()
    for (const row of rows) {
      const shipper = (row.shipper ?? {}) as { name?: string; phone?: string | null }
      const name = shipper.name?.trim()
      if (!name) continue
      const found = seen.get(name)
      if (found) found.trips += 1
      else seen.set(name, { name, phone: shipper.phone ?? null, trips: 1 })
    }
    return [...seen.values()]
  }

  /** Đơn đã đóng trong ngày — O8 xem lại, không nằm trong cột đang chạy */
  async closed(branchId: string, businessDate: string) {
    const rows = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branchId),
          eq(orders.businessDate, businessDate),
          sql`${orders.type} <> 'dinein'`,
          inArray(orders.status, ['done', 'cancelled']),
        ),
      )
      .orderBy(desc(orders.createdAt))

    return rows.map((o) => this.card(o))
  }

  private card(order: typeof orders.$inferSelect, itemCount = 0) {
    const customer = (order.customer ?? {}) as Record<string, unknown>
    return {
      id: order.id,
      displayCode: order.displayCode,
      channel: order.channel,
      type: order.type,
      status: order.status,
      paymentState: order.paymentState,
      slotMode: order.slotMode,
      slotAt: order.slotAt,
      createdAt: order.createdAt,
      total: order.moneyTotal,
      customerName: typeof customer.name === 'string' ? customer.name : null,
      customerPhone: typeof customer.phone === 'string' ? customer.phone : null,
      address: typeof customer.address === 'string' ? customer.address : null,
      externalCode: typeof customer.externalCode === 'string' ? customer.externalCode : null,
      itemCount,
    }
  }

  private rolesOf(actor: Actor): ActorRole[] {
    if (actor.kind === 'customer') return ['CUSTOMER']
    return actorRoles(actor) as ActorRole[]
  }

  private async mustFind(orderId: number) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId))
    if (!order) throw new NotFoundException('Không có đơn này')
    return order
  }
}
