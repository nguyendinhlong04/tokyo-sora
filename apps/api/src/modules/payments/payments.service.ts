import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  journalEntries,
  orders,
  paymentLines,
  payments,
  shifts,
  tableSessions,
} from '../../db/schema'
import { CustomersService } from '../crm/customers.service'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
  ) {}

  // ------------------------------------------------------------ Ca (P1/P14)

  async openShift(input: { branchId: string; openingCash: number }, actor: Actor) {
    if (actor.kind !== 'staff') throw new BadRequestException('Chỉ nhân viên mở ca được')

    return this.db.transaction(async (tx) => {
      const [branch] = await tx.select().from(branches).where(eq(branches.id, input.branchId))
      if (!branch) throw new NotFoundException(`Không có chi nhánh ${input.branchId}`)

      const [open] = await tx
        .select()
        .from(shifts)
        .where(and(eq(shifts.branchId, input.branchId), eq(shifts.state, 'open')))
      if (open) throw new ConflictException('Chi nhánh đang có ca mở — đóng ca cũ trước')

      const [shift] = await tx
        .insert(shifts)
        .values({
          branchId: input.branchId,
          deviceId: actor.deviceId,
          cashierId: actor.staffId,
          openingCash: input.openingCash,
          businessDate: businessDateOf(new Date(), branch.timezone),
        })
        .returning()

      await this.audit.write(tx, {
        actor,
        action: 'shift.opened',
        entity: 'shift',
        entityId: String(shift!.id),
        payload: { openingCash: input.openingCash },
      })
      return shift!
    })
  }

  /**
   * P14 đóng ca. Tiền mặt đếm thực so với hệ thống — chênh lệch hiện ngay chứ
   * không giấu, đó là chốt chặn cho kịch bản "thu tiền mặt không nhập máy".
   */
  async closeShift(shiftId: number, input: { countedCash: number; note?: string | null }, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [shift] = await tx.select().from(shifts).where(eq(shifts.id, shiftId))
      if (!shift) throw new NotFoundException('Không có ca này')
      if (shift.state === 'closed') return { shiftId, changed: false }

      /**
       * Tiền phải có trong két = tiền mặt tại quầy + tiền COD shipper nộp về.
       *
       * Hai loại khoản khác nhau về nguồn nhưng giống nhau ở chỗ quan trọng nhất:
       * chúng là tờ tiền nằm trong ngăn kéo. Bỏ COD ra ngoài thì đêm nào có đơn
       * giao là đêm đó két thừa tiền và nhân viên phải giải trình một chênh lệch
       * do chính công thức tạo ra.
       */
      const cashRows = await tx
        .select({ cash: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
        .from(payments)
        .where(
          and(
            eq(payments.shiftId, shiftId),
            inArray(payments.kind, ['cash', 'cod']),
            eq(payments.state, 'paid'),
          ),
        )

      const expected = shift.openingCash + Number(cashRows[0]?.cash ?? 0)
      await tx
        .update(shifts)
        .set({
          state: 'closed',
          closingCashCounted: input.countedCash,
          closingExpected: expected,
          closedAt: new Date(),
          note: input.note ?? null,
        })
        .where(eq(shifts.id, shiftId))

      const variance = input.countedCash - expected
      if (variance !== 0) {
        // Chênh lệch quỹ là bút toán riêng, không âm thầm sửa doanh thu
        await tx.insert(journalEntries).values({
          branchId: shift.branchId,
          kind: 'shift_adjust',
          amount: variance,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          memo: `Lệch quỹ đóng ca #${shiftId}`,
          businessDate: shift.businessDate,
        })
      }

      await this.audit.write(tx, {
        actor,
        action: 'shift.closed',
        entity: 'shift',
        entityId: String(shiftId),
        payload: { expected, counted: input.countedCash, variance },
      })

      return { shiftId, changed: true, expected, counted: input.countedCash, variance }
    })
  }

  async openShiftOf(branchId: string) {
    const [shift] = await this.db
      .select()
      .from(shifts)
      .where(and(eq(shifts.branchId, branchId), eq(shifts.state, 'open')))
    return shift ?? null
  }

  // -------------------------------------------------- Tạm tính & thu tiền

  /** P10 tạm tính: còn phải trả bao nhiêu */
  async bill(sessionId: number) {
    const [session] = await this.db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId))
    if (!session) throw new NotFoundException('Không có phiên bàn này')

    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.tableSessionId, sessionId))
    if (!order) return { sessionId, total: 0, paid: 0, outstanding: 0, payments: [] }

    const paidRows = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.state, 'paid')))

    // T12: món người khác đã nhận trả thì khoá ngay trên máy khách, chứ không để
    // họ chọn xong mới ăn lỗi 409. `live = 'yes'` khớp đúng điều kiện của partial
    // unique index — lượt trả hỏng hay hết hạn tự nhả món ra.
    const claimed = await this.db
      .select({ orderLineId: paymentLines.orderLineId, paymentId: paymentLines.paymentId })
      .from(paymentLines)
      .innerJoin(payments, eq(payments.id, paymentLines.paymentId))
      .where(and(eq(payments.orderId, order.id), eq(paymentLines.live, 'yes')))

    const paid = paidRows.reduce((sum, p) => sum + p.amount, 0)
    return {
      sessionId,
      orderId: order.id,
      displayCode: order.displayCode,
      total: order.moneyTotal,
      paid,
      outstanding: Math.max(0, order.moneyTotal - paid),
      paymentState: order.paymentState,
      payments: paidRows.map((p) => ({ id: p.id, kind: p.kind, amount: p.amount, paidAt: p.paidAt })),
      claimedLines: claimed,
    }
  }

  /**
   * P10/P11 thu tiền mặt.
   *
   * Tiền mặt khác chuyển khoản ở một điểm căn bản: nhân viên đếm được tiền ngay
   * nên ghi `paid` luôn. Chuyển khoản thì CHỈ webhook ngân hàng mới đóng khoản —
   * nút của khách không bao giờ đổi trạng thái (quy tắc §20, làm ở GĐ2).
   */
  async payCash(
    sessionId: number,
    input: { amount: number; tendered?: number | null },
    actor: Actor,
  ) {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Số tiền không hợp lệ')
    }

    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, sessionId))
      if (!session) throw new NotFoundException('Không có phiên bàn này')

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.tableSessionId, sessionId))
      if (!order) throw new NotFoundException('Bàn chưa có đơn nào')

      const paidRows = await tx
        .select({ paidSoFar: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.state, 'paid')))

      const paidSoFar = Number(paidRows[0]?.paidSoFar ?? 0)
      const outstanding = order.moneyTotal - paidSoFar
      if (outstanding <= 0) throw new ConflictException('Đơn đã trả đủ')
      if (input.amount > outstanding) {
        throw new BadRequestException(
          `Thu quá số còn lại (${outstanding}đ) — tiền thừa trả khách, đừng ghi vào đơn`,
        )
      }

      const shift = await this.requireOpenShift(tx, session.branchId)
      const now = new Date()

      const [payment] = await tx
        .insert(payments)
        .values({
          branchId: session.branchId,
          orderId: order.id,
          tableSessionId: sessionId,
          shiftId: shift.id,
          kind: 'cash',
          amount: input.amount,
          state: 'paid',
          paidAt: now,
          createdByKind: 'staff',
          createdById: actor.kind === 'staff' ? String(actor.staffId) : null,
          businessDate: shift.businessDate,
        })
        .returning()

      // Sổ doanh thu bất biến — chỉ INSERT, sửa sai bằng bút toán ngược
      await tx.insert(journalEntries).values({
        branchId: session.branchId,
        kind: 'payment',
        orderId: order.id,
        paymentId: payment!.id,
        amount: input.amount,
        actorId: actor.kind === 'staff' ? actor.staffId : null,
        memo: `Tiền mặt ${order.displayCode}`,
        businessDate: shift.businessDate,
      })

      const nowPaid = paidSoFar + input.amount
      const paymentState = nowPaid >= order.moneyTotal ? 'paid' : 'partial'
      await tx.update(orders).set({ paymentState }).where(eq(orders.id, order.id))

      // Trả đủ thì bàn chuyển "chờ dọn" — KHÔNG tự đóng (§20)
      if (paymentState === 'paid') {
        await tx
          .update(tableSessions)
          .set({ status: 'paid_wait_clear' })
          .where(eq(tableSessions.id, sessionId))

        // §25 B14: điểm chỉ sinh từ sự kiện thanh toán, và sinh trong CÙNG
        // transaction — thu tiền rollback thì điểm cũng không tồn tại. Đơn không
        // có số điện thoại khách thì hàm này im lặng bỏ qua, đó là phần lớn bill
        // tại bàn và là chuyện bình thường.
        await this.customers.accrueForPaidOrder(tx, {
          orderId: order.id,
          branchId: session.branchId,
          paidVnd: order.moneyTotal,
          businessDate: shift.businessDate,
        })
      }

      await emit(tx, {
        branchId: session.branchId,
        topic: 'table.paid',
        rooms: [rooms.tables(session.branchId), rooms.tableSession(sessionId)],
        payload: {
          sessionId,
          orderId: order.id,
          paymentState,
          paid: nowPaid,
          outstanding: Math.max(0, order.moneyTotal - nowPaid),
        },
      })

      await this.audit.write(tx, {
        actor,
        action: 'payment.cash',
        entity: 'payment',
        entityId: String(payment!.id),
        payload: { amount: input.amount, orderId: order.id },
      })

      return {
        paymentId: payment!.id,
        amount: input.amount,
        paid: nowPaid,
        outstanding: Math.max(0, order.moneyTotal - nowPaid),
        paymentState,
        // P11 in bill: tiền thối tính ở đây cho khỏi sai
        change: input.tendered ? Math.max(0, input.tendered - input.amount) : 0,
      }
    })
  }

  private async requireOpenShift(tx: Tx, branchId: string) {
    const [shift] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.branchId, branchId), eq(shifts.state, 'open')))
    if (!shift) {
      throw new ConflictException({
        code: 'no_open_shift',
        message: 'Chưa mở ca — không thu tiền được',
      })
    }
    return shift
  }
}
