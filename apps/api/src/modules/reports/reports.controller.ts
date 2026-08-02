import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common'
import { can } from '@sora/contracts'
import { z } from 'zod'
import { actorRoles } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { BusinessReportsService } from './business.service'
import { COMPARE_KINDS, PERIOD_KINDS } from './domain/period'
import { ReportsService } from './reports.service'

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')

const PeriodQuery = z
  .object({
    kind: z.enum(PERIOD_KINDS).default('thang'),
    compare: z.enum(COMPARE_KINDS).default('ky-truoc'),
    anchor: BusinessDate.nullish().transform((v) => v ?? null),
    from: BusinessDate.optional(),
    to: BusinessDate.optional(),
  })
  .refine((q) => q.kind !== 'tuy-chon' || (q.from && q.to), {
    message: 'Kỳ tuỳ chọn phải có từ ngày và đến ngày',
  })

/**
 * Nhóm báo cáo B1 · B3 · F1 · F7 — chỉ ĐỌC, không có route ghi nào.
 *
 * Quyền lấy nguyên từ ma trận §4.2, không thêm dòng mới (cùng lý do đã ghi ở
 * `AdminController`: đổi ma trận là việc của bản thiết kế, không phải của lớp
 * cài đặt). Ánh xạ:
 *   · B1 → `report.branch-revenue`  — doanh thu chi nhánh (R7 · R8 · R11 · R10)
 *   · B3 → `report.margin-foodcost` — lãi gộp / food cost (thêm R5 bếp trưởng,
 *     đúng ý §4.3.3 tách quyền xem giá vốn khỏi quyền xem doanh thu)
 *   · F1 → `accounting.ledger-close-period` — sổ quỹ thuộc §28 Kế toán, chỉ R8 · R10.
 *   · F7 → `report.pnl-branch-summary` của §4.2b.
 *
 * Ghi chú sửa lại quyết định cũ: F7 từng gắn `accounting.ledger-close-period`, và
 * khi đó đã ghi rằng R11 không vào được vì §4.2 không có dòng nào cho vai trò ấy.
 * §4.2b thì CÓ — hai dòng "xem Lãi/Lỗ đầy đủ" và "dạng gộp" mở F7 cho cả R7 lẫn
 * R11. Ma trận đã mã hoá xong nên đây là lúc sửa.
 */
@Controller('api/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly business: BusinessReportsService,
  ) {}

  /** B1 — Hôm nay */
  @Get('today')
  @RequirePermission('report.branch-revenue')
  today(@Query('branch') branch: string, @Query('date') date?: string) {
    return this.reports.today(this.requireBranch(branch), date ? BusinessDate.parse(date) : null)
  }

  /** B3 — Phân tích món */
  @Get('menu-matrix')
  @RequirePermission('report.margin-foodcost')
  menuMatrix(@Query('branch') branch: string, @Query() query: Record<string, string>) {
    return this.reports.menuMatrix(this.requireBranch(branch), PeriodQuery.parse(query))
  }

  /** F1 — Sổ quỹ & đối soát ngân hàng */
  @Get('cashbook')
  @RequirePermission('accounting.ledger-close-period')
  cashbook(@Query('branch') branch: string, @Query('date') date?: string) {
    return this.reports.cashbook(this.requireBranch(branch), date ? BusinessDate.parse(date) : null)
  }

  /**
   * F7 — Báo cáo Lãi/Lỗ.
   *
   * Hai mức xem của §4.2b gộp vào MỘT route: ai vào được thì đọc `pnl-branch-summary`
   * (thêm R7 quản lý ca và R11 quản lý chuỗi), còn chi tiết lương từng người chỉ
   * kèm theo khi người gọi có `report.pnl-full`. Tách thành hai đường dẫn sẽ có
   * ngày một màn hình gọi nhầm đường dẫn rộng hơn.
   */
  @Get('pnl')
  @RequirePermission('report.pnl-branch-summary')
  profitLoss(
    @Query('branch') branch: string,
    @Query() query: Record<string, string>,
    @Req() req: RequestWithActor,
  ) {
    const basis = query.basis === 'dong-tien' ? 'dong-tien' : 'don-tich'
    const detailLevel = can('report.pnl-full', actorRoles(req.actor!)) ? 'full' : 'summary'
    return this.reports.profitLoss(this.requireBranch(branch), PeriodQuery.parse(query), {
      basis,
      detailLevel,
    })
  }

  // ============================================ B2 · B4 … B9

  /**
   * Bảy màn dưới đây chia làm hai mức quyền, đúng nguyên tắc §4.3.3 tách quyền
   * xem GIÁ VỐN khỏi quyền xem DOANH THU:
   *   · `report.branch-revenue`  — B2 doanh thu · B6 vòng quay bàn · B7 nhân sự ·
   *     B9 online & đặt bàn. Quản lý ca đọc được.
   *   · `report.margin-foodcost` — B4 giá vốn & lãi gộp · B8 set. Thêm bếp trưởng,
   *     vì đó là người sửa công thức khi food cost bung.
   * B5 hiệu suất bếp gắn `report.margin-foodcost` chứ không gắn doanh thu: nó
   * không có con số tiền nào, nhưng bếp trưởng là người đọc nó nhiều nhất.
   */

  /** B2 — Doanh thu, cắt theo năm lát */
  @Get('revenue')
  @RequirePermission('report.branch-revenue')
  revenue(@Query('branch') branch: string, @Query() query: Record<string, string>) {
    return this.business.revenue(this.requireBranch(branch), PeriodQuery.parse(query))
  }

  /** B4 — Giá vốn & lãi gộp */
  @Get('cost-margin')
  @RequirePermission('report.margin-foodcost')
  costMargin(@Query('branch') branch: string, @Query() query: Record<string, string>) {
    return this.business.costAndMargin(this.requireBranch(branch), PeriodQuery.parse(query))
  }

  /** B5 — Hiệu suất bếp */
  @Get('kitchen')
  @RequirePermission('report.margin-foodcost')
  kitchen(@Query('branch') branch: string, @Query() query: Record<string, string>) {
    return this.business.kitchenPerformance(this.requireBranch(branch), PeriodQuery.parse(query))
  }

  /** B6 — Vòng quay bàn */
  @Get('table-turnover')
  @RequirePermission('report.branch-revenue')
  tableTurnover(@Query('branch') branch: string, @Query() query: Record<string, string>) {
    return this.business.tableTurnover(this.requireBranch(branch), PeriodQuery.parse(query))
  }

  /** B7 — Nhân sự. Không có số lương ở đây — nguyên tắc cứng thứ tư. */
  @Get('staff')
  @RequirePermission('report.branch-revenue')
  staffPerformance(@Query('branch') branch: string, @Query() query: Record<string, string>) {
    return this.business.staffPerformance(this.requireBranch(branch), PeriodQuery.parse(query))
  }

  /** B8 — Set & giảm giá */
  @Get('sets')
  @RequirePermission('report.margin-foodcost')
  sets(@Query('branch') branch: string, @Query() query: Record<string, string>) {
    return this.business.setsAndPromotions(this.requireBranch(branch), PeriodQuery.parse(query))
  }

  /** B9 — Online & đặt bàn */
  @Get('online')
  @RequirePermission('report.branch-revenue')
  online(@Query('branch') branch: string, @Query() query: Record<string, string>) {
    return this.business.onlineAndReservations(this.requireBranch(branch), PeriodQuery.parse(query))
  }

  private requireBranch(branch: string | undefined): string {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return branch
  }
}
