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
import { employees } from './hr'
import { branches, staff } from './identity'
import { orgUnits, positions } from './org'

/**
 * ====== KPI ======
 *
 * Bộ KPI theo CHỨC DANH (chỉ số trong danh mục code + trọng số + chỉ tiêu mặc
 * định). Kỳ KPI theo chi nhánh: mở kỳ là dựng phiếu cho từng người, chụp lại chức
 * danh, bộ KPI và người đánh giá (cấp trên trực tiếp lúc đó); luật chấm và mức
 * thưởng ĐÓNG BĂNG vào kỳ (`rules`) — đổi A6 giữa kỳ không làm đổi kỳ đang chạy.
 * Chốt kỳ là đóng băng phiếu (trigger 9012), chỉ còn nhân viên ghi ý kiến được.
 */
export const kpiTemplates = pgTable(
  'kpi_templates',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    positionId: bigint('position_id', { mode: 'number' })
      .notNull()
      .references(() => positions.id),
    /** Chi nhánh của ghế; null = ghế văn phòng */
    branchId: text('branch_id').references(() => branches.id),
    version: integer('version').notNull().default(1),
    active: boolean('active').notNull().default(true),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('kpi_templates_one_active')
      .on(t.positionId)
      .where(sql`active`),
  ],
)

export const kpiTemplateItems = pgTable(
  'kpi_template_items',
  {
    templateId: bigint('template_id', { mode: 'number' })
      .notNull()
      .references(() => kpiTemplates.id),
    metricCode: text('metric_code').notNull(),
    weightPct: smallint('weight_pct').notNull(),
    defaultTargetMilli: bigint('default_target_milli', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.templateId, t.metricCode] }),
    check('kpi_template_items_weight_check', sql`${t.weightPct} BETWEEN 1 AND 100`),
  ],
)

