import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { dishes } from './catalog'
import { branches, staff } from './identity'
import { tableSessions } from './floorplan'

/**
 * Đơn hàng — nguồn sự thật duy nhất, mọi app đi qua đây.
 *
 * `displayCode` (ON-2608-0417) là thứ khách đọc qua điện thoại; `id` nội bộ là số
 * — hai thứ khác nhau, đừng bắt khách đọc UUID (điểm dễ sai §9.4).
 *
 * Khối tiền do SERVER tính (packages/contracts/money.ts) và đóng băng tại đây;
 * `pricingBundleVersion` ghi lại bản giá đã dùng để truy vết.
 */
export const orders = pgTable(
  'orders',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    displayCode: text('display_code').notNull().unique(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    channel: text('channel').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('new'),
    tableSessionId: bigint('table_session_id', { mode: 'number' }).references(
      () => tableSessions.id,
    ),
    /** Khách online: tên, SĐT, địa chỉ, ghi chú */
    customer: jsonb('customer'),
    slotMode: text('slot_mode'),
    slotAt: timestamp('slot_at', { withTimezone: true }),

    moneySub: bigint('money_sub', { mode: 'number' }).notNull().default(0),
    moneyDiscount: bigint('money_discount', { mode: 'number' }).notNull().default(0),
    moneyService: bigint('money_service', { mode: 'number' }).notNull().default(0),
    moneyVat: bigint('money_vat', { mode: 'number' }).notNull().default(0),
    moneyShip: bigint('money_ship', { mode: 'number' }).notNull().default(0),
    moneyRound: bigint('money_round', { mode: 'number' }).notNull().default(0),
    moneyTotal: bigint('money_total', { mode: 'number' }).notNull().default(0),
    pricingBundleVersion: text('pricing_bundle_version'),

    paymentState: text('payment_state').notNull().default('unpaid'),
    cancelReason: text('cancel_reason'),
    createdByKind: text('created_by_kind').notNull(),
    createdById: text('created_by_id'),
    /** Optimistic concurrency cho PATCH từ nhiều thiết bị POS */
    version: integer('version').notNull().default(1),

    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    check('orders_channel_check', sql`${t.channel} IN ('web','table','pos','grab','shopee','be')`),
    check('orders_type_check', sql`${t.type} IN ('dinein','takeaway','delivery')`),
    check(
      'orders_status_check',
      sql`${t.status} IN ('new','confirmed','cooking','ready','delivering','done','cancelled')`,
    ),
    check(
      'orders_payment_state_check',
      sql`${t.paymentState} IN ('unpaid','partial','paid','refunded')`,
    ),
    check('orders_slot_mode_check', sql`${t.slotMode} IS NULL OR ${t.slotMode} IN ('asap','scheduled')`),
    check(
      'orders_created_by_kind_check',
      sql`${t.createdByKind} IN ('staff','customer','device','system')`,
    ),
    // Huỷ phải có lý do (§3: POS O9 huỷ có lý do, ghi nhật ký)
    check(
      'orders_cancel_reason_required',
      sql`${t.status} <> 'cancelled' OR ${t.cancelReason} IS NOT NULL`,
    ),
    check('orders_money_nonneg', sql`${t.moneySub} >= 0 AND ${t.moneyTotal} >= 0`),
    // Bảng điều phối O8: chỉ quét đơn đang sống
    index('orders_dispatch_idx')
      .on(t.branchId, t.status, t.createdAt)
      .where(sql`status NOT IN ('done','cancelled')`),
    index('orders_branch_date_idx').on(t.branchId, t.businessDate),
    index('orders_table_session_idx').on(t.tableSessionId),
  ],
)

/** Đợt ra món. `held` = chưa bấm "Ra đợt" ⇒ vé bếp waiting, đồng hồ chưa chạy */
export const orderBatches = pgTable(
  'order_batches',
  {
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    batchNo: smallint('batch_no').notNull(),
    state: text('state').notNull().default('held'),
    firedAt: timestamp('fired_at', { withTimezone: true }),
    firedBy: bigint('fired_by', { mode: 'number' }).references(() => staff.id),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.batchNo] }),
    check('order_batches_state_check', sql`${t.state} IN ('held','fired')`),
    check('order_batches_no_check', sql`${t.batchNo} > 0`),
    check(
      'order_batches_fired_at_check',
      sql`(${t.state} = 'held' AND ${t.firedAt} IS NULL) OR (${t.state} = 'fired' AND ${t.firedAt} IS NOT NULL)`,
    ),
  ],
)

/**
 * Dòng đơn. Tên và giá ĐÓNG BĂNG lúc tạo — Office đổi giá không được làm đổi đơn
 * đã tạo (điểm dễ sai §9.2).
 *
 * Dòng set (kind='set_parent') giữ giá; dòng con trỏ về qua `parentLineId`, giá 0,
 * và CHÍNH chúng mới xuống bếp.
 */
export const orderLines = pgTable(
  'order_lines',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    parentLineId: bigint('parent_line_id', { mode: 'number' }),
    kind: text('kind').notNull().default('dish'),
    batchNo: smallint('batch_no').notNull().default(1),

    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id),
    dishCode: text('dish_code').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    qty: integer('qty').notNull(),
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
    priceTotal: bigint('price_total', { mode: 'number' }).notNull(),
    /** [{optionId, name, priceDelta}] đóng băng lúc tạo */
    modifiers: jsonb('modifiers'),

    note: text('note'),
    /** Nhãn set để bếp biết các món ra cùng lúc */
    setLabel: text('set_label'),
    portionLabel: text('portion_label'),
    /** Trạm đã giải ra lúc gửi bếp — ghi lại để đối chiếu khi đổi bàn */
    stationId: text('station_id'),

    state: text('state').notNull().default('draft'),
    voidReason: text('void_reason'),
    voidedBy: bigint('voided_by', { mode: 'number' }).references(() => staff.id),
    approvalId: bigint('approval_id', { mode: 'number' }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('order_lines_kind_check', sql`${t.kind} IN ('dish','set_parent')`),
    check(
      'order_lines_state_check',
      sql`${t.state} IN ('draft','queued','cooking','ready','served','voided')`,
    ),
    check('order_lines_qty_check', sql`${t.qty} > 0`),
    check('order_lines_price_check', sql`${t.unitPrice} >= 0 AND ${t.priceTotal} >= 0`),
    // Dòng con của set không mang giá — giá nằm ở dòng set cha
    check(
      'order_lines_child_price_zero',
      sql`${t.parentLineId} IS NULL OR ${t.priceTotal} = 0`,
    ),
    // Huỷ món phải có lý do
    check(
      'order_lines_void_reason_required',
      sql`${t.state} <> 'voided' OR ${t.voidReason} IS NOT NULL`,
    ),
    index('order_lines_order_idx').on(t.orderId, t.batchNo),
    index('order_lines_parent_idx').on(t.parentLineId),
  ],
)

/**
 * Bộ đếm sinh mã hiển thị theo ngày (ON-xxxx). Tách khỏi id nội bộ để khách đọc
 * được qua điện thoại. Cấp số bằng UPSERT … RETURNING trong transaction.
 */
export const displayCounters = pgTable(
  'display_counters',
  {
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    kind: text('kind').notNull(),
    businessDate: date('business_date').notNull(),
    counter: integer('counter').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.kind, t.businessDate] })],
)
