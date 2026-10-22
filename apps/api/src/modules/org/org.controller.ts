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
import { ASSIGNMENT_KINDS, ROLES } from '@sora/contracts'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { OrgService } from './org.service'

const Id = z.number().int().positive()
const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
const JobLines = z.array(z.string().trim().min(1).max(200)).max(20).default([])
const UnitKind = z.enum(['khoi', 'phong', 'chi-nhanh', 'bo-phan', 'to'])

const UnitBody = z
  .object({
    parentId: Id,
    kind: UnitKind,
    name: z.string().trim().min(1).max(80),
    branchId: z.string().min(1).nullable().default(null),
    stationId: z.string().min(1).max(20).nullable().default(null),
    sort: z.number().int().min(0).max(999).default(0),
  })
  .refine((b) => (b.kind === 'chi-nhanh') === (b.branchId !== null), {
    message: 'Đơn vị chi nhánh phải chọn chi nhánh; đơn vị khác thì không',
    path: ['branchId'],
  })

const UnitPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  parentId: Id.optional(),
  sort: z.number().int().min(0).max(999).optional(),
  stationId: z.string().min(1).max(20).nullable().optional(),
  active: z.boolean().optional(),
})

const PositionFields = {
  title: z.string().trim().min(1).max(80),
  isHead: z.boolean().default(false),
  headcount: z.number().int().min(0).max(500).default(1),
  suggestedRole: z.enum(ROLES).exclude(['R0']).nullable().default(null),
  duties: JobLines,
  authorities: JobLines,
  requirements: JobLines,
  sort: z.number().int().min(0).max(999).default(0),
}

const PositionBody = z.object({ unitId: Id, ...PositionFields })

const PositionPatch = z.object(PositionFields).partial().extend({ active: z.boolean().optional() })

const AssignBody = z.object({
  staffIds: z.array(Id).min(1).max(50),
  positionId: Id,
  kind: z.enum(ASSIGNMENT_KINDS).default('chinh'),
  fromDate: BusinessDate,
  note: z.string().trim().min(1, 'Gán tay phải ghi lý do hoặc căn cứ').max(300),
  replaceMain: z.boolean().default(false),
})

const EndBody = z.object({
  toDate: BusinessDate,
  note: z.string().trim().min(1, 'Ghi lý do kết thúc').max(300),
})

const StandardBody = z.object({
  /** `chuoi` = khung của cả công ty; còn lại là mã chi nhánh */
  target: z.string().trim().min(1).max(40),
})

/**
 * Sơ đồ tổ chức — N2 · N3.
 *
 * Đọc mở cho mọi vai trò có tài khoản Office (`org.view`), nhưng trả về đúng cây
 * con trong phạm vi của người xem. Sửa cơ cấu và gán chức danh chỉ R11 · R13 ·
 * R10 (`org.manage`) — những người vốn nhìn toàn chuỗi.
 */
@Controller('api/org')
@UseInterceptors(IdempotencyInterceptor)
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('chart')
  @RequirePermission('org.view')
  chart(@Query('date') date: string | undefined, @Req() req: RequestWithActor) {
    return this.org.chart(req.actor!, date ? BusinessDate.parse(date) : undefined)
  }

  @Get('positions/:id/history')
  @RequirePermission('org.view')
  history(@Param('id', ParseIntPipe) id: number) {
    return this.org.positionHistory(id)
  }

  @Post('units')
  @RequirePermission('org.manage')
  createUnit(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.org.createUnit(UnitBody.parse(body), req.actor!)
  }

  @Put('units/:id')
  @RequirePermission('org.manage')
  updateUnit(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.org.updateUnit(id, UnitPatch.parse(body), req.actor!)
  }

  @Post('positions')
  @RequirePermission('org.manage')
  createPosition(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.org.createPosition(PositionBody.parse(body), req.actor!)
  }

  @Put('positions/:id')
  @RequirePermission('org.manage')
  updatePosition(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.org.updatePosition(id, PositionPatch.parse(body), req.actor!)
  }

  @Post('assignments')
  @RequirePermission('org.manage')
  assign(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.org.assign(AssignBody.parse(body), req.actor!)
  }

  @Post('assignments/:id/end')
  @RequirePermission('org.manage')
  endAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.org.endAssignment(id, EndBody.parse(body), req.actor!)
  }

  @Post('apply-standard')
  @RequirePermission('org.manage')
  applyStandard(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.org.applyStandard(StandardBody.parse(body).target, req.actor!)
  }

  /** Chức danh, đơn vị, cấp trên trực tiếp của chính mình — Office và Kênh nhân viên */
  @Get('me')
  @RequirePermission('staff.view-own-record')
  me(@Req() req: RequestWithActor) {
    return this.org.me(req.actor!)
  }
}
