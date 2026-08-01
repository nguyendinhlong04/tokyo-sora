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
  Res,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import { assertOwnTableSession } from '../identity/actor'
import { Public, TABLE_COOKIE, type RequestWithActor } from '../identity/auth.guard'
import { IdentityService } from '../identity/identity.service'
import { RequirePermission } from '../identity/permission.guard'
import { FeedbackService } from './feedback.service'
import { FloorplanService } from './floorplan.service'
import { TableRequestService } from './table-request.service'

const ExchangeBody = z.object({ token: z.string().min(10) })

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
    private readonly identity: IdentityService,
    private readonly requests: TableRequestService,
    private readonly feedbackService: FeedbackService,
  ) {}

  /** P3: in mã QR dán bàn cho khách quét */
  @Post('table-sessions/:id/qr-token')
  @RequirePermission('order.create')
  issueQr(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.floorplan.issueQrToken(id, req.actor!)
  }

  /**
   * T1: khách quét QR, app đổi ngay token trong URL lấy cookie httpOnly.
   *
   * Public vì lúc này khách chưa có danh tính nào — chính token là thứ chứng minh
   * họ đang ngồi ở bàn đó. Sau bước này app phải xoá token khỏi thanh địa chỉ:
   * URL bị chụp màn hình, dán vào nhóm chat, lưu vào lịch sử trình duyệt — còn
   * cookie httpOnly thì không.
   */
  @Public()
  @Post('table-sessions/exchange')
  async exchange(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const { token } = ExchangeBody.parse(body)
    const actor = await this.identity.resolveTableToken(token)
    if (!actor || actor.kind !== 'customer') {
      throw new UnauthorizedException('Mã bàn không đúng hoặc bàn đã đóng')
    }

    reply.setCookie(TABLE_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // Không đặt hạn: phiên chết theo bàn chứ không theo đồng hồ. Khách ngồi lâu
      // hơn dự kiến không bị đá ra giữa bữa.
    })

    return { sessionId: actor.tableSessionId, branchId: actor.branchId }
  }

  /** T1: điện thoại khách hỏi "tôi đang ngồi bàn nào" sau khi có cookie */
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
    // Khách chỉ gọi được cho CHÍNH bàn mình — không gọi hộ bàn khác
    if (actor.kind === 'customer' && actor.tableSessionId !== id) {
      throw new BadRequestException('Không gửi yêu cầu cho bàn khác được')
    }
    return this.requests.create(id, RequestBody.parse(body))
  }

  /** P12: hàng đợi yêu cầu, cũ nhất lên đầu */
  @Get('table-requests')
  queue(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    return this.requests.queue(branch ?? actor.branchId)
  }

  /** P12: nhân viên đánh dấu đã xử lý */
  @Post('table-requests/:id/done')
  @RequirePermission('order.create')
  handleRequest(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.requests.markDone(id, req.actor!)
  }
}
