import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  SOP_OPENING_GRACE_MINUTES,
  STANDARD_SOPS,
  type AssignableStaff,
  type DocAttachment,
  type MyTasks,
  type StandardSeat,
  type TaskDetail,
  type TaskEntity,
  type TaskPriority,
  type TaskRecurrence,
  type TaskRow,
  type TaskTemplateView,
} from '@sora/contracts'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { businessDateOf, startOfBusinessDay } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { isRestrictViolation } from '../../common/pg-error'
import type { Db } from '../../db/client'
import {
  branches,
  employees,
  feedback,
  incidents,
  orgDocuments,
  orgUnits,
  positions,
  scheduleEntries,
  shiftTemplates,
  staff,
  taskCheckItems,
  taskTemplates,
  tasks,
  workReports,
} from '../../db/schema'
import type { Actor, StaffActor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { branchOfUnit, inScope, scopeOf, type OrgSnapshot, type Scope } from './domain/org'
import {
  addDays,
  canChangeDue,
  checkSubmit,
  dueMinuteOf,
  isOverdue,
  nextState,
  occursOn,
  sortMine,
} from './domain/tasks'
import { ORG_TZ, OrgService, requireStaff, todayVN } from './org.service'

export interface TaskInput {
  title: string
  note: string | null
  priority: TaskPriority
  assigneeStaffIds: number[]
  /** undefined = người giao tự nghiệm thu · null = nộp là xong */
  reviewerStaffId?: number | null
  dueAt: Date
  checklist: string[]
  attachments: DocAttachment[]
  entity: TaskEntity | null
  entityId: number | null
}

export interface TaskPatch {
  title?: string
  note?: string | null
  priority?: TaskPriority
  dueAt?: Date
  attachments?: DocAttachment[]
}

export interface TemplateInput {
  title: string
  note: string | null
  checklist: string[]
  assigneePositionId: number
  reviewerPositionId: number | null
  recurrence: TaskRecurrence
  weekday: number | null
  monthDay: number | null
  shiftTemplateId: number | null
  dueMinute: number | null
  priority: TaskPriority
  documentId: number | null
  startsOn: string | null
  active: boolean
}

export type TaskView = 'assigned' | 'unit' | 'to-review' | 'sop'

type TaskRec = typeof tasks.$inferSelect
type ShiftRec = typeof shiftTemplates.$inferSelect

const conflict = (code: string, message: string) => new ConflictException({ code, message })
const forbidden = (code: string, message: string) => new ForbiddenException({ code, message })
const taskNotFound = () =>
  new NotFoundException({ code: 'task_not_found', message: 'Không có việc này' })

const DAY_MS = 86_400_000
/** Hộp việc hỏi mỗi phút; sinh việc định kỳ thưa hơn thế là đủ */
const MATERIALIZE_EVERY_MS = 60_000
/** Khoảng xem tối đa ở N5 — rộng hơn thì thành báo cáo, không còn là danh sách việc */
const MAX_RANGE_DAYS = 62

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

export const shiftLabelOf = (s: { name: string; startMinute: number; endMinute: number }) =>
  `${s.name} ${hhmm(s.startMinute)}–${hhmm(s.endMinute)}`

const iso = (at: Date | null) => at?.toISOString() ?? null

function uniq(values: (number | null)[]): number[] {
  return [...new Set(values.filter((v): v is number => v !== null))]
}

/**
 * Giao việc, việc định kỳ (SOP) và việc "của tôi".
 *
 * Phạm vi theo sơ đồ (`scopeOf(…, 'task')`): giao cho người trong cây con mình làm
 * trưởng, quản lý ca thì cả chi nhánh; R10 · R11 cả chuỗi. Không ai tự giao việc
 * cho mình hay tự nghiệm thu việc mình đã nộp — CSDL cũng chặn (tasks_review_not_self).
 */
@Injectable()
export class TasksService {
  /** Mốc lần sinh việc định kỳ gần nhất của instance này */
  private lastMaterialized = 0

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly org: OrgService,
    private readonly audit: AuditService,
  ) {}

  // ============================================================ Sinh lười

  /**
   * Sinh việc định kỳ của hôm qua và hôm nay (giờ chi nhánh). Không có cron: hàm
   * này chạy đầu mọi lần đọc danh sách việc và hộp việc, và ngay sau khi tạo mẫu.
   *
   * `ON CONFLICT DO NOTHING` trên (mẫu, ngày) làm nó idempotent: năm máy cùng mở
   * hộp việc một lúc chỉ ra một việc. Checklist chỉ chèn cho việc VỪA sinh, trong
   * cùng transaction — không có việc nào thiếu checklist.
   *
   * Việc theo ca chỉ sinh khi ngày đó có ca ĐÃ CÔNG BỐ khớp ca mẫu: lịch nháp chưa
   * phải là cam kết, không ai bị đòi checklist của một ca chưa chốt.
   */
  async materialize(force = false): Promise<number> {
    const nowMs = Date.now()
    if (!force && nowMs - this.lastMaterialized < MATERIALIZE_EVERY_MS) return 0
    this.lastMaterialized = nowMs

    const templates = await this.db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.active, true))
    if (templates.length === 0) return 0

    const zones = new Map(
      (await this.db.select({ id: branches.id, timezone: branches.timezone }).from(branches)).map(
        (b) => [b.id, b.timezone],
      ),
    )
    const now = new Date(nowMs)
    const shiftIds = uniq(templates.map((t) => t.shiftTemplateId))
    const shifts = new Map<number, ShiftRec>(
      shiftIds.length === 0
        ? []
        : (
            await this.db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds))
          ).map((s) => [s.id, s]),
    )

    // Ca đã công bố quanh cửa sổ (±1 ngày cho chênh múi giờ) của các chi nhánh có việc theo ca
    const shiftBranches = [
      ...new Set(
        templates.filter((t) => t.recurrence === 'theo-ca' && t.branchId).map((t) => t.branchId!),
      ),
    ]
    const today = todayVN()
    const published =
      shiftBranches.length === 0
        ? []
        : await this.db
            .selectDistinct({
              branchId: scheduleEntries.branchId,
              workDate: scheduleEntries.workDate,
              templateId: scheduleEntries.templateId,
              startMinute: scheduleEntries.startMinute,
              endMinute: scheduleEntries.endMinute,
            })
            .from(scheduleEntries)
            .where(
              and(
                inArray(scheduleEntries.branchId, shiftBranches),
                eq(scheduleEntries.state, 'published'),
                gte(scheduleEntries.workDate, addDays(today, -2)),
                lte(scheduleEntries.workDate, addDays(today, 1)),
              ),
            )
    // Ô lịch cũ chưa gắn ca mẫu (H2 trước khi sửa) khớp theo giờ vào/ra
    const hasShift = (branchId: string, date: string, shift: ShiftRec) =>
      published.some(
        (p) =>
          p.branchId === branchId &&
          p.workDate === date &&
          (p.templateId === shift.id ||
            (p.templateId === null &&
              p.startMinute === shift.startMinute &&
              p.endMinute === shift.endMinute)),
      )

    const rows: (typeof tasks.$inferInsert)[] = []
    for (const t of templates) {
      const tz = (t.branchId && zones.get(t.branchId)) || ORG_TZ
      const local = businessDateOf(now, tz)
      const shift = t.shiftTemplateId !== null ? (shifts.get(t.shiftTemplateId) ?? null) : null
      for (const date of [addDays(local, -1), local]) {
        if (!occursOn(t, date)) continue
        if (t.recurrence === 'theo-ca' && (!shift || !hasShift(t.branchId!, date, shift))) continue
        const dueMinute = dueMinuteOf(t, shift)
        if (dueMinute === null) continue
        rows.push({
          branchId: t.branchId,
          title: t.title,
          note: t.note,
          priority: t.priority,
          assigneePositionId: t.assigneePositionId,
          reviewerPositionId: t.reviewerPositionId,
          dueAt: new Date(startOfBusinessDay(date, tz).getTime() + dueMinute * 60_000),
          templateId: t.id,
          occurrenceDate: date,
          shiftTemplateId: t.shiftTemplateId,
        })
      }
    }
    if (rows.length === 0) return 0

    const checklistOf = new Map(templates.map((t) => [t.id, t.checklist]))
    return this.db.transaction(async (tx) => {
      const created = await tx
        .insert(tasks)
        .values(rows)
        .onConflictDoNothing({ target: [tasks.templateId, tasks.occurrenceDate] })
        .returning({ id: tasks.id, templateId: tasks.templateId })
      const items = created.flatMap((c) =>
        (checklistOf.get(c.templateId!) ?? []).map((label, idx) => ({ taskId: c.id, idx, label })),
      )
      if (items.length > 0) await tx.insert(taskCheckItems).values(items)
      return created.length
    })
  }

  // ============================================================ Ai thấy việc nào

  /**
   * Việc tới tay một người: giao đích danh, hoặc việc của chức danh người đó giữ
   * đúng ngày của việc VÀ có ca đã công bố ngày đó (việc theo ca: đúng ca đó).
   * Việc của văn phòng (không chi nhánh) thì chỉ cần giữ chức danh.
   */
  private assigneeVisible(staffId: number, since: string) {
    return sql`(
      ${tasks.assigneeStaffId} = ${staffId}
      OR (
        ${tasks.assigneePositionId} IS NOT NULL
        AND ${tasks.occurrenceDate} >= ${since}
        AND EXISTS (
          SELECT 1 FROM position_assignments pa
           WHERE pa.position_id = ${tasks.assigneePositionId}
             AND pa.staff_id = ${staffId}
             AND pa.from_date <= ${tasks.occurrenceDate}
             AND (pa.to_date IS NULL OR pa.to_date > ${tasks.occurrenceDate})
        )
        AND (
          ${tasks.branchId} IS NULL
          OR EXISTS (
            SELECT 1 FROM schedule_entries se
              JOIN employees e ON e.id = se.employee_id
              LEFT JOIN shift_templates st ON st.id = ${tasks.shiftTemplateId}
             WHERE e.staff_id = ${staffId}
               AND se.branch_id = ${tasks.branchId}
               AND se.work_date = ${tasks.occurrenceDate}
               AND se.state = 'published'
               AND (
                 ${tasks.shiftTemplateId} IS NULL
                 OR se.template_id = ${tasks.shiftTemplateId}
                 OR (se.template_id IS NULL
                     AND se.start_minute = st.start_minute
                     AND se.end_minute = st.end_minute)
               )
          )
        )
      )
    )`
  }

  /**
   * Người được CHỈ ĐỊNH nghiệm thu: đích danh, hoặc đang giữ ghế nghiệm thu. Không
   * bao giờ là người đã nộp — kể cả khi người đó kiêm cả hai ghế.
   */
  private reviewerVisible(staffId: number) {
    const today = todayVN()
    return sql`(
      (
        ${tasks.reviewerStaffId} = ${staffId}
        OR (
          ${tasks.reviewerPositionId} IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM position_assignments pa
             WHERE pa.position_id = ${tasks.reviewerPositionId}
               AND pa.staff_id = ${staffId}
               AND pa.from_date <= ${today}
               AND (pa.to_date IS NULL OR pa.to_date > ${today})
          )
        )
      )
      AND (${tasks.submittedBy} IS NULL OR ${tasks.submittedBy} <> ${staffId})
    )`
  }

  private async seesAsAssignee(staffId: number, taskId: number) {
    const [row] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), this.assigneeVisible(staffId, '1970-01-01')))
    return Boolean(row)
  }

  private async isDesignatedReviewer(staffId: number, taskId: number) {
    const [row] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), this.reviewerVisible(staffId)))
    return Boolean(row)
  }

  /** Quản lý theo sơ đồ: người làm (hoặc ghế được giao) nằm trong phạm vi của mình */
  private manages(scope: Scope, task: TaskRec, snap: OrgSnapshot): boolean {
    if (scope.chain) return true
    if (task.assigneeStaffId !== null) return inScope(scope, task.assigneeStaffId, snap)
    if (task.assigneePositionId !== null) {
      const position = snap.positions.get(task.assigneePositionId)
      return position !== undefined && scope.unitIds.has(position.unitId)
    }
    return false
  }

  // ============================================================ Office — N5 · N6

  async list(
    actor: Actor,
    q: { view: TaskView; from?: string; to?: string; branchId?: string; date?: string },
  ): Promise<TaskRow[]> {
    const me = requireStaff(actor)
    await this.materialize()
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'task', snap)

    if (q.view === 'sop') {
      const branchId = q.branchId
      if (!branchId) throw new BadRequestException('Chọn chi nhánh')
      if (!scope.chain && !scope.branchIds.has(branchId)) {
        throw forbidden('branch_out_of_scope', 'Chi nhánh này nằm ngoài phạm vi của bạn')
      }
      const rows = await this.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.branchId, branchId),
            isNotNull(tasks.templateId),
            eq(tasks.occurrenceDate, q.date ?? todayVN()),
          ),
        )
        .orderBy(asc(tasks.dueAt), asc(tasks.id))
      return this.toRows(rows)
    }

    if (q.view === 'to-review') {
      const submitted = await this.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.state, 'submitted'),
            or(isNull(tasks.submittedBy), sql`${tasks.submittedBy} <> ${me.staffId}`),
          ),
        )
        .orderBy(asc(tasks.dueAt))
      const designated = new Set(
        (
          await this.db
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.state, 'submitted'), this.reviewerVisible(me.staffId)))
        ).map((r) => r.id),
      )
      return this.toRows(
        submitted.filter((t) => designated.has(t.id) || this.manages(scope, t, snap)),
      )
    }

    const { start, end } = this.range(q.from, q.to)
    const inRange = and(gte(tasks.dueAt, start), lt(tasks.dueAt, end))
    if (q.view === 'assigned') {
      const rows = await this.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.createdBy, me.staffId), inRange))
        .orderBy(desc(tasks.dueAt))
      return this.toRows(rows)
    }
    // Đơn vị tôi: việc giao tay cho người trong phạm vi — việc định kỳ xem ở N6
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(isNull(tasks.templateId), inRange))
      .orderBy(desc(tasks.dueAt))
    return this.toRows(rows.filter((t) => this.manages(scope, t, snap)))
  }

  async detail(actor: Actor, id: number): Promise<TaskDetail> {
    const me = requireStaff(actor)
    const task = await this.requireTask(id)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'task', snap)
    const manager = task.createdBy === me.staffId || this.manages(scope, task, snap)
    const assignee = await this.seesAsAssignee(me.staffId, id)
    const designated = await this.isDesignatedReviewer(me.staffId, id)
    if (!manager && !assignee && !designated) throw taskNotFound()
    return this.detailOf(task, me, { assignee, designated, manager })
  }

  /** Người nhận việc được của người đang giao — trong phạm vi theo sơ đồ */
  async assignable(actor: Actor): Promise<AssignableStaff[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'task', snap)
    const titles = await this.org.titlesOf(snap)
    const unitOfPosition = new Map(
      (await this.db.select({ id: positions.id, unitId: positions.unitId }).from(positions)).map(
        (p) => [p.id, p.unitId],
      ),
    )
    const unitName = new Map(
      (await this.db.select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits)).map((u) => [
        u.id,
        u.name,
      ]),
    )
    const people = await this.db
      .select({ id: staff.id, fullName: staff.fullName, active: staff.active })
      .from(staff)
      .orderBy(asc(staff.fullName))
    return people
      .filter((p) => p.active && p.id !== me.staffId && inScope(scope, p.id, snap))
      .map((p) => {
        const main = snap.holdings.find((h) => h.staffId === p.id && h.kind === 'chinh')
        const unitId = main ? unitOfPosition.get(main.positionId) : undefined
        return {
          staffId: p.id,
          fullName: p.fullName,
          title: titles.get(p.id) ?? null,
          unitName: unitId !== undefined ? (unitName.get(unitId) ?? null) : null,
          branchId: snap.people.get(p.id)?.employeeBranchId ?? null,
        }
      })
  }

  /** Giao tay: mỗi người nhận một việc riêng — nộp, nghiệm thu, quá hạn tính theo người */
  async create(actor: Actor, input: TaskInput): Promise<{ ids: number[] }> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'task', snap)
    const assignees = [...new Set(input.assigneeStaffIds)]
    if (assignees.includes(me.staffId)) {
      throw conflict('self_assignment', 'Không tự giao việc cho mình')
    }
    for (const id of assignees) {
      const person = snap.people.get(id)
      if (!person?.active) throw conflict('staff_inactive', 'Có người nhận đã nghỉ việc')
      if (!inScope(scope, id, snap)) {
        throw forbidden('assignee_out_of_scope', 'Có người nhận nằm ngoài phạm vi bạn quản lý')
      }
    }
    const reviewer = input.reviewerStaffId === undefined ? me.staffId : input.reviewerStaffId
    if (reviewer !== null && assignees.includes(reviewer)) {
      throw conflict('self_review', 'Người nghiệm thu không được là người làm')
    }
    if (input.dueAt.getTime() <= Date.now()) {
      throw conflict('task_due_past', 'Hạn phải ở tương lai')
    }
    await this.assertEntity(input.entity, input.entityId)

    return this.db.transaction(async (tx) => {
      const created = await tx
        .insert(tasks)
        .values(
          assignees.map((staffId) => ({
            branchId: snap.people.get(staffId)?.employeeBranchId ?? null,
            title: input.title,
            note: input.note,
            priority: input.priority,
            assigneeStaffId: staffId,
            reviewerStaffId: reviewer,
            dueAt: input.dueAt,
            entity: input.entity,
            entityId: input.entityId,
            attachments: input.attachments,
            createdBy: me.staffId,
          })),
        )
        .returning({ id: tasks.id })
      const items = created.flatMap((c) =>
        input.checklist.map((label, idx) => ({ taskId: c.id, idx, label })),
      )
      if (items.length > 0) await tx.insert(taskCheckItems).values(items)
      for (const c of created) {
        await this.audit.write(tx, {
          actor,
          action: 'task.assigned',
          entity: 'task',
          entityId: String(c.id),
          payload: { title: input.title, entity: input.entity, entityId: input.entityId },
        })
      }
      return { ids: created.map((c) => c.id) }
    })
  }

  async update(actor: Actor, id: number, patch: TaskPatch) {
    const me = requireStaff(actor)
    const task = await this.requireTask(id)
    if (task.templateId !== null) {
      throw conflict('task_from_template', 'Việc định kỳ sửa ở mẫu — việc đã sinh giữ nguyên')
    }
    await this.assertManager(me, task)
    if (task.state !== 'open') throw conflict('task_not_open', 'Chỉ sửa được việc đang làm')
    if (patch.dueAt) {
      const check = canChangeDue(task, patch.dueAt, new Date())
      if (!check.ok) throw conflict(check.code, check.message)
    }
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(tasks)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tasks.id, id), eq(tasks.state, 'open')))
        .returning({ id: tasks.id })
      if (!row) throw conflict('task_not_open', 'Việc vừa được nộp — tải lại để xem')
      await this.audit.write(tx, {
        actor,
        action: 'task.updated',
        entity: 'task',
        entityId: String(id),
        payload: { ...patch, dueAt: patch.dueAt?.toISOString() },
      })
      return { id }
    })
  }

  async cancel(actor: Actor, id: number, reason: string) {
    const me = requireStaff(actor)
    const task = await this.requireTask(id)
    await this.assertManager(me, task)
    const next = nextState(task.state, 'cancel', false)
    if (!next.ok) throw conflict(next.code, next.message)
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(tasks)
        .set({
          state: 'cancelled',
          cancelledBy: me.staffId,
          cancelledAt: new Date(),
          cancelReason: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, id), inArray(tasks.state, ['open', 'submitted'])))
        .returning({ id: tasks.id })
      if (!row) throw conflict('task_closed', 'Việc vừa đóng — tải lại để xem')
      await this.audit.write(tx, {
        actor,
        action: 'task.cancelled',
        entity: 'task',
        entityId: String(id),
        payload: { reason },
      })
      return { id }
    })
  }

  /**
   * Nghiệm thu. Ở Office: người được chỉ định hoặc quản lý theo sơ đồ của người
   * làm. Ở Kênh nhân viên (`viaChannel`): CHỈ người được chỉ định — ngoại lệ có chủ
   * ý cho trưởng ca nghiệm thu checklist ngay trên sàn, không đụng tiền.
   */
  async review(
    actor: Actor,
    id: number,
    accept: boolean,
    note: string | null,
    viaChannel: boolean,
  ) {
    const me = requireStaff(actor)
    const task = await this.requireTask(id)
    if (task.state !== 'submitted') {
      throw conflict('task_not_submitted', 'Việc chưa nộp hoặc đã được nghiệm thu')
    }
    if (task.submittedBy === me.staffId) {
      throw conflict('self_review', 'Không tự nghiệm thu việc mình đã nộp')
    }
    const designated = await this.isDesignatedReviewer(me.staffId, id)
    if (!designated) {
      if (viaChannel) {
        throw forbidden('not_designated_reviewer', 'Bạn không phải người nghiệm thu việc này')
      }
      await this.assertManager(me, task)
    }
    if (!accept && !note?.trim()) {
      throw new BadRequestException('Trả lại thì ghi rõ cần làm lại gì')
    }
    const next = nextState(task.state, accept ? 'accept' : 'return', true)
    if (!next.ok) throw conflict(next.code, next.message)

    const at = new Date()
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(tasks)
        .set({
          state: next.state,
          reviewedBy: me.staffId,
          reviewedAt: at,
          managerNote: note?.trim() || null,
          // Người làm là người đã nộp; mốc xong là lúc được nghiệm thu
          doneBy: accept ? task.submittedBy : null,
          doneAt: accept ? at : null,
          updatedAt: at,
        })
        .where(and(eq(tasks.id, id), eq(tasks.state, 'submitted')))
        .returning({ id: tasks.id })
      if (!row) throw conflict('task_not_submitted', 'Việc vừa được người khác nghiệm thu')
      await this.audit.write(tx, {
        actor,
        action: accept ? 'task.accepted' : 'task.returned',
        entity: 'task',
        entityId: String(id),
        payload: { note },
      })
      return { id, state: next.state }
    })
  }

  // ============================================================ Mẫu việc định kỳ

  async templates(actor: Actor, branchId: string | null | undefined): Promise<TaskTemplateView[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'task', snap)
    const rows = await this.db
      .select()
      .from(taskTemplates)
      .where(
        branchId === undefined
          ? undefined
          : branchId === null
            ? isNull(taskTemplates.branchId)
            : eq(taskTemplates.branchId, branchId),
      )
      .orderBy(asc(taskTemplates.branchId), asc(taskTemplates.title))
    const visible = rows.filter((t) => this.templateInScope(scope, t.assigneePositionId, snap))
    return this.toTemplateViews(visible)
  }

  /**
   * Ca mẫu H2 của một chi nhánh — để gắn việc theo ca. Đọc qua khoá giao việc chứ
   * không qua `schedule.publish`: bếp trưởng, quản lý chuỗi dựng SOP mà không xếp lịch.
   */
  async shifts(actor: Actor, branchId: string) {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'task', snap)
    if (!scope.chain && !scope.branchIds.has(branchId)) {
      throw forbidden('branch_out_of_scope', 'Chi nhánh này nằm ngoài phạm vi của bạn')
    }
    return this.db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.branchId, branchId))
      .orderBy(asc(shiftTemplates.sort), asc(shiftTemplates.startMinute))
  }

  async createTemplate(actor: Actor, input: TemplateInput): Promise<TaskTemplateView> {
    const me = requireStaff(actor)
    const branchId = await this.validateTemplate(me, input)
    const [row] = await this.db.transaction(async (tx) => {
      const created = await tx
        .insert(taskTemplates)
        .values({
          ...input,
          branchId,
          startsOn: input.startsOn ?? todayVN(),
          createdBy: me.staffId,
        })
        .returning()
      await this.audit.write(tx, {
        actor,
        action: 'task-template.created',
        entity: 'task_template',
        entityId: String(created[0]!.id),
        payload: { title: input.title, recurrence: input.recurrence },
      })
      return created
    })
    await this.materialize(true)
    return (await this.toTemplateViews([row!]))[0]!
  }

  async updateTemplate(actor: Actor, id: number, input: TemplateInput): Promise<TaskTemplateView> {
    const me = requireStaff(actor)
    const [current] = await this.db.select().from(taskTemplates).where(eq(taskTemplates.id, id))
    if (!current) {
      throw new NotFoundException({ code: 'template_not_found', message: 'Không có mẫu việc này' })
    }
    const snap = await this.org.snapshot()
    if (
      !this.templateInScope(scopeOf(me.staffId, 'task', snap), current.assigneePositionId, snap)
    ) {
      throw forbidden('position_out_of_scope', 'Mẫu việc này thuộc đơn vị ngoài phạm vi của bạn')
    }
    const branchId = await this.validateTemplate(me, input)
    const [row] = await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(taskTemplates)
        .set({
          ...input,
          branchId,
          startsOn: input.startsOn ?? current.startsOn,
          updatedAt: new Date(),
        })
        .where(eq(taskTemplates.id, id))
        .returning()
      await this.audit.write(tx, {
        actor,
        action: 'task-template.updated',
        entity: 'task_template',
        entityId: String(id),
        payload: { title: input.title, active: input.active },
      })
      return updated
    })
    await this.materialize(true)
    return (await this.toTemplateViews([row!]))[0]!
  }

  /**
   * Bộ SOP chuẩn cho một chi nhánh (`STANDARD_SOPS`). Idempotent theo tên mẫu.
   * Ghế làm/nghiệm thu tìm theo tên bộ phận + chức danh trên sơ đồ — sơ đồ chi nhánh
   * chưa dựng thì báo thiếu, không đoán. Chi nhánh chưa có ca mẫu thì SOP theo ca
   * thành việc hằng ngày với giờ cố định.
   */
  async applyStandardSops(actor: Actor, branchId: string) {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'task', snap)
    if (!scope.chain && !scope.branchIds.has(branchId)) {
      throw forbidden('branch_out_of_scope', 'Chi nhánh này nằm ngoài phạm vi của bạn')
    }
    const [branchUnit] = await this.db
      .select({ id: orgUnits.id })
      .from(orgUnits)
      .where(and(eq(orgUnits.branchId, branchId), eq(orgUnits.active, true)))
    if (!branchUnit) {
      throw conflict(
        'branch_not_on_chart',
        'Chi nhánh chưa có trên sơ đồ tổ chức — dựng sơ đồ chi nhánh theo mẫu trước',
      )
    }
    const children = await this.db
      .select({ id: orgUnits.id, name: orgUnits.name })
      .from(orgUnits)
      .where(and(eq(orgUnits.parentId, branchUnit.id), eq(orgUnits.active, true)))
    const unitIdOf = (name: string | null) =>
      name === null ? branchUnit.id : children.find((c) => c.name === name)?.id
    const seats = await this.db
      .select({ id: positions.id, unitId: positions.unitId, title: positions.title })
      .from(positions)
      .where(eq(positions.active, true))
    const seatOf = (seat: StandardSeat) => {
      const unitId = unitIdOf(seat.unit)
      return seats.find((p) => p.unitId === unitId && p.title === seat.title)?.id
    }

    const branchShifts = await this.db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.branchId, branchId))
    const opening = [...branchShifts].sort((a, b) => a.startMinute - b.startMinute)[0]
    const closing = [...branchShifts].sort((a, b) => b.endMinute - a.endMinute)[0]
    const existing = new Set(
      (
        await this.db
          .select({ title: taskTemplates.title })
          .from(taskTemplates)
          .where(eq(taskTemplates.branchId, branchId))
      ).map((t) => t.title),
    )

    const skipped: { title: string; reason: string }[] = []
    const values: (typeof taskTemplates.$inferInsert)[] = []
    for (const sop of STANDARD_SOPS) {
      if (existing.has(sop.title)) continue
      const assignee = seatOf(sop.assignee)
      const reviewer = sop.reviewer ? seatOf(sop.reviewer) : undefined
      if (assignee === undefined || (sop.reviewer && reviewer === undefined)) {
        const missing = assignee === undefined ? sop.assignee : sop.reviewer!
        skipped.push({
          title: sop.title,
          reason: `Chưa có chức danh "${missing.title}"${missing.unit ? ` ở ${missing.unit}` : ''}`,
        })
        continue
      }
      const shift =
        sop.shift === 'mo-cua' ? opening : sop.shift === 'dong-cua' ? closing : undefined
      const byShift = sop.recurrence === 'theo-ca' && shift !== undefined
      values.push({
        branchId,
        title: sop.title,
        checklist: sop.checklist,
        assigneePositionId: assignee,
        reviewerPositionId: reviewer ?? null,
        recurrence: byShift
          ? 'theo-ca'
          : sop.recurrence === 'theo-ca'
            ? 'hang-ngay'
            : sop.recurrence,
        weekday: sop.weekday ?? null,
        monthDay: sop.monthDay ?? null,
        shiftTemplateId: byShift ? shift.id : null,
        dueMinute: byShift
          ? sop.shift === 'mo-cua'
            ? shift.startMinute + SOP_OPENING_GRACE_MINUTES
            : null
          : sop.dueMinute,
        priority: sop.priority,
        startsOn: todayVN(),
        createdBy: me.staffId,
      })
    }
    if (values.length > 0) {
      await this.db.transaction(async (tx) => {
        await tx.insert(taskTemplates).values(values)
        await this.audit.write(tx, {
          actor,
          action: 'task-template.standard-applied',
          entity: 'branch',
          entityId: branchId,
          payload: { created: values.map((v) => v.title) },
        })
      })
      await this.materialize(true)
    }
    return { created: values.length, skipped, withoutShifts: branchShifts.length === 0 }
  }

  // ============================================================ Của tôi — N1 · N12

  async mine(actor: Actor): Promise<MyTasks> {
    const me = requireStaff(actor)
    await this.materialize()
    const today = todayVN()
    const open = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.state, 'open'), this.assigneeVisible(me.staffId, addDays(today, -1))))
    const weekAgo = new Date(Date.now() - 7 * DAY_MS)
    const recent = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          inArray(tasks.state, ['submitted', 'done']),
          this.assigneeVisible(me.staffId, addDays(today, -7)),
          or(gte(tasks.submittedAt, weekAgo), gte(tasks.doneAt, weekAgo)),
        ),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(30)
    const toReview = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.state, 'submitted'), this.reviewerVisible(me.staffId)))
      .orderBy(asc(tasks.dueAt))
    const now = new Date()
    const endOfToday = startOfBusinessDay(addDays(today, 1), ORG_TZ)
    return {
      open: await this.toRows(sortMine(open, now, endOfToday)),
      recent: await this.toRows(recent),
      toReview: await this.toRows(toReview),
      shiftToday: await this.shiftToday(me.staffId, today),
    }
  }

  async mineDetail(actor: Actor, id: number): Promise<TaskDetail> {
    const me = requireStaff(actor)
    const task = await this.requireTask(id)
    const assignee = await this.seesAsAssignee(me.staffId, id)
    const designated = await this.isDesignatedReviewer(me.staffId, id)
    if (!assignee && !designated && task.submittedBy !== me.staffId) throw taskNotFound()
    return this.detailOf(task, me, { assignee, designated, manager: false })
  }

  /** "Nhận việc" — để người giao biết việc đã tới tay. Bấm lại không đổi mốc */
  async accept(actor: Actor, id: number) {
    const me = requireStaff(actor)
    const [row] = await this.db
      .update(tasks)
      .set({ acceptedAt: sql`coalesce(${tasks.acceptedAt}, now())`, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.assigneeStaffId, me.staffId), eq(tasks.state, 'open')))
      .returning({ id: tasks.id, acceptedAt: tasks.acceptedAt })
    if (!row) {
      const task = await this.requireTask(id)
      if (task.assigneeStaffId !== me.staffId) throw taskNotFound()
      throw conflict('task_not_open', 'Việc không còn ở trạng thái đang làm')
    }
    return { id, acceptedAt: iso(row.acceptedAt) }
  }

  /**
   * Tích/bỏ tích một mục. Mục đã có người tích thì giữ tên người tích đầu — hai
   * người cùng ca bấm cùng lúc không giành nhau công.
   */
  async check(actor: Actor, id: number, idx: number, checked: boolean) {
    const me = requireStaff(actor)
    if (!(await this.seesAsAssignee(me.staffId, id))) throw taskNotFound()
    try {
      const [row] = await this.db
        .update(taskCheckItems)
        .set(
          checked
            ? {
                checkedBy: sql`coalesce(${taskCheckItems.checkedBy}, ${me.staffId}::bigint)`,
                checkedAt: sql`coalesce(${taskCheckItems.checkedAt}, now())`,
              }
            : { checkedBy: null, checkedAt: null },
        )
        .where(and(eq(taskCheckItems.taskId, id), eq(taskCheckItems.idx, idx)))
        .returning()
      if (!row) {
        throw new NotFoundException({ code: 'check_item_not_found', message: 'Không có mục này' })
      }
      return { idx: row.idx, checkedBy: row.checkedBy, checkedAt: iso(row.checkedAt) }
    } catch (err) {
      if (isRestrictViolation(err, 'task_check_items_frozen')) {
        throw conflict('task_not_open', 'Việc đã nộp — checklist đã chốt')
      }
      throw err
    }
  }

  /**
   * Nộp việc. Khoá dòng TRƯỚC bằng `UPDATE … WHERE state = 'open' RETURNING`, rồi
   * mới đếm mục chưa tích: hai người cùng ca bấm "Báo xong" cùng lúc thì một người
   * nộp, người kia nhận 409 — không có hai bản nộp.
   */
  async submit(actor: Actor, id: number, note: string | null, attachments: DocAttachment[] | null) {
    const me = requireStaff(actor)
    if (!(await this.seesAsAssignee(me.staffId, id))) throw taskNotFound()
    const task = await this.requireTask(id)
    const hasReviewer = task.reviewerStaffId !== null || task.reviewerPositionId !== null
    const next = nextState(task.state, 'submit', hasReviewer)
    if (!next.ok) throw conflict(next.code, next.message)

    const at = new Date()
    const done = next.state === 'done'
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(tasks)
        .set({
          state: next.state,
          submittedBy: me.staffId,
          submittedAt: at,
          resultNote: note?.trim() || null,
          ...(attachments ? { attachments } : {}),
          // Lần nộp lại sau khi bị trả: người nghiệm thu cũ không còn treo trên dòng
          reviewedBy: null,
          reviewedAt: null,
          doneBy: done ? me.staffId : null,
          doneAt: done ? at : null,
          updatedAt: at,
        })
        .where(and(eq(tasks.id, id), eq(tasks.state, 'open')))
        .returning({ id: tasks.id })
      if (!row) throw conflict('task_not_open', 'Việc vừa được người cùng ca nộp')

      const [left] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(taskCheckItems)
        .where(and(eq(taskCheckItems.taskId, id), isNull(taskCheckItems.checkedAt)))
      const check = checkSubmit(left?.n ?? 0, note)
      if (!check.ok) throw conflict(check.code, check.message)

      await this.audit.write(tx, {
        actor,
        action: 'task.submitted',
        entity: 'task',
        entityId: String(id),
        payload: { unchecked: left?.n ?? 0, state: next.state },
      })
      return { id, state: next.state }
    })
  }

  /** Dòng việc theo id — cho màn khác hiện việc gắn với nguồn của nó (sự cố, khiếu nại) */
  async rowsOf(ids: number[]): Promise<TaskRow[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select()
      .from(tasks)
      .where(inArray(tasks.id, ids))
      .orderBy(asc(tasks.dueAt))
    return this.toRows(rows)
  }

  /** Số đếm cho hộp việc */
  async counts(staffId: number) {
    await this.materialize()
    const since = addDays(todayVN(), -1)
    const [mine] = await this.db
      .select({
        open: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) FILTER (WHERE ${tasks.dueAt} < now())::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.state, 'open'), this.assigneeVisible(staffId, since)))
    const [review] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.state, 'submitted'), this.reviewerVisible(staffId)))
    return { open: mine?.open ?? 0, overdue: mine?.overdue ?? 0, toReview: review?.n ?? 0 }
  }

  // ============================================================ Nội bộ

  private async requireTask(id: number): Promise<TaskRec> {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, id))
    if (!task) throw taskNotFound()
    return task
  }

  /** Người giao, hoặc quản lý theo sơ đồ của người làm */
  private async assertManager(me: StaffActor, task: TaskRec) {
    if (task.createdBy === me.staffId) return
    const snap = await this.org.snapshot()
    if (!this.manages(scopeOf(me.staffId, 'task', snap), task, snap)) {
      throw forbidden('task_out_of_scope', 'Việc này thuộc người ngoài phạm vi của bạn')
    }
  }

  private templateInScope(scope: Scope, positionId: number, snap: OrgSnapshot) {
    if (scope.chain) return true
    const position = snap.positions.get(positionId)
    return position !== undefined && scope.unitIds.has(position.unitId)
  }

  /** Kiểm mẫu việc; trả về chi nhánh suy ra từ ghế được giao (không tin client) */
  private async validateTemplate(me: StaffActor, input: TemplateInput): Promise<string | null> {
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'task', snap)
    const assignee = snap.positions.get(input.assigneePositionId)
    if (!assignee?.active) {
      throw new BadRequestException({
        code: 'position_not_found',
        message: 'Không có chức danh này',
      })
    }
    if (!this.templateInScope(scope, input.assigneePositionId, snap)) {
      throw forbidden('position_out_of_scope', 'Chức danh này thuộc đơn vị ngoài phạm vi của bạn')
    }
    if (input.reviewerPositionId !== null) {
      if (input.reviewerPositionId === input.assigneePositionId) {
        throw conflict('self_review', 'Ghế nghiệm thu phải khác ghế làm')
      }
      if (!snap.positions.get(input.reviewerPositionId)?.active) {
        throw new BadRequestException({
          code: 'position_not_found',
          message: 'Không có chức danh nghiệm thu này',
        })
      }
    }
    const branchId = branchOfUnit(assignee.unitId, snap.units)
    if (input.recurrence === 'theo-ca') {
      if (!branchId) {
        throw new BadRequestException({
          code: 'shift_needs_branch',
          message: 'Việc theo ca chỉ dành cho chức danh ở chi nhánh',
        })
      }
      const [shift] = await this.db
        .select({ branchId: shiftTemplates.branchId })
        .from(shiftTemplates)
        .where(eq(shiftTemplates.id, input.shiftTemplateId ?? 0))
      if (!shift || shift.branchId !== branchId) {
        throw new BadRequestException({
          code: 'shift_wrong_branch',
          message: 'Ca mẫu phải thuộc chi nhánh của chức danh được giao',
        })
      }
    }
    if (input.documentId !== null) {
      const [doc] = await this.db
        .select({ state: orgDocuments.state })
        .from(orgDocuments)
        .where(eq(orgDocuments.id, input.documentId))
      if (doc?.state !== 'issued') {
        throw new BadRequestException({
          code: 'document_not_issued',
          message: 'Văn bản hướng dẫn phải là văn bản đã ban hành',
        })
      }
    }
    return branchId
  }

  private async assertEntity(entity: TaskEntity | null, entityId: number | null) {
    if (entity === null || entityId === null) return
    let found: { id: number }[]
    if (entity === 'feedback') {
      found = await this.db
        .select({ id: feedback.id })
        .from(feedback)
        .where(eq(feedback.id, entityId))
    } else if (entity === 'document') {
      found = await this.db
        .select({ id: orgDocuments.id })
        .from(orgDocuments)
        .where(eq(orgDocuments.id, entityId))
    } else if (entity === 'incident') {
      found = await this.db
        .select({ id: incidents.id })
        .from(incidents)
        .where(eq(incidents.id, entityId))
    } else {
      found = await this.db
        .select({ id: workReports.id })
        .from(workReports)
        .where(eq(workReports.id, entityId))
    }
    if (found.length === 0) {
      throw new BadRequestException({
        code: 'entity_not_found',
        message: 'Không thấy nguồn của việc',
      })
    }
  }

  private async shiftToday(staffId: number, today: string) {
    const [row] = await this.db
      .select({
        startMinute: scheduleEntries.startMinute,
        endMinute: scheduleEntries.endMinute,
        templateName: shiftTemplates.name,
        branchName: branches.name,
      })
      .from(scheduleEntries)
      .innerJoin(employees, eq(employees.id, scheduleEntries.employeeId))
      .innerJoin(branches, eq(branches.id, scheduleEntries.branchId))
      .leftJoin(shiftTemplates, eq(shiftTemplates.id, scheduleEntries.templateId))
      .where(
        and(
          eq(employees.staffId, staffId),
          eq(scheduleEntries.workDate, today),
          eq(scheduleEntries.state, 'published'),
        ),
      )
      .limit(1)
    if (!row) return null
    return {
      label: shiftLabelOf({ name: row.templateName ?? 'Ca', ...row }),
      branchName: row.branchName,
    }
  }

  private range(from?: string, to?: string) {
    const today = todayVN()
    const start = from ?? addDays(today, -7)
    const end = to ?? addDays(today, 30)
    if (end < start) throw new BadRequestException('Ngày kết thúc trước ngày bắt đầu')
    const span = (Date.parse(end) - Date.parse(start)) / DAY_MS
    if (span > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Xem tối đa ${MAX_RANGE_DAYS} ngày một lần`)
    }
    return {
      start: startOfBusinessDay(start, ORG_TZ),
      end: startOfBusinessDay(addDays(end, 1), ORG_TZ),
    }
  }

  private async namesOf(ids: number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .select({ id: staff.id, fullName: staff.fullName })
      .from(staff)
      .where(inArray(staff.id, ids))
    return new Map(rows.map((r) => [r.id, r.fullName]))
  }

  private async toRows(rows: TaskRec[]): Promise<TaskRow[]> {
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const progress = new Map(
      (
        await this.db
          .select({
            taskId: taskCheckItems.taskId,
            total: sql<number>`count(*)::int`,
            checked: sql<number>`count(${taskCheckItems.checkedAt})::int`,
          })
          .from(taskCheckItems)
          .where(inArray(taskCheckItems.taskId, ids))
          .groupBy(taskCheckItems.taskId)
      ).map((p) => [p.taskId, p]),
    )
    const names = await this.namesOf(
      uniq(rows.flatMap((r) => [r.assigneeStaffId, r.reviewerStaffId, r.submittedBy, r.createdBy])),
    )
    const positionIds = uniq(rows.flatMap((r) => [r.assigneePositionId, r.reviewerPositionId]))
    const titles = new Map(
      positionIds.length === 0
        ? []
        : (
            await this.db
              .select({ id: positions.id, title: positions.title })
              .from(positions)
              .where(inArray(positions.id, positionIds))
          ).map((p) => [p.id, p.title]),
    )
    const shiftIds = uniq(rows.map((r) => r.shiftTemplateId))
    const shifts = new Map(
      shiftIds.length === 0
        ? []
        : (
            await this.db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds))
          ).map((s) => [s.id, shiftLabelOf(s)]),
    )
    const name = (id: number | null) => (id === null ? null : (names.get(id) ?? null))
    const title = (id: number | null) => (id === null ? null : (titles.get(id) ?? null))
    const now = new Date()
    return rows.map((r) => ({
      id: r.id,
      branchId: r.branchId,
      title: r.title,
      priority: r.priority,
      state: r.state,
      dueAt: r.dueAt.toISOString(),
      overdue: isOverdue(r, now),
      assigneeStaffId: r.assigneeStaffId,
      assigneeName: name(r.assigneeStaffId),
      assigneePositionId: r.assigneePositionId,
      assigneePositionTitle: title(r.assigneePositionId),
      reviewerStaffId: r.reviewerStaffId,
      reviewerName: name(r.reviewerStaffId),
      reviewerPositionId: r.reviewerPositionId,
      reviewerPositionTitle: title(r.reviewerPositionId),
      templateId: r.templateId,
      occurrenceDate: r.occurrenceDate,
      shiftLabel: r.shiftTemplateId !== null ? (shifts.get(r.shiftTemplateId) ?? null) : null,
      checklist: {
        total: progress.get(r.id)?.total ?? 0,
        checked: progress.get(r.id)?.checked ?? 0,
      },
      acceptedAt: iso(r.acceptedAt),
      submittedAt: iso(r.submittedAt),
      submittedByName: name(r.submittedBy),
      doneAt: iso(r.doneAt),
      createdByName: name(r.createdBy),
      createdAt: r.createdAt.toISOString(),
      entity: r.entity,
      entityId: r.entityId,
    }))
  }

  private async detailOf(
    task: TaskRec,
    me: StaffActor,
    who: { assignee: boolean; designated: boolean; manager: boolean },
  ): Promise<TaskDetail> {
    const [row] = await this.toRows([task])
    const items = await this.db
      .select({
        idx: taskCheckItems.idx,
        label: taskCheckItems.label,
        checkedBy: taskCheckItems.checkedBy,
        checkedAt: taskCheckItems.checkedAt,
        checkedByName: staff.fullName,
      })
      .from(taskCheckItems)
      .leftJoin(staff, eq(staff.id, taskCheckItems.checkedBy))
      .where(eq(taskCheckItems.taskId, task.id))
      .orderBy(asc(taskCheckItems.idx))
    const open = task.state === 'open'
    const reviewable =
      task.state === 'submitted' &&
      task.submittedBy !== me.staffId &&
      (who.designated || who.manager)
    return {
      ...row!,
      note: task.note,
      attachments: task.attachments as DocAttachment[],
      items: items.map((i) => ({
        idx: i.idx,
        label: i.label,
        checkedBy: i.checkedBy,
        checkedByName: i.checkedByName,
        checkedAt: iso(i.checkedAt),
      })),
      resultNote: task.resultNote,
      managerNote: task.managerNote,
      cancelReason: task.cancelReason,
      canAccept: open && task.assigneeStaffId === me.staffId && task.acceptedAt === null,
      canCheck: open && who.assignee,
      canSubmit: open && who.assignee,
      canReview: reviewable,
      canEdit: open && who.manager && task.templateId === null,
      canCancel: (open || task.state === 'submitted') && who.manager,
    }
  }

  private async toTemplateViews(
    rows: (typeof taskTemplates.$inferSelect)[],
  ): Promise<TaskTemplateView[]> {
    if (rows.length === 0) return []
    const positionIds = uniq(rows.flatMap((r) => [r.assigneePositionId, r.reviewerPositionId]))
    const seats = await this.db
      .select({ id: positions.id, title: positions.title, unitName: orgUnits.name })
      .from(positions)
      .innerJoin(orgUnits, eq(orgUnits.id, positions.unitId))
      .where(inArray(positions.id, positionIds))
    const seatOf = new Map(seats.map((s) => [s.id, s]))
    const shiftIds = uniq(rows.map((r) => r.shiftTemplateId))
    const shifts = new Map(
      shiftIds.length === 0
        ? []
        : (
            await this.db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds))
          ).map((s) => [s.id, shiftLabelOf(s)]),
    )
    const docIds = uniq(rows.map((r) => r.documentId))
    const docs = new Map(
      docIds.length === 0
        ? []
        : (
            await this.db
              .select({ id: orgDocuments.id, title: orgDocuments.title })
              .from(orgDocuments)
              .where(inArray(orgDocuments.id, docIds))
          ).map((d) => [d.id, d.title]),
    )
    return rows.map((r) => ({
      id: r.id,
      branchId: r.branchId,
      title: r.title,
      note: r.note,
      checklist: r.checklist,
      assigneePositionId: r.assigneePositionId,
      assigneePositionTitle: seatOf.get(r.assigneePositionId)?.title ?? '',
      assigneeUnitName: seatOf.get(r.assigneePositionId)?.unitName ?? '',
      reviewerPositionId: r.reviewerPositionId,
      reviewerPositionTitle:
        r.reviewerPositionId !== null ? (seatOf.get(r.reviewerPositionId)?.title ?? null) : null,
      recurrence: r.recurrence,
      weekday: r.weekday,
      monthDay: r.monthDay,
      shiftTemplateId: r.shiftTemplateId,
      shiftLabel: r.shiftTemplateId !== null ? (shifts.get(r.shiftTemplateId) ?? null) : null,
      dueMinute: r.dueMinute,
      priority: r.priority,
      documentId: r.documentId,
      documentTitle: r.documentId !== null ? (docs.get(r.documentId) ?? null) : null,
      startsOn: r.startsOn,
      active: r.active,
    }))
  }
}
