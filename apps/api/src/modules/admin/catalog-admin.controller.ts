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
  imageUrl: z.string().max(500).nullable().default(null),
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
  // Bỏ trống = bán online bằng giá tại quán
  onlinePrice: z.number().int().min(0).nullable().default(null),
  vatCode: z.string().max(20),
  onlineVisible: z.boolean(),
  tableOrderable: z.boolean(),
  signature: z.boolean(),
  active: z.boolean(),
  // Lịch bán M11; mặc định = bán cả tuần, cả ngày, không giới hạn mùa
  saleFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  saleTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  saleDays: z.number().int().min(1).max(127).default(127),
  saleStartMinute: z.number().int().min(0).max(1439).nullable().default(null),
  saleEndMinute: z.number().int().min(1).max(1440).nullable().default(null),
  sort: z.number().int().min(0).max(9999),
})

const CategorySchema = z.object({
  id: z.string().min(2).max(40),
  parentId: z.string().max(40).nullable().default(null),
  nameVi: z.string().min(1).max(120),
  nameEn: z.string().max(120).nullable().default(null),
  nameJa: z.string().max(120).nullable().default(null),
  kanji: z.string().max(8).nullable().default(null),
  imageUrl: z.string().max(500).nullable().default(null),
  onlineVisible: z.boolean().default(true),
  tableVisible: z.boolean().default(true),
})

const MoveSchema = z.object({
  parentId: z.string().max(40).nullable(),
  position: z.number().int().min(0).max(999),
})

const UpdateSchema = DishSchema.partial().extend({ approval: ApprovalSchema })

/**
 * Nội dung trang chi tiết món trên web (W3).
 *
 * Mọi trường `.nullish()` rồi quy về `null`: form gửi lên nguyên cụm, ô nào người
 * nhập bỏ trống thì trường đó về null chứ không giữ lại giá trị cũ — cùng ý với
 * `setStory` bên dịch vụ. Giới hạn độ dài đặt rộng tay vì đây là chữ nghĩa biên
 * tập, nhưng vẫn có trần để một lần dán nhầm cả trang HTML không lọt xuống CSDL.
 */
const nullableText = (max: number) =>
  z.string().max(max).nullish().transform((v) => v || null)
const nullableList = (max: number, itemMax: number) =>
  z
    .array(z.string().max(itemMax))
    .max(max)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null))

const StorySchema = z.object({
  chapterNo: nullableText(8),
  portionLabel: nullableText(40),
  nameJaFull: nullableText(160),
  intro: nullableText(2000),
  note: nullableText(600),
  craft: nullableText(400),
  footerImageUrl: nullableText(500),
  bannerJa: nullableText(60),
  bannerVi: nullableText(120),
  closing: nullableText(300),
  pairingDishIds: nullableList(6, 40),
  origin: nullableText(200),
  originKanji: nullableText(8),
  originImageUrl: nullableText(500),
  flavours: nullableList(8, 200),
  cutsLabel: nullableText(60),
  cuts: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        size: z.string().max(60).default(''),
        desc: z.string().max(300).default(''),
        /** Thanh đo bốn ô trên trang, nên 1–4 chứ không phải thang mở */
        soft: z.number().int().min(1).max(4).default(3),
        imageUrl: z.string().max(500).nullish().transform((v) => v || null),
      }),
    )
    .max(6)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null)),
  fire: nullableText(300),
  fireImageUrl: nullableText(500),
  dip: nullableText(300),
  dipImageUrl: nullableText(500),
  condiments: z
    .array(
      z.object({
        kanji: z.string().max(4).default(''),
        name: z.string().min(1).max(60),
        desc: z.string().max(200).default(''),
      }),
    )
    .max(8)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null)),
  serves: nullableText(60),
  duration: nullableText(60),
  flow: nullableList(8, 300),
  extraDishIds: nullableList(6, 40),
})

const OverrideSchema = z.object({
  price: z.number().int().min(0).nullable(),
  active: z.boolean().nullable(),
  /** O11: bật/tắt kênh online cho riêng chi nhánh này; null = theo cấp chuỗi */
  onlineVisible: z.boolean().nullable().optional(),
  onlinePrice: z.number().int().min(0).nullable().optional(),
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

  @Put(':id/story')
  @RequirePermission('menu.edit-price')
  setStory(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.catalog.setStory(id, StorySchema.parse(body), req.actor!)
  }

  @Delete(':id/story')
  @RequirePermission('menu.edit-price')
  clearStory(@Param('id') id: string, @Req() req: RequestWithActor) {
    return this.catalog.clearStory(id, req.actor!)
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

/**
 * M10 — Cây danh mục.
 *
 * Mượn lại đúng cặp khoá của thực đơn (`menu.view-price` đọc · `menu.edit-price`
 * ghi) chứ không sinh khoá mới: ma trận §4.2 là hằng typed ở `@sora/contracts`,
 * thêm dòng vào đó là việc của bản thiết kế chứ không phải của lớp cài đặt.
 */
@Controller('api/admin/categories')
export class CategoryAdminController {
  constructor(private readonly catalog: CatalogAdminService) {}

  @Get()
  @RequirePermission('menu.view-price')
  tree() {
    return this.catalog.categoryTree()
  }

  @Post()
  @RequirePermission('menu.edit-price')
  create(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.catalog.createCategory(CategorySchema.parse(body), req.actor!)
  }

  @Patch(':id')
  @RequirePermission('menu.edit-price')
  update(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.catalog.updateCategory(id, CategorySchema.partial().parse(body), req.actor!)
  }

  /** Kéo thả: cha mới + vị trí trong danh sách anh em mới */
  @Put(':id/move')
  @RequirePermission('menu.edit-price')
  move(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    const { parentId, position } = MoveSchema.parse(body)
    return this.catalog.moveCategory(id, parentId, position, req.actor!)
  }

  @Delete(':id')
  @RequirePermission('menu.edit-price')
  remove(@Param('id') id: string, @Req() req: RequestWithActor) {
    return this.catalog.deleteCategory(id, req.actor!)
  }
}

/**
 * M11 — Set & Combo. Chỉ ĐỌC: chặng của set sửa ở trình sửa món
 * (`PUT /api/admin/dishes/:id/courses`), giá và lịch bán sửa bằng `PATCH` cùng
 * chỗ với mọi thuộc tính khác của món. Dựng thêm một cửa ghi ở đây là tạo nguồn
 * thứ hai cho dữ liệu đã có nguồn.
 *
 * Cái M11 thêm vào là con số không nằm trong bảng nào: dải giá vốn min–max.
 */
@Controller('api/admin/sets')
export class SetAdminController {
  constructor(private readonly catalog: CatalogAdminService) {}

  @Get()
  @RequirePermission('cost.view-recipe')
  list(@Query('branch') branch?: string) {
    return this.catalog.setsOverview(branch ?? null)
  }
}
