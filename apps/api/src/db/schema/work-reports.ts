import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { shiftTemplates } from './hr'
import { branches, staff } from './identity'
import { orders } from './ordering'
import { positions } from './org'

/**
 * ====== BÁO CÁO CÔNG VIỆC ======
 *
 * Mẫu báo cáo (trường + lịch nộp + ai nộp) theo từng chi nhánh; mỗi SUẤT (ngày,
 * ca, tuần, tháng) một bản. "Báo cáo còn thiếu" không lưu: suất phải nộp tính lúc
 * đọc từ mẫu + lịch đã công bố, bản nào chưa có là thiếu.
 *
 * Bản nộp chụp lại danh sách trường của mẫu (`fields_snapshot`) và đóng băng số
 * tự điền (`auto_values`) — sửa mẫu hôm nay không làm đổi báo cáo hôm qua.
 */
export const reportTemplates = pgTable(
  'report_templates',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    cadence: text('cadence').notNull().$type<'ca' | 'ngay' | 'tuan' | 'thang'>(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    /** Tăng mỗi lần đổi trường — bản nộp ghi version để đọc lại đúng mẫu lúc đó */
    version: integer('version').notNull().default(1),
    fields: jsonb('fields').notNull(),
    /** Theo ca: chỉ các ca mẫu này; rỗng = mọi ca đã công bố */
    shiftTemplateIds: bigint('shift_template_ids', { mode: 'number' })
      .array()
      .notNull()
      .default(sql`'{}'::bigint[]`),
    /**
     * Theo ca: phút sau giờ kết ca. Theo ngày: phút kể từ 00:00 ngày báo cáo. Tuần /
     * tháng: phút kể từ 00:00 ngày đầu kỳ SAU.
     */
    dueOffsetMinutes: integer('due_offset_minutes').notNull(),
    reviewMode: text('review_mode').notNull().$type<'cap-tren' | 'ca-sau' | 'khong'>(),
    /** Nộp được trên Kênh nhân viên — mẫu có trường tiền thì không (service chặn) */
    kenhNv: boolean('kenh_nv').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('report_templates_cadence_check', sql`${t.cadence} IN ('ca','ngay','tuan','thang')`),
    check(
      'report_templates_review_mode_check',
      sql`${t.reviewMode} IN ('cap-tren','ca-sau','khong')`,
    ),
    check('report_templates_fields_check', sql`jsonb_typeof(${t.fields}) = 'array'`),
    check('report_templates_due_check', sql`${t.dueOffsetMinutes} BETWEEN 0 AND 4320`),
    uniqueIndex('report_templates_branch_code').on(t.branchId, t.code),
  ],
)

/** Ghế nộp báo cáo: `nop` = người chịu trách nhiệm, `du-phong` = nộp thay khi vắng */
export const reportTemplatePositions = pgTable(
  'report_template_positions',
  {
    templateId: bigint('template_id', { mode: 'number' })
      .notNull()
      .references(() => reportTemplates.id),
    positionId: bigint('position_id', { mode: 'number' })
      .notNull()
      .references(() => positions.id),
    role: text('role').notNull().$type<'nop' | 'du-phong'>(),
  },
  (t) => [
    primaryKey({ columns: [t.templateId, t.positionId] }),
    check('report_template_positions_role_check', sql`${t.role} IN ('nop','du-phong')`),
  ],
)

