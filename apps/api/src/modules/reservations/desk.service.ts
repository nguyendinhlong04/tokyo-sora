import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms, WS_TOPICS } from '@sora/contracts'
import { and, asc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import type { Db } from '../../db/client'
import { areas, branches, reservations, tables, tableSessions } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { FloorplanService } from '../ordering/floorplan.service'

/** Suất còn nằm trên bảng — huỷ và no-show rời khỏi trục giờ */
const LIVE_STATUSES = ['pending', 'confirmed', 'seated', 'done']

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'done'
  | 'cancelled'
  | 'no_show'

/**
 * Quầy đặt bàn trên POS — R1 bảng trục giờ · R2 chi tiết · R4 quá giờ · P13 hôm nay.
 *
 * Tách khỏi `ReservationsService` (phía khách) đúng như `dispatch` tách khỏi
 * `online`: hai bên nhìn cùng một bảng nhưng hỏi hai câu khác nhau. Khách hỏi
 * "còn chỗ không"; nhân viên hỏi "tối nay ai đến, ngồi đâu, ai chưa tới".
 */
@Injectable()
export class ReservationDeskService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly audit: AuditService,
    private readonly floorplan: FloorplanService,
  ) {}

  // ------------------------------------------------------------------ R1 · P13

  /**
   * Mọi suất của một ngày, kèm sơ đồ bàn để dựng trục giờ.
   *
   * Trả cả bàn lẫn suất trong MỘT lượt: bảng R1 là lưới bàn × giờ, thiếu một
   * trong hai thì máy trạm phải tự ghép từ hai lần gọi và hai lần đó có thể lệch
   * nhau vài giây ngay giữa giờ cao điểm.
   */
  async board(branchId: string, date?: string) {
    const branch = await this.branch(branchId)
    const businessDate = date ?? businessDateOf(new Date(), branch.timezone)

    const [rows, tableRows] = await Promise.all([
      this.db
        .select()
        .from(reservations)
        .where(
          and(eq(reservations.branchId, branchId), eq(reservations.businessDate, businessDate)),
        )
        .orderBy(asc(reservations.slotAt)),
      this.db
        .select({ table: tables, area: areas })
        .from(tables)
        .leftJoin(areas, eq(areas.id, tables.areaId))
        .where(and(eq(tables.branchId, branchId), eq(tables.active, true)))
        .orderBy(asc(areas.sort), asc(tables.code)),
    ])

    return {
      branchId,
      businessDate,
      tables: tableRows.map(({ table, area }) => ({
        id: table.id,
        code: table.code,
        area: area?.name ?? null,
        kind: table.kind,
        hasGrill: table.hasGrill,
        seatMax: table.seatMax,
      })),
      reservations: rows.map((r) => this.view(r)),
      /** Đồng hồ máy chủ — máy trạm không tự quyết suất nào đã quá giờ */
      serverNow: new Date().toISOString(),
      lateAfterMinutes: await this.params.getNumber(
        'reservation.tableHoldMinutes',
        15,
        branchId,
      ),
    }
  }

  /** R2 — một suất, kèm lịch sử của số điện thoại đó */
  async detail(id: number) {
    const row = await this.byId(id)
    const history = await this.db
      .select({ status: reservations.status })
      .from(reservations)
      .where(
        and(
          eq(reservations.branchId, row.branchId),
          eq(reservations.customerPhone, row.customerPhone),
          lt(reservations.id, row.id),
        ),
      )

    return {
      ...this.view(row),
      history: {
        visits: history.filter((h) => h.status === 'seated' || h.status === 'done').length,
        noShows: history.filter((h) => h.status === 'no_show').length,
      },
      /** Bàn còn nhận được suất này: đúng kiểu chỗ, đủ sức chứa, không chồng giờ */
      fittingTables: await this.fittingTables(row),
    }
  }

  // ------------------------------------------------------------------ R2 thao tác

  /**
   * Gán bàn cho một suất.
   *
   * Kiểm ba thứ, theo đúng thứ tự khách quan tâm: bàn có đúng kiểu chỗ đã hứa
   * không, có đủ chỗ ngồi không, và giờ đó bàn có đang dành cho ai khác không.
   * Bỏ qua bất kỳ cái nào cũng ra một lời hứa không giữ được.
   */
  async assignTable(id: number, tableId: number | null, actor: Actor) {
    const row = await this.byId(id)

    if (tableId !== null) {
      const [table] = await this.db.select().from(tables).where(eq(tables.id, tableId))
      if (!table || table.branchId !== row.branchId) throw new NotFoundException('Không có bàn này')
      if (table.kind !== row.seatKind) {
        throw new ConflictException({
          code: 'wrong_seat_kind',
          message: `Khách đặt ${seatName(row.seatKind)}, bàn ${table.code} là ${seatName(table.kind)}`,
        })
      }
      if (table.seatMax < row.guestCount) {
        throw new ConflictException({
          code: 'table_too_small',
          message: `Bàn ${table.code} chỉ ngồi ${table.seatMax} khách, suất này ${row.guestCount} khách`,
        })
      }

      const clash = await this.clashOn(tableId, row)
      if (clash) {
        throw new ConflictException({
          code: 'table_busy',
          message: `Bàn ${table.code} đã dành cho ${clash.customerName} lúc ${hhmm(clash.slotAt)}`,
        })
      }
    }

    await this.db.update(reservations).set({ tableId }).where(eq(reservations.id, id))
    await this.write(actor, 'reservation.table.assigned', row.id, {
      from: row.tableId,
      to: tableId,
    })
    return this.detail(id)
  }

  /** R2 sửa ghi chú — dị ứng và sinh nhật là thứ bếp phải biết trước khi khách tới */
  async setNote(id: number, note: string | null, actor: Actor) {
    const row = await this.byId(id)
    await this.db
      .update(reservations)
      .set({ note: note?.trim() || null })
      .where(eq(reservations.id, id))
    await this.write(actor, 'reservation.note.changed', row.id, { note })
    return this.detail(id)
  }

  /** R2 · duyệt tay: chi nhánh bật chế độ duyệt thì suất web nằm chờ ở đây */
  async confirm(id: number, actor: Actor) {
    const row = await this.byId(id)
    if (row.status !== 'pending') {
      throw new ConflictException(`Suất này đang ở trạng thái ${statusName(row.status)}`)
    }
    await this.db
      .update(reservations)
      .set({ status: 'confirmed', confirmedAt: new Date() })
      .where(eq(reservations.id, id))
    await this.write(actor, 'reservation.confirmed', row.id, {})
    await this.broadcast(row.branchId, id, 'confirmed')
    return this.detail(id)
  }

  /**
   * "Đã đến" — chuyển suất thành phiên bàn thật.
   *
   * Đây là chỗ đặt chỗ giao lại cho vòng vận hành tại bàn: từ giây này trở đi
   * mọi thứ đi qua phiên bàn (P4 gọi món, P10 tính tiền). Ghi chú của khách đi
   * theo sang phiên để bếp đọc được mà không phải mở lại màn đặt chỗ.
   */
  async arrive(id: number, input: { tableId?: number | null }, actor: Actor) {
    const row = await this.byId(id)
    if (row.status === 'seated') throw new ConflictException('Suất này đã mở bàn rồi')
    if (row.status === 'cancelled' || row.status === 'no_show') {
      throw new ConflictException(`Suất đã ${statusName(row.status)}, không mở bàn được`)
    }

    const tableId = input.tableId ?? row.tableId
    if (!tableId) throw new BadRequestException('Chưa gán bàn cho suất này')
    if (tableId !== row.tableId) await this.assignTable(id, tableId, actor)

    /**
     * `ignoreReservation` ở đây KHÔNG phải mở đè: chính suất này đang giữ bàn,
     * và người đặt vừa bước vào cửa. Không có cờ này thì cảnh báo P3 chặn đúng
     * cái luồng mà nó sinh ra để bảo vệ.
     */
    const session = await this.floorplan.openTable(
      tableId,
      { guestCount: row.guestCount, note: row.note, ignoreReservation: true },
      actor,
    )

    await this.db
      .update(reservations)
      .set({ status: 'seated', seatedAt: new Date(), tableId })
      .where(eq(reservations.id, id))
    await this.write(actor, 'reservation.seated', row.id, { sessionId: session.id, tableId })
    await this.broadcast(row.branchId, id, 'seated')

    return { reservation: await this.detail(id), sessionId: session.id }
  }

  /**
   * No-show.
   *
   * Chỉ đánh được khi đã QUÁ giờ hẹn cộng thời gian giữ bàn — đánh sớm là cướp
   * suất của khách đang trên đường, và con số no-show sau này dùng để quyết định
   * có bắt đặt cọc hay không.
   */
  async noShow(id: number, actor: Actor) {
    const row = await this.byId(id)
    if (row.status === 'seated') throw new ConflictException('Khách đã ngồi bàn rồi')
    if (row.status === 'no_show') return this.detail(id)

    const holdMinutes = await this.params.getNumber(
      'reservation.tableHoldMinutes',
      15,
      row.branchId,
    )
    const dueAt = row.slotAt.getTime() + holdMinutes * 60_000
    if (Date.now() < dueAt) {
      throw new ConflictException({
        code: 'too_early',
        message: `Còn giữ bàn tới ${hhmm(new Date(dueAt))} — chưa đánh no-show được`,
      })
    }

    await this.db
      .update(reservations)
      .set({ status: 'no_show', cancelledAt: new Date() })
      .where(eq(reservations.id, id))
    await this.write(actor, 'reservation.no-show', row.id, { slotAt: row.slotAt })
    await this.broadcast(row.branchId, id, 'no_show')
    return this.detail(id)
  }

  /** Huỷ — luôn kèm lý do, vì suất trả về lưới và khách có thể gọi lại hỏi */
  async cancel(id: number, reason: string, actor: Actor) {
    const row = await this.byId(id)
    if (row.status === 'seated') throw new ConflictException('Khách đã ngồi bàn rồi')

    await this.db
      .update(reservations)
      .set({ status: 'cancelled', cancelReason: reason, cancelledAt: new Date() })
      .where(eq(reservations.id, id))
    await this.write(actor, 'reservation.cancelled', row.id, { reason })
    await this.broadcast(row.branchId, id, 'cancelled')
    return this.detail(id)
  }

  // ------------------------------------------------------------------------ R4

  /**
   * Suất quá giờ mà chưa thấy khách — thứ nhân viên phải gọi ngay.
   *
   * Đây là nửa làm được của R4. Nửa còn lại (hàng đợi nhắc hẹn 24h/2h qua
   * Messenger/Zalo) cần kênh gửi tin ở Mục 30.3, chưa dựng — dựng một bảng nhắc
   * không có ai gửi thì chỉ là một danh sách trang trí.
   */
  async late(branchId: string) {
    const branch = await this.branch(branchId)
    const businessDate = businessDateOf(new Date(), branch.timezone)
    const holdMinutes = await this.params.getNumber('reservation.tableHoldMinutes', 15, branchId)
    const now = new Date()

    const rows = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.branchId, branchId),
          eq(reservations.businessDate, businessDate),
          inArray(reservations.status, ['pending', 'confirmed']),
          lte(reservations.slotAt, now),
        ),
      )
      .orderBy(asc(reservations.slotAt))

    return {
      serverNow: now.toISOString(),
      holdMinutes,
      rows: rows.map((r) => ({
        ...this.view(r),
        lateMinutes: Math.floor((now.getTime() - r.slotAt.getTime()) / 60_000),
        /** Quá hạn giữ bàn thì mới bấm no-show được — khớp luật ở `noShow()` */
        canNoShow: now.getTime() >= r.slotAt.getTime() + holdMinutes * 60_000,
      })),
    }
  }

  /** Tỉ lệ no-show theo nguồn đặt — dữ liệu để quyết có bắt đặt cọc hay không */
  async noShowStats(branchId: string, days = 30) {
    const from = new Date(Date.now() - days * 86_400_000)
    const rows = await this.db
      .select({
        source: reservations.source,
        status: reservations.status,
        count: sql<number>`count(*)::int`,
      })
      .from(reservations)
      .where(and(eq(reservations.branchId, branchId), gte(reservations.createdAt, from)))
      .groupBy(reservations.source, reservations.status)

    const sources = [...new Set(rows.map((r) => r.source))]
    return {
      days,
      sources: sources.map((source) => {
        const mine = rows.filter((r) => r.source === source)
        const total = mine
          .filter((r) => r.status !== 'cancelled')
          .reduce((sum, r) => sum + Number(r.count), 0)
        const noShow = mine
          .filter((r) => r.status === 'no_show')
          .reduce((sum, r) => sum + Number(r.count), 0)
        return {
          source,
          total,
          noShow,
          rate: total === 0 ? 0 : Math.round((noShow / total) * 1000) / 10,
        }
      }),
    }
  }

  // --------------------------------------------------------------------- P2 · P3

  /**
   * Đặt chỗ sắp tới của từng bàn — nguồn cho nhãn `Đặt 19:00` trên P2 và cảnh
   * báo khi mở bàn ở P3.
   */
  async upcomingByTable(branchId: string, withinMinutes = 90) {
    const now = new Date()
    const until = new Date(now.getTime() + withinMinutes * 60_000)

    const rows = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.branchId, branchId),
          inArray(reservations.status, ['pending', 'confirmed']),
          sql`${reservations.tableId} IS NOT NULL`,
          gte(reservations.endAt, now),
          lte(reservations.slotAt, until),
        ),
      )
      .orderBy(asc(reservations.slotAt))

    const byTable = new Map<number, ReturnType<typeof this.view>>()
    for (const row of rows) {
      if (!byTable.has(row.tableId!)) byTable.set(row.tableId!, this.view(row))
    }
    return byTable
  }

  // ------------------------------------------------------------------- tiện ích

  private view(row: typeof reservations.$inferSelect) {
    return {
      id: row.id,
      displayCode: row.displayCode,
      status: row.status as ReservationStatus,
      seatKind: row.seatKind,
      guestCount: row.guestCount,
      slotAt: row.slotAt.toISOString(),
      endAt: row.endAt.toISOString(),
      tableId: row.tableId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      note: row.note,
      source: row.source,
      cancelReason: row.cancelReason,
    }
  }

  /** Suất khác đang chiếm bàn đó trong khoảng thời gian chồng lấn */
  private async clashOn(tableId: number, row: typeof reservations.$inferSelect) {
    const [clash] = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.tableId, tableId),
          inArray(reservations.status, LIVE_STATUSES),
          sql`${reservations.id} <> ${row.id}`,
          lt(reservations.slotAt, row.endAt),
          sql`${reservations.endAt} > ${row.slotAt}`,
        ),
      )
      .orderBy(asc(reservations.slotAt))
    return clash ?? null
  }

  /** Bàn gán được: đúng kiểu chỗ, đủ chỗ, không chồng suất khác, chưa có khách ngồi */
  private async fittingTables(row: typeof reservations.$inferSelect) {
    const candidates = await this.db
      .select({ table: tables, area: areas, session: tableSessions })
      .from(tables)
      .leftJoin(areas, eq(areas.id, tables.areaId))
      .leftJoin(
        tableSessions,
        and(eq(tableSessions.tableId, tables.id), sql`${tableSessions.status} <> 'closed'`),
      )
      .where(
        and(
          eq(tables.branchId, row.branchId),
          eq(tables.active, true),
          eq(tables.kind, row.seatKind),
          gte(tables.seatMax, row.guestCount),
        ),
      )
      .orderBy(asc(tables.code))

    const out = []
    for (const { table, area, session } of candidates) {
      const clash = await this.clashOn(table.id, row)
      out.push({
        id: table.id,
        code: table.code,
        area: area?.name ?? null,
        seatMax: table.seatMax,
        free: clash === null,
        /** Bàn đang có khách vẫn gán được cho suất tối nay — họ sẽ đứng dậy */
        occupiedNow: session !== null,
        takenBy: clash ? `${clash.customerName} · ${hhmm(clash.slotAt)}` : null,
      })
    }
    return out
  }

  private async broadcast(branchId: string, id: number, status: string) {
    await this.db.transaction(async (tx) => {
      await emit(tx, {
        branchId,
        topic: WS_TOPICS.reservationCreated,
        rooms: [rooms.tables(branchId)],
        payload: { reservationId: id, status },
      })
    })
  }

  private async write(actor: Actor, action: string, id: number, payload: Record<string, unknown>) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, {
        actor,
        action,
        entity: 'reservation',
        entityId: String(id),
        payload,
      })
    })
  }

  private async byId(id: number) {
    const [row] = await this.db.select().from(reservations).where(eq(reservations.id, id))
    if (!row) throw new NotFoundException('Không có đặt chỗ này')
    return row
  }

  private async branch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return branch
  }
}

function seatName(kind: string): string {
  return { standard: 'bàn thường', grill: 'bàn nướng có bếp', private: 'phòng riêng' }[kind] ?? kind
}

function statusName(status: string): string {
  return (
    {
      pending: 'chờ xác nhận',
      confirmed: 'đã xác nhận',
      seated: 'đã đến',
      done: 'đã xong',
      cancelled: 'huỷ',
      no_show: 'no-show',
    }[status] ?? status
  )
}

/** Giờ treo tường Việt Nam — quán và nhân viên cùng một múi giờ */
function hhmm(at: Date): string {
  return at.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
}
