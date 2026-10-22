import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import { assertOwnTableSession, isTableDevice } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { FeedbackService } from './feedback.service'
import { FloorplanService } from './floorplan.service'
import { TableRequestService } from './table-request.service'

const RequestBody = z.object({
  kind: z.enum(['phuc-vu', 'them-than', 'da-nuoc', 'tinh-tien', 'khac']),
  note: z.string().max(300).nullish(),
})

const GuestsBody = z.object({ guestCount: z.number().int().min(1).max(50) })

const FeedbackBody = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(1000).nullish(),
})

@Controller('api')
@UseInterceptors(IdempotencyInterceptor)
export class TableSessionController {
  constructor(
    private readonly floorplan: FloorplanService,
    private readonly requests: TableRequestService,
    private readonly feedbackService: FeedbackService,
  ) {}

  /** T1: tóm tắt một phiên bàn — iPad chỉ đọc được phiên của chính bàn nó */
  @Get('table-sessions/:id')
  session(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    assertOwnTableSession(req.actor!, id)
    return this.floorplan.sessionSummary(id)
  }

  /** T1: khách chốt lại bàn mình mấy người */
  @Post('table-sessions/:id/guests')
  @RequirePermission('order.create')
  setGuests(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    assertOwnTableSession(req.actor!, id)
    return this.floorplan.setGuestCount(id, GuestsBody.parse(body).guestCount, req.actor!)
  }

  /** T15: khách chấm sao và nhận xét */
  @Post('table-sessions/:id/feedback')
  feedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    assertOwnTableSession(req.actor!, id)
    return this.feedbackService.submit(id, FeedbackBody.parse(body))
  }

  @Get('table-sessions/:id/feedback')
  getFeedback(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    assertOwnTableSession(req.actor!, id)
    return this.feedbackService.of(id)
  }

  /** T9: khách gọi nhân viên */
  @Post('table-sessions/:id/requests')
  createRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const actor = req.actor!
    // Khách chỉ gọi được cho CHÍNH bàn mình — không gọi hộ bàn khác. iPad của bàn
    // chưa mở thì chưa có bàn nào để gọi cho
    if ((actor.kind === 'customer' && actor.tableSessionId !== id) || isTableDevice(actor)) {
      throw new BadRequestException('Không gửi yêu cầu cho bàn khác được')
    }
    return this.requests.create(id, RequestBody.parse(body))
  }

  /** P12: hàng đợi yêu cầu, cũ nhất lên đầu */
  @Get('table-requests')
  queue(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    // Hàng đợi là yêu cầu của cả sàn — iPad chỉ biết yêu cầu của bàn mình
    if (actor.kind === 'customer' || isTableDevice(actor)) {
      throw new ForbiddenException('iPad tại bàn không xem hàng đợi của sàn')
    }
    return this.requests.queue(branch ?? actor.branchId)
  }

  /** P12: nhân viên đánh dấu đã xử lý */
  @Post('table-requests/:id/done')
  @RequirePermission('order.create')
  handleRequest(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.requests.markDone(id, req.actor!)
  }
}
