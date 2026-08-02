import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql, type SQLWrapper } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  approvals,
  branches,
  expenseVouchers,
  inputInvoices,
  invoices,
  journalEntries,
  orders,
  payrollLines,
  payrollPeriods,
  periodLocks,
  staff,
  stockMoves,
} from '../../db/schema'
import { CorporateService } from '../crm/corporate.service'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import {
  assertInvoiceSerial,
  firstOfMonth,
  lastOfMonth,
  nextInvoiceNo,
  reconcile,
  taxSummary,
  vatBuckets,
} from './domain/accounting'

/** Cùng lý do với `reports.service.ts`: tổng tiền cả kỳ vượt tầm int4 */
const money = (expr: SQLWrapper) => sql<number>`coalesce(sum(${expr}), 0)::float8`

/**
 * Kế toán — F2 · F3 · F4 · F5 · F6.
 *
 * Bốn màn đọc và một màn ghi. Màn ghi (F6 khoá sổ) là màn có hệ quả lớn nhất
 * trong cả Office: sau khi bấm, bốn miền khác nhau ngừng nhận sửa cho kỳ đó.
 *
 * F3 KHÔNG đấu nối nhà cung cấp hoá đơn điện tử. Toàn bộ luồng phát hành, hàng
 * đợi lỗi và luồng huỷ/thay thế đều thật và có dấu vết; chỗ duy nhất giả lập là
 * lượt gọi ra cơ quan thuế — nó nhận mã ngay tại chỗ. Khi có hợp đồng thật thì
 * `callProvider` là chỗ duy nhất phải thay.
 */
