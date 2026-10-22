import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common'
import {
  TASK_CHECKLIST_MAX,
  TASK_ENTITIES,
  TASK_MONTH_DAY_MAX,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
} from '@sora/contracts'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { TasksService } from './tasks.service'

const Id = z.number().int().positive()
const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
const Reason = z.string().trim().min(1, 'Ghi lý do').max(300)
const Note = z.string().trim().max(2000)

const Attachment = z.object({
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => /^https:\/\/\S+$/.test(u), 'Đường dẫn đính kèm phải bắt đầu bằng https://'),
})

const Checklist = z.array(z.string().trim().min(1).max(200)).max(TASK_CHECKLIST_MAX)

const TaskBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    note: Note.nullable().default(null),
    priority: z.enum(TASK_PRIORITIES).default('thuong'),
    assigneeStaffIds: z.array(Id).min(1, 'Chọn ít nhất một người nhận').max(50),
    /** Bỏ trống = người giao tự nghiệm thu; null = nộp là xong */
    reviewerStaffId: Id.nullable().optional(),
    dueAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    checklist: Checklist.default([]),
    attachments: z.array(Attachment).max(10).default([]),
    entity: z.enum(TASK_ENTITIES).nullable().default(null),
    entityId: Id.nullable().default(null),
  })
  .refine((b) => (b.entity === null) === (b.entityId === null), {
    path: ['entityId'],
    message: 'Nguồn của việc phải có cả loại và mã',
  })

const TaskPatchBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    note: Note.nullable(),
    priority: z.enum(TASK_PRIORITIES),
    dueAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    attachments: z.array(Attachment).max(10),
  })
  .partial()

const ReviewBody = z.object({ accept: z.boolean(), note: Note.nullable().default(null) })
const CancelBody = z.object({ reason: Reason })
const CheckBody = z.object({
  idx: z
    .number()
    .int()
    .min(0)
    .max(TASK_CHECKLIST_MAX - 1),
  checked: z.boolean(),
})
const SubmitBody = z.object({
  note: Note.nullable().default(null),
  attachments: z.array(Attachment).max(10).nullable().default(null),
})

const TemplateBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    note: Note.nullable().default(null),
    checklist: Checklist.min(1, 'SOP cần ít nhất một mục kiểm'),
    assigneePositionId: Id,
    reviewerPositionId: Id.nullable().default(null),
    recurrence: z.enum(TASK_RECURRENCES),
    weekday: z.number().int().min(1).max(7).nullable().default(null),
    monthDay: z.number().int().min(1).max(TASK_MONTH_DAY_MAX).nullable().default(null),
    shiftTemplateId: Id.nullable().default(null),
    dueMinute: z.number().int().min(0).max(1800).nullable().default(null),
    priority: z.enum(TASK_PRIORITIES).default('thuong'),
    documentId: Id.nullable().default(null),
    startsOn: BusinessDate.nullable().default(null),
    active: z.boolean().default(true),
  })
  .superRefine((b, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message })
    }
    need(
      (b.recurrence === 'hang-tuan') === (b.weekday !== null),
      'weekday',
      'Việc hằng tuần chọn thứ; lịch khác thì không',
    )
    need(
      (b.recurrence === 'hang-thang') === (b.monthDay !== null),
      'monthDay',
      'Việc hằng tháng chọn ngày; lịch khác thì không',
    )
    need(
      (b.recurrence === 'theo-ca') === (b.shiftTemplateId !== null),
      'shiftTemplateId',
      'Việc theo ca chọn ca mẫu; lịch khác thì không',
    )
    need(b.recurrence === 'theo-ca' || b.dueMinute !== null, 'dueMinute', 'Chọn giờ hạn')
    need(
      b.reviewerPositionId === null || b.reviewerPositionId !== b.assigneePositionId,
      'reviewerPositionId',
      'Ghế nghiệm thu phải khác ghế làm',
    )
  })

const ListQuery = z.object({
  view: z.enum(['assigned', 'unit', 'to-review', 'sop']).default('assigned'),
  from: BusinessDate.optional(),
  to: BusinessDate.optional(),
  branch: z.string().min(1).optional(),
  date: BusinessDate.optional(),
})

