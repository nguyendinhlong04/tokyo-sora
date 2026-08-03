import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { isUniqueViolation } from '../../common/pg-error'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  bankEvents,
  branches,
  journalEntries,
  orders,
  payments,
  shifts,
  staff,
  tableSessions,
  tables,
} from '../../db/schema'
import { CustomersService } from '../crm/customers.service'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'

/** Giao dịch chưa gán không bao giờ trôi qua đêm — tiền không ai nhận thì phải còn thấy */
const UNASSIGNED_LIMIT = 50
/** Đơn COD chưa nộp tiền còn nằm trên sổ ngần này ngày, đủ để shipper về nộp muộn */
const COD_WINDOW_DAYS = 7

/**
 * P14 đóng ca · P15 đối soát thanh toán tại bàn · sổ COD của dải P16.
 *
 * Tách khỏi `PaymentsService` vì đây là việc ĐỌC LẠI và SỬA LẠI những khoản đã
 * chạy, còn `PaymentsService` là đường tiền chạy lần đầu. Trộn hai thứ vào một
 * lớp thì mỗi lần sửa màn đối soát lại phải đọc lại toàn bộ luồng thu tiền.
 */
@Injectable()
export class ReconcileService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
  ) {}

  // ------------------------------------------------------- P14 đóng ca

  /**
   * Số liệu đóng ca.
   *
   * Tiền mặt tính bằng ĐÚNG câu truy vấn mà `closeShift` dùng — con số nhân viên
   * nhìn trước khi đếm két phải bằng con số máy chủ chốt lúc bấm, không thì bảng
   * đối chiếu tự sinh ra chênh lệch ma.
   *
   * Doanh thu theo hình thức thì suy theo THỜI GIAN chứ không theo `shift_id`:
   * lượt trả VietQR do điện thoại khách tạo, lúc tạo không ai biết ca nào đang
   * mở, nên cột `shift_id` của chúng để trống.
   */
  async shiftSummary(shiftId: number) {
    const [row] = await this.db
      .select({ shift: shifts, cashier: staff.fullName })
      .from(shifts)
      .leftJoin(staff, eq(staff.id, shifts.cashierId))
      .where(eq(shifts.id, shiftId))
    if (!row) throw new NotFoundException('Không có ca này')
    const shift = row.shift

    const until = shift.closedAt ?? new Date()
    const drawer = await this.db
      .select({ cash: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(
        and(
          eq(payments.shiftId, shiftId),
          inArray(payments.kind, ['cash', 'cod']),
          eq(payments.state, 'paid'),
        ),
      )

    const byKind = await this.db
      .select({
        kind: payments.kind,
        amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, shift.branchId),
          eq(payments.state, 'paid'),
          sql`${payments.paidAt} >= ${shift.openedAt}`,
          sql`${payments.paidAt} <= ${until}`,
        ),
      )
      .groupBy(payments.kind)

    const bank = await this.bankBlock(shift.branchId, shift.openedAt, until)
    const cashSales = Number(drawer[0]?.cash ?? 0)

    return {
      shift: {
        id: shift.id,
        branchId: shift.branchId,
        businessDate: shift.businessDate,
        state: shift.state,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        openingCash: shift.openingCash,
        cashier: row.cashier ?? null,
      },
      cash: {
        opening: shift.openingCash,
        sales: cashSales,
        expected: shift.openingCash + cashSales,
      },
      revenue: {
        byKind: byKind.map((r) => ({
          kind: r.kind,
          amount: Number(r.amount),
          count: Number(r.count),
        })),
        total: byKind.reduce((sum, r) => sum + Number(r.amount), 0),
      },
      bank,
    }
  }

  /**
   * Khối đối soát chuyển khoản: hệ thống ghi bao nhiêu, sao kê về bao nhiêu.
   *
   * `bank_events` không có cột chi nhánh — thông báo ngân hàng về theo tài khoản
   * chứ không theo quán. Phần đã khớp thì suy ra chi nhánh qua lượt trả; phần
   * chưa gán thì đếm nguyên trạng: tiền chưa ai nhận mà giấu đi vì "không thuộc
   * chi nhánh mình" là cách chắc chắn nhất để cuối tháng không ai tìm ra nó.
   */
  private async bankBlock(branchId: string, from: Date, until: Date) {
    const [system] = await this.db
      .select({ amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          eq(payments.kind, 'vietqr'),
          eq(payments.state, 'paid'),
          sql`${payments.paidAt} >= ${from}`,
          sql`${payments.paidAt} <= ${until}`,
        ),
      )

    const [statement] = await this.db
      .select({
        amount: sql<number>`coalesce(sum(${bankEvents.amount}), 0)::int`,
        matched: sql<number>`count(*)::int`,
      })
      .from(bankEvents)
      .innerJoin(payments, eq(payments.id, bankEvents.matchedPaymentId))
      .where(
        and(
          eq(bankEvents.matchState, 'matched'),
          eq(payments.branchId, branchId),
          sql`${bankEvents.receivedAt} >= ${from}`,
          sql`${bankEvents.receivedAt} <= ${until}`,
        ),
      )

    const [open] = await this.db
      .select({
        unassigned: sql<number>`count(*) filter (where ${bankEvents.matchState} = 'unmatched')::int`,
        mismatched: sql<number>`count(*) filter (where ${bankEvents.matchState} = 'amount_mismatch')::int`,
      })
      .from(bankEvents)
      .where(sql`${bankEvents.matchState} <> 'matched'`)

    return {
      system: Number(system?.amount ?? 0),
      statement: Number(statement?.amount ?? 0),
      matched: Number(statement?.matched ?? 0),
      unassigned: Number(open?.unassigned ?? 0),
      mismatched: Number(open?.mismatched ?? 0),
    }
  }

  // --------------------------------------------- P15 đối soát tại bàn

  /**
   * Ba nhóm của P15: đã khớp · lệch tiền · chưa gán.
   *
   * Nhóm "chưa gán" KHÔNG lọc theo ngày: một khoản tiền vào tài khoản mà không
   * khớp lượt trả nào là việc còn treo cho tới khi có người gán nó vào một bill,
   * và nửa đêm không phải là lý do để nó biến mất khỏi màn hình.
   */
  async reconcile(branchId: string, date?: string | null) {
    // Ngày kinh doanh theo MÚI GIỜ CHI NHÁNH: ca tối kết thúc sau nửa đêm UTC thì
    // nhân viên vẫn đang đối soát ca của ngày hôm trước (§A7).
    const businessDate = date ?? (await this.businessDateOfBranch(branchId))

    const matched = await this.db
      .select({
        paymentId: payments.id,
        amount: payments.amount,
        vaNumber: payments.vaNumber,
        bankRef: payments.bankRef,
        paidAt: payments.paidAt,
        tableCode: tables.code,
        orderCode: orders.displayCode,
      })
      .from(payments)
      .leftJoin(tableSessions, eq(tableSessions.id, payments.tableSessionId))
      .leftJoin(tables, eq(tables.id, tableSessions.tableId))
      .leftJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.branchId, branchId),
          eq(payments.kind, 'vietqr'),
          eq(payments.state, 'paid'),
          eq(payments.businessDate, businessDate),
        ),
      )
      .orderBy(desc(payments.paidAt))

    const mismatch = await this.db
      .select({
        paymentId: payments.id,
        expected: payments.amount,
        received: bankEvents.amount,
        vaNumber: payments.vaNumber,
        bankRef: bankEvents.bankRef,
        receivedAt: bankEvents.receivedAt,
        tableCode: tables.code,
        orderCode: orders.displayCode,
      })
      .from(payments)
      .innerJoin(bankEvents, eq(bankEvents.matchedPaymentId, payments.id))
      .leftJoin(tableSessions, eq(tableSessions.id, payments.tableSessionId))
      .leftJoin(tables, eq(tables.id, tableSessions.tableId))
      .leftJoin(orders, eq(orders.id, payments.orderId))
      .where(and(eq(payments.branchId, branchId), eq(payments.state, 'mismatch')))
      .orderBy(desc(bankEvents.receivedAt))

    const unassigned = await this.db
      .select({
        bankEventId: bankEvents.id,
        amount: bankEvents.amount,
        vaNumber: bankEvents.vaNumber,
        bankRef: bankEvents.bankRef,
        receivedAt: bankEvents.receivedAt,
      })
      .from(bankEvents)
      .where(eq(bankEvents.matchState, 'unmatched'))
      .orderBy(desc(bankEvents.receivedAt))
      .limit(UNASSIGNED_LIMIT)

    const [last] = await this.db
      .select({ at: sql<Date | null>`max(${bankEvents.receivedAt})` })
      .from(bankEvents)

    /**
     * Lượt trả đang chờ ngân hàng báo về.
     *
     * Đây là điều kiện thứ hai của banner đỏ P15: im lặng chỉ đáng báo động khi
     * CÓ khách đang chờ tiền về. Sáng vắng không ai quét QR mà màn hình vẫn kêu
     * "mất tín hiệu ngân hàng" thì vài ngày là không ai đọc banner đó nữa.
     */
    const [pending] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        amount: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          eq(payments.state, 'pending'),
          eq(payments.businessDate, businessDate),
        ),
      )

    return {
      businessDate,
      serverNow: new Date(),
      /** Mốc để P15 dựng banner đỏ "không nhận tín hiệu ngân hàng" */
      lastEventAt: last?.at ?? null,
      pending: { count: Number(pending?.count ?? 0), amount: Number(pending?.amount ?? 0) },
      matched: matched.map((r) => ({
        ...r,
        received: r.amount,
        diff: 0,
      })),
      mismatch: mismatch.map((r) => ({
        ...r,
        diff: Number(r.received) - Number(r.expected),
      })),
      unassigned,
    }
  }

  /**
   * P15 "Chấp nhận" — ghi nhận số tiền THỰC NHẬN rồi đóng bill.
   *
   * Khách chuyển thiếu vài nghìn thì quán chịu phần thiếu, nhưng chịu bằng một
   * dòng giảm giá có tên người bấm chứ không bằng cách sửa tổng bill: sổ vẫn phải
   * đọc ra "khách trả 498.000, quán bỏ 2.000" chứ không phải "bill có 498.000".
   */
  async acceptMismatch(paymentId: number, actor: Actor) {
    return this.db.transaction((tx) => this.creditMismatch(tx, paymentId, true, actor))
  }

  /**
   * P15 "Yêu cầu bù" — ghi nhận số thực nhận, phần thiếu VẪN NỢ trên bill.
   *
   * Không có trạng thái "đang đợi khách bù" nào cả: phần thiếu nằm lại ở dòng
   * "còn phải thu" của chính bàn đó, nên nhân viên thu nốt bằng tiền mặt ở P10
   * như mọi khoản khác. Một cờ riêng chỉ tạo thêm chỗ để quên.
   */
  async requestTopUp(paymentId: number, actor: Actor) {
    return this.db.transaction((tx) => this.creditMismatch(tx, paymentId, false, actor))
  }

  private async creditMismatch(tx: Tx, paymentId: number, writeOff: boolean, actor: Actor) {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId))
    if (!payment) throw new NotFoundException('Không có lượt trả này')
    if (payment.state !== 'mismatch') {
      throw new ConflictException('Lượt trả này không còn ở trạng thái lệch tiền')
    }
    if (!payment.orderId) throw new ConflictException('Lượt trả không gắn đơn nào')

    const [event] = await tx
      .select()
      .from(bankEvents)
      .where(
        and(eq(bankEvents.matchedPaymentId, paymentId), eq(bankEvents.matchState, 'amount_mismatch')),
      )
      .orderBy(desc(bankEvents.receivedAt))
    if (!event) throw new ConflictException('Không tìm thấy giao dịch ngân hàng của lượt trả này')

    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId))
    if (!order) throw new NotFoundException('Không có đơn của lượt trả này')

    const paidSoFar = await this.paidOf(tx, order.id)
    const outstanding = Math.max(0, order.moneyTotal - paidSoFar)
    const credited = Math.min(Number(event.amount), outstanding)
    if (credited <= 0) throw new ConflictException('Đơn đã trả đủ — không ghi thêm được')

    const now = new Date()
    await tx
      .update(payments)
      .set({ amount: credited, state: 'paid', paidAt: now, bankRef: event.bankRef })
      .where(eq(payments.id, paymentId))

    await tx.insert(journalEntries).values({
      branchId: payment.branchId,
      kind: 'payment',
      orderId: order.id,
      paymentId,
      amount: credited,
      actorId: actor.kind === 'staff' ? actor.staffId : null,
      memo: `VietQR ${event.bankRef} — đối soát tay`,
      businessDate: payment.businessDate,
    })

    // Khách chuyển DƯ: phần dư không phải doanh thu, nó là tiền phải trả lại
    const excess = Number(event.amount) - credited
    if (excess > 0) {
      await tx.insert(journalEntries).values({
        branchId: payment.branchId,
        kind: 'refund',
        orderId: order.id,
        paymentId,
        amount: -excess,
        actorId: actor.kind === 'staff' ? actor.staffId : null,
        memo: `Khách chuyển dư ${excess}đ — trả lại khách`,
        businessDate: payment.businessDate,
      })
    }

    const gap = outstanding - credited
    if (writeOff && gap > 0) {
      await tx.insert(journalEntries).values({
        branchId: payment.branchId,
        kind: 'discount',
        orderId: order.id,
        paymentId,
        amount: -gap,
        actorId: actor.kind === 'staff' ? actor.staffId : null,
        memo: `Chấp nhận lệch chuyển khoản ${event.bankRef}`,
        businessDate: payment.businessDate,
      })
    }

    await tx
      .update(bankEvents)
      .set({ matchState: 'matched' })
      .where(eq(bankEvents.id, event.id))

    const settled = writeOff && gap > 0
    const state = await this.settleOrder(tx, order.id, settled)

    await this.audit.write(tx, {
      actor,
      action: writeOff ? 'payment.mismatch.accepted' : 'payment.mismatch.topup-requested',
      entity: 'payment',
      entityId: String(paymentId),
      payload: { expected: payment.amount, received: Number(event.amount), credited, gap },
    })

    return { paymentId, credited, gap, paymentState: state }
  }

  /**
   * P15 gán một giao dịch chưa khớp vào bill của bàn.
   *
   * Tiền đã vào tài khoản nhưng VA không khớp lượt trả nào — khách chuyển tay,
   * quét lại mã cũ, hoặc lượt trả đã hết hạn. Người đối soát là người biết nó của
   * bàn nào, nên đây là thao tác tay và nó để lại dấu trong nhật ký.
   */
  async assignBankEvent(bankEventId: number, sessionId: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [event] = await tx.select().from(bankEvents).where(eq(bankEvents.id, bankEventId))
      if (!event) throw new NotFoundException('Không có giao dịch này')
      if (event.matchState === 'matched') throw new ConflictException('Giao dịch đã được gán')

      const [session] = await tx
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, sessionId))
      if (!session) throw new NotFoundException('Không có phiên bàn này')

      const [order] = await tx.select().from(orders).where(eq(orders.tableSessionId, sessionId))
      if (!order) throw new ConflictException('Bàn chưa có đơn nào')

      const paidSoFar = await this.paidOf(tx, order.id)
      const outstanding = Math.max(0, order.moneyTotal - paidSoFar)
      if (outstanding <= 0) throw new ConflictException('Bill này đã trả đủ')
      const credited = Math.min(Number(event.amount), outstanding)

      const [shift] = await tx
        .select()
        .from(shifts)
        .where(and(eq(shifts.branchId, session.branchId), eq(shifts.state, 'open')))

      let payment
      try {
        ;[payment] = await tx
          .insert(payments)
          .values({
            branchId: session.branchId,
            orderId: order.id,
            tableSessionId: sessionId,
            shiftId: shift?.id ?? null,
            kind: 'vietqr',
            amount: credited,
            state: 'paid',
            vaNumber: event.vaNumber,
            bankRef: event.bankRef,
            paidAt: event.receivedAt,
            createdByKind: 'staff',
            createdById: actor.kind === 'staff' ? String(actor.staffId) : null,
            businessDate: order.businessDate,
          })
          .returning()
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException('Giao dịch này đã được ghi cho một lượt trả khác')
        }
        throw err
      }

      await tx.insert(journalEntries).values({
        branchId: session.branchId,
        kind: 'payment',
        orderId: order.id,
        paymentId: payment!.id,
        amount: credited,
        actorId: actor.kind === 'staff' ? actor.staffId : null,
        memo: `Gán tay giao dịch ${event.bankRef}`,
        businessDate: order.businessDate,
      })

      const excess = Number(event.amount) - credited
      if (excess > 0) {
        await tx.insert(journalEntries).values({
          branchId: session.branchId,
          kind: 'refund',
          orderId: order.id,
          paymentId: payment!.id,
          amount: -excess,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          memo: `Khách chuyển dư ${excess}đ — trả lại khách`,
          businessDate: order.businessDate,
        })
      }

      await tx
        .update(bankEvents)
        .set({ matchState: 'matched', matchedPaymentId: payment!.id })
        .where(eq(bankEvents.id, bankEventId))

      const state = await this.settleOrder(tx, order.id, false)

      await emit(tx, {
        branchId: session.branchId,
        topic: 'payment.received',
        rooms: [rooms.tables(session.branchId), rooms.tableSession(sessionId)],
        payload: { paymentId: payment!.id, amount: credited, paymentState: state },
      })

      await this.audit.write(tx, {
        actor,
        action: 'payment.bank-event.assigned',
        entity: 'bank_event',
        entityId: String(bankEventId),
        payload: { sessionId, orderId: order.id, credited },
      })

      return { paymentId: payment!.id, credited, paymentState: state }
    })
  }

  // ------------------------------------------------ Sổ COD của dải P16

  /**
   * Đơn giao đã đưa khách mà tiền còn nằm trong túi shipper, gom theo người giao.
   *
   * Đơn cũ chưa nộp vẫn nằm trên sổ (bảy ngày): shipper chạy tối muộn về nộp hôm
   * sau là chuyện thường, và món nợ đó không được biến mất lúc sang ngày mới.
   */
  async codBook(branchId: string) {
    const rows = await this.db
      .select({
        id: orders.id,
        displayCode: orders.displayCode,
        total: orders.moneyTotal,
        paid: sql<number>`coalesce((
          select sum(p.amount) from payments p
          where p.order_id = ${orders.id} and p.state = 'paid'
        ), 0)::int`,
        shipper: orders.shipper,
        doneAt: orders.doneAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branchId),
          eq(orders.type, 'delivery'),
          sql`${orders.status} IN ('delivering','done')`,
          sql`${orders.paymentState} <> 'paid'`,
          sql`${orders.shipper} IS NOT NULL`,
          sql`${orders.businessDate} >= current_date - ${sql.raw(String(COD_WINDOW_DAYS))}`,
        ),
      )
      .orderBy(orders.id)

    interface CodOrder {
      id: number
      displayCode: string
      due: number
    }
    interface ShipperRow {
      name?: string
      phone?: string | null
    }
    const groups = new Map<
      string,
      { name: string; phone: string | null; orders: CodOrder[]; due: number }
    >()

    for (const row of rows) {
      const shipper = (row.shipper ?? {}) as ShipperRow
      const name = shipper.name?.trim() || 'Chưa rõ người giao'
      const due = Math.max(0, Number(row.total) - Number(row.paid))
      if (due <= 0) continue

      const group = groups.get(name) ?? {
        name,
        phone: shipper.phone ?? null,
        orders: [] as CodOrder[],
        due: 0,
      }
      group.orders.push({ id: row.id, displayCode: row.displayCode, due })
      group.due += due
      groups.set(name, group)
    }

    const shippers = [...groups.values()].sort((a, b) => b.due - a.due)
    return { shippers, total: shippers.reduce((sum, s) => sum + s.due, 0) }
  }

  /**
   * Shipper về nộp tiền — tiền vào két của ca đang mở.
   *
   * Nộp thiếu thì các đơn VẪN ghi là đã thu: khách đã trả tiền cho shipper, đơn
   * của khách không còn nợ gì. Chỗ thiếu là chuyện giữa quán và người giao, và nó
   * đi vào bút toán lệch quỹ đúng như chênh lệch đếm két lúc đóng ca — nhét vào
   * doanh thu là làm bẩn con số bán hàng.
   */
  async settleCod(
    input: { branchId: string; shipper: string; orderIds: number[]; receivedAmount?: number | null },
    actor: Actor,
  ) {
    return this.db.transaction(async (tx) => {
      const [shift] = await tx
        .select()
        .from(shifts)
        .where(and(eq(shifts.branchId, input.branchId), eq(shifts.state, 'open')))
      if (!shift) {
        throw new ConflictException({
          code: 'no_open_shift',
          message: 'Chưa mở ca — không nhận tiền vào két được',
        })
      }

      const rows = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.branchId, input.branchId),
            inArray(orders.id, input.orderIds),
            sql`${orders.status} <> 'cancelled'`,
            sql`${orders.paymentState} <> 'paid'`,
          ),
        )
      if (rows.length === 0) throw new ConflictException('Không còn đơn nào để nhận tiền')

      let due = 0
      const now = new Date()
      for (const order of rows) {
        const paidSoFar = await this.paidOf(tx, order.id)
        const outstanding = Math.max(0, order.moneyTotal - paidSoFar)
        if (outstanding <= 0) continue
        due += outstanding

        const [payment] = await tx
          .insert(payments)
          .values({
            branchId: order.branchId,
            orderId: order.id,
            kind: 'cod',
            amount: outstanding,
            state: 'paid',
            paidAt: now,
            shiftId: shift.id,
            createdByKind: 'staff',
            createdById: actor.kind === 'staff' ? String(actor.staffId) : null,
            businessDate: shift.businessDate,
          })
          .returning({ id: payments.id })

        await tx.insert(journalEntries).values({
          branchId: order.branchId,
          kind: 'payment',
          orderId: order.id,
          paymentId: payment!.id,
          amount: outstanding,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          memo: `COD ${order.displayCode} — ${input.shipper}`,
          businessDate: shift.businessDate,
        })

        await this.settleOrder(tx, order.id, false)
      }

      const received = input.receivedAmount ?? due
      const variance = received - due
      if (variance !== 0) {
        await tx.insert(journalEntries).values({
          branchId: input.branchId,
          kind: 'shift_adjust',
          amount: variance,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          memo: `Lệch COD ${input.shipper} — ca #${shift.id}`,
          businessDate: shift.businessDate,
        })
      }

      await this.audit.write(tx, {
        actor,
        action: 'payment.cod.settled',
        entity: 'shift',
        entityId: String(shift.id),
        payload: { shipper: input.shipper, orders: rows.length, due, received, variance },
      })

      return { orders: rows.length, due, received, variance }
    })
  }

  // ------------------------------------------------------------- Nội bộ

  private async businessDateOfBranch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return businessDateOf(new Date(), branch.timezone)
  }

  private async paidOf(tx: Tx, orderId: number) {
    const [row] = await tx
      .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.state, 'paid')))
    return Number(row?.paid ?? 0)
  }

  /**
   * Cập nhật trạng thái trả tiền của đơn sau khi ghi thêm khoản.
   *
   * `forcePaid` là đường của "chấp nhận lệch": tiền vào ít hơn tổng bill nhưng
   * quán đã ghi dòng giảm giá bù vào, nên bill đóng lại được. Ngoài đường đó ra,
   * trạng thái luôn suy từ tổng tiền đã thu — không ai đặt tay vào.
   */
  private async settleOrder(tx: Tx, orderId: number, forcePaid: boolean) {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId))
    if (!order) return 'unpaid'

    const paid = await this.paidOf(tx, orderId)
    const state = forcePaid || paid >= order.moneyTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
    await tx.update(orders).set({ paymentState: state }).where(eq(orders.id, orderId))

    if (state === 'paid' && order.tableSessionId) {
      await tx
        .update(tableSessions)
        .set({ status: 'paid_wait_clear' })
        .where(eq(tableSessions.id, order.tableSessionId))
    }

    if (state === 'paid') {
      await this.customers.accrueForPaidOrder(tx, {
        orderId,
        branchId: order.branchId,
        paidVnd: order.moneyTotal,
        businessDate: order.businessDate,
      })
    }
    return state
  }
}
