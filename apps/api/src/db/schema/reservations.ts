import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { tables } from './floorplan'
import { branches, staff } from './identity'

/**
 * Đặt chỗ (W6 trên web · R1/R2 trên POS).
 *
 * Suất được giữ theo KIỂU CHỖ chứ không theo bàn cụ thể: khách web chọn "bàn
 * nướng có bếp cho 4 người", nhân viên gán bàn nào là việc của R2 lúc khách tới.
 * Gán bàn sớm ở web chỉ tạo ra những suất khoá cứng mà không ai điều phối được.
 *
 * `endAt` = giờ hẹn + thời lượng bữa + đệm dọn, ghi luôn ra cột để truy vấn chồng
 * lấn không phải nhân bản công thức tính thời lượng ở mỗi câu lệnh.
 */
export const reservations = pgTable(
  'reservations',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** Mã khách đọc qua điện thoại: DB-2608-0041 */
    displayCode: text('display_code').notNull().unique(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    seatKind: text('seat_kind').notNull(),
    guestCount: integer('guest_count').notNull(),
    slotAt: timestamp('slot_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pending'),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    note: text('note'),
    /** Bàn được gán lúc khách tới (R2) — web không gán */
    tableId: bigint('table_id', { mode: 'number' }).references(() => tables.id),
    source: text('source').notNull().default('web'),
    cancelReason: text('cancel_reason'),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    check('reservations_seat_kind_check', sql`${t.seatKind} IN ('standard','grill','private')`),
    check(
      'reservations_status_check',
      sql`${t.status} IN ('pending','confirmed','seated','done','cancelled','no_show')`,
    ),
    check('reservations_source_check', sql`${t.source} IN ('web','phone','walkin')`),
    check('reservations_guest_count_check', sql`${t.guestCount} > 0`),
    check('reservations_window_check', sql`${t.endAt} > ${t.slotAt}`),
    // Truy vấn nóng: mọi suất còn hiệu lực của một chi nhánh trong một ngày
    index('reservations_branch_day_idx').on(t.branchId, t.businessDate, t.seatKind),
  ],
)

/**
 * Giữ chỗ mềm 10 phút trong lúc khách điền thông tin (§23.5 "giữ chỗ mềm").
 *
 * Lý do có bảng riêng thay vì một dòng `reservations` trạng thái nháp: suất giữ
 * mềm hết hạn tự rơi khỏi mọi phép đếm chỉ nhờ so `expires_at > now()` — không
 * cần job dọn, và một suất bỏ dở không bao giờ lẫn vào sổ đặt chỗ thật của R1.
 *
 * Chỉ lưu bản BĂM của token: token nằm trong tay trình duyệt khách, ai đọc được
 * CSDL cũng không cướp được suất đang giữ của người khác.
 */
export const reservationHolds = pgTable(
  'reservation_holds',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    tokenHash: text('token_hash').notNull(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    seatKind: text('seat_kind').notNull(),
    guestCount: integer('guest_count').notNull(),
    slotAt: timestamp('slot_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Suất đã thành đặt chỗ thật — giữ lại để không đếm hai lần */
    reservationId: bigint('reservation_id', { mode: 'number' }).references(() => reservations.id),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reservation_holds_token_unique').on(t.tokenHash),
    check('reservation_holds_seat_kind_check', sql`${t.seatKind} IN ('standard','grill','private')`),
    check('reservation_holds_guest_count_check', sql`${t.guestCount} > 0`),
    index('reservation_holds_live_idx')
      .on(t.branchId, t.businessDate, t.seatKind)
      .where(sql`reservation_id IS NULL`),
  ],
)
