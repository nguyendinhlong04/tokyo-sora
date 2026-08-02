import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { HrService } from './hr.service'

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')

const Approval = z
  .object({
    approverStaffId: z.number().int().positive(),
    approverPin: z.string().min(4).max(6),
    reason: z.string().min(1).max(300),
  })
  .nullish()

const EmployeeBody = z.object({
  staffId: z.number().int().positive(),
  branchId: z.string().min(1),
  position: z.string().min(1).max(80),
  payKind: z.enum(['hourly', 'monthly']),
  hourlyRateVnd: z.number().int().min(0).default(0),
  monthlySalaryVnd: z.number().int().min(0).default(0),
  fixedAllowanceVnd: z.number().int().min(0).default(0),
  startedOn: BusinessDate,
  endedOn: BusinessDate.nullable().default(null),
  bankAccount: z.string().max(60).nullable().default(null),
  active: z.boolean().default(true),
})

const TemplateBody = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1).max(60),
  startMinute: z.number().int().min(0).max(24 * 60),
  endMinute: z.number().int().min(0).max(30 * 60),
  breakMinutes: z.number().int().min(0).max(480).default(0),
})

const WeekBody = z.object({
  branchId: z.string().min(1),
  weekStart: BusinessDate,
  employeeId: z.number().int().positive(),
  cells: z
    .array(
      z.object({
        workDate: BusinessDate,
        templateId: z.number().int().positive().nullable().default(null),
        startMinute: z.number().int().min(0).max(24 * 60),
        endMinute: z.number().int().min(0).max(30 * 60),
        breakMinutes: z.number().int().min(0).max(480).default(0),
        dayKind: z.enum(['thuong', 'nghi', 'le']).default('thuong'),
        note: z.string().max(200).nullable().default(null),
      }),
    )
    .max(7),
  approval: Approval,
})

const PeriodBody = z.object({
  branchId: z.string().min(1),
  periodStart: BusinessDate,
  periodEnd: BusinessDate,
})

const DraftBody = z.object({
  adjustments: z
    .array(
      z.object({
        employeeId: z.number().int().positive(),
        bonusVnd: z.number().int().min(0).optional(),
        advanceVnd: z.number().int().min(0).optional(),
        note: z.string().max(200).optional(),
      }),
    )
    .max(200)
    .default([]),
})

/**
 * Nhân sự — H1 · H2 · H7.
 *
 * Quyền lấy nguyên bảng §4.2b, vừa mã hoá ở `@sora/contracts`. Chỗ đáng chú ý
 * nhất là **nguyên tắc cứng thứ tư**: xếp lịch và xem công dùng `schedule.publish`
 * (quản lý ca R7 có), còn mọi thứ chạm tới con số lương dùng `payroll.*` (R7
 * KHÔNG có). Hai nhóm route tách hẳn nhau ở đây chính là cách nguyên tắc đó được
 * cưỡng chế thay vì chỉ được nhắc tới.
 *
 * Bốn bước cuối của kỳ lương mỗi bước một quyền khác nhau — trình (R13), kiểm
 * (R8), duyệt và phát (R10) — nên không ai một mình đưa được tiền ra khỏi quỹ.
 */
