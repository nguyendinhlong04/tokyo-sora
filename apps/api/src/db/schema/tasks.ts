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
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { shiftTemplates } from './hr'
import { branches, staff } from './identity'
import { orgDocuments, positions } from './org'

/**
 * ====== VIỆC: GIAO TAY VÀ ĐỊNH KỲ (SOP) ======
 *
 * Một bảng `tasks` cho cả hai nguồn. Việc giao tay đi tới một NGƯỜI. Việc định kỳ
 * sinh từ `task_templates` và đi tới một CHỨC DANH: ai giữ chức danh và có ca đã
 * công bố đúng ngày thì thấy — người nghỉ ca không bị đòi checklist mở ca.
 *
 * Không có cron (Vercel): việc định kỳ sinh LƯỜI lúc có người đọc, bằng
 * `INSERT … ON CONFLICT DO NOTHING` trên (mẫu, ngày) — năm máy cùng mở hộp việc
 * một lúc cũng chỉ ra một việc. Tiêu đề và checklist đóng băng vào việc lúc sinh:
 * sửa mẫu hôm nay không làm đổi việc đã giao hôm qua.
 */

export const taskTemplates = pgTable(
  'task_templates',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** null = việc của văn phòng, không theo ca chi nhánh */
    branchId: text('branch_id').references(() => branches.id),
    title: text('title').notNull(),
    note: text('note'),
    checklist: text('checklist')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    assigneePositionId: bigint('assignee_position_id', { mode: 'number' })
      .notNull()
      .references(() => positions.id),
    /** Ghế nghiệm thu — để trống thì nộp là xong */
    reviewerPositionId: bigint('reviewer_position_id', { mode: 'number' }).references(
      () => positions.id,
    ),
    recurrence: text('recurrence')
      .notNull()
      .$type<'hang-ngay' | 'hang-tuan' | 'hang-thang' | 'theo-ca'>(),
    /** Hằng tuần: 1 = Thứ Hai … 7 = Chủ nhật (ISO) */
    weekday: smallint('weekday'),
    /** Hằng tháng: 1..28 — tháng Hai không có ngày 30 */
    monthDay: smallint('month_day'),
    shiftTemplateId: bigint('shift_template_id', { mode: 'number' }).references(
      () => shiftTemplates.id,
    ),
    /** Phút kể từ 00:00 giờ chi nhánh (tới 30:00 cho ca vắt đêm); theo ca để trống = giờ kết ca */
    dueMinute: integer('due_minute'),
    priority: text('priority').notNull().default('thuong').$type<'thuong' | 'gap'>(),
    /** Văn bản hướng dẫn (quy trình chi tiết) — tuỳ chọn */
    documentId: bigint('document_id', { mode: 'number' }).references(() => orgDocuments.id),
    startsOn: date('starts_on').notNull(),
    active: boolean('active').notNull().default(true),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'task_templates_recurrence_check',
      sql`${t.recurrence} IN ('hang-ngay','hang-tuan','hang-thang','theo-ca')`,
    ),
    check(
      'task_templates_shape_check',
      sql`(${t.recurrence} = 'hang-tuan') = (${t.weekday} IS NOT NULL)
          AND (${t.weekday} IS NULL OR ${t.weekday} BETWEEN 1 AND 7)
          AND (${t.recurrence} = 'hang-thang') = (${t.monthDay} IS NOT NULL)
          AND (${t.monthDay} IS NULL OR ${t.monthDay} BETWEEN 1 AND 28)
          AND (${t.recurrence} = 'theo-ca') = (${t.shiftTemplateId} IS NOT NULL)
          AND (${t.recurrence} <> 'theo-ca' OR ${t.branchId} IS NOT NULL)
          AND (${t.recurrence} = 'theo-ca' OR ${t.dueMinute} IS NOT NULL)
          AND (${t.dueMinute} IS NULL OR ${t.dueMinute} BETWEEN 0 AND 1800)`,
    ),
    check(
      'task_templates_reviewer_check',
      sql`${t.reviewerPositionId} IS NULL OR ${t.reviewerPositionId} <> ${t.assigneePositionId}`,
    ),
    check('task_templates_checklist_check', sql`cardinality(${t.checklist}) <= 30`),
    check('task_templates_priority_check', sql`${t.priority} IN ('thuong','gap')`),
    index('task_templates_branch_idx').on(t.branchId, t.active),
  ],
)

