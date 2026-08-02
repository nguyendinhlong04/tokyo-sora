import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { CatalogAdminService } from './catalog-admin.service'

const ApprovalSchema = z
  .object({
    approverStaffId: z.number().int().positive(),
    approverPin: z.string().regex(/^\d{4,6}$/),
    reason: z.string().min(1).max(300),
  })
  .nullish()

const DishSchema = z.object({
  id: z.string().min(2).max(40),
  code: z.string().min(1).max(40),
  kind: z.enum(['dish', 'set', 'drink']),
  categoryId: z.string().max(40).nullable(),
  subCategory: z.string().max(40).nullable(),
  nameVi: z.string().min(1).max(160),
  nameEn: z.string().max(160).nullable(),
  nameJa: z.string().max(160).nullable(),
  kana: z.string().max(40).nullable(),
  shortDesc: z.string().max(200).nullable(),
  longDesc: z.string().max(2000).nullable(),
  allergens: z.array(z.string().max(60)).nullable(),
  tags: z.array(z.string().max(40)).nullable(),
  routingMethod: z.enum(['fixed', 'song', 'nuong', 'linh_hoat']).nullable(),
  stationGrill: z.string().max(20).nullable(),
  stationNoGrill: z.string().max(20).nullable(),
  stationTakeaway: z.string().max(20).nullable(),
  stationDelivery: z.string().max(20).nullable(),
  secondaryStation: z.string().max(20).nullable(),
  primaryLabel: z.string().max(40).nullable(),
  secondaryLabel: z.string().max(40).nullable(),
  prepSeconds: z.number().int().min(0).max(7200),
  basePrice: z.number().int().min(0),
  vatCode: z.string().max(20),
  onlineVisible: z.boolean(),
  tableOrderable: z.boolean(),
  signature: z.boolean(),
  active: z.boolean(),
  sort: z.number().int().min(0).max(9999),
})

const UpdateSchema = DishSchema.partial().extend({ approval: ApprovalSchema })

const OverrideSchema = z.object({
  price: z.number().int().min(0).nullable(),
  active: z.boolean().nullable(),
  approval: ApprovalSchema,
})

const CoursesSchema = z.object({
  courses: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        kanji: z.string().max(8).nullable(),
        pickCount: z.number().int().min(1).max(20).nullable(),
        batchOffset: z.number().int().min(0).max(10),
        items: z
          .array(
            z.object({
              dishId: z.string().min(1),
              qty: z.number().int().min(1).max(50),
              portionLabel: z.string().max(40).nullable(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .max(12),
})

/**
 * M1 — Món và set.
 *
 * Đọc gắn `menu.view-price` (gần như mọi vai trò vận hành đều xem được thực đơn);
 * ghi gắn `menu.edit-price`. R7 ở mức △ nên vẫn gọi được, và dịch vụ bên trong
 * đòi PIN người duyệt đúng lúc chạm vào giá — xem `CatalogAdminService.update`.
 */
@Controller('api/admin/dishes')
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogAdminService) {}

  @Get()
  @RequirePermission('menu.view-price')
  list(@Query('branch') branch?: string) {
    return this.catalog.list(branch ?? null)
  }

  @Get('pickers')
  @RequirePermission('menu.view-price')
  pickers() {
    return this.catalog.pickers()
  }

  @Get(':id')
  @RequirePermission('menu.view-price')
  detail(@Param('id') id: string) {
    return this.catalog.detail(id)
  }

  @Post()
  @RequirePermission('menu.edit-price')
  create(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.catalog.create(DishSchema.parse(body), req.actor!)
  }

  @Patch(':id')
  @RequirePermission('menu.edit-price')
  update(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    const { approval, ...patch } = UpdateSchema.parse(body)
    return this.catalog.update(id, patch, req.actor!, approval)
  }

  @Put(':id/courses')
  @RequirePermission('menu.edit-price')
  setCourses(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.catalog.setCourses(id, CoursesSchema.parse(body).courses, req.actor!)
  }

  @Patch(':id/branches/:branchId')
  @RequirePermission('menu.edit-price')
  setOverride(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { approval, ...input } = OverrideSchema.parse(body)
    return this.catalog.setBranchOverride(id, branchId, input, req.actor!, approval)
  }

  @Delete(':id/branches/:branchId')
  @RequirePermission('menu.edit-price')
  clearOverride(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Req() req: RequestWithActor,
  ) {
    return this.catalog.clearBranchOverride(id, branchId, req.actor!)
  }
}
