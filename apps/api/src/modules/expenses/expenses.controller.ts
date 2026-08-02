import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { ExpensesService } from './expenses.service'

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')

const Approval = z
  .object({
    approverStaffId: z.number().int().positive(),
    approverPin: z.string().min(4).max(6),
    reason: z.string().min(1).max(300),
  })
  .nullish()

const VoucherBody = z.object({
  branchId: z.string().min(1),
  categoryId: z.string().min(1),
  kind: z.enum(['expense', 'advance']).default('expense'),
  supplier: z.string().max(160).nullable().default(null),
  memo: z.string().max(300).nullable().default(null),
  amountVnd: z.number().int().positive(),
  vatVnd: z.number().int().min(0).default(0),
  method: z.enum(['cash', 'transfer']),
  amortizeMonths: z.number().int().min(1).max(60).default(1),
  amortizeFrom: BusinessDate,
  advanceEmployeeId: z.number().int().positive().nullable().default(null),
  paidOn: BusinessDate,
  approval: Approval,
})

const BudgetBody = z.object({
  branchId: z.string().min(1),
  categoryId: z.string().min(1),
  month: BusinessDate,
  amountVnd: z.number().int().min(0),
})

const RecurringBody = z.object({
  branchId: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().min(1).max(120),
  supplier: z.string().max(160).nullable().default(null),
  expectedVnd: z.number().int().positive(),
  dayOfMonth: z.number().int().min(1).max(28),
  method: z.enum(['cash', 'transfer']).default('transfer'),
})

const AssetBody = z.object({
  branchId: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().min(1).max(160),
  costVnd: z.number().int().positive(),
  inServiceFrom: BusinessDate,
  depreciationMonths: z.number().int().min(1).max(600),
  note: z.string().max(300).nullable().default(null),
})

const MonthBody = z.object({ branchId: z.string().min(1), month: BusinessDate })

/**
 * Chi phí & tài sản — C1 · C2 · C3 · C4 · C6.
 *
 * Quyền lấy nguyên bảng §4.2b. Điểm khác mọi controller khác trong dự án: **quyền
 * ghi phiếu chi phụ thuộc SỐ TIỀN**, mà số tiền chỉ biết sau khi đọc body. Nên
 * route `POST vouchers` gắn `expense.record-petty` (mức thấp nhất còn ghi được) để
 * guard loại sớm vai trò không liên quan, còn tầng dịch vụ mới tính bậc thật và
 * gọi `ApprovalService` với đúng hành động — đó là chỗ dòng "trên hạn mức" của
 * bảng thật sự có hiệu lực.
 */
@Controller('api/expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  // ------------------------------------------------------- C6

  @Get('categories')
  @RequirePermission('expense.record-petty')
  categories() {
    return this.expenses.categories()
  }

  @Get('budgets')
  @RequirePermission('expense.approve')
  budgets(@Query('branch') branch: string, @Query('month') month: string) {
    return this.expenses.budgets(this.requireBranch(branch), BusinessDate.parse(month))
  }

  @Put('budgets')
  @RequirePermission('expense.approve')
  setBudget(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.expenses.setBudget(BudgetBody.parse(body), req.actor!)
  }

  // ------------------------------------------------------- C2

  @Get('vouchers')
  @RequirePermission('expense.record-petty')
  vouchers(
    @Query('branch') branch: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.expenses.vouchers(
      this.requireBranch(branch),
      BusinessDate.parse(from),
      BusinessDate.parse(to),
    )
  }

  @Post('vouchers')
  @RequirePermission('expense.record-petty')
  createVoucher(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { approval, ...input } = VoucherBody.parse(body)
    return this.expenses.createVoucher(input, req.actor!, approval)
  }

  @Post('vouchers/:id/approve')
  @RequirePermission('expense.approve')
  approveVoucher(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.expenses.approveVoucher(id, req.actor!)
  }

  /** Nhân viên để chọn khi ghi phiếu tạm ứng */
  @Get('advance-targets')
  @RequirePermission('expense.record-petty')
  advanceTargets(@Query('branch') branch: string) {
    return this.expenses.employeesOf(this.requireBranch(branch))
  }

  // ------------------------------------------------------- C3

  @Get('recurring')
  @RequirePermission('expense.record-petty')
  recurring(@Query('branch') branch: string) {
    return this.expenses.recurring(this.requireBranch(branch))
  }

  @Post('recurring')
  @RequirePermission('expense.approve')
  createRecurring(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.expenses.createRecurring(RecurringBody.parse(body), req.actor!)
  }

  @Post('recurring/generate')
  @RequirePermission('expense.approve')
  generateRecurring(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId, month } = MonthBody.parse(body)
    return this.expenses.generateRecurring(branchId, month, req.actor!)
  }

  // ------------------------------------------------------- C4

  @Get('assets')
  @RequirePermission('asset.ledger')
  assets(@Query('branch') branch: string) {
    return this.expenses.assets(this.requireBranch(branch))
  }

  @Post('assets')
  @RequirePermission('asset.ledger')
  createAsset(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.expenses.createAsset(AssetBody.parse(body), req.actor!)
  }

  @Post('assets/:id/retire')
  @RequirePermission('asset.ledger')
  retireAsset(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { retiredOn } = z.object({ retiredOn: BusinessDate }).parse(body)
    return this.expenses.retireAsset(id, retiredOn, req.actor!)
  }

  @Post('assets/depreciation')
  @RequirePermission('asset.ledger')
  generateDepreciation(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId, month } = MonthBody.parse(body)
    return this.expenses.generateDepreciation(branchId, month, req.actor!)
  }

  // ------------------------------------------------------- C1

  @Get('overview')
  @RequirePermission('expense.record-petty')
  overview(@Query('branch') branch: string, @Query('month') month: string) {
    return this.expenses.overview(this.requireBranch(branch), BusinessDate.parse(month))
  }

  private requireBranch(branch: string | undefined): string {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return branch
  }
}
