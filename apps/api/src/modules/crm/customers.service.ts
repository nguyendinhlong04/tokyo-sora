import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import type { DbOrTx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  customers,
  loyaltyEntries,
  orderLines,
  orders,
  reservations,
  staff,
} from '../../db/schema'
import { actorBranchId, type Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import {
  maskPhone,
  planRedemption,
  pointsEarned,
  pointsExpireOn,
  tierFor,
  toNextTier,
  TIER_LABELS,
  type LoyaltyConfig,
} from './domain/loyalty'

const LOYALTY_DEFAULTS: LoyaltyConfig = {
  vndPerPoint: 10_000,
  vndPerPointRedeem: 1_000,
  redeemCapVndPerOrder: 100_000,
  expiryMonths: 12,
  tierSilverVnd: 5_000_000,
  tierGoldVnd: 20_000_000,
}

/** Chỉ giữ chữ số: '0912 345 678' và '0912.345.678' là cùng một người */
export const normalizePhone = (raw: string): string => raw.replace(/\D/g, '')

/**
 * B12 — Sổ khách · B14 — Tích điểm & hạng thành viên.
 *
 * Một dịch vụ cho hai màn vì chúng là hai mặt của một hồ sơ: B12 là người, B14 là
 * luật áp lên người đó. Con số của B14 (tỷ lệ tích, trần đổi, ngưỡng hạng) KHÔNG
 * có bảng riêng — chúng nằm trong Trung tâm tham số A6, đúng §29.1, và màn B14 chỉ
 * là cửa vào theo ngữ cảnh của đúng nhóm khoá `loyalty.*` (cùng cách H6 làm với
 * `payroll.*`).
 *
 * Hai ranh giới không được phá:
 *
 *  · **Điểm chỉ sinh từ sự kiện thanh toán.** `accrueForPaidOrder` là cửa DUY NHẤT
 *    sinh dòng `earn`, và nó chỉ được gọi từ luồng thu tiền. Không có API cộng
 *    điểm. Muốn cộng ngoài luồng thì phải qua `adjust` — có lý do, có người, có
 *    nhật ký A7, và chỉ R11/R10 mở được.
 *
 *  · **Số điện thoại che ba số giữa với vai trò không cần thấy.** Việc che nằm ở
 *    tầng dịch vụ chứ không ở màn hình: một màn quên gọi hàm che là một màn rò dữ
 *    liệu, còn một dịch vụ trả về chuỗi đã che thì không có đường rò.
 */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly audit: AuditService,
  ) {}

  /** Sáu con số của B14, đọc từ Trung tâm tham số A6 (§29.1 nhóm "Tích điểm") */
  async config(branchId: string | null = null): Promise<LoyaltyConfig> {
    const p = await this.params.bundle(
      {
        'loyalty.vndPerPoint': LOYALTY_DEFAULTS.vndPerPoint,
        'loyalty.vndPerPointRedeem': LOYALTY_DEFAULTS.vndPerPointRedeem,
        'loyalty.redeemCapVndPerOrder': LOYALTY_DEFAULTS.redeemCapVndPerOrder,
        'loyalty.expiryMonths': LOYALTY_DEFAULTS.expiryMonths,
        'loyalty.tierSilverVnd': LOYALTY_DEFAULTS.tierSilverVnd,
        'loyalty.tierGoldVnd': LOYALTY_DEFAULTS.tierGoldVnd,
      },
      branchId,
    )
    return {
      vndPerPoint: p['loyalty.vndPerPoint'],
      vndPerPointRedeem: p['loyalty.vndPerPointRedeem'],
      redeemCapVndPerOrder: p['loyalty.redeemCapVndPerOrder'],
      expiryMonths: p['loyalty.expiryMonths'],
      tierSilverVnd: p['loyalty.tierSilverVnd'],
      tierGoldVnd: p['loyalty.tierGoldVnd'],
    }
  }

  // ================================================================ B12 · Sổ khách

  /**
   * Danh sách khách, tìm theo tên hoặc số điện thoại.
   *
   * `seeFullPhone` do controller quyết định từ ma trận quyền, không phải từ tham
   * số của người gọi — nếu để client tự khai thì cột che chỉ là trang trí.
   */
  async list(query: { search: string | null; limit: number }, seeFullPhone: boolean) {
    const digits = normalizePhone(query.search ?? '')
    const like = `%${(query.search ?? '').trim().toLowerCase()}%`

    const rows = await this.db
      .select({
        id: customers.id,
        phone: customers.phone,
        name: customers.name,
        allergies: customers.allergies,
        note: customers.note,
        firstSeenOn: customers.firstSeenOn,
        lastSeenOn: customers.lastSeenOn,
      })
      .from(customers)
      .where(
        query.search
          ? sql`(lower(coalesce(${customers.name}, '')) like ${like}
                 ${digits ? sql`or ${customers.phone} like ${`%${digits}%`}` : sql``})`
          : undefined,
      )
      .orderBy(desc(customers.lastSeenOn))
      .limit(query.limit)

    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)
    const [spend, points, noShow] = await Promise.all([
      this.spendByCustomer(ids),
      this.balanceByCustomer(ids),
      this.noShowByCustomer(rows.map((r) => r.phone)),
    ])
    const config = await this.config()

    return rows.map((row) => {
      const spend12 = spend.get(row.id)?.spend12MonthsVnd ?? 0
      return {
        ...row,
        phone: seeFullPhone ? row.phone : maskPhone(row.phone),
        phoneMasked: !seeFullPhone,
        visits: spend.get(row.id)?.visits ?? 0,
        spendTotalVnd: spend.get(row.id)?.spendTotalVnd ?? 0,
        spend12MonthsVnd: spend12,
        pointsBalance: points.get(row.id) ?? 0,
        tier: tierFor(spend12, config),
        tierLabel: TIER_LABELS[tierFor(spend12, config)],
        noShowCount: noShow.get(row.phone) ?? 0,
      }
    })
  }

  /** Hồ sơ đầy đủ: lịch sử đến, món hay gọi, sổ điểm, no-show */
  async profile(id: number, seeFullPhone: boolean) {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, id))
    if (!row) throw new NotFoundException('Không có khách này')

    const config = await this.config()
    const [spend, balance, visits, favourites, ledger, bookings] = await Promise.all([
      this.spendByCustomer([id]),
      this.balanceByCustomer([id]),
      this.visitsOf(row.phone),
      this.favouriteDishesOf(row.phone),
      this.ledgerOf(id),
      this.bookingsOf(row.phone),
    ])

    const spend12 = spend.get(id)?.spend12MonthsVnd ?? 0
    const tier = tierFor(spend12, config)

    return {
      id: row.id,
      phone: seeFullPhone ? row.phone : maskPhone(row.phone),
      phoneMasked: !seeFullPhone,
      name: row.name,
      allergies: row.allergies,
      note: row.note,
      firstSeenOn: row.firstSeenOn,
      lastSeenOn: row.lastSeenOn,
      spendTotalVnd: spend.get(id)?.spendTotalVnd ?? 0,
      spend12MonthsVnd: spend12,
      visitCount: spend.get(id)?.visits ?? 0,
      loyalty: {
        balance: balance.get(id) ?? 0,
        tier,
        tierLabel: TIER_LABELS[tier],
        next: toNextTier(spend12, config),
        config,
        entries: ledger,
      },
      visits,
      favourites,
      bookings,
    }
  }

  /** Sửa phần con người khai: tên, dị ứng, ghi chú phục vụ */
  async saveProfile(
    input: { phone: string; name: string | null; allergies: string | null; note: string | null },
    actor: Actor,
  ) {
    const phone = normalizePhone(input.phone)
    if (!/^\d{8,15}$/.test(phone)) throw new BadRequestException('Số điện thoại không hợp lệ')

    return this.db.transaction(async (tx) => {
      const today = await this.todayFor(actorBranchId(actor), tx)
      const [row] = await tx
        .insert(customers)
        .values({
          phone,
          name: input.name,
          allergies: input.allergies,
          note: input.note,
          firstSeenOn: today,
          lastSeenOn: today,
        })
        .onConflictDoUpdate({
          target: customers.phone,
          set: {
            name: input.name,
            allergies: input.allergies,
            note: input.note,
            updatedAt: new Date(),
          },
        })
        .returning()

      await this.audit.write(tx, {
        actor,
        action: 'customer.save',
        entity: 'customer',
        entityId: String(row!.id),
        // Nhật ký KHÔNG chép số điện thoại: A7 là sổ đọc rộng hơn Sổ khách
        payload: { hasAllergies: Boolean(input.allergies) },
      })
      return row!
    })
  }

  /**
   * Gom một số điện thoại vào Sổ khách. Gọi từ luồng đặt bàn / đơn online / thu
   * tiền — mỗi lần khách xuất hiện thì `last_seen_on` nhích lên, hồ sơ không cần
   * ai tạo tay.
   */
  async touch(
    tx: DbOrTx,
    input: { phone: string; name?: string | null; businessDate: string },
  ): Promise<number | null> {
    const phone = normalizePhone(input.phone)
    if (!/^\d{8,15}$/.test(phone)) return null

    const [row] = await tx
      .insert(customers)
      .values({
        phone,
        name: input.name ?? null,
        firstSeenOn: input.businessDate,
        lastSeenOn: input.businessDate,
      })
      .onConflictDoUpdate({
        target: customers.phone,
        set: {
          // Tên chỉ điền khi hồ sơ còn trống — lần đặt bàn ghi "Anh Tuấn" không
          // được đè lên cái tên kế toán đã sửa cho đúng
          name: sql`coalesce(${customers.name}, excluded.name)`,
          lastSeenOn: sql`greatest(${customers.lastSeenOn}, excluded.last_seen_on)`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: customers.id })
    return row?.id ?? null
  }

  // =========================================================== B14 · Tích điểm

  /**
   * Tích điểm cho một đơn VỪA TRẢ ĐỦ. Cửa duy nhất sinh dòng `earn`.
   *
   * Gọi trong CÙNG transaction với lượt thu tiền: nếu thu tiền rollback thì điểm
   * cũng không tồn tại. Không có khách gắn với đơn thì không tích — im lặng, vì
   * phần lớn bill tại bàn không có số điện thoại và đó là chuyện bình thường.
   *
   * Chốt chặn cuối cùng là chỉ số duy nhất `loyalty_entries_one_earn_per_order`:
   * gọi hai lần cho một đơn thì lần sau không ghi thêm gì.
   */
  async accrueForPaidOrder(
    tx: DbOrTx,
    input: { orderId: number; branchId: string; paidVnd: number; businessDate: string },
  ): Promise<{ customerId: number; points: number } | null> {
    const [order] = await tx
      .select({ customer: orders.customer })
      .from(orders)
      .where(eq(orders.id, input.orderId))
    const phone = phoneFromOrder(order?.customer)
    if (!phone) return null

    const customerId = await this.touch(tx, {
      phone,
      name: nameFromOrder(order?.customer),
      businessDate: input.businessDate,
    })
    if (!customerId) return null

    const config = await this.config(input.branchId)
    const points = pointsEarned(input.paidVnd, config)
    if (points <= 0) return null

    const inserted = await tx
      .insert(loyaltyEntries)
      .values({
        customerId,
        kind: 'earn',
        points,
        orderId: input.orderId,
        branchId: input.branchId,
        baseVnd: input.paidVnd,
        businessDate: input.businessDate,
      })
      .onConflictDoNothing()
      .returning({ id: loyaltyEntries.id })

    return inserted.length > 0 ? { customerId, points } : null
  }

  /**
   * Thu hồi điểm khi bill bị huỷ hoặc hoàn (§25 B14 "huỷ/hoàn bill tự thu hồi").
   *
   * Thu hồi đúng số đã tích, kể cả khi khách đã tiêu mất — số dư âm là đúng sự
   * thật và sẽ tự bù ở lần mua sau. Che đi bằng cách kẹp về 0 là tặng khách số
   * điểm của một bill không tồn tại.
   */
  async reclaimForVoidedOrder(
    tx: DbOrTx,
    input: { orderId: number; businessDate: string },
  ): Promise<number> {
    const [earned] = await tx
      .select()
      .from(loyaltyEntries)
      .where(and(eq(loyaltyEntries.orderId, input.orderId), eq(loyaltyEntries.kind, 'earn')))
    if (!earned) return 0

    const inserted = await tx
      .insert(loyaltyEntries)
      .values({
        customerId: earned.customerId,
        kind: 'reclaim',
        points: -earned.points,
        orderId: input.orderId,
        branchId: earned.branchId,
        reason: 'Bill bị huỷ hoặc hoàn',
        businessDate: input.businessDate,
      })
      .onConflictDoNothing()
      .returning({ id: loyaltyEntries.id })

    return inserted.length > 0 ? earned.points : 0
  }

  /** Xem trước một lượt đổi điểm tại quầy — chỉ tính, không ghi */
  async quoteRedemption(input: { customerId: number; points: number; payableVnd: number; branchId: string }) {
    const config = await this.config(input.branchId)
    const balance = (await this.balanceByCustomer([input.customerId])).get(input.customerId) ?? 0
    return { ...planRedemption(input.points, balance, input.payableVnd, config), balance, config }
  }

  /**
   * Điều chỉnh điểm bằng tay. Quyền `loyalty.adjust-manual` — chỉ R11/R10.
   *
   * Bắt buộc có lý do và ghi A7: đây là cánh cửa duy nhất đi vòng qua quy tắc
   * "điểm chỉ sinh từ thanh toán", nên nó phải là cánh cửa ồn ào nhất hệ thống.
   */
  async adjust(
    input: { customerId: number; points: number; reason: string },
    actor: Actor,
  ) {
    if (!Number.isSafeInteger(input.points) || input.points === 0) {
      throw new BadRequestException('Số điểm điều chỉnh phải khác 0')
    }
    if (!input.reason.trim()) throw new BadRequestException('Điều chỉnh điểm phải kèm lý do')
    if (actor.kind !== 'staff') throw new ForbiddenException('Chỉ nhân viên mới điều chỉnh được')

    return this.db.transaction(async (tx) => {
      const [customer] = await tx.select().from(customers).where(eq(customers.id, input.customerId))
      if (!customer) throw new NotFoundException('Không có khách này')

      const businessDate = await this.todayFor(actorBranchId(actor), tx)
      const [row] = await tx
        .insert(loyaltyEntries)
        .values({
          customerId: input.customerId,
          kind: 'adjust',
          points: input.points,
          branchId: actorBranchId(actor),
          reason: input.reason.trim(),
          staffId: actor.staffId,
          businessDate,
        })
        .returning()

      await this.audit.write(tx, {
        actor,
        action: 'loyalty.adjust',
        entity: 'customer',
        entityId: String(input.customerId),
        payload: { points: input.points, reason: input.reason.trim() },
      })
      return row!
    })
  }

  // ================================================================== Nội bộ

  private async todayFor(branchId: string | null, tx: DbOrTx): Promise<string> {
    const [row] = branchId
      ? await tx
          .select({ timezone: branches.timezone })
          .from(branches)
          .where(eq(branches.id, branchId))
      : []
    return businessDateOf(new Date(), row?.timezone ?? 'Asia/Ho_Chi_Minh')
  }

  /**
   * Chi tiêu và số lượt đến, gom theo SỐ ĐIỆN THOẠI trên đơn.
   *
   * Đơn tại bàn không mang số điện thoại nên không vào đây — con số này là chi
   * tiêu ĐÃ NHẬN DIỆN được, không phải toàn bộ chi tiêu của người đó. Nói rõ ở
   * đây vì màn B12 hiện nó cạnh chữ "Tổng chi tiêu" và người đọc sẽ tưởng là đủ.
   */
  private async spendByCustomer(ids: number[]) {
    const rows = await this.db
      .select({
        customerId: customers.id,
        visits: sql<number>`count(*)::int`,
        spendTotalVnd: sql<number>`coalesce(sum(${orders.moneyTotal}), 0)::float8`,
        spend12MonthsVnd: sql<number>`coalesce(sum(${orders.moneyTotal})
          filter (where ${orders.businessDate} >= (current_date - interval '12 months')), 0)::float8`,
      })
      .from(customers)
      .innerJoin(orders, sql`regexp_replace(${orders.customer} ->> 'phone', '\\D', '', 'g') = ${customers.phone}`)
      .where(and(inArray(customers.id, ids), eq(orders.paymentState, 'paid')))
      .groupBy(customers.id)

    return new Map(
      rows.map((r) => [
        r.customerId,
        {
          visits: r.visits,
          spendTotalVnd: Math.round(r.spendTotalVnd),
          spend12MonthsVnd: Math.round(r.spend12MonthsVnd),
        },
      ]),
    )
  }

  private async balanceByCustomer(ids: number[]) {
    const rows = await this.db
      .select({
        customerId: loyaltyEntries.customerId,
        balance: sql<number>`coalesce(sum(${loyaltyEntries.points}), 0)::int`,
      })
      .from(loyaltyEntries)
      .where(inArray(loyaltyEntries.customerId, ids))
      .groupBy(loyaltyEntries.customerId)
    return new Map(rows.map((r) => [r.customerId, r.balance]))
  }

  private async noShowByCustomer(phones: string[]) {
    const rows = await this.db
      .select({
        phone: sql<string>`regexp_replace(${reservations.customerPhone}, '\\D', '', 'g')`,
        count: sql<number>`count(*)::int`,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.status, 'no_show'),
          inArray(sql`regexp_replace(${reservations.customerPhone}, '\\D', '', 'g')`, phones),
        ),
      )
      .groupBy(sql`1`)
    return new Map(rows.map((r) => [r.phone, r.count]))
  }

  private async visitsOf(phone: string) {
    return this.db
      .select({
        orderId: orders.id,
        displayCode: orders.displayCode,
        branchId: orders.branchId,
        channel: orders.channel,
        businessDate: orders.businessDate,
        moneyTotal: orders.moneyTotal,
        paymentState: orders.paymentState,
      })
      .from(orders)
      .where(sql`regexp_replace(${orders.customer} ->> 'phone', '\\D', '', 'g') = ${phone}`)
      .orderBy(desc(orders.businessDate), desc(orders.id))
      .limit(30)
  }

  /** Món hay gọi — nguồn để phục vụ mở đầu bằng "vẫn nầm bò như mọi khi ạ?" */
  private async favouriteDishesOf(phone: string) {
    return this.db
      .select({
        dishId: orderLines.dishId,
        name: orderLines.nameSnapshot,
        times: sql<number>`count(*)::int`,
        qty: sql<number>`coalesce(sum(${orderLines.qty}), 0)::int`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          sql`regexp_replace(${orders.customer} ->> 'phone', '\\D', '', 'g') = ${phone}`,
          inArray(orderLines.state, ['queued', 'cooking', 'ready', 'served']),
        ),
      )
      .groupBy(orderLines.dishId, orderLines.nameSnapshot)
      .orderBy(desc(sql`count(*)`))
      .limit(8)
  }

  private async ledgerOf(customerId: number) {
    const config = await this.config()
    const rows = await this.db
      .select({
        id: loyaltyEntries.id,
        kind: loyaltyEntries.kind,
        points: loyaltyEntries.points,
        orderId: loyaltyEntries.orderId,
        baseVnd: loyaltyEntries.baseVnd,
        reason: loyaltyEntries.reason,
        staffName: staff.fullName,
        businessDate: loyaltyEntries.businessDate,
      })
      .from(loyaltyEntries)
      .leftJoin(staff, eq(staff.id, loyaltyEntries.staffId))
      .where(eq(loyaltyEntries.customerId, customerId))
      .orderBy(desc(loyaltyEntries.id))
      .limit(60)

    return rows.map((r) => ({
      ...r,
      // Chỉ điểm TÍCH mới có hạn — điểm đã tiêu thì không hết hạn được nữa
      expiresOn: r.kind === 'earn' ? pointsExpireOn(r.businessDate, config) : null,
    }))
  }

  private async bookingsOf(phone: string) {
    return this.db
      .select({
        id: reservations.id,
        displayCode: reservations.displayCode,
        branchId: reservations.branchId,
        slotAt: reservations.slotAt,
        guestCount: reservations.guestCount,
        status: reservations.status,
      })
      .from(reservations)
      .where(sql`regexp_replace(${reservations.customerPhone}, '\\D', '', 'g') = ${phone}`)
      .orderBy(desc(reservations.slotAt))
      .limit(20)
  }
}

/** Khối `customer` của đơn online: { name, phone, address, note } */
function phoneFromOrder(customer: unknown): string | null {
  if (!customer || typeof customer !== 'object') return null
  const raw = (customer as { phone?: unknown }).phone
  if (typeof raw !== 'string') return null
  const phone = normalizePhone(raw)
  return /^\d{8,15}$/.test(phone) ? phone : null
}

function nameFromOrder(customer: unknown): string | null {
  if (!customer || typeof customer !== 'object') return null
  const raw = (customer as { name?: unknown }).name
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}
