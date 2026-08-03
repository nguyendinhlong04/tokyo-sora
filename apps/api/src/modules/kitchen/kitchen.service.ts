import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, asc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import { branches, dishAvailability, orders, stations, ticketItems, tickets } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { InventoryService } from '../inventory/inventory.service'
import { deriveStatusFromTickets, type TicketRollupState } from '../ordering/domain/order-state'

/** Trạng thái vé mà bếp bấm được (K2) */
export type TicketAction = 'start' | 'done' | 'undo'

@Injectable()
export class KitchenService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly params: ParamsService,
  ) {}

  /**
   * K2 hàng vé của một trạm. Vé cũ lên trước; vé `waiting` (đợt chưa ra) tách riêng
   * để màn K4 "Chờ ra" dùng.
   */
  async queue(branchId: string, stationId: string) {
    const [station] = await this.db.select().from(stations).where(eq(stations.id, stationId))
    if (!station) throw new NotFoundException(`Không có trạm ${stationId}`)

    /**
     * Vé đã Xong nán lại đúng cửa sổ hoàn tác rồi tự rời màn (§22 K2: "Xong +
     * *Hoàn tác* 30s"). Cắt theo giờ MÁY CHỦ chứ không theo đồng hồ thiết bị —
     * cùng lý do `serverTime` tồn tại: TV box giá rẻ sai giờ thì cửa sổ hoàn tác
     * dài ngắn tuỳ từng cái màn.
     */
    const undoSeconds = await this.params.getNumber('kitchen.undoSeconds', 30, branchId)
    const undoFrom = new Date(Date.now() - undoSeconds * 1000)

    const rows = await this.db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.branchId, branchId),
          eq(tickets.stationId, stationId),
          or(
            inArray(tickets.state, ['waiting', 'queued', 'cooking']),
            and(eq(tickets.state, 'ready'), gte(tickets.readyAt, undoFrom)),
          ),
        ),
      )
      .orderBy(asc(tickets.openedAt))

    // Số cột do TRẠM quyết định (§22): ST-02 sáu cột vé thấp vì mỗi vé chỉ vài
    // dòng thịt cân sẵn; ST-06 bốn cột vé cao vì vé nướng nhiều dòng hơn.
    const meta = {
      station: {
        id: station.id,
        name: station.name,
        kanji: station.kanji,
        columns: station.columns,
      },
      serverTime: new Date(),
      // Màn bếp cần biết cửa sổ dài bao nhiêu để giấu nút đúng lúc vé hết hạn,
      // thay vì đoán 30 rồi lệch với máy chủ mỗi khi ai đó sửa tham số ở A6.
      undoSeconds,
    }

    if (rows.length === 0) return { ...meta, tickets: [] }

    const items = await this.db
      .select()
      .from(ticketItems)
      .where(
        inArray(
          ticketItems.ticketId,
          rows.map((t) => t.id),
        ),
      )

    return {
      // `serverTime` để client tính thang than hồng theo giờ SERVER, không theo
      // đồng hồ thiết bị — TV box giá rẻ hay sai giờ và sẽ làm mọi vé đỏ ngay khi hiện.
      ...meta,
      tickets: rows.map((t) => ({
        ...t,
        items: items.filter((i) => i.ticketId === t.id && i.state !== 'voided'),
      })),
    }
  }

  /**
   * K6 Expo: gom theo đơn và đợt, biết còn chờ trạm nào.
   * Món đa trạm (chung `linkGroup`) chỉ tính là xong khi CẢ NHÓM xong.
   */
  async expo(branchId: string) {
    const rows = await this.db
      .select()
      .from(tickets)
      .where(
        and(eq(tickets.branchId, branchId), inArray(tickets.state, ['queued', 'cooking', 'ready'])),
      )
      .orderBy(asc(tickets.openedAt))
    if (rows.length === 0) return { orders: [], serverTime: new Date() }

    const items = await this.db
      .select()
      .from(ticketItems)
      .where(
        inArray(
          ticketItems.ticketId,
          rows.map((t) => t.id),
        ),
      )

    const byOrderBatch = new Map<string, typeof rows>()
    for (const ticket of rows) {
      const key = `${ticket.orderId}#${ticket.batchNo}`
      const list = byOrderBatch.get(key) ?? []
      list.push(ticket)
      byOrderBatch.set(key, list)
    }

    return {
      serverTime: new Date(),
      orders: [...byOrderBatch.entries()].map(([key, group]) => {
        const waitingFor = group.filter((t) => t.state !== 'ready').map((t) => t.stationId)
        return {
          key,
          orderId: group[0]!.orderId,
          tableCode: group[0]!.tableCode,
          batchNo: group[0]!.batchNo,
          ready: waitingFor.length === 0,
          waitingFor: [...new Set(waitingFor)],
          items: items
            .filter((i) => group.some((t) => t.id === i.ticketId) && i.state !== 'voided')
            .map((i) => ({
              name: i.nameSnapshot,
              qty: i.qty,
              componentLabel: i.componentLabel,
              linkGroup: i.linkGroup,
              state: i.state,
            })),
        }
      }),
    }
  }

  /**
   * K2 bấm "Bắt đầu" / "Xong" / "Hoàn tác".
   *
   * Bấm lại đúng trạng thái hiện tại là no-op thành công — hàng đợi offline của
   * màn bếp gửi lại mù không được sinh hiệu ứng phụ.
   */
  async changeTicketState(ticketId: number, action: TicketAction, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [ticket] = await tx.select().from(tickets).where(eq(tickets.id, ticketId))
      if (!ticket) throw new NotFoundException('Không có vé này')
      if (ticket.state === 'voided') throw new BadRequestException('Vé đã bị huỷ')
      if (ticket.state === 'waiting') {
        throw new BadRequestException('Đợt chưa ra — bấm "Ra đợt tiếp" trước')
      }

      const now = new Date()
      const target = {
        start: 'cooking',
        done: 'ready',
        undo: 'queued',
      }[action] as 'cooking' | 'ready' | 'queued'

      if (ticket.state === target) return { ticketId, state: target, changed: false }

      /**
       * Cửa sổ hoàn tác chỉ tính cho lượt kéo lùi từ "Xong" — bỏ "Bắt đầu" thì
       * món còn nằm trong bếp, muốn lúc nào cũng được.
       *
       * Quá hạn phải chặn Ở ĐÂY chứ không chỉ giấu nút: hàng đợi offline của màn
       * bếp có thể gửi lại một lượt hoàn tác của nửa tiếng trước. Mà "Xong" đã
       * trừ kho và hoàn tác KHÔNG hoàn kho (xem `postSaleForTicket`), nên kéo lùi
       * muộn chỉ làm màn hình đẹp lại chứ không làm miếng thịt hiện về trong tủ.
       */
      if (action === 'undo' && ticket.state === 'ready') {
        const undoSeconds = await this.params.getNumber('kitchen.undoSeconds', 30, ticket.branchId)
        const elapsed = ticket.readyAt
          ? (now.getTime() - ticket.readyAt.getTime()) / 1000
          : Number.POSITIVE_INFINITY
        if (elapsed > undoSeconds) {
          throw new BadRequestException(`Quá ${undoSeconds} giây rồi — không hoàn tác được nữa`)
        }
      }

      await tx
        .update(tickets)
        .set({
          state: target,
          startedAt: target === 'cooking' ? now : target === 'queued' ? null : ticket.startedAt,
          readyAt: target === 'ready' ? now : null,
        })
        .where(eq(tickets.id, ticketId))

      await tx
        .update(ticketItems)
        .set({ state: target === 'ready' ? 'done' : target === 'cooking' ? 'cooking' : 'queued' })
        .where(and(eq(ticketItems.ticketId, ticketId), sql`${ticketItems.state} <> 'voided'`))

      // Trừ kho khi bếp bấm Xong (§25, quyết định 2). Nằm TRONG cùng transaction
      // với việc đổi trạng thái vé: hoặc vé xong và kho trừ, hoặc không có gì xảy
      // ra — không có cửa nào để món ra khỏi bếp mà nguyên liệu vẫn còn trong sổ.
      if (target === 'ready') {
        await this.inventory.postSaleForTicket(tx, ticketId, actor)
      }

      const orderStatus = await this.rollUpOrderStatus(tx, ticket.orderId)

      // Bấm Bắt đầu/Xong xảy ra hàng trăm lần mỗi ca và đã có mốc giờ trên chính
      // vé, ghi nhật ký sẽ chỉ làm ngập sổ. Nhưng HOÀN TÁC thì khác: nó kéo lùi
      // trạng thái và có thể che giấu sai sót, nên phải để lại dấu vết.
      if (action === 'undo') {
        await this.audit.write(tx, {
          actor,
          action: 'kds.ticket.undo',
          entity: 'ticket',
          entityId: String(ticketId),
          payload: { from: ticket.state, displayCode: ticket.displayCode },
        })
      }

      await emit(tx, {
        branchId: ticket.branchId,
        topic: target === 'ready' ? 'ticket.ready' : 'ticket.created',
        rooms: [rooms.station(ticket.branchId, ticket.stationId), rooms.expo(ticket.branchId)],
        payload: { ticketId, state: target, displayCode: ticket.displayCode },
      })

      const [order] = await tx.select().from(orders).where(eq(orders.id, ticket.orderId))
      if (order?.tableSessionId) {
        await emit(tx, {
          branchId: ticket.branchId,
          topic: 'order.updated',
          rooms: [
            rooms.orders(ticket.branchId),
            rooms.tableSession(order.tableSessionId),
          ],
          payload: { orderId: ticket.orderId, status: orderStatus },
        })
      }

      return { ticketId, state: target, changed: true, orderStatus }
    })
  }

  /**
   * K5 báo hết món. Đẩy ngay ra Table · POS · menu online — điểm dễ sai §9.3: chậm
   * vài giây là khách vẫn đặt được món đã hết.
   */
  async setAvailability(
    branchId: string,
    input: { dishId: string; status: 'sold_out' | 'limited' | 'available'; remaining?: number | null },
    actor: Actor,
  ) {
    return this.db.transaction(async (tx) => {
      const [branch] = await tx.select().from(branches).where(eq(branches.id, branchId))
      if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
      const businessDate = businessDateOf(new Date(), branch.timezone)

      if (input.status === 'available') {
        await tx
          .delete(dishAvailability)
          .where(
            and(
              eq(dishAvailability.branchId, branchId),
              eq(dishAvailability.dishId, input.dishId),
            ),
          )
      } else {
        if (input.status === 'limited' && (input.remaining ?? 0) <= 0) {
          throw new BadRequestException('Còn giới hạn thì phải nói còn mấy phần')
        }
        const row = {
          branchId,
          dishId: input.dishId,
          businessDate,
          status: input.status,
          remaining: input.status === 'sold_out' ? null : (input.remaining ?? null),
          updatedBy: actor.kind === 'staff' ? actor.staffId : null,
          updatedAt: new Date(),
        }
        await tx
          .insert(dishAvailability)
          .values(row)
          .onConflictDoUpdate({
            target: [dishAvailability.branchId, dishAvailability.dishId],
            set: row,
          })
      }

      await emit(tx, {
        branchId,
        topic: 'availability.changed',
        // Kênh config: mọi thiết bị của chi nhánh đều nghe, kể cả điện thoại khách
        rooms: [rooms.config(branchId)],
        payload: { dishId: input.dishId, status: input.status, remaining: input.remaining ?? null },
      })

      await this.audit.write(tx, {
        actor,
        action: 'menu.mark-sold-out',
        entity: 'dish',
        entityId: input.dishId,
        payload: { status: input.status, remaining: input.remaining ?? null },
      })

      return { dishId: input.dishId, status: input.status, remaining: input.remaining ?? null }
    })
  }

  async availability(branchId: string) {
    return this.db
      .select()
      .from(dishAvailability)
      .where(eq(dishAvailability.branchId, branchId))
  }

  /** Bếp bấm nút là đơn tự đổi bước — POS không phải thao tác thêm */
  private async rollUpOrderStatus(tx: Tx, orderId: number) {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
    if (!order) return null

    const states = await tx
      .select({ state: tickets.state })
      .from(tickets)
      .where(eq(tickets.orderId, orderId))

    const next = deriveStatusFromTickets(
      order.status as Parameters<typeof deriveStatusFromTickets>[0],
      states.map((s) => s.state as TicketRollupState),
    )
    if (next === order.status) return order.status

    await tx
      .update(orders)
      .set({ status: next, readyAt: next === 'ready' ? new Date() : order.readyAt })
      .where(eq(orders.id, orderId))
    return next
  }
}
