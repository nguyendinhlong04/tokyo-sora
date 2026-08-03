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
import { assertOwnTableSession } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { PaymentsService } from './payments.service'
import { ReconcileService } from './reconcile.service'

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

/** P15 gán giao dịch chưa khớp vào bill của một bàn */
const AssignBody = z.object({
  sessionId: z.number().int().positive(),
})

/** Dải P16: shipper về nộp tiền COD */
const CodSettleBody = z.object({
  branchId: z.string().min(1),
  shipper: z.string().min(1).max(120),
  orderIds: z.array(z.number().int().positive()).min(1).max(100),
  receivedAmount: z.number().int().min(0).nullish(),
})

@Controller('api')
@UseInterceptors(IdempotencyInterceptor)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly recon: ReconcileService,
  ) {}

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

  /** P14 số liệu đóng ca — nhìn trước khi đếm két */
  @Get('shifts/:id/summary')
  @RequirePermission('shift.drawer-close-count')
  shiftSummary(@Param('id', ParseIntPipe) id: number) {
    return this.recon.shiftSummary(id)
  }

  /** P15 ba nhóm đối soát của một ngày kinh doanh */
  @Get('payments/reconcile')
  @RequirePermission('payment.reconcile-self-serve')
  reconcile(
    @Req() req: RequestWithActor,
    @Query('branch') branch?: string,
    @Query('date') date?: string,
  ) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    return this.recon.reconcile(branch ?? actor.branchId, date)
  }

  /** P15 chấp nhận khoản lệch — phần thiếu quán chịu, bill đóng lại */
  @Post('payments/:id/accept-mismatch')
  @RequirePermission('payment.reconcile-self-serve')
  acceptMismatch(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.recon.acceptMismatch(id, req.actor!)
  }

  /** P15 yêu cầu khách bù — phần thiếu vẫn nằm ở "còn phải thu" của bàn */
  @Post('payments/:id/request-topup')
  @RequirePermission('payment.reconcile-self-serve')
  requestTopUp(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.recon.requestTopUp(id, req.actor!)
  }

  /** P15 gán giao dịch chưa khớp vào bill */
  @Post('bank-events/:id/assign')
  @RequirePermission('payment.reconcile-self-serve')
  assignBankEvent(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.recon.assignBankEvent(id, AssignBody.parse(body).sessionId, req.actor!)
  }

  /** Dải P16 — sổ COD theo shipper */
  @Get('orders/cod')
  @RequirePermission('payment.reconcile-self-serve')
  codBook(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    return this.recon.codBook(branch ?? actor.branchId)
  }

  /** Dải P16 — shipper nộp tiền, tiền vào két ca đang mở */
  @Post('orders/cod/settle')
  @RequirePermission('shift.drawer-close-count')
  settleCod(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.recon.settleCod(CodSettleBody.parse(body), req.actor!)
  }

  /** P10 tạm tính · T10/T15 trên điện thoại khách */
  @Get('table-sessions/:id/bill')
  bill(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    assertOwnTableSession(req.actor!, id)
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
