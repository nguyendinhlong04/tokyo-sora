import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import { Public, type RequestWithActor } from '../identity/auth.guard'
import { SplitPaymentService } from './split-payment.service'

const SplitBody = z.object({ parts: z.number().int().min(2).max(20) })
const ClaimBody = z.object({ orderLineIds: z.array(z.number().int().positive()).min(1).max(100) })
const QrBody = z.object({ amount: z.number().int().min(1) })

@Controller('api')
@UseInterceptors(IdempotencyInterceptor)
export class SplitPaymentController {
  constructor(private readonly split: SplitPaymentService) {}

  /** T11 xem trước các phần khi chia đều */
  @Post('table-sessions/:id/split/preview')
  preview(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    this.assertOwnTable(req, id)
    return this.split.previewEvenSplit(id, SplitBody.parse(body).parts)
  }

  /** T12 nhận các món mình trả */
  @Post('table-sessions/:id/split/claim')
  claim(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    this.assertOwnTable(req, id)
    return this.split.claimLines(id, ClaimBody.parse(body).orderLineIds, req.actor!)
  }

  /** T13 tạo VietQR cho một số tiền */
  @Post('table-sessions/:id/pay/vietqr')
  vietqr(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    this.assertOwnTable(req, id)
    return this.split.createVietQr(id, QrBody.parse(body).amount, req.actor!)
  }

  /**
   * T14 màn chờ hỏi lại trạng thái.
   *
   * Khách bấm "Đã chuyển xong" chỉ đổi màn hình sang chờ; chính endpoint này mới
   * cho biết ngân hàng đã báo về hay chưa.
   */
  @Get('payments/:id/status')
  status(@Param('id', ParseIntPipe) id: number) {
    return this.split.paymentStatus(id)
  }

  /**
   * Webhook ngân hàng.
   *
   * Public vì ngân hàng không có phiên đăng nhập của quán — chữ ký HMAC trên raw
   * body mới là thứ chứng minh danh tính. Đọc rawBody chứ không đọc object đã
   * parse: chữ ký ký trên chuỗi byte gốc.
   */
  @Public()
  @Post('webhooks/bank')
  webhook(@Req() req: FastifyRequest) {
    const raw = (req as FastifyRequest & { rawBody?: string }).rawBody
    if (typeof raw !== 'string') {
      throw new BadRequestException('Không đọc được nội dung gốc của webhook')
    }
    return this.split.handleBankWebhook(raw, req.headers)
  }

  /** Khách chỉ thao tác được trên bàn của chính mình */
  private assertOwnTable(req: RequestWithActor, sessionId: number) {
    const actor = req.actor!
    if (actor.kind === 'customer' && actor.tableSessionId !== sessionId) {
      throw new BadRequestException('Không thanh toán cho bàn khác được')
    }
  }
}
