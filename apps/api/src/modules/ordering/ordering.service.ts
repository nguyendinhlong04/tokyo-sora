import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { computeOrderTotals, rooms, type OrderLineInput } from '@sora/contracts'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { businessDateOf, minuteOfDayIn } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { nextDisplayCode, orderNumberOf } from '../../common/display-code'
import { emit, type DomainEvent } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import { isUniqueViolation } from '../../common/pg-error'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  dishAvailability,
  journalEntries,
  orderBatches,
  orderLines,
  orders,
  payments,
  tableSessions,
  tables,
  ticketItems,
  tickets,
} from '../../db/schema'
import { CatalogService } from '../catalog/catalog.service'
import { describeSchedule, isOnSale } from '../catalog/domain/sale-window'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import { explodeSet, SetSelectionError, type SetSelection } from '../kitchen/domain/explode'
import type { ServiceContext } from '../kitchen/domain/routing'
import {
  buildTickets,
  type OrderChannel,
  type OrderLineForTicket,
} from '../kitchen/domain/ticketing'

/** Bản chụp tuỳ chọn lưu trên dòng đơn (cột `modifiers` dạng jsonb) */
interface LineModifier {
  optionId: string
  name: string
  priceDelta: number
}

/**
 * Dòng chữ vàng dưới tên món trên vé bếp: tuỳ chọn trước, ghi chú của khách sau.
 * Không có gì để nói thì trả `null` để vé không mọc thêm dòng trống.
 */
function ticketNote(modifiers: unknown, note: string | null): string | null {
  const chosen = Array.isArray(modifiers) ? (modifiers as LineModifier[]) : []
  const names = chosen.map((m) => m.name).filter(Boolean).join(' · ')
  if (names && note) return `${names} — ${note}`
  return names || note || null
}

/**
 * Câu cảnh báo trước khi đổi bàn khác loại (P9).
 *
 * Nói bằng hệ quả chứ không bằng tên cột: "phải nướng hộ ở bếp, lâu thêm" là thứ
 * nhân viên cân nhắc được, còn "tableHasGrill đổi từ true sang false" thì không.
 */
