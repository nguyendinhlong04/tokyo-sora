import { Body, Controller, Delete, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { PHONE_ERROR, isPhone, normalizePhone } from '@sora/contracts'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import { Public } from '../identity/auth.guard'
import { ReservationsService } from './reservations.service'

const SeatKind = z.enum(['standard', 'grill', 'private'])

const SlotRef = z.object({
  branchId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.coerce.number().int().min(1).max(50),
  seatKind: SeatKind,
  minute: z.number().int().min(0).max(2880),
})

const HoldBody = SlotRef

/**
 * Chuẩn hoá TRƯỚC khi kiểm, nên thứ xuống tới bảng là một dạng duy nhất.
 *
 * CRM ghép lịch sử khách bằng chính chuỗi này sau khi bỏ ký tự không phải số
 * (`customers.service`), nên `0912 345 678` và `+84912345678` mà lưu nguyên văn
 * là hai bản ghi cho một người.
 */
const PhoneField = z.string().max(30).transform(normalizePhone).refine(isPhone, PHONE_ERROR)

const ConfirmBody = SlotRef.extend({
  name: z.string().min(1).max(120),
  phone: PhoneField,
  note: z.string().max(300).nullish(),
  holdToken: z.string().max(200).nullish(),
})

/**
 * Đặt bàn của khách web (W6).
 *
 * Toàn bộ `@Public`: khách không có tài khoản. Thứ bảo vệ suất đang giữ là mã
 * ngẫu nhiên trả về lúc giữ chỗ, không phải phiên đăng nhập.
 */
@Controller('api/reservations')
@UseInterceptors(IdempotencyInterceptor)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  /** W6 bước 2 — lưới khung giờ theo sức chứa thật */
  @Public()
  @Get('availability')
  availability(
    @Query('branch') branchId: string,
    @Query('date') date: string,
    @Query('guests') guests: string,
    @Query('seat') seat: string,
  ) {
    const query = SlotRef.omit({ minute: true }).parse({
      branchId,
      date,
      guestCount: guests,
      seatKind: seat,
    })
    return this.reservations.availability(query)
  }

  /** W6 bước 3 mở ra — giữ mềm suất trong lúc khách điền thông tin */
  @Public()
  @Post('holds')
  hold(@Body() body: unknown) {
    return this.reservations.hold(HoldBody.parse(body))
  }

  /** Khách bấm Quay lại — trả suất về lưới ngay */
  @Public()
  @Delete('holds/:token')
  release(@Param('token') token: string) {
    return this.reservations.releaseHold(token)
  }

  /** W6 — chốt đặt chỗ, trả mã cho khách */
  @Public()
  @Post()
  confirm(@Body() body: unknown) {
    return this.reservations.confirm(ConfirmBody.parse(body))
  }

  /** Khách mở lại suất của mình từ liên kết nhắc hẹn (R4) — cùng lối `online/track/:token` */
  @Public()
  @Get('track/:token')
  track(@Param('token') token: string) {
    return this.reservations.byGuestToken(token)
  }

  /** R4 — khách xác nhận lại bằng một chạm */
  @Public()
  @Post('track/:token/confirm')
  reconfirm(@Param('token') token: string) {
    return this.reservations.reconfirm(token)
  }
}
