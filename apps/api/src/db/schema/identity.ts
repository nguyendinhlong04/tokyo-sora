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