@Injectable()
export class AccountingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly corporate: CorporateService,
  ) {}

  // =================================== F2 · Nhật ký doanh thu & điều chỉnh

  /**
   * Sổ bất biến, chỉ đọc. Ghép người thao tác và bản ghi duyệt vào từng dòng —
   * "ai xin, ai duyệt, lý do" là thứ làm sổ này có giá trị, còn số tiền thì bảng
   * nào cũng có.
   */
  async journal(branchId: string, from: string, to: string) {
    // Hai lần join vào `staff` cho hai vai khác nhau: người thao tác và người
    // duyệt. Bí danh là bắt buộc, nếu không Postgres không biết cột nào của ai.
    const approver = alias(staff, 'approver')

    const rows = await this.db
      .select({
        entry: journalEntries,
        actorName: staff.fullName,
        orderCode: orders.displayCode,
        approvalReason: approvals.reason,
        approverName: approver.fullName,
      })
      .from(journalEntries)
      .leftJoin(staff, eq(staff.id, journalEntries.actorId))
      .leftJoin(orders, eq(orders.id, journalEntries.orderId))
      .leftJoin(approvals, eq(approvals.id, journalEntries.approvalId))
      .leftJoin(approver, eq(approver.id, approvals.approvedBy))
      .where(
        and(
          eq(journalEntries.branchId, branchId),
          gte(journalEntries.businessDate, from),
          lte(journalEntries.businessDate, to),
        ),
      )
      .orderBy(desc(journalEntries.id))
      .limit(500)

    const totals = new Map<string, number>()
    for (const { entry } of rows) {
      totals.set(entry.kind, (totals.get(entry.kind) ?? 0) + entry.amount)
    }

    return {
      branchId,
      from,
      to,
      rows: rows.map(({ entry, actorName, orderCode, approvalReason, approverName }) => ({
        id: entry.id,
        kind: entry.kind,
        amount: entry.amount,
        memo: entry.memo,
        orderCode,
        actorName,
        approverName,
        approvalReason,
        businessDate: entry.businessDate,
        createdAt: entry.createdAt.toISOString(),
      })),
      totals: [...totals].map(([kind, amount]) => ({ kind, amount })),
      /** Sổ này chỉ đọc — cửa ghi nằm ở luồng nghiệp vụ, không ở đây */
      readOnly: true,
    }
  }

  /** Ghi bút toán điều chỉnh — gọi từ luồng huỷ món / huỷ bill / hoàn tiền */
  async writeAdjustment(
    tx: Tx,
    input: {
      branchId: string
      kind: 'discount' | 'comp' | 'void' | 'refund'
      amount: number
      orderId?: number | null
      actorId?: number | null
      approvalId?: number | null
      memo: string
      businessDate: string
    },
  ) {
    await tx.insert(journalEntries).values({
      branchId: input.branchId,
      kind: input.kind,
      // Điều chỉnh làm GIẢM doanh thu ⇒ ghi số âm, đúng quy ước bút toán ngược
      amount: -Math.abs(input.amount),
      orderId: input.orderId ?? null,
      actorId: input.actorId ?? null,
      approvalId: input.approvalId ?? null,
      memo: input.memo,
      businessDate: input.businessDate,
    })
  }

  // ================================================ F3 · Sổ hoá đơn điện tử

  async invoices(branchId: string, from: string, to: string) {
    const rows = await this.db
      .select({ invoice: invoices, orderCode: orders.displayCode, issuedByName: staff.fullName })
      .from(invoices)
      .innerJoin(orders, eq(orders.id, invoices.orderId))
      .leftJoin(staff, eq(staff.id, invoices.issuedBy))
      .where(
        and(
          eq(invoices.branchId, branchId),
          gte(invoices.businessDate, from),
          lte(invoices.businessDate, to),
        ),
      )
      .orderBy(desc(invoices.id))

    /** Bill đã trả đủ mà chưa có hoá đơn nào — nguồn thật của hàng đợi F3 */
    const missing = await this.db
      .select({
        orderId: orders.id,
        displayCode: orders.displayCode,
        moneySub: orders.moneySub,
        moneyVat: orders.moneyVat,
        moneyTotal: orders.moneyTotal,
        businessDate: orders.businessDate,
      })
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branchId),
          gte(orders.businessDate, from),
          lte(orders.businessDate, to),
          eq(orders.paymentState, 'paid'),
          ne(orders.status, 'cancelled'),
          sql`not exists (
            select 1 from ${invoices} i
            where i.order_id = ${orders.id} and i.state in ('pending','issued','failed')
          )`,
        ),
      )
      .orderBy(asc(orders.id))

    return {
      branchId,
      serial: await this.serialOf(branchId),
      rows: rows.map(({ invoice, orderCode, issuedByName }) => ({
        ...invoice,
        orderCode,
        issuedByName,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
      })),
      /** Hoá đơn cần phát hành lại — bill đã in, hoá đơn chưa lên thuế */
      queue: rows
        .filter(({ invoice }) => invoice.state === 'pending' || invoice.state === 'failed')
        .map(({ invoice, orderCode }) => ({ id: invoice.id, orderCode, error: invoice.lastError })),
      missing,
    }
  }

  /**
   * Phát hành hoá đơn cho một đơn.
   *
   * Số hoá đơn cấp trong TRANSACTION và khoá theo ký hiệu: hai máy tính tiền cùng
   * bấm in một lúc mà cấp trùng số là một lỗi không sửa được sau khi đã lên cơ
   * quan thuế.
   */
  async issue(orderId: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
      if (!order) throw new NotFoundException('Không có đơn này')
      if (order.status === 'cancelled') {
        throw new BadRequestException('Đơn đã huỷ — không phát hành hoá đơn')
      }

      const [existing] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.orderId, orderId),
            inArray(invoices.state, ['pending', 'issued', 'failed']),
          ),
        )
      if (existing?.state === 'issued') {
        throw new ConflictException('Đơn này đã có hoá đơn — phát hành hai lần là sai phạm thuế')
      }

      const serial = await this.serialOf(order.branchId)
      if (!serial) {
        throw new ConflictException({
          code: 'no_serial',
          message:
            'Chi nhánh chưa khai ký hiệu hoá đơn — đặt tham số `einvoice.serial` ở Trung tâm tham số A6',
        })
      }

      const result = await this.callProvider(order.displayCode)

      // Cấp số trong cùng transaction, khoá theo ký hiệu để không cấp trùng
      const [last] = await tx
        .select({ no: invoices.invoiceNo })
        .from(invoices)
        .where(and(eq(invoices.serial, serial), isNotNull(invoices.invoiceNo)))
        .orderBy(desc(invoices.invoiceNo))
        .limit(1)
        .for('update')

      const base = {
        branchId: order.branchId,
        orderId,
        serial,
        amountSub: order.moneySub,
        amountVat: order.moneyVat,
        amountTotal: order.moneyTotal,
        businessDate: order.businessDate,
        issuedBy: actor.kind === 'staff' ? actor.staffId : null,
      }

      const values = result.ok
        ? {
            ...base,
            state: 'issued' as const,
            invoiceNo: nextInvoiceNo(last?.no ?? null),
            taxCode: result.taxCode,
            issuedAt: new Date(),
            lastError: null,
          }
        : { ...base, state: 'failed' as const, lastError: result.error }

      const [row] = existing
        ? await tx.update(invoices).set(values).where(eq(invoices.id, existing.id)).returning()
        : await tx.insert(invoices).values(values).returning()

      await this.audit.write(tx, {
        actor,
        action: result.ok ? 'einvoice.issued' : 'einvoice.failed',
        entity: 'invoice',
        entityId: String(row!.id),
        payload: { orderCode: order.displayCode, serial, invoiceNo: row!.invoiceNo },
      })

      return row!
    })
  }

  /**
   * Huỷ hoặc thay thế hoá đơn — dòng `einvoice.void-replace-adjust` của §4.2.
   *
   * Bản gốc KHÔNG bị xoá, chỉ đổi trạng thái và giữ nguyên số đã cấp: hoá đơn đã
   * lên cơ quan thuế thì số đó tồn tại vĩnh viễn dù nội dung sai.
   */
  async voidInvoice(
    id: number,
    input: { reason: string; replace: boolean },
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    if (!input.reason?.trim()) throw new BadRequestException('Huỷ hoá đơn bắt buộc ghi lý do')

    return this.db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id))
      if (!invoice) throw new NotFoundException('Không có hoá đơn này')
      if (invoice.state === 'voided' || invoice.state === 'replaced') {
        throw new ConflictException(`Hoá đơn đã ở trạng thái "${invoice.state}"`)
      }

      const outcome = await this.approvals.authorize(tx, {
        actor,
        action: 'einvoice.void-replace-adjust',
        entity: 'invoice',
        entityId: String(id),
        approval,
      })

      await tx
        .update(invoices)
        .set({
          state: input.replace ? 'replaced' : 'voided',
          voidReason: input.reason.trim(),
          // Ràng buộc CSDL đòi bản ghi duyệt khi huỷ; thay thế thì bản mới mang dấu vết
          approvalId: outcome.approvalId,
        })
        .where(eq(invoices.id, id))

      let replacement = null
      if (input.replace) {
        const [order] = await tx.select().from(orders).where(eq(orders.id, invoice.orderId))
        const [row] = await tx
          .insert(invoices)
          .values({
            branchId: invoice.branchId,
            orderId: invoice.orderId,
            serial: invoice.serial,
            amountSub: order!.moneySub,
            amountVat: order!.moneyVat,
            amountTotal: order!.moneyTotal,
            businessDate: invoice.businessDate,
            state: 'pending',
            replacesId: invoice.id,
            issuedBy: actor.kind === 'staff' ? actor.staffId : null,
          })
          .returning()
        replacement = row!
      }

      await this.audit.write(tx, {
        actor,
        action: input.replace ? 'einvoice.replaced' : 'einvoice.voided',
        entity: 'invoice',
        entityId: String(id),
        payload: { reason: input.reason.trim(), approvalId: outcome.approvalId },
      })

      return { voided: id, replacement }
    })
  }

  /**
   * Lượt gọi ra nhà cung cấp hoá đơn điện tử.
   *
   * CHƯA ĐẤU NỐI. Đây là chỗ duy nhất giả lập trong cả luồng F3, và nó cố tình
   * nằm riêng một hàm để khi có hợp đồng thật thì thay đúng chỗ này — mọi thứ
   * khác (cấp số, hàng đợi lỗi, huỷ/thay thế có duyệt) đều đã là thật.
   */
  private async callProvider(
    displayCode: string,
  ): Promise<{ ok: true; taxCode: string } | { ok: false; error: string }> {
    return { ok: true, taxCode: `MCQT-${displayCode}` }
  }

  /**
   * Ký hiệu của chi nhánh, lấy từ Trung tâm tham số A6 (A9 là cửa vào theo ngữ
   * cảnh — chưa dựng).
   *
   * Ký hiệu sai chuẩn là LỖI CẤU HÌNH, không phải lỗi máy chủ: người sửa được nó
   * là kế toán, và họ chỉ sửa được nếu thông báo nói ra sai ở đâu.
   */
  private async serialOf(branchId: string): Promise<string | null> {
    const raw = await this.params.get('einvoice.serial', branchId)
    if (typeof raw !== 'string' || raw.trim() === '') return null
    try {
      return assertInvoiceSerial(raw)
    } catch (err) {
      throw new ConflictException({
        code: 'bad_serial',
        message: `Ký hiệu hoá đơn khai ở A6 không hợp lệ: ${(err as Error).message}`,
      })
    }
  }

  // ==================================================== F4 · Báo cáo thuế

  async taxReport(branchId: string, from: string, to: string) {
    const orderRows = await this.db
      .select({
        netVnd: sql<number>`(${orders.moneySub} - ${orders.moneyDiscount} + ${orders.moneyService})::float8`,
        vatVnd: sql<number>`${orders.moneyVat}::float8`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branchId),
          gte(orders.businessDate, from),
          lte(orders.businessDate, to),
          ne(orders.status, 'cancelled'),
        ),
      )

    const buckets = vatBuckets(
      orderRows.map((r) => ({ netVnd: Number(r.netVnd), vatVnd: Number(r.vatVnd) })),
    )

    /**
     * VAT đầu vào lấy từ SỔ HOÁ ĐƠN C5, không từ con số gõ trên phiếu chi.
     *
     * Số trên phiếu là ý định của người ghi; tờ hoá đơn mới là bằng chứng, và
     * điều kiện được khấu trừ là có bằng chứng. Chi 5 triệu tiền chợ không hoá
     * đơn thì tiền vẫn ra mà VAT không đòi lại được — nếu F4 cộng cả số đó thì
     * tờ khai thuế khai thừa, và người phát hiện ra sẽ là cơ quan thuế.
     */
    const [vatIn] = await this.db
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

    const [pit] = await this.db
      .select({ tax: money(payrollLines.taxVnd) })
      .from(payrollLines)
      .innerJoin(payrollPeriods, eq(payrollPeriods.id, payrollLines.periodId))
      .where(
        and(
          eq(payrollPeriods.branchId, branchId),
          inArray(payrollPeriods.state, ['approved', 'paid']),
          gte(payrollPeriods.periodEnd, from),
          lte(payrollPeriods.periodEnd, to),
        ),
      )

    const [invoiced] = await this.db
      .select({ total: money(invoices.amountTotal), count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(
        and(
          eq(invoices.branchId, branchId),
          eq(invoices.state, 'issued'),
          gte(invoices.businessDate, from),
          lte(invoices.businessDate, to),
        ),
      )

    const [system] = await this.db
      .select({ total: money(orders.moneyTotal), count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branchId),
          gte(orders.businessDate, from),
          lte(orders.businessDate, to),
          eq(orders.paymentState, 'paid'),
          ne(orders.status, 'cancelled'),
        ),
      )

    const vatOutVnd = buckets.reduce((sum, b) => sum + b.vatVnd, 0)

    return {
      branchId,
      from,
      to,
      buckets,
      summary: taxSummary({
        vatOutVnd,
        vatInVnd: Number(vatIn?.vat ?? 0),
        pitWithheldVnd: Number(pit?.tax ?? 0),
      }),
      /** Đối chiếu tổng HĐĐT vs doanh thu hệ thống — lệch là đỏ (§28 F4) */
      reconciliation: {
        ...reconcile(Number(system?.total ?? 0), Number(invoiced?.total ?? 0)),
        systemOrders: Number(system?.count ?? 0),
        issuedInvoices: Number(invoiced?.count ?? 0),
      },
      /** Bao nhiêu tờ hoá đơn đứng sau con số khấu trừ — kế toán cần biết trước khi ký tờ khai */
      vatInInvoices: Number(vatIn?.count ?? 0),
      vatInNote:
        'VAT đầu vào lấy từ sổ hoá đơn đầu vào C5 — chỉ những tờ đánh dấu được khấu trừ. Số VAT gõ trên phiếu chi KHÔNG vào đây: không có hoá đơn thì không khấu trừ được, và C5 liệt kê những phiếu chi lớn còn thiếu hoá đơn.',
      pitNote:
        'TNCN là số đã tạm khấu trừ trên bảng lương. Tỉ lệ đặt ở A6 và mặc định bằng 0 — biểu thuế luỹ tiến chưa cài, kế toán phải xác nhận trước khi nộp tờ khai.',
    }
  }

  // ====================================================== F5 · Công nợ

  /**
   * Hai chiều công nợ, và cả hai đều thiếu nguồn ở mức khác nhau.
   *
   * PHẢI TRẢ: bản thiết kế lấy từ PO (S4) và phiếu chi. S4 chưa dựng, nhưng có
   * một tín hiệu THẬT tính được ngay từ dữ liệu đang có — phiếu nhập kho chưa có
   * phiếu chi nào đối ứng. Đó đúng là một khoản đang nợ nhà cung cấp.
   *
   * PHẢI THU: đọc thẳng dòng ghi nợ công ty của B15 qua `CorporateService`. Không
   * tính lại tuổi nợ ở đây — hai miền cùng tính một con số là hai màn sẽ có ngày
   * báo hai số khác nhau, và không ai biết số nào đúng.
   *
   * Phải thu là số của CẢ CHUỖI chứ không của riêng chi nhánh: một công ty ăn ở
   * ba chi nhánh vẫn nợ một hợp đồng, và kế toán đòi một lần.
   */
  async debts(branchId: string, from: string, to: string) {
    const receipts = await this.db
      .select({
        ingredientId: stockMoves.ingredientId,
        businessDate: stockMoves.businessDate,
        costVnd: money(stockMoves.costVnd),
        moves: sql<number>`count(*)::int`,
      })
      .from(stockMoves)
      .where(
        and(
          eq(stockMoves.branchId, branchId),
          eq(stockMoves.kind, 'receipt'),
          gte(stockMoves.businessDate, from),
          lte(stockMoves.businessDate, to),
        ),
      )
      .groupBy(stockMoves.ingredientId, stockMoves.businessDate)

    const [paid] = await this.db
      .select({ total: money(expenseVouchers.amountVnd) })
      .from(expenseVouchers)
      .where(
        and(
          eq(expenseVouchers.branchId, branchId),
          eq(expenseVouchers.state, 'approved'),
          eq(expenseVouchers.kind, 'expense'),
          gte(expenseVouchers.paidOn, from),
          lte(expenseVouchers.paidOn, to),
        ),
      )

    const receivedVnd = receipts.reduce((sum, r) => sum + Number(r.costVnd), 0)
    // Tuổi nợ tính tới ngày CUỐI KỲ đang xem, không tới hôm nay: mở lại báo cáo
    // tháng trước phải ra đúng con số của tháng trước
    const receivable = await this.corporate.receivables(to)

    return {
      branchId,
      from,
      to,
      payable: {
        /** Giá trị hàng đã nhận kho trong kỳ */
        receivedVnd,
        /** Tổng phiếu chi đã duyệt trong kỳ — KHÔNG chỉ riêng tiền hàng */
        vouchersVnd: Number(paid?.total ?? 0),
        receiptCount: receipts.reduce((sum, r) => sum + Number(r.moves), 0),
        note:
          'Đây là tín hiệu thô, chưa phải sổ công nợ: nhập kho chưa gắn được với phiếu chi tương ứng vì đơn đặt hàng (S4) và hồ sơ nhà cung cấp (S3) chưa dựng. Hạn trả và lịch trả tuần cũng nằm ở S3/S4.',
      },
      receivable: {
        ...receivable,
        note:
          'Tuổi nợ đếm từ NGÀY ĐẾN HẠN của từng bill ghi nợ, không từ ngày ăn. Số này của cả chuỗi: một công ty ăn ở ba chi nhánh vẫn nợ một hợp đồng.',
      },
    }
  }

  // ==================================================== F6 · Khoá sổ kỳ

  async periods(branchId: string) {
    const locks = await this.db
      .select({ lock: periodLocks, byName: staff.fullName })
      .from(periodLocks)
      .leftJoin(staff, eq(staff.id, periodLocks.lockedBy))
      .where(eq(periodLocks.branchId, branchId))
      .orderBy(desc(periodLocks.month))

    return locks.map(({ lock, byName }) => ({
      month: lock.month,
      lockedAt: lock.lockedAt.toISOString(),
      lockedByName: byName,
      note: lock.note,
    }))
  }

  /**
   * Khoá sổ một tháng.
   *
   * Từ chối khoá tháng CHƯA KẾT THÚC. Vì không có mở khoá, một lần bấm nhầm vào
   * tháng đang bán sẽ chặn luôn việc sửa số liệu của chính tháng đó mà không có
   * đường lùi — nên chốt chặn phải nằm ở đây, trước khi bấm.
   */
  async lockPeriod(
    input: { branchId: string; month: string; note?: string | null },
    actor: Actor,
  ) {
    const branch = await this.requireBranch(input.branchId)
    const month = firstOfMonth(input.month)
    const today = new Date().toISOString().slice(0, 10)

    if (lastOfMonth(month) >= today) {
      throw new BadRequestException(
        `Tháng ${month.slice(0, 7)} chưa kết thúc — khoá sổ không mở lại được, nên chỉ khoá tháng đã qua`,
      )
    }

    const readiness = await this.readiness(input.branchId, month)
    if (readiness.blockers.length > 0) {
      throw new ConflictException({
        code: 'not_ready_to_close',
        message: `Chưa khoá được: ${readiness.blockers.join(' · ')}`,
      })
    }

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(periodLocks)
        .where(and(eq(periodLocks.branchId, input.branchId), eq(periodLocks.month, month)))
      if (existing) throw new ConflictException(`Kỳ ${month.slice(0, 7)} đã khoá rồi`)

      await tx.insert(periodLocks).values({
        branchId: input.branchId,
        month,
        lockedBy: actor.kind === 'staff' ? actor.staffId : null,
        note: input.note ?? null,
      })

      await this.audit.write(tx, {
        actor,
        action: 'accounting.period-closed',
        entity: 'period_lock',
        entityId: `${input.branchId}:${month}`,
        payload: { month, timezone: branch.timezone },
      })

      return { branchId: input.branchId, month, locked: true }
    })
  }

  /**
   * Những thứ còn dở của một tháng — hiện trước khi bấm khoá.
   *
   * Khoá sổ trong khi còn phiếu chi chờ duyệt hay hoá đơn chưa phát hành nghĩa là
   * chốt một kỳ với số liệu thiếu, và không sửa lại được. Nên đây là chặn chứ
   * không phải cảnh báo.
   */
  async readiness(branchId: string, month: string) {
    const from = firstOfMonth(month)
    const to = lastOfMonth(from)

    const [drafts] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(expenseVouchers)
      .where(
        and(
          eq(expenseVouchers.branchId, branchId),
          eq(expenseVouchers.state, 'draft'),
          gte(expenseVouchers.paidOn, from),
          lte(expenseVouchers.paidOn, to),
        ),
      )

    const [pendingInvoices] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(invoices)
      .where(
        and(
          eq(invoices.branchId, branchId),
          inArray(invoices.state, ['pending', 'failed']),
          gte(invoices.businessDate, from),
          lte(invoices.businessDate, to),
        ),
      )

    const [openPayroll] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(payrollPeriods)
      .where(
        and(
          eq(payrollPeriods.branchId, branchId),
          ne(payrollPeriods.state, 'paid'),
          gte(payrollPeriods.periodEnd, from),
          lte(payrollPeriods.periodEnd, to),
        ),
      )

    const blockers: string[] = []
    if (Number(drafts?.n ?? 0) > 0) {
      blockers.push(`${drafts!.n} phiếu chi còn chờ duyệt (C2)`)
    }
    if (Number(pendingInvoices?.n ?? 0) > 0) {
      blockers.push(`${pendingInvoices!.n} hoá đơn chưa phát hành được (F3)`)
    }
    if (Number(openPayroll?.n ?? 0) > 0) {
      blockers.push(`${openPayroll!.n} kỳ lương chưa phát xong (H7)`)
    }

    return { month: from, blockers }
  }

  // --------------------------------------------------------------- phụ trợ

  private async requireBranch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return branch
  }
}
