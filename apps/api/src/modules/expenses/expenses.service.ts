import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, gte, lte, sql, type SQLWrapper } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import { PeriodLockService } from '../../common/period-lock.service'
import { isUniqueViolation } from '../../common/pg-error'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  assets,
  branches,
  employees,
  expenseBudgets,
  expenseCategories,
  expenseEntries,
  expenseVouchers,
  inputInvoices,
  recurringExpenses,
  staff,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import {
  addMonths,
  amortize,
  approvalTierOf,
  depreciationFor,
  firstOfMonth,
  needsAssetRecord,
  type ApprovalThresholds,
} from './domain/expense'

export interface VoucherInput {
  branchId: string
  categoryId: string
  kind: 'expense' | 'advance'
  supplier: string | null
  memo: string | null
  amountVnd: number
  vatVnd: number
  method: 'cash' | 'transfer'
  amortizeMonths: number
  amortizeFrom: string
  advanceEmployeeId: number | null
  paidOn: string
}

export interface AssetInput {
  branchId: string
  categoryId: string
  name: string
  costVnd: number
  inServiceFrom: string
  depreciationMonths: number
  note: string | null
}

/** Cùng lý do với `reports.service.ts`: tổng tiền cả kỳ vượt tầm int4 */
const money = (expr: SQLWrapper) => sql<number>`coalesce(sum(${expr}), 0)::float8`

export interface InputInvoiceInput {
  branchId: string
  /** Gắn phiếu chi là tuỳ chọn — hoá đơn và tiền ra đến theo hai nhịp khác nhau */
  voucherId: number | null
  sellerName: string
  sellerTaxCode: string
  invoiceNo: string
  serial: string | null
  issuedOn: string
  netVnd: number
  vatVnd: number
  deductible: boolean
  note: string | null
}

/**
 * Chi phí & tài sản — C1 · C2 · C3 · C4 · C6.
 *
 * NGUYÊN TẮC CỦA CẢ NHÓM (§27): *máy tự ghi mọi khoản máy biết, người chỉ nhập
 * khoản máy không biết*. Giá vốn (kho), nhân sự (kỳ lương) và khấu hao (C4) đều tự
 * chảy vào; người chỉ gõ tiền nhà, điện nước, sửa chữa, marketing, chi vặt.
 *
 * HAI MẶT CỦA MỘT KHOẢN TIỀN, và đây là chỗ dễ sai nhất của cả module:
 *   · `expense_vouchers` = tiền ra (dòng tiền) — tạm ứng CÓ ở đây.
 *   · `expense_entries`  = chi phí theo tháng (dồn tích) — tạm ứng KHÔNG có ở đây,
 *     còn khấu hao thì CHỈ có ở đây.
 * `postEntriesFor` là nơi duy nhất quyết định một phiếu chi sinh ra dòng chi phí
 * nào; sửa quy tắc dồn tích thì sửa đúng chỗ đó.
 */
