import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { AdminService } from './admin.service'

const ParamBody = z.object({
  value: z.union([z.number(), z.boolean(), z.string()]),
  /** null = sửa mặc định cấp chuỗi */
  branchId: z.string().min(1).nullable(),
})

const BranchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  address: z.string().max(300).nullish(),
  phone: z.string().max(40).nullish(),
  email: z.string().email().max(160).nullish(),
  openHours: z.string().max(200).nullish(),
  active: z.boolean().optional(),
})

const AreaBody = z.object({ branchId: z.string().min(1), name: z.string().min(1).max(80) })

const TableBody = z.object({
  branchId: z.string().min(1),
  areaId: z.number().int().positive().nullable(),
  code: z.string().min(1).max(20),
  kind: z.enum(['standard', 'grill', 'private']),
  hasGrill: z.boolean(),
  grillType: z.enum(['than', 'gas', 'dien']).nullable(),
  seatMin: z.number().int().min(1).max(50),
  seatMax: z.number().int().min(1).max(50),
  active: z.boolean().default(true),
})

/**
 * A3 · A6 · A10 — quản trị cấu hình.
 *
 * Gắn `admin.manage-accounts-roles` (§4.2 chỉ cấp cho R10). Ma trận trong tài
 * liệu không có dòng riêng cho "sửa tham số" hay "sửa sơ đồ bàn", nên chọn dòng
 * quản trị duy nhất đang có thay vì tự thêm quyền mới: đổi ma trận là việc của
 * bản thiết kế, không phải của lớp cài đặt. Muốn trưởng ca sửa được sơ đồ bàn
 * thì §4.2 cần thêm một dòng trước.
 */
@Controller('api/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ---------------------------------------------------------------- A6

  @Get('parameters')
  @RequirePermission('admin.manage-accounts-roles')
  parameters(@Query('branch') branch?: string) {
    return this.admin.parameters(branch ?? null)
  }

  @Get('parameters/:key/history')
  @RequirePermission('admin.manage-accounts-roles')
  history(@Param('key') key: string) {
    return this.admin.parameterHistory(key)
  }

  @Put('parameters/:key')
  @RequirePermission('admin.manage-accounts-roles')
  setParameter(@Param('key') key: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.admin.setParameter(key, ParamBody.parse(body), req.actor!)
  }

  @Delete('parameters/:key')
  @RequirePermission('admin.manage-accounts-roles')
  clearOverride(
    @Param('key') key: string,
    @Query('branch') branch: string,
    @Req() req: RequestWithActor,
  ) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return this.admin.clearParameterOverride(key, branch, req.actor!)
  }

  // --------------------------------------------------------------- A10

  @Get('branches')
  @RequirePermission('admin.manage-accounts-roles')
  branches() {
    return this.admin.branches()
  }

  @Patch('branches/:id')
  @RequirePermission('admin.manage-accounts-roles')
  updateBranch(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.admin.updateBranch(id, BranchBody.parse(body), req.actor!)
  }

  // ---------------------------------------------------------------- A3

  @Get('floorplan')
  @RequirePermission('admin.manage-accounts-roles')
  floorplan(@Query('branch') branch: string) {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return this.admin.floorplan(branch)
  }

  @Post('areas')
  @RequirePermission('admin.manage-accounts-roles')
  createArea(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.admin.createArea(AreaBody.parse(body), req.actor!)
  }

  @Patch('areas/:id')
  @RequirePermission('admin.manage-accounts-roles')
  renameArea(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.admin.renameArea(id, AreaBody.pick({ name: true }).parse(body).name, req.actor!)
  }

  @Delete('areas/:id')
  @RequirePermission('admin.manage-accounts-roles')
  deleteArea(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.admin.deleteArea(id, req.actor!)
  }

  @Post('tables')
  @RequirePermission('admin.manage-accounts-roles')
  createTable(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.admin.createTable(TableBody.parse(body), req.actor!)
  }

  @Patch('tables/:id')
  @RequirePermission('admin.manage-accounts-roles')
  updateTable(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.admin.updateTable(id, TableBody.partial().parse(body), req.actor!)
  }

  /** Ngừng dùng bàn — dữ liệu cũ giữ nguyên, xem `deactivateTable` */
  @Delete('tables/:id')
  @RequirePermission('admin.manage-accounts-roles')
  deactivateTable(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.admin.deactivateTable(id, req.actor!)
  }
}
