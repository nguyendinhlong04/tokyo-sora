import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  KINDS_BY_SCOPE,
  LEGAL_MAX_DISCOUNT_RATE,
  nextBillHint,
  priceBill,
  type PromotionKind,
  type PromotionScope,
} from '@sora/contracts'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import { isUniqueViolation } from '../../common/pg-error'
import type { Db } from '../../db/client'
import {
  branches,
  categories,
  dishes,
  orders,
  promotionRedemptions,
  promotions,
  staff,
  voucherCodes,
} from '../../db/schema'
import { assertOwnTableSession, type Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import { OrderingService } from '../ordering/ordering.service'
import {
  clockOf,
  contextOf,
  heldFor,
  pricedLinesOf,
  ruleOf,
  rulesOn,
} from '../ordering/promo-pricing'

export interface PromotionInput {
  code: string
  name: string
  scope: PromotionScope
  kind: PromotionKind
  badge: string | null
  percentBp: number | null
  amountVnd: number | null
  setPriceVnd: number | null
  buyQty: number | null
  getQty: number | null
  getPercent: number | null
  /** Món được tặng — chỉ loại `free_dish` */
  giftDishId: string | null
  targetDishIds: string[]
  targetCategoryIds: string[]
  maxDiscountVnd: number | null
  channels: string[]
  branchIds: string[]
  weekdays: number[]
  fromMinute: number | null
  toMinute: number | null
  minOrderVnd: number
  requiresVoucher: boolean
  concentrated: boolean
  legalNotice: string | null
  startsOn: string
  endsOn: string
}

/**
 * B11 — Khuyến mãi & voucher, áp CHUNG cho mọi kênh (§9.6).
 *
 * Màn này soạn chương trình; phép chấm nằm ở `@sora/contracts/promotions` và tiền
 * giảm được ghi THẲNG vào đơn ở luồng gọi món (`OrderingService`) — iPad tại bàn,
 * POS, web đều đi qua một cửa đó nên không kênh nào lệch kênh nào. Phần quan
 * trọng nhất ở đây là ba chốt chặn:
 *
 *   · **Soạn ≠ kích hoạt.** R9 marketing soạn được, nhưng bật một chương trình là
 *     đụng giá bán nên phải có R11/R10 duyệt (§4.2b). Hai quyền riêng, và lượt
 *     duyệt để lại bản ghi trên chính chương trình đó.
 *   · **Trần theo luật.** Giảm quá 50% (hay "mua 1 tặng 1") chỉ được khi là chương
 *     trình khuyến mại tập trung — chặn ngay lúc soạn, không để tới lúc bị phạt.
 *   · **Không cộng dồn.** Một dòng một chương trình món, hoá đơn một chương trình
 *     hoá đơn chỉ trên dòng chưa giảm — mức lợi nhất cho khách.
 */
@Injectable()
export class PromotionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly params: ParamsService,
    private readonly ordering: OrderingService,
  ) {}

  // ================================================================ Danh sách

  /**
   * Sổ chương trình. Kèm số lượt đã dùng và tổng tiền đã giảm — một chương trình
   * không có hai con số đó thì không ai biết nó đang tốn bao nhiêu.
   */
  async list() {
    const rows = await this.db
      .select({ promo: promotions, giftDishName: dishes.nameVi, activatedBy: staff.fullName })
      .from(promotions)
      .leftJoin(dishes, eq(dishes.id, promotions.targetDishId))
      .leftJoin(staff, eq(staff.id, promotions.activatedBy))
      .orderBy(desc(promotions.startsOn), asc(promotions.code))

    const [used, codes] = await Promise.all([
      this.db
        .select({
          promotionId: promotionRedemptions.promotionId,
          uses: sql<number>`count(*)::int`,
          discountVnd: sql<number>`coalesce(sum(${promotionRedemptions.discountVnd}), 0)::float8`,
        })
        .from(promotionRedemptions)
        .groupBy(promotionRedemptions.promotionId),
      this.db
        .select({
          promotionId: voucherCodes.promotionId,
          batch: sql<number>`count(*)::int`,
          live: sql<number>`count(*) filter (where ${voucherCodes.state} = 'live'
                                              and ${voucherCodes.usedCount} < ${voucherCodes.maxUses})::int`,
        })
        .from(voucherCodes)
        .groupBy(voucherCodes.promotionId),
    ])

    const usedBy = new Map(used.map((u) => [u.promotionId, u]))
    const codesBy = new Map(codes.map((c) => [c.promotionId, c]))

    return rows.map(({ promo, giftDishName, activatedBy }) => ({
      ...ruleOf(promo),
      legalNotice: promo.legalNotice,
      giftDishName,
      state: promo.state,
      activatedAt: promo.activatedAt,
      activatedBy,
      uses: usedBy.get(promo.id)?.uses ?? 0,
      discountVnd: Math.round(usedBy.get(promo.id)?.discountVnd ?? 0),
      voucherCount: codesBy.get(promo.id)?.batch ?? 0,
      voucherLive: codesBy.get(promo.id)?.live ?? 0,
    }))
  }

  /**
   * Chương trình đang chạy của một chi nhánh, cho app in giá giảm lên thẻ món và
   * báo trước ưu đãi hoá đơn (§9.6). CÔNG KHAI như thực đơn: khách ở web và ở bàn
   * đều cần thấy giá. Chương trình cần mã voucher không lộ ra đây.
   *
   * Trả cả trần luật đang chạy: app tự cắt đúng như máy chủ sẽ cắt, giá trên thẻ
   * món mới khớp giá trên bill. Và trả GIỜ CỦA CHI NHÁNH tính ở máy chủ: iPad để
   * cả buổi, đồng hồ máy lệch được, còn giờ vàng phải bật đúng giờ của quán — app
   * hỏi lại mỗi phút thay vì tự đoán múi giờ.
   */
  async live(branchId: string) {
    const [branch] = await this.db
      .select({ timezone: branches.timezone })
      .from(branches)
      .where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)

    const now = new Date()
    const rows = await rulesOn(this.db, businessDateOf(now, branch.timezone))
    return {
      clock: clockOf(now, branch.timezone),
      maxDiscountRate: await this.params.getNumber(
        'promo.maxDiscountRate',
        LEGAL_MAX_DISCOUNT_RATE,
        branchId,
      ),
      rules: rows
        .filter((r) => !r.requiresVoucher)
        .filter((r) => r.branchIds.length === 0 || r.branchIds.includes(branchId))
        .map(ruleOf),
    }
  }

  /** Lô mã của một chương trình */
  async vouchers(promotionId: number) {
    return this.db
      .select({
        id: voucherCodes.id,
        code: voucherCodes.code,
        maxUses: voucherCodes.maxUses,
        usedCount: voucherCodes.usedCount,
        expiresOn: voucherCodes.expiresOn,
        state: voucherCodes.state,
      })
      .from(voucherCodes)
      .where(eq(voucherCodes.promotionId, promotionId))
      .orderBy(asc(voucherCodes.code))
  }

  // ================================================================ Soạn thảo

  async save(input: PromotionInput, id: number | null, actor: Actor) {
    validateShape(
      input,
      await this.params.getNumber('promo.maxDiscountRate', LEGAL_MAX_DISCOUNT_RATE),
    )

    return this.db.transaction(async (tx) => {
      // Mảng mã không có khoá ngoại (món ngừng bán thì chương trình cũ vẫn đọc lại
      // được) nên kiểm ở cửa: một mã gõ sai là một chương trình không bao giờ ăn
      const wantDishes = [...new Set(input.targetDishIds)]
      if (wantDishes.length > 0) {
        const found = await tx
          .select({ id: dishes.id })
          .from(dishes)
          .where(inArray(dishes.id, wantDishes))
        const missing = wantDishes.filter((d) => !found.some((f) => f.id === d))
        if (missing.length > 0) throw new BadRequestException(`Không có món: ${missing.join(', ')}`)
      }
      const wantCategories = [...new Set(input.targetCategoryIds)]
      if (wantCategories.length > 0) {
        const found = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(inArray(categories.id, wantCategories))
        const missing = wantCategories.filter((c) => !found.some((f) => f.id === c))
        if (missing.length > 0)
          throw new BadRequestException(`Không có nhóm món: ${missing.join(', ')}`)
      }

      const kind = input.kind
      // Giảm %/tiền cả hoá đơn không có món áp dụng — bỏ đi chứ không lưu một danh
      // sách không ai đọc
      const keepTargets = input.scope === 'item' || kind === 'free_dish'
      const values = {
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        scope: input.scope,
        kind,
        badge: input.badge?.trim() || null,
        percentBp: kind === 'percent' ? input.percentBp : null,
        amountVnd: kind === 'amount' ? input.amountVnd : null,
        setPriceVnd: kind === 'set_price' ? input.setPriceVnd : null,
        buyQty: kind === 'buy_x_get_y' ? input.buyQty : null,
        getQty: kind === 'buy_x_get_y' ? input.getQty : null,
        getPercent: kind === 'buy_x_get_y' ? input.getPercent : null,
        targetDishId: kind === 'free_dish' ? input.giftDishId : null,
        targetDishIds: keepTargets ? wantDishes : [],
        targetCategoryIds: keepTargets ? wantCategories : [],
        maxDiscountVnd: input.maxDiscountVnd,
        channels: input.channels,
        branchIds: input.branchIds,
        weekdays: input.weekdays,
        fromMinute: input.fromMinute,
        toMinute: input.toMinute,
        minOrderVnd: input.minOrderVnd,
        requiresVoucher: input.requiresVoucher,
        concentrated: input.concentrated,
        legalNotice: input.legalNotice?.trim() || null,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      }

      let row
      if (id === null) {
        try {
          const [created] = await tx
            .insert(promotions)
            .values({ ...values, createdBy: staffIdOf(actor) })
            .returning()
          row = created!
        } catch (err) {
          if (isUniqueViolation(err)) throw new ConflictException('Mã chương trình đã tồn tại')
          throw err
        }
      } else {
        const [current] = await tx.select().from(promotions).where(eq(promotions.id, id))
        if (!current) throw new NotFoundException('Không có chương trình này')
        // Sửa một chương trình ĐANG CHẠY là đổi giá của những bill sắp in ra mà
        // không ai duyệt. Muốn sửa thì tạm dừng trước — một thao tác, có dấu vết.
        if (current.state === 'active') {
          throw new ConflictException(
            'Chương trình đang chạy — tạm dừng trước khi sửa, vì sửa lúc chạy là đổi giá không ai duyệt',
          )
        }
        const [updated] = await tx
          .update(promotions)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(promotions.id, id))
          .returning()
        row = updated!
      }

      await this.audit.write(tx, {
        actor,
        action: id === null ? 'promotion.create' : 'promotion.update',
        entity: 'promotion',
        entityId: String(row.id),
        payload: { code: row.code, kind: row.kind },
      })
      return row
    })
  }

  /**
   * Bật / tạm dừng / kết thúc.
   *
   * Bật là hành động `promo.activate` — R9 rơi vào mức △ nên phải kèm PIN của
   * R11/R10. Tạm dừng và kết thúc thì KHÔNG cần duyệt: dừng một chương trình
   * không bao giờ làm khách trả nhiều hơn, và bắt xin phép để dừng là cách chắc
   * chắn nhất để một chương trình lỗi chạy thêm hai tiếng.
   */
  async setState(
    id: number,
    state: 'active' | 'paused' | 'ended',
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(promotions).where(eq(promotions.id, id))
      if (!current) throw new NotFoundException('Không có chương trình này')
      if (current.state === 'ended') {
        throw new ConflictException('Chương trình đã kết thúc — soạn chương trình mới')
      }
      if (current.state === state) return current

      let approvalId: number | null = null
      if (state === 'active') {
        if (current.requiresVoucher) {
          const liveCodes = await tx
            .select({ live: sql<number>`count(*)::int` })
            .from(voucherCodes)
            .where(and(eq(voucherCodes.promotionId, id), eq(voucherCodes.state, 'live')))
          if ((liveCodes[0]?.live ?? 0) === 0) {
            throw new BadRequestException(
              'Chương trình yêu cầu mã voucher nhưng chưa phát mã nào — bật lên là khách gõ gì cũng trượt',
            )
          }
        }
        const outcome = await this.approvals.authorize(tx, {
          actor,
          action: 'promo.activate',
          entity: 'promotion',
          entityId: String(id),
          approval,
        })
        approvalId = outcome.approvalId
      }

      const [row] = await tx
        .update(promotions)
        .set({
          state,
          updatedAt: new Date(),
          stateChangedAt: new Date(),
          ...(state === 'active'
            ? { activatedAt: new Date(), activatedBy: staffIdOf(actor), approvalId }
            : {}),
        })
        .where(eq(promotions.id, id))
        .returning()

      await this.audit.write(tx, {
        actor,
        action: `promotion.${state}`,
        entity: 'promotion',
        entityId: String(id),
        approvalId,
        payload: { code: current.code, from: current.state },
      })
      return row!
    })
  }

  /**
   * Phát một lô mã voucher.
   *
   * Sinh mã theo tiền tố + số thứ tự thay vì mã ngẫu nhiên: khách đọc mã qua điện
   * thoại, và một chuỗi ngẫu nhiên 8 ký tự là chuỗi sẽ bị đọc sai. Đổi lại, mã
   * đoán được — nên chương trình nào sợ bị đoán thì đặt trần lượt thấp.
   */
  async issueVouchers(
    input: { promotionId: number; prefix: string; count: number; maxUses: number; expiresOn: string | null },
    actor: Actor,
  ) {
    if (input.count < 1 || input.count > 500) {
      throw new BadRequestException('Mỗi lô phát từ 1 đến 500 mã')
    }
    const prefix = input.prefix.trim().toUpperCase()
    if (!/^[A-Z0-9-]{2,16}$/.test(prefix)) {
      throw new BadRequestException('Tiền tố chỉ gồm chữ HOA, số và dấu gạch, 2–16 ký tự')
    }

    return this.db.transaction(async (tx) => {
      const [promo] = await tx.select().from(promotions).where(eq(promotions.id, input.promotionId))
      if (!promo) throw new NotFoundException('Không có chương trình này')

      const issued = await tx
        .select({ existing: sql<number>`count(*)::int` })
        .from(voucherCodes)
        .where(eq(voucherCodes.promotionId, input.promotionId))
      const existing = issued[0]?.existing ?? 0

      const values = Array.from({ length: input.count }, (_, i) => ({
        promotionId: input.promotionId,
        code: `${prefix}-${String(existing + i + 1).padStart(4, '0')}`,
        maxUses: input.maxUses,
        expiresOn: input.expiresOn,
      }))

      let rows
      try {
        rows = await tx.insert(voucherCodes).values(values).returning()
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(`Tiền tố ${prefix} đã có mã trùng — chọn tiền tố khác`)
        }
        throw err
      }

      await this.audit.write(tx, {
        actor,
        action: 'promotion.vouchers-issued',
        entity: 'promotion',
        entityId: String(input.promotionId),
        payload: { prefix, count: input.count, maxUses: input.maxUses },
      })
      return rows
    })
  }

  /** Huỷ một mã đã phát — không xoá, để lượt đã dùng còn truy được */
  async voidVoucher(id: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(voucherCodes)
        .set({ state: 'void' })
        .where(eq(voucherCodes.id, id))
        .returning()
      if (!row) throw new NotFoundException('Không có mã này')
      await this.audit.write(tx, {
        actor,
        action: 'promotion.voucher-void',
        entity: 'voucher_code',
        entityId: String(id),
        payload: { code: row.code },
      })
      return row
    })
  }

  // =========================================================== Áp vào một đơn

  /**
   * Đơn này đang được giảm bao nhiêu, theo chương trình nào, và còn thiếu bao nhiêu
   * để đạt chương trình hoá đơn kế tiếp. Có mã voucher thì chấm thử với mã đó.
   *
   * Chỉ ĐỌC — không ghi gì. Gắn mã thật là việc của `applyVoucher`.
   */
  async quote(orderId: number, voucherCode: string | null, actor: Actor) {
    const [row] = await this.db
      .select({ order: orders, timezone: branches.timezone })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .where(eq(orders.id, orderId))
    if (!row) throw new NotFoundException('Không có đơn này')
    const { order, timezone } = row
    assertOwnTableSession(actor, order.tableSessionId ?? 0)

    const voucher = voucherCode ? await this.liveVoucher(voucherCode, order.businessDate) : null
    const lines = await pricedLinesOf(this.db, orderId, timezone)
    const ctx = await contextOf(this.db, order, this.params)
    if (voucher) ctx.voucherPromotionIds = [voucher.promotionId]

    const rules = (
      await rulesOn(
        this.db,
        order.businessDate,
        order.billPromotionId ? [order.billPromotionId] : [],
      )
    )
      .filter((r) => heldFor(r, order.createdAt))
      .map(ruleOf)
    const at = clockOf(order.createdAt, timezone)
    const bill = priceBill(rules, ctx, at, lines)
    const named = new Map(rules.map((r) => [r.id, r]))

    return {
      lineDiscountVnd: lines.reduce((sum, l) => sum + l.discountVnd, 0),
      bill: bill
        ? {
            promotionId: bill.promotionId,
            code: named.get(bill.promotionId)?.code ?? '',
            name: named.get(bill.promotionId)?.name ?? '',
            discountVnd: bill.discountVnd,
          }
        : null,
      hint: nextBillHint(rules, ctx, at, lines),
      voucher: voucherCode
        ? {
            code: voucherCode.trim().toUpperCase(),
            accepted: voucher !== null,
            reason: voucher ? null : 'Mã không tồn tại, đã hết lượt hoặc đã hết hạn',
          }
        : null,
    }
  }

  /**
   * Gắn mã voucher vào đơn rồi tính lại tiền — chương trình của mã được chấm như
   * mọi chương trình hoá đơn khác, và vẫn chỉ thắng khi nó lợi nhất cho khách.
   *
   * Lượt dùng của mã bị trừ NGAY lúc gắn, trong cùng transaction với dòng mã đã
   * khoá: hai quầy quẹt cùng một mã cuối cùng thì người đến sau thấy lượt của
   * người đến trước. Đổi sang mã khác thì trả lượt cho mã cũ.
   */
  async applyVoucher(input: { orderId: number; voucherCode: string }, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .for('update')
      if (!order) throw new NotFoundException('Không có đơn này')
      assertOwnTableSession(actor, order.tableSessionId ?? 0)
      if (order.status === 'cancelled' || order.paymentState === 'paid') {
        throw new ConflictException('Đơn đã huỷ hoặc đã trả đủ — không gắn mã được nữa')
      }

      const code = input.voucherCode.trim().toUpperCase()
      const [voucher] = await tx
        .select()
        .from(voucherCodes)
        .where(eq(voucherCodes.code, code))
        .for('update')
      if (!voucher || voucher.state !== 'live') throw new NotFoundException('Mã không dùng được')
      if (order.voucherCodeId === voucher.id) {
        return { orderId: order.id, voucherCode: code, changed: false }
      }
      if (voucher.usedCount >= voucher.maxUses) throw new ConflictException('Mã đã hết lượt')
      if (voucher.expiresOn && voucher.expiresOn < order.businessDate) {
        throw new ConflictException('Mã đã hết hạn')
      }
      const [promo] = await tx
        .select()
        .from(promotions)
        .where(eq(promotions.id, voucher.promotionId))
      if (
        !promo ||
        promo.state !== 'active' ||
        order.businessDate < promo.startsOn ||
        order.businessDate > promo.endsOn
      ) {
        throw new ConflictException('Chương trình của mã này không còn chạy')
      }

      if (order.voucherCodeId !== null) {
        await tx
          .update(voucherCodes)
          .set({ usedCount: sql`${voucherCodes.usedCount} - 1` })
          .where(eq(voucherCodes.id, order.voucherCodeId))
      }
      await tx
        .update(voucherCodes)
        .set({ usedCount: voucher.usedCount + 1 })
        .where(eq(voucherCodes.id, voucher.id))
      await tx.update(orders).set({ voucherCodeId: voucher.id }).where(eq(orders.id, order.id))

      const money = await this.ordering.recomputeTotals(tx, order.id, order.branchId)

      await this.audit.write(tx, {
        actor,
        action: 'promotion.voucher-applied',
        entity: 'order',
        entityId: String(order.id),
        payload: { voucher: code, promotion: promo.code, discountVnd: money.discount },
      })
      return { orderId: order.id, voucherCode: code, changed: true, money }
    })
  }

  // ================================================================== Nội bộ

  private async liveVoucher(code: string, businessDate: string) {
    const [row] = await this.db
      .select()
      .from(voucherCodes)
      .where(eq(voucherCodes.code, code.trim().toUpperCase()))
    if (!row || row.state !== 'live') return null
    if (row.usedCount >= row.maxUses) return null
    if (row.expiresOn && row.expiresOn < businessDate) return null
    return row
  }
}

