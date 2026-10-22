import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common'
import { InvoiceBuyerSchema } from '@sora/contracts'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import { EinvoiceService } from '../einvoice/einvoice.service'
import { TaxCodesService } from '../einvoice/tax-codes.service'
import { Public } from '../identity/auth.guard'
import type { Actor } from '../identity/actor'
import { SplitPaymentService } from '../payments/split-payment.service'
import { OnlineService } from './online.service'

const LineBody = z.object({
  dishId: z.string().min(1),
  qty: z.number().int().min(1).max(99),
  note: z.string().max(300).nullish(),
  modifierOptionIds: z.array(z.string()).max(20).optional(),
  setSelections: z
    .array(z.object({ groupId: z.string(), dishIds: z.array(z.string()) }))
    .optional(),
})

const CreateBody = z.object({
  branchId: z.string().min(1),
  type: z.enum(['takeaway', 'delivery']),
  customer: z.object({
    name: z.string().min(1).max(120),
    phone: z.string().min(8).max(20),
    address: z.string().max(300).nullish(),
    ward: z.string().max(120).nullish(),
    note: z.string().max(300).nullish(),
    /** O5 "Xuất hoá đơn công ty" — không bắt buộc */
    invoiceBuyer: InvoiceBuyerSchema.nullish(),
  }),
  lines: z.array(LineBody).min(1).max(50),
  slotMode: z.enum(['asap', 'scheduled']),
  slotAt: z.string().nullish(),
})

/** null = "Bán cho người tiêu dùng" */
const BuyerBody = z.object({ buyer: InvoiceBuyerSchema.nullable() })

/** IP của khách: Vercel ghi đè `x-real-ip` / `x-forwarded-for`, không tự khai được */
function clientIp(req: FastifyRequest): string {
  const real = req.headers['x-real-ip']
  if (typeof real === 'string' && real) return real
  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return first || req.ip
}

/** Khách web: không tài khoản, không thiết bị — chỉ biết họ đang đặt ở chi nhánh nào */
const guestOf = (branchId: string): Actor => ({ kind: 'guest', branchId })

/**
 * Luồng đặt món online của khách (O1 → O7).
 *
 * Toàn bộ là `@Public`: khách web không có tài khoản, không có thiết bị ghép.
 * Thứ bảo vệ đơn của họ là mã theo dõi ngẫu nhiên trả về lúc đặt, không phải
 * phiên đăng nhập.
 */
@Controller('api/online')
@UseInterceptors(IdempotencyInterceptor)
export class OnlineController {
  constructor(
    private readonly online: OnlineService,
    private readonly payments: SplitPaymentService,
    private readonly einvoice: EinvoiceService,
    private readonly taxCodes: TaxCodesService,
  ) {}

  /** O1: chi nhánh đang bán online */
  @Public()
  @Get('branches')
  branches() {
    return this.online.branches()
  }

  /** O2: thực đơn online của chi nhánh */
  @Public()
  @Get('menu')
  menu(@Query('branch') branch: string) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return this.online.menu(branch)
  }

  /** O1: vùng giao đang phục vụ */
  @Public()
  @Get('zones')
  zones(@Query('branch') branch: string) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return this.online.zones(branch)
  }

  /** O1: nhập phường → phí ship, đơn tối thiểu, thời gian dự kiến */
  @Public()
  @Get('quote')
  quote(@Query('branch') branch: string, @Query('ward') ward: string) {
    if (!branch || !ward) throw new BadRequestException('Thiếu chi nhánh hoặc phường/xã')
    return this.online.quote(branch, ward)
  }

  /** O4: khung giờ còn nhận được đơn */
  @Public()
  @Get('slots')
  slots(@Query('branch') branch: string, @Query('type') type?: string) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    // Đơn giao ngừng nhận sớm hơn đơn mang về nên khung giờ hỏi theo kiểu nhận
    return this.online.slots(branch, type === 'delivery' ? 'delivery' : 'takeaway')
  }

  /** O6: đặt đơn */
  @Public()
  @Post('orders')
  create(@Body() body: unknown) {
    const input = CreateBody.parse(body)
    return this.online.create(input, guestOf(input.branchId))
  }

  /**
   * O13: khách chọn trả trước bằng VietQR.
   *
   * Nhận mã theo dõi chứ không nhận mã đơn: mã đơn đoán được, và một người tạo
   * được lượt trả cho đơn của người khác thì họ đọc được số tiền của đơn đó.
   */
  @Public()
  @Post('track/:token/pay/vietqr')
  async pay(@Param('token') token: string) {
    const order = await this.online.orderIdOfTrackToken(token)
    return this.payments.createOrderVietQr(order.id, guestOf(order.branchId))
  }

  /**
   * O5: khách gõ MST công ty là điền sẵn tên, địa chỉ. Công khai nên chỉ trả tên,
   * địa chỉ, tình trạng; giới hạn theo IP. Sau proxy Vercel, IP lấy từ header của
   * Vercel — sai thì nhiều khách chung một hạn mức, không ai đọc được gì thêm.
   */
  @Public()
  @Get('tax-codes/:code')
  lookupTaxCode(@Param('code') code: string, @Req() req: FastifyRequest) {
    return this.taxCodes.lookup(code, { key: `ip:${clientIp(req)}`, staff: false })
  }

  /** O7: theo dõi đơn bằng mã trả về lúc đặt */
  @Public()
  @Get('track/:token')
  track(@Param('token') token: string) {
    return this.online.track(token)
  }

  /**
   * O7: khách bổ sung hay sửa thông tin xuất hoá đơn sau khi đặt — được tới lúc
   * hoá đơn phát hành. Cũng mở bằng mã theo dõi, như lượt trả tiền.
   */
  @Public()
  @Put('track/:token/invoice-buyer')
  async setInvoiceBuyer(@Param('token') token: string, @Body() body: unknown) {
    const { buyer } = BuyerBody.parse(body)
    const order = await this.online.orderIdOfTrackToken(token)
    return this.einvoice.setBuyerForOrder(order.id, buyer, guestOf(order.branchId))
  }
}
