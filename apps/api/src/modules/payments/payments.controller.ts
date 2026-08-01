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
import { PaymentsService } from './payments.service'

const OpenShiftBody = z.object({
  branchId: z.string().min(1),
  openingCash: z.number().int().min(0),
})

const CloseShiftBody = z.object({
  countedCash: z.number().int().min(0),
  note: z.string().max(300).nullish(),
})

const CashBody = z.object({
  amount: z.number().int().min(1),
  tendered: z.number().int().min(0).nullish(),
})

@Controller('api')
@UseInterceptors(IdempotencyInterceptor)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** P1 mở ca */
  @Post('shifts')
  @RequirePermission('shift.drawer-close-count')
  openShift(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.payments.openShift(OpenShiftBody.parse(body), req.actor!)
  }

  /** P14 đóng ca — đối chiếu quỹ */
  @Post('shifts/:id/close')
  @RequirePermission('shift.drawer-close-count')
  closeShift(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.payments.closeShift(id, CloseShiftBody.parse(body), req.actor!)
  }

  @Get('shifts/open')
  openShiftOf(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    return this.payments.openShiftOf(branch ?? actor.branchId)
  }

  /** P10 tạm tính */
  @Get('table-sessions/:id/bill')
  bill(@Param('id', ParseIntPipe) id: number) {
    return this.payments.bill(id)
  }

  /** P10/P11 thu tiền mặt */
  @Post('table-sessions/:id/pay/cash')
  @RequirePermission('payment.reconcile-self-serve')
  payCash(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.payments.payCash(id, CashBody.parse(body), req.actor!)
  }
}
