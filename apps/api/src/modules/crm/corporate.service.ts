import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms, type InvoiceBuyer } from '@sora/contracts'
import { and, asc, desc, eq, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import { isUniqueViolation } from '../../common/pg-error'
import type { DbOrTx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  corporateCharges,
  corporateCustomers,
  corporateSettlements,
  orders,
  payments,
  staff,
  tableSessions,
} from '../../db/schema'
import { EinvoiceService } from '../einvoice/einvoice.service'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import { alreadyPaid } from '../payments/payments.service'
import { agingOf, daysBetween, type AgingBuckets } from './domain/aging'

export interface CorporateInput {
  code: string
  name: string
  taxCode: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  creditLimitVnd: number
  paymentTermDays: number
  reconcileDay: number
  blockAfterOverdueDays: number | null
  active: boolean
}

/**
 * B15 — Khách doanh nghiệp.
 *
 * Ranh giới quan trọng nhất của màn này là ranh giới DỒN TÍCH / DÒNG TIỀN, cùng
 * ranh giới mà nhóm C đã dựng cho chi phí, lần này nhìn từ phía thu:
 *
 *   · Ghi nợ = doanh thu ghi nhận NGAY (báo cáo đọc `orders.money_total`) nhưng
 *     KHÔNG có đồng nào vào sổ quỹ F1, vì chưa có đồng nào vào tài khoản.
 *   · Tiền về = dòng tiền, và chỉ lúc đó mới có `corporate_settlements`.
 *
 * Thứ hai là **cái chặn**: "quá hạn quá N ngày (tham số) → tự chặn ghi nợ mới tại
 * POS" (§25 B15). Chặn phải nằm ở tầng dịch vụ chứ không ở màn hình, vì màn hình
 * chặn được một cửa còn API thì mở cho mọi cửa.
 */
@Injectable()
export class CorporateService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly einvoice: EinvoiceService,
  ) {}

  // =============================================================== Hồ sơ

  /** Sổ hồ sơ kèm dư nợ và tuổi nợ — hồ sơ không có hai con số đó là danh bạ */
  async list() {
    const rows = await this.db
      .select()
      .from(corporateCustomers)
      .orderBy(asc(corporateCustomers.name))
    if (rows.length === 0) return []

    const defaults = await this.defaults()
    const today = businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')
    const balances = await this.balancesFor(rows.map((r) => r.id), today)

    return rows.map((row) => {
      const aging = balances.get(row.id) ?? emptyAging()
      const blockDays = row.blockAfterOverdueDays ?? defaults.blockAfterOverdueDays
      return {
        ...row,
        blockAfterOverdueDaysEffective: blockDays,
        aging,
        outstandingVnd: aging.totalVnd,
        availableVnd: Math.max(0, row.creditLimitVnd - aging.totalVnd),
        /** Vì sao POS sẽ từ chối ghi nợ mới — null nghĩa là ghi được */
        blockedReason: blockReason(row.active, aging, row.creditLimitVnd, blockDays, 0),
      }
    })
  }

  async save(input: CorporateInput, id: number | null, actor: Actor) {
    if (!/^\d{10}(-\d{3})?$/.test(input.taxCode)) {
      throw new BadRequestException('Mã số thuế gồm 10 số, đơn vị phụ thuộc thêm -3 số')
    }
    if (input.creditLimitVnd < 0) throw new BadRequestException('Hạn mức nợ không âm')

    return this.db.transaction(async (tx) => {
      const values = {
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        taxCode: input.taxCode.trim(),
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        address: input.address,
        creditLimitVnd: input.creditLimitVnd,
        paymentTermDays: input.paymentTermDays,
        reconcileDay: input.reconcileDay,
        blockAfterOverdueDays: input.blockAfterOverdueDays,
        active: input.active,
      }

      try {
        const [row] =
          id === null
            ? await tx
                .insert(corporateCustomers)
                .values({ ...values, createdBy: actor.kind === 'staff' ? actor.staffId : null })
                .returning()
            : await tx
                .update(corporateCustomers)
                .set({ ...values, updatedAt: new Date() })
                .where(eq(corporateCustomers.id, id))
                .returning()
        if (!row) throw new NotFoundException('Không có khách doanh nghiệp này')

        await this.audit.write(tx, {
          actor,
          action: id === null ? 'corporate.create' : 'corporate.update',
          entity: 'corporate_customer',
          entityId: String(row.id),
          payload: { code: row.code, creditLimitVnd: row.creditLimitVnd },
        })
        return row
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictException('Mã khách doanh nghiệp đã tồn tại')
        throw err
      }
    })
  }

  // =============================================================== Ghi nợ

  /**
   * P10 "Ghi nợ công ty": tìm công ty, kèm hạn mức còn lại và lý do bị chặn — thu
   * ngân thấy trước khi bấm, khỏi đợi 409. Lượt ghi nợ vẫn kiểm lại.
   */
  async pick(q: string) {
    const term = q.trim()
    const rows = await this.db
      .select()
      .from(corporateCustomers)
      .where(
        and(
          eq(corporateCustomers.active, true),
          term
            ? or(
                ilike(corporateCustomers.name, `%${term}%`),
                ilike(corporateCustomers.code, `%${term}%`),
                ilike(corporateCustomers.taxCode, `%${term}%`),
              )
            : undefined,
        ),
      )
      .orderBy(asc(corporateCustomers.name))
      .limit(20)
    if (rows.length === 0) return []

    const defaults = await this.defaults()
    const today = businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')
    const balances = await this.balancesFor(
      rows.map((r) => r.id),
      today,
    )
    return rows.map((row) => {
      const aging = balances.get(row.id) ?? emptyAging()
      const blockDays = row.blockAfterOverdueDays ?? defaults.blockAfterOverdueDays
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        taxCode: row.taxCode,
        /** null = hồ sơ thiếu địa chỉ — chi nhánh đã bật hoá đơn thì chưa ghi nợ được */
        address: row.address,
        availableVnd: Math.max(0, row.creditLimitVnd - aging.totalVnd),
        blockedReason: blockReason(row.active, aging, row.creditLimitVnd, blockDays, 0),
      }
    })
  }

  /**
   * Ghi nợ một bill cho công ty — cửa mà P10 gọi khi thu ngân chọn "Ghi nợ công ty".
   *
   * Quyền `corporate.charge-at-pos` cho R2 ở mức △ nên lượt này cần PIN của R7;
   * R7 và R10 tự bấm thì không. Chữ ký khách (`signer`) là bằng chứng ngoài hệ
   * thống, bản ghi duyệt là bằng chứng trong hệ thống — §4.2b đòi cả hai.
   *
   * Không sinh dòng `payments`: tiền chưa về thì sổ quỹ không được thấy gì. Công ty
   * nợ PHẦN CÒN LẠI của bill — khách đã trả một phần thì phần đó không nợ lại lần
   * hai. Bill coi như trả đủ: bàn sang chờ dọn, và hoá đơn lập ngay cho chính công
   * ty đó (NĐ 254/2026 không cho nhà hàng gộp hoá đơn cuối kỳ).
   */
  async charge(
    input: { corporateId: number; orderId: number; signer: string | null },
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    const { charge, invoiceId } = await this.db.transaction(async (tx) => {
      // Khoá đơn: máy khác đang thu tiền mặt bill này thì một trong hai bên phải thấy bên kia
      const [order] = await tx
        .select({
          id: orders.id,
          branchId: orders.branchId,
          displayCode: orders.displayCode,
          moneyTotal: orders.moneyTotal,
          paymentState: orders.paymentState,
          status: orders.status,
          tableSessionId: orders.tableSessionId,
          invoiceBuyer: orders.invoiceBuyer,
          timezone: branches.timezone,
        })
        .from(orders)
        .innerJoin(branches, eq(branches.id, orders.branchId))
        .where(eq(orders.id, input.orderId))
        .for('update', { of: orders })
      if (!order) throw new NotFoundException('Không có đơn này')
      if (order.status === 'cancelled') throw new ConflictException('Đơn đã huỷ')
      if (order.paymentState === 'paid') throw alreadyPaid()
      if (order.moneyTotal <= 0) throw new BadRequestException('Đơn chưa có tiền để ghi nợ')

      const [received] = await tx
        .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.state, 'paid')))
      const outstanding = order.moneyTotal - Number(received?.paid ?? 0)
      if (outstanding <= 0) throw alreadyPaid()

      const [company] = await tx
        .select()
        .from(corporateCustomers)
        .where(eq(corporateCustomers.id, input.corporateId))
        .for('update')
      if (!company) throw new NotFoundException('Không có khách doanh nghiệp này')

      const defaults = await this.defaults()
      const today = businessDateOf(new Date(), order.timezone)
      const aging =
        (await this.balancesFor([company.id], today, { tx })).get(company.id) ?? emptyAging()
      const blockDays = company.blockAfterOverdueDays ?? defaults.blockAfterOverdueDays

      const blocked = blockReason(
        company.active,
        aging,
        company.creditLimitVnd,
        blockDays,
        outstanding,
      )
      if (blocked) throw new ConflictException(blocked)

      if (!company.address && (await this.einvoice.enabledFor(order.branchId))) {
        throw new ConflictException({
          code: 'corporate_profile_incomplete',
          message: `Hồ sơ ${company.name} thiếu địa chỉ — hoá đơn bắt buộc có địa chỉ người mua. Kế toán bổ sung ở B15`,
        })
      }

      const outcome = await this.approvals.authorize(tx, {
        actor,
        action: 'corporate.charge-at-pos',
        entity: 'order',
        entityId: String(input.orderId),
        approval,
      })

      const dueOn = addDays(today, company.paymentTermDays)
      const signer = input.signer?.trim() || null
      let charge
      try {
        const [row] = await tx
          .insert(corporateCharges)
          .values({
            corporateId: company.id,
            branchId: order.branchId,
            orderId: order.id,
            amountVnd: outstanding,
            chargedOn: today,
            dueOn,
            signer,
            approvalId: outcome.approvalId,
            createdBy: actor.kind === 'staff' ? actor.staffId : null,
          })
          .returning()
        charge = row!
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictException('Đơn này đã được ghi nợ rồi')
        throw err
      }

      /**
       * Mã VietQR còn treo của bill này hết giá trị: tiền chuyển tới sau lúc ghi nợ
       * là giao dịch chưa khớp ở P15 (hoàn cho khách), không được kéo đơn về "trả
       * một phần".
       */
      await tx
        .update(payments)
        .set({ state: 'expired' })
        .where(and(eq(payments.orderId, order.id), eq(payments.state, 'pending')))

      // Bill đã xong với khách: công ty nợ, không phải người ngồi bàn nợ. Hoá đơn
      // đứng tên công ty nợ tiền, dù ở bàn khách đã khai người mua khác.
      const buyer: InvoiceBuyer | null = company.address
        ? {
            kind: 'company',
            taxCode: company.taxCode,
            name: company.name,
            address: company.address,
            email: company.contactEmail ?? undefined,
            contactName: signer ?? company.contactName ?? undefined,
            corporateId: company.id,
          }
        : order.invoiceBuyer
      await tx
        .update(orders)
        .set({ paymentState: 'paid', invoiceBuyer: buyer })
        .where(eq(orders.id, order.id))
      if (order.tableSessionId) {
        await tx
          .update(tableSessions)
          .set({ status: 'paid_wait_clear' })
          .where(eq(tableSessions.id, order.tableSessionId))
      }
      const invoiceId = await this.einvoice.enqueueForPaidOrder(tx, order.id)

      await emit(tx, {
        branchId: order.branchId,
        topic: 'table.paid',
        rooms: [
          rooms.tables(order.branchId),
          ...(order.tableSessionId ? [rooms.tableSession(order.tableSessionId)] : []),
        ],
        payload: {
          sessionId: order.tableSessionId,
          orderId: order.id,
          paymentState: 'paid',
          outstanding: 0,
        },
      })

      await this.audit.write(tx, {
        actor,
        action: 'corporate.charge',
        entity: 'corporate_charge',
        entityId: String(charge.id),
        approvalId: outcome.approvalId,
        payload: {
          company: company.code,
          order: order.displayCode,
          amountVnd: outstanding,
          dueOn,
        },
      })
      return { charge, invoiceId }
    })

    // Sau commit, ngoài transaction — xem EinvoiceService
    return { ...charge, invoice: await this.einvoice.issueQuietly(invoiceId, actor) }
  }

  // ========================================================== Tuổi nợ & gạch nợ

  /**
   * Bảng kê một công ty trong một kỳ — thứ gửi email cuối kỳ đối soát.
   *
   * Trả về CẢ dòng đã trả trong kỳ lẫn dòng còn nợ: bảng kê chỉ có phần còn nợ là
   * bảng kê mà bên kia không đối chiếu được với sổ của họ.
   */
  async statement(corporateId: number, from: string, to: string) {
    const [company] = await this.db
      .select()
      .from(corporateCustomers)
      .where(eq(corporateCustomers.id, corporateId))
    if (!company) throw new NotFoundException('Không có khách doanh nghiệp này')

    const rows = await this.db
      .select({
        id: corporateCharges.id,
        orderId: corporateCharges.orderId,
        displayCode: orders.displayCode,
        branchId: corporateCharges.branchId,
        amountVnd: corporateCharges.amountVnd,
        chargedOn: corporateCharges.chargedOn,
        dueOn: corporateCharges.dueOn,
        signer: corporateCharges.signer,
        settledVnd: sql<number>`coalesce(sum(${corporateSettlements.amountVnd}), 0)::float8`,
      })
      .from(corporateCharges)
      .innerJoin(orders, eq(orders.id, corporateCharges.orderId))
      .leftJoin(corporateSettlements, eq(corporateSettlements.chargeId, corporateCharges.id))
      .where(
        and(
          eq(corporateCharges.corporateId, corporateId),
          sql`${corporateCharges.chargedOn} between ${from} and ${to}`,
        ),
      )
      .groupBy(corporateCharges.id, orders.displayCode)
      .orderBy(asc(corporateCharges.chargedOn), asc(corporateCharges.id))

    const settlements = await this.db
      .select({
        id: corporateSettlements.id,
        chargeId: corporateSettlements.chargeId,
        kind: corporateSettlements.kind,
        amountVnd: corporateSettlements.amountVnd,
        paidOn: corporateSettlements.paidOn,
        note: corporateSettlements.note,
        byName: staff.fullName,
      })
      .from(corporateSettlements)
      .innerJoin(corporateCharges, eq(corporateCharges.id, corporateSettlements.chargeId))
      .leftJoin(staff, eq(staff.id, corporateSettlements.createdBy))
      .where(eq(corporateCharges.corporateId, corporateId))
      .orderBy(desc(corporateSettlements.paidOn))

    const today = businessDateOf(new Date(), 'Asia/Ho_Chi_Minh')
    const defaults = await this.defaults()
    const aging = (await this.balancesFor([corporateId], today)).get(corporateId) ?? emptyAging()

    return {
      company: {
        ...company,
        blockAfterOverdueDaysEffective:
          company.blockAfterOverdueDays ?? defaults.blockAfterOverdueDays,
      },
      period: { from, to },
      charges: rows.map((r) => ({
        ...r,
        settledVnd: Math.round(r.settledVnd),
        remainingVnd: r.amountVnd - Math.round(r.settledVnd),
        overdueDays: Math.max(0, daysBetween(r.dueOn, today)),
      })),
      settlements,
      aging,
      totals: {
        chargedVnd: rows.reduce((s, r) => s + r.amountVnd, 0),
        settledVnd: rows.reduce((s, r) => s + Math.round(r.settledVnd), 0),
        outstandingVnd: aging.totalVnd,
      },
    }
  }

  /**
   * Gạch nợ (tiền về) hoặc xoá nợ (không đòi được).
   *
   * Không cho gạch quá số còn nợ: tiền thừa của một công ty là tiền của kỳ sau,
   * và nhét nó vào dòng nợ này sẽ làm bảng kê hai bên lệch nhau đúng số đó.
   */
  async settle(
    input: {
      chargeId: number
      kind: 'payment' | 'write-off'
      amountVnd: number
      paidOn: string
      paymentId: number | null
      note: string | null
    },
    actor: Actor,
  ) {
    if (input.amountVnd <= 0) throw new BadRequestException('Số tiền phải lớn hơn 0')
    if (input.kind === 'write-off' && !input.note?.trim()) {
      throw new BadRequestException('Xoá nợ phải ghi lý do')
    }

    return this.db.transaction(async (tx) => {
      const [charge] = await tx
        .select()
        .from(corporateCharges)
        .where(eq(corporateCharges.id, input.chargeId))
        .for('update')
      if (!charge) throw new NotFoundException('Không có dòng nợ này')

      const paid = await tx
        .select({ settled: sql<number>`coalesce(sum(${corporateSettlements.amountVnd}), 0)::float8` })
        .from(corporateSettlements)
        .where(eq(corporateSettlements.chargeId, input.chargeId))

      const remaining = charge.amountVnd - Math.round(paid[0]?.settled ?? 0)
      if (remaining <= 0) throw new ConflictException('Dòng nợ này đã tất toán')
      if (input.amountVnd > remaining) {
        throw new BadRequestException(
          `Vượt số còn nợ (${remaining}đ) — phần thừa là của kỳ sau, không gạch vào dòng này`,
        )
      }

      const [row] = await tx
        .insert(corporateSettlements)
        .values({
          chargeId: input.chargeId,
          kind: input.kind,
          amountVnd: input.amountVnd,
          paidOn: input.paidOn,
          paymentId: input.paymentId,
          note: input.note?.trim() || null,
          createdBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .returning()

      await this.audit.write(tx, {
        actor,
        action: input.kind === 'payment' ? 'corporate.settle' : 'corporate.write-off',
        entity: 'corporate_charge',
        entityId: String(input.chargeId),
        payload: { amountVnd: input.amountVnd, note: input.note },
      })
      return row!
    })
  }

  /**
   * Tuổi nợ toàn chuỗi tại hết ngày `asOf` — nguồn cho tab "Phải thu khách DN" của F5.
   *
   * Để ở đây chứ không ở `AccountingService` vì dữ liệu là của B15; F5 gọi sang.
   * Nhân đôi phép tính ở hai miền là hẹn ngày hai màn báo hai con số.
   *
   * F5 xem theo kỳ nên sổ cắt ở `asOf`: ngày cuối kỳ, kỳ chưa hết thì hôm nay — `debts()`
   * chọn ngày đó, ở đây chỉ tính. Không cắt thì mở lại tháng 8 vào tháng 10 sẽ thấy cả
   * bill tháng 10 và mất khoản tháng 9 mới trả — con số của một kỳ đã qua đổi theo ngày
   * mở báo cáo.
   */
  async receivables(asOf: string) {
    const companies = await this.db
      .select({
        id: corporateCustomers.id,
        code: corporateCustomers.code,
        name: corporateCustomers.name,
        creditLimitVnd: corporateCustomers.creditLimitVnd,
        paymentTermDays: corporateCustomers.paymentTermDays,
        contactName: corporateCustomers.contactName,
        contactPhone: corporateCustomers.contactPhone,
      })
      .from(corporateCustomers)
    if (companies.length === 0) return { companies: [], totals: emptyAging() }

    const balances = await this.balancesFor(
      companies.map((c) => c.id),
      asOf,
      { cutOff: true },
    )
    const rows = companies
      .map((c) => ({ ...c, aging: balances.get(c.id) ?? emptyAging() }))
      .filter((c) => c.aging.totalVnd > 0)
      .sort((a, b) => b.aging.totalVnd - a.aging.totalVnd)

    return {
      companies: rows,
      totals: rows.reduce<AgingBuckets>(
        (sum, c) => ({
          currentVnd: sum.currentVnd + c.aging.currentVnd,
          d0to30Vnd: sum.d0to30Vnd + c.aging.d0to30Vnd,
          d31to60Vnd: sum.d31to60Vnd + c.aging.d31to60Vnd,
          over60Vnd: sum.over60Vnd + c.aging.over60Vnd,
          totalVnd: sum.totalVnd + c.aging.totalVnd,
          maxOverdueDays: Math.max(sum.maxOverdueDays, c.aging.maxOverdueDays),
        }),
        emptyAging(),
      ),
    }
  }

  // ================================================================== Nội bộ

  private async defaults() {
    const nums = await this.params.bundle({
      'corporate.defaultCreditLimitVnd': 20_000_000,
      'corporate.blockAfterOverdueDays': 15,
    })
    return {
      defaultCreditLimitVnd: nums['corporate.defaultCreditLimitVnd'],
      blockAfterOverdueDays: nums['corporate.blockAfterOverdueDays'],
    }
  }

  /**
   * Dư nợ còn lại của từng dòng, gom thành bốn khoang tuổi nợ đếm tới `today`.
   *
   * Mặc định là sổ như đang có — mọi dòng nợ, mọi lượt trả: B15 và cái chặn ghi nợ ở
   * POS hỏi "lúc này công ty nợ bao nhiêu". `cutOff` (F5) hỏi "hết ngày `today` công ty
   * nợ bao nhiêu" nên bỏ dòng nợ ghi sau ngày đó và lượt trả sau ngày đó.
   *
   * Cộng phần đã trả bằng LEFT JOIN + GROUP BY chứ không bằng truy vấn con tương
   * quan: `corporate_settlements` cũng có cột `id`, nên một truy vấn con viết
   * `s.charge_id = id` sẽ tự khớp vào `s.id` của chính nó và trả về tổng của một
   * dòng nợ khác — sai lặng lẽ, và sai theo hướng làm dư nợ biến mất.
   *
   * Cũng vì LEFT JOIN mà ngày trả lọc trong ON, không ở WHERE: ở WHERE, dòng nợ chưa
   * có lượt trả nào tới hết ngày đó bị loại cả dòng — đúng những dòng còn nợ nguyên
   * vẹn lại biến khỏi sổ.
   */
  private async balancesFor(
    ids: number[],
    today: string,
    { tx, cutOff = false }: { tx?: DbOrTx; cutOff?: boolean } = {},
  ) {
    const rows = await (tx ?? this.db)
      .select({
        corporateId: corporateCharges.corporateId,
        dueOn: corporateCharges.dueOn,
        amountVnd: corporateCharges.amountVnd,
        settledVnd: sql<number>`coalesce(sum(${corporateSettlements.amountVnd}), 0)::float8`,
      })
      .from(corporateCharges)
      .leftJoin(
        corporateSettlements,
        and(
          eq(corporateSettlements.chargeId, corporateCharges.id),
          cutOff ? lte(corporateSettlements.paidOn, today) : undefined,
        ),
      )
      .where(
        and(
          inArray(corporateCharges.corporateId, ids),
          cutOff ? lte(corporateCharges.chargedOn, today) : undefined,
        ),
      )
      .groupBy(
        corporateCharges.id,
        corporateCharges.corporateId,
        corporateCharges.dueOn,
        corporateCharges.amountVnd,
      )

    const byCompany = new Map<number, AgingBuckets>()
    for (const row of rows) {
      const remaining = row.amountVnd - Math.round(row.settledVnd)
      if (remaining <= 0) continue
      const current = byCompany.get(row.corporateId) ?? emptyAging()
      byCompany.set(row.corporateId, agingOf(current, remaining, row.dueOn, today))
    }
    return byCompany
  }
}

const emptyAging = (): AgingBuckets => ({
  currentVnd: 0,
  d0to30Vnd: 0,
  d31to60Vnd: 0,
  over60Vnd: 0,
  totalVnd: 0,
  maxOverdueDays: 0,
})

/**
 * Ba lý do POS từ chối ghi nợ mới, xét theo thứ tự nặng dần.
 * `incomingVnd` = số tiền của bill sắp ghi; truyền 0 khi chỉ muốn biết trạng thái.
 */
function blockReason(
  active: boolean,
  aging: AgingBuckets,
  creditLimitVnd: number,
  blockAfterOverdueDays: number,
  incomingVnd: number,
): string | null {
  if (!active) return 'Hồ sơ đã ngừng hoạt động'
  if (aging.maxOverdueDays > blockAfterOverdueDays) {
    return `Có khoản quá hạn ${aging.maxOverdueDays} ngày, vượt mức chặn ${blockAfterOverdueDays} ngày`
  }
  if (aging.totalVnd + incomingVnd > creditLimitVnd) {
    return `Vượt hạn mức nợ: đang nợ ${aging.totalVnd}đ, hạn mức ${creditLimitVnd}đ`
  }
  return null
}

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
