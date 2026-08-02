import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/** Chi nhánh — mã ngắn dùng thẳng trong URL và tên kênh realtime ('cg', 'tx', 'dn') */
export const branches = pgTable('branches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  /** Giờ mở từng ngày trong tuần — đổ ra W5/W9/footer/chân hoá đơn (A10) */
  openHours: jsonb('open_hours'),
  /** Tài khoản ngân hàng + dải VA riêng của chi nhánh (A10) */
  bank: jsonb('bank'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const staff = pgTable('staff', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  code: text('code').notNull().unique(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  /** PIN 4–6 số băm bằng argon2id — dùng cho POS/KDS/kiosk */
  pinHash: text('pin_hash'),
  /** Tài khoản Office */
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  /**
   * Link cá nhân của Kênh nhân viên (H8 · H9) — chỉ lưu bản băm, cấp lại là link
   * cũ chết ngay. Nó đóng đúng vai trò của thiết bị đã ghép trong luồng POS: yếu
   * tố SỞ HỮU đứng cạnh PIN. Yếu hơn thiết bị thật vì link chuyển tiếp được qua
   * Zalo, nên phiên mở bằng nó bị giới hạn phạm vi — xem `staff_sessions.scope`.
   */
  channelTokenHash: text('channel_token_hash').unique(),
  /** TOTP mã hoá at-rest; bắt buộc với R7/R8/R10/R11/R13 */
  totpSecretEnc: text('totp_secret_enc'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Gán vai trò theo chi nhánh. `branch_id` NULL = phạm vi toàn chuỗi (R10/R11/R13).
 * Ma trận quyền KHÔNG nằm trong CSDL — nó là hằng typed ở @sora/contracts để API,
 * Office A2 và POS cùng đọc một nguồn.
 */
export const staffRoles = pgTable(
  'staff_roles',
  {
    staffId: bigint('staff_id', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    roleCode: text('role_code').notNull(),
    branchId: text('branch_id').references(() => branches.id),
  },
  (t) => [
    check(
      'staff_roles_role_code_check',
      sql`${t.roleCode} IN ('R0','R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11','R12','R13')`,
    ),
    // COALESCE để (staff, role, toàn chuỗi) cũng bị chặn trùng
    uniqueIndex('staff_roles_unique').on(t.staffId, t.roleCode, sql`coalesce(${t.branchId}, '*')`),
  ],
)

/**
 * Thiết bị đã ghép (tablet POS, máy thu ngân, màn KDS, kiosk chấm công, cầu in).
 * Token là chuỗi ngẫu nhiên 256-bit, CHỈ lưu bản băm — phải thu hồi được từ xa (A4)
 * nên bắt buộc tra CSDL mỗi lần, không dùng JWT tự chứng thực.
 */
export const devices = pgTable(
  'devices',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    /** Màn KDS ghim cứng một trạm */
    stationId: text('station_id'),
    tokenHash: text('token_hash').notNull().unique(),
    pairedBy: bigint('paired_by', { mode: 'number' }).references(() => staff.id),
    pairedAt: timestamp('paired_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    check('devices_kind_check', sql`${t.kind} IN ('pos','cashier','kds','kiosk','bridge')`),
    index('devices_branch_idx').on(t.branchId, t.kind),
  ],
)

/** Mã ghép 6 số, sống 10 phút, dùng một lần (K1 · A4) */
export const pairingCodes = pgTable(
  'pairing_codes',
  {
    code: text('code').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    kind: text('kind').notNull(),
    stationId: text('station_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
  },
  (t) => [check('pairing_codes_code_check', sql`${t.code} ~ '^[0-9]{6}$'`)],
)

/**
 * Phiên đăng nhập nhân viên.
 *
 * Dùng token đục (opaque) lưu bản băm thay vì JWT: mọi request đã phải tra CSDL để
 * kiểm thiết bị có bị thu hồi chưa (A4 "ngắt từ xa"), nên JWT không tiết kiệm được
 * lượt truy vấn nào mà lại thêm bí mật phải quản lý/xoay vòng và không thu hồi
 * được giữa chừng. Postgres chạy cùng máy nên chi phí tra cứu không đáng kể.
 *
 * Phiên GẮN với thiết bị đã ghép: PIN đứng một mình vô dụng nếu ở ngoài quán.
 */
export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    staffId: bigint('staff_id', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    /**
     * NULL với phiên Office: người quản lý đăng nhập bằng email trên máy tính
     * của họ, không có thiết bị nào của chi nhánh để ghép. Phiên vận hành (POS,
     * KDS) thì vẫn gắn cứng thiết bị — thu hồi thiết bị là phiên chết theo.
     */
    deviceId: bigint('device_id', { mode: 'number' }).references(() => devices.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    /**
     * 'full' — phiên vận hành hoặc Office: mang trọn vai trò của người đăng nhập.
     * 'self' — Kênh nhân viên: CHỈ mở được việc của chính mình (§26 H8 · H9).
     *
     * Cột này tồn tại vì link cá nhân là yếu tố sở hữu yếu hơn thiết bị đã ghép.
     * Không có nó thì điện thoại của một thu ngân, mở bằng một cái link chuyển
     * tiếp được, trở thành một cái POS đứng ngoài quán.
     */
    scope: text('scope').notNull().default('full'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    check('staff_sessions_scope_check', sql`${t.scope} IN ('full','self')`),
    index('staff_sessions_staff_idx').on(t.staffId, t.expiresAt),
  ],
)

/** Ca làm việc của thu ngân — mốc đối soát tiền mặt (P1 mở · P14 đóng) */
export const shifts = pgTable(
  'shifts',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    deviceId: bigint('device_id', { mode: 'number' }).references(() => devices.id),
    cashierId: bigint('cashier_id', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    state: text('state').notNull().default('open'),
    openingCash: bigint('opening_cash', { mode: 'number' }).notNull().default(0),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closingCashCounted: bigint('closing_cash_counted', { mode: 'number' }),
    closingExpected: bigint('closing_expected', { mode: 'number' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    note: text('note'),
    businessDate: date('business_date').notNull(),
  },
  (t) => [
    check('shifts_state_check', sql`${t.state} IN ('open','closed')`),
    index('shifts_branch_idx').on(t.branchId, t.businessDate),
  ],
)