export const workReports = pgTable(
  'work_reports',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    templateId: bigint('template_id', { mode: 'number' })
      .notNull()
      .references(() => reportTemplates.id),
    templateVersion: integer('template_version').notNull(),
    fieldsSnapshot: jsonb('fields_snapshot').notNull(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    /** Ngày đầu kỳ, giờ chi nhánh */
    businessDate: date('business_date').notNull(),
    shiftTemplateId: bigint('shift_template_id', { mode: 'number' }).references(
      () => shiftTemplates.id,
    ),
    /** `2026-10-22` (ngày, ca) · `2026-W43` · `2026-10` */
    periodKey: text('period_key').notNull(),
    state: text('state').notNull().default('draft').$type<'draft' | 'submitted' | 'reviewed'>(),
    values: jsonb('values')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Đóng băng lúc nộp — null khi còn nháp */
    autoValues: jsonb('auto_values'),
    authorId: bigint('author_id', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    channel: text('channel').$type<'office' | 'kenh-nv'>(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    onTime: boolean('on_time'),
    reviewedBy: bigint('reviewed_by', { mode: 'number' }).references(() => staff.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('work_reports_state_check', sql`${t.state} IN ('draft','submitted','reviewed')`),
    check(
      'work_reports_channel_check',
      sql`${t.channel} IS NULL OR ${t.channel} IN ('office','kenh-nv')`,
    ),
    check(
      'work_reports_submitted_check',
      sql`${t.state} = 'draft'
          OR (${t.submittedAt} IS NOT NULL AND ${t.autoValues} IS NOT NULL
              AND ${t.channel} IS NOT NULL AND ${t.onTime} IS NOT NULL)`,
    ),
    check(
      'work_reports_reviewed_check',
      sql`(${t.state} = 'reviewed') = (${t.reviewedBy} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL)`,
    ),
    // Không ai tự xác nhận báo cáo của chính mình
    check(
      'work_reports_review_not_self',
      sql`${t.reviewedBy} IS NULL OR ${t.reviewedBy} <> ${t.authorId}`,
    ),
    uniqueIndex('work_reports_one_per_slot').on(
      t.templateId,
      t.periodKey,
      sql`coalesce(${t.shiftTemplateId}, 0)`,
    ),
    index('work_reports_branch_date_idx').on(t.branchId, t.businessDate),
  ],
)

/** Bổ sung sau khi nộp — chỉ thêm, không sửa bản đã nộp */
export const workReportAddenda = pgTable(
  'work_report_addenda',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    reportId: bigint('report_id', { mode: 'number' })
      .notNull()
      .references(() => workReports.id),
    authorId: bigint('author_id', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('work_report_addenda_body_check', sql`length(${t.body}) BETWEEN 1 AND 4000`),
    index('work_report_addenda_report_idx').on(t.reportId),
  ],
)

/**
 * ====== SỰ CỐ ======
 *
 * Ai cũng báo được (Kênh nhân viên), người xử lý điều tra, giao việc khắc phục,
 * khai báo ra ngoài khi luật đòi, rồi đóng. Mã `SC-yyMM-NNNN` theo chi nhánh.
 */
export const incidents = pgTable(
  'incidents',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    code: text('code').notNull().unique(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    category: text('category')
      .notNull()
      .$type<
        | 'tai-nan-lao-dong'
        | 'an-toan-thuc-pham'
        | 'khieu-nai-nghiem-trong'
        | 'hong-thiet-bi'
        | 'an-ninh-mat-mat'
        | 'chay-no'
        | 'khac'
      >(),
    severity: text('severity')
      .notNull()
      .$type<'nhe' | 'trung-binh' | 'nghiem-trong' | 'rat-nghiem-trong'>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    businessDate: date('business_date').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    immediateAction: text('immediate_action'),
    injuredCount: integer('injured_count').notNull().default(0),
    customerInvolved: boolean('customer_involved').notNull().default(false),
    orderId: bigint('order_id', { mode: 'number' }).references(() => orders.id),
    rootCause: text('root_cause'),
    correctiveAction: text('corrective_action'),
    lossEstimateVnd: bigint('loss_estimate_vnd', { mode: 'number' }),
    externalReportRequired: boolean('external_report_required').notNull().default(false),
    externalReportedAt: timestamp('external_reported_at', { withTimezone: true }),
    externalReportRef: text('external_report_ref'),
    evidenceUrls: text('evidence_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    state: text('state').notNull().default('open').$type<'open' | 'investigating' | 'closed'>(),
    reportedBy: bigint('reported_by', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    ownerId: bigint('owner_id', { mode: 'number' }).references(() => staff.id),
    closedBy: bigint('closed_by', { mode: 'number' }).references(() => staff.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closeNote: text('close_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'incidents_category_check',
      sql`${t.category} IN ('tai-nan-lao-dong','an-toan-thuc-pham','khieu-nai-nghiem-trong',
                            'hong-thiet-bi','an-ninh-mat-mat','chay-no','khac')`,
    ),
    check(
      'incidents_severity_check',
      sql`${t.severity} IN ('nhe','trung-binh','nghiem-trong','rat-nghiem-trong')`,
    ),
    check('incidents_state_check', sql`${t.state} IN ('open','investigating','closed')`),
    check('incidents_time_check', sql`${t.occurredAt} <= ${t.reportedAt}`),
    check(
      'incidents_numbers_check',
      sql`${t.injuredCount} >= 0 AND (${t.lossEstimateVnd} IS NULL OR ${t.lossEstimateVnd} >= 0)
          AND cardinality(${t.evidenceUrls}) <= 10`,
    ),
    // TNLĐ, ATTP, cháy nổ mức nghiêm trọng trở lên BẮT BUỘC khai báo ra ngoài
    check(
      'incidents_external_check',
      sql`${t.externalReportRequired}
          OR NOT (${t.category} IN ('tai-nan-lao-dong','an-toan-thuc-pham','chay-no')
                  AND ${t.severity} IN ('nghiem-trong','rat-nghiem-trong'))`,
    ),
    // Đóng phải có nguyên nhân gốc, biện pháp, và mốc khai báo ra ngoài nếu bắt buộc
    check(
      'incidents_closed_check',
      sql`${t.state} <> 'closed'
          OR (${t.rootCause} IS NOT NULL AND ${t.correctiveAction} IS NOT NULL
              AND ${t.closedBy} IS NOT NULL AND ${t.closedAt} IS NOT NULL
              AND (NOT ${t.externalReportRequired} OR ${t.externalReportedAt} IS NOT NULL))`,
    ),
    // Sự cố nghiêm trọng: người đóng không phải người báo
    check(
      'incidents_close_not_self',
      sql`${t.state} <> 'closed' OR ${t.severity} IN ('nhe','trung-binh')
          OR ${t.closedBy} <> ${t.reportedBy}`,
    ),
    index('incidents_branch_state_idx').on(t.branchId, t.state),
  ],
)
