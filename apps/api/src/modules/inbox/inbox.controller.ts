import { Controller, Get, Req } from '@nestjs/common'
import type { InboxCounts } from '@sora/contracts'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { DocumentsService } from '../org/documents.service'
import { requireStaff } from '../org/org.service'

/**
 * Hộp "Việc cần xử lý" — chỉ ĐẾM, không danh sách. Chuông ở Office và huy hiệu
 * trên thanh tab của Kênh nhân viên hỏi đây mỗi 60 giây (chưa có realtime).
 *
 * Module riêng chứ không nằm trong OrgModule: việc, báo cáo, KPI sau này đều cộng
 * số vào đây, mà các module đó lại import OrgModule — đặt hộp ở Org là vòng import.
 */
@Controller('api/me')
export class InboxController {
  constructor(private readonly docs: DocumentsService) {}

  @Get('inbox')
  @RequirePermission('staff.view-own-record')
  async inbox(@Req() req: RequestWithActor): Promise<InboxCounts> {
    const me = requireStaff(req.actor!)
    return { documents: await this.docs.counts(me.staffId) }
  }
}
