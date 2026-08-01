import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import { tableFeedback, tableSessions } from '../../db/schema'

@Injectable()
export class FeedbackService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * T15 khách chấm sao sau bữa ăn.
   *
   * Ghi đè phiếu cũ của cùng phiên bàn: khách bấm nhầm 2 sao rồi sửa thành 5 thì
   * quán cần ý kiến CUỐI của bữa đó, không phải hai dòng mâu thuẫn nhau. Không
   * ràng buộc "phải trả tiền xong mới được chấm" — người bỏ về giữa chừng vì
   * phục vụ chậm là ý kiến đáng nghe nhất.
   */
  async submit(sessionId: number, input: { stars: number; comment?: string | null }) {
    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      throw new BadRequestException('Số sao phải từ 1 đến 5')
    }

    const [session] = await this.db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId))
    if (!session) throw new NotFoundException('Không có phiên bàn này')

    const row = {
      branchId: session.branchId,
      tableSessionId: sessionId,
      stars: input.stars,
      comment: input.comment?.trim() || null,
      businessDate: session.businessDate,
    }

    const [saved] = await this.db
      .insert(tableFeedback)
      .values(row)
      .onConflictDoUpdate({
        target: tableFeedback.tableSessionId,
        set: { stars: row.stars, comment: row.comment, updatedAt: new Date() },
      })
      .returning({ id: tableFeedback.id, stars: tableFeedback.stars })

    return { id: saved!.id, stars: saved!.stars }
  }

  /** Phiếu của phiên bàn này, để màn hoá đơn hiện lại đúng số sao đã chấm */
  async of(sessionId: number) {
    const [row] = await this.db
      .select({
        stars: tableFeedback.stars,
        comment: tableFeedback.comment,
      })
      .from(tableFeedback)
      .where(eq(tableFeedback.tableSessionId, sessionId))
    return row ?? null
  }
}
