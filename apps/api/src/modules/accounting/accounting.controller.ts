import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { InvoiceBuyerSchema } from '@sora/contracts'
import { z } from 'zod'
import { EinvoiceService } from '../einvoice/einvoice.service'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { AccountingService } from './accounting.service'

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')

const Approval = z
  .object({
    approverStaffId: z.number().int().positive(),
    approverPin: z.string().min(4).max(6),
    reason: z.string().min(1).max(300),
  })
  .nullish()

/** Huỷ chỉ còn cho hoá đơn chưa lên cơ quan thuế — đã phát hành thì `replace` */
const VoidBody = z.object({
  reason: z.string().min(1).max(300),
  approval: Approval,
})

const ReplaceBody = z.object({
  reason: z.string().min(1).max(300),
  /** Có mặt thì ghi đè người mua của đơn; null = "Bán cho người tiêu dùng" */
  buyer: InvoiceBuyerSchema.nullable().optional(),
  approval: Approval,
})

/** Trần mỗi lượt bấm: mỗi hoá đơn một lượt gọi nhà cung cấp, hàm Vercel sống 30 giây */
const RetryBody = z.object({
  branchId: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(10),
})

const LockBody = z.object({
  branchId: z.string().min(1),
  month: BusinessDate,
  note: z.string().max(300).nullish(),
})

/**
 * Kế toán — F2 · F3 · F4 · F5 · F6.
 *
 * Quyền theo §4.2: mọi màn sổ sách gắn `accounting.ledger-close-period` (R8 · R10).
 * Hoá đơn là việc của quầy nên đi theo dòng riêng: phát hành `einvoice.issue` (thu
 * ngân trở lên), huỷ/thay thế `einvoice.void-replace-adjust` — thu ngân △, quản lý
 * ca duyệt bằng PIN ngay tại quầy; POS và F3 gọi chung các cửa này.
 */
@Controller('api/accounting')
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly einvoice: EinvoiceService,
  ) {}

  // ------------------------------------------------------------- F2

  @Get('journal')
  @RequirePermission('accounting.ledger-close-period')
  journal(@Query('branch') branch: string, @Query('from') from: string, @Query('to') to: string) {
    return this.accounting.journal(
      this.requireBranch(branch),
      BusinessDate.parse(from),
      BusinessDate.parse(to),
    )
  }

  // ------------------------------------------------------------- F3

  @Get('invoices')
  @RequirePermission('accounting.ledger-close-period')
  invoices(@Query('branch') branch: string, @Query('from') from: string, @Query('to') to: string) {
    return this.accounting.invoices(
      this.requireBranch(branch),
      BusinessDate.parse(from),
      BusinessDate.parse(to),
    )
  }

  @Post('invoices/issue/:orderId')
  @RequirePermission('einvoice.issue')
  issue(@Param('orderId', ParseIntPipe) orderId: number, @Req() req: RequestWithActor) {
    return this.einvoice.issueForOrder(orderId, req.actor!)
  }

  /**
   * Hàng hoá đơn chưa lên được — trạm thu ngân POS hỏi định kỳ, và mỗi lượt hỏi
   * đẩy vài hoá đơn tới lượt (máy chủ không có tiến trình nền).
   */
  @Get('invoices/pending')
  @RequirePermission('einvoice.issue')
  pending(@Query('branch') branch: string) {
    return this.einvoice.queue(this.requireBranch(branch))
  }

  @Post('invoices/retry')
  @RequirePermission('accounting.ledger-close-period')
  retry(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { branchId, limit } = RetryBody.parse(body)
    return this.einvoice.retryAll(branchId, limit, req.actor!)
  }

  @Post('invoices/:id/void')
  @RequirePermission('einvoice.void-replace-adjust')
  voidInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { reason, approval } = VoidBody.parse(body)
    return this.einvoice.voidUnissued(id, reason, req.actor!, approval)
  }

  @Post('invoices/:id/replace')
  @RequirePermission('einvoice.void-replace-adjust')
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { approval, ...input } = ReplaceBody.parse(body)
    return this.einvoice.replace(id, input, req.actor!, approval)
  }

  // ------------------------------------------------------------- F4

  @Get('tax-report')
  @RequirePermission('accounting.ledger-close-period')
  taxReport(@Query('branch') branch: string, @Query('from') from: string, @Query('to') to: string) {
    return this.accounting.taxReport(
      this.requireBranch(branch),
      BusinessDate.parse(from),
      BusinessDate.parse(to),
    )
  }

  // ------------------------------------------------------------- F5

  @Get('debts')
  @RequirePermission('accounting.ledger-close-period')
  debts(@Query('branch') branch: string, @Query('from') from: string, @Query('to') to: string) {
    return this.accounting.debts(
      this.requireBranch(branch),
      BusinessDate.parse(from),
      BusinessDate.parse(to),
    )
  }

  // ------------------------------------------------------------- F6

  @Get('periods')
  @RequirePermission('accounting.ledger-close-period')
  periods(@Query('branch') branch: string) {
    return this.accounting.periods(this.requireBranch(branch))
  }

  @Get('periods/readiness')
  @RequirePermission('accounting.ledger-close-period')
  readiness(@Query('branch') branch: string, @Query('month') month: string) {
    return this.accounting.readiness(this.requireBranch(branch), BusinessDate.parse(month))
  }

  @Post('periods/lock')
  @RequirePermission('accounting.ledger-close-period')
  lock(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.accounting.lockPeriod(LockBody.parse(body), req.actor!)
  }

  private requireBranch(branch: string | undefined): string {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return branch
  }
}
