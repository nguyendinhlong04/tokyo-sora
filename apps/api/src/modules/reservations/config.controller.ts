import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { ReservationsService } from './reservations.service'

const BlockBody = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(200),
})

/**
 * R3 — cấu hình nhận đặt, phần không phải là một con số.
 *
 * Khung giờ, thời lượng bữa, trần suất và tiền cọc đều là tham số nên chúng đi
 * qua A6 (`/api/admin/parameters`). Riêng danh sách ngày chặn là dữ liệu vận
 * hành — mỗi dòng một ngày và một lý do — nên có đường riêng ở đây.
 *
 * Cùng quyền với A6: đóng cửa nhận đặt một ngày là quyết định của chủ quán, không
 * phải của người trực bàn.
 */
@Controller('api/admin/reservations')
export class ReservationConfigController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('blocked-days')
  @RequirePermission('admin.manage-accounts-roles')
  list(@Query('branch') branch?: string) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return this.reservations.listBlockedDays(branch)
  }

  @Post('blocked-days')
  @RequirePermission('admin.manage-accounts-roles')
  block(@Query('branch') branch: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    const input = BlockBody.parse(body)
    return this.reservations.blockDay(branch, input.day, input.reason, req.actor!)
  }

  @Delete('blocked-days/:id')
  @RequirePermission('admin.manage-accounts-roles')
  unblock(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.reservations.unblockDay(id, req.actor!)
  }
}
