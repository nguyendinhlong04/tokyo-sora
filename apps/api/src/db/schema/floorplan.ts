import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { branches, staff } from './identity'

export const areas = pgTable('areas', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  branchId: text('branch_id')
    .notNull()
    .references(() => branches.id),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
})

/**
 * Bàn (A3). `hasGrill` là thuộc tính quyết định định tuyến bếp — xem
 * modules/kitchen/domain/routing.ts. `kind` phân biệt bàn thường / bàn nướng /
 * phòng riêng; phòng riêng mặc định đặt chỗ đích danh (§23.5).
 */
export const tables = pgTable(
  'tables',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    areaId: bigint('area_id', { mode: 'number' }).references(() => areas.id),
    code: text('code').notNull(),
    kind: text('kind').notNull().default('standard'),
    hasGrill: boolean('has_grill').notNull().default(false),
    grillType: text('grill_type'),
    seatMin: integer('seat_min').notNull().default(2),
    seatMax: integer('seat_max').notNull().default(4),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('tables_branch_code_unique').on(t.branchId, t.code),
    check('tables_kind_check', sql`${t.kind} IN ('standard','grill','private')`),
    check(
      'tables_grill_type_check',
      sql`${t.grillType} IS NULL OR ${t.grillType} IN ('than','gas','dien')`,
    ),
    check('tables_seats_check', sql`${t.seatMax} >= ${t.seatMin} AND ${t.seatMin} > 0`),
    // Bàn khai có bếp thì phải nói rõ bếp loại gì — tránh dữ liệu nửa vời làm sai định tuyến
    check('tables_grill_consistency', sql`NOT ${t.hasGrill} OR ${t.grillType} IS NOT NULL`),
  ],
)

/**
 * Phiên bàn — một lượt khách ngồi. Token QR băm ở đây và CHẾT khi phiên đóng
 * (§8: "token phiên bàn hết hạn khi đóng bàn").
 *
 * Bàn KHÔNG tự đóng khi trả xong: chuyển `paid_wait_clear`, nhân viên đóng tay.
 */
export const tableSessions = pgTable(
  'table_sessions',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    tableId: bigint('table_id', { mode: 'number' })
      .notNull()
      .references(() => tables.id),
    /** Bàn đã ghép vào phiên này (P9) */
    mergedTableIds: bigint('merged_table_ids', { mode: 'number' }).array(),
    status: text('status').notNull().default('open'),
    guestCount: integer('guest_count').notNull().default(1),
    note: text('note'),
    openedBy: bigint('opened_by', { mode: 'number' }).references(() => staff.id),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedBy: bigint('closed_by', { mode: 'number' }).references(() => staff.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    qrTokenHash: text('qr_token_hash').unique(),
    businessDate: date('business_date').notNull(),
  },
  (t) => [
    check(
      'table_sessions_status_check',
      sql`${t.status} IN ('open','paid_wait_clear','closed')`,
    ),
    check('table_sessions_guest_count_check', sql`${t.guestCount} > 0`),
    // Bất biến cứng: mỗi bàn chỉ có ĐÚNG MỘT phiên chưa đóng
    uniqueIndex('table_sessions_one_live_per_table')
      .on(t.tableId)
      .where(sql`status <> 'closed'`),
    index('table_sessions_branch_idx').on(t.branchId, t.status),
  ],
)

/**
 * Khách chấm sao và nhận xét ngay trên hoá đơn (T15) — nguồn cho màn B13 của
 * Office ở GĐ5.
 *
 * Một phiên bàn một phiếu: khách đổi ý chấm lại thì SỬA phiếu cũ chứ không đẻ ra
 * hai ý kiến của cùng một bữa ăn. Không lưu danh tính vì không có: khách tại bàn
 * chỉ có token của bàn, và hỏi thêm tên chỉ làm người ta bỏ dở.
 */
export const tableFeedback = pgTable(
  'table_feedback',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    tableSessionId: bigint('table_session_id', { mode: 'number' })
      .notNull()
      .unique()
      .references(() => tableSessions.id),
    stars: integer('stars').notNull(),
    comment: text('comment'),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('table_feedback_stars_check', sql`${t.stars} BETWEEN 1 AND 5`),
    index('table_feedback_branch_date_idx').on(t.branchId, t.businessDate),
  ],
)

/** Yêu cầu từ bàn (T9) → hàng đợi P12 */
export const tableRequests = pgTable(
  'table_requests',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    tableSessionId: bigint('table_session_id', { mode: 'number' })
      .notNull()
      .references(() => tableSessions.id),
    kind: text('kind').notNull(),
    note: text('note'),
    state: text('state').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    handledBy: bigint('handled_by', { mode: 'number' }).references(() => staff.id),
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'table_requests_kind_check',
      sql`${t.kind} IN ('phuc-vu','them-than','da-nuoc','tinh-tien','khac')`,
    ),
    check('table_requests_state_check', sql`${t.state} IN ('open','done')`),
    index('table_requests_queue_idx')
      .on(t.branchId, t.createdAt)
      .where(sql`state = 'open'`),
  ],
)
