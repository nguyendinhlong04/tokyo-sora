import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { DeviceAdminService } from './device-admin.service'

const PrinterBody = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1).max(80),
  kind: z.enum(['bill', 'tem']),
  stationId: z.string().min(1).nullable(),
  host: z.string().min(1).max(120),
  port: z.number().int().min(1).max(65535).default(9100),
  template: z.string().min(1).max(40),
  copies: z.number().int().min(1).max(5).default(1),
  active: z.boolean().default(true),
})

/**
 * A4 · A5 — thiết bị và máy in.
 *
 * §4.2 không có dòng riêng cho hai màn này, nên dùng dòng quản trị duy nhất đang
 * có (`admin.manage-accounts-roles`) thay vì tự thêm quyền mới — cùng lập luận đã
 * ghi ở `admin.controller.ts`: đổi ma trận là việc của bản thiết kế.
 *
 * Sinh mã ghép KHÔNG nằm ở đây mà vẫn ở `POST /api/auth/pairing-codes`: cùng một
 * việc có hai cửa là hai cửa sẽ trôi lệch. Office gọi thẳng cửa cũ.
 */
@Controller('api/admin')
export class DeviceAdminController {
  constructor(private readonly hardware: DeviceAdminService) {}

  // ---------------------------------------------------------------- A4

  @Get('devices')
  @RequirePermission('admin.manage-accounts-roles')
  devices(@Query('branch') branch: string) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return this.hardware.devices(branch)
  }

  @Delete('devices/:id')
  @RequirePermission('admin.manage-accounts-roles')
  revokeDevice(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.hardware.revokeDevice(id, req.actor!)
  }

  // ---------------------------------------------------------------- A5

  @Get('printers')
  @RequirePermission('admin.manage-accounts-roles')
  printers(@Query('branch') branch: string) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return this.hardware.printers(branch)
  }

  @Post('printers')
  @RequirePermission('admin.manage-accounts-roles')
  createPrinter(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.hardware.createPrinter(PrinterBody.parse(body), req.actor!)
  }

  @Patch('printers/:id')
  @RequirePermission('admin.manage-accounts-roles')
  updatePrinter(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.hardware.updatePrinter(id, PrinterBody.partial().parse(body), req.actor!)
  }

  @Delete('printers/:id')
  @RequirePermission('admin.manage-accounts-roles')
  deletePrinter(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.hardware.deletePrinter(id, req.actor!)
  }
}
