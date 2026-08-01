import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { tableSessions } from './floorplan'
import { branches, shifts } from './identity'
import { orderLines, orders } from './ordering'

/**
 * Một LƯỢT trả tiền. Khách chia bill thì một phiên bàn có nhiều dòng ở đây.
 *
 * Quy tắc cứng (§20): **chỉ webhook/API ngân hàng mới đóng khoản** — nút "Đã
 * chuyển xong" của khách chỉ đổi màn hình, không đổi `state`. Mỗi lượt trả sinh
 * một VA riêng nhúng vào VietQR nên tiền vào VA nào là của lượt đó, không phụ
 * thuộc nội dung chuyển khoản.
 */
export const payments = pgTable(
  'payments',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    orderId: bigint('order_id', { mode: 'number' }).references(() => orders.id),
    tableSessionId: bigint('table_session_id', { mode: 'number' }).references(
      () => tableSessions.id,
    ),
    shiftId: bigint('shift_id', { mode: 'number' }).references(() => shifts.id),
    kind: text('kind').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    state: text('state').notNull().default('pending'),

    vaNumber: text('va_number'),
    qrString: text('qr_string'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Mã giao dịch ngân hàng — UNIQUE chính là chốt chặn webhook lặp */
    bankRef: text('bank_ref').unique(),
    paidAt: timestamp('paid_at', { withTimezone: true }),

    createdByKind: text('created_by_kind').notNull(),
    createdById: text('created_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    businessDate: date('business_date').notNull(),
  },
  (t) => [
    check('payments_kind_check', sql`${t.kind} IN ('cash','vietqr','card','cod')`),
    check(
      'payments_state_check',
      sql`${t.state} IN ('pending','paid','failed','expired','refunded','mismatch')`,
    ),
    check('payments_amount_check', sql`${t.amount} > 0`),
    check(
      'payments_paid_at_check',
      sql`(${t.state} = 'paid') = (${t.paidAt} IS NOT NULL)`,
    ),
    // Đã trả thì phải gắn được với đơn hoặc phiên bàn, không có tiền "mồ côi"
    check(
      'payments_target_required',
      sql`${t.orderId} IS NOT NULL OR ${t.tableSessionId} IS NOT NULL`,
    ),
    index('payments_branch_state_idx').on(t.branchId, t.state, t.createdAt),
    index('payments_session_idx').on(t.tableSessionId),
    // P15 đối soát: chỉ quét lượt chưa khớp
    index('payments_pending_idx')
      .on(t.branchId, t.createdAt)
      .where(sql`state IN ('pending','mismatch')`),
  ],
)

/**
 * Khách chọn món mình trả (T12). Partial unique trên `order_line_id` với các lượt
 * còn sống = chống trả trùng: người sau thấy món đã bị người trước nhận.
 */
export const paymentLines = pgTable(
  'payment_lines',
  {
    paymentId: bigint('payment_id', { mode: 'number' })
      .notNull()
      .references(() => payments.id),
    orderLineId: bigint('order_line_id', { mode: 'number' })
      .notNull()
      .references(() => orderLines.id),
    /** Bản sao trạng thái lượt trả để dựng partial unique index (giữ đồng bộ bằng trigger) */
    live: text('live').notNull().default('yes'),
  },
  (t) => [
    uniqueIndex('payment_lines_one_live_claim')
      .on(t.orderLineId)
      .where(sql`live = 'yes'`),
    index('payment_lines_payment_idx').on(t.paymentId),
  ],
)