@Controller('api/hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  // ------------------------------------------------------------- H1

  @Get('employees')
  @RequirePermission('payroll.configure')
  employees(@Query('branch') branch: string) {
    return this.hr.employees(this.requireBranch(branch))
  }

  @Get('employees/candidates')
  @RequirePermission('payroll.configure')
  candidates(@Query('branch') branch: string) {
    return this.hr.staffWithoutRecord(this.requireBranch(branch))
  }

  @Post('employees')
  @RequirePermission('payroll.configure')
  createEmployee(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.hr.saveEmployee(EmployeeBody.parse(body), req.actor!)
  }

  @Put('employees/:id')
  @RequirePermission('payroll.configure')
  updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.hr.saveEmployee(EmployeeBody.parse(body), req.actor!, id)
  }

  // ------------------------------------------------------------- H2

  @Get('schedule')
  @RequirePermission('schedule.publish')
  week(@Query('branch') branch: string, @Query('week') week: string) {
    if (!week) throw new BadRequestException('Thiếu ngày đầu tuần')
    return this.hr.week(this.requireBranch(branch), BusinessDate.parse(week))
  }

  @Get('shift-templates')
  @RequirePermission('schedule.publish')
  templates(@Query('branch') branch: string) {
    return this.hr.shiftTemplates(this.requireBranch(branch))
  }

  @Post('shift-templates')
  @RequirePermission('schedule.publish')
  createTemplate(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.hr.createTemplate(TemplateBody.parse(body), req.actor!)
  }

  @Put('schedule')
  @RequirePermission('schedule.publish')
  setWeek(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId, weekStart, employeeId, cells, approval } = WeekBody.parse(body)
    return this.hr.setWeek(branchId, weekStart, employeeId, cells, req.actor!, approval)
  }

  @Post('schedule/publish')
  @RequirePermission('schedule.publish')
  publish(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId, weekStart } = WeekBody.pick({ branchId: true, weekStart: true }).parse(body)
    return this.hr.publishWeek(branchId, weekStart, req.actor!)
  }

  @Post('schedule/copy-previous')
  @RequirePermission('schedule.publish')
  copyPrevious(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId, weekStart } = WeekBody.pick({ branchId: true, weekStart: true }).parse(body)
    return this.hr.copyPreviousWeek(branchId, weekStart, req.actor!)
  }

  // ------------------------------------------------------------- H7

  @Get('payroll/periods')
  @RequirePermission('payroll.view-others')
  periods(@Query('branch') branch: string) {
    return this.hr.periods(this.requireBranch(branch))
  }

  @Get('payroll/periods/:id')
  @RequirePermission('payroll.view-others')
  periodLines(@Param('id', ParseIntPipe) id: number) {
    return this.hr.periodLines(id)
  }

  @Post('payroll/periods')
  @RequirePermission('payroll.configure')
  openPeriod(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.hr.openPeriod(PeriodBody.parse(body), req.actor!)
  }

  /** Bước 1 — chốt công. Sau bước này lịch của kỳ đóng băng */
  @Post('payroll/periods/:id/lock')
  @RequirePermission('timesheet.close-period')
  lock(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.hr.lockTimesheet(id, req.actor!)
  }

  /** Bước 2 — tính nháp, chạy lại được cho tới khi trình duyệt */
  @Post('payroll/periods/:id/compute')
  @RequirePermission('payroll.compute-draft')
  compute(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.hr.computeDraft(id, DraftBody.parse(body ?? {}).adjustments, req.actor!)
  }

  /** Bước 3 — R13 trình */
  @Post('payroll/periods/:id/submit')
  @RequirePermission('payroll.submit')
  submit(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.hr.advance(id, 'submitted', req.actor!)
  }

  /** Bước 4 — R8 kiểm */
  @Post('payroll/periods/:id/check')
  @RequirePermission('payroll.check')
  check(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.hr.advance(id, 'checked', req.actor!)
  }

  /** Bước 5 — R10 duyệt, rồi phát */
  @Post('payroll/periods/:id/approve')
  @RequirePermission('payroll.approve-pay')
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.hr.advance(id, 'approved', req.actor!)
  }

  @Post('payroll/periods/:id/pay')
  @RequirePermission('payroll.approve-pay')
  pay(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.hr.advance(id, 'paid', req.actor!)
  }

  /** Phiếu lương của chính mình — ai cũng có, không nhận id người khác */
  @Get('payroll/my-payslips')
  @RequirePermission('staff.view-own-record')
  myPayslips(@Req() req: RequestWithActor) {
    return this.hr.myPayslips(req.actor!)
  }

  private requireBranch(branch: string | undefined): string {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return branch
  }
}
