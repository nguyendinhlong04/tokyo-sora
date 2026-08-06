import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import { Public, TABLE_COOKIE, type RequestWithActor } from '../identity/auth.guard'
import { TableDeviceService } from './table-device.service'

const JoinBody = z.object({
  branchId: z.string().min(1).max(20),
  tableCode: z.string().min(1).max(20),
})

const DecideBody = z.object({
  deviceId: z.number().int().positive(),
  approve: z.boolean(),
})

const TransferBody = z.object({ toDeviceId: z.number().int().positive() })

/**
 * Cửa vào của khách tại bàn — LUONG-QR-BAN.md.
 *
 * Toàn bộ controller này `@Public` vì máy vừa quét mã CHƯA phải là khách đã vào
 * bàn: nó có thể đang đứng chờ duyệt. Danh tính ở đây là cookie của máy, và mỗi
 * hàm tự kiểm lấy quyền của mình — không mượn lớp xác thực chung, vì lớp đó chỉ
 * biết đến khách ĐÃ vào bàn.
 */
@Controller('api/table-devices')
@UseInterceptors(IdempotencyInterceptor)
export class TableDeviceController {
  constructor(private readonly devices: TableDeviceService) {}

  /** Khách quét mã dán bàn */
  @Public()
  @Post('join')
  async join(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = JoinBody.parse(body)
    const forwardedFor = req.headers['x-forwarded-for']
    const result = await this.devices.join({
      ...input,
      forwardedFor: typeof forwardedFor === 'string' ? forwardedFor : undefined,
    })

    reply.setCookie(TABLE_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // Không đặt hạn: máy chết theo bàn chứ không theo đồng hồ
    })

    return {
      deviceId: result.deviceId,
      sessionId: result.sessionId,
      branchId: result.branchId,
      state: result.state,
      isHost: result.isHost,
      tableCode: result.tableCode,
    }
  }

  /** Máy đang chờ hỏi lại "tôi được duyệt chưa" */
  @Public()
  @Get('me')
  async me(@Req() req: FastifyRequest) {
    const device = await this.self(req)
    return this.devices.status(device.deviceId)
  }

  /** Chủ bàn xem ai đang xin vào, kèm bối cảnh số khách */
  @Public()
  @Get('pending')
  async pending(@Req() req: RequestWithActor) {
    const device = await this.self(req)
    if (!device.isHost) throw new UnauthorizedException('Chỉ người mở bàn mới xem được')
    return this.devices.pending(device.sessionId)
  }

  /** Chủ bàn bấm Đồng ý / Từ chối */
  @Public()
  @Post('decide')
  async decide(@Body() body: unknown, @Req() req: FastifyRequest) {
    const input = DecideBody.parse(body)
    const device = await this.self(req)
    return this.devices.decide({
      deviceId: input.deviceId,
      approve: input.approve,
      actor: { kind: 'customer', tableSessionId: device.sessionId, branchId: device.branchId },
      byDeviceId: device.deviceId,
    })
  }

  /** Chủ bàn trao vai trước khi rời đi */
  @Public()
  @Post('transfer-host')
  async transferHost(@Body() body: unknown, @Req() req: FastifyRequest) {
    const input = TransferBody.parse(body)
    const device = await this.self(req)
    return this.devices.transferHost(device.deviceId, input.toDeviceId)
  }

  /** Cookie của máy → máy nào. Không có hoặc đã chết thì dừng ngay. */
  private async self(req: FastifyRequest) {
    const cookies = (req as FastifyRequest & { cookies?: Record<string, string> }).cookies
    const token = cookies?.[TABLE_COOKIE]
    if (!token) throw new UnauthorizedException('Chưa quét mã bàn')
    const device = await this.devices.resolveToken(token)
    if (!device) throw new UnauthorizedException('Bàn đã đóng hoặc mã không còn hiệu lực')
    return device
  }
}
