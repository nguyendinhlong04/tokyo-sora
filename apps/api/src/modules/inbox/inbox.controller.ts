import { Controller, Get, Inject, Req } from '@nestjs/common'
import { checkPermission, type InboxCounts } from '@sora/contracts'
import { and, eq, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import { feedback } from '../../db/schema'
import { actorRoles } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { DocumentsService } from '../org/documents.service'
import { OrgService, requireStaff } from '../org/org.service'
import { TasksService } from '../org/tasks.service'

/**
 * Hộp "Việc cần xử lý" — chỉ ĐẾM, không danh sách. Chuông ở Office và huy hiệu
 * trên thanh tab của Kênh nhân viên hỏi đây mỗi 60 giây (chưa có realtime).
 *
 * Module riêng chứ không nằm trong OrgModule: việc, báo cáo, KPI sau này đều cộng
 * số vào đây, mà các module đó lại import OrgModule — đặt hộp ở Org là vòng import.
 *
 * Đây cũng là điểm "bắt kịp" của những gì không có cron: sinh việc định kỳ của
 * hôm nay, đổi nhãn chức danh trên H1 khi quyết định bổ nhiệm tới ngày hiệu lực.
 */
@Controller('api/me')
export class InboxController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly org: OrgService,
    private readonly docs: DocumentsService,
    private readonly tasks: TasksService,
  ) {}

  @Get('inbox')
  @RequirePermission('staff.view-own-record')
  async inbox(@Req() req: RequestWithActor): Promise<InboxCounts> {
    const me = requireStaff(req.actor!)
    await this.org.syncTitles(this.db)
    const counts: InboxCounts = {
      documents: await this.docs.counts(me.staffId),
      tasks: await this.tasks.counts(me.staffId),
    }
    // Khiếu nại B13 đã nhận xử lý — hạn phản hồi đỏ trên hàng đợi thì chuông cũng phải đỏ
    if (checkPermission('feedback.respond', actorRoles(me)) !== 'deny') {
      const [row] = await this.db
        .select({
          assigned: sql<number>`count(*)::int`,
          overdue: sql<number>`count(*) FILTER (WHERE ${feedback.dueAt} < now())::int`,
        })
        .from(feedback)
        .where(and(eq(feedback.state, 'assigned'), eq(feedback.assignedTo, me.staffId)))
      counts.feedback = { assigned: row?.assigned ?? 0, overdue: row?.overdue ?? 0 }
    }
    return counts
  }
}
