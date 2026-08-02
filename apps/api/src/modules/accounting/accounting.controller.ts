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
import { z } from 'zod'
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

const VoidBody = z.object({
  reason: z.string().min(1).max(300),
  replace: z.boolean().default(false),
  approval: Approval,
})

const LockBody = z.object({
  branchId: z.string().min(1),
  month: BusinessDate,
  note: z.string().max(300).nullish(),
})

/**
 * Kế toán — F2 · F3 · F4 · F5 · F6.
 *
 * Quyền theo §4.2: mọi màn sổ sách gắn `accounting.ledger-close-period` (R8 · R10),
 * riêng huỷ/thay thế hoá đơn dùng dòng `einvoice.void-replace-adjust` — dòng duy
 * nhất trong ma trận cho quản lý ca R7 chạm tới hoá đơn, và chỉ ở mức △.
 *
 * Phát hành hoá đơn (`issue`) KHÔNG gắn dòng huỷ/thay thế: phát hành là việc bình
 * thường của thu ngân khi in bill, còn huỷ mới là việc phải duyệt. Ở bản dựng này
 * cửa phát hành nằm trong Office nên vẫn để mức kế toán.
 */
@Controller('api/accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

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
  @RequirePermission('accounting.ledger-close-period')
  issue(@Param('orderId', ParseIntPipe) orderId: number, @Req() req: RequestWithActor) {
    return this.accounting.issue(orderId, req.actor!)
  }

  @Post('invoices/:id/void')
  @RequirePermission('einvoice.void-replace-adjust')
  voidInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { approval, ...input } = VoidBody.parse(body)
    return this.accounting.voidInvoice(id, input, req.actor!, approval)
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
