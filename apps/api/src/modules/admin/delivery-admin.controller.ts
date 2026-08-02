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
import { DeliveryAdminService } from './delivery-admin.service'

const ZoneSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1).max(120),
  wards: z.array(z.string().min(1).max(120)).min(1).max(80),
  feeVnd: z.number().int().min(0),
  minOrderVnd: z.number().int().min(0),
  etaMinutes: z.number().int().min(1).max(240),
  active: z.boolean(),
  sort: z.number().int().min(0).max(999),
})

/**
 * O10 — Vùng giao & phí.
 *
 * Gắn `admin.manage-accounts-roles` như các màn cấu hình khác: phí giao và đơn
 * tối thiểu là thứ ảnh hưởng thẳng tới tiền của mỗi đơn.
 */
@Controller('api/admin/delivery-zones')
export class DeliveryAdminController {
  constructor(private readonly zones: DeliveryAdminService) {}

  @Get()
  @RequirePermission('admin.manage-accounts-roles')
  list(@Query('branch') branch: string) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return this.zones.list(branch)
  }

  @Post()
  @RequirePermission('admin.manage-accounts-roles')
  create(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.zones.create(ZoneSchema.parse(body), req.actor!)
  }

  @Patch(':id')
  @RequirePermission('admin.manage-accounts-roles')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.zones.update(id, ZoneSchema.partial().parse(body), req.actor!)
  }

  @Delete(':id')
  @RequirePermission('admin.manage-accounts-roles')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.zones.remove(id, req.actor!)
  }
}
