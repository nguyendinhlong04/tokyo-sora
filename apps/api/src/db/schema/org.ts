import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { branches, staff } from './identity'

/**
 * ====== TỔ CHỨC: ĐƠN VỊ → CHỨC DANH → NGƯỜI GIỮ ======
 *
 * Người không gắn thẳng vào nhau. Người gắn vào CHỨC DANH, chức danh nằm trong
 * ĐƠN VỊ, đơn vị xếp thành cây. "Cấp trên trực tiếp" suy ra từ cây: người giữ
 * chức danh trưởng của đơn vị gần nhất phía trên. Không có cột `reports_to` —
 * hai cây cùng nói "ai là sếp ai" thì sớm muộn lệch nhau.
 *
 * Sơ đồ KHÔNG cấp quyền. Quyền vẫn chỉ cấp ở A1 (`staff_roles`); chức danh mang
 * `suggested_role` để màn sơ đồ cảnh báo khi người giữ chưa có vai trò đó.
 */

/** Cây đơn vị: công ty → khối/phòng → chi nhánh → bộ phận → tổ */
export const orgUnits = pgTable(
  'org_units',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    parentId: bigint('parent_id', { mode: 'number' }).references((): AnyPgColumn => orgUnits.id),
    kind: text('kind')
      .notNull()
      .$type<'cong-ty' | 'khoi' | 'phong' | 'chi-nhanh' | 'bo-phan' | 'to'>(),
    name: text('name').notNull(),
    /** Chỉ đơn vị loại chi nhánh mang mã; con cháu suy chi nhánh từ tổ tiên */
    branchId: text('branch_id').references(() => branches.id),
    /** Tổ bếp ↔ trạm KDS — để số đo bếp (theo trạm) quy được về đúng tổ */
    stationId: text('station_id'),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'org_units_kind_check',
      sql`${t.kind} IN ('cong-ty','khoi','phong','chi-nhanh','bo-phan','to')`,
    ),
    // Gốc duy nhất là công ty, và công ty chỉ có thể là gốc
    check('org_units_root_check', sql`(${t.kind} = 'cong-ty') = (${t.parentId} IS NULL)`),
    check('org_units_branch_check', sql`(${t.kind} = 'chi-nhanh') = (${t.branchId} IS NOT NULL)`),
    check('org_units_not_own_parent', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    // Mọi gốc đều là 'cong-ty' (CHECK trên) ⇒ duy nhất theo kind = đúng một gốc
    uniqueIndex('org_units_one_root')
      .on(t.kind)
      .where(sql`parent_id IS NULL`),
    uniqueIndex('org_units_one_per_branch')
      .on(t.branchId)
      .where(sql`branch_id IS NOT NULL`),
    index('org_units_parent_idx').on(t.parentId, t.sort),
  ],
)

/**
 * Chức danh — một "ghế" trong đơn vị, có định biên. Người nghỉ thì ghế còn đó:
 * việc định kỳ, bộ KPI, mô tả công việc gắn vào ghế chứ không theo người.
 */
export const positions = pgTable(
  'positions',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    unitId: bigint('unit_id', { mode: 'number' })
      .notNull()
      .references(() => orgUnits.id),
    title: text('title').notNull(),
    /** Trưởng đơn vị — gốc của "cấp trên trực tiếp" và của phạm vi giao việc */
    isHead: boolean('is_head').notNull().default(false),
    /** Định biên — chỉ cảnh báo, không chặn gán (thời vụ tuyển thêm là bình thường) */
    headcount: smallint('headcount').notNull().default(1),
    /** Vai trò A1 nên có — chỉ để cảnh báo lệch, KHÔNG tự cấp quyền */
    suggestedRole: text('suggested_role'),
    /** Mô tả công việc chuẩn ba phần: trách nhiệm · quyền hạn · tiêu chuẩn */
    duties: text('duties')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    authorities: text('authorities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    requirements: text('requirements')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('positions_headcount_check', sql`${t.headcount} BETWEEN 0 AND 500`),
    // Trưởng là MỘT người — hai trưởng thì "cấp trên trực tiếp" không còn nghĩa
    check('positions_head_headcount_check', sql`NOT ${t.isHead} OR ${t.headcount} = 1`),
    check(
      'positions_suggested_role_check',
      sql`${t.suggestedRole} IS NULL OR ${t.suggestedRole}
          IN ('R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11','R12','R13')`,
    ),
    check(
      'positions_job_lines_check',
      sql`cardinality(${t.duties}) <= 20 AND cardinality(${t.authorities}) <= 20
          AND cardinality(${t.requirements}) <= 20`,
    ),
    uniqueIndex('positions_unit_title_unique').on(t.unitId, t.title),
    uniqueIndex('positions_one_head_per_unit')
      .on(t.unitId)
      .where(sql`is_head AND active`),
  ],
)

/**
 * Ai giữ chức danh nào, từ ngày nào — khoảng NỬA MỞ `[from_date, to_date)`:
 * `to_date` là ngày đầu tiên KHÔNG còn giữ. Bổ nhiệm sai trong ngày thì đóng
 * bằng chính ngày mở, ra khoảng rỗng — không cần xoá hay sửa ngược.
 *
 * Lịch sử bất biến (trigger 9007): không xoá, mỗi dòng chỉ được ĐÓNG một lần.
 */
export const positionAssignments = pgTable(
  'position_assignments',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    staffId: bigint('staff_id', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    positionId: bigint('position_id', { mode: 'number' })
      .notNull()
      .references(() => positions.id),
    kind: text('kind').notNull().default('chinh').$type<'chinh' | 'kiem-nhiem'>(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date'),
    /** Quyết định bổ nhiệm làm căn cứ — FK tới văn bản thêm ở bước văn bản */
    documentId: bigint('document_id', { mode: 'number' }),
    endDocumentId: bigint('end_document_id', { mode: 'number' }),
    /** Gán tay không qua quyết định thì phải nói vì sao */
    note: text('note'),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('position_assignments_kind_check', sql`${t.kind} IN ('chinh','kiem-nhiem')`),
    check(
      'position_assignments_range_check',
      sql`${t.toDate} IS NULL OR ${t.toDate} >= ${t.fromDate}`,
    ),
    check(
      'position_assignments_basis_check',
      sql`${t.documentId} IS NOT NULL OR ${t.note} IS NOT NULL`,
    ),
    // Một người một chức danh CHÍNH đang mở — kiêm nhiệm thì bao nhiêu cũng được
    uniqueIndex('position_assignments_one_main')
      .on(t.staffId)
      .where(sql`kind = 'chinh' AND to_date IS NULL`),
    uniqueIndex('position_assignments_no_dup')
      .on(t.staffId, t.positionId)
      .where(sql`to_date IS NULL`),
    index('position_assignments_position_idx').on(t.positionId, t.fromDate),
  ],
)