/**
 * Giao việc (N5), việc định kỳ & SOP (N6) và việc "của tôi" (N1 Office, N12 Kênh
 * nhân viên).
 *
 * Giao, sửa, huỷ, nghiệm thu ở Office cần `task.assign` — giao được cho AI thì
 * sơ đồ quyết. Nhận việc, tích checklist, nộp việc đi qua khoá "của mình" nên
 * Kênh nhân viên làm được; nghiệm thu ở Kênh nhân viên chỉ khi được chỉ định.
 */
@Controller('api/org')
@UseInterceptors(IdempotencyInterceptor)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('tasks')
  @RequirePermission('task.assign')
  list(@Query() query: Record<string, string>, @Req() req: RequestWithActor) {
    const q = ListQuery.parse(query)
    return this.tasks.list(req.actor!, {
      view: q.view,
      from: q.from,
      to: q.to,
      branchId: q.branch,
      date: q.date,
    })
  }

  @Get('tasks/assignees')
  @RequirePermission('task.assign')
  assignees(@Req() req: RequestWithActor) {
    return this.tasks.assignable(req.actor!)
  }

  @Get('tasks/:id')
  @RequirePermission('task.assign')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.tasks.detail(req.actor!, id)
  }

  @Post('tasks')
  @RequirePermission('task.assign')
  create(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.tasks.create(req.actor!, TaskBody.parse(body))
  }

  @Put('tasks/:id')
  @RequirePermission('task.assign')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.tasks.update(req.actor!, id, TaskPatchBody.parse(body))
  }

  @Post('tasks/:id/review')
  @RequirePermission('task.assign')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { accept, note } = ReviewBody.parse(body)
    return this.tasks.review(req.actor!, id, accept, note, false)
  }

  @Post('tasks/:id/cancel')
  @RequirePermission('task.assign')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.tasks.cancel(req.actor!, id, CancelBody.parse(body).reason)
  }

  // ------------------------------------------------------------- Mẫu định kỳ

  @Get('task-templates')
  @RequirePermission('task.assign')
  templates(@Query('branch') branch: string | undefined, @Req() req: RequestWithActor) {
    // `?branch=van-phong` = mẫu của văn phòng (không chi nhánh); bỏ trống = tất cả
    return this.tasks.templates(req.actor!, branch === 'van-phong' ? null : branch)
  }

  @Get('task-templates/shifts')
  @RequirePermission('task.assign')
  shifts(@Query('branch') branch: string, @Req() req: RequestWithActor) {
    return this.tasks.shifts(req.actor!, z.string().min(1, 'Chọn chi nhánh').parse(branch))
  }

  @Post('task-templates')
  @RequirePermission('task.assign')
  createTemplate(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.tasks.createTemplate(req.actor!, TemplateBody.parse(body))
  }

  @Put('task-templates/:id')
  @RequirePermission('task.assign')
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.tasks.updateTemplate(req.actor!, id, TemplateBody.parse(body))
  }

  @Post('task-templates/apply-standard')
  @RequirePermission('task.assign')
  applyStandard(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(body)
    return this.tasks.applyStandardSops(req.actor!, branchId)
  }

  // ------------------------------------------------ Của tôi — Office và Kênh nhân viên

  @Get('me/tasks')
  @RequirePermission('staff.view-own-record')
  mine(@Req() req: RequestWithActor) {
    return this.tasks.mine(req.actor!)
  }

  @Get('me/tasks/:id')
  @RequirePermission('staff.view-own-record')
  mineDetail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.tasks.mineDetail(req.actor!, id)
  }

  @Post('me/tasks/:id/accept')
  @RequirePermission('staff.view-own-record')
  accept(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.tasks.accept(req.actor!, id)
  }

  @Post('me/tasks/:id/check')
  @RequirePermission('staff.view-own-record')
  check(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { idx, checked } = CheckBody.parse(body)
    return this.tasks.check(req.actor!, id, idx, checked)
  }

  @Post('me/tasks/:id/submit')
  @RequirePermission('staff.view-own-record')
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { note, attachments } = SubmitBody.parse(body)
    return this.tasks.submit(req.actor!, id, note, attachments)
  }

  @Post('me/tasks/:id/review')
  @RequirePermission('staff.view-own-record')
  reviewMine(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { accept, note } = ReviewBody.parse(body)
    return this.tasks.review(req.actor!, id, accept, note, true)
  }
}
