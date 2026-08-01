import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { branches, staff } from './identity'

/**
 * Bundle cấu hình phát xuống các app. Version dạng `<ISO>#<id>`; app cache lại và
 * chỉ tải mới khi version đổi (GET /api/config trả 304 nếu trùng ETag).
 *
 * Cố tình KHÔNG chứa trạng thái hết món — 86 là live state (xem dish_availability).
 */
export const configBundles = pgTable(
  'config_bundles',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    version: text('version').notNull(),
    payload: jsonb('payload').notNull(),
    publishedBy: bigint('published_by', { mode: 'number' }).references(() => staff.id),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('config_bundles_branch_version_unique').on(t.branchId, t.version),
    index('config_bundles_latest_idx').on(t.branchId, t.id),
  ],
)

/**
 * Trung tâm tham số A6 — một sổ đăng ký duy nhất cho mọi ngưỡng/hệ số/hạn mức.
 * `branchId` NULL = giá trị mặc định cấp chuỗi; dòng có branchId là ghi đè.
 * Engine đọc lúc chạy nên sửa tham số không cần triển khai lại.
 */
export const parameters = pgTable(
  'parameters',
  {
    key: text('key').notNull(),
    branchId: text('branch_id').references(() => branches.id),
    value: jsonb('value').notNull(),
    unit: text('unit'),
    /** Chi nhánh có được ghi đè tham số này không */
    overridable: boolean('overridable').notNull().default(true),
    /** Đổi phải nhập 2FA và ghi nhật ký A7 */
    sensitive: boolean('sensitive').notNull().default(false),
    updatedBy: bigint('updated_by', { mode: 'number' }).references(() => staff.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('parameters_key_scope_unique').on(t.key, sql`coalesce(${t.branchId}, '*')`)],
)

/** Lịch sử đổi tham số — APPEND-ONLY (trigger chặn UPDATE/DELETE) */
export const parameterHistory = pgTable(
  'parameter_history',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    key: text('key').notNull(),
    branchId: text('branch_id'),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value').notNull(),
    changedBy: bigint('changed_by', { mode: 'number' }).references(() => staff.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('parameter_history_key_idx').on(t.key, t.changedAt)],
)
