import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { TimesheetService } from './timesheet.service'

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
const HhMm = z.string().regex(/^\d{1,2}:\d{2}$/, 'Giờ phải có dạng HH:MM')

const Approval = z
  .object({
    approverStaffId: z.number().int().positive(),
    approverPin: z.string().min(4).max(6),
    reason: z.string().min(1).max(300),
  })
  .nullish()

const ManualBody = z.object({
  branchId: z.string().min(1),
  employeeId: z.number().int().positive(),
  workDate: BusinessDate,
  clockIn: HhMm,
  clockOut: HhMm.nullable().default(null),
  breakMinutes: z.number().int().min(0).max(480).default(0),
  reason: z.string().min(1).max(300),
  approval: Approval,
})

const LeaveBody = z.object({
  branchId: z.string().min(1),
  employeeId: z.number().int().positive(),
  kind: z.enum(['nghi-phep', 'nghi-khong-luong', 'nghi-om', 'doi-ca']),
  fromDate: BusinessDate,
  toDate: BusinessDate,
  counterpartId: z.number().int().positive().nullable().default(null),
  reason: z.string().min(1).max(300),
})

const DecisionBody = z.object({
  branchId: z.string().min(1),
  approve: z.boolean(),
  note: z.string().max(300).nullable().default(null),
})

const DeleteBody = z.object({
  branchId: z.string().min(1),
  reason: z.string().min(1).max(300),
})

/**
 * H3 · H4 · H5 · H10 — công thực tế.
 *
 * Quyền chia đúng nguyên tắc cứng thứ tư của §4.2b: xem và sửa CÔNG dùng
 * `schedule.publish` / `timesheet.edit-manual` (quản lý ca R7 có), còn LƯƠNG thì
 * ở nhóm route khác mà R7 không mở được. Quản lý ca phải sửa được giờ vào của
 * nhân viên mình mà không nhìn thấy người ta lĩnh bao nhiêu.
 *
 * `timesheet.edit-manual` là dấu △ với R7 nên service bắt buộc gọi ApprovalService
 * — guard chỉ chặn `deny`, không tự đòi PIN người duyệt.
 */
@Controller('api/hr')
export class TimesheetController {
  constructor(private readonly timesheets: TimesheetService) {}

  // ---------------------------------------------------------------- H3

  @Get('attendance')
  @RequirePermission('schedule.publish')
  board(@Query('branch') branch: string, @Query('date') date: string) {
    return this.timesheets.board(this.requireBranch(branch), BusinessDate.parse(date))
  }

  // ---------------------------------------------------------------- H4

  @Get('timesheet')
  @RequirePermission('schedule.publish')
  monthly(
    @Query('branch') branch: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.timesheets.monthly(
      this.requireBranch(branch),
      BusinessDate.parse(from),
      BusinessDate.parse(to),
    )
  }

  @Post('timesheet')
  @RequirePermission('timesheet.edit-manual')
  saveManual(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId, approval, ...input } = ManualBody.parse(body)
    return this.timesheets.saveManual(branchId, input, req.actor!, approval)
  }

  @Delete('timesheet/:id')
  @RequirePermission('timesheet.edit-manual')
  deleteEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { branchId, reason } = DeleteBody.parse(body)
    return this.timesheets.deleteEntry(branchId, id, reason, req.actor!)
  }

  // ---------------------------------------------------------------- H5

  @Get('leaves')
  @RequirePermission('schedule.publish')
  leaves(@Query('branch') branch: string, @Query('state') state?: string) {
    return this.timesheets.leaves(this.requireBranch(branch), state ?? null)
  }

  /**
   * Gửi yêu cầu. Dùng `staff.view-own-record` chứ không phải quyền quản lý: đây
   * là cửa mà chính nhân viên xin nghỉ (H8 gọi cùng route này), còn duyệt thì ở
   * route dưới với quyền khác hẳn.
   */
  @Post('leaves')
  @RequirePermission('staff.view-own-record')
  createLeave(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId, ...input } = LeaveBody.parse(body)
    return this.timesheets.createLeave(branchId, input, req.actor!)
  }

  @Post('leaves/:id/decision')
  @RequirePermission('schedule.publish')
  decideLeave(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { branchId, ...decision } = DecisionBody.parse(body)
    return this.timesheets.decideLeave(branchId, id, decision, req.actor!)
  }

  // --------------------------------------------------------------- H10

  /**
   * Kiosk chấm công.
   *
   * Chi nhánh lấy từ THIẾT BỊ đang gọi, không nhận từ thân yêu cầu: "thiết bị gắn
   * chi nhánh — không chấm từ ngoài" (§26 H10) chỉ có nghĩa nếu chỗ này không tin
   * vào cái máy khách gửi lên.
   *
   * Quyền `staff.view-own-record` — mỗi nhân viên vận hành đều có. Người bấm đã
   * phải nhập PIN của chính họ để có phiên, nên actor ở đây chính là người chấm.
   */
  @Post('punch')
  @RequirePermission('staff.view-own-record')
  punch(@Req() req: RequestWithActor) {
    const actor = req.actor!
    if (actor.kind !== 'staff') {
      throw new BadRequestException('Chấm công cần đăng nhập bằng PIN của chính mình')
    }
    if (actor.deviceId === null) {
      throw new BadRequestException(
        'Chấm công chỉ thực hiện được trên kiosk đã ghép của chi nhánh',
      )
    }
    return this.timesheets.punch(actor.branchId, actor.staffId, actor)
  }

  private requireBranch(branch: string): string {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return branch
  }
}
