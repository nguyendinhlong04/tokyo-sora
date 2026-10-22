import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  rooms,
  type InvoiceBuyer,
  type InvoiceDocument,
  type InvoiceState,
  type InvoiceStatus,
  type InvoiceView,
  type VatCode,
} from '@sora/contracts'
import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  corporateCharges,
  einvoiceCounters,
  invoiceBuyers,
  invoices,
  orderLines,
  orders,
  payments,
  promotions,
  tableSessions,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import { vatRatesOf } from '../ordering/vat-rates'
import { buyerFrom } from './domain/buyer'
import { buildInvoiceDocument, type DocumentResult } from './domain/document'
import { assertInvoiceSerial, formatInvoiceNo, retryDelayMs, serialForDate } from './domain/serial'
import {
  EINVOICE_PROVIDER,
  type EinvoiceIssueInput,
  type EinvoiceIssueResult,
  type EinvoiceProvider,
} from './einvoice-provider'

type InvoiceRow = typeof invoices.$inferSelect
type OrderRow = typeof orders.$inferSelect

/** Trạng thái còn hiệu lực — cùng điều kiện với chỉ số `invoices_one_live_per_order` */
const LIVE: InvoiceState[] = ['pending', 'issued', 'failed']

/**
 * Đơn của sàn giao đồ ăn không tự phát hành: giá bán trên sàn có thể khác giá
 * quán, sàn thu tiền hộ — kế toán chưa chốt cách lập (câu hỏi Q4 trong kế hoạch).
 */
const EXTERNAL_CHANNELS = new Set(['grab', 'shopee', 'be'])

/** Một lượt giữ hoá đơn dài hơn timeout gọi nhà cung cấp, để Vercel cắt hàm giữa chừng cũng nhả ra */
const TIMEOUT_MS = Number(process.env.EINVOICE_TIMEOUT_MS ?? 8_000)

/** Lượt gửi không có câu trả lời (`call`) — không biết nhà cung cấp đã nhận hay chưa */
const UNANSWERED = new Set(['provider_timeout', 'provider_unreachable'])

type Prepared =
  { ok: true; input: EinvoiceIssueInput } | { ok: false; code: string; message: string }

type Config =
  | { ok: true; template: string; seller: { name: string; taxCode: string; address: string } }
  | { ok: false; code: string; message: string }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/**
 * Hoá đơn điện tử khởi tạo từ máy tính tiền (NĐ 254/2026/NĐ-CP, TT 91/2026/TT-BTC).
 *
 * Mọi bill trả đủ là một hoá đơn, lập ngay lúc trả. Luồng có hai nửa:
 *   1. `enqueueForPaidOrder` — TRONG transaction làm đơn thành "đã trả đủ": ghi
 *      một dòng hoá đơn `pending`. Không gọi mạng ở đây.
 *   2. `tryIssue` — SAU commit: giữ hoá đơn bằng lease, dựng nội dung và cấp số
 *      trong một transaction ngắn, gọi nhà cung cấp NGOÀI transaction, rồi ghi kết
 *      quả. Pool chỉ một kết nối: giữ transaction trong lúc chờ mạng là chặn cả
 *      instance.
 *
 * Module này không nhập Ordering, Payments hay CRM — ba module đó nhập nó.
 */
@Injectable()
export class EinvoiceService {
  private readonly logger = new Logger(EinvoiceService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    @Inject(EINVOICE_PROVIDER) private readonly provider: EinvoiceProvider | null,
  ) {}

  /** Nhà cung cấp đang chạy — A9 hiện, app in "HOÁ ĐƠN THỬ" khi không phải thật */
  get runtime() {
    return { provider: this.provider?.name ?? 'off', live: this.provider?.live ?? false }
  }

  async enabledFor(branchId: string): Promise<boolean> {
    return (await this.params.get('einvoice.enabled', branchId)) === true
  }

  // ======================================================= Xếp hàng & phát hành

