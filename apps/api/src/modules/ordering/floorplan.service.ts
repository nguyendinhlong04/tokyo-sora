import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, eq, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { isUniqueViolation } from '../../common/pg-error'
import type { Db } from '../../db/client'
import { areas, branches, orders, tableSessions, tables } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { hashToken, newToken } from '../identity/tokens'

@Injectable()
export class FloorplanService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /** P2 sơ đồ bàn: bàn + phiên đang mở + tiền tạm tính */
  async floorplan(branchId: string) {
    const rows = await this.db
      .select({
        table: tables,
        area: areas,
        session: tableSessions,
        order: orders,
      })
      .from(tables)
      .leftJoin(areas, eq(areas.id, tables.areaId))
      .leftJoin(
        tableSessions,
        and(
          eq(tableSessions.tableId, tables.id),
          sql`${tableSessions.status} <> 'closed'`,
        ),
      )
      .leftJoin(orders, eq(orders.tableSessionId, tableSessions.id))
      .where(and(eq(tables.branchId, branchId), eq(tables.active, true)))

    return rows.map(({ table, area, session, order }) => ({
      id: table.id,
      code: table.code,
      area: area?.name ?? null,
      kind: table.kind,
      hasGrill: table.hasGrill,
      seatMin: table.seatMin,
      seatMax: table.seatMax,
      session: session
        ? {
            id: session.id,
            status: session.status,
            guestCount: session.guestCount,
            openedAt: session.openedAt,
            orderId: order?.id ?? null,
            displayCode: order?.displayCode ?? null,
            total: order?.moneyTotal ?? 0,
            paymentState: order?.paymentState ?? 'unpaid',
          }
        : null,
    }))
  }

  /**
   * T1 "bàn nào đây" — điện thoại khách chỉ cầm token, không biết mình ngồi bàn
   * mấy. Trả đúng phần khách cần thấy để chào bàn, không kèm tiền nong hay ai mở
   * bàn: những thứ đó có màn riêng và có quyền riêng.
   */
  async sessionSummary(sessionId: number) {
    const [row] = await this.db
      .select({ session: tableSessions, table: tables, area: areas })
      .from(tableSessions)
      .innerJoin(tables, eq(tables.id, tableSessions.tableId))
      .leftJoin(areas, eq(areas.id, tables.areaId))
      .where(eq(tableSessions.id, sessionId))
    if (!row) throw new NotFoundException('Không có phiên bàn này')

    return {
      id: row.session.id,
      branchId: row.session.branchId,
      status: row.session.status,
      guestCount: row.session.guestCount,
      openedAt: row.session.openedAt,
      table: {
        id: row.table.id,
        code: row.table.code,
        area: row.area?.name ?? null,
        hasGrill: row.table.hasGrill,
        seatMax: row.table.seatMax,
      },
    }
  }

  /** P3 mở bàn */
  async openTable(
    tableId: number,
    input: { guestCount: number; note?: string | null },
    actor: Actor,
  ) {
    return this.db.transaction(async (tx) => {
      const [table] = await tx.select().from(tables).where(eq(tables.id, tableId))
      if (!table) throw new NotFoundException('Không có bàn này')
      if (!table.active) throw new ConflictException('Bàn đang ngừng sử dụng')
      if (input.guestCount > table.seatMax) {
        throw new ConflictException(
          `Bàn ${table.code} chỉ ngồi tối đa ${table.seatMax} khách`,
        )
      }

      const [branch] = await tx.select().from(branches).where(eq(branches.id, table.branchId))
      const now = new Date()

      let session
      try {
        ;[session] = await tx
          .insert(tableSessions)
          .values({
            branchId: table.branchId,
            tableId,
            status: 'open',
            guestCount: input.guestCount,
            note: input.note ?? null,
            openedBy: actor.kind === 'staff' ? actor.staffId : null,
            businessDate: businessDateOf(now, branch!.timezone),
          })
          .returning()
      } catch (err) {
        // Chặn bởi partial unique index "một phiên chưa đóng mỗi bàn"
        if (isUniqueViolation(err, 'table_sessions_one_live_per_table')) {
          throw new ConflictException(`Bàn ${table.code} đang có khách`)
        }
        throw err
      }

      await emit(tx, {
        branchId: table.branchId,
        topic: 'table.opened',
        rooms: [rooms.tables(table.branchId)],
        payload: { tableId, tableCode: table.code, sessionId: session!.id },
      })

      await this.audit.write(tx, {
        actor,
        action: 'table.opened',
        entity: 'table_session',
        entityId: String(session!.id),
        payload: { tableCode: table.code, guestCount: input.guestCount },
      })

      return session!
    })
  }

  /**
   * Cấp token QR cho phiên bàn (A3 in mã dán bàn · P3 khi mở bàn).
   *
   * Chỉ lưu bản băm; token trả về đúng MỘT LẦN để in ra mã QR. Muốn cấp lại thì
   * sinh token mới — token cũ chết ngay, nên khách bàn trước không đọc được đơn
   * của khách bàn sau.
   */
  async issueQrToken(sessionId: number, actor: Actor): Promise<{ token: string; url: string }> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, sessionId))
      if (!session) throw new NotFoundException('Không có phiên bàn này')
      if (session.status === 'closed') throw new ConflictException('Phiên bàn đã đóng')

      const token = newToken()
      await tx
        .update(tableSessions)
        .set({ qrTokenHash: hashToken(token) })
        .where(eq(tableSessions.id, sessionId))

      await this.audit.write(tx, {
        actor,
        action: 'table.qr-token.issued',
        entity: 'table_session',
        entityId: String(sessionId),
      })

      return { token, url: `/t/${token}` }
    })
  }

  /**
   * Đóng bàn sau khi khách trả đủ.
   *
   * Bàn KHÔNG tự đóng khi trả xong (§20): trả đủ thì chuyển "đã thanh toán, chờ
   * dọn", nhân viên dọn xong mới đóng. Token QR của khách chết đúng lúc này.
   */
  async closeSession(sessionId: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, sessionId))
      if (!session) throw new NotFoundException('Không có phiên bàn này')
      if (session.status === 'closed') return { sessionId, changed: false }

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.tableSessionId, sessionId))
      if (order && order.paymentState !== 'paid' && order.moneyTotal > 0) {
        throw new ConflictException({
          code: 'unpaid',
          message: 'Chưa thanh toán đủ — không đóng bàn được',
        })
      }

      await tx
        .update(tableSessions)
        .set({
          status: 'closed',
          closedAt: new Date(),
          closedBy: actor.kind === 'staff' ? actor.staffId : null,
          // Token QR chết theo phiên
          qrTokenHash: null,
        })
        .where(eq(tableSessions.id, sessionId))

      if (order) {
        await tx
          .update(orders)
          .set({ status: 'done', doneAt: new Date() })
          .where(and(eq(orders.id, order.id), sql`${orders.status} <> 'cancelled'`))
      }

      await emit(tx, {
        branchId: session.branchId,
        topic: 'table.paid',
        rooms: [rooms.tables(session.branchId), rooms.tableSession(sessionId)],
        payload: { sessionId, tableId: session.tableId },
      })

      await this.audit.write(tx, {
        actor,
        action: 'table.closed',
        entity: 'table_session',
        entityId: String(sessionId),
      })

      return { sessionId, changed: true }
    })
  }
}