export const kpiCycles = pgTable(
  'kpi_cycles',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    kind: text('kind').notNull().$type<'thang' | 'quy'>(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    state: text('state').notNull().default('draft').$type<'draft' | 'open' | 'review' | 'closed'>(),
    /** Luật chấm + mức thưởng chụp lúc mở kỳ */
    rules: jsonb('rules'),
    /** Quy chế thưởng công bố trước kỳ (Điều 104) — đường dẫn https */
    policyUrl: text('policy_url'),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    openedBy: bigint('opened_by', { mode: 'number' }).references(() => staff.id),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    reviewStartedBy: bigint('review_started_by', { mode: 'number' }).references(() => staff.id),
    reviewStartedAt: timestamp('review_started_at', { withTimezone: true }),
    closedBy: bigint('closed_by', { mode: 'number' }).references(() => staff.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    lastComputedAt: timestamp('last_computed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('kpi_cycles_kind_check', sql`${t.kind} IN ('thang','quy')`),
    check('kpi_cycles_state_check', sql`${t.state} IN ('draft','open','review','closed')`),
    check('kpi_cycles_range_check', sql`${t.periodEnd} > ${t.periodStart}`),
    // Mỗi bước có người và mốc; kỳ đã mở thì phải có luật chấm đóng băng
    check(
      'kpi_cycles_order_check',
      sql`(${t.state} = 'draft' OR (${t.openedAt} IS NOT NULL AND ${t.rules} IS NOT NULL))
          AND (${t.state} NOT IN ('review','closed') OR ${t.reviewStartedAt} IS NOT NULL)
          AND (${t.state} <> 'closed' OR (${t.closedAt} IS NOT NULL AND ${t.closedBy} IS NOT NULL))`,
    ),
    uniqueIndex('kpi_cycles_one_per_range').on(t.branchId, t.periodStart, t.periodEnd),
  ],
)

export const kpiReviews = pgTable(
  'kpi_reviews',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    cycleId: bigint('cycle_id', { mode: 'number' })
      .notNull()
      .references(() => kpiCycles.id),
    staffId: bigint('staff_id', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    employeeId: bigint('employee_id', { mode: 'number' })
      .notNull()
      .references(() => employees.id),
    /** Chụp lúc dựng phiếu: ghế, tên ghế, đơn vị, bộ KPI, người đánh giá */
    positionId: bigint('position_id', { mode: 'number' }).references(() => positions.id),
    positionTitle: text('position_title'),
    unitId: bigint('unit_id', { mode: 'number' }).references(() => orgUnits.id),
    templateId: bigint('template_id', { mode: 'number' }).references(() => kpiTemplates.id),
    reviewerId: bigint('reviewer_id', { mode: 'number' }).references(() => staff.id),
    exempt: boolean('exempt').notNull().default(false),
    exemptReason: text('exempt_reason'),
    selfComment: text('self_comment'),
    selfSubmittedAt: timestamp('self_submitted_at', { withTimezone: true }),
    managerComment: text('manager_comment'),
    finalizedBy: bigint('finalized_by', { mode: 'number' }).references(() => staff.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    scoreMilli: bigint('score_milli', { mode: 'number' }),
    coverageMilli: integer('coverage_milli'),
    grade: text('grade').$type<'A' | 'B' | 'C' | 'D'>(),
    /** Chỉ người có `payroll.view-others` đọc — service không SELECT cột này cho ai khác */
    suggestedBonusVnd: bigint('suggested_bonus_vnd', { mode: 'number' }),
    bonusBasis: text('bonus_basis'),
    employeeAckAt: timestamp('employee_ack_at', { withTimezone: true }),
    employeeFeedback: text('employee_feedback'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('kpi_reviews_grade_check', sql`${t.grade} IS NULL OR ${t.grade} IN ('A','B','C','D')`),
    // Không ai tự chấm KPI của mình, không ai tự chốt phiếu của mình
    check('kpi_reviews_not_self', sql`${t.reviewerId} IS NULL OR ${t.reviewerId} <> ${t.staffId}`),
    check(
      'kpi_reviews_finalizer_not_self',
      sql`${t.finalizedBy} IS NULL OR ${t.finalizedBy} <> ${t.staffId}`,
    ),
    check('kpi_reviews_exempt_check', sql`NOT ${t.exempt} OR ${t.exemptReason} IS NOT NULL`),
    check(
      'kpi_reviews_bonus_check',
      sql`${t.suggestedBonusVnd} IS NULL OR ${t.suggestedBonusVnd} >= 0`,
    ),
    uniqueIndex('kpi_reviews_one_per_cycle').on(t.cycleId, t.staffId),
    index('kpi_reviews_reviewer_idx').on(t.reviewerId),
  ],
)

export const kpiReviewItems = pgTable(
  'kpi_review_items',
  {
    reviewId: bigint('review_id', { mode: 'number' })
      .notNull()
      .references(() => kpiReviews.id),
    metricCode: text('metric_code').notNull(),
    /** Chụp nhãn, đơn vị, hướng, nguồn: danh mục code đổi về sau thì phiếu cũ vẫn đọc đúng */
    label: text('label').notNull(),
    unit: text('unit').notNull(),
    direction: text('direction').notNull().$type<'cao' | 'thap'>(),
    source: text('source').notNull().$type<'tu-dong' | 'nhap-tay' | 'phieu-kiem-tra'>(),
    weightPct: smallint('weight_pct').notNull(),
    targetMilli: bigint('target_milli', { mode: 'number' }).notNull(),
    targetSource: text('target_source').notNull().default('mau').$type<'mau' | 'ca-nhan'>(),
    targetNote: text('target_note'),
    actualMilli: bigint('actual_milli', { mode: 'number' }),
    sampleCount: integer('sample_count'),
    selfScore: smallint('self_score'),
    managerScore: smallint('manager_score'),
    excludedReason: text('excluded_reason'),
    excludedBy: bigint('excluded_by', { mode: 'number' }).references(() => staff.id),
    achievementMilli: integer('achievement_milli'),
    contributionMilli: integer('contribution_milli'),
  },
  (t) => [
    primaryKey({ columns: [t.reviewId, t.metricCode] }),
    check('kpi_review_items_direction_check', sql`${t.direction} IN ('cao','thap')`),
    check(
      'kpi_review_items_score_check',
      sql`(${t.selfScore} IS NULL OR ${t.selfScore} BETWEEN 1 AND 5)
          AND (${t.managerScore} IS NULL OR ${t.managerScore} BETWEEN 1 AND 5)`,
    ),
    // Chỉ tiêu riêng cho một người phải nói vì sao
    check(
      'kpi_review_items_target_check',
      sql`${t.targetSource} = 'mau' OR ${t.targetNote} IS NOT NULL`,
    ),
    check(
      'kpi_review_items_excluded_check',
      sql`(${t.excludedReason} IS NULL) = (${t.excludedBy} IS NULL)`,
    ),
  ],
)

/** Phiếu kiểm tra (N11): vệ sinh ATTP, khách bí mật — nguồn của chỉ số `nt.*` */
export const kpiObservations = pgTable(
  'kpi_observations',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    kind: text('kind').notNull().$type<'ve-sinh' | 'khach-bi-mat'>(),
    observedOn: date('observed_on').notNull(),
    scoreMilli: integer('score_milli').notNull(),
    evidenceUrl: text('evidence_url').notNull(),
    note: text('note'),
    observerId: bigint('observer_id', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: bigint('voided_by', { mode: 'number' }).references(() => staff.id),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('kpi_observations_kind_check', sql`${t.kind} IN ('ve-sinh','khach-bi-mat')`),
    check('kpi_observations_score_check', sql`${t.scoreMilli} BETWEEN 0 AND 100000`),
    check('kpi_observations_evidence_check', sql`${t.evidenceUrl} ~ '^https://'`),
    check(
      'kpi_observations_void_check',
      sql`(${t.voidedAt} IS NULL) = (${t.voidedBy} IS NULL)
          AND (${t.voidedAt} IS NULL OR ${t.voidReason} IS NOT NULL)`,
    ),
    index('kpi_observations_branch_idx').on(t.branchId, t.observedOn),
  ],
)
