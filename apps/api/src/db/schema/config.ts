import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { stations } from './catalog'
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

/**
 * Máy in A5 — bill ở quầy và tem dán món ở trạm.
 *
 * Nằm cạnh tham số vì cùng một loại dữ liệu: thứ cầu in ĐỌC LÚC CHẠY qua bundle
 * cấu hình. Cầu in (`devices.kind = 'bridge'`) không có màn hình nào để cấu hình,
 * nên nếu địa chỉ máy in không đi theo bundle thì đổi một cái máy in phải sửa file
 * trên máy đặt ở góc bếp.
 *
 * Máy in tem GẮN TRẠM, máy in bill thì không: tem dán lên hộp ngay tại trạm đóng
 * gói, còn bill in ở quầy thu ngân nơi khách đứng trả tiền. Ràng buộc bên dưới
 * cưỡng chế đúng điều đó thay vì trông chờ người nhập nhớ.
 */
export const printers = pgTable(
  'printers',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    /** Trạm mà tem của nó đi ra; NULL với máy in bill */
    stationId: text('station_id').references(() => stations.id),
    /** Địa chỉ trong mạng LAN của quán — cầu in mở socket tới đây */
    host: text('host').notNull(),
    port: integer('port').notNull().default(9100),
    /** Khổ giấy + bản mẫu: k80-bill · k58-bill · tem-40x30 · tem-50x30 */
    template: text('template').notNull(),
    copies: smallint('copies').notNull().default(1),
    active: boolean('active').notNull().default(true),
    updatedBy: bigint('updated_by', { mode: 'number' }).references(() => staff.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('printers_kind_check', sql`${t.kind} IN ('bill','tem')`),
    check(
      'printers_template_check',
      sql`${t.template} IN ('k80-bill','k58-bill','tem-40x30','tem-50x30')`,
    ),
    // Tem phải biết dán ở trạm nào; bill in ở quầy nên không gắn trạm
    check(
      'printers_station_check',
      sql`(${t.kind} = 'tem' AND ${t.stationId} IS NOT NULL)
       OR (${t.kind} = 'bill' AND ${t.stationId} IS NULL)`,
    ),
    check('printers_port_check', sql`${t.port} BETWEEN 1 AND 65535`),
    check('printers_copies_check', sql`${t.copies} BETWEEN 1 AND 5`),
    uniqueIndex('printers_branch_name_unique').on(t.branchId, t.name),
  ],
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
