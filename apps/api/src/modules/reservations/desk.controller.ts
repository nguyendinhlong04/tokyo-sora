import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { ReservationDeskService } from './desk.service'
import { ReservationsService } from './reservations.service'

const AssignBody = z.object({ tableId: z.number().int().positive().nullable() })
const NoteBody = z.object({ note: z.string().max(300).nullable() })
const ArriveBody = z.object({ tableId: z.number().int().positive().nullish() })
const CancelBody = z.object({ reason: z.string().min(1).max(300) })

const StaffCreateBody = z.object({
  branchId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minute: z.number().int().min(0).max(2880),
  guestCount: z.number().int().min(1).max(50),
  seatKind: z.enum(['standard', 'grill', 'private']),
  name: z.string().min(1).max(120),
  phone: z.string().min(8).max(20),
  note: z.string().max(300).nullish(),
})

/**
 * R1 · R2 · R4 · P13 — quầy đặt bàn trên POS.
 *
 * Đọc thì cả ca đọc được (phục vụ nào cũng cần biết tối nay bàn nào có khách
 * đặt). Ghi trạng thái — xác nhận, đã đến, no-show, huỷ — thì gắn quyền
 * `reservation.confirm-or-noshow`: no-show là con số đi vào quyết định có bắt
 * đặt cọc hay không, không phải nút ai bấm cũng được.
 */
@Controller('api/desk/reservations')
@UseInterceptors(IdempotencyInterceptor)
export class ReservationDeskController {
  constructor(
    private readonly desk: ReservationDeskService,
    private readonly reservations: ReservationsService,
  ) {}

  /** R1 bảng trục giờ · P13 danh sách hôm nay (cùng một nguồn) */
  @Get()
  board(@Req() req: RequestWithActor, @Query('branch') branch?: string, @Query('date') date?: string) {
    return this.desk.board(this.branchOf(req, branch), date)
  }

  /** R4 — suất quá giờ hẹn mà chưa thấy khách */
  @Get('late')
  late(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    return this.desk.late(this.branchOf(req, branch))
  }

  /** R4 — tỉ lệ no-show theo nguồn đặt */
  @Get('no-show-stats')
  stats(
    @Req() req: RequestWithActor,
    @Query('branch') branch?: string,
    @Query('days') days?: string,
  ) {
    const parsed = days ? Number(days) : 30
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      throw new BadRequestException('Khoảng ngày không hợp lệ')
    }
    return this.desk.noShowStats(this.branchOf(req, branch), parsed)
  }

  /** R2 chi tiết */
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.desk.detail(id)
  }

  /** R2 gán bàn — truyền `null` để bỏ gán */
  @Patch(':id/table')
  assign(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.desk.assignTable(id, AssignBody.parse(body).tableId, req.actor!)
  }

  /** R2 ghi chú (dị ứng, sinh nhật) */
  @Patch(':id/note')
  note(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.desk.setNote(id, NoteBody.parse(body).note, req.actor!)
  }

  /** R2 duyệt tay suất đang chờ */
  @Post(':id/confirm')
  @RequirePermission('reservation.confirm-or-noshow')
  confirm(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.desk.confirm(id, req.actor!)
  }

  /** R2 · P13 "Đã đến" — mở phiên bàn và giao lại cho vòng vận hành tại bàn */
  @Post(':id/arrive')
  @RequirePermission('reservation.confirm-or-noshow')
  arrive(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.desk.arrive(id, ArriveBody.parse(body ?? {}), req.actor!)
  }

  /** R4 · R2 đánh no-show */
  @Post(':id/no-show')
  @RequirePermission('reservation.confirm-or-noshow')
  noShow(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.desk.noShow(id, req.actor!)
  }

  /** R2 huỷ, luôn kèm lý do */
  @Post(':id/cancel')
  @RequirePermission('reservation.confirm-or-noshow')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.desk.cancel(id, CancelBody.parse(body).reason, req.actor!)
  }

  /**
   * R2 — nhân viên đặt hộ qua điện thoại.
   *
   * Đi qua ĐÚNG đường kiểm của khách web: cùng lưới khung giờ, cùng phép đếm sức
   * chứa. Nhân viên nghe điện thoại không nhìn thấy bàn trống rõ hơn máy chủ, và
   * một suất nhận bừa vẫn là một suất không có bàn.
   */
  @Post()
  @RequirePermission('reservation.confirm-or-noshow')
  create(@Body() body: unknown, @Req() req: RequestWithActor) {
    const input = StaffCreateBody.parse(body)
    return this.reservations.confirm({ ...input, source: 'phone' }, req.actor!)
  }

  private branchOf(req: RequestWithActor, branch?: string): string {
    const actor = req.actor!
    if (branch) return branch
    if (actor.kind === 'system') throw new BadRequestException('Thiếu mã chi nhánh')
    return actor.branchId
  }
}
