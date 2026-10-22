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
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  REPORT_AUTO_FIELDS,
  REPORT_CADENCES,
  REPORT_FIELD_TYPES,
  REPORT_REVIEW_MODES,
  TASK_PRIORITIES,
  type ReportAutoKey,
} from '@sora/contracts'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { IncidentsService } from './incidents.service'
import { WorkReportsService } from './work-reports.service'

const Id = z.number().int().positive()
const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
const Https = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => /^https:\/\/\S+$/.test(u), 'Đường dẫn phải bắt đầu bằng https://')

const AUTO_KEYS = Object.keys(REPORT_AUTO_FIELDS) as [ReportAutoKey, ...ReportAutoKey[]]

const Field = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  type: z.enum(REPORT_FIELD_TYPES),
  required: z.boolean().optional(),
  requiredIf: z.object({ field: z.string().min(1), absGreaterThan: z.number().min(0) }).optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  auto: z.enum(AUTO_KEYS).optional(),
  hint: z.string().trim().max(200).optional(),
})

const TemplateBody = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Mã chỉ gồm chữ thường không dấu, số, gạch nối'),
  name: z.string().trim().min(1).max(120),
  cadence: z.enum(REPORT_CADENCES),
  branchId: z.string().min(1),
  fields: z.array(Field).min(1).max(40),
  shiftTemplateIds: z.array(Id).max(10).default([]),
  dueOffsetMinutes: z.number().int().min(0).max(4320),
  reviewMode: z.enum(REPORT_REVIEW_MODES),
  kenhNv: z.boolean().default(false),
  active: z.boolean().default(true),
  positions: z
    .array(z.object({ positionId: Id, role: z.enum(['nop', 'du-phong']) }))
    .min(1)
    .max(10),
})

const ReportValue = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(80)).max(20),
  z.null(),
])
const ValuesBody = z.object({ values: z.record(z.string(), ReportValue) })
const DraftBody = z.object({
  templateId: Id,
  periodKey: z.string().min(4).max(10),
  shiftTemplateId: Id.nullable().default(null),
})
const NoteBody = z.object({ note: z.string().trim().max(2000).nullable().default(null) })
const AddendumBody = z.object({ body: z.string().trim().min(1).max(4000) })

const IncidentBody = z.object({
  category: z.enum(INCIDENT_CATEGORIES),
  severity: z.enum(INCIDENT_SEVERITIES),
  occurredAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  immediateAction: z.string().trim().max(2000).nullable().default(null),
  injuredCount: z.number().int().min(0).max(100).default(0),
  customerInvolved: z.boolean().default(false),
  evidenceUrls: z.array(Https).max(10).default([]),
})

const IncidentPatchBody = z
  .object({
    category: z.enum(INCIDENT_CATEGORIES),
    severity: z.enum(INCIDENT_SEVERITIES),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(4000),
    immediateAction: z.string().trim().max(2000).nullable(),
    rootCause: z.string().trim().max(2000).nullable(),
    correctiveAction: z.string().trim().max(2000).nullable(),
    lossEstimateVnd: z.number().int().min(0).nullable(),
    ownerId: Id.nullable(),
    evidenceUrls: z.array(Https).max(10),
  })
  .partial()

const IncidentTaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default('gap'),
  assigneeStaffIds: z.array(Id).min(1).max(20),
  dueAt: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .nullable()
    .default(null),
  attachments: z
    .array(z.object({ name: z.string().trim().min(1).max(120), url: Https }))
    .max(10)
    .default([]),
})

const ExternalBody = z.object({
  reportedAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
  ref: z.string().trim().min(1, 'Ghi số công văn hoặc nơi đã báo').max(200),
})

/**
 * N7 · Báo cáo công việc (Office) và mục "Cần nộp" (N1, Kênh nhân viên N15).
 *
 * Cấu hình mẫu: `workreport.configure`. Xem, xác nhận: `workreport.review`. Nộp:
 * khoá "của mình" — Kênh nhân viên chỉ nộp mẫu không có tiền.
 */
@Controller('api/work-reports')
@UseInterceptors(IdempotencyInterceptor)
export class WorkReportsController {
  constructor(private readonly reports: WorkReportsService) {}

  @Get('templates')
  @RequirePermission('workreport.review')
  templates(@Query('branch') branch: string | undefined, @Req() req: RequestWithActor) {
    return this.reports.templates(req.actor!, branch || undefined)
  }

  @Post('templates')
  @RequirePermission('workreport.configure')
  createTemplate(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.reports.saveTemplate(req.actor!, null, TemplateBody.parse(body))
  }

