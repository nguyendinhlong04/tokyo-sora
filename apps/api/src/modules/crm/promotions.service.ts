import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { isUniqueViolation } from '../../common/pg-error'
import type { DbOrTx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  dishes,
  orderLines,
  orders,
  promotionRedemptions,
  promotions,
  staff,
  voucherCodes,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import {
  pickBestPromotion,
  type CartContext,
  type PromotionKind,
  type PromotionRule,
} from './domain/promo-engine'

export interface PromotionInput {
  code: string
  name: string
  kind: PromotionKind
  percentBp: number | null
  amountVnd: number | null
  targetDishId: string | null
  setPriceVnd: number | null
  maxDiscountVnd: number | null
  channels: string[]
  branchIds: string[]
  weekdays: number[]
  fromMinute: number | null
  toMinute: number | null
  minOrderVnd: number
  requiresVoucher: boolean
  startsOn: string
  endsOn: string
}

/**
 * B11 — Khuyến mãi & voucher.
 *
 * Màn này tồn tại vì P10 có ô nhập voucher từ ngày đầu mà cả hệ thống không có
 * chỗ nào TẠO ra voucher — tức là một tính năng chết (§G.1). Nên phần quan trọng
 * nhất ở đây không phải giao diện soạn thảo mà là hai chốt chặn:
 *
 *   · **Soạn ≠ kích hoạt.** R9 marketing soạn được, nhưng bật một chương trình là
 *     đụng giá bán nên phải có R11/R10 duyệt (§4.2b). Hai quyền riêng, và lượt
 *     duyệt để lại bản ghi trên chính chương trình đó.
 *   · **Không cộng dồn.** Mỗi đơn hưởng đúng một chương trình — mức lợi nhất cho
 *     khách. Chỗ cưỡng chế là chỉ số duy nhất `promotion_redemptions.order_id`;
 *     phép chọn nằm ở `domain/promo-engine.ts`.
 */
@Injectable()
export class PromotionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
  ) {}

  // ================================================================ Danh sách

  /**
   * Sổ chương trình. Kèm số lượt đã dùng và tổng tiền đã giảm — một chương trình
   * không có hai con số đó thì không ai biết nó đang tốn bao nhiêu.
   */
  async list() {
    const rows = await this.db
      .select({
        id: promotions.id,
        code: promotions.code,
        name: promotions.name,
        kind: promotions.kind,
        percentBp: promotions.percentBp,
        amountVnd: promotions.amountVnd,
        targetDishId: promotions.targetDishId,
        targetDishName: dishes.nameVi,
        setPriceVnd: promotions.setPriceVnd,
        maxDiscountVnd: promotions.maxDiscountVnd,
        channels: promotions.channels,
        branchIds: promotions.branchIds,
        weekdays: promotions.weekdays,
        fromMinute: promotions.fromMinute,
        toMinute: promotions.toMinute,
        minOrderVnd: promotions.minOrderVnd,
        requiresVoucher: promotions.requiresVoucher,
        startsOn: promotions.startsOn,
        endsOn: promotions.endsOn,
        state: promotions.state,
        activatedAt: promotions.activatedAt,
        activatedBy: staff.fullName,
      })
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

    return rows.map((row) => ({
      ...row,
      uses: usedBy.get(row.id)?.uses ?? 0,
      discountVnd: Math.round(usedBy.get(row.id)?.discountVnd ?? 0),
      voucherCount: codesBy.get(row.id)?.batch ?? 0,
      voucherLive: codesBy.get(row.id)?.live ?? 0,
    }))
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
    validateShape(input)

    return this.db.transaction(async (tx) => {
      const values = {
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        kind: input.kind,
        percentBp: input.kind === 'percent' ? input.percentBp : null,
        amountVnd: input.kind === 'amount' ? input.amountVnd : null,
        targetDishId:
          input.kind === 'free_dish' || input.kind === 'set_price' ? input.targetDishId : null,
        setPriceVnd: input.kind === 'set_price' ? input.setPriceVnd : null,
        maxDiscountVnd: input.maxDiscountVnd,
        channels: input.channels,
        branchIds: input.branchIds,
        weekdays: input.weekdays,
        fromMinute: input.fromMinute,
        toMinute: input.toMinute,
        minOrderVnd: input.minOrderVnd,
        requiresVoucher: input.requiresVoucher,
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
   * Chấm giỏ hàng của một đơn: chương trình nào ăn, giảm bao nhiêu, cái nào lợi
   * nhất. Đây là thứ P10 gọi khi thu ngân bấm "Xem khuyến mãi" hoặc gõ mã voucher.
   *
   * Chỉ ĐỌC — không ghi gì. Áp thật là việc của `redeem`.
   */
  async quote(orderId: number, voucherCode: string | null) {
    const cart = await this.cartOf(orderId)
    const voucher = voucherCode ? await this.liveVoucher(voucherCode, cart.businessDate) : null

    const rules = await this.liveRules(cart.businessDate)
    const pick = pickBestPromotion(rules, {
      ...cart,
      voucherPromotionId: voucher?.promotionId ?? null,
    })

    return {
      ...pick,
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
   * Ghi nhận đơn đã hưởng chương trình.
   *
   * KHÔNG tự sửa `orders.money_discount` ở đây: khối tiền của đơn do luồng tính
   * tiền sở hữu (`packages/contracts/money.ts` tính, POS đóng băng), và hai nơi
   * cùng ghi một con số là hai nơi sẽ lệch. Hàm này ghi LƯỢT HƯỞNG — thứ B8 đọc
   * để đo hiệu quả, và thứ chặn đơn hưởng chương trình thứ hai.
   */
  async redeem(
    input: { orderId: number; promotionId: number; voucherCode: string | null },
    actor: Actor,
  ) {
    return this.db.transaction(async (tx) => {
      const cart = await this.cartOf(input.orderId, tx)
      const rules = await this.liveRules(cart.businessDate, tx)
      const rule = rules.find((r) => r.id === input.promotionId)
      if (!rule) throw new NotFoundException('Chương trình không tồn tại hoặc không còn chạy')

      // Khoá dòng mã trước khi đếm lượt: hai quầy quẹt cùng một mã cuối cùng thì
      // người đến sau phải thấy lượt của người đến trước
      let voucher = null
      if (rule.requiresVoucher || input.voucherCode) {
        if (!input.voucherCode) throw new BadRequestException('Chương trình này cần mã voucher')
        const [locked] = await tx
          .select()
          .from(voucherCodes)
          .where(eq(voucherCodes.code, input.voucherCode.trim().toUpperCase()))
          .for('update')
        if (!locked || locked.state !== 'live') throw new NotFoundException('Mã không dùng được')
        if (locked.promotionId !== input.promotionId) {
          throw new BadRequestException('Mã này thuộc chương trình khác')
        }
        if (locked.usedCount >= locked.maxUses) throw new ConflictException('Mã đã hết lượt')
        if (locked.expiresOn && locked.expiresOn < cart.businessDate) {
          throw new ConflictException('Mã đã hết hạn')
        }
        voucher = locked
      }

      const pick = pickBestPromotion([rule], {
        ...cart,
        voucherPromotionId: voucher?.promotionId ?? null,
      })
      if (!pick.best) {
        throw new BadRequestException(
          `Đơn không đủ điều kiện: ${pick.rejected[0]?.reason ?? 'không rõ'}`,
        )
      }

      let redemption
      try {
        const [row] = await tx
          .insert(promotionRedemptions)
          .values({
            promotionId: rule.id,
            voucherCodeId: voucher?.id ?? null,
            branchId: cart.branchId,
            orderId: input.orderId,
            discountVnd: pick.best.discountVnd,
            businessDate: cart.businessDate,
          })
          .returning()
        redemption = row!
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(
            'Đơn đã hưởng một chương trình rồi — khuyến mãi không cộng dồn',
          )
        }
        throw err
      }

      if (voucher) {
        await tx
          .update(voucherCodes)
          .set({ usedCount: voucher.usedCount + 1 })
          .where(eq(voucherCodes.id, voucher.id))
      }

      await this.audit.write(tx, {
        actor,
        action: 'promotion.redeem',
        entity: 'order',
        entityId: String(input.orderId),
        payload: { promotion: rule.code, discountVnd: pick.best.discountVnd, voucher: voucher?.code },
      })
      return { ...redemption, promotionCode: rule.code, promotionName: rule.name }
    })
  }

  // ================================================================== Nội bộ

  /** Chương trình đang chạy và còn trong lịch — nguồn cho engine chấm điểm */
  private async liveRules(businessDate: string, tx?: DbOrTx): Promise<PromotionRule[]> {
    const rows = await (tx ?? this.db)
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.state, 'active'),
          lte(promotions.startsOn, businessDate),
          gte(promotions.endsOn, businessDate),
        ),
      )
      .orderBy(asc(promotions.id))

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      kind: r.kind as PromotionKind,
      percentBp: r.percentBp,
      amountVnd: r.amountVnd,
      targetDishId: r.targetDishId,
      setPriceVnd: r.setPriceVnd,
      maxDiscountVnd: r.maxDiscountVnd,
      channels: r.channels,
      branchIds: r.branchIds,
      weekdays: r.weekdays,
      fromMinute: r.fromMinute,
      toMinute: r.toMinute,
      minOrderVnd: r.minOrderVnd,
      requiresVoucher: r.requiresVoucher,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
    }))
  }

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

  /**
   * Giỏ hàng của một đơn, quy về thứ engine cần.
   *
   * `weekday` và `minuteOfDay` tính theo MÚI GIỜ CHI NHÁNH, không theo giờ máy
   * chủ — cùng lý do với `businessDateOf`: chương trình "trưa thứ ba" của quán Hà
   * Nội không được đổi nghĩa vì máy chủ chạy ở UTC.
   */
  private async cartOf(
    orderId: number,
    tx?: DbOrTx,
  ): Promise<Omit<CartContext, 'voucherPromotionId'>> {
    const db = tx ?? this.db
    const [order] = await db
      .select({
        id: orders.id,
        branchId: orders.branchId,
        channel: orders.channel,
        businessDate: orders.businessDate,
        createdAt: orders.createdAt,
        moneySub: orders.moneySub,
        timezone: branches.timezone,
      })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .where(eq(orders.id, orderId))
    if (!order) throw new NotFoundException('Không có đơn này')

    const lines = await db
      .select({
        dishId: orderLines.dishId,
        qty: orderLines.qty,
        priceTotal: orderLines.priceTotal,
      })
      .from(orderLines)
      .where(and(eq(orderLines.orderId, orderId), inArray(orderLines.state, LIVE_LINE_STATES)))

    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: order.timezone,
      hour12: false,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(order.createdAt)
    const part = (type: string) => local.find((p) => p.type === type)!.value
    const weekday = WEEKDAY_INDEX[part('weekday')] ?? 0
    const minuteOfDay = (Number(part('hour')) % 24) * 60 + Number(part('minute'))

    return {
      branchId: order.branchId,
      channel: order.channel,
      businessDate: order.businessDate,
      weekday,
      minuteOfDay,
      subtotalVnd: order.moneySub,
      lines: lines.filter((l) => l.priceTotal > 0),
    }
  }
}