export const tasks = pgTable(
  'tasks',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id').references(() => branches.id),
    title: text('title').notNull(),
    note: text('note'),
    priority: text('priority').notNull().default('thuong').$type<'thuong' | 'gap'>(),
    assigneeStaffId: bigint('assignee_staff_id', { mode: 'number' }).references(() => staff.id),
    assigneePositionId: bigint('assignee_position_id', { mode: 'number' }).references(
      () => positions.id,
    ),
    reviewerStaffId: bigint('reviewer_staff_id', { mode: 'number' }).references(() => staff.id),
    reviewerPositionId: bigint('reviewer_position_id', { mode: 'number' }).references(
      () => positions.id,
    ),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    state: text('state')
      .notNull()
      .default('open')
      .$type<'open' | 'submitted' | 'done' | 'cancelled'>(),
    /** Người nhận bấm "Nhận việc" — để người giao biết việc đã tới tay */
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    templateId: bigint('template_id', { mode: 'number' }).references(() => taskTemplates.id),
    occurrenceDate: date('occurrence_date'),
    /** Việc theo ca: ca nào — người thấy việc là người đứng đúng ca này */
    shiftTemplateId: bigint('shift_template_id', { mode: 'number' }).references(
      () => shiftTemplates.id,
    ),
    /** Nguồn: khiếu nại B13, sự cố, báo cáo, văn bản */
    entity: text('entity').$type<'feedback' | 'incident' | 'work-report' | 'document'>(),
    entityId: bigint('entity_id', { mode: 'number' }),
    attachments: jsonb('attachments')
      .notNull()
      .default(sql`'[]'::jsonb`),
    resultNote: text('result_note'),
    submittedBy: bigint('submitted_by', { mode: 'number' }).references(() => staff.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    doneBy: bigint('done_by', { mode: 'number' }).references(() => staff.id),
    doneAt: timestamp('done_at', { withTimezone: true }),
    reviewedBy: bigint('reviewed_by', { mode: 'number' }).references(() => staff.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Lời nghiệm thu, hoặc lý do trả lại */
    managerNote: text('manager_note'),
    cancelledBy: bigint('cancelled_by', { mode: 'number' }).references(() => staff.id),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    /** null = sinh từ mẫu định kỳ */
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('tasks_state_check', sql`${t.state} IN ('open','submitted','done','cancelled')`),
    check('tasks_priority_check', sql`${t.priority} IN ('thuong','gap')`),
    check(
      'tasks_assignee_check',
      sql`${t.assigneeStaffId} IS NOT NULL OR ${t.assigneePositionId} IS NOT NULL`,
    ),
    check(
      'tasks_reviewer_check',
      sql`${t.reviewerStaffId} IS NULL OR ${t.reviewerPositionId} IS NULL`,
    ),
    // Không ai tự nghiệm thu: không giao cho mình nghiệm thu việc của mình, và
    // người bấm "Đạt" không bao giờ là người đã nộp
    check(
      'tasks_review_not_self',
      sql`(${t.reviewerStaffId} IS NULL OR ${t.assigneeStaffId} IS NULL
             OR ${t.reviewerStaffId} <> ${t.assigneeStaffId})
          AND (${t.reviewerPositionId} IS NULL OR ${t.assigneePositionId} IS NULL
             OR ${t.reviewerPositionId} <> ${t.assigneePositionId})
          AND (${t.reviewedBy} IS NULL OR ${t.submittedBy} IS NULL
             OR ${t.reviewedBy} <> ${t.submittedBy})`,
    ),
    check('tasks_occurrence_check', sql`(${t.templateId} IS NULL) = (${t.occurrenceDate} IS NULL)`),
    check(
      'tasks_entity_check',
      sql`(${t.entity} IS NULL) = (${t.entityId} IS NULL)
          AND (${t.entity} IS NULL OR ${t.entity} IN ('feedback','incident','work-report','document'))`,
    ),
    check(
      'tasks_attachments_check',
      sql`jsonb_typeof(${t.attachments}) = 'array' AND jsonb_array_length(${t.attachments}) <= 10`,
    ),
    check(
      'tasks_submitted_check',
      sql`${t.state} <> 'submitted' OR (${t.submittedAt} IS NOT NULL AND ${t.submittedBy} IS NOT NULL)`,
    ),
    check(
      'tasks_done_check',
      sql`${t.state} <> 'done' OR (${t.doneAt} IS NOT NULL AND ${t.doneBy} IS NOT NULL)`,
    ),
    check(
      'tasks_cancel_check',
      sql`(${t.state} = 'cancelled')
          = (${t.cancelledAt} IS NOT NULL AND ${t.cancelledBy} IS NOT NULL AND ${t.cancelReason} IS NOT NULL)`,
    ),
    uniqueIndex('tasks_one_per_occurrence').on(t.templateId, t.occurrenceDate),
    index('tasks_assignee_open_idx')
      .on(t.assigneeStaffId)
      .where(sql`state IN ('open','submitted')`),
    index('tasks_position_open_idx')
      .on(t.assigneePositionId, t.occurrenceDate)
      .where(sql`state IN ('open','submitted')`),
    index('tasks_branch_due_idx').on(t.branchId, t.dueAt),
    index('tasks_entity_idx').on(t.entity, t.entityId),
  ],
)

/**
 * Checklist của một việc. Việc định kỳ có nhiều người cùng ca làm chung một
 * checklist, nên MỖI MỤC ghi ai tích — nghiệm thu thấy ai làm phần nào.
 */
export const taskCheckItems = pgTable(
  'task_check_items',
  {
    taskId: bigint('task_id', { mode: 'number' })
      .notNull()
      .references(() => tasks.id),
    idx: smallint('idx').notNull(),
    label: text('label').notNull(),
    checkedBy: bigint('checked_by', { mode: 'number' }).references(() => staff.id),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.idx] }),
    check('task_check_items_idx_check', sql`${t.idx} BETWEEN 0 AND 29`),
    check(
      'task_check_items_checked_check',
      sql`(${t.checkedBy} IS NULL) = (${t.checkedAt} IS NULL)`,
    ),
  ],
)
