import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { ChannelService } from './channel.service'

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')

/**
 * H8 · H9 — Kênh nhân viên.
 *
 * Cả nhóm route dùng đúng một quyền, `staff.view-own-record`, và đó là quyền duy
 * nhất phiên `self` đi qua được (xem PermissionGuard). Nói cách khác: cái link
 * gửi qua Zalo mở được đúng nhóm route này và không mở thêm được gì.
 *
 * Không route nào nhận `employeeId` hay `branch` — người gọi là ai thì đọc từ
 * phiên. Gửi yêu cầu nghỉ vẫn đi qua `POST /api/hr/leaves` của H5 (cùng hàng đợi
 * duyệt), chốt chặn "chỉ gửi cho chính mình" nằm trong service của route đó.
 */
@Controller('api/hr/me')
export class ChannelController {
  constructor(private readonly channel: ChannelService) {}

  @Get()
  @RequirePermission('staff.view-own-record')
  me(@Req() req: RequestWithActor) {
    return this.channel.me(req.actor!)
  }

  @Get('schedule')
  @RequirePermission('staff.view-own-record')
  schedule(@Req() req: RequestWithActor, @Query('week') week: string) {
    if (!week) throw new BadRequestException('Thiếu ngày đầu tuần')
    return this.channel.week(req.actor!, BusinessDate.parse(week))
  }

  @Get('timesheet')
  @RequirePermission('staff.view-own-record')
  timesheet(@Req() req: RequestWithActor, @Query('from') from: string, @Query('to') to: string) {
    return this.channel.timesheet(req.actor!, BusinessDate.parse(from), BusinessDate.parse(to))
  }

  @Get('leaves')
  @RequirePermission('staff.view-own-record')
  leaves(@Req() req: RequestWithActor) {
    return this.channel.leaves(req.actor!)
  }

  @Get('colleagues')
  @RequirePermission('staff.view-own-record')
  colleagues(@Req() req: RequestWithActor) {
    return this.channel.colleagues(req.actor!)
  }
}