const staffIdOf = (actor: Actor) => (actor.kind === 'staff' ? actor.staffId : null)

/**
 * Kiểm phần mà ràng buộc CSDL kiểm được nhưng kiểm bằng thông báo khó hiểu, cộng
 * trần theo luật — thứ CSDL không biết vì nó là tham số.
 */
function validateShape(input: PromotionInput, maxRate: number) {
  if (input.endsOn < input.startsOn) {
    throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu')
  }
  if ((input.fromMinute === null) !== (input.toMinute === null)) {
    throw new BadRequestException('Khung giờ phải có cả giờ bắt đầu và giờ kết thúc')
  }
  if (input.fromMinute !== null && input.toMinute !== null && input.toMinute <= input.fromMinute) {
    throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu')
  }
  if (!KINDS_BY_SCOPE[input.scope].includes(input.kind)) {
    throw new BadRequestException(
      input.scope === 'item'
        ? 'Chương trình món chỉ có: giảm %, giảm tiền, đồng giá, mua N tặng M'
        : 'Chương trình hoá đơn chỉ có: giảm %, giảm tiền, tặng món',
    )
  }
  if (input.scope === 'item' && input.targetDishIds.length + input.targetCategoryIds.length === 0) {
    throw new BadRequestException('Chọn ít nhất một món, set hoặc nhóm món được áp dụng')
  }
  // Mã voucher gắn vào ĐƠN lúc tính tiền, sau khi món đã gọi và giá món đã chốt —
  // nên mã chỉ mở được chương trình hoá đơn
  if (input.requiresVoucher && input.scope === 'item') {
    throw new BadRequestException('Mã voucher chỉ dùng cho chương trình hoá đơn')
  }

  const legalLine = `Giảm quá ${Math.round(maxRate * 100)}% chỉ được khi là chương trình khuyến mại tập trung (NĐ 81/2018, sửa bởi NĐ 128/2024)`
  switch (input.kind) {
    case 'percent':
      if (!input.percentBp || input.percentBp < 1 || input.percentBp > 10_000) {
        throw new BadRequestException('Mức giảm phải trong khoảng 0,01% – 100%')
      }
      if (!input.concentrated && input.percentBp > maxRate * 10_000) {
        throw new BadRequestException(legalLine)
      }
      break
    case 'amount':
      if (!input.amountVnd || input.amountVnd <= 0) {
        throw new BadRequestException('Số tiền giảm phải lớn hơn 0')
      }
      break
    case 'set_price':
      if (input.setPriceVnd === null || input.setPriceVnd < 0) {
        throw new BadRequestException('Giá đồng giá không hợp lệ')
      }
      break
    case 'buy_x_get_y': {
      const buy = input.buyQty ?? 0
      const get = input.getQty ?? 0
      const pct = input.getPercent ?? 0
      if (buy < 1 || get < 1) throw new BadRequestException('Số phần mua và số phần tặng phải từ 1')
      if (pct < 1 || pct > 100) throw new BadRequestException('Phần tặng giảm từ 1% đến 100%')
      // Giá trị phần tặng so với phần phải mua: "mua 2 tặng 1" là 50%, "mua 1 tặng 1" là 100%
      if (!input.concentrated && get * pct > maxRate * 100 * buy) {
        throw new BadRequestException(
          `Phần tặng vượt ${Math.round(maxRate * 100)}% giá trị phần mua — chỉ được khi là chương trình khuyến mại tập trung (NĐ 81/2018, sửa bởi NĐ 128/2024)`,
        )
      }
      break
    }
    case 'free_dish':
      if (!input.giftDishId) throw new BadRequestException('Chọn món được tặng')
      break
  }
}
