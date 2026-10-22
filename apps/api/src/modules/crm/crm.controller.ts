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
import { can, PROMOTION_KINDS, PROMOTION_SCOPES } from '@sora/contracts'
import { z } from 'zod'
import { actorRoles } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { Public } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { CorporateService } from './corporate.service'
import { CustomersService } from './customers.service'
import { FeedbackService } from './feedback.service'
import { PromotionsService } from './promotions.service'

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')

const Approval = z
  .object({
    approverStaffId: z.number().int().positive(),
    approverPin: z.string().min(4).max(6),
    reason: z.string().min(1).max(300),
  })
  .nullish()

const PromotionBody = z.object({
  code: z.string().min(2).max(32),
  name: z.string().min(1).max(160),
  scope: z.enum(PROMOTION_SCOPES),
  kind: z.enum(PROMOTION_KINDS),
  badge: z.string().max(24).nullable().default(null),
  percentBp: z.number().int().min(1).max(10_000).nullable().default(null),
  amountVnd: z.number().int().positive().nullable().default(null),
  setPriceVnd: z.number().int().min(0).nullable().default(null),
  buyQty: z.number().int().min(1).max(20).nullable().default(null),
  getQty: z.number().int().min(1).max(20).nullable().default(null),
  getPercent: z.number().int().min(1).max(100).nullable().default(null),
  giftDishId: z.string().min(1).nullable().default(null),
  targetDishIds: z.array(z.string().min(1)).max(200).default([]),
  targetCategoryIds: z.array(z.string().min(1)).max(50).default([]),
  maxDiscountVnd: z.number().int().positive().nullable().default(null),
  channels: z.array(z.enum(['web', 'table', 'pos', 'grab', 'shopee', 'be'])).default([]),
  branchIds: z.array(z.string().min(1)).default([]),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  fromMinute: z.number().int().min(0).max(1439).nullable().default(null),
  toMinute: z.number().int().min(1).max(1440).nullable().default(null),
  minOrderVnd: z.number().int().min(0).default(0),
  requiresVoucher: z.boolean().default(false),
  concentrated: z.boolean().default(false),
  legalNotice: z.string().max(300).nullable().default(null),
  startsOn: BusinessDate,
  endsOn: BusinessDate,
})

const VoucherBatchBody = z.object({
  promotionId: z.number().int().positive(),
  prefix: z.string().min(2).max(16),
  count: z.number().int().min(1).max(500),
  maxUses: z.number().int().min(1).max(10_000).default(1),
  expiresOn: BusinessDate.nullable().default(null),
})

const CustomerBody = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().max(120).nullable().default(null),
  allergies: z.string().max(300).nullable().default(null),
  note: z.string().max(500).nullable().default(null),
})

const CorporateBody = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(1).max(160),
  taxCode: z.string().regex(/^\d{10}(-\d{3})?$/, 'MST gồm 10 số, đơn vị phụ thuộc thêm -3 số'),
  contactName: z.string().max(120).nullable().default(null),
  contactPhone: z.string().max(40).nullable().default(null),
  contactEmail: z.string().email().max(160).nullable().default(null),
  address: z.string().max(300).nullable().default(null),
  creditLimitVnd: z.number().int().min(0),
  paymentTermDays: z.number().int().min(0).max(180).default(30),
  reconcileDay: z.number().int().min(1).max(28).default(1),
  blockAfterOverdueDays: z.number().int().min(0).max(365).nullable().default(null),
  active: z.boolean().default(true),
})

/**
 * B11 – B15 · Khuyến mãi · Sổ khách · Phản hồi · Tích điểm · Khách doanh nghiệp.
 *
 * Quyền lấy từ hai đoạn văn xuôi cuối §4.2b (xem `packages/contracts/permissions.ts`).
 * Ba chỗ đáng chú ý:
 *
 *  · **Số điện thoại** — `customer.view-phone-full` quyết định trả số đầy đủ hay
 *    số che ba số giữa. Quyết định ở đây, không ở màn hình: một màn quên che là
 *    một màn rò dữ liệu, còn API trả chuỗi đã che thì không có đường rò.
 *
 *  · **Gửi đánh giá là route CÔNG KHAI** — người bấm là khách ở T15/O7, họ không
 *    có tài khoản. Bằng chứng họ được đánh giá đơn này là họ đang cầm mã đơn.
 *
 *  · **B14 không có route ghi cấu hình.** Sáu con số của nó là tham số A6, sửa
 *    qua `PUT /api/admin/parameters/:key` — một nguồn, một cửa (§29.1).
 */
