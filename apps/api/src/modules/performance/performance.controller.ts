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
import { KPI_METRICS, KPI_OBSERVATION_KINDS, type KpiMetricCode } from '@sora/contracts'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { PerformanceService } from './performance.service'

const Id = z.number().int().positive()
const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
const Reason = z.string().trim().min(1, 'Ghi lý do').max(300)
const Https = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => /^https:\/\/\S+$/.test(u), 'Đường dẫn phải bắt đầu bằng https://')
const METRIC_CODES = Object.keys(KPI_METRICS) as [KpiMetricCode, ...KpiMetricCode[]]
const Metric = z.enum(METRIC_CODES)

const TemplateBody = z.object({
  positionId: Id,
  items: z
    .array(
      z.object({
        metricCode: Metric,
        weightPct: z.number().int().min(1).max(100),
        defaultTargetMilli: z.number().int().min(0),
      }),
    )
    .min(3)
    .max(6),
})

const CycleBody = z.object({
  branchId: z.string().min(1),
  kind: z.enum(['thang', 'quy']).default('thang'),
  periodStart: BusinessDate,
})

const ManagerBody = z.object({
  comment: z.string().trim().max(2000).nullable().default(null),
  items: z
    .array(
      z.object({
        metricCode: Metric,
        managerScore: z.number().int().min(1).max(5).nullable().optional(),
        excludedReason: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .max(6),
})

const SelfBody = z.object({
  comment: z.string().trim().max(2000).nullable().default(null),
  items: z
    .array(z.object({ metricCode: Metric, selfScore: z.number().int().min(1).max(5).nullable() }))
    .max(6),
})

const ObservationBody = z.object({
  branchId: z.string().min(1),
  kind: z.enum(KPI_OBSERVATION_KINDS),
  observedOn: BusinessDate,
  /** Điểm 0–100, lưu milli */
  score: z.number().min(0).max(100),
  evidenceUrl: Https,
  note: z.string().trim().max(1000).nullable().default(null),
})

/**
 * KPI — N9 bộ KPI (`kpi.configure`), N10 kỳ đánh giá (`kpi.cycle-manage` mở/đặt
 * chỉ tiêu; `kpi.review-team` chấm; `kpi.close` chốt), N11 phiếu kiểm tra
 * (`kpi.observe`), N14 KPI của tôi (khoá "của mình"), thưởng gợi ý cho H7.
 */
@Controller('api/performance')
@UseInterceptors(IdempotencyInterceptor)
export class PerformanceController {
  constructor(private readonly kpi: PerformanceService) {}

  // ---- Bộ KPI

  @Get('templates')
  @RequirePermission('kpi.review-team')
  templates(@Req() req: RequestWithActor) {
    return this.kpi.templates(req.actor!)
  }

  @Post('templates')
  @RequirePermission('kpi.configure')
  saveTemplate(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.kpi.saveTemplate(req.actor!, TemplateBody.parse(body))
  }

  @Post('templates/apply-standard')
  @RequirePermission('kpi.configure')
  applyStandard(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { target } = z.object({ target: z.string().min(1) }).parse(body)
    return this.kpi.applyStandard(req.actor!, target)
  }

  // ---- Kỳ

  @Get('cycles')
  @RequirePermission('kpi.review-team')
  cycles(@Query('branch') branch: string | undefined, @Req() req: RequestWithActor) {
    return this.kpi.cycles(req.actor!, branch || undefined)
  }

  @Post('cycles')
  @RequirePermission('kpi.cycle-manage')
  createCycle(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.kpi.createCycle(req.actor!, CycleBody.parse(body))
  }

  @Post('cycles/:id/open')
  @RequirePermission('kpi.cycle-manage')
  open(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    const { policyUrl } = z.object({ policyUrl: Https.nullable().default(null) }).parse(body ?? {})
    return this.kpi.openCycle(req.actor!, id, policyUrl)
  }

  @Post('cycles/:id/compute')
  @RequirePermission('kpi.review-team')
  compute(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.kpi.compute(req.actor!, id)
  }

  @Post('cycles/:id/start-review')
  @RequirePermission('kpi.cycle-manage')
  startReview(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.kpi.startReview(req.actor!, id)
  }

  @Post('cycles/:id/close')
  @RequirePermission('kpi.close')
  close(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.kpi.closeCycle(req.actor!, id)
  }

  @Get('cycles/:id/reviews')
  @RequirePermission('kpi.review-team')
  reviews(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.kpi.reviews(req.actor!, id)
  }

  // ---- Phiếu

  @Get('reviews/:id')
  @RequirePermission('kpi.review-team')
  review(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.kpi.review(req.actor!, id)
  }

  @Put('reviews/:id/targets')
  @RequirePermission('kpi.cycle-manage')
  target(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const input = z
      .object({ metricCode: Metric, targetMilli: z.number().int().min(0), note: Reason })
      .parse(body)
    return this.kpi.setTarget(req.actor!, id, input)
  }

  @Put('reviews/:id/exempt')
  @RequirePermission('kpi.cycle-manage')
  exempt(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { reason } = z.object({ reason: Reason.nullable() }).parse(body)
    return this.kpi.setExempt(req.actor!, id, reason)
  }

  @Put('reviews/:id/manager')
  @RequirePermission('kpi.review-team')
  manager(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.kpi.managerReview(req.actor!, id, ManagerBody.parse(body))
  }

  @Post('reviews/:id/finalize')
  @RequirePermission('kpi.review-team')
  finalize(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.kpi.finalize(req.actor!, id)
  }

  // ---- Thưởng gợi ý cho H7

  @Get('bonus-suggestions')
  @RequirePermission('payroll.compute-draft')
  bonus(@Query('payrollPeriodId') periodId: string, @Req() req: RequestWithActor) {
    return this.kpi.bonusSuggestions(req.actor!, z.coerce.number().int().positive().parse(periodId))
  }

  // ---- Phiếu kiểm tra

  @Get('observations')
  @RequirePermission('kpi.observe')
  observations(@Query('branch') branch: string | undefined, @Req() req: RequestWithActor) {
    return this.kpi.observations(req.actor!, branch || undefined)
  }

  @Post('observations')
  @RequirePermission('kpi.observe')
  observe(@Body() body: unknown, @Req() req: RequestWithActor) {
    const input = ObservationBody.parse(body)
    return this.kpi.createObservation(req.actor!, {
      branchId: input.branchId,
      kind: input.kind,
      observedOn: input.observedOn,
      scoreMilli: Math.round(input.score * 1000),
      evidenceUrl: input.evidenceUrl,
      note: input.note,
    })
  }

  @Post('observations/:id/void')
  @RequirePermission('kpi.observe')
  voidObservation(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.kpi.voidObservation(req.actor!, id, z.object({ reason: Reason }).parse(body).reason)
  }

  // ---- Của tôi — Office và Kênh nhân viên

  @Get('me')
  @RequirePermission('staff.view-own-record')
  mine(@Req() req: RequestWithActor) {
    return this.kpi.mine(req.actor!)
  }

  @Get('me/reviews/:id')
  @RequirePermission('staff.view-own-record')
  mineDetail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.kpi.mineDetail(req.actor!, id)
  }

  @Put('me/reviews/:id/self')
  @RequirePermission('staff.view-own-record')
  self(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.kpi.selfReview(req.actor!, id, SelfBody.parse(body))
  }

  @Post('me/reviews/:id/ack')
  @RequirePermission('staff.view-own-record')
  ack(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    const { feedback } = z
      .object({ feedback: z.string().trim().max(2000).nullable().default(null) })
      .parse(body ?? {})
    return this.kpi.ack(req.actor!, id, feedback)
  }
}