function rerouteMessage(lines: number, fromGrill: boolean): string {
  return fromGrill
    ? `${lines} món đang ở bàn có bếp than sẽ chuyển sang bếp nướng hộ (lâu thêm khoảng 8 phút). Tiếp tục?`
    : `${lines} món đang bếp nướng hộ sẽ chuyển sang bàn có bếp than — khách tự nướng. Tiếp tục?`
}

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
      await this.appendLines(tx, { order, branchId: session.branchId, inputs, actor })

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

  /**
   * Thêm nhiều dòng vào một đơn ĐÃ CÓ, trong transaction của nơi gọi.
   *
   * Kênh online dùng chung đúng đường này với đơn tại bàn: nổ set, đóng băng giá,
   * trừ trần "còn N phần" — ba việc đó mà viết lại lần thứ hai thì hai đường sẽ
   * lệch nhau ngay lần sửa sau.
   */
  async appendLines(
    tx: Tx,
    ctx: {
      order: typeof orders.$inferSelect
      branchId: string
      inputs: AddLineInput[]
      actor: Actor
    },
  ) {
    /**
     * Mốc thời gian để soi lịch bán (M11), lấy MỘT LẦN cho cả lượt gọi: mười món
     * thêm cùng một phiếu order phải cùng đọc một cái đồng hồ.
     *
     * Dùng giờ HIỆN TẠI chứ không phải `order.businessDate`: đơn mở lúc 11 giờ
     * vẫn có thể thêm món lúc 14 giờ, và suất trưa thì đã hết lúc 14 giờ. Đơn
     * online đặt trước cho khung giờ sau là ngoại lệ chưa xử — nó cũng đi qua đây
     * và bị soi theo giờ đặt chứ không phải giờ giao.
     */
    const [branch] = await tx
      .select({ timezone: branches.timezone })
      .from(branches)
      .where(eq(branches.id, ctx.branchId))
    const now = new Date()
    const at = {
      businessDate: businessDateOf(now, branch!.timezone),
      minuteOfDay: minuteOfDayIn(now, branch!.timezone),
    }

    for (const input of ctx.inputs) {
      await this.addOneLine(tx, {
        order: ctx.order,
        branchId: ctx.branchId,
        input,
        actor: ctx.actor,
        at,
      })
    }
  }

  private async addOneLine(
    tx: Tx,
    ctx: {
      order: typeof orders.$inferSelect
      branchId: string
      input: AddLineInput
      actor: Actor
      at: { businessDate: string; minuteOfDay: number }
    },
  ) {
    const { order, branchId, input } = ctx
    if (!Number.isSafeInteger(input.qty) || input.qty <= 0) {
      throw new BadRequestException(`Số lượng không hợp lệ: ${input.qty}`)
    }

    const batchNo = input.batchNo ?? 1
    const catalog = await this.catalog.dishesByIds(branchId, [input.dishId], tx)
    const dish = catalog.get(input.dishId)
    if (!dish) throw new NotFoundException(`Không có món ${input.dishId}`)

    /**
     * Lịch bán (M11) kiểm ở đây, ngay cạnh 86, vì đây là cửa DUY NHẤT mà mọi kênh
     * gọi món đi qua — POS, Table và đơn online dùng chung đúng đường này.
     */
    if (!isOnSale(dish.schedule, ctx.at.businessDate, ctx.at.minuteOfDay)) {
      throw new ConflictException({
        code: 'dish_off_schedule',
        message: `${dish.name} chỉ bán ${describeSchedule(dish.schedule)}`,
      })
    }

    await this.assertAvailable(tx, branchId, input.dishId, input.qty)

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
        branchId,
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

      const { count: ticketCount, events } = await this.createTickets(tx, {
        order,
        branchId: session.branchId,
        lines: draft,
        context: { kind: 'dinein', tableCode: table.code, tableHasGrill: table.hasGrill },
        firedBatches,
      })

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
        payload: { tickets: ticketCount, lines: draft.length },
      })

      return { orderId: order.id, tickets: ticketCount }
    })
  }

  /**
   * Dựng vé bếp cho một loạt dòng đơn và ghi xuống CSDL.
   *
   * Dùng chung cho bàn và kênh online. Định tuyến trạm là chỗ tinh vi nhất hệ
   * thống (§16: bàn có bếp than khác bàn không, mang về khác giao hàng, món đa
   * trạm tách hai vé nhưng chỉ xong khi cả nhóm xong) — có hai bản chép tay của
   * đoạn này thì chúng sẽ lệch nhau ở đúng những ca hiếm mà không ai test.
   */
  private async createTickets(
    tx: Tx,
    ctx: {
      order: typeof orders.$inferSelect
      branchId: string
      lines: (typeof orderLines.$inferSelect)[]
      context: ServiceContext
      firedBatches: ReadonlySet<number>
    },
  ): Promise<{ count: number; events: DomainEvent[] }> {
    const { order, branchId, lines, context, firedBatches } = ctx

    const drafts: OrderLineForTicket[] = lines.map((l) => ({
      lineId: String(l.id),
      dishId: l.dishId,
      kind: l.kind as 'dish' | 'set_parent',
      qty: l.qty,
      batchNo: l.batchNo,
      /**
       * Tuỳ chọn đi CHUNG một dòng với ghi chú, tuỳ chọn đứng trước.
       *
       * Vé bếp chỉ có một dòng chữ vàng dưới tên món (bản thiết kế K2), và bếp
       * đọc nó trong lúc tay đang bận. Tách thành hai dòng thì vé cao thêm và số
       * vé nhìn thấy trên màn giảm đi. "Miso cay · Tỏi nướng — cắt dày" nói đủ
       * mọi thứ bếp cần biết mà vẫn nằm gọn một dòng.
       */
      note: ticketNote(l.modifiers, l.note),
      setLabel: l.setLabel,
      portionLabel: l.portionLabel,
    }))

    const catalog = await this.catalog.dishesByIds(
      branchId,
      drafts.map((d) => d.dishId),
      tx,
    )
    const prefixes = await this.catalog.stationPrefixes(tx)
    const params = await this.params.bundle(
      {
        'kitchen.grillServiceExtraSeconds': 480,
        'kitchen.packBufferSeconds': 300,
        'kitchen.deliveryBufferSeconds': 1200,
        'kitchen.slaSeconds': 720,
      },
      branchId,
    )

    /**
     * Thời gian chuẩn của từng trạm, cho món chưa khai của riêng nó (§29.1 "Bếp
     * & SLA"). Trạm chưa đặt riêng thì rơi về mức chung của chuỗi ngay ở đây, nên
     * tầng định tuyến chỉ còn phải hỏi một câu: món này có số của nó chưa.
     */
    const defaultPrepSeconds = params['kitchen.slaSeconds']
    const stationPrepSeconds: Record<string, number> = {}
    for (const stationId of Object.keys(prefixes)) {
      stationPrepSeconds[stationId] = await this.params.getNumber(
        `kitchen.slaSeconds.${stationId}`,
        defaultPrepSeconds,
        branchId,
      )
    }

    const drafted = buildTickets({
      order: {
        orderNumber: orderNumberOf(order.displayCode),
        channel: order.channel as OrderChannel,
        context,
        slotAt: order.slotAt,
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
        grillServiceExtraSeconds: params['kitchen.grillServiceExtraSeconds'],
        packBufferSeconds: params['kitchen.packBufferSeconds'],
        deliveryBufferSeconds: params['kitchen.deliveryBufferSeconds'],
        defaultPrepSeconds,
        stationPrepSeconds,
      },
    })

    const events: DomainEvent[] = []
    for (const draftTicket of drafted) {
      const [ticket] = await tx
        .insert(tickets)
        .values({
          displayCode: draftTicket.displayCode,
          orderId: order.id,
          branchId,
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
        branchId,
        topic: 'ticket.created',
        rooms: [rooms.station(branchId, draftTicket.station), rooms.expo(branchId)],
        payload: {
          ticketId: ticket!.id,
          displayCode: draftTicket.displayCode,
          station: draftTicket.station,
          state: draftTicket.state,
          batchNo: draftTicket.batchNo,
        },
      })
    }

    return { count: drafted.length, events }
  }

  /**
   * Đơn online được xác nhận → xuống bếp.
   *
   * Đơn hẹn giờ xa KHÔNG nấu sớm: vé mang mốc `startBy` để KDS đếm ngược tới lúc
   * phải bắt đầu, đúng yêu cầu "đơn online không nấu sớm" ở §2. Trạng thái đơn do
   * nơi gọi đổi; hàm này chỉ lo phần bếp.
   */
  async fireOnlineOrder(tx: Tx, order: typeof orders.$inferSelect, actor: Actor): Promise<number> {
    const lines = await tx
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.orderId, order.id), eq(orderLines.state, 'draft')))
      .orderBy(asc(orderLines.id))
    if (lines.length === 0) return 0

    await tx
      .insert(orderBatches)
      .values({
        orderId: order.id,
        batchNo: 1,
        state: 'fired',
        firedAt: new Date(),
        firedBy: actor.kind === 'staff' ? actor.staffId : null,
      })
      .onConflictDoNothing()

    const { count, events } = await this.createTickets(tx, {
      order,
      branchId: order.branchId,
      lines,
      // Mang về và giao hàng đều là "bếp làm hết" — không có bếp than tại bàn
      context: order.type === 'delivery' ? { kind: 'delivery' } : { kind: 'takeaway' },
      firedBatches: new Set([1]),
    })

    await tx
      .update(orderLines)
      .set({ state: 'queued', sentAt: new Date() })
      .where(and(eq(orderLines.orderId, order.id), eq(orderLines.state, 'draft')))

    for (const event of events) await emit(tx, event)

    await this.audit.write(tx, {
      actor,
      action: 'order.sent-to-kitchen',
      entity: 'order',
      entityId: String(order.id),
      payload: { tickets: count, lines: lines.length, channel: order.channel },
    })

    return count
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

      /**
       * Bút toán ngược vào sổ doanh thu F2.
       *
       * Trước đây huỷ món chỉ để lại dấu ở nhật ký thao tác A7 — đủ để truy ai
       * làm, nhưng KHÔNG đủ để kế toán thấy doanh thu đã bị điều chỉnh bao nhiêu.
       * F2 là "nhật ký doanh thu & điều chỉnh", nên điều chỉnh phải nằm trong sổ
       * đó chứ không nằm trong nhật ký thao tác.
       *
       * Chỉ ghi khi món ĐÃ GỬI BẾP: huỷ món chưa gửi là sửa đơn đang soạn, không
       * phải điều chỉnh doanh thu — ghi cả hai sẽ làm sổ ngập những dòng vô nghĩa.
       */
      if (alreadySent && line.priceTotal > 0) {
        await tx.insert(journalEntries).values({
          branchId: order!.branchId,
          kind: 'void',
          orderId: line.orderId,
          amount: -line.priceTotal,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          approvalId,
          memo: `Huỷ ${line.nameSnapshot} × ${line.qty} — ${input.reason.trim()}`,
          businessDate: order!.businessDate,
        })
      }

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

  // ------------------------------------------- P9 chuyển · ghép · tách bàn

  /**
   * P9 chuyển cả bàn sang bàn trống.
   *
   * Phiên bàn ĐI THEO khách chứ không sinh phiên mới: giờ mở bàn, số khách và mọi
   * khoản đã thu vẫn là của nhóm khách đó. Dựng phiên mới rồi chuyển món sang là
   * cắt đôi một nhóm khách thành hai lượt ngồi — vòng quay bàn (B6) đọc xong sẽ
   * ra một con số không có thật.
   *
   * Bàn đích khác loại bếp thì món CHƯA XONG phải định tuyến lại (§21 P9): thịt
   * sống bưng ra bàn không có bếp than thì không ai nướng. Lần bấm đầu trả lỗi
   * kèm số món sẽ đổi trạm, nhân viên bấm lại với `confirmReroute` mới chạy —
   * người quyết vẫn là người đứng đó, máy chỉ nói trước hậu quả.
   */
  async moveSession(
    sessionId: number,
    tableId: number,
    input: { confirmReroute?: boolean },
    actor: Actor,
  ) {
    return this.db.transaction(async (tx) => {
      const session = await this.liveSession(tx, sessionId)
      const from = await this.tableOf(tx, session.tableId)
      const to = await this.tableOf(tx, tableId)
      if (to.id === from.id) throw new BadRequestException('Bàn đích trùng bàn nguồn')
      if (to.branchId !== session.branchId) {
        throw new BadRequestException('Bàn đích thuộc chi nhánh khác')
      }
      if (!to.active) throw new ConflictException('Bàn đích đang ngừng sử dụng')
      if (session.guestCount > to.seatMax) {
        throw new ConflictException(`Bàn ${to.code} chỉ ngồi tối đa ${to.seatMax} khách`)
      }

      const [order] = await tx.select().from(orders).where(eq(orders.tableSessionId, sessionId))
      const live = order ? await this.linesStillInKitchen(tx, order.id) : []
      const reroute = to.hasGrill !== from.hasGrill && live.length > 0
      if (reroute && !input.confirmReroute) {
        throw new ConflictException({
          code: 'reroute_confirm',
          message: rerouteMessage(live.length, from.hasGrill),
          lines: live.length,
        })
      }

      try {
        await tx.update(tableSessions).set({ tableId }).where(eq(tableSessions.id, sessionId))
      } catch (err) {
        if (isUniqueViolation(err, 'table_sessions_one_live_per_table')) {
          throw new ConflictException(`Bàn ${to.code} đang có khách`)
        }
        throw err
      }

      if (order) {
        if (reroute) {
          await this.reissueTickets(tx, { order, lines: live, table: to })
        } else {
          // Cùng loại bàn thì vé vẫn nấu ở đúng trạm cũ — chỉ đổi số bàn để người
          // chạy món bưng đúng chỗ, và ĐỒNG HỒ VÉ GIỮ NGUYÊN.
          await tx
            .update(tickets)
            .set({ tableCode: to.code })
            .where(
              and(
                eq(tickets.orderId, order.id),
                sql`${tickets.state} IN ('waiting','queued','cooking')`,
              ),
            )
        }
      }

      await emit(tx, {
        branchId: session.branchId,
        topic: 'table.opened',
        rooms: [rooms.tables(session.branchId), rooms.tableSession(sessionId)],
        payload: { sessionId, tableId, tableCode: to.code, from: from.code },
      })

      await this.audit.write(tx, {
        actor,
        action: 'table.session.moved',
        entity: 'table_session',
        entityId: String(sessionId),
        payload: { from: from.code, to: to.code, rerouted: reroute ? live.length : 0 },
      })

      return { sessionId, tableId, tableCode: to.code, rerouted: reroute ? live.length : 0 }
    })
  }

  /**
   * P9 tách món sang bàn khác — bàn đang có khách hoặc bàn trống (mở phiên mới).
   *
   * KHÔNG tách được khi bàn nguồn đã có tiền vào (đã thu hoặc đang chờ ngân hàng):
   * tiền đã ghi cho một đơn mà món thì bỏ sang đơn khác là tự tay làm lệch sổ.
   * Thu tiền xong rồi thì mỗi bàn là một bill riêng, không còn gì để tách.
   */
  async transferLines(
    sourceSessionId: number,
    input: {
      lineIds: number[]
      targetSessionId?: number | null
      targetTableId?: number | null
      guestCount?: number | null
      confirmReroute?: boolean
    },
    actor: Actor,
  ) {
    if (input.lineIds.length === 0) throw new BadRequestException('Chưa chọn món nào')

    return this.db.transaction(async (tx) => {
      const result = await this.transferWithin(tx, {
        sourceSessionId,
        lineIds: input.lineIds,
        targetSessionId: input.targetSessionId ?? null,
        targetTableId: input.targetTableId ?? null,
        guestCount: input.guestCount ?? null,
        confirmReroute: input.confirmReroute ?? false,
        actor,
      })

      await this.audit.write(tx, {
        actor,
        action: 'table.lines.transferred',
        entity: 'table_session',
        entityId: String(sourceSessionId),
        payload: {
          to: result.targetTableCode,
          lines: result.movedLines,
          rerouted: result.rerouted,
        },
      })
      return result
    })
  }

  /**
   * P9 ghép cả bàn: dồn hết món sang bàn đích rồi đóng phiên nguồn.
   *
   * Ghép là chuyển TẤT CẢ rồi đóng, chứ không phải một phép riêng — viết lại lần
   * hai thì hai đường sẽ lệch nhau đúng ở chỗ vé bếp.
   */
  async mergeSessions(sourceSessionId: number, targetSessionId: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const source = await this.liveSession(tx, sourceSessionId)
      const [sourceOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.tableSessionId, sourceSessionId))

      const lineIds = sourceOrder
        ? (
            await tx
              .select({ id: orderLines.id })
              .from(orderLines)
              .where(
                and(
                  eq(orderLines.orderId, sourceOrder.id),
                  sql`${orderLines.parentLineId} IS NULL`,
                  sql`${orderLines.state} <> 'voided'`,
                ),
              )
          ).map((l) => l.id)
        : []

      const result =
        lineIds.length > 0
          ? await this.transferWithin(tx, {
              sourceSessionId,
              lineIds,
              targetSessionId,
              targetTableId: null,
              guestCount: null,
              // Ghép bàn là quyết định đã bấm rồi — không hỏi lần hai về định tuyến
              confirmReroute: true,
              actor,
            })
          : null

      const now = new Date()
      await tx
        .update(tableSessions)
        .set({
          status: 'closed',
          closedAt: now,
          closedBy: actor.kind === 'staff' ? actor.staffId : null,
          qrTokenHash: null,
        })
        .where(eq(tableSessions.id, sourceSessionId))

      if (sourceOrder) {
        await tx
          .update(orders)
          .set({ status: 'done', doneAt: now })
          .where(and(eq(orders.id, sourceOrder.id), sql`${orders.status} <> 'cancelled'`))
      }

      await emit(tx, {
        branchId: source.branchId,
        topic: 'table.paid',
        rooms: [rooms.tables(source.branchId), rooms.tableSession(sourceSessionId)],
        payload: { sessionId: sourceSessionId, merged: true },
      })

      await this.audit.write(tx, {
        actor,
        action: 'table.session.merged',
        entity: 'table_session',
        entityId: String(sourceSessionId),
        payload: { into: targetSessionId, lines: result?.movedLines ?? 0 },
      })

      return {
        sourceSessionId,
        targetSessionId,
        movedLines: result?.movedLines ?? 0,
        rerouted: result?.rerouted ?? 0,
      }
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

  /**
   * Ruột của P9 — dùng chung cho tách món và ghép bàn.
   *
   * Món chuyển sang bàn đích vào MỘT ĐỢT MỚI: bếp và expo nhìn ra ngay đây là
   * hàng vừa dồn sang, còn số đợt của bàn cũ thì không mang sang được (hai đơn
   * đánh số đợt độc lập).
   */
  private async transferWithin(
    tx: Tx,
    ctx: {
      sourceSessionId: number
      lineIds: number[]
      targetSessionId: number | null
      targetTableId: number | null
      guestCount: number | null
      confirmReroute: boolean
      actor: Actor
    },
  ) {
    const source = await this.liveSession(tx, ctx.sourceSessionId)
    const sourceTable = await this.tableOf(tx, source.tableId)
    const [sourceOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.tableSessionId, ctx.sourceSessionId))
    if (!sourceOrder) throw new BadRequestException('Bàn nguồn chưa có món nào')

    const [money] = await tx
      .select({ held: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(
        and(eq(payments.orderId, sourceOrder.id), inArray(payments.state, ['paid', 'pending'])),
      )
    if (Number(money?.held ?? 0) > 0) {
      throw new ConflictException({
        code: 'bill_has_money',
        message: 'Bàn đã có khoản thu — tách bàn lúc này sẽ làm lệch sổ. Hoàn khoản trước.',
      })
    }

    const picked = await tx
      .select()
      .from(orderLines)
      .where(
        and(
          eq(orderLines.orderId, sourceOrder.id),
          inArray(orderLines.id, ctx.lineIds),
          sql`${orderLines.state} <> 'voided'`,
        ),
      )
    if (picked.length !== new Set(ctx.lineIds).size) {
      throw new BadRequestException('Có món không thuộc bàn này hoặc đã huỷ')
    }
    if (picked.some((l) => l.parentLineId !== null)) {
      throw new BadRequestException('Món trong set đi theo cả set — chọn dòng set thay vì món con')
    }

    // Món thành phần của set đi theo dòng cha, luôn luôn: nửa set ở bàn này nửa
    // set ở bàn kia thì bếp không biết dọn ra cùng lúc cho ai.
    const children = await tx
      .select()
      .from(orderLines)
      .where(
        and(
          inArray(
            orderLines.parentLineId,
            picked.map((l) => l.id),
          ),
          sql`${orderLines.state} <> 'voided'`,
        ),
      )
    const moving = [...picked, ...children]

    const targetSession = ctx.targetSessionId
      ? await this.openTargetSession(tx, ctx.targetSessionId, source)
      : await this.openSessionOnFreeTable(tx, {
          tableId: ctx.targetTableId,
          guestCount: ctx.guestCount ?? 1,
          branchId: source.branchId,
          actor: ctx.actor,
        })
    if (targetSession.id === source.id) throw new BadRequestException('Bàn đích trùng bàn nguồn')

    const targetTable = await this.tableOf(tx, targetSession.tableId)
    const targetOrder = await this.ensureOrder(tx, targetSession, ctx.actor)

    const inKitchen = new Set(
      (await this.linesStillInKitchen(tx, sourceOrder.id)).map((l) => l.id),
    )
    const liveMoving = moving.filter((l) => inKitchen.has(l.id))
    const reroute = targetTable.hasGrill !== sourceTable.hasGrill && liveMoving.length > 0
    if (reroute && !ctx.confirmReroute) {
      throw new ConflictException({
        code: 'reroute_confirm',
        message: rerouteMessage(liveMoving.length, sourceTable.hasGrill),
        lines: liveMoving.length,
      })
    }

    const [maxBatch] = await tx
      .select({ n: sql<number>`coalesce(max(${orderLines.batchNo}), 0)::int` })
      .from(orderLines)
      .where(eq(orderLines.orderId, targetOrder.id))
    const batchNo = Number(maxBatch?.n ?? 0) + 1

    // Món đã gửi bếp thì đợt mới bên bàn đích mở sẵn ở trạng thái ĐÃ RA: chúng
    // đang nấu dở, bắt nhân viên bấm "Ra đợt" lần nữa là đứng hình cả vé.
    if (moving.some((l) => l.state !== 'draft')) {
      await tx
        .insert(orderBatches)
        .values({
          orderId: targetOrder.id,
          batchNo,
          state: 'fired',
          firedAt: new Date(),
          firedBy: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
        })
        .onConflictDoNothing()
    }

    await tx
      .update(orderLines)
      .set({ orderId: targetOrder.id, batchNo })
      .where(
        inArray(
          orderLines.id,
          moving.map((l) => l.id),
        ),
      )

    const movedLive = liveMoving.map((l) => ({ ...l, orderId: targetOrder.id, batchNo }))
    if (movedLive.length > 0) {
      if (reroute) {
        await this.reissueTickets(tx, { order: targetOrder, lines: movedLive, table: targetTable })
      } else {
        await this.followTickets(tx, {
          order: targetOrder,
          lines: movedLive,
          table: targetTable,
          batchNo,
        })
      }
    }

    const sourceMoney = await this.recomputeTotals(tx, sourceOrder.id, source.branchId)
    const targetMoney = await this.recomputeTotals(tx, targetOrder.id, targetSession.branchId)

    await emit(tx, {
      branchId: source.branchId,
      topic: 'order.updated',
      rooms: [
        rooms.orders(source.branchId),
        rooms.tables(source.branchId),
        rooms.tableSession(source.id),
        rooms.tableSession(targetSession.id),
      ],
      payload: {
        sourceOrderId: sourceOrder.id,
        targetOrderId: targetOrder.id,
        movedLines: moving.length,
      },
    })

    return {
      sourceSessionId: source.id,
      targetSessionId: targetSession.id,
      targetTableCode: targetTable.code,
      movedLines: moving.length,
      rerouted: reroute ? movedLive.length : 0,
      sourceMoney,
      targetMoney,
    }
  }

  private async openTargetSession(
    tx: Tx,
    targetSessionId: number,
    source: typeof tableSessions.$inferSelect,
  ) {
    const target = await this.liveSession(tx, targetSessionId)
    if (target.branchId !== source.branchId) {
      throw new BadRequestException('Bàn đích thuộc chi nhánh khác')
    }
    if (target.status !== 'open') {
      throw new ConflictException('Bàn đích đã thanh toán, đang chờ dọn')
    }
    return target
  }

  /** Bàn trống được chọn làm đích thì mở phiên ngay tại đây, trong cùng transaction */
  private async openSessionOnFreeTable(
    tx: Tx,
    ctx: { tableId: number | null; guestCount: number; branchId: string; actor: Actor },
  ) {
    if (!ctx.tableId) throw new BadRequestException('Chưa chọn bàn đích')
    const table = await this.tableOf(tx, ctx.tableId)
    if (table.branchId !== ctx.branchId) {
      throw new BadRequestException('Bàn đích thuộc chi nhánh khác')
    }
    if (!table.active) throw new ConflictException('Bàn đích đang ngừng sử dụng')

    const [branch] = await tx.select().from(branches).where(eq(branches.id, table.branchId))
    const now = new Date()
    try {
      const [session] = await tx
        .insert(tableSessions)
        .values({
          branchId: table.branchId,
          tableId: table.id,
          status: 'open',
          guestCount: Math.min(Math.max(ctx.guestCount, 1), table.seatMax),
          openedBy: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
          businessDate: businessDateOf(now, branch!.timezone),
        })
        .returning()

      await emit(tx, {
        branchId: table.branchId,
        topic: 'table.opened',
        rooms: [rooms.tables(table.branchId)],
        payload: { tableId: table.id, tableCode: table.code, sessionId: session!.id },
      })
      return session!
    } catch (err) {
      if (isUniqueViolation(err, 'table_sessions_one_live_per_table')) {
        throw new ConflictException(`Bàn ${table.code} đang có khách`)
      }
      throw err
    }
  }

  /** Dòng đơn còn món nằm trong bếp — chỉ những dòng này mới phải nghĩ tới vé */
  private async linesStillInKitchen(tx: Tx, orderId: number) {
    const rows = await tx
      .select({ line: orderLines })
      .from(orderLines)
      .innerJoin(ticketItems, eq(ticketItems.orderLineId, orderLines.id))
      .where(
        and(
          eq(orderLines.orderId, orderId),
          sql`${orderLines.state} <> 'voided'`,
          sql`${ticketItems.state} IN ('queued','cooking')`,
        ),
      )

    const byId = new Map<number, (typeof rows)[number]['line']>()
    for (const row of rows) byId.set(row.line.id, row.line)
    return [...byId.values()]
  }

  /**
   * Đổi trạm cho món đang nấu dở: vé cũ chết, vé mới sinh theo bàn đích.
   *
   * Đồng hồ vé chạy lại từ đầu và đó là điều đúng — món vừa đổi trạm thì trạm mới
   * mới bắt đầu làm, giữ đồng hồ cũ là báo trễ cho người chưa nhận việc.
   */
  private async reissueTickets(
    tx: Tx,
    ctx: {
      order: typeof orders.$inferSelect
      lines: (typeof orderLines.$inferSelect)[]
      table: typeof tables.$inferSelect
    },
  ) {
    await this.voidKitchenItems(tx, ctx.order.branchId, ctx.lines)

    const firedBatches = new Set(
      (
        await tx
          .select()
          .from(orderBatches)
          .where(and(eq(orderBatches.orderId, ctx.order.id), eq(orderBatches.state, 'fired')))
      ).map((b) => b.batchNo),
    )

    const { events } = await this.createTickets(tx, {
      order: ctx.order,
      branchId: ctx.order.branchId,
      lines: ctx.lines,
      context: {
        kind: 'dinein',
        tableCode: ctx.table.code,
        tableHasGrill: ctx.table.hasGrill,
      },
      firedBatches,
    })
    for (const event of events) await emit(tx, event)
  }

  /**
   * Bàn đích cùng loại bếp: vé KHÔNG cần dựng lại, chỉ đổi bàn và đơn.
   *
   * Vé nào chỉ chứa món chuyển đi thì đi nguyên vé — giữ nguyên đồng hồ, bếp
   * không thấy công việc của mình bị đặt lại. Vé còn món ở lại thì phải cắt: bỏ
   * phần đã chuyển khỏi vé cũ rồi sinh vé mới cho bàn đích.
   */
  private async followTickets(
    tx: Tx,
    ctx: {
      order: typeof orders.$inferSelect
      lines: (typeof orderLines.$inferSelect)[]
      table: typeof tables.$inferSelect
      batchNo: number
    },
  ) {
    const movingIds = new Set(ctx.lines.map((l) => l.id))
    const ticketIds = [
      ...new Set(
        (
          await tx
            .select({ ticketId: ticketItems.ticketId })
            .from(ticketItems)
            .where(
              and(
                inArray(ticketItems.orderLineId, [...movingIds]),
                sql`${ticketItems.state} IN ('queued','cooking')`,
              ),
            )
        ).map((r) => r.ticketId),
      ),
    ]

    const split: (typeof orderLines.$inferSelect)[] = []
    for (const ticketId of ticketIds) {
      const items = await tx
        .select()
        .from(ticketItems)
        .where(and(eq(ticketItems.ticketId, ticketId), sql`${ticketItems.state} <> 'voided'`))

      if (items.every((i) => movingIds.has(i.orderLineId))) {
        const [ticket] = await tx.select().from(tickets).where(eq(tickets.id, ticketId))
        // Mã vé mang số ĐƠN (A-0412) — vé đổi đơn thì số phải đổi theo, không thì
        // bếp gọi một số mà expo tìm không ra bill nào mang số đó.
        const prefix = ticket!.displayCode.split('-')[0] ?? ''
        await tx
          .update(tickets)
          .set({
            orderId: ctx.order.id,
            tableCode: ctx.table.code,
            batchNo: ctx.batchNo,
            displayCode: `${prefix}-${orderNumberOf(ctx.order.displayCode)}`,
          })
          .where(eq(tickets.id, ticketId))
        continue
      }
      split.push(...ctx.lines.filter((l) => items.some((i) => i.orderLineId === l.id)))
    }

    if (split.length > 0) {
      await this.reissueTickets(tx, { order: ctx.order, lines: split, table: ctx.table })
    }
  }

  /** Bỏ món khỏi vé cũ và đóng vé rỗng — dùng chung cho cả hai đường chuyển bàn */
  private async voidKitchenItems(
    tx: Tx,
    branchId: string,
    lines: (typeof orderLines.$inferSelect)[],
  ) {
    const voided = await tx
      .update(ticketItems)
      .set({ state: 'voided' })
      .where(
        and(
          inArray(
            ticketItems.orderLineId,
            lines.map((l) => l.id),
          ),
          sql`${ticketItems.state} IN ('queued','cooking')`,
        ),
      )
      .returning({ ticketId: ticketItems.ticketId })

    for (const ticketId of new Set(voided.map((v) => v.ticketId))) {
      const [left] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(ticketItems)
        .where(
          and(eq(ticketItems.ticketId, ticketId), sql`${ticketItems.state} IN ('queued','cooking')`),
        )
      const [ticket] = await tx.select().from(tickets).where(eq(tickets.id, ticketId))
      if (!ticket) continue

      // Vé không còn món nào để làm thì đóng lại, đừng để nó nằm trên màn bếp
      if (Number(left?.n ?? 0) === 0) {
        await tx.update(tickets).set({ state: 'voided' }).where(eq(tickets.id, ticketId))
      }
      await emit(tx, {
        branchId,
        topic: 'ticket.void',
        rooms: [rooms.station(branchId, ticket.stationId), rooms.expo(branchId)],
        payload: { ticketId, reason: 'Chuyển bàn' },
      })
    }
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
  /**
   * Tính lại khối tiền của đơn và ghi đè vào bảng orders.
   *
   * Hai thứ đọc TỪ CHÍNH ĐƠN chứ không nhận qua tham số:
   *   · phí giao (`moneyShip`) — đã chốt lúc đặt theo vùng giao; nhận qua tham số
   *     thì mỗi nơi gọi lại phải nhớ truyền, quên một chỗ là đơn mất phí ship.
   *   · phí phục vụ — chỉ áp cho đơn tại bàn. Đơn mang về và giao hàng không có
   *     ai phục vụ tại bàn để mà thu.
   */
  async recomputeTotals(tx: Tx, orderId: number, branchId: string) {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
    if (!order) throw new NotFoundException('Không có đơn này')

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
      serviceRate:
        order.type === 'dinein'
          ? await this.params.getNumber('sales.serviceFeeRate', 0, branchId)
          : 0,
      vatRate: await this.params.getNumber('sales.vatRate', 0, branchId),
      ship: order.moneyShip,
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
