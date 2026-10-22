import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  checkPermission,
  type DocAttachment,
  type IncidentCategory,
  type IncidentDetail,
  type IncidentRow,
  type IncidentSeverity,
  type MyIncident,
  type Role,
  type TaskPriority,
} from '@sora/contracts'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { nextDisplayCode } from '../../common/display-code'
import { ParamsService } from '../../common/params.service'
import type { Db } from '../../db/client'
import { branches, incidents, staff, tasks } from '../../db/schema'
import type { Actor, StaffActor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { scopeOf, type OrgSnapshot } from '../org/domain/org'
import { OrgService, requireStaff } from '../org/org.service'
import { TasksService } from '../org/tasks.service'
import { canClose, isSevere, needsExternalReport } from './domain/incident'

export interface IncidentInput {
  category: IncidentCategory
  severity: IncidentSeverity
  occurredAt: Date
  title: string
  description: string
  immediateAction: string | null
  injuredCount: number
  customerInvolved: boolean
  evidenceUrls: string[]
}

export interface IncidentPatch {
  category?: IncidentCategory
  severity?: IncidentSeverity
  title?: string
  description?: string
  immediateAction?: string | null
  rootCause?: string | null
  correctiveAction?: string | null
  lossEstimateVnd?: number | null
  ownerId?: number | null
  evidenceUrls?: string[]
}

type IncidentRec = typeof incidents.$inferSelect

const conflict = (code: string, message: string) => new ConflictException({ code, message })
const notFound = () =>
  new NotFoundException({ code: 'incident_not_found', message: 'Không có sự cố này' })

/**
 * Sự cố — ai cũng báo được (Kênh nhân viên), người xử lý (`incident.manage`) điều
 * tra, giao việc khắc phục, ghi mốc khai báo ra ngoài, rồi đóng. Sự cố nghiêm
 * trọng do quản lý chuỗi / chủ đóng, và người báo không tự đóng.
 *
 * Không chấm KPI bằng SỐ sự cố (D10) — chấm báo đúng hạn và khắc phục đúng hạn,
 * kẻo người ta giấu sự cố.
 */
@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly org: OrgService,
    private readonly tasks: TasksService,
    private readonly params: ParamsService,
    private readonly audit: AuditService,
  ) {}

  async report(actor: Actor, input: IncidentInput) {
    const me = requireStaff(actor)
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, me.branchId))
    if (!branch) throw new NotFoundException('Không có chi nhánh này')
    const now = new Date()
    if (input.occurredAt.getTime() > now.getTime()) {
      throw conflict('incident_future', 'Thời điểm xảy ra không thể ở tương lai')
    }
    return this.db.transaction(async (tx) => {
      const businessDate = businessDateOf(input.occurredAt, branch.timezone)
      const { code } = await nextDisplayCode(tx, {
        branchId: branch.id,
        kind: 'incident',
        businessDate,
      })
      const [row] = await tx
        .insert(incidents)
        .values({
          ...input,
          code,
          branchId: branch.id,
          businessDate,
          reportedAt: now,
          reportedBy: me.staffId,
          externalReportRequired: needsExternalReport(input.category, input.severity),
        })
        .returning({ id: incidents.id, code: incidents.code })
      await this.audit.write(tx, {
        actor,
        action: 'incident.reported',
        entity: 'incident',
        entityId: String(row!.id),
        payload: { code, category: input.category, severity: input.severity },
      })
      return row!
    })
  }

  async mine(actor: Actor): Promise<MyIncident[]> {
    const me = requireStaff(actor)
    const rows = await this.db
      .select()
      .from(incidents)
      .where(eq(incidents.reportedBy, me.staffId))
      .orderBy(desc(incidents.reportedAt))
      .limit(30)
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      category: r.category,
      severity: r.severity,
      state: r.state,
      reportedAt: r.reportedAt.toISOString(),
    }))
  }

  async list(
    actor: Actor,
    filter: { state?: string; branchId?: string; severity?: string },
  ): Promise<IncidentRow[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const rows = (
      await this.db
        .select()
        .from(incidents)
        .where(
          and(
            filter.branchId ? eq(incidents.branchId, filter.branchId) : undefined,
            filter.state === 'mo'
              ? ne(incidents.state, 'closed')
              : filter.state
                ? eq(incidents.state, filter.state as IncidentRec['state'])
                : undefined,
            filter.severity
              ? eq(incidents.severity, filter.severity as IncidentRec['severity'])
              : undefined,
          ),
        )
        .orderBy(desc(incidents.reportedAt))
        .limit(300)
    ).filter((r) => this.inMyScope(me, r, snap))
    return this.toRows(rows)
  }

  async detail(actor: Actor, id: number): Promise<IncidentDetail> {
    const me = requireStaff(actor)
    const incident = await this.requireIncident(id)
    const snap = await this.org.snapshot()
    if (!this.inMyScope(me, incident, snap)) throw notFound()
    const [row] = await this.toRows([incident])
    const taskRows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.entity, 'incident'), eq(tasks.entityId, id)))
    const taskList = await this.tasks.rowsOf(taskRows.map((t) => t.id))
    const names = await this.namesOf([incident.closedBy])
    const roles = this.rolesOf(snap, me.staffId)
    const open = incident.state !== 'closed'
    return {
      ...row!,
      description: incident.description,
      immediateAction: incident.immediateAction,
      injuredCount: incident.injuredCount,
      customerInvolved: incident.customerInvolved,
      rootCause: incident.rootCause,
      correctiveAction: incident.correctiveAction,
      lossEstimateVnd: incident.lossEstimateVnd,
      externalReportRef: incident.externalReportRef,
      evidenceUrls: incident.evidenceUrls,
      closedAt: incident.closedAt?.toISOString() ?? null,
      closedByName: incident.closedBy !== null ? (names.get(incident.closedBy) ?? null) : null,
      closeNote: incident.closeNote,
      tasks: taskList,
      canEdit: open,
      canClose:
        open &&
        (!isSevere(incident.severity) ||
          (checkPermission('incident.close-severe', roles) === 'allow' &&
            incident.reportedBy !== me.staffId)),
    }
  }

  async update(actor: Actor, id: number, patch: IncidentPatch) {
    const me = requireStaff(actor)
    const incident = await this.requireIncident(id)
    const snap = await this.org.snapshot()
    if (!this.inMyScope(me, incident, snap)) throw notFound()
    if (incident.state === 'closed') throw conflict('incident_closed', 'Sự cố đã đóng')
    const category = patch.category ?? incident.category
    const severity = patch.severity ?? incident.severity
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(incidents)
        .set({
          ...patch,
          // Một khi đã phải khai báo ra ngoài thì hạ mức cũng không gỡ được nghĩa vụ đó
          externalReportRequired:
            incident.externalReportRequired || needsExternalReport(category, severity),
          state: 'investigating',
          updatedAt: new Date(),
        })
        .where(and(eq(incidents.id, id), ne(incidents.state, 'closed')))
        .returning({ id: incidents.id })
      if (!row) throw conflict('incident_closed', 'Sự cố vừa được đóng')
      await this.audit.write(tx, {
        actor,
        action: 'incident.updated',
        entity: 'incident',
        entityId: String(id),
        payload: { ...patch },
      })
      return { id }
    })
  }

  /** Việc khắc phục: giao qua TasksService (phạm vi theo sơ đồ), hạn mặc định +N ngày */
  async addTask(
    actor: Actor,
    id: number,
    input: {
      title: string
      note: string | null
      priority: TaskPriority
      assigneeStaffIds: number[]
      dueAt: Date | null
      attachments: DocAttachment[]
    },
  ) {
    const me = requireStaff(actor)
    const incident = await this.requireIncident(id)
    if (!this.inMyScope(me, incident, await this.org.snapshot())) throw notFound()
    if (incident.state === 'closed') throw conflict('incident_closed', 'Sự cố đã đóng')
    const days = await this.params.getNumber(
      'workreport.incidentCorrectiveDays',
      7,
      incident.branchId,
    )
    return this.tasks.create(actor, {
      ...input,
      dueAt: input.dueAt ?? new Date(Date.now() + days * 86_400_000),
      checklist: [],
      entity: 'incident',
      entityId: id,
    })
  }

  async externalReport(actor: Actor, id: number, input: { reportedAt: Date; ref: string }) {
    const me = requireStaff(actor)
    const incident = await this.requireIncident(id)
    if (!this.inMyScope(me, incident, await this.org.snapshot())) throw notFound()
    if (incident.state === 'closed') throw conflict('incident_closed', 'Sự cố đã đóng')
    return this.db.transaction(async (tx) => {
      await tx
        .update(incidents)
        .set({
          externalReportedAt: input.reportedAt,
          externalReportRef: input.ref,
          state: 'investigating',
          updatedAt: new Date(),
        })
        .where(eq(incidents.id, id))
      await this.audit.write(tx, {
        actor,
        action: 'incident.external-reported',
        entity: 'incident',
        entityId: String(id),
        payload: { ref: input.ref, reportedAt: input.reportedAt.toISOString() },
      })
      return { id }
    })
  }

  async close(actor: Actor, id: number, note: string | null) {
    const me = requireStaff(actor)
    const incident = await this.requireIncident(id)
    const snap = await this.org.snapshot()
    if (!this.inMyScope(me, incident, snap)) throw notFound()
    if (incident.state === 'closed') throw conflict('incident_closed', 'Sự cố đã đóng')
    const [open] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.entity, 'incident'),
          eq(tasks.entityId, id),
          inArray(tasks.state, ['open', 'submitted']),
        ),
      )
    const check = canClose({
      severity: incident.severity,
      rootCause: incident.rootCause,
      correctiveAction: incident.correctiveAction,
      externalReportRequired: incident.externalReportRequired,
      externalReportedAt: incident.externalReportedAt,
      openTasks: open?.n ?? 0,
      reportedBy: incident.reportedBy,
      closer: me.staffId,
      closerMaySevere:
        checkPermission('incident.close-severe', this.rolesOf(snap, me.staffId)) === 'allow',
    })
    if (!check.ok) {
      throw check.code === 'incident_needs_chain'
        ? new ForbiddenException({ code: check.code, message: check.message })
        : conflict(check.code, check.message)
    }
    return this.db.transaction(async (tx) => {
      await tx
        .update(incidents)
        .set({
          state: 'closed',
          closedBy: me.staffId,
          closedAt: new Date(),
          closeNote: note?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(incidents.id, id))
      await this.audit.write(tx, {
        actor,
        action: 'incident.closed',
        entity: 'incident',
        entityId: String(id),
        payload: { note },
      })
      return { id }
    })
  }

  /** Số đếm cho hộp việc — chỉ người xử lý sự cố */
  async counts(actor: StaffActor) {
    const snap = await this.org.snapshot()
    const rows = (
      await this.db.select().from(incidents).where(ne(incidents.state, 'closed'))
    ).filter((r) => this.inMyScope(actor, r, snap))
    return {
      open: rows.length,
      severeOpen: rows.filter((r) => isSevere(r.severity)).length,
    }
  }

  // ================================================================ Nội bộ

  /** Phạm vi sự cố = chi nhánh trong phạm vi "báo cáo" của sơ đồ; R10 · R11 cả chuỗi */
  private inMyScope(me: StaffActor, incident: IncidentRec, snap: OrgSnapshot) {
    if (incident.reportedBy === me.staffId) return true
    const scope = scopeOf(me.staffId, 'report', snap)
    return scope.chain || scope.branchIds.has(incident.branchId)
  }

  private rolesOf(snap: OrgSnapshot, staffId: number): Role[] {
    return (snap.people.get(staffId)?.roles ?? []).map((g) => g.role)
  }

  private async requireIncident(id: number): Promise<IncidentRec> {
    const [row] = await this.db.select().from(incidents).where(eq(incidents.id, id))
    if (!row) throw notFound()
    return row
  }

  private async namesOf(ids: (number | null)[]): Promise<Map<number, string>> {
    const list = [...new Set(ids.filter((x): x is number => x !== null))]
    if (list.length === 0) return new Map()
    return new Map(
      (
        await this.db
          .select({ id: staff.id, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, list))
      ).map((s) => [s.id, s.fullName]),
    )
  }

  private async toRows(rows: IncidentRec[]): Promise<IncidentRow[]> {
    if (rows.length === 0) return []
    const names = await this.namesOf(rows.flatMap((r) => [r.reportedBy, r.ownerId]))
    const openTasks = new Map(
      (
        await this.db
          .select({ entityId: tasks.entityId, n: sql<number>`count(*)::int` })
          .from(tasks)
          .where(
            and(
              eq(tasks.entity, 'incident'),
              inArray(
                tasks.entityId,
                rows.map((r) => r.id),
              ),
              inArray(tasks.state, ['open', 'submitted']),
            ),
          )
          .groupBy(tasks.entityId)
      ).map((t) => [t.entityId, t.n]),
    )
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      branchId: r.branchId,
      category: r.category,
      severity: r.severity,
      state: r.state,
      title: r.title,
      occurredAt: r.occurredAt.toISOString(),
      reportedAt: r.reportedAt.toISOString(),
      reportedByName: names.get(r.reportedBy) ?? '',
      ownerName: r.ownerId !== null ? (names.get(r.ownerId) ?? null) : null,
      externalReportRequired: r.externalReportRequired,
      externalReportedAt: r.externalReportedAt?.toISOString() ?? null,
      openTasks: openTasks.get(r.id) ?? 0,
    }))
  }
}
