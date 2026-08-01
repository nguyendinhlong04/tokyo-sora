import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms, splitEven } from '@sora/contracts'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { isUniqueViolation } from '../../common/pg-error'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  bankEvents,
  journalEntries,
  orderLines,
  orders,
  paymentLines,
  payments,
  tableSessions,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { MockBankProvider, PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider'

/** Lượt trả sống 15 phút — đủ để khách mở app ngân hàng và chuyển xong */
const VA_TTL_SECONDS = 15 * 60

@Injectable()
export class SplitPaymentService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PAYMENT_PROVIDER) private readonly bank: PaymentProvider,
    private readonly audit: AuditService,
  ) {}

  /**
   * T11 chia đều N phần.
   *
   * Chỉ TÍNH ra các phần, chưa tạo lượt trả nào — khách còn phải chọn mình trả
   * phần nào. Dùng largest-remainder nên các phần chênh nhau tối đa 1đ và luôn
   * cộng lại đúng bằng số còn phải trả.
   */
  async previewEvenSplit(sessionId: number, parts: number) {
    if (!Number.isSafeInteger(parts) || parts < 2 || parts > 20) {
      throw new BadRequestException('Số phần chia phải từ 2 đến 20')
    }
    const { outstanding } = await this.outstandingOf(sessionId)
    if (outstanding <= 0) throw new ConflictException('Đơn đã trả đủ')

    return { parts, amounts: splitEven(outstanding, parts), outstanding }
  }

  /**
   * T12 chọn món mình trả.
   *
   * Nhận món ngay trong transaction tạo lượt trả. Partial unique index
   * `payment_lines_one_live_claim` là thứ chặn hai điện thoại cùng nhận một món —
   * người sau nhận lỗi rõ ràng chứ không phải trả trùng rồi mới phát hiện.
   */
  async claimLines(sessionId: number, orderLineIds: number[], actor: Actor) {
    if (orderLineIds.length === 0) throw new BadRequestException('Chưa chọn món nào')

    return this.db.transaction(async (tx) => {
      const { session, order } = await this.sessionOrder(tx, sessionId)

      const lines = await tx
        .select()
        .from(orderLines)
        .where(
          and(
            eq(orderLines.orderId, order.id),
            inArray(orderLines.id, orderLineIds),
            sql`${orderLines.state} <> 'voided'`,
          ),
        )
      if (lines.length !== orderLineIds.length) {
        throw new BadRequestException('Có món không thuộc bàn này hoặc đã huỷ')
      }

      // Dòng con của set giá 0 — tiền nằm ở dòng set cha, nhận dòng cha là nhận cả set
      const amount = lines.reduce((sum, l) => sum + l.priceTotal, 0)
      if (amount <= 0) throw new BadRequestException('Các món đã chọn không có tiền để trả')

      const payment = await this.createPending(tx, {
        session,
        orderId: order.id,
        amount,
        actor,
      })

      try {
        await tx.insert(paymentLines).values(
          lines.map((l) => ({ paymentId: payment.id, orderLineId: l.id })),
        )
      } catch (err) {
        if (isUniqueViolation(err, 'payment_lines_one_live_claim')) {
          throw new ConflictException({
            code: 'line_already_claimed',
            message: 'Có món vừa được người khác nhận trả — chọn lại giúp bạn',
          })
        }
        throw err
      }

      return payment
    })
  }

  /** T13 tạo QR cho một số tiền tự do (trả hết, hoặc một phần của chia đều) */
  async createVietQr(sessionId: number, amount: number, actor: Actor) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền không hợp lệ')
    }

    return this.db.transaction(async (tx) => {
      const { session, order } = await this.sessionOrder(tx, sessionId)
      const { outstanding } = await this.outstandingWithin(tx, order.id, order.moneyTotal)

      if (amount > outstanding) {
        throw new BadRequestException(`Chỉ còn ${outstanding}đ chưa trả`)
      }
      return this.createPending(tx, { session, orderId: order.id, amount, actor })
    })
  }

  /**
   * O13 tạo VietQR cho đơn ONLINE — đơn không gắn phiên bàn nào.
   *
   * Cùng một cơ chế VA với tại bàn (§23.2 "cùng cơ chế tại bàn"): mỗi lượt trả
   * một VA riêng, và chỉ webhook ngân hàng mới đóng khoản. Khác một điểm: đơn
   * online trả TRỌN số tiền, không có chuyện chia bill giữa mấy điện thoại.
   */
  async createOrderVietQr(orderId: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
      if (!order) throw new NotFoundException('Không có đơn này')
      if (order.status === 'cancelled') throw new ConflictException('Đơn đã huỷ')

      const { outstanding } = await this.outstandingWithin(tx, order.id, order.moneyTotal)
      if (outstanding <= 0) throw new ConflictException('Đơn đã trả đủ')

      const [row] = await tx
        .insert(payments)
        .values({
          branchId: order.branchId,
          orderId: order.id,
          kind: 'vietqr',
          amount: outstanding,
          state: 'pending',
          createdByKind: actor.kind === 'staff' ? 'staff' : 'customer',
          createdById: actor.kind === 'staff' ? String(actor.staffId) : null,
          businessDate: order.businessDate,
        })
        .returning({ id: payments.id })

      const va = await this.bank.createVirtualAccount({
        reference: String(row!.id),
        amount: outstanding,
        branchId: order.branchId,
        expiresInSeconds: VA_TTL_SECONDS,
      })

      await tx
        .update(payments)
        .set({ vaNumber: va.vaNumber, qrString: va.qrString, expiresAt: va.expiresAt })
        .where(eq(payments.id, row!.id))

      await this.audit.write(tx, {
        actor,
        action: 'payment.vietqr.created',
        entity: 'payment',
        entityId: String(row!.id),
        payload: { amount: outstanding, vaNumber: va.vaNumber, orderId },
      })

      return {
        id: row!.id,
        amount: outstanding,
        vaNumber: va.vaNumber,
        qrString: va.qrString,
        expiresAt: va.expiresAt,
      }
    })
  }

  /**
   * Webhook ngân hàng — ĐƯỜNG DUY NHẤT đổi trạng thái sang đã trả.
   *
   * Nút "Đã chuyển xong" của khách chỉ đổi màn hình chờ, không đụng gì tới tiền
   * (§20). Nếu tin nút đó thì ai cũng có thể bấm rồi đi về.
   */
  async handleBankWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    if (!this.bank.verifyWebhook(headers, rawBody)) {
      throw new BadRequestException('Chữ ký webhook không hợp lệ')
    }
    const notice = this.bank.parseWebhook(rawBody)

    return this.db.transaction(async (tx) => {
      // Ghi vào hộp thư TRƯỚC khi xử lý: bank_ref UNIQUE chặn lần gửi thứ hai
      let inboxId: number
      try {
        const [row] = await tx
          .insert(bankEvents)
          .values({
            provider: this.bank.name,
            bankRef: notice.bankRef,
            vaNumber: notice.vaNumber,
            amount: notice.amount,
            raw: notice.raw,
            matchState: 'unmatched',
          })
          .returning({ id: bankEvents.id })
        inboxId = row!.id
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Ngân hàng gửi lại, hoặc poller dự phòng chạy sau webhook — không phải lỗi
          return { duplicate: true, bankRef: notice.bankRef }
        }
        throw err
      }

      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.vaNumber, notice.vaNumber), eq(payments.state, 'pending')))

      if (!payment) {
        // Tiền đã vào tài khoản nhưng không biết của ai — để lại cho người đối soát
        return { matched: false, bankRef: notice.bankRef, inboxId }
      }

      if (payment.amount !== notice.amount) {
        await tx
          .update(bankEvents)
          .set({ matchState: 'amount_mismatch', matchedPaymentId: payment.id })
          .where(eq(bankEvents.id, inboxId))
        await tx.update(payments).set({ state: 'mismatch' }).where(eq(payments.id, payment.id))
        return { matched: false, mismatch: true, expected: payment.amount, received: notice.amount }
      }

      const now = new Date()
      await tx
        .update(payments)
        .set({ state: 'paid', paidAt: now, bankRef: notice.bankRef })
        .where(eq(payments.id, payment.id))
      await tx
        .update(bankEvents)
        .set({ matchState: 'matched', matchedPaymentId: payment.id })
        .where(eq(bankEvents.id, inboxId))

      await tx.insert(journalEntries).values({
        branchId: payment.branchId,
        kind: 'payment',
        orderId: payment.orderId,
        paymentId: payment.id,
        amount: payment.amount,
        memo: `VietQR ${notice.bankRef}`,
        businessDate: payment.businessDate,
      })

      const paymentState = await this.refreshOrderPaymentState(tx, payment.orderId!)

      await emit(tx, {
        branchId: payment.branchId,
        topic: 'payment.received',
        rooms: [
          rooms.tables(payment.branchId),
          ...(payment.tableSessionId ? [rooms.tableSession(payment.tableSessionId)] : []),
        ],
        payload: { paymentId: payment.id, amount: payment.amount, paymentState },
      })

      return { matched: true, paymentId: payment.id, paymentState }
    })
  }

  /**
   * Trạng thái một lượt trả — T14 hỏi lại cho tới khi ngân hàng báo về.
   *
   * Trả kèm cả VA và chuỗi QR để màn T13 dựng lại được sau khi khách lỡ tải lại
   * trang: mã QR chỉ sinh một lần lúc tạo lượt trả, mất nó là khách phải bỏ lượt
   * này và tạo lượt khác.
   */
  async paymentStatus(paymentId: number, actor: Actor) {
    const [row] = await this.db.select().from(payments).where(eq(payments.id, paymentId))
    if (!row) throw new NotFoundException('Không có lượt trả này')
    if (actor.kind === 'customer' && row.tableSessionId !== actor.tableSessionId) {
      throw new ForbiddenException('Lượt trả này không thuộc bàn của bạn')
    }
    return {
      id: row.id,
      state: row.state,
      amount: row.amount,
      vaNumber: row.vaNumber,
      qrString: row.qrString,
      expiresAt: row.expiresAt,
      paidAt: row.paidAt,
    }
  }

  // ------------------------------------------------------------- Nội bộ

  private async createPending(
    tx: Tx,
    input: {
      session: typeof tableSessions.$inferSelect
      orderId: number
      amount: number
      actor: Actor
    },
  ) {
    const [row] = await tx
      .insert(payments)
      .values({
        branchId: input.session.branchId,
        orderId: input.orderId,
        tableSessionId: input.session.id,
        kind: 'vietqr',
        amount: input.amount,
        state: 'pending',
        createdByKind: input.actor.kind === 'customer' ? 'customer' : 'staff',
        createdById:
          input.actor.kind === 'staff' ? String(input.actor.staffId) : null,
        businessDate: input.session.businessDate,
      })
      .returning({ id: payments.id })

    const va = await this.bank.createVirtualAccount({
      reference: String(row!.id),
      amount: input.amount,
      branchId: input.session.branchId,
      expiresInSeconds: VA_TTL_SECONDS,
    })

    await tx
      .update(payments)
      .set({ vaNumber: va.vaNumber, qrString: va.qrString, expiresAt: va.expiresAt })
      .where(eq(payments.id, row!.id))

    await this.audit.write(tx, {
      actor: input.actor,
      action: 'payment.vietqr.created',
      entity: 'payment',
      entityId: String(row!.id),
      payload: { amount: input.amount, vaNumber: va.vaNumber },
    })

    return {
      id: row!.id,
      amount: input.amount,
      vaNumber: va.vaNumber,
      qrString: va.qrString,
      expiresAt: va.expiresAt,
    }
  }

  private async sessionOrder(tx: Tx, sessionId: number) {
    const [session] = await tx
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId))
    if (!session) throw new NotFoundException('Không có phiên bàn này')
    if (session.status === 'closed') throw new ConflictException('Phiên bàn đã đóng')

    const [order] = await tx.select().from(orders).where(eq(orders.tableSessionId, sessionId))
    if (!order) throw new NotFoundException('Bàn chưa có đơn nào')
    return { session, order }
  }

  private async outstandingOf(sessionId: number) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.tableSessionId, sessionId))
    if (!order) throw new NotFoundException('Bàn chưa có đơn nào')
    return this.outstandingWithin(this.db, order.id, order.moneyTotal)
  }

  /**
   * Số còn phải trả = tổng đơn − (đã trả + đang chờ ngân hàng).
   *
   * Trừ cả khoản ĐANG CHỜ là có chủ ý: hai người cùng mở QR trả hết thì người thứ
   * hai phải thấy số 0, chứ không phải cả hai cùng chuyển đủ tiền rồi quán phải
   * hoàn lại một người.
   */
  private async outstandingWithin(db: Db | Tx, orderId: number, total: number) {
    const rows = await db
      .select({
        held: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
      })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), inArray(payments.state, ['paid', 'pending'])))

    const held = Number(rows[0]?.held ?? 0)
    return { outstanding: Math.max(0, total - held), held, total }
  }

  private async refreshOrderPaymentState(tx: Tx, orderId: number) {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
    if (!order) return 'unpaid'

    const rows = await tx
      .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.state, 'paid')))

    const paid = Number(rows[0]?.paid ?? 0)
    const state = paid >= order.moneyTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
    await tx.update(orders).set({ paymentState: state }).where(eq(orders.id, orderId))

    // Trả đủ thì bàn chuyển "chờ dọn" — KHÔNG tự đóng (§20)
    if (state === 'paid' && order.tableSessionId) {
      await tx
        .update(tableSessions)
        .set({ status: 'paid_wait_clear' })
        .where(eq(tableSessions.id, order.tableSessionId))
    }
    return state
  }
}

export { MockBankProvider }