@Controller('api/crm')
export class CrmController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly customers: CustomersService,
    private readonly feedback: FeedbackService,
    private readonly corporate: CorporateService,
  ) {}

  // ============================================================ B11 · Khuyến mãi

  @Get('promotions')
  @RequirePermission('promo.compose')
  listPromotions() {
    return this.promotions.list()
  }

  @Get('promotions/:id/vouchers')
  @RequirePermission('promo.compose')
  vouchers(@Param('id', ParseIntPipe) id: number) {
    return this.promotions.vouchers(id)
  }

  @Post('promotions')
  @RequirePermission('promo.compose')
  createPromotion(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.promotions.save(PromotionBody.parse(body), null, req.actor!)
  }

  @Put('promotions/:id')
  @RequirePermission('promo.compose')
  updatePromotion(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.promotions.save(PromotionBody.parse(body), id, req.actor!)
  }

  /** Bật là `promo.activate` — R9 rơi vào △ nên phải kèm PIN R11/R10 */
  @Post('promotions/:id/state')
  @RequirePermission('promo.activate')
  setPromotionState(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const parsed = z
      .object({ state: z.enum(['active', 'paused', 'ended']), approval: Approval })
      .parse(body)
    return this.promotions.setState(id, parsed.state, req.actor!, parsed.approval)
  }

  @Post('promotions/vouchers')
  @RequirePermission('promo.compose')
  issueVouchers(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.promotions.issueVouchers(VoucherBatchBody.parse(body), req.actor!)
  }

  @Post('promotions/vouchers/:id/void')
  @RequirePermission('promo.compose')
  voidVoucher(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.promotions.voidVoucher(id, req.actor!)
  }

  /**
   * Chương trình đang chạy của một chi nhánh — iPad, POS, web in giá giảm lên thẻ
   * món từ đây. CÔNG KHAI như thực đơn; chương trình cần mã voucher không lộ ra.
   */
  @Public()
  @Get('promotions/live')
  livePromotions(@Query('branch') branch: string) {
    return this.promotions.live(this.requireBranch(branch))
  }

  /**
   * Đơn đang được giảm bao nhiêu và còn thiếu bao nhiêu cho mức kế tiếp; có mã thì
   * chấm thử mã. Chỉ đọc — gắn `menu.view-price` vì đây là câu hỏi về GIÁ mà mọi
   * vai trò bán hàng đều hỏi được.
   */
  @Get('promotions/quote')
  @RequirePermission('menu.view-price')
  quote(
    @Query('order', ParseIntPipe) orderId: number,
    @Req() req: RequestWithActor,
    @Query('voucher') voucher?: string,
  ) {
    return this.promotions.quote(orderId, voucher ?? null, req.actor!)
  }

  /**
   * Gắn mã voucher vào đơn. Gắn `order.create`: ghi vào đơn là việc của người được
   * gọi món — khách ở bàn tự gõ mã được, nhưng chỉ vào đơn của chính bàn mình.
   * Gắn lại cùng mã là no-op nên hàng đợi offline gửi lại không trừ lượt hai lần.
   */
  @Post('promotions/apply-voucher')
  @RequirePermission('order.create')
  applyVoucher(@Body() body: unknown, @Req() req: RequestWithActor) {
    const parsed = z
      .object({
        orderId: z.number().int().positive(),
        voucherCode: z.string().min(1).max(40),
      })
      .parse(body)
    return this.promotions.applyVoucher(parsed, req.actor!)
  }

  /** Gỡ mã gắn nhầm — trả lượt cho mã, tính lại tiền. Cùng quyền với gắn mã */
  @Post('promotions/remove-voucher')
  @RequirePermission('order.create')
  removeVoucher(@Body() body: unknown, @Req() req: RequestWithActor) {
    const parsed = z.object({ orderId: z.number().int().positive() }).parse(body)
    return this.promotions.removeVoucher(parsed.orderId, req.actor!)
  }

  // ============================================================== B12 · Sổ khách

  @Get('customers')
  @RequirePermission('customer.view-book')
  listCustomers(@Query() query: Record<string, string>, @Req() req: RequestWithActor) {
    const parsed = z
      .object({
        search: z.string().max(60).nullish().transform((v) => v ?? null),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(query)
    return this.customers.list(parsed, this.seesFullPhone(req))
  }

  @Get('customers/:id')
  @RequirePermission('customer.view-book')
  customer(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.customers.profile(id, this.seesFullPhone(req))
  }

  /**
   * Sửa tên / dị ứng / ghi chú. Gắn `customer.view-phone-full` chứ không gắn
   * `customer.view-book`: người sửa hồ sơ phải là người nhìn thấy đủ số điện
   * thoại của khách đó — sửa hồ sơ mình không định danh được là sửa mù.
   */
  @Put('customers')
  @RequirePermission('customer.view-phone-full')
  saveCustomer(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.customers.saveProfile(CustomerBody.parse(body), req.actor!)
  }

  // ====================================================== B14 · Tích điểm & hạng

  /** Sáu con số đang hiệu lực — B14 đọc để hiện, sửa thì qua A6 */
  @Get('loyalty/config')
  @RequirePermission('customer.view-book')
  loyaltyConfig(@Query('branch') branch?: string) {
    return this.customers.config(branch ?? null)
  }

  @Get('loyalty/quote')
  @RequirePermission('loyalty.redeem-at-pos')
  quoteRedemption(@Query() query: Record<string, string>) {
    const parsed = z
      .object({
        customerId: z.coerce.number().int().positive(),
        points: z.coerce.number().int().min(1),
        payableVnd: z.coerce.number().int().min(1),
        branchId: z.string().min(1),
      })
      .parse(query)
    return this.customers.quoteRedemption(parsed)
  }

  /** Cánh cửa duy nhất đi vòng qua "điểm chỉ sinh từ thanh toán" — chỉ R11/R10 */
  @Post('loyalty/adjust')
  @RequirePermission('loyalty.adjust-manual')
  adjustPoints(@Body() body: unknown, @Req() req: RequestWithActor) {
    const parsed = z
      .object({
        customerId: z.number().int().positive(),
        points: z.number().int(),
        reason: z.string().min(1).max(300),
      })
      .parse(body)
    return this.customers.adjust(parsed, req.actor!)
  }

  // ============================================================ B13 · Phản hồi

  /**
   * Khối đánh giá 1 chạm của T15 / O7 gửi vào đây. CÔNG KHAI: người bấm là khách.
   *
   * Không nhận `customerId` hay `branchId` từ client — cả hai suy ra từ đơn. Cho
   * client khai chi nhánh là cho phép dồn đánh giá xấu sang chi nhánh khác.
   */
  @Public()
  @Post('feedback')
  submitFeedback(@Body() body: unknown) {
    const parsed = z
      .object({
        orderId: z.number().int().positive(),
        stars: z.number().int().min(1).max(5),
        comment: z.string().max(1000).nullable().default(null),
        source: z.enum(['table', 'online']),
      })
      .parse(body)
    return this.feedback.submit(parsed)
  }

  @Get('feedback')
  @RequirePermission('feedback.respond')
  feedbackQueue(@Query('branch') branch: string, @Query('resolved') resolved?: string) {
    return this.feedback.queue(this.requireBranch(branch), resolved === 'true')
  }

  @Get('feedback/summary')
  @RequirePermission('feedback.respond')
  feedbackSummary(@Query() query: Record<string, string>) {
    const parsed = z
      .object({ branch: z.string().min(1), from: BusinessDate, to: BusinessDate })
      .parse(query)
    return this.feedback.summary(parsed.branch, parsed.from, parsed.to)
  }

  @Post('feedback/:id/assign')
  @RequirePermission('feedback.respond')
  assignFeedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const parsed = z
      .object({ staffId: z.number().int().positive().nullish().transform((v) => v ?? null) })
      .parse(body ?? {})
    return this.feedback.assign(id, parsed.staffId, req.actor!)
  }

  @Post('feedback/:id/resolve')
  @RequirePermission('feedback.respond')
  resolveFeedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const parsed = z.object({ resolution: z.string().min(1).max(1000) }).parse(body)
    return this.feedback.resolve(id, parsed.resolution, req.actor!)
  }

  // ==================================================== B15 · Khách doanh nghiệp

  @Get('corporate')
  @RequirePermission('corporate.edit-profile')
  listCorporate() {
    return this.corporate.list()
  }

  @Post('corporate')
  @RequirePermission('corporate.edit-profile')
  createCorporate(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.corporate.save(CorporateBody.parse(body), null, req.actor!)
  }

  @Put('corporate/:id')
  @RequirePermission('corporate.edit-profile')
  updateCorporate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.corporate.save(CorporateBody.parse(body), id, req.actor!)
  }

  @Get('corporate/:id/statement')
  @RequirePermission('corporate.edit-profile')
  statement(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.corporate.statement(id, BusinessDate.parse(from), BusinessDate.parse(to))
  }

  /** P10 "Ghi nợ công ty" — ô tìm công ty; R2 qua được cửa vì ở mức △ */
  @Get('corporate/pick')
  @RequirePermission('corporate.charge-at-pos')
  pickCorporate(@Query('q') q?: string) {
    return this.corporate.pick(q ?? '')
  }

  /** P10 "Ghi nợ công ty" — R2 thao tác ở mức △, cần PIN của R7 */
  @Post('corporate/charges')
  @RequirePermission('corporate.charge-at-pos')
  charge(@Body() body: unknown, @Req() req: RequestWithActor) {
    const parsed = z
      .object({
        corporateId: z.number().int().positive(),
        orderId: z.number().int().positive(),
        signer: z.string().max(120).nullable().default(null),
        approval: Approval,
      })
      .parse(body)
    return this.corporate.charge(parsed, req.actor!, parsed.approval)
  }

  @Post('corporate/settlements')
  @RequirePermission('corporate.settle-writeoff')
  settle(@Body() body: unknown, @Req() req: RequestWithActor) {
    const parsed = z
      .object({
        chargeId: z.number().int().positive(),
        kind: z.enum(['payment', 'write-off']).default('payment'),
        amountVnd: z.number().int().positive(),
        paidOn: BusinessDate,
        paymentId: z.number().int().positive().nullable().default(null),
        note: z.string().max(300).nullable().default(null),
      })
      .parse(body)
    return this.corporate.settle(parsed, req.actor!)
  }

  // ================================================================== Nội bộ

  private seesFullPhone(req: RequestWithActor): boolean {
    return can('customer.view-phone-full', actorRoles(req.actor!))
  }

  private requireBranch(branch: string | undefined): string {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return branch
  }
}
