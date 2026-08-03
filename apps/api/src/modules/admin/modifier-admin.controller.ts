import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { ModifierAdminService } from './modifier-admin.service'

const GroupSchema = z.object({
  id: z.string().min(2).max(40),
  name: z.string().min(1).max(80),
  required: z.boolean(),
  multi: z.boolean(),
  pickMin: z.number().int().min(0).max(20).default(0),
  pickMax: z.number().int().min(1).max(20).nullable().default(null),
  options: z
    .array(
      z.object({
        id: z.string().max(60).nullish(),
        name: z.string().min(1).max(80),
        /** Chênh giá âm được: "không hành" có thể giảm giá suất */
        priceDelta: z.number().int().min(-5_000_000).max(5_000_000),
        affectsStock: z.boolean(),
      }),
    )
    .min(1)
    .max(30),
})

const DishGroupsSchema = z.object({
  groupIds: z.array(z.string().min(1).max(40)).max(12),
})

/**
 * M5 — Tuỳ chọn.
 *
 * Mượn lại đúng cặp khoá của thực đơn (`menu.view-price` đọc · `menu.edit-price`
 * ghi) chứ không sinh khoá mới: ma trận §4.2 là hằng typed ở `@sora/contracts`,
 * thêm dòng vào đó là việc của bản thiết kế chứ không phải của lớp cài đặt.
 */
@Controller('api/admin/modifier-groups')
export class ModifierAdminController {
  constructor(private readonly modifiers: ModifierAdminService) {}

  @Get()
  @RequirePermission('menu.view-price')
  list() {
    return this.modifiers.list()
  }

  /**
   * Lưu trọn nhóm kèm danh sách lựa chọn bằng PUT, không PATCH từng lựa chọn:
   * ràng buộc "bắt buộc thì phải có ≥ 2 lựa chọn" chỉ kiểm được khi nhìn cả nhóm.
   */
  @Put(':id')
  @RequirePermission('menu.edit-price')
  save(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    const input = GroupSchema.parse({ ...(body as object), id })
    return this.modifiers.save(input, req.actor!)
  }

  @Delete(':id')
  @RequirePermission('menu.edit-price')
  remove(@Param('id') id: string, @Req() req: RequestWithActor) {
    return this.modifiers.remove(id, req.actor!)
  }
}

/**
 * Món này hỏi khách những nhóm nào.
 *
 * Nằm ở controller riêng chứ không nhét vào `CatalogAdminController`: đây là quan
 * hệ món ↔ nhóm, và nó có vòng đời riêng — thêm nhóm cho mười ba món nướng không
 * đụng gì tới giá hay định tuyến của chúng.
 */
@Controller('api/admin/dishes/:id/modifier-groups')
export class DishModifierController {
  constructor(private readonly modifiers: ModifierAdminService) {}

  @Get()
  @RequirePermission('menu.view-price')
  groups(@Param('id') id: string) {
    return this.modifiers.groupsOfDish(id)
  }

  @Put()
  @RequirePermission('menu.edit-price')
  setGroups(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.modifiers.setDishGroups(id, DishGroupsSchema.parse(body).groupIds, req.actor!)
  }
}