  /**
   * Xếp hoá đơn cho đơn vừa trả đủ. Gọi trong transaction của lượt thu tiền.
   *
   * Hoá đơn hỏng KHÔNG BAO GIỜ được làm hỏng lượt thu: mọi việc nằm trong một
   * savepoint, lỗi thì trả null và đơn nằm ở danh sách "còn thiếu hoá đơn" của F3.
   * Gọi lại nhiều lần vẫn chỉ một hoá đơn (`invoices_one_live_per_order`).
   */
  async enqueueForPaidOrder(tx: Tx, orderId: number): Promise<number | null> {
    try {
      return await tx.transaction(async (sp) => {
        const [order] = await sp.select().from(orders).where(eq(orders.id, orderId))
        if (!order || order.status === 'cancelled') return null
        // Bill 0đ mà có món (toàn món tặng) vẫn phải có hoá đơn — hàng khuyến mại
        const settled =
          order.paymentState === 'paid' || (order.moneyTotal === 0 && order.moneySub > 0)
        if (!settled) return null
        // Đơn giao lập lúc giao xong (bán hàng hoá — lúc chuyển giao), không lúc trả trước
        if (order.type === 'delivery' && order.status !== 'done') return null
        if (EXTERNAL_CHANNELS.has(order.channel)) return null
        if (!(await this.enabledFor(order.branchId))) return null
        return this.insertPending(sp, order)
      })
    } catch (err) {
      this.logger.error(`Không xếp được hoá đơn cho đơn ${orderId}: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * Phát hành ngay sau commit, không để lỗi lọt ra lượt thu tiền: hoá đơn chưa lên
   * thì nằm ở hàng đợi, lượt đọc kế tiếp hay F3 đẩy tiếp.
   */
  async issueQuietly(invoiceId: number | null, actor: Actor | null = null) {
    if (invoiceId === null) return null
    try {
      return this.view(await this.tryIssue(invoiceId, actor))
    } catch (err) {
      this.logger.error(`Phát hành hoá đơn ${invoiceId} hỏng: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * F3 · POS: phát hành (lại) hoá đơn của một đơn đã trả đủ. Cấu hình thiếu thì báo
   * ngay — người bấm đang chờ câu trả lời, không phải hàng đợi.
   */
  async issueForOrder(orderId: number, actor: Actor): Promise<InvoiceView> {
    if (!this.provider) {
      throw new ConflictException({
        code: 'provider_not_configured',
        message: 'Máy chủ chưa đấu nối nhà cung cấp hoá đơn điện tử',
      })
    }
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId))
    if (!order) throw new NotFoundException('Không có đơn này')
    if (order.status === 'cancelled') {
      throw new ConflictException({
        code: 'order_cancelled',
        message: 'Đơn đã huỷ — không phát hành hoá đơn',
      })
    }
    if (order.paymentState !== 'paid') {
      throw new ConflictException({
        code: 'order_unpaid',
        message: 'Đơn chưa trả đủ — hoá đơn lập lúc thu đủ tiền',
      })
    }
    if (!(await this.enabledFor(order.branchId))) {
      throw new ConflictException({
        code: 'einvoice_disabled',
        message: 'Chi nhánh chưa bật hoá đơn điện tử — bật ở A9',
      })
    }
    const config = await this.configOf(order.branchId)
    if (!config.ok) throw new ConflictException({ code: config.code, message: config.message })

    const [live] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orderId, orderId), inArray(invoices.state, LIVE)))
    if (live?.state === 'issued') {
      throw new ConflictException({
        code: 'invoice_exists',
        message: 'Đơn này đã có hoá đơn — phát hành hai lần là sai phạm thuế',
      })
    }
    const id = live?.id ?? (await this.db.transaction((tx) => this.insertPending(tx, order)))
    return this.view(await this.tryIssue(id, actor))
  }

  /**
   * Một lượt phát hành. Gọi lại bao nhiêu lần cũng an toàn:
   *   · lease: hai lượt cùng lúc thì một lượt đứng ngoài, không gọi nhà cung cấp
   *   · `request_key` cố định: lượt trước chết giữa chừng thì nhà cung cấp nhận ra
   *     lượt sau là cùng một hoá đơn
   *   · số đã cấp giữ nguyên qua mọi lượt thử (trigger `invoices_guard`)
   */
  async tryIssue(invoiceId: number, actor: Actor | null = null): Promise<InvoiceRow> {
    if (!this.provider) return this.row(invoiceId)

    const [claimed] = await this.db
      .update(invoices)
      .set({
        leaseUntil: sql`now() + interval '60 seconds'`,
        attempts: sql`${invoices.attempts} + 1`,
        lastAttemptAt: sql`now()`,
      })
      .where(
        and(
          eq(invoices.id, invoiceId),
          inArray(invoices.state, ['pending', 'failed']),
          or(isNull(invoices.leaseUntil), lt(invoices.leaseUntil, sql`now()`)),
        ),
      )
      .returning()
    if (!claimed) return this.row(invoiceId)

    let prepared: Prepared
    try {
      prepared = await this.db.transaction((tx) => this.prepare(tx, claimed))
    } catch (err) {
      prepared = { ok: false, code: 'prepare_failed', message: (err as Error).message }
    }
    if (!prepared.ok) return this.fail(claimed, prepared.code, prepared.message, actor)

    const input = prepared.input
    const result = await this.call(input)
    return this.db.transaction((tx) => this.record(tx, claimed, input, result, actor))
  }

  // ============================================================ Người mua

  /**
   * Người mua khách yêu cầu ghi trên hoá đơn — POS và iPad cùng gửi vào đây.
   *
   * Sửa được tới lúc hoá đơn phát hành; sau đó đổi người mua là lập hoá đơn thay
   * thế (`replace`), việc của thu ngân có quản lý ca duyệt. null = "Bán cho người
   * tiêu dùng".
   */
  async setBuyerForSession(
    sessionId: number,
    buyer: InvoiceBuyer | null,
    actor: Actor,
  ): Promise<InvoiceStatus> {
    const [session] = await this.db
      .select({ status: tableSessions.status })
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId))
    if (!session) throw new NotFoundException('Không có phiên bàn này')
    if (session.status === 'closed') {
      throw new ConflictException({ code: 'session_closed', message: 'Bàn đã đóng' })
    }
    const [order] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.tableSessionId, sessionId))
    if (!order) {
      throw new ConflictException({
        code: 'no_order',
        message: 'Bàn chưa gọi món — gọi món rồi mới khai thông tin xuất hoá đơn',
      })
    }
    await this.setBuyer(order.id, buyer, actor)
    return this.statusForSession(sessionId)
  }

  /** Đơn online: khách bổ sung người mua bằng mã theo dõi, trước khi hoá đơn phát hành */
  async setBuyerForOrder(orderId: number, buyer: InvoiceBuyer | null, actor: Actor) {
    await this.setBuyer(orderId, buyer, actor)
    return this.statusForOrder(orderId)
  }

  private async setBuyer(orderId: number, buyer: InvoiceBuyer | null, actor: Actor) {
    const clean = buyerFrom(buyer, actor.kind === 'staff')

    await this.db.transaction(async (tx) => {
      // Khoá đơn: lượt dựng nội dung hoá đơn (`prepare`) đọc đơn FOR SHARE nên
      // hoặc nó thấy người mua mới, hoặc lượt này thấy hoá đơn đang gửi mà dừng
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
      if (!order) throw new NotFoundException('Không có đơn này')
      if (order.status === 'cancelled') {
        throw new ConflictException({ code: 'order_cancelled', message: 'Đơn đã huỷ' })
      }
      const [live] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.orderId, orderId), inArray(invoices.state, LIVE)))
      const locked = live ? lockOf(live) : null
      if (locked) throw new ConflictException({ ...locked, invoiceId: live!.id })
      const [charge] = await tx
        .select({ id: corporateCharges.id })
        .from(corporateCharges)
        .where(eq(corporateCharges.orderId, orderId))
      if (charge) {
        throw new ConflictException({
          code: 'invoice_buyer_locked',
          message: 'Bill đã ghi nợ công ty — hoá đơn đứng tên công ty nợ tiền',
        })
      }

      await tx.update(orders).set({ invoiceBuyer: clean }).where(eq(orders.id, orderId))
      // Không ghi số định danh hay email vào nhật ký — chỉ ghi loại người mua
      await this.audit.write(tx, {
        actor,
        action: 'einvoice.buyer.set',
        entity: 'order',
        entityId: String(orderId),
        payload: { kind: clean?.kind ?? 'consumer' },
      })
    })
  }

  // ========================================================= Thay thế & huỷ

  /**
   * Lập hoá đơn THAY THẾ cho hoá đơn đã phát hành (TT 91/2026 Điều 10): hoá đơn từ
   * máy tính tiền lập sai thì thay thế, không huỷ. Bản cũ giữ nguyên số và nội
   * dung, chỉ đổi sang `replaced`; bản mới lấy số kế tiếp và trỏ về bản cũ.
   *
   * `buyer` có mặt thì ghi đè người mua của đơn — trường hợp hay gặp nhất là khách
   * đưa MST công ty sau khi hoá đơn đã ra dạng "Bán cho người tiêu dùng".
   */
  async replace(
    invoiceId: number,
    input: { reason: string; buyer?: InvoiceBuyer | null },
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    const reason = input.reason.trim()
    if (!reason) throw new BadRequestException('Thay thế hoá đơn bắt buộc ghi lý do')

    const replacementId = await this.db.transaction(async (tx) => {
      const [old] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for('update')
      if (!old) throw new NotFoundException('Không có hoá đơn này')
      if (old.state !== 'issued') {
        throw new ConflictException({
          code: 'invoice_not_issued',
          message:
            old.state === 'replaced'
              ? 'Hoá đơn này đã được thay thế — thay thế hoá đơn mới nhất'
              : 'Hoá đơn chưa phát hành — sửa người mua rồi phát hành, không cần thay thế',
        })
      }

      const outcome = await this.approvals.authorize(tx, {
        actor,
        action: 'einvoice.void-replace-adjust',
        entity: 'invoice',
        entityId: String(invoiceId),
        approval,
      })

      await tx
        .update(invoices)
        .set({
          state: 'replaced',
          voidReason: reason,
          approvalId: outcome.approvalId,
          voidedBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .where(eq(invoices.id, invoiceId))

      if (input.buyer !== undefined) {
        await tx.update(orders).set({ invoiceBuyer: input.buyer }).where(eq(orders.id, old.orderId))
      }
      const [order] = await tx.select().from(orders).where(eq(orders.id, old.orderId))
      const [row] = await tx
        .insert(invoices)
        .values({
          branchId: old.branchId,
          orderId: old.orderId,
          serial: old.serial,
          amountSub: order!.moneySub,
          amountVat: order!.moneyVat,
          amountTotal: order!.moneyTotal,
          businessDate: order!.businessDate,
          replacesId: old.id,
        })
        .returning({ id: invoices.id })

      await this.audit.write(tx, {
        actor,
        action: 'einvoice.replaced',
        entity: 'invoice',
        entityId: String(invoiceId),
        payload: {
          reason,
          approvalId: outcome.approvalId,
          replacementId: row!.id,
          buyerChanged: input.buyer !== undefined,
        },
      })
      return row!.id
    })

    const replacement = await this.tryIssue(replacementId, actor)
    return { replaced: invoiceId, replacement: this.view(replacement) }
  }

  /**
   * Huỷ một hoá đơn CHƯA lên cơ quan thuế và CHƯA cấp số — vd. đơn huỷ trước khi
   * phát hành được. Hoá đơn đã phát hành thì chỉ thay thế (TT 91 Điều 10); đã cấp
   * số thì phải phát hành cho bằng được, vì dãy số phải liên tục.
   */
  async voidUnissued(
    invoiceId: number,
    reason: string,
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    if (!reason.trim()) throw new BadRequestException('Huỷ hoá đơn bắt buộc ghi lý do')

    return this.db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .for('update')
      if (!invoice) throw new NotFoundException('Không có hoá đơn này')
      if (invoice.state === 'issued') {
        throw new ConflictException({
          code: 'invoice_issued',
          message: 'Hoá đơn đã lên cơ quan thuế — sai thì lập hoá đơn thay thế, không huỷ',
        })
      }
      if (invoice.state === 'voided' || invoice.state === 'replaced') {
        throw new ConflictException({
          code: 'invoice_closed',
          message: `Hoá đơn đã ở trạng thái "${invoice.state}"`,
        })
      }
      if (invoice.invoiceNo !== null) {
        throw new ConflictException({
          code: 'invoice_numbered',
          message: `Hoá đơn đã cấp số ${invoice.serial} · ${invoice.invoiceNo} — phải phát hành, không huỷ được`,
        })
      }

      const outcome = await this.approvals.authorize(tx, {
        actor,
        action: 'einvoice.void-replace-adjust',
        entity: 'invoice',
        entityId: String(invoiceId),
        approval,
      })
      await tx
        .update(invoices)
        .set({
          state: 'voided',
          voidReason: reason.trim(),
          approvalId: outcome.approvalId,
          voidedBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .where(eq(invoices.id, invoiceId))

      await this.audit.write(tx, {
        actor,
        action: 'einvoice.voided',
        entity: 'invoice',
        entityId: String(invoiceId),
        payload: { reason: reason.trim(), approvalId: outcome.approvalId },
      })
      return { voided: invoiceId }
    })
  }

  // ================================================================ Đọc

  /**
   * Hoá đơn của một bàn — POS P10/P11 và iPad T10/T11/T15 hỏi cùng một chỗ.
   *
   * Hỏi cũng là đẩy: hoá đơn còn chờ mà tới lượt thử thì phát hành rồi mới trả
   * lời. Webhook VietQR chỉ xếp hàng, nên chính lượt hỏi của iPad sau khi khách
   * chuyển khoản là lượt phát hành.
   */
  async statusForSession(sessionId: number): Promise<InvoiceStatus> {
    const [session] = await this.db
      .select({ branchId: tableSessions.branchId, status: tableSessions.status })
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId))
    if (!session) throw new NotFoundException('Không có phiên bàn này')
    const [order] = await this.db.select().from(orders).where(eq(orders.tableSessionId, sessionId))
    if (!order) {
      return {
        enabled: await this.enabledFor(session.branchId),
        editable: false,
        buyer: null,
        invoice: null,
      }
    }
    return this.statusOf(order, session.status !== 'closed')
  }

  /** Hoá đơn của một đơn bất kỳ — POS (đơn online), Office */
  async statusForOrder(orderId: number): Promise<InvoiceStatus> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId))
    if (!order) throw new NotFoundException('Không có đơn này')
    return this.statusOf(order, order.status !== 'cancelled')
  }

  private async statusOf(order: OrderRow, open: boolean): Promise<InvoiceStatus> {
    let live = await this.liveOf(order.id)
    if (live && this.due(live)) {
      const view = await this.issueQuietly(live.id)
      if (view) live = await this.row(live.id)
    }
    return {
      enabled: await this.enabledFor(order.branchId),
      editable: open && (live === null || lockOf(live) === null),
      buyer: order.invoiceBuyer ?? null,
      invoice: live ? this.view(live) : null,
    }
  }

  /**
   * Hàng hoá đơn chưa lên được của chi nhánh — trạm thu ngân hỏi vài chục giây
   * một lần. Mỗi lượt hỏi đẩy tối đa hai hoá đơn tới lượt, trong năm giây: lượt hỏi
   * không được thành lượt chờ, và máy chủ không có tiến trình nền nào làm thay.
   */
  async queue(branchId: string) {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.branchId, branchId), inArray(invoices.state, ['pending', 'failed'])))
      .orderBy(asc(invoices.id))
      .limit(50)

    const started = Date.now()
    let pushed = 0
    for (const row of rows) {
      if (pushed >= 2 || Date.now() - started > 5_000) break
      if (!this.due(row)) continue
      await this.issueQuietly(row.id)
      pushed++
    }

    const left = await this.db
      .select({
        id: invoices.id,
        orderId: invoices.orderId,
        state: invoices.state,
        lastError: invoices.lastError,
        attempts: invoices.attempts,
        orderCode: orders.displayCode,
      })
      .from(invoices)
      .innerJoin(orders, eq(orders.id, invoices.orderId))
      .where(and(eq(invoices.branchId, branchId), inArray(invoices.state, ['pending', 'failed'])))
      .orderBy(asc(invoices.id))
    return {
      counts: {
        pending: left.filter((r) => r.state === 'pending').length,
        failed: left.filter((r) => r.state === 'failed').length,
      },
      items: left.slice(0, 20),
    }
  }

  /**
   * F3 "Phát hành lại": đẩy lần lượt các hoá đơn chưa lên được, không đợi lượt
   * thử tự động. Có trần mỗi lượt bấm — hàm Vercel sống 30 giây.
   */
  async retryAll(branchId: string, limit: number, actor: Actor) {
    const rows = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.branchId, branchId), inArray(invoices.state, ['pending', 'failed'])))
      .orderBy(asc(invoices.id))
      .limit(limit)

    let issued = 0
    let failed = 0
    for (const { id } of rows) {
      const row = await this.tryIssue(id, actor)
      if (row.state === 'issued') issued++
      else failed++
    }
    const [rest] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(eq(invoices.branchId, branchId), inArray(invoices.state, ['pending', 'failed'])))
    return { processed: rows.length, issued, failed, remaining: Number(rest?.n ?? 0) }
  }

  /** Tới lượt thử tự động chưa: chưa thử lần nào thì tới ngay, hỏng thì giãn dần */
  private due(row: InvoiceRow): boolean {
    if (row.state !== 'pending' && row.state !== 'failed') return false
    if (row.leaseUntil && row.leaseUntil > new Date()) return false
    if (!row.lastAttemptAt) return true
    return Date.now() - row.lastAttemptAt.getTime() >= retryDelayMs(row.attempts)
  }

  private async liveOf(orderId: number): Promise<InvoiceRow | null> {
    const [row] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orderId, orderId), inArray(invoices.state, LIVE)))
    return row ?? null
  }

  view(row: InvoiceRow): InvoiceView {
    return {
      id: row.id,
      orderId: row.orderId,
      state: row.state as InvoiceState,
      // Chưa phát hành thì theo nhà cung cấp đang chạy; đã phát hành thì theo nơi đã phát hành
      test: row.provider === null ? !(this.provider?.live ?? false) : row.provider === 'mock',
      formNo: row.formNo,
      serial: row.serial,
      invoiceNo: row.invoiceNo,
      invoiceDate: row.invoiceDate,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      authorityCode: row.taxCode,
      lookupCode: row.lookupCode,
      lookupUrl: row.lookupUrl,
      replacesId: row.replacesId,
      lastError: row.lastError,
      document: (row.snapshot as InvoiceDocument | null) ?? null,
    }
  }

  async row(invoiceId: number): Promise<InvoiceRow> {
    const [row] = await this.db.select().from(invoices).where(eq(invoices.id, invoiceId))
    if (!row) throw new NotFoundException('Không có hoá đơn này')
    return row
  }

  // ========================================================= phụ trợ

  private async insertPending(tx: Tx, order: OrderRow): Promise<number> {
    const template = text(await this.params.get('einvoice.serial', order.branchId)).toUpperCase()
    const [row] = await tx
      .insert(invoices)
      .values({
        branchId: order.branchId,
        orderId: order.id,
        // Ký hiệu thật (theo năm của ngày lập) gán ở lượt phát hành đầu tiên
        serial: template,
        amountSub: order.moneySub,
        amountVat: order.moneyVat,
        amountTotal: order.moneyTotal,
        businessDate: order.businessDate,
      })
      .onConflictDoNothing({
        target: invoices.orderId,
        where: sql`state IN ('pending','issued','failed')`,
      })
      .returning({ id: invoices.id })
    if (row) return row.id

    const [live] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orderId, order.id), inArray(invoices.state, LIVE)))
    return live!.id
  }

  /** Ký hiệu và người bán khai ở A9 — thiếu thì nói rõ thiếu gì, ở đâu */
  private async configOf(branchId: string): Promise<Config> {
    const raw = text(await this.params.get('einvoice.serial', branchId))
    if (raw === '') {
      return {
        ok: false,
        code: 'no_serial',
        message: 'Chi nhánh chưa khai ký hiệu hoá đơn — khai ở A9 · Hoá đơn điện tử',
      }
    }
    let template: string
    try {
      template = assertInvoiceSerial(raw)
    } catch (err) {
      return {
        ok: false,
        code: 'bad_serial',
        message: `Ký hiệu hoá đơn khai ở A9 không hợp lệ: ${(err as Error).message}`,
      }
    }

    const seller = {
      name: text(await this.params.get('einvoice.sellerName')),
      taxCode: text(await this.params.get('einvoice.taxCode')),
      address: text(await this.params.get('einvoice.sellerAddress')),
    }
    if (!seller.name || !seller.taxCode || !seller.address) {
      return {
        ok: false,
        code: 'einvoice_not_configured',
        message:
          'Chưa khai đủ người bán ở A9: tên, mã số thuế, địa chỉ đúng như đăng ký doanh nghiệp',
      }
    }
    return { ok: true, template, seller }
  }

  /**
   * Dựng nội dung và cấp số. Dựng TRƯỚC, cấp số SAU: cấu hình hay dữ liệu hỏng
   * thì dừng ở đây mà chưa tốn số nào — một số đã cấp là phải phát hành.
   */
  private async prepare(tx: Tx, row: InvoiceRow): Promise<Prepared> {
    // FOR SHARE: người mua đang được sửa (`setBuyer` giữ FOR UPDATE) thì đợi bản mới
    const [order] = await tx.select().from(orders).where(eq(orders.id, row.orderId)).for('share')
    const [branch] = await tx.select().from(branches).where(eq(branches.id, row.branchId))
    const config = await this.configOf(row.branchId)
    if (!config.ok) return config

    const built = await this.documentOf(tx, order!, branch!, config.seller)
    if (!built.ok) return built
    const document = built.document

    const invoiceDate = row.invoiceDate ?? businessDateOf(new Date(), branch!.timezone)
    const serial = row.invoiceNo ? row.serial : serialForDate(config.template, invoiceDate)
    const invoiceNo = row.invoiceNo ?? formatInvoiceNo(await this.nextNumber(tx, serial))
    const buyer = document.buyer

    await tx
      .update(invoices)
      .set({
        serial,
        invoiceNo,
        invoiceDate,
        buyerKind: buyer?.kind ?? 'consumer',
        buyerName: buyer?.name ?? null,
        buyerTaxCode: buyer?.taxCode ?? null,
        buyerAddress: buyer?.address ?? null,
        buyerEmail: buyer?.email ?? null,
        buyerPhone: buyer?.kind === 'person' ? (buyer.phone ?? null) : null,
        paymentMethod: document.paymentMethod,
        amountSub: document.amounts.goods,
        amountDiscount: document.amounts.discount,
        amountService: document.amounts.service,
        amountShip: document.amounts.ship,
        amountVat: document.amounts.vat,
        amountRound: document.amounts.round,
        amountTotal: document.amounts.total,
        vatBreakdown: document.vatBreakdown,
        snapshot: document,
      })
      .where(eq(invoices.id, row.id))

    let replaces: EinvoiceIssueInput['replaces'] = null
    if (row.replacesId !== null) {
      const [old] = await tx.select().from(invoices).where(eq(invoices.id, row.replacesId))
      if (old?.invoiceNo && old.invoiceDate) {
        replaces = {
          formNo: old.formNo,
          serial: old.serial,
          invoiceNo: old.invoiceNo,
          invoiceDate: old.invoiceDate,
          authorityCode: old.taxCode,
        }
      }
    }

    return {
      ok: true,
      input: {
        requestKey: row.requestKey,
        formNo: row.formNo,
        serial,
        invoiceNo,
        invoiceDate,
        document,
        replaces,
      },
    }
  }

  private async documentOf(
    tx: Tx,
    order: OrderRow,
    branch: typeof branches.$inferSelect,
    seller: { name: string; taxCode: string; address: string },
  ): Promise<DocumentResult> {
    const lines = await tx
      .select({
        name: orderLines.nameSnapshot,
        kind: orderLines.kind,
        qty: orderLines.qty,
        unitPrice: orderLines.unitPrice,
        discountVnd: orderLines.discountVnd,
        modifiers: orderLines.modifiers,
        vatCode: orderLines.vatCode,
        promotionName: promotions.name,
      })
      .from(orderLines)
      .leftJoin(promotions, eq(promotions.id, orderLines.promotionId))
      .where(
        and(
          eq(orderLines.orderId, order.id),
          isNull(orderLines.parentLineId),
          ne(orderLines.state, 'voided'),
        ),
      )
      .orderBy(asc(orderLines.id))

    const [billPromotion] =
      order.billPromotionId === null
        ? []
        : await tx
            .select({ name: promotions.name })
            .from(promotions)
            .where(eq(promotions.id, order.billPromotionId))
    const paid = await tx
      .select({ kind: payments.kind })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.state, 'paid')))
      .orderBy(asc(payments.id))
    const [charge] = await tx
      .select({ id: corporateCharges.id })
      .from(corporateCharges)
      .where(eq(corporateCharges.orderId, order.id))

    return buildInvoiceDocument({
      order: {
        displayCode: order.displayCode,
        moneySub: order.moneySub,
        moneyDiscount: order.moneyDiscount,
        moneyService: order.moneyService,
        moneyShip: order.moneyShip,
        moneyVat: order.moneyVat,
        moneyRound: order.moneyRound,
        moneyTotal: order.moneyTotal,
        vatBreakdown: order.vatBreakdown,
        billPromotionName: billPromotion?.name ?? null,
      },
      lines: lines.map((l) => ({
        name: l.name,
        modifiers: modifierNames(l.modifiers),
        qty: l.qty,
        unitPrice: l.unitPrice,
        discountVnd: l.discountVnd,
        vatCode: l.vatCode as VatCode,
        isSet: l.kind === 'set_parent',
        promotionName: l.promotionName,
      })),
      rates: await vatRatesOf(this.params, order.branchId),
      seller: { ...seller, branchName: branch.name, branchAddress: branch.address },
      buyer: order.invoiceBuyer ?? null,
      paymentKinds: [...paid.map((p) => p.kind), ...(charge ? ['corporate'] : [])],
    })
  }

  /**
   * Số kế tiếp của một ký hiệu. UPSERT … RETURNING trên đúng một dòng của ký hiệu
   * là chỗ tuần tự hoá: hai máy cùng phát hành thì máy sau đợi dòng đó, không ai
   * cấp trùng. `greatest` với số lớn nhất đã có là lưới an toàn cho số cấp trước
   * khi có bộ đếm.
   */
  private async nextNumber(tx: Tx, serial: string): Promise<number> {
    const issued = sql<number>`coalesce((
      SELECT max(${invoices.invoiceNo}::integer) FROM ${invoices}
       WHERE ${invoices.serial} = ${serial} AND ${invoices.invoiceNo} ~ '^[0-9]{1,8}$'
    ), 0)`
    const [row] = await tx
      .insert(einvoiceCounters)
      .values({ serial, lastNo: sql`${issued} + 1` })
      .onConflictDoUpdate({
        target: einvoiceCounters.serial,
        set: {
          lastNo: sql`greatest(${einvoiceCounters.lastNo}, ${issued}) + 1`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ lastNo: einvoiceCounters.lastNo })
    return row!.lastNo
  }

  private async call(input: EinvoiceIssueInput): Promise<EinvoiceIssueResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      return await this.provider!.issue(input, controller.signal)
    } catch (err) {
      return {
        ok: false,
        code: controller.signal.aborted ? 'provider_timeout' : 'provider_unreachable',
        message: controller.signal.aborted
          ? 'Nhà cung cấp hoá đơn không trả lời kịp — sẽ thử lại'
          : `Không gọi được nhà cung cấp hoá đơn: ${(err as Error).message}`,
        retryable: true,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private async record(
    tx: Tx,
    row: InvoiceRow,
    input: EinvoiceIssueInput,
    result: EinvoiceIssueResult,
    actor: Actor | null,
  ): Promise<InvoiceRow> {
    if (!result.ok) return this.failIn(tx, row, result.code, result.message, actor)

    const [saved] = await tx
      .update(invoices)
      .set({
        state: 'issued',
        taxCode: result.authorityCode,
        lookupCode: result.lookupCode,
        lookupUrl: result.lookupUrl,
        provider: this.provider!.name,
        providerRef: result.providerRef,
        issuedAt: new Date(),
        issuedBy: actor?.kind === 'staff' ? actor.staffId : null,
        leaseUntil: null,
        lastError: null,
        lastErrorCode: null,
      })
      .where(eq(invoices.id, row.id))
      .returning()

    const buyer = input.document.buyer
    if (buyer?.kind === 'company') await this.rememberBuyer(tx, buyer)

    await this.audit.write(tx, {
      actor: actor ?? { kind: 'system' },
      action: 'einvoice.issued',
      entity: 'invoice',
      entityId: String(row.id),
      payload: {
        orderCode: input.document.orderCode,
        serial: input.serial,
        invoiceNo: input.invoiceNo,
        replacesId: row.replacesId,
      },
    })
    await this.announce(tx, saved!)
    return saved!
  }

  private fail(row: InvoiceRow, code: string, message: string, actor: Actor | null) {
    return this.db.transaction((tx) => this.failIn(tx, row, code, message, actor))
  }

  private async failIn(
    tx: Tx,
    row: InvoiceRow,
    code: string,
    message: string,
    actor: Actor | null,
  ): Promise<InvoiceRow> {
    const [saved] = await tx
      .update(invoices)
      .set({ state: 'failed', lastError: message, lastErrorCode: code, leaseUntil: null })
      .where(eq(invoices.id, row.id))
      .returning()
    await this.audit.write(tx, {
      actor: actor ?? { kind: 'system' },
      action: 'einvoice.failed',
      entity: 'invoice',
      entityId: String(row.id),
      payload: { code, message },
    })
    await this.announce(tx, saved!)
    return saved!
  }

  /** Báo POS, iPad của bàn: hoá đơn đổi trạng thái */
  private async announce(tx: Tx, row: InvoiceRow) {
    const [order] = await tx
      .select({ tableSessionId: orders.tableSessionId })
      .from(orders)
      .where(eq(orders.id, row.orderId))
    await emit(tx, {
      branchId: row.branchId,
      topic: 'invoice.updated',
      rooms: [
        rooms.orders(row.branchId),
        ...(order?.tableSessionId ? [rooms.tableSession(order.tableSessionId)] : []),
      ],
      payload: { invoiceId: row.id, orderId: row.orderId, state: row.state },
    })
  }

  /**
   * Nhớ công ty vừa được xuất hoá đơn: lần sau gõ MST là điền sẵn. Chỉ MST tổ chức
   * — số định danh cá nhân không bao giờ vào danh bạ (CSDL chặn ở dạng MST).
   */
  private async rememberBuyer(tx: Tx, buyer: Extract<InvoiceBuyer, { kind: 'company' }>) {
    const now = new Date()
    await tx
      .insert(invoiceBuyers)
      .values({
        taxCode: buyer.taxCode,
        name: buyer.name,
        address: buyer.address,
        email: buyer.email ?? null,
        source: 'invoice',
        lastInvoicedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: invoiceBuyers.taxCode,
        set: {
          name: buyer.name,
          address: buyer.address,
          email: sql`coalesce(${buyer.email ?? null}, ${invoiceBuyers.email})`,
          source: 'invoice',
          lastInvoicedAt: now,
          updatedAt: now,
        },
      })
  }
}

/**
 * Nội dung hoá đơn (người mua) còn sửa được không — null = được.
 *
 * Khoá khi đã phát hành, khi đang gửi, và khi đã gửi mà không có câu trả lời (hết
 * giờ, mất mạng): nhà cung cấp có thể đã nhận bản cũ, gửi lại cùng `request_key`
 * với nội dung khác là tờ trên cơ quan thuế lệch với tờ của quán. Nhà cung cấp đã
 * trả lời "không nhận" thì sửa được — chưa có tờ nào.
 */
function lockOf(row: InvoiceRow): { code: string; message: string } | null {
  if (row.state === 'issued') {
    return {
      code: 'invoice_issued',
      message: 'Hoá đơn đã phát hành — đổi người mua phải lập hoá đơn thay thế',
    }
  }
  if (row.leaseUntil && row.leaseUntil > new Date()) {
    return { code: 'invoice_issuing', message: 'Hoá đơn đang phát hành — đợi vài giây rồi xem lại' }
  }
  if (row.invoiceNo !== null && UNANSWERED.has(row.lastErrorCode ?? '')) {
    return {
      code: 'invoice_unconfirmed',
      message: 'Hoá đơn đã gửi nhưng chưa có kết quả — đợi phát hành xong rồi lập hoá đơn thay thế',
    }
  }
  return null
}

/** `order_lines.modifiers` = [{optionId, name, priceDelta}] đóng băng lúc gọi */
function modifierNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((m) => (m && typeof m === 'object' && 'name' in m ? String(m.name) : ''))
    .filter((name) => name !== '')
}