  @Put('templates/:id')
  @RequirePermission('workreport.configure')
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.reports.saveTemplate(req.actor!, id, TemplateBody.parse(body))
  }

  @Post('templates/apply-standard')
  @RequirePermission('workreport.configure')
  applyStandard(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(body)
    return this.reports.applyStandard(req.actor!, branchId)
  }

  @Get()
  @RequirePermission('workreport.review')
  list(@Query() query: Record<string, string>, @Req() req: RequestWithActor) {
    const q = z
      .object({
        view: z.enum(['can-xem', 'tat-ca']).default('can-xem'),
        branch: z.string().min(1).optional(),
        from: BusinessDate.optional(),
        to: BusinessDate.optional(),
      })
      .parse(query)
    return this.reports.list(req.actor!, {
      view: q.view,
      branchId: q.branch,
      from: q.from,
      to: q.to,
    })
  }

  @Get('missing')
  @RequirePermission('workreport.review')
  missing(@Query('branch') branch: string | undefined, @Req() req: RequestWithActor) {
    return this.reports.missing(req.actor!, branch || undefined)
  }

  // ------------------------------------------------ Của tôi — Office và Kênh nhân viên

  @Get('me/due')
  @RequirePermission('staff.view-own-record')
  due(@Req() req: RequestWithActor) {
    return this.reports.myDue(req.actor!)
  }

  @Post('me/drafts')
  @RequirePermission('staff.view-own-record')
  openDraft(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.reports.openDraft(req.actor!, DraftBody.parse(body))
  }

  @Get('me/:id')
  @RequirePermission('staff.view-own-record')
  mine(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.reports.mineDetail(req.actor!, id)
  }

  @Put('me/:id')
  @RequirePermission('staff.view-own-record')
  save(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.reports.saveDraft(req.actor!, id, ValuesBody.parse(body).values)
  }

  @Post('me/:id/submit')
  @RequirePermission('staff.view-own-record')
  submit(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    const actor = req.actor!
    // Phiên mở bằng link cá nhân = đang ở Kênh nhân viên (điện thoại riêng)
    const viaChannel = actor.kind === 'staff' && actor.scope === 'self'
    return this.reports.submit(actor, id, viaChannel)
  }

  @Post('me/:id/addenda')
  @RequirePermission('staff.view-own-record')
  addendumMine(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.reports.addendum(req.actor!, id, AddendumBody.parse(body).body)
  }

  // ------------------------------------------------ Xem, xác nhận

  @Get(':id')
  @RequirePermission('workreport.review')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.reports.detail(req.actor!, id)
  }

  @Post(':id/review')
  @RequirePermission('workreport.review')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.reports.review(req.actor!, id, NoteBody.parse(body ?? {}).note)
  }

  @Post(':id/addenda')
  @RequirePermission('workreport.review')
  addendum(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.reports.addendum(req.actor!, id, AddendumBody.parse(body).body)
  }
}

/**
 * N8 · Sự cố. Báo sự cố: ai cũng báo được (khoá "của mình", cả trên Kênh nhân
 * viên). Xử lý, giao việc khắc phục, khai báo ra ngoài, đóng: `incident.manage`;
 * sự cố nghiêm trọng còn cần `incident.close-severe` (service kiểm).
 */
@Controller('api/incidents')
@UseInterceptors(IdempotencyInterceptor)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  @RequirePermission('staff.view-own-record')
  report(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.incidents.report(req.actor!, IncidentBody.parse(body))
  }

  @Get('me')
  @RequirePermission('staff.view-own-record')
  mine(@Req() req: RequestWithActor) {
    return this.incidents.mine(req.actor!)
  }

  @Get()
  @RequirePermission('incident.manage')
  list(@Query() query: Record<string, string>, @Req() req: RequestWithActor) {
    return this.incidents.list(req.actor!, {
      state: query.state || undefined,
      branchId: query.branch || undefined,
      severity: query.severity || undefined,
    })
  }

  @Get(':id')
  @RequirePermission('incident.manage')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.incidents.detail(req.actor!, id)
  }

  @Put(':id')
  @RequirePermission('incident.manage')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.incidents.update(req.actor!, id, IncidentPatchBody.parse(body))
  }

  @Post(':id/tasks')
  @RequirePermission('incident.manage')
  addTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.incidents.addTask(req.actor!, id, IncidentTaskBody.parse(body))
  }

  @Post(':id/external-report')
  @RequirePermission('incident.manage')
  external(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.incidents.externalReport(req.actor!, id, ExternalBody.parse(body))
  }

  @Post(':id/close')
  @RequirePermission('incident.manage')
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.incidents.close(req.actor!, id, NoteBody.parse(body ?? {}).note)
  }
}
