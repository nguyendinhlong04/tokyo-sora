import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import { areas, tableSessions, tables } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { FloorplanService } from './floorplan.service'

/**
 * iPad gắn bàn (§9.1) — máy ghép `kind = 'table'`, ghim cứng một bàn.
 *
 * Máy không giữ phiên nào: mỗi lần hỏi là tra phiên đang sống của BÀN. Nhân viên
 * mở bàn ở POS thì iPad thấy ngay lần hỏi kế tiếp; đóng bàn thì iPad về màn bàn
 * chưa mở. Khách cũng tự mở bàn được ngay trên iPad (chốt 22/10/2026).
 */
@Injectable()
export class TableTerminalService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly floorplan: FloorplanService,
  ) {}

  /** Bàn của iPad đang gọi: bàn nào, đang mở chưa, có ai đặt sắp tới không */
  async state(tableId: number) {
    const [row] = await this.db
      .select({ table: tables, area: areas })
      .from(tables)
      .leftJoin(areas, eq(areas.id, tables.areaId))
      .where(eq(tables.id, tableId))
    if (!row) throw new NotFoundException('Không có bàn này')
    const { table } = row

    const [live] = await this.db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, tableId), sql`${tableSessions.status} <> 'closed'`))
    const session = live ? await this.floorplan.sessionSummary(live.id) : null
    const reservation = session ? null : await this.floorplan.upcomingReservationOf(table)

    return {
      branchId: table.branchId,
      table: {
        id: table.id,
        code: table.code,
        area: row.area?.name ?? null,
        hasGrill: table.hasGrill,
        seatMin: table.seatMin,
        seatMax: table.seatMax,
        active: table.active,
      },
      session,
      // Chỉ GIỜ đặt — tên người đặt không lên màn hình đặt giữa phòng ăn
      reservedAt: reservation?.slotAt ?? null,
    }
  }

  /**
   * T1: khách tự mở bàn.
   *
   * Đông hơn sức chứa thì vẫn mở với đúng sức chứa của bàn và báo lại cho iPad gọi
   * nhân viên ghép thêm bàn — khách đã ngồi xuống rồi, bắt họ đứng chờ trước một
   * màn báo lỗi là cách tệ nhất để bắt đầu bữa ăn.
   */
  async open(tableId: number, guestCount: number, actor: Actor) {
    const [table] = await this.db.select().from(tables).where(eq(tables.id, tableId))
    if (!table) throw new NotFoundException('Không có bàn này')

    try {
      await this.floorplan.openTable(tableId, { guestCount: Math.min(guestCount, table.seatMax) }, actor)
    } catch (err) {
      const body = err instanceof ConflictException ? (err.getResponse() as { code?: string }) : null
      if (body?.code === 'table_reserved') {
        // Lỗi gốc kèm tên người đặt — viết lại, iPad không được nói tên khách khác
        const reservation = await this.floorplan.upcomingReservationOf(table)
        throw new ConflictException({
          code: 'table_reserved',
          message: `Bàn ${table.code} đã có khách đặt${
            reservation ? ` lúc ${hhmm(reservation.slotAt)}` : ''
          } — nhân viên sẽ tới xếp bàn giúp bạn`,
          reservedAt: reservation?.slotAt ?? null,
        })
      }
      // Nhân viên vừa mở bàn ở POS đúng lúc khách chạm: bàn ĐÃ mở — đúng điều khách muốn
      const live = await this.state(tableId)
      if (!live.session) throw err
    }

    return { ...(await this.state(tableId)), overCapacity: guestCount > table.seatMax }
  }
}

const hhmm = (at: Date) =>
  at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
