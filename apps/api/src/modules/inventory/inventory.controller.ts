import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { InventoryService } from './inventory.service'

const Approval = z
  .object({
    approverStaffId: z.number().int().positive(),
    approverPin: z.string().min(4).max(6),
    reason: z.string().min(1).max(300),
  })
  .nullish()

const IngredientBody = z.object({
  id: z.string().min(1).max(60),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  groupName: z.string().max(80).nullable().default(null),
  baseUnit: z.string().min(1).max(20),
  purchaseUnit: z.string().min(1).max(40),
  basePerPurchase: z.number().int().positive(),
  minLevelBase: z.number().int().min(0).default(0),
  lotRequired: z.boolean().default(false),
  isSemiFinished: z.boolean().default(false),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).default(0),
  approval: Approval,
})

const RecipeLines = z
  .array(
    z.object({
      ingredientId: z.string().min(1),
      qtyBase: z.number().int().positive(),
      wasteBp: z.number().int().min(0).max(10_000).default(0),
    }),
  )
  .max(60)

const RecipeBody = z.object({
  lines: RecipeLines,
  approval: Approval,
})

const PrepRecipeBody = z.object({
  /** Một mẻ ra bao nhiêu ĐVT cơ sở; 0 chỉ hợp lệ khi xoá hết dòng công thức */
  yieldBase: z.number().int().min(0),
  lines: RecipeLines,
  approval: Approval,
})

const SubjectKind = z.enum(['dish', 'prep'])

const ReceiveBody = z.object({
  branchId: z.string().min(1),
  ingredientId: z.string().min(1),
  qtyPurchase: z.number().positive(),
  totalVnd: z.number().int().min(0),
  note: z.string().max(300).nullish(),
})

const AdjustBody = z.object({
  branchId: z.string().min(1),
  ingredientId: z.string().min(1),
  qtyBaseDelta: z.number().int(),
  note: z.string().min(1).max(300),
  approval: Approval,
})

/**
 * Kho & công thức — M7 · M4 · S1 · S2.
 *
 * Quyền lấy nguyên ma trận §4.2, không thêm dòng mới:
 *   · Đọc (M7 · M4 · S1 · S2) → `cost.view-recipe`. Đúng quy tắc cứng §4.3.3
 *     "quyền xem GIÁ VỐN tách khỏi quyền xem DOANH THU": thủ kho R6 và bếp trưởng
 *     R5 vào được đây nhưng không vào được báo cáo doanh thu, và ngược lại.
 *   · Sửa nguyên liệu và công thức → `recipe.edit`. R7 quản lý ca ở mức △ nên phải
 *     kèm PIN người duyệt; R5 · R11 · R10 làm thẳng.
 *   · Nhập kho → `stock.receive` (R6 · R7 · R10, không ai cần duyệt).
 *   · Điều chỉnh tồn → `stock.write-off`. R5 và R6 ở mức △ — thủ kho không tự sửa
 *     được số tồn của chính mình, đó là điểm của dòng này trong ma trận.
 */
@Controller('api/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // -------------------------------------------------------- M7 · S1 · S2

  @Get('ingredients')
  @RequirePermission('cost.view-recipe')
  ingredients(@Query('branch') branch: string) {
    return this.inventory.ingredients(this.requireBranch(branch))
  }

  @Post('ingredients')
  @RequirePermission('recipe.edit')
  createIngredient(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { approval, ...input } = IngredientBody.parse(body)
    return this.inventory.createIngredient(input, req.actor!, approval)
  }

  @Patch('ingredients/:id')
  @RequirePermission('recipe.edit')
  updateIngredient(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    const { approval, ...patch } = IngredientBody.partial().parse(body)
    return this.inventory.updateIngredient(id, patch, req.actor!, approval)
  }

  @Get('overview')
  @RequirePermission('cost.view-recipe')
  overview(@Query('branch') branch: string) {
    return this.inventory.overview(this.requireBranch(branch))
  }

  @Get('ingredients/:id/moves')
  @RequirePermission('cost.view-recipe')
  moves(@Param('id') id: string, @Query('branch') branch: string) {
    return this.inventory.moves(this.requireBranch(branch), id)
  }

  // ------------------------------------------------------------- M4

  @Get('recipes/:dishId')
  @RequirePermission('cost.view-recipe')
  recipe(@Param('dishId') dishId: string) {
    return this.inventory.recipe(dishId)
  }

  @Put('recipes/:dishId')
  @RequirePermission('recipe.edit')
  setRecipe(@Param('dishId') dishId: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    const { lines, approval } = RecipeBody.parse(body)
    return this.inventory.setRecipe(dishId, lines, req.actor!, approval)
  }

  // ------------------------------------------------------------- M8

  @Get('preps')
  @RequirePermission('cost.view-recipe')
  preps() {
    return this.inventory.prepList()
  }

  @Get('preps/:id')
  @RequirePermission('cost.view-recipe')
  prep(@Param('id') id: string) {
    return this.inventory.prepRecipe(id)
  }

  @Put('preps/:id')
  @RequirePermission('recipe.edit')
  setPrep(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithActor) {
    const { approval, ...input } = PrepRecipeBody.parse(body)
    return this.inventory.setPrepRecipe(id, input, req.actor!, approval)
  }

  // ------------------------------------------------------------- M9

  /** Dòng thời gian mọi lần sửa công thức — bảng chính của M9 */
  @Get('recipe-changes')
  @RequirePermission('cost.view-recipe')
  recipeChanges() {
    return this.inventory.recentRecipeChanges()
  }

  @Get('recipe-versions/:kind/:id')
  @RequirePermission('cost.view-recipe')
  recipeVersions(@Param('kind') kind: string, @Param('id') id: string) {
    return this.inventory.versionsOf(SubjectKind.parse(kind), id)
  }

  @Get('recipe-versions/:kind/:id/compare')
  @RequirePermission('cost.view-recipe')
  compareVersions(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const version = z.coerce.number().int().positive()
    return this.inventory.compareVersions(
      SubjectKind.parse(kind),
      id,
      version.parse(from),
      version.parse(to),
    )
  }

  /** Giá vốn + food cost của mọi món — cột giá vốn của M1 */
  @Get('dish-costs')
  @RequirePermission('cost.view-recipe')
  async dishCosts() {
    const index = await this.inventory.dishCostIndex()
    return [...index].map(([dishId, breakdown]) => ({
      dishId,
      costVnd: breakdown.costVnd,
      lineCount: breakdown.lines.length,
    }))
  }

  // ------------------------------------------------- Nhập & điều chỉnh

  @Post('receipts')
  @RequirePermission('stock.receive')
  receive(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.inventory.receive(ReceiveBody.parse(body), req.actor!)
  }

  @Post('adjustments')
  @RequirePermission('stock.write-off')
  adjust(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { approval, ...input } = AdjustBody.parse(body)
    return this.inventory.adjust(input, req.actor!, approval)
  }

  private requireBranch(branch: string | undefined): string {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return branch
  }
}
