import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { ROLES } from '@sora/contracts'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { AccessAdminService } from './access-admin.service'

const RoleGrant = z.object({
  roleCode: z.enum(ROLES),
  /** null = phạm vi toàn chuỗi */
  branchId: z.string().min(1).nullable(),
})

const AccountBody = z.object({
  code: z.string().min(1).max(20),
  fullName: z.string().min(1).max(120),
  phone: z.string().max(40).nullish().transform((v) => v ?? null),
  email: z.string().email().max(160).nullish().transform((v) => v ?? null),
  active: z.boolean().default(true),
  password: z.string().max(200).nullish().transform((v) => v || null),
  pin: z.string().max(6).nullish().transform((v) => v || null),
  roles: z.array(RoleGrant).max(20),
})

const AccountPatch = AccountBody.pick({
  code: true,
  fullName: true,
  phone: true,
  email: true,
  active: true,
}).partial()

const SecretBody = z.object({ value: z.string().min(1).max(200) })
const RolesBody = z.object({ roles: z.array(RoleGrant).min(1).max(20) })

const AuditQuery = z.object({
  branch: z.string().min(1).nullish(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.string().min(1).nullish(),
  actor: z.coerce.number().int().positive().nullish(),
  before: z.coerce.number().int().positive().nullish(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/**
 * A1 · A2 · A7.
 *
 * A1 và A2 đứng sau `admin.manage-accounts-roles` — đúng dòng "Quản lý tài khoản
 * & quyền" của §4.2, chỉ R10 có. A7 thì đứng sau `audit.view-log`, rộng hơn hẳn
 * (R7 · R8 · R11 · R10): quản lý ca phải đọc được nhật ký ca mình mà không cần
 * quyền tạo tài khoản, và đó là điều bảng §4.2 nói.
 */
@Controller('api/admin')
export class AccessAdminController {
  constructor(private readonly access: AccessAdminService) {}

  // ---------------------------------------------------------------- A1

  @Get('accounts')
  @RequirePermission('admin.manage-accounts-roles')
  accounts() {
    return this.access.accounts()
  }

  @Post('accounts')
  @RequirePermission('admin.manage-accounts-roles')
  createAccount(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.access.createAccount(AccountBody.parse(body), req.actor!)
  }

  @Patch('accounts/:id')
  @RequirePermission('admin.manage-accounts-roles')
  updateAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.access.updateAccount(id, AccountPatch.parse(body), req.actor!)
  }

  @Put('accounts/:id/password')
  @RequirePermission('admin.manage-accounts-roles')
  setPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.access.setPassword(id, SecretBody.parse(body).value, req.actor!)
  }

  @Put('accounts/:id/pin')
  @RequirePermission('admin.manage-accounts-roles')
  setPin(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.access.setPin(id, SecretBody.parse(body).value, req.actor!)
  }

  @Put('accounts/:id/roles')
  @RequirePermission('admin.manage-accounts-roles')
  setRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.access.setRoles(id, RolesBody.parse(body).roles, req.actor!)
  }

  // ---------------------------------------------------------------- A2

  @Get('roles')
  @RequirePermission('admin.manage-accounts-roles')
  roles() {
    return this.access.roleAssignments()
  }

  // ---------------------------------------------------------------- A7

  @Get('audit')
  @RequirePermission('audit.view-log')
  audit(@Query() query: unknown) {
    const q = AuditQuery.parse(query)
    assertRange(q.from, q.to)
    return this.access.auditTrail({
      branchId: q.branch ?? null,
      from: q.from,
      to: nextDay(q.to),
      action: q.action ?? null,
      actorId: q.actor ?? null,
      beforeId: q.before ?? null,
      limit: q.limit,
    })
  }

  @Get('audit/filters')
  @RequirePermission('audit.view-log')
  auditFilters(@Query() query: unknown) {
    const q = AuditQuery.pick({ branch: true, from: true, to: true }).parse(query)
    assertRange(q.from, q.to)
    return this.access.auditActions({
      branchId: q.branch ?? null,
      from: q.from,
      to: nextDay(q.to),
    })
  }
}

function assertRange(from: string, to: string) {
  if (from > to) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc')
}

/** Khoảng lọc bao gồm cả ngày `to`, nên biên trên là 00:00 của ngày kế */
function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)
}
