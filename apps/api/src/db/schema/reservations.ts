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
    displayCode: text('display_code').notNull(),
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
    /**
     * Chìa cho khách tự xem và xác nhận lại suất của mình (R4 "một chạm").
     *
     * Lưu nguyên văn chứ không băm như token giữ chỗ: chính nhà hàng phải dựng
     * lại được liên kết để gửi kèm lời nhắc, mà băm thì không dựng lại được.
     * Đánh đổi chấp nhận được vì chìa này chỉ mở đúng một việc — xác nhận chính
     * suất đó — chứ không huỷ, không sửa, không đọc gì của người khác. Dùng mã
     * hiển thị (DB-2608-0041) làm chìa thì đoán được số kế tiếp.
     */
    guestToken: text('guest_token').unique(),
    /** Lần khách bấm xác nhận lại gần nhất — R4 đọc để biết ai khỏi phải gọi */
    guestConfirmedAt: timestamp('guest_confirmed_at', { withTimezone: true }),
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
    // Duy nhất TRONG MỘT CHI NHÁNH, cùng lý do với `orders` — xem chú thích ở đó.
    uniqueIndex('reservations_branch_display_code_unique').on(t.branchId, t.displayCode),
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

/**
 * Ngày không nhận đặt (R3 "chặn ngày").
 *
 * Bảng chứ không phải tham số: danh sách này dài ra theo lịch nghỉ lễ và tiệc
 * riêng, mỗi dòng có lý do để người trực trả lời được khách hỏi "sao hôm đó
 * không đặt được", và nó là dữ liệu vận hành chứ không phải một con số cấu hình.
 *
 * Chặn ngày KHÔNG huỷ suất đã nhận: khách đặt trước rồi mà quán đổi ý thì phải
 * gọi từng người, không phải để hệ thống lặng lẽ xoá.
 */
export const reservationBlockedDays = pgTable(
  'reservation_blocked_days',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    day: date('day').notNull(),
    reason: text('reason').notNull(),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reservation_blocked_days_unique').on(t.branchId, t.day)],
)

/**
 * Lượt nhắc hẹn ĐÃ gửi (R4 "hàng đợi nhắc trước 24h và 2h").
 *
 * Bảng chỉ ghi việc đã xảy ra, không ghi việc phải làm: hàng đợi "cần nhắc" là
 * một câu hỏi — suất còn hiệu lực, đã tới cữ nhắc, và chưa có lượt nào gọi được
 * khách — chứ không phải một bảng dựng sẵn. Dựng sẵn thì mỗi lần khách huỷ hay
 * đổi giờ lại phải có người đi dọn hàng đợi, và ngày nào quên dọn là nhân viên
 * gọi cho người đã huỷ. Cùng lối nghĩ với suất giữ mềm tự rơi khỏi lưới.
 *
 * `channel` ghi ĐƯỜNG THẬT đã dùng. Hôm nay hầu hết là `phone` vì kênh gửi tin
 * tự động (Mục 30.3) chưa dựng; khi bot Messenger vào thì nó ghi cùng bảng này
 * với `sent_by` để trống — R4 không phải đổi cách đọc.
 */
export const reservationReminders = pgTable(
  'reservation_reminders',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    reservationId: bigint('reservation_id', { mode: 'number' })
      .notNull()
      .references(() => reservations.id),
    /** Cữ nhắc: 'h24' trước một ngày, 'h2' trước hai tiếng */
    stage: text('stage').notNull(),
    channel: text('channel').notNull(),
    /** Gọi được hay không nghe máy — không nghe máy thì suất còn nằm trong hàng đợi */
    outcome: text('outcome').notNull(),
    /** Trống khi lượt nhắc do máy gửi */
    sentBy: bigint('sent_by', { mode: 'number' }).references(() => staff.id),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('reservation_reminders_stage_check', sql`${t.stage} IN ('h24','h2')`),
    check(
      'reservation_reminders_channel_check',
      sql`${t.channel} IN ('phone','zalo','sms','messenger')`,
    ),
    check('reservation_reminders_outcome_check', sql`${t.outcome} IN ('reached','no_answer')`),
    index('reservation_reminders_by_reservation_idx').on(t.reservationId, t.stage),
  ],
)
