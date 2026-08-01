import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, asc, eq } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import type { Db } from '../../db/client'
import { tableRequests, tableSessions, tables } from '../../db/schema'
import type { Actor } from '../identity/actor'

export type RequestKind = 'phuc-vu' | 'them-than' | 'da-nuoc' | 'tinh-tien' | 'khac'

const LABELS: Record<RequestKind, string> = {
  'phuc-vu': 'Gọi phục vụ',
  'them-than': 'Thêm than',
  'da-nuoc': 'Đá / nước',
  'tinh-tien': 'Xin tính tiền',
  khac: 'Khác',
}

@Injectable()
export class TableRequestService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Không nhận `actor`: quyền gọi cho bàn nào đã được controller kiểm, và bảng
   * không lưu người tạo — yêu cầu gọi phục vụ là việc thoáng qua, không phải thứ
   * cần truy vết. Thêm cột chỉ để "cho đủ" là thêm dữ liệu không ai đọc.
   */
  async create(sessionId: number, input: { kind: RequestKind; note?: string | null }) {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, sessionId))
      if (!session) throw new NotFoundException('Không có phiên bàn này')

      const [row] = await tx
        .insert(tableRequests)
        .values({
          branchId: session.branchId,
          tableSessionId: sessionId,
          kind: input.kind,
          note: input.note ?? null,
        })
        .returning()

      await emit(tx, {
        branchId: session.branchId,
        topic: 'table.request',
        rooms: [rooms.tables(session.branchId)],
        payload: {
          requestId: row!.id,
          sessionId,
          kind: input.kind,
          label: LABELS[input.kind],
        },
      })

      return { id: row!.id, kind: input.kind, label: LABELS[input.kind], createdAt: row!.createdAt }
    })
  }

  /**
   * Hàng đợi P12 — cũ nhất lên đầu vì đó là bàn chờ lâu nhất.
   * "Xin tính tiền" ghim lên trên cùng: khách đã muốn về, để họ đợi là mất điểm
   * nhiều nhất trong cả bữa.
   */
  async queue(branchId: string) {
    const rows = await this.db
      .select({
        id: tableRequests.id,
        sessionId: tableRequests.tableSessionId,
        kind: tableRequests.kind,
        note: tableRequests.note,
        createdAt: tableRequests.createdAt,
        tableCode: tables.code,
      })
      .from(tableRequests)
      .innerJoin(tableSessions, eq(tableSessions.id, tableRequests.tableSessionId))
      .innerJoin(tables, eq(tables.id, tableSessions.tableId))
      .where(and(eq(tableRequests.branchId, branchId), eq(tableRequests.state, 'open')))
      .orderBy(asc(tableRequests.createdAt))

    const withLabel = rows.map((r) => ({
      ...r,
      label: LABELS[r.kind as RequestKind] ?? r.kind,
      urgent: r.kind === 'tinh-tien',
    }))

    return {
      serverTime: new Date(),
      requests: [
        ...withLabel.filter((r) => r.urgent),
        ...withLabel.filter((r) => !r.urgent),
      ],
    }
  }

  async markDone(requestId: number, actor: Actor) {
    const [row] = await this.db
      .update(tableRequests)
      .set({
        state: 'done',
        handledBy: actor.kind === 'staff' ? actor.staffId : null,
        handledAt: new Date(),
      })
      .where(eq(tableRequests.id, requestId))
      .returning({ id: tableRequests.id })
    if (!row) throw new NotFoundException('Không có yêu cầu này')
    return { id: row.id, done: true }
  }
}
