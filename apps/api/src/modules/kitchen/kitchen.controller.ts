import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { KitchenService } from './kitchen.service'

const StateBody = z.object({ action: z.enum(['start', 'done', 'undo']) })

const AvailabilityBody = z.object({
  dishId: z.string().min(1),
  status: z.enum(['sold_out', 'limited', 'available']),
  remaining: z.number().int().min(0).nullish(),
})

@Controller('api')
@UseInterceptors(IdempotencyInterceptor)
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  /**
   * K2 hàng vé. Màn KDS ghim cứng một trạm lúc ghép thiết bị nên không cần truyền
   * `station` — lấy thẳng từ danh tính thiết bị, tránh việc màn này xem được vé
   * của trạm khác.
   */
  @Get('tickets')
  queue(
    @Req() req: RequestWithActor,
    @Query('branch') branchQuery?: string,
    @Query('station') stationQuery?: string,
  ) {
    const actor = req.actor!
    if (actor.kind === 'device') {
      if (!actor.stationId) throw new BadRequestException('Thiết bị chưa ghép vào trạm nào')
      return this.kitchen.queue(actor.branchId, actor.stationId)
    }
    if (actor.kind !== 'staff') throw new BadRequestException('Không đọc được hàng vé')
    if (!stationQuery) throw new BadRequestException('Thiếu tham số station')
    return this.kitchen.queue(branchQuery ?? actor.branchId, stationQuery)
  }

  /** K6 Expo — gom theo đơn, biết còn chờ trạm nào */
  @Get('expo')
  expo(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được expo')
    return this.kitchen.expo(branch ?? actor.branchId)
  }

  /** K2 bấm Bắt đầu / Xong / Hoàn tác */
  @Post('tickets/:id/state')
  @RequirePermission('kds.change-item-state')
  changeState(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.kitchen.changeTicketState(id, StateBody.parse(body).action, req.actor!)
  }

  /** K5 báo hết món */
  @Post('availability')
  @RequirePermission('menu.mark-sold-out')
  setAvailability(@Body() body: unknown, @Req() req: RequestWithActor) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đổi được')
    return this.kitchen.setAvailability(actor.branchId, AvailabilityBody.parse(body), actor)
  }

  /** Danh sách món đang hết / còn giới hạn — Table và POS gọi lúc khởi động */
  @Get('availability')
  availability(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    return this.kitchen.availability(branch ?? actor.branchId)
  }
}