/** Dòng đã huỷ không được tính vào giỏ — khách không trả tiền cho món bị huỷ */
const LIVE_LINE_STATES = ['draft', 'queued', 'cooking', 'ready', 'served'] as const

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

const staffIdOf = (actor: Actor) => (actor.kind === 'staff' ? actor.staffId : null)


/**
 * Kiểm phần mà ràng buộc CSDL kiểm được nhưng kiểm bằng thông báo khó hiểu.
 * Cùng một luật, nói bằng tiếng người trước khi Postgres nói bằng tên constraint.
 */
function validateShape(input: PromotionInput) {
  if (input.endsOn < input.startsOn) {
    throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu')
  }
  if ((input.fromMinute === null) !== (input.toMinute === null)) {
    throw new BadRequestException('Khung giờ phải có cả giờ bắt đầu và giờ kết thúc')
  }
  if (input.fromMinute !== null && input.toMinute !== null && input.toMinute <= input.fromMinute) {
    throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu')
  }
  switch (input.kind) {
    case 'percent':
      if (!input.percentBp || input.percentBp < 1 || input.percentBp > 10_000) {
        throw new BadRequestException('Mức giảm phải trong khoảng 0,01% – 100%')
      }
      break
    case 'amount':
      if (!input.amountVnd || input.amountVnd <= 0) {
        throw new BadRequestException('Số tiền giảm phải lớn hơn 0')
      }
      break
    case 'free_dish':
      if (!input.targetDishId) throw new BadRequestException('Chọn món được tặng')
      break
    case 'set_price':
      if (!input.targetDishId) throw new BadRequestException('Chọn món áp giá khung giờ')
      if (input.setPriceVnd === null || input.setPriceVnd < 0) {
        throw new BadRequestException('Giá khung giờ không hợp lệ')
      }
      break
  }
}