@Injectable()
export class ExpensesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly locks: PeriodLockService,
  ) {}

  // ==================================================== C6 · Khoản mục

  async categories() {
    return this.db
      .select()
      .from(expenseCategories)
      .orderBy(asc(expenseCategories.sort), asc(expenseCategories.name))
  }

  async budgets(branchId: string, month: string) {
    return this.db
      .select()
      .from(expenseBudgets)
      .where(and(eq(expenseBudgets.branchId, branchId), eq(expenseBudgets.month, firstOfMonth(month))))
  }

  async setBudget(
    input: { branchId: string; categoryId: string; month: string; amountVnd: number },
    actor: Actor,
  ) {
    if (input.amountVnd < 0) throw new BadRequestException('Ngân sách không nhận số âm')
    const month = firstOfMonth(input.month)

    return this.db.transaction(async (tx) => {
      await tx
        .insert(expenseBudgets)
        .values({ ...input, month })
        .onConflictDoUpdate({
          target: [expenseBudgets.branchId, expenseBudgets.categoryId, expenseBudgets.month],
          set: { amountVnd: input.amountVnd },
        })

      await this.audit.write(tx, {
        actor,
        action: 'expense.budget-set',
        entity: 'expense_budget',
        entityId: `${input.branchId}:${input.categoryId}:${month}`,
        payload: { amountVnd: input.amountVnd },
      })
      return { ...input, month }
    })
  }

  // ================================================== C2 · Sổ phiếu chi

  async vouchers(branchId: string, from: string, to: string) {
    const rows = await this.db
      .select({
        voucher: expenseVouchers,
        categoryName: expenseCategories.name,
        pnlLine: expenseCategories.pnlLine,
        createdByName: staff.fullName,
      })
      .from(expenseVouchers)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenseVouchers.categoryId))
      .leftJoin(staff, eq(staff.id, expenseVouchers.createdBy))
      .where(
        and(
          eq(expenseVouchers.branchId, branchId),
          gte(expenseVouchers.paidOn, from),
          lte(expenseVouchers.paidOn, to),
        ),
      )
      .orderBy(sql`${expenseVouchers.paidOn} desc`, sql`${expenseVouchers.id} desc`)

    const thresholds = await this.thresholds(branchId)
    return rows.map(({ voucher, categoryName, pnlLine, createdByName }) => ({
      ...voucher,
      categoryName,
      pnlLine,
      createdByName,
      tier: approvalTierOf(voucher.amountVnd, thresholds, Boolean(voucher.assetId)),
    }))
  }

  // ================================================ C5 · Hoá đơn đầu vào

  /**
   * Sổ hoá đơn VAT đầu vào, kèm danh sách phiếu chi CHƯA có hoá đơn.
   *
   * Phần thứ hai mới là lý do màn này tồn tại. Một phiếu chi lớn không có hoá đơn
   * đầu vào là một khoản VAT không đòi lại được — mất tiền thật, mà chỗ mất thì
   * không hiện ra ở bất kỳ báo cáo nào khác. Ngưỡng lấy từ hạn mức chi vặt A6:
   * dưới mức đó là chi chợ, chi vặt, không ai đòi hoá đơn.
   */
  async inputInvoices(branchId: string, from: string, to: string) {
    const [rows, thresholds] = await Promise.all([
      this.db
        .select({
          invoice: inputInvoices,
          voucherMemo: expenseVouchers.memo,
          voucherAmount: expenseVouchers.amountVnd,
          categoryName: expenseCategories.name,
          createdByName: staff.fullName,
        })
        .from(inputInvoices)
        .leftJoin(expenseVouchers, eq(expenseVouchers.id, inputInvoices.voucherId))
        .leftJoin(expenseCategories, eq(expenseCategories.id, expenseVouchers.categoryId))
        .leftJoin(staff, eq(staff.id, inputInvoices.createdBy))
        .where(
          and(
            eq(inputInvoices.branchId, branchId),
            gte(inputInvoices.issuedOn, from),
            lte(inputInvoices.issuedOn, to),
          ),
        )
        .orderBy(sql`${inputInvoices.issuedOn} desc`, sql`${inputInvoices.id} desc`),
      this.thresholds(branchId),
    ])

    const missing = await this.db
      .select({
        id: expenseVouchers.id,
        paidOn: expenseVouchers.paidOn,
        supplier: expenseVouchers.supplier,
        memo: expenseVouchers.memo,
        amountVnd: expenseVouchers.amountVnd,
        vatVnd: expenseVouchers.vatVnd,
        categoryName: expenseCategories.name,
      })
      .from(expenseVouchers)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenseVouchers.categoryId))
      .where(
        and(
          eq(expenseVouchers.branchId, branchId),
          eq(expenseVouchers.state, 'approved'),
          // Tạm ứng không phải chi phí nên không kèm hoá đơn VAT
          eq(expenseVouchers.kind, 'expense'),
          gte(expenseVouchers.paidOn, from),
          lte(expenseVouchers.paidOn, to),
          /**
           * Hai loại phiếu đáng nêu tên, và loại thứ hai mới là loại gắt:
           *   · Phiếu LỚN (từ hạn mức chi vặt trở lên) — mức đó thì phải có hoá đơn.
           *   · Phiếu ĐÃ GÕ SỐ VAT mà không có tờ nào đứng sau, dù nhỏ. Người ghi
           *     đang tưởng khoản đó được khấu trừ; không có chứng từ thì không.
           */
          sql`(${expenseVouchers.amountVnd} >= ${thresholds.pettyCashVnd}
            OR ${expenseVouchers.vatVnd} > 0)`,
          sql`not exists (
            select 1 from ${inputInvoices} i where i.voucher_id = ${expenseVouchers.id}
          )`,
        ),
      )
      .orderBy(sql`${expenseVouchers.amountVnd} desc`)

    const deductibleVnd = rows
      .filter(({ invoice }) => invoice.deductible)
      .reduce((sum, { invoice }) => sum + invoice.vatVnd, 0)

    return {
      branchId,
      from,
      to,
      thresholdVnd: thresholds.pettyCashVnd,
      rows: rows.map(({ invoice, voucherMemo, voucherAmount, categoryName, createdByName }) => ({
        ...invoice,
        voucherMemo,
        voucherAmount,
        categoryName,
        createdByName,
      })),
      /** Con số F4 cộng vào thuế đầu vào */
      deductibleVnd,
      declaredButUndocumentedVnd: missing.reduce((sum, v) => sum + v.vatVnd, 0),
      missingVouchers: missing,
    }
  }

  /**
   * Ghi một tờ hoá đơn đầu vào.
   *
   * Gắn phiếu chi là TUỲ CHỌN vì hai thứ đến theo hai nhịp khác nhau: hoá đơn nhà
   * cung cấp có thể về trước lúc trả tiền, hoặc về sau cả tháng. Bắt buộc gắn sẽ
   * làm kế toán để dồn một xấp hoá đơn chờ phiếu — và xấp đó là chỗ hoá đơn thất
   * lạc.
   */
  async createInputInvoice(input: InputInvoiceInput, actor: Actor) {
    await this.requireBranch(input.branchId)
    await this.locks.assertOpen(input.branchId, [input.issuedOn], 'ghi hoá đơn đầu vào')
    if (input.vatVnd > input.netVnd) {
      throw new BadRequestException('VAT không lớn hơn tiền trước thuế — có thể đang gõ nhầm cột')
    }

    if (input.voucherId !== null) {
      const [voucher] = await this.db
        .select()
        .from(expenseVouchers)
        .where(eq(expenseVouchers.id, input.voucherId))
      if (!voucher || voucher.branchId !== input.branchId) {
        throw new NotFoundException('Không có phiếu chi này ở chi nhánh đang xem')
      }
      if (voucher.kind === 'advance') {
        throw new BadRequestException(
          'Tạm ứng không phải chi phí nên không gắn hoá đơn VAT — hoá đơn sẽ về cùng khoản chi thật',
        )
      }
      /**
       * Tổng tiền trên các tờ hoá đơn không vượt số tiền đã chi. Vượt nghĩa là
       * gắn nhầm tờ của phiếu khác, và hậu quả là khấu trừ VAT nhiều hơn số thật
       * đã trả — đúng thứ mà thanh tra thuế tìm.
       */
      const [sum] = await this.db
        .select({ total: money(sql`${inputInvoices.netVnd} + ${inputInvoices.vatVnd}`) })
        .from(inputInvoices)
        .where(eq(inputInvoices.voucherId, input.voucherId))
      const already = Number(sum?.total ?? 0)
      if (already + input.netVnd + input.vatVnd > voucher.amountVnd) {
        throw new ConflictException(
          `Tổng hoá đơn gắn vào phiếu này (${already + input.netVnd + input.vatVnd}₫) vượt số đã chi (${voucher.amountVnd}₫)`,
        )
      }
    }

    try {
      const [row] = await this.db
        .insert(inputInvoices)
        .values({
          ...input,
          sellerName: input.sellerName.trim(),
          sellerTaxCode: input.sellerTaxCode.trim(),
          invoiceNo: input.invoiceNo.trim(),
          serial: input.serial?.trim() || null,
          createdBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .returning({ id: inputInvoices.id })

      await this.writeInvoiceLog(actor, 'input-invoice.created', String(row!.id), {
        sellerTaxCode: input.sellerTaxCode,
        invoiceNo: input.invoiceNo,
        vatVnd: input.vatVnd,
        voucherId: input.voucherId,
      })
      return { id: row!.id }
    } catch (err) {
      if (isUniqueViolation(err, 'input_invoices_seller_no_unique')) {
        throw new ConflictException(
          `Hoá đơn số ${input.invoiceNo} của mã số thuế ${input.sellerTaxCode} đã ghi rồi`,
        )
      }
      throw err
    }
  }

  /** Sửa cờ khấu trừ hoặc gắn phiếu chi về sau — hai việc kế toán làm nhiều nhất */
  async updateInputInvoice(
    id: number,
    patch: { voucherId?: number | null; deductible?: boolean; note?: string | null },
    actor: Actor,
  ) {
    const [row] = await this.db.select().from(inputInvoices).where(eq(inputInvoices.id, id))
    if (!row) throw new NotFoundException('Không có hoá đơn này')
    await this.locks.assertOpen(row.branchId, [row.issuedOn], 'sửa hoá đơn đầu vào')

    if (patch.voucherId != null) {
      const [voucher] = await this.db
        .select()
        .from(expenseVouchers)
        .where(eq(expenseVouchers.id, patch.voucherId))
      if (!voucher || voucher.branchId !== row.branchId) {
        throw new NotFoundException('Không có phiếu chi này ở chi nhánh đang xem')
      }
    }

    await this.db.update(inputInvoices).set(patch).where(eq(inputInvoices.id, id))
    await this.writeInvoiceLog(actor, 'input-invoice.updated', String(id), { ...patch })
    return { id }
  }

  async deleteInputInvoice(id: number, actor: Actor) {
    const [row] = await this.db.select().from(inputInvoices).where(eq(inputInvoices.id, id))
    if (!row) throw new NotFoundException('Không có hoá đơn này')
    await this.locks.assertOpen(row.branchId, [row.issuedOn], 'xoá hoá đơn đầu vào')

    await this.db.delete(inputInvoices).where(eq(inputInvoices.id, id))
    await this.writeInvoiceLog(actor, 'input-invoice.deleted', String(id), {
      invoiceNo: row.invoiceNo,
      vatVnd: row.vatVnd,
    })
    return { id, deleted: true }
  }

  private async writeInvoiceLog(
    actor: Actor,
    action: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await this.audit.writeStandalone({ actor, action, entity: 'input_invoice', entityId, payload })
  }

  /**
   * VAT đầu vào ĐƯỢC KHẤU TRỪ của một kỳ — nguồn cho F4.
   *
   * Lấy từ tờ hoá đơn chứ không từ con số gõ trên phiếu chi: số trên phiếu là ý
   * định, tờ hoá đơn mới là bằng chứng, và cơ quan thuế hỏi bằng chứng.
   */
  async deductibleVatIn(branchId: string, from: string, to: string) {
    const [row] = await this.db
      .select({ vat: money(inputInvoices.vatVnd), count: sql<number>`count(*)::int` })
      .from(inputInvoices)
      .where(
        and(
          eq(inputInvoices.branchId, branchId),
          eq(inputInvoices.deductible, true),
          gte(inputInvoices.issuedOn, from),
          lte(inputInvoices.issuedOn, to),
        ),
      )
    return { vatVnd: Number(row?.vat ?? 0), invoices: Number(row?.count ?? 0) }
  }

  /**
   * Ghi phiếu chi.
   *
   * Quyền phụ thuộc SỐ TIỀN, không phải phụ thuộc màn hình: dưới hạn mức chi vặt
   * thì quản lý ca tự ghi, trên hạn mức thì chính thao tác đó cần duyệt. Nên bậc
   * duyệt tính trước rồi mới chọn hành động để hỏi `ApprovalService` — đó là cách
   * duy nhất hai dòng của §4.2b khác nhau ở đúng chỗ chúng phải khác.
   */
  async createVoucher(input: VoucherInput, actor: Actor, approval?: ApprovalInput | null) {
    const branch = await this.requireBranch(input.branchId)
    // Kỳ đã khoá sổ (F6) không nhận phiếu chi mới — kể cả phiếu ghi lùi ngày
    await this.locks.assertOpen(input.branchId, [input.paidOn], 'ghi phiếu chi')
    const [category] = await this.db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.id, input.categoryId))
    if (!category) throw new NotFoundException('Không có khoản mục này')
    if (category.automatic) {
      throw new BadRequestException(
        `Khoản mục "${category.name}" do máy tự ghi (kho, kỳ lương, khấu hao) — không nhập tay ở đây`,
      )
    }

    if (!Number.isSafeInteger(input.amountVnd) || input.amountVnd <= 0) {
      throw new BadRequestException('Số tiền phải là số nguyên dương')
    }
    if (input.vatVnd > input.amountVnd) {
      throw new BadRequestException('VAT đầu vào không thể lớn hơn số tiền phiếu')
    }
    if (input.kind === 'advance' && !input.advanceEmployeeId) {
      throw new BadRequestException('Tạm ứng phải chọn nhân viên nhận')
    }

    const thresholds = await this.thresholds(input.branchId)
    if (needsAssetRecord(input.amountVnd, category.pnlLine, thresholds)) {
      throw new ConflictException({
        code: 'needs_asset_record',
        message: `Mua sắm từ ${thresholds.assetVnd.toLocaleString('vi-VN')}₫ phải ghi thành TÀI SẢN ở C4 rồi khấu hao dần, không vào chi phí một lần`,
      })
    }

    const tier = approvalTierOf(input.amountVnd, thresholds)
    const action = tier === 'tu-ghi' ? 'expense.record-petty' : 'expense.record-over-limit'

    return this.db.transaction(async (tx) => {
      await this.approvals.authorize(tx, {
        actor,
        action,
        entity: 'expense_voucher',
        entityId: 'new',
        approval,
      })

      const [voucher] = await tx
        .insert(expenseVouchers)
        .values({
          ...input,
          amortizeFrom: firstOfMonth(input.amortizeFrom),
          // Chi vặt tự ghi thì duyệt luôn — kế toán hậu kiểm, không chặn quầy
          state: tier === 'tu-ghi' ? 'approved' : 'draft',
          approvedAt: tier === 'tu-ghi' ? new Date() : null,
          approvedBy: tier === 'tu-ghi' && actor.kind === 'staff' ? actor.staffId : null,
          createdBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .returning()

      if (voucher!.state === 'approved') await this.postEntriesFor(tx, voucher!)

      await this.audit.write(tx, {
        actor,
        action: 'expense.voucher-created',
        entity: 'expense_voucher',
        entityId: String(voucher!.id),
        payload: {
          amountVnd: input.amountVnd,
          categoryId: input.categoryId,
          tier,
          businessDate: businessDateOf(new Date(), branch.timezone),
        },
      })

      return { ...voucher!, tier }
    })
  }

  async approveVoucher(id: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [voucher] = await tx.select().from(expenseVouchers).where(eq(expenseVouchers.id, id))
      if (!voucher) throw new NotFoundException('Không có phiếu chi này')
      if (voucher.state !== 'draft') {
        throw new ConflictException(`Phiếu đang ở trạng thái "${voucher.state}"`)
      }
      if (actor.kind === 'staff' && voucher.createdBy === actor.staffId) {
        throw new ConflictException('Không ai tự duyệt phiếu chi của mình')
      }
      // Duyệt là lúc phiếu thành chi phí, nên nó cũng phải nằm trong kỳ còn mở
      await this.locks.assertOpen(voucher.branchId, [voucher.paidOn], 'duyệt phiếu chi')

      const [approved] = await tx
        .update(expenseVouchers)
        .set({
          state: 'approved',
          approvedAt: new Date(),
          approvedBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .where(eq(expenseVouchers.id, id))
        .returning()

      await this.postEntriesFor(tx, approved!)

      await this.audit.write(tx, {
        actor,
        action: 'expense.voucher-approved',
        entity: 'expense_voucher',
        entityId: String(id),
        payload: { amountVnd: voucher.amountVnd },
      })
      return approved!
    })
  }

  /**
   * Sinh dòng chi phí theo kỳ phân bổ. Đây là ranh giới dòng tiền → dồn tích.
   *
   * Tạm ứng KHÔNG đi qua đây: nó là tiền ra nhưng chưa phải chi phí, và sẽ khấu
   * trừ vào kỳ lương H7. Ghi nó thành chi phí là đếm hai lần — một lần lúc ứng,
   * một lần nữa khi trả lương.
   */
  private async postEntriesFor(tx: Tx, voucher: typeof expenseVouchers.$inferSelect) {
    if (voucher.kind === 'advance') return

    const slices = amortize(voucher.amountVnd, voucher.amortizeMonths, voucher.amortizeFrom)
    await tx.insert(expenseEntries).values(
      slices.map((slice) => ({
        branchId: voucher.branchId,
        categoryId: voucher.categoryId,
        month: slice.month,
        amountVnd: slice.amountVnd,
        source: 'voucher' as const,
        voucherId: voucher.id,
      })),
    )
  }

  /** Tạm ứng chưa khấu trừ của một người — H7 đọc để trừ vào thực lãnh */
  async openAdvances(branchId: string, from: string, to: string) {
    const rows = await this.db
      .select({
        employeeId: expenseVouchers.advanceEmployeeId,
        total: sql<number>`coalesce(sum(${expenseVouchers.amountVnd}), 0)::float8`,
      })
      .from(expenseVouchers)
      .where(
        and(
          eq(expenseVouchers.branchId, branchId),
          eq(expenseVouchers.kind, 'advance'),
          eq(expenseVouchers.state, 'approved'),
          sql`${expenseVouchers.settledPeriodId} is null`,
          gte(expenseVouchers.paidOn, from),
          lte(expenseVouchers.paidOn, to),
        ),
      )
      .groupBy(expenseVouchers.advanceEmployeeId)

    return new Map(rows.map((r) => [Number(r.employeeId), Number(r.total)]))
  }

  /** Đánh dấu đã khấu trừ — gọi khi kỳ lương chốt, để kỳ sau không trừ lại */
  async settleAdvances(tx: Tx, branchId: string, from: string, to: string, periodId: number) {
    await tx
      .update(expenseVouchers)
      .set({ settledPeriodId: periodId })
      .where(
        and(
          eq(expenseVouchers.branchId, branchId),
          eq(expenseVouchers.kind, 'advance'),
          eq(expenseVouchers.state, 'approved'),
          sql`${expenseVouchers.settledPeriodId} is null`,
          gte(expenseVouchers.paidOn, from),
          lte(expenseVouchers.paidOn, to),
        ),
      )
  }

  // ============================================== C3 · Chi phí định kỳ

  async recurring(branchId: string) {
    return this.db
      .select({ recurring: recurringExpenses, categoryName: expenseCategories.name })
      .from(recurringExpenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, recurringExpenses.categoryId))
      .where(eq(recurringExpenses.branchId, branchId))
      .orderBy(asc(recurringExpenses.dayOfMonth))
  }

  async createRecurring(
    input: {
      branchId: string
      categoryId: string
      name: string
      supplier: string | null
      expectedVnd: number
      dayOfMonth: number
      method: 'cash' | 'transfer'
    },
    actor: Actor,
  ) {
    const [row] = await this.db.insert(recurringExpenses).values(input).returning()
    await this.db.transaction((tx) =>
      this.audit.write(tx, {
        actor,
        action: 'expense.recurring-created',
        entity: 'recurring_expense',
        entityId: String(row!.id),
        payload: { name: input.name, expectedVnd: input.expectedVnd },
      }),
    )
    return row!
  }

  /**
   * Sinh phiếu chi NHÁP cho tháng — chống bỏ sót là chống ở đây (§27 C3).
   *
   * Phiếu sinh ra mang số tiền DỰ KIẾN và nằm ở trạng thái nháp: điện nước biến
   * động nên người vận hành phải điền số thật rồi mới duyệt. Chạy lại nhiều lần
   * trong cùng tháng không sinh trùng.
   */
  async generateRecurring(branchId: string, month: string, actor: Actor) {
    const target = firstOfMonth(month)

    return this.db.transaction(async (tx) => {
      const active = await tx
        .select()
        .from(recurringExpenses)
        .where(and(eq(recurringExpenses.branchId, branchId), eq(recurringExpenses.active, true)))

      const existing = await tx
        .select({ recurringId: expenseVouchers.recurringId })
        .from(expenseVouchers)
        .where(
          and(
            eq(expenseVouchers.branchId, branchId),
            gte(expenseVouchers.paidOn, target),
            lte(expenseVouchers.paidOn, endOfMonth(target)),
            sql`${expenseVouchers.recurringId} is not null`,
          ),
        )
      const already = new Set(existing.map((e) => Number(e.recurringId)))

      const pending = active.filter((r) => !already.has(r.id))
      if (pending.length === 0) return { month: target, created: 0 }

      await tx.insert(expenseVouchers).values(
        pending.map((r) => ({
          branchId,
          categoryId: r.categoryId,
          kind: 'expense' as const,
          supplier: r.supplier,
          memo: `${r.name} — phiếu định kỳ, kiểm lại số thật trước khi duyệt`,
          amountVnd: r.expectedVnd,
          vatVnd: 0,
          method: r.method,
          amortizeMonths: 1,
          amortizeFrom: target,
          advanceEmployeeId: null,
          state: 'draft' as const,
          recurringId: r.id,
          paidOn: `${target.slice(0, 8)}${String(r.dayOfMonth).padStart(2, '0')}`,
          createdBy: actor.kind === 'staff' ? actor.staffId : null,
        })),
      )

      await this.audit.write(tx, {
        actor,
        action: 'expense.recurring-generated',
        entity: 'branch',
        entityId: branchId,
        payload: { month: target, created: pending.length },
      })

      return { month: target, created: pending.length }
    })
  }

  // ============================================ C4 · Tài sản & khấu hao

  async assets(branchId: string) {
    const rows = await this.db
      .select()
      .from(assets)
      .where(eq(assets.branchId, branchId))
      .orderBy(sql`${assets.inServiceFrom} desc`)

    const posted = await this.db
      .select({
        assetId: expenseEntries.assetId,
        total: sql<number>`coalesce(sum(${expenseEntries.amountVnd}), 0)::float8`,
      })
      .from(expenseEntries)
      .where(and(eq(expenseEntries.branchId, branchId), eq(expenseEntries.source, 'depreciation')))
      .groupBy(expenseEntries.assetId)

    return rows.map((asset) => {
      const accumulated = Number(posted.find((p) => Number(p.assetId) === asset.id)?.total ?? 0)
      return {
        ...asset,
        monthlyVnd: depreciationFor(asset, asset.inServiceFrom),
        accumulatedVnd: accumulated,
        remainingVnd: asset.costVnd - accumulated,
      }
    })
  }

  async createAsset(input: AssetInput, actor: Actor) {
    await this.requireBranch(input.branchId)
    if (!Number.isSafeInteger(input.costVnd) || input.costVnd <= 0) {
      throw new BadRequestException('Nguyên giá phải là số nguyên dương')
    }
    if (input.depreciationMonths <= 0) {
      throw new BadRequestException('Số tháng khấu hao phải lớn hơn 0')
    }

    return this.db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(assets)
        .values({
          ...input,
          inServiceFrom: firstOfMonth(input.inServiceFrom),
          createdBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .returning()

      await this.audit.write(tx, {
        actor,
        action: 'asset.created',
        entity: 'asset',
        entityId: String(asset!.id),
        payload: { name: input.name, costVnd: input.costVnd },
      })
      return asset!
    })
  }

  async retireAsset(id: number, retiredOn: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [asset] = await tx
        .update(assets)
        .set({ retiredOn })
        .where(eq(assets.id, id))
        .returning()
      if (!asset) throw new NotFoundException('Không có tài sản này')

      await this.audit.write(tx, {
        actor,
        action: 'asset.retired',
        entity: 'asset',
        entityId: String(id),
        payload: { retiredOn },
      })
      return asset
    })
  }

  /**
   * Sinh bút toán khấu hao của một tháng. "Khấu hao tháng tự sinh bút toán chi
   * phí, không nhập tay" (§27 C4).
   *
   * Khấu hao là chi phí KHÔNG có tiền ra, nên nó không đi qua phiếu chi: ghi thẳng
   * vào sổ dồn tích. Chỉ số duy nhất trên (assetId, month) làm lệnh này chạy lại
   * bao nhiêu lần cũng chỉ ghi một dòng.
   */
  async generateDepreciation(branchId: string, month: string, actor: Actor) {
    const target = firstOfMonth(month)

    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(assets).where(eq(assets.branchId, branchId))

      const values = rows
        .map((asset) => ({ asset, amountVnd: depreciationFor(asset, target) }))
        .filter(({ amountVnd }) => amountVnd > 0)
        .map(({ asset, amountVnd }) => ({
          branchId,
          categoryId: asset.categoryId,
          month: target,
          amountVnd,
          source: 'depreciation' as const,
          assetId: asset.id,
        }))

      if (values.length === 0) return { month: target, posted: 0 }

      const inserted = await tx
        .insert(expenseEntries)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: expenseEntries.id })

      await this.audit.write(tx, {
        actor,
        action: 'asset.depreciation-posted',
        entity: 'branch',
        entityId: branchId,
        payload: { month: target, posted: inserted.length },
      })

      return { month: target, posted: inserted.length }
    })
  }

  // ============================================ C1 · Tổng quan chi phí

  /**
   * Chi phí theo khoản mục cho một khoảng THÁNG — nguồn cho C1 và cho F7 ở chế độ
   * dồn tích.
   */
  async byCategory(branchId: string, fromMonth: string, toMonth: string) {
    const rows = await this.db
      .select({
        categoryId: expenseEntries.categoryId,
        name: expenseCategories.name,
        pnlLine: expenseCategories.pnlLine,
        total: sql<number>`coalesce(sum(${expenseEntries.amountVnd}), 0)::float8`,
      })
      .from(expenseEntries)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenseEntries.categoryId))
      .where(
        and(
          eq(expenseEntries.branchId, branchId),
          gte(expenseEntries.month, firstOfMonth(fromMonth)),
          lte(expenseEntries.month, firstOfMonth(toMonth)),
        ),
      )
      .groupBy(expenseEntries.categoryId, expenseCategories.name, expenseCategories.pnlLine)

    return rows.map((r) => ({ ...r, total: Number(r.total) }))
  }

  /** Tiền ra thực trong khoảng NGÀY — mặt dòng tiền, đối chiếu sổ quỹ F1 */
  async cashOut(branchId: string, from: string, to: string) {
    const rows = await this.db
      .select({
        pnlLine: expenseCategories.pnlLine,
        method: expenseVouchers.method,
        kind: expenseVouchers.kind,
        total: sql<number>`coalesce(sum(${expenseVouchers.amountVnd}), 0)::float8`,
      })
      .from(expenseVouchers)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenseVouchers.categoryId))
      .where(
        and(
          eq(expenseVouchers.branchId, branchId),
          eq(expenseVouchers.state, 'approved'),
          gte(expenseVouchers.paidOn, from),
          lte(expenseVouchers.paidOn, to),
        ),
      )
      .groupBy(expenseCategories.pnlLine, expenseVouchers.method, expenseVouchers.kind)

    return rows.map((r) => ({ ...r, total: Number(r.total) }))
  }

  async overview(branchId: string, month: string) {
    const target = firstOfMonth(month)
    const previous = addMonths(target, -1)

    const [current, before, budgets, categories, drafts] = await Promise.all([
      this.byCategory(branchId, target, target),
      this.byCategory(branchId, previous, previous),
      this.budgets(branchId, target),
      this.categories(),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(expenseVouchers)
        .where(and(eq(expenseVouchers.branchId, branchId), eq(expenseVouchers.state, 'draft'))),
    ])

    const nameOf = new Map(categories.map((c) => [c.id, c.name]))
    const lines = current.map((row) => {
      const previousTotal = before.find((b) => b.categoryId === row.categoryId)?.total ?? 0
      const budget = budgets.find((b) => b.categoryId === row.categoryId)?.amountVnd ?? null
      return {
        categoryId: row.categoryId,
        name: row.name,
        pnlLine: row.pnlLine,
        amountVnd: row.total,
        previousVnd: previousTotal,
        budgetVnd: budget,
        overBudget: budget !== null && row.total > budget,
      }
    })

    // Khoản mục có ngân sách nhưng chưa chi đồng nào vẫn phải hiện — nó là phần
    // ngân sách còn nguyên, không phải khoản mục không tồn tại
    for (const budget of budgets) {
      if (lines.some((l) => l.categoryId === budget.categoryId)) continue
      lines.push({
        categoryId: budget.categoryId,
        name: nameOf.get(budget.categoryId) ?? budget.categoryId,
        pnlLine: '',
        amountVnd: 0,
        previousVnd: 0,
        budgetVnd: budget.amountVnd,
        overBudget: false,
      })
    }

    lines.sort((a, b) => b.amountVnd - a.amountVnd)

    return {
      branchId,
      month: target,
      totalVnd: lines.reduce((sum, l) => sum + l.amountVnd, 0),
      previousTotalVnd: before.reduce((sum, b) => sum + b.total, 0),
      lines,
      draftVouchers: Number(drafts[0]?.n ?? 0),
      thresholds: await this.thresholds(branchId),
    }
  }

  // --------------------------------------------------------------- phụ trợ

  async thresholds(branchId: string): Promise<ApprovalThresholds> {
    return {
      pettyCashVnd: await this.params.getNumber('expense.pettyCashVnd', 2_000_000, branchId),
      ownerApprovalVnd: await this.params.getNumber('expense.ownerApprovalVnd', 20_000_000, branchId),
      assetVnd: await this.params.getNumber('expense.assetThresholdVnd', 5_000_000, branchId),
    }
  }

  async employeesOf(branchId: string) {
    return this.db
      .select({ id: employees.id, fullName: staff.fullName })
      .from(employees)
      .innerJoin(staff, eq(staff.id, employees.staffId))
      .where(and(eq(employees.branchId, branchId), eq(employees.active, true)))
      .orderBy(asc(staff.fullName))
  }

  private async requireBranch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return branch
  }
}

function endOfMonth(monthIso: string): string {
  const year = Number(monthIso.slice(0, 4))
  const month = Number(monthIso.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}
