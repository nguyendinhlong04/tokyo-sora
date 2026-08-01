import { Controller, Get, Inject, Post, Query, Req } from '@nestjs/common'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import { outboxEvents } from '../../db/schema'
import type { RequestWithActor } from '../identity/auth.guard'
import { RealtimeTokenService } from './realtime-token.service'

const CatchUpQuery = z.object({
  after: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

@Controller('api/realtime')
export class RealtimeController {
  constructor(
    private readonly tokens: RealtimeTokenService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /**
   * Cấp token để client nối Supabase Realtime, kèm gợi ý kênh nên đăng ký.
   * Client xin lại khi sắp hết hạn.
   */
  @Post('token')
  issueToken(@Req() req: RequestWithActor) {
    return this.tokens.issue(req.actor!)
  }

  /**
   * Bắt kịp sự kiện đã lỡ.
   *
   * Quy tắc client là "refetch rồi mới stream": mỗi lần nối lại luôn tải lại dữ
   * liệu đang xem qua REST kèm mốc seq, rồi mới áp sự kiện live. Endpoint này cho
   * đường bắt kịp rẻ hơn khi chỉ hở vài sự kiện giữa chừng — không phải đường
   * đúng-đắn-cơ-bản, refetch mới là.
   *
   * Chỉ trả sự kiện của các kênh mà chính người gọi được phép nghe.
   */
  @Get('events')
  async catchUp(@Req() req: RequestWithActor, @Query() query: unknown) {
    const { after, limit } = CatchUpQuery.parse(query)
    const actor = req.actor!
    if (actor.kind === 'system') return { events: [], seq: after }

    const allowed = (await this.tokens.issue(actor)).rooms
    if (allowed.length === 0) return { events: [], seq: after }

    const rows = await this.db
      .select({
        seq: outboxEvents.id,
        topic: outboxEvents.topic,
        branchId: outboxEvents.branchId,
        payload: outboxEvents.payload,
        at: outboxEvents.createdAt,
      })
      .from(outboxEvents)
      .where(
        and(
          gt(outboxEvents.id, after),
          eq(outboxEvents.branchId, actor.branchId),
          // Giao nhau giữa kênh của sự kiện và kênh người gọi được nghe
          sql`${outboxEvents.rooms} && ${allowed}::text[]`,
        ),
      )
      .orderBy(asc(outboxEvents.id))
      .limit(limit)

    return {
      events: rows,
      seq: rows.length ? rows[rows.length - 1]!.seq : after,
      /** true nghĩa là còn nữa — client nên refetch toàn bộ thay vì đuổi tiếp */
      truncated: rows.length === limit,
    }
  }
}
