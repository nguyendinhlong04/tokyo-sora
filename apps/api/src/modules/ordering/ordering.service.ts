import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { computeOrderTotals, rooms, type OrderLineInput } from '@sora/contracts'
import { and, asc, eq, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { nextDisplayCode, orderNumberOf } from '../../common/display-code'
import { emit, type DomainEvent } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  dishAvailability,
  orderBatches,
  orderLines,
  orders,
  tableSessions,
  tables,
  ticketItems,
  tickets,
} from '../../db/schema'
import { CatalogService } from '../catalog/catalog.service'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import { explodeSet, SetSelectionError, type SetSelection } from '../kitchen/domain/explode'
import type { ServiceContext } from '../kitchen/domain/routing'
import { buildTickets, type OrderLineForTicket } from '../kitchen/domain/ticketing'

export interface AddLineInput {
  dishId: string
  qty: number
  note?: string | null
  modifierOptionIds?: string[]
  /** Đợt ra món; mặc định đợt 1 */
  batchNo?: number
  /** Với món set: khách chọn gì cho các nhóm "chọn N trong M" */
  setSelections?: SetSelection[]
}

@Injectable()
export class OrderingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly catalog: CatalogService,
    private readonly params: ParamsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ Đọc

  async getSessionOrder(sessionId: number) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.tableSessionId, sessionId))
      .limit(1)
    if (!order) return null

    const lines = await this.db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id))
      .orderBy(asc(orderLines.id))
    const batches = await this.db
      .select()
      .from(orderBatches)
      .where(eq(orderBatches.orderId, order.id))
      .orderBy(asc(orderBatches.batchNo))

    return { order, lines, batches }
  }

  // ------------------------------------------------------- Thêm món (P4)

  /**
   * Thêm món vào đơn của phiên bàn. Dòng ở trạng thái `draft` cho tới khi bấm
   * GỬI BẾP — POS dựng phiếu order rồi mới gửi một lượt.
   *
   * Ba việc phải làm trong CÙNG một transaction:
   *   1. Nổ set thành món thành phần (bếp không làm được nguyên set).
   *   2. Đóng băng giá và tên vào dòng đơn — Office đổi giá sau không đụng đơn cũ.
   *   3. Trừ trần "còn N phần" nguyên tử để không bán quá số món còn lại.
   */
  async addLines(sessionId: number, inputs: AddLineInput[], actor: Actor) {
    if (inputs.length === 0) throw new BadRequestException('Chưa chọn món nào')

    return this.db.transaction(async (tx) => {
      const session = await this.liveSession(tx, sessionId)
      const order = await this.ensureOrder(tx, session, actor)

      const events: DomainEvent[] = []
      for (const input of inputs) {
        await this.addOneLine(tx, { order, session, input, actor })
      }

      const money = await this.recomputeTotals(tx, order.id, session.branchId)
      events.push({
        branchId: session.branchId,
        topic: 'order.updated',
        rooms: [rooms.orders(session.branchId), rooms.tableSession(sessionId)],
        payload: { orderId: order.id, displayCode: order.displayCode, money },
      })
      for (const event of events) await emit(tx, event)

      return { orderId: order.id, displayCode: order.displayCode, money }
    })
  }

  private async addOneLine(
    tx: Tx,
    ctx: {
      order: typeof orders.$inferSelect
      session: typeof tableSessions.$inferSelect
      input: AddLineInput
      actor: Actor
    },
  ) {
    const { order, session, input } = ctx
    if (!Number.isSafeInteger(input.qty) || input.qty <= 0) {
      throw new BadRequestException(`Số lượng không hợp lệ: ${input.qty}`)
    }

    const batchNo = input.batchNo ?? 1
    const catalog = await this.catalog.dishesByIds(session.branchId, [input.dishId], tx)
    const dish = catalog.get(input.dishId)
    if (!dish) throw new NotFoundException(`Không có món ${input.dishId}`)

    await this.assertAvailable(tx, session.branchId, input.dishId, input.qty)

    const modifiers = await this.resolveModifiers(tx, input.modifierOptionIds ?? [])
    const unitPrice = dish.price + modifiers.reduce((sum, m) => sum + m.priceDelta, 0)

    if (dish.kind === 'set') {
      const def = await this.catalog.setDefinition(dish.id, tx)
      if (!def) throw new BadRequestException(`Set ${dish.id} chưa khai nhóm món thành phần`)

      // Dòng cha giữ GIÁ, không xuống bếp
      const [parent] = await tx
        .insert(orderLines)
        .values({
          orderId: order.id,
          kind: 'set_parent',
          batchNo,
          dishId: dish.id,
          dishCode: dish.code,
          nameSnapshot: dish.name,
          qty: input.qty,
          unitPrice,
          priceTotal: unitPrice * input.qty,
          modifiers: modifiers.length ? modifiers : null,
          note: input.note ?? null,
          state: 'draft',
        })
        .returning({ id: orderLines.id })

      let children
      try {
        children = explodeSet(
          {
            lineId: String(parent!.id),
            setDishId: dish.id,
            qty: input.qty,
            batchNo,
            note: input.note ?? null,
          },
          def,
          input.setSelections ?? [],
        )
      } catch (err) {
        if (err instanceof SetSelectionError) throw new BadRequestException(err.message)
        throw err
      }

      const childCatalog = await this.catalog.dishesByIds(
        session.branchId,
        children.map((c) => c.dishId),
        tx,
      )
      for (const child of children) {
        const childDish = childCatalog.get(child.dishId)
        if (!childDish) throw new NotFoundException(`Set chứa món không tồn tại: ${child.dishId}`)
        await tx.insert(orderLines).values({
          orderId: order.id,
          parentLineId: parent!.id,
          kind: 'dish',
          batchNo: child.batchNo,
          dishId: child.dishId,
          dishCode: childDish.code,
          nameSnapshot: childDish.name,
          qty: child.qty,
          // Giá nằm ở dòng set cha (ràng buộc order_lines_child_price_zero)
          unitPrice: 0,
          priceTotal: 0,
          note: child.note,
          setLabel: child.setLabel,
          portionLabel: child.portionLabel,
          state: 'draft',
        })
      }
      return
    }

    await tx.insert(orderLines).values({
      orderId: order.id,
      kind: 'dish',
      batchNo,
      dishId: dish.id,
      dishCode: dish.code,
      nameSnapshot: dish.name,
      qty: input.qty,
      unitPrice,
      priceTotal: unitPrice * input.qty,
      modifiers: modifiers.length ? modifiers : null,
      note: input.note ?? null,
      state: 'draft',
    })
  }

  // --------------------------------------------------- GỬI BẾP / Ra đợt

  /**
   * GỬI BẾP: mọi dòng `draft` chuyển sang `queued` và sinh vé bếp.
   *
   * Đợt 1 chạy ngay; đợt 2 trở đi vào trạng thái chờ (`held`) — vé hiện trên K4
   * "Chờ ra" và ĐỒNG HỒ CHƯA CHẠY cho tới khi bấm "Ra đợt tiếp".
   */
  async sendToKitchen(sessionId: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const session = await this.liveSession(tx, sessionId)
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.tableSessionId, sessionId))
      if (!order) throw new NotFoundException('Bàn chưa có đơn nào')

      const draft = await tx
        .select()
        .from(orderLines)
        .where(and(eq(orderLines.orderId, order.id), eq(orderLines.state, 'draft')))
        .orderBy(asc(orderLines.id))
      if (draft.length === 0) throw new BadRequestException('Không có món nào chờ gửi bếp')

      const table = await this.tableOf(tx, session.tableId)
      const batchNos = [...new Set(draft.map((l) => l.batchNo))].sort((a, b) => a - b)

      // Đợt 1 ra ngay; đợt sau chờ nhân viên bấm "Ra đợt tiếp"
      for (const batchNo of batchNos) {
        const fired = batchNo === 1
        await tx
          .insert(orderBatches)
          .values({
            orderId: order.id,
            batchNo,
            state: fired ? 'fired' : 'held',
            firedAt: fired ? new Date() : null,
            firedBy: fired && actor.kind === 'staff' ? actor.staffId : null,
          })
          .onConflictDoNothing()
      }

      const firedBatches = new Set(
        (
          await tx
            .select()
            .from(orderBatches)
            .where(and(eq(orderBatches.orderId, order.id), eq(orderBatches.state, 'fired')))
        ).map((b) => b.batchNo),
      )

      const drafts: OrderLineForTicket[] = draft.map((l) => ({
        lineId: String(l.id),
        dishId: l.dishId,
        kind: l.kind as 'dish' | 'set_parent',
        qty: l.qty,
        batchNo: l.batchNo,
        note: l.note,
        setLabel: l.setLabel,
        portionLabel: l.portionLabel,
      }))

      const catalog = await this.catalog.dishesByIds(
        session.branchId,
        drafts.map((d) => d.dishId),
        tx,
      )
      const prefixes = await this.catalog.stationPrefixes(tx)
      const params = await this.params.bundle(
        {
          grillServiceExtraSeconds: 480,
          packBufferSeconds: 300,
          deliveryBufferSeconds: 1200,
        },
        session.branchId,
      )

      const context: ServiceContext = {
        kind: 'dinein',
        tableCode: table.code,
        tableHasGrill: table.hasGrill,
      }

      const drafted = buildTickets({
        order: {
          orderNumber: orderNumberOf(order.displayCode),
          channel: 'pos',
          context,
        },
        lines: drafts,
        catalog: (id) => {
          const d = catalog.get(id)
          return d?.routing ? { name: d.name, routing: d.routing } : undefined
        },
        firedBatches,
        stationPrefixes: prefixes,
        now: new Date(),
        params: {
          grillServiceExtraSeconds: params.grillServiceExtraSeconds,
          packBufferSeconds: params.packBufferSeconds,
          deliveryBufferSeconds: params.deliveryBufferSeconds,
        },
      })

      const events: DomainEvent[] = []
      for (const draftTicket of drafted) {
        const [ticket] = await tx
          .insert(tickets)
          .values({
            displayCode: draftTicket.displayCode,
            orderId: order.id,
            branchId: session.branchId,
            stationId: draftTicket.station,
            source: draftTicket.source,
            tableCode: draftTicket.tableCode,
            batchNo: draftTicket.batchNo,
            state: draftTicket.state,
            grillServiceNote: draftTicket.grillServiceNote,
            prepSeconds: draftTicket.prepSeconds,
            queuedAt: draftTicket.queuedAt,
            dueAt: draftTicket.dueAt,
            startBy: draftTicket.startBy,
          })
          .returning({ id: tickets.id })

        await tx.insert(ticketItems).values(
          draftTicket.items.map((item) => ({
            ticketId: ticket!.id,
            orderLineId: Number(item.orderLineId),
            dishId: item.dishId,
            nameSnapshot: item.name,
            qty: item.qty,
            note: item.note,
            setLabel: item.setLabel,
            componentLabel: item.componentLabel,
            portionLabel: item.portionLabel,
            linkGroup: item.linkGroup,
            state: 'queued' as const,
          })),
        )

        events.push({
          branchId: session.branchId,
          topic: 'ticket.created',
          rooms: [
            rooms.station(session.branchId, draftTicket.station),
            rooms.expo(session.branchId),
          ],
          payload: {
            ticketId: ticket!.id,
            displayCode: draftTicket.displayCode,
            station: draftTicket.station,
            state: draftTicket.state,
            batchNo: draftTicket.batchNo,
          },
        })
      }

      // Cả dòng món lẫn dòng set cha đều thôi là nháp; riêng dòng set cha không
      // sinh vé nào vì món thành phần mới là thứ xuống bếp.
      await tx
        .update(orderLines)
        .set({ state: 'queued', sentAt: new Date() })
        .where(and(eq(orderLines.orderId, order.id), eq(orderLines.state, 'draft')))

      if (order.status === 'new') {
        await tx
          .update(orders)
          .set({ status: 'confirmed', confirmedAt: new Date() })
          .where(eq(orders.id, order.id))
      }

      events.push({
        branchId: session.branchId,
        topic: 'order.updated',
        rooms: [rooms.orders(session.branchId), rooms.tableSession(sessionId)],
        payload: { orderId: order.id, status: 'confirmed' },
      })
      for (const event of events) await emit(tx, event)

      await this.audit.write(tx, {
        actor,
        action: 'order.sent-to-kitchen',
        entity: 'order',
        entityId: String(order.id),
        payload: { tickets: drafted.length, lines: draft.length },
      })

      return { orderId: order.id, tickets: drafted.length }
    })
  }

  /** P7 "Ra đợt tiếp": vé đợt đó vào hàng, đồng hồ bắt đầu chạy TỪ ĐÂY */
  async fireBatch(orderId: number, batchNo: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
      if (!order) throw new NotFoundException('Không có đơn này')

      const [batch] = await tx
        .select()
        .from(orderBatches)
        .where(and(eq(orderBatches.orderId, orderId), eq(orderBatches.batchNo, batchNo)))
      if (!batch) throw new NotFoundException(`Đơn không có đợt ${batchNo}`)
      // Bấm lại lần hai không phải lỗi — hàng đợi offline có thể gửi trùng
      if (batch.state === 'fired') return { orderId, batchNo, changed: false }

      const now = new Date()
      await tx
        .update(orderBatches)
        .set({
          state: 'fired',
          firedAt: now,
          firedBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .where(and(eq(orderBatches.orderId, orderId), eq(orderBatches.batchNo, batchNo)))

      const waiting = await tx
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.orderId, orderId),
            eq(tickets.batchNo, batchNo),
            eq(tickets.state, 'waiting'),
          ),
        )

      for (const ticket of waiting) {
        await tx
          .update(tickets)
          .set({
            state: 'queued',
            queuedAt: now,
            dueAt: new Date(now.getTime() + ticket.prepSeconds * 1000),
          })
          .where(eq(tickets.id, ticket.id))

        await emit(tx, {
          branchId: order.branchId,
          topic: 'ticket.created',
          rooms: [rooms.station(order.branchId, ticket.stationId), rooms.expo(order.branchId)],
          payload: {
            ticketId: ticket.id,
            displayCode: ticket.displayCode,
            station: ticket.stationId,
            state: 'queued',
            batchNo,
          },
        })
      }

      await this.audit.write(tx, {
        actor,
        action: 'order.batch.fired',
        entity: 'order',
        entityId: String(orderId),
        payload: { batchNo, tickets: waiting.length },
      })

      return { orderId, batchNo, changed: true, tickets: waiting.length }
    })
  }

  // ------------------------------------------------------- Huỷ món (P8)

  /**
   * Huỷ một dòng. Chưa gửi bếp thì ai gọi được món cũng huỷ được; ĐÃ gửi bếp thì
   * phục vụ/thu ngân phải có quản lý duyệt bằng PIN (ma trận §4.2 dấu △).
   */
  async voidLine(
    lineId: number,
    input: { reason: string; approval?: ApprovalInput | null },
    actor: Actor,
  ) {
    if (!input.reason?.trim()) throw new BadRequestException('Huỷ món phải có lý do')

    return this.db.transaction(async (tx) => {
      const [line] = await tx.select().from(orderLines).where(eq(orderLines.id, lineId))
      if (!line) throw new NotFoundException('Không có dòng này')
      if (line.state === 'voided') return { lineId, changed: false }
      if (line.state === 'served') {
        throw new ConflictException('Món đã phục vụ — dùng luồng hoàn tiền, không huỷ')
      }

      const [order] = await tx.select().from(orders).where(eq(orders.id, line.orderId))
      const alreadySent = line.state !== 'draft'

      const { approvalId } = alreadySent
        ? await this.approvals.authorize(tx, {
            actor,
            action: 'order.line.void-sent',
            entity: 'order_line',
            entityId: String(lineId),
            approval: input.approval,
          })
        : { approvalId: null }

      await tx
        .update(orderLines)
        .set({
          state: 'voided',
          voidReason: input.reason.trim(),
          voidedBy: actor.kind === 'staff' ? actor.staffId : null,
          approvalId,
        })
        .where(eq(orderLines.id, lineId))

      // Dòng set cha bị huỷ thì các món thành phần đi theo
      await tx
        .update(orderLines)
        .set({
          state: 'voided',
          voidReason: input.reason.trim(),
          voidedBy: actor.kind === 'staff' ? actor.staffId : null,
          approvalId,
        })
        .where(and(eq(orderLines.parentLineId, lineId), sql`${orderLines.state} <> 'voided'`))

      const voidedItems = await tx
        .update(ticketItems)
        .set({ state: 'voided' })
        .where(and(eq(ticketItems.orderLineId, lineId), sql`${ticketItems.state} <> 'done'`))
        .returning({ ticketId: ticketItems.ticketId })

      const money = await this.recomputeTotals(tx, line.orderId, order!.branchId)

      for (const ticketId of new Set(voidedItems.map((i) => i.ticketId))) {
        const [ticket] = await tx.select().from(tickets).where(eq(tickets.id, ticketId))
        if (!ticket) continue
        await emit(tx, {
          branchId: order!.branchId,
          topic: 'ticket.void',
          rooms: [rooms.station(order!.branchId, ticket.stationId), rooms.expo(order!.branchId)],
          payload: { ticketId, orderLineId: lineId, reason: input.reason.trim() },
        })
      }

      await this.audit.write(tx, {
        actor,
        action: alreadySent ? 'order.line.void-sent' : 'order.line.void-draft',
        entity: 'order_line',
        entityId: String(lineId),
        payload: { reason: input.reason.trim(), dishId: line.dishId, qty: line.qty },
        approvalId,
      })

      return { lineId, changed: true, approvalId, money }
    })
  }

  // ------------------------------------------------------------ Nội bộ

  private async liveSession(tx: Tx, sessionId: number) {
    const [session] = await tx
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId))
    if (!session) throw new NotFoundException('Không có phiên bàn này')
    if (session.status === 'closed') throw new ConflictException('Phiên bàn đã đóng')
    return session
  }

  private async tableOf(tx: Tx, tableId: number) {
    const [table] = await tx.select().from(tables).where(eq(tables.id, tableId))
    if (!table) throw new NotFoundException('Không có bàn này')
    return table
  }

  private async ensureOrder(tx: Tx, session: typeof tableSessions.$inferSelect, actor: Actor) {
    const [existing] = await tx
      .select()
      .from(orders)
      .where(eq(orders.tableSessionId, session.id))
    if (existing) return existing

    const [branch] = await tx.select().from(branches).where(eq(branches.id, session.branchId))
    const now = new Date()
    const businessDate = businessDateOf(now, branch!.timezone)
    const { code } = await nextDisplayCode(tx, {
      branchId: session.branchId,
      kind: 'order',
      businessDate,
      at: now,
      timezone: branch!.timezone,
    })

    const [created] = await tx
      .insert(orders)
      .values({
        displayCode: code,
        branchId: session.branchId,
        channel: actor.kind === 'customer' ? 'table' : 'pos',
        type: 'dinein',
        status: 'new',
        tableSessionId: session.id,
        createdByKind: actor.kind === 'customer' ? 'customer' : 'staff',
        createdById: actor.kind === 'staff' ? String(actor.staffId) : null,
        businessDate,
      })
      .returning()
    return created!
  }

  private async resolveModifiers(tx: Tx, optionIds: string[]) {
    const options = await this.catalog.modifierOptionsByIds(optionIds, tx)
    return optionIds.map((id) => {
      const option = options.get(id)
      if (!option) throw new NotFoundException(`Không có tuỳ chọn ${id}`)
      return { optionId: option.id, name: option.name, priceDelta: option.priceDelta }
    })
  }

  /**
   * Trần "còn N phần" (K5). Trừ NGUYÊN TỬ: `WHERE remaining >= qty` — hai thu ngân
   * bấm cùng lúc thì chỉ một người qua được, người kia nhận lỗi thay vì bán quá.
   */
  private async assertAvailable(tx: Tx, branchId: string, dishId: string, qty: number) {
    const [row] = await tx
      .select()
      .from(dishAvailability)
      .where(and(eq(dishAvailability.branchId, branchId), eq(dishAvailability.dishId, dishId)))
    if (!row) return

    if (row.status === 'sold_out') {
      throw new ConflictException({ code: 'dish_sold_out', message: 'Món đã hết' })
    }

    const updated = await tx
      .update(dishAvailability)
      .set({ remaining: sql`${dishAvailability.remaining} - ${qty}` })
      .where(
        and(
          eq(dishAvailability.branchId, branchId),
          eq(dishAvailability.dishId, dishId),
          sql`${dishAvailability.remaining} >= ${qty}`,
        ),
      )
      .returning({ remaining: dishAvailability.remaining })

    if (updated.length === 0) {
      throw new ConflictException({
        code: 'dish_sold_out',
        message: `Món chỉ còn ${row.remaining} phần`,
      })
    }
  }

  /** Tính lại tổng tiền — SERVER là nguồn duy nhất, client chỉ hiển thị */
  private async recomputeTotals(tx: Tx, orderId: number, branchId: string) {
    const lines = await tx
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.orderId, orderId), sql`${orderLines.state} <> 'voided'`))

    const money = computeOrderTotals({
      // Dòng con của set giá 0 nên cộng vào cũng không đổi kết quả, nhưng loại ra
      // cho rõ ý: giá nằm ở dòng set cha.
      lines: lines
        .filter((l) => l.parentLineId === null)
        .map<OrderLineInput>((l) => ({ qty: l.qty, unitPrice: l.unitPrice })),
      serviceRate: await this.params.getNumber('sales.serviceFeeRate', 0, branchId),
      vatRate: await this.params.getNumber('sales.vatRate', 0, branchId),
      roundingUnit: await this.params.getNumber('sales.roundingUnit', 1000, branchId),
    })

    await tx
      .update(orders)
      .set({
        moneySub: money.sub,
        moneyDiscount: money.discount,
        moneyService: money.service,
        moneyVat: money.vat,
        moneyRound: money.round,
        moneyTotal: money.total,
        version: sql`${orders.version} + 1`,
      })
      .where(eq(orders.id, orderId))

    return money
  }
}
