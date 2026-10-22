import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  checkPermission,
  STANDARD_REPORT_TEMPLATES,
  type AutoValue,
  type ReportAutoKey,
  type ReportCadence,
  type ReportField,
  type ReportReviewMode,
  type ReportSlot,
  type ReportTemplateView,
  type ReportValue,
  type Role,
  type StandardSeat,
  type WorkReportDetail,
  type WorkReportRow,
} from '@sora/contracts'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { businessDateOf, startOfBusinessDay } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import type { Db } from '../../db/client'
import {
  branches,
  employees,
  orgUnits,
  positions,
  reportTemplatePositions,
  reportTemplates,
  scheduleEntries,
  shiftTemplates,
  staff,
  workReportAddenda,
  workReports,
} from '../../db/schema'
import { actorRoles, type Actor, type StaffActor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { inScope, managersOf, scopeOf, type OrgSnapshot } from '../org/domain/org'
import { ORG_TZ, OrgService, requireStaff, todayVN } from '../org/org.service'
import { AutoFieldsService } from './auto-fields.service'
import { hasMoney, validateTemplateFields, validateValues } from './domain/report-fields'
import {
  addDays,
  dueMinuteOf,
  onTimeOf,
  periodKeyOf,
  recentPeriodStarts,
} from './domain/report-slots'

export interface TemplateInput {
  code: string
  name: string
  cadence: ReportCadence
  branchId: string
  fields: ReportField[]
  shiftTemplateIds: number[]
  dueOffsetMinutes: number
  reviewMode: ReportReviewMode
  kenhNv: boolean
  active: boolean
  positions: { positionId: number; role: 'nop' | 'du-phong' }[]
}

type TemplateRec = typeof reportTemplates.$inferSelect
type ReportRec = typeof workReports.$inferSelect
type ShiftRec = typeof shiftTemplates.$inferSelect

const conflict = (code: string, message: string) => new ConflictException({ code, message })
const forbidden = (code: string, message: string) => new ForbiddenException({ code, message })
const reportNotFound = () =>
  new NotFoundException({ code: 'report_not_found', message: 'Không có báo cáo này' })

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
const shiftLabel = (s: ShiftRec) => `${s.name} ${hhmm(s.startMinute)}–${hhmm(s.endMinute)}`
const slotKey = (templateId: number, periodKey: string, shiftId: number | null) =>
  `${templateId}|${periodKey}|${shiftId ?? 0}`
const iso = (at: Date | null) => at?.toISOString() ?? null

/** Một suất cùng dữ liệu nội bộ cần để mở / nộp */
interface Slot extends ReportSlot {
  periodStart: string
}

/**
 * Báo cáo công việc — N7 (Office), mục "Cần nộp" ở N1 và Kênh nhân viên (N15).
 *
 * Ai nộp: người giữ ghế của mẫu (ghế `nop` hoặc `du-phong`); báo cáo theo ca thì
 * thêm điều kiện đứng đúng ca đã công bố. Ai xác nhận: cấp trên theo sơ đồ, hoặc
 * người nhận ca sau (sổ giao ca). Không ai tự xác nhận báo cáo của mình.
 */
@Injectable()
export class WorkReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly org: OrgService,
    private readonly params: ParamsService,
    private readonly audit: AuditService,
    private readonly auto: AutoFieldsService,
  ) {}

  // ================================================================ Mẫu

  async templates(actor: Actor, branchId?: string): Promise<ReportTemplateView[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'report', snap)
    const rows = await this.db
      .select()
      .from(reportTemplates)
      .where(branchId ? eq(reportTemplates.branchId, branchId) : undefined)
      .orderBy(asc(reportTemplates.branchId), asc(reportTemplates.name))
    return this.toTemplateViews(rows.filter((t) => scope.chain || scope.branchIds.has(t.branchId)))
  }

  async saveTemplate(actor: Actor, id: number | null, input: TemplateInput) {
    const me = requireStaff(actor)
    const check = validateTemplateFields(input.fields)
    if (!check.ok) throw conflict(check.code, check.message)
    if (input.kenhNv && hasMoney(input.fields)) {
      throw conflict(
        'report_money_on_phone',
        'Mẫu có trường tiền không nộp trên Kênh nhân viên — tiền chỉ nộp ở máy của quán',
      )
    }
    const snap = await this.org.snapshot()
    for (const p of input.positions) {
      const position = snap.positions.get(p.positionId)
      if (!position?.active || this.branchOfPosition(snap, p.positionId) !== input.branchId) {
        throw new BadRequestException({
          code: 'position_wrong_branch',
          message: 'Ghế nộp báo cáo phải thuộc chi nhánh của mẫu',
        })
      }
    }
    if (input.positions.length === 0) {
      throw new BadRequestException({ code: 'report_no_position', message: 'Chọn ghế nộp báo cáo' })
    }

    return this.db.transaction(async (tx) => {
      let templateId: number
      if (id === null) {
        const [row] = await tx
          .insert(reportTemplates)
          .values({ ...input, createdBy: me.staffId })
          .onConflictDoNothing({ target: [reportTemplates.branchId, reportTemplates.code] })
          .returning({ id: reportTemplates.id })
        if (!row) throw conflict('report_code_exists', 'Chi nhánh đã có mẫu mang mã này')
        templateId = row.id
      } else {
        const [current] = await tx.select().from(reportTemplates).where(eq(reportTemplates.id, id))
        if (!current) {
          throw new NotFoundException({ code: 'template_not_found', message: 'Không có mẫu này' })
        }
        // Đổi trường là đổi phiên bản: bản nộp cũ vẫn đọc theo danh sách trường của nó
        const changed = JSON.stringify(current.fields) !== JSON.stringify(input.fields)
        await tx
          .update(reportTemplates)
          .set({
            ...input,
            branchId: current.branchId,
            code: current.code,
            version: changed ? current.version + 1 : current.version,
            updatedAt: new Date(),
          })
          .where(eq(reportTemplates.id, id))
        await tx.delete(reportTemplatePositions).where(eq(reportTemplatePositions.templateId, id))
        templateId = id
      }
      await tx
        .insert(reportTemplatePositions)
        .values(input.positions.map((p) => ({ templateId, ...p })))
      await this.audit.write(tx, {
        actor,
        action: id === null ? 'report-template.created' : 'report-template.updated',
        entity: 'report_template',
        entityId: String(templateId),
        payload: { code: input.code, name: input.name },
      })
      return { id: templateId }
    })
  }

  /**
   * Ba mẫu chuẩn cho một chi nhánh — idempotent theo mã. Ghế nộp tìm theo tên bộ
   * phận + chức danh trên sơ đồ; chi nhánh chưa có ca mẫu thì báo cáo theo ca
   * thành báo cáo ngày.
   */
  async applyStandard(actor: Actor, branchId: string) {
    const me = requireStaff(actor)
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
      .where(eq(orgUnits.parentId, branchUnit.id))
    const seats = await this.db
      .select({ id: positions.id, unitId: positions.unitId, title: positions.title })
      .from(positions)
      .where(eq(positions.active, true))
    const seatOf = (seat: StandardSeat) => {
      const unitId =
        seat.unit === null ? branchUnit.id : children.find((c) => c.name === seat.unit)?.id
      return seats.find((p) => p.unitId === unitId && p.title === seat.title)?.id
    }
    const shiftIds = (
      await this.db
        .select({ id: shiftTemplates.id })
        .from(shiftTemplates)
        .where(eq(shiftTemplates.branchId, branchId))
    ).map((s) => s.id)
    const existing = new Set(
      (
        await this.db
          .select({ code: reportTemplates.code })
          .from(reportTemplates)
          .where(eq(reportTemplates.branchId, branchId))
      ).map((t) => t.code),
    )

    let created = 0
    const skipped: { name: string; reason: string }[] = []
    for (const t of STANDARD_REPORT_TEMPLATES) {
      if (existing.has(t.code)) continue
      const resolved = t.positions.map((p) => ({ ...p, positionId: seatOf(p.seat) }))
      const missing = resolved.find((p) => p.positionId === undefined && p.role === 'nop')
      if (missing) {
        skipped.push({ name: t.name, reason: `Chưa có chức danh "${missing.seat.title}"` })
        continue
      }
      const byShift = t.cadence === 'ca' && shiftIds.length > 0
      await this.saveTemplate(me, null, {
        code: t.code,
        name: t.name,
        cadence: t.cadence === 'ca' && !byShift ? 'ngay' : t.cadence,
        branchId,
        fields: t.fields,
        shiftTemplateIds: [],
        dueOffsetMinutes:
          t.cadence === 'ca' && !byShift ? (t.fallbackDueMinute ?? 1410) : t.dueOffsetMinutes,
        reviewMode: t.reviewMode,
        kenhNv: t.kenhNv,
        active: true,
        positions: resolved
          .filter((p) => p.positionId !== undefined)
          .map((p) => ({ positionId: p.positionId!, role: p.role })),
      })
      created++
    }
    return { created, skipped, withoutShifts: shiftIds.length === 0 }
  }

  // ================================================================ Suất phải nộp

  /** Suất báo cáo của tôi (7 ngày gần nhất) — đã sắp: quá hạn, sắp tới hạn, đã nộp */
  async myDue(actor: Actor): Promise<ReportSlot[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const mine = new Set(
      snap.holdings.filter((h) => h.staffId === me.staffId).map((h) => h.positionId),
    )
    if (mine.size === 0) return []
    const links = await this.db
      .select({
        templateId: reportTemplatePositions.templateId,
        role: reportTemplatePositions.role,
      })
      .from(reportTemplatePositions)
      .where(inArray(reportTemplatePositions.positionId, [...mine]))
    const ids = [...new Set(links.map((l) => l.templateId))]
    if (ids.length === 0) return []
    /** Mẫu tôi chỉ là người nộp THAY: chỉ hiện suất đã quá hạn mà người chính chưa nộp */
    const primary = new Set(links.filter((l) => l.role === 'nop').map((l) => l.templateId))
    const templates = await this.db
      .select()
      .from(reportTemplates)
      .where(and(inArray(reportTemplates.id, ids), eq(reportTemplates.active, true)))
    const slots = await this.slotsOf(templates, me.staffId)
    return slots
      .filter((s) => primary.has(s.templateId) || s.overdue || s.state !== null)
      .map(({ periodStart: _p, ...slot }) => slot)
  }

  /** N7 · "Còn thiếu": suất đã quá hạn mà chưa có bản nộp, của các chi nhánh trong phạm vi */
  async missing(actor: Actor, branchId?: string): Promise<ReportSlot[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'report', snap)
    const templates = (
      await this.db
        .select()
        .from(reportTemplates)
        .where(
          and(
            eq(reportTemplates.active, true),
            branchId ? eq(reportTemplates.branchId, branchId) : undefined,
          ),
        )
    ).filter((t) => scope.chain || scope.branchIds.has(t.branchId))
    const slots = await this.slotsOf(templates, null)
    return slots.filter((s) => s.overdue).map(({ periodStart: _p, ...slot }) => slot)
  }

  // ================================================================ Bản báo cáo

  /** Mở (hoặc lấy lại) bản nháp của một suất — một suất một bản, ai trong ghế cũng mở được */
  async openDraft(
    actor: Actor,
    input: { templateId: number; periodKey: string; shiftTemplateId: number | null },
  ): Promise<WorkReportDetail> {
    const me = requireStaff(actor)
    const [template] = await this.db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.id, input.templateId))
    if (!template?.active) {
      throw new NotFoundException({ code: 'template_not_found', message: 'Không có mẫu này' })
    }
    const snap = await this.org.snapshot()
    const seats = (
      await this.db
        .select({ positionId: reportTemplatePositions.positionId })
        .from(reportTemplatePositions)
        .where(eq(reportTemplatePositions.templateId, template.id))
    ).map((s) => s.positionId)
    const holds = snap.holdings.some(
      (h) => h.staffId === me.staffId && seats.includes(h.positionId),
    )
    const slot = (await this.slotsOf([template], me.staffId)).find(
      (s) => s.periodKey === input.periodKey && s.shiftTemplateId === input.shiftTemplateId,
    )
    if (!slot || !holds) {
      throw forbidden('report_not_yours', 'Bạn không phải người nộp báo cáo này ở kỳ/ca này')
    }
    const [created] = await this.db
      .insert(workReports)
      .values({
        templateId: template.id,
        templateVersion: template.version,
        fieldsSnapshot: template.fields,
        branchId: template.branchId,
        businessDate: slot.periodStart,
        shiftTemplateId: slot.shiftTemplateId,
        periodKey: slot.periodKey,
        authorId: me.staffId,
        dueAt: new Date(slot.dueAt),
      })
      .onConflictDoNothing()
      .returning({ id: workReports.id })
    const id =
      created?.id ??
      (
        await this.db
          .select({ id: workReports.id })
          .from(workReports)
          .where(
            and(
              eq(workReports.templateId, template.id),
              eq(workReports.periodKey, slot.periodKey),
              sql`coalesce(${workReports.shiftTemplateId}, 0) = ${slot.shiftTemplateId ?? 0}`,
            ),
          )
      )[0]!.id
    return this.mineDetail(me, id)
  }

  async mineDetail(actor: Actor, id: number): Promise<WorkReportDetail> {
    const me = requireStaff(actor)
    const report = await this.requireReport(id)
    const snap = await this.org.snapshot()
    const submitter = await this.isSubmitter(me.staffId, report, snap)
    if (!submitter && report.authorId !== me.staffId) throw reportNotFound()
    return this.detailOf(report, me, snap, { submitter, reviewer: false })
  }

  async detail(actor: Actor, id: number): Promise<WorkReportDetail> {
    const me = requireStaff(actor)
    const report = await this.requireReport(id)
    const snap = await this.org.snapshot()
    const submitter = await this.isSubmitter(me.staffId, report, snap)
    const reviewer = await this.mayReview(me.staffId, report, snap)
    const scope = scopeOf(me.staffId, 'report', snap)
    const visible =
      submitter ||
      reviewer ||
      report.authorId === me.staffId ||
      scope.chain ||
      scope.branchIds.has(report.branchId)
    if (!visible) throw reportNotFound()
    return this.detailOf(report, me, snap, { submitter, reviewer })
  }

  async saveDraft(actor: Actor, id: number, values: Record<string, ReportValue>) {
    const me = requireStaff(actor)
    const report = await this.requireReport(id)
    if (!(await this.isSubmitter(me.staffId, report, await this.org.snapshot()))) {
      throw reportNotFound()
    }
    const [row] = await this.db
      .update(workReports)
      .set({ values, updatedAt: new Date() })
      .where(and(eq(workReports.id, id), eq(workReports.state, 'draft')))
      .returning({ id: workReports.id })
    if (!row) throw conflict('report_not_draft', 'Báo cáo đã nộp — viết bổ sung thay vì sửa')
    return { id }
  }

  /**
   * Nộp: tính số tự điền và ĐÓNG BĂNG cùng transaction; kiểm trường bắt buộc (cả
   * "bắt buộc khi…" theo số vừa tính). Kênh nhân viên chỉ nộp được mẫu không có
   * tiền — tiền chỉ nộp ở máy của quán.
   */
  async submit(actor: Actor, id: number, viaChannel: boolean) {
    const me = requireStaff(actor)
    const report = await this.requireReport(id)
    const snap = await this.org.snapshot()
    if (!(await this.isSubmitter(me.staffId, report, snap))) throw reportNotFound()
    const [template] = await this.db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.id, report.templateId))
    if (viaChannel && !template?.kenhNv) {
      throw forbidden(
        'workreport_need_office',
        'Báo cáo này có số tiền — nộp ở máy của quán (Office), không nộp trên điện thoại',
      )
    }
    if (report.state !== 'draft') {
      throw conflict('report_not_draft', 'Báo cáo đã nộp')
    }
    const fields = report.fieldsSnapshot as ReportField[]
    const roles = this.rolesOf(snap, me.staffId)
    const grace = await this.params.getNumber('workreport.graceMinutes', 15, report.branchId)

    return this.db.transaction(async (tx) => {
      const computed = await this.auto.compute(
        fields.flatMap((f) => (f.auto ? [f.auto] : [])),
        {
          branchId: report.branchId,
          date: report.businessDate,
          shiftTemplateId: report.shiftTemplateId,
          roles,
        },
        tx,
      )
      const autoValues: Record<string, AutoValue> = {}
      for (const f of fields) if (f.auto) autoValues[f.key] = computed[f.auto]!
      const values = report.values as Record<string, ReportValue>
      const check = validateValues(fields, values, autoValues)
      if (!check.ok) throw conflict(check.code, check.message)

      const at = new Date()
      const [row] = await tx
        .update(workReports)
        .set({
          state: 'submitted',
          autoValues,
          authorId: me.staffId,
          channel: viaChannel ? 'kenh-nv' : 'office',
          submittedAt: at,
          onTime: onTimeOf(at, report.dueAt, grace),
          updatedAt: at,
        })
        .where(and(eq(workReports.id, id), eq(workReports.state, 'draft')))
        .returning({ id: workReports.id, onTime: workReports.onTime })
      if (!row) throw conflict('report_not_draft', 'Báo cáo vừa được người cùng ghế nộp')
      await this.audit.write(tx, {
        actor,
        action: 'work-report.submitted',
        entity: 'work_report',
        entityId: String(id),
        payload: { templateId: report.templateId, periodKey: report.periodKey },
      })
      return { id, onTime: row.onTime }
    })
  }

  async review(actor: Actor, id: number, note: string | null) {
    const me = requireStaff(actor)
    const report = await this.requireReport(id)
    if (report.state !== 'submitted') {
      throw conflict('report_not_submitted', 'Báo cáo chưa nộp hoặc đã được xác nhận')
    }
    if (report.authorId === me.staffId) {
      throw conflict('self_review', 'Không tự xác nhận báo cáo của mình')
    }
    const snap = await this.org.snapshot()
    if (!(await this.mayReview(me.staffId, report, snap))) {
      throw forbidden('report_not_reviewer', 'Bạn không phải người xác nhận báo cáo này')
    }
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(workReports)
        .set({
          state: 'reviewed',
          reviewedBy: me.staffId,
          reviewedAt: new Date(),
          reviewNote: note?.trim() || null,
          updatedAt: new Date(),
        })
        .where(and(eq(workReports.id, id), eq(workReports.state, 'submitted')))
        .returning({ id: workReports.id })
      if (!row) throw conflict('report_not_submitted', 'Báo cáo vừa được người khác xác nhận')
      await this.audit.write(tx, {
        actor,
        action: 'work-report.reviewed',
        entity: 'work_report',
        entityId: String(id),
        payload: { note },
      })
      return { id }
    })
  }

  /** Bổ sung sau khi nộp — người nộp, người xác nhận hoặc quản lý trong phạm vi */
  async addendum(actor: Actor, id: number, body: string) {
    const me = requireStaff(actor)
    const report = await this.requireReport(id)
    if (report.state === 'draft') {
      throw conflict('report_not_submitted', 'Báo cáo còn nháp — sửa thẳng vào bản nháp')
    }
    const snap = await this.org.snapshot()
    const allowed =
      report.authorId === me.staffId ||
      (await this.isSubmitter(me.staffId, report, snap)) ||
      (await this.mayReview(me.staffId, report, snap))
    if (!allowed) throw reportNotFound()
    const [row] = await this.db
      .insert(workReportAddenda)
      .values({ reportId: id, authorId: me.staffId, body })
      .returning({ id: workReportAddenda.id })
    return { id: row!.id }
  }

  /** N7: báo cáo trong phạm vi; `can-xem` = đã nộp, đang chờ chính tôi xác nhận */
  async list(
    actor: Actor,
    q: { view: 'can-xem' | 'tat-ca'; branchId?: string; from?: string; to?: string },
  ): Promise<WorkReportRow[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'report', snap)
    const today = todayVN()
    const rows = await this.db
      .select()
      .from(workReports)
      .where(
        and(
          q.branchId ? eq(workReports.branchId, q.branchId) : undefined,
          q.view === 'can-xem'
            ? eq(workReports.state, 'submitted')
            : and(
                gte(workReports.businessDate, q.from ?? addDays(today, -30)),
                lte(workReports.businessDate, q.to ?? today),
              ),
        ),
      )
      .orderBy(desc(workReports.businessDate), desc(workReports.id))
      .limit(500)
    const visible: ReportRec[] = []
    for (const r of rows) {
      if (q.view === 'can-xem') {
        if (r.authorId !== me.staffId && (await this.mayReview(me.staffId, r, snap)))
          visible.push(r)
      } else if (scope.chain || scope.branchIds.has(r.branchId) || r.authorId === me.staffId) {
        visible.push(r)
      }
    }
    return this.toRows(visible)
  }

  /** Số đếm cho hộp việc */
  async counts(actor: Actor) {
    const me = requireStaff(actor)
    const due = await this.myDue(me)
    const open = due.filter((s) => s.state === null || s.state === 'draft')
    // Chỉ người có khoá xem báo cáo mới có hàng chờ xác nhận — khỏi dò từng bản cho phục vụ
    const toReview =
      checkPermission('workreport.review', actorRoles(me)) === 'deny'
        ? 0
        : (await this.list(me, { view: 'can-xem' })).length
    return {
      due: open.length,
      overdue: open.filter((s) => s.overdue).length,
      toReview,
    }
  }

  // ================================================================ Nội bộ

  private rolesOf(snap: OrgSnapshot, staffId: number): Role[] {
    return (snap.people.get(staffId)?.roles ?? []).map((g) => g.role)
  }

  private branchOfPosition(snap: OrgSnapshot, positionId: number): string | null {
    const position = snap.positions.get(positionId)
    if (!position) return null
    let unit = snap.units.get(position.unitId)
    for (let i = 0; unit && i < 64; i++) {
      if (unit.branchId) return unit.branchId
      unit = unit.parentId !== null ? snap.units.get(unit.parentId) : undefined
    }
    return null
  }

  private async requireReport(id: number): Promise<ReportRec> {
    const [report] = await this.db.select().from(workReports).where(eq(workReports.id, id))
    if (!report) throw reportNotFound()
    return report
  }

  /** Người nộp được: giữ ghế của mẫu; theo ca thì phải đứng đúng ca đã công bố ngày đó */
  private async isSubmitter(staffId: number, report: ReportRec, snap: OrgSnapshot) {
    const seats = (
      await this.db
        .select({ positionId: reportTemplatePositions.positionId })
        .from(reportTemplatePositions)
        .where(eq(reportTemplatePositions.templateId, report.templateId))
    ).map((s) => s.positionId)
    const holds = snap.holdings.some((h) => h.staffId === staffId && seats.includes(h.positionId))
    if (!holds) return false
    if (report.shiftTemplateId === null) return true
    return this.onShift(staffId, report.branchId, report.businessDate, report.shiftTemplateId)
  }

  private async onShift(staffId: number, branchId: string, date: string, shiftId: number) {
    const [shift] = await this.db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.id, shiftId))
    if (!shift) return false
    const [row] = await this.db
      .select({ id: scheduleEntries.id })
      .from(scheduleEntries)
      .innerJoin(employees, eq(employees.id, scheduleEntries.employeeId))
      .where(
        and(
          eq(employees.staffId, staffId),
          eq(scheduleEntries.branchId, branchId),
          eq(scheduleEntries.workDate, date),
          eq(scheduleEntries.state, 'published'),
          sql`(${scheduleEntries.templateId} = ${shift.id}
               OR (${scheduleEntries.templateId} IS NULL
                   AND ${scheduleEntries.startMinute} = ${shift.startMinute}
                   AND ${scheduleEntries.endMinute} = ${shift.endMinute}))`,
        ),
      )
    return Boolean(row)
  }

  /**
   * Người xác nhận: theo chế độ của mẫu. Cấp trên = cấp trên trực tiếp theo sơ đồ
   * hoặc người có phạm vi "báo cáo" phủ chi nhánh; ca sau = người cùng ghế nộp
   * (quản lý ca của ca sau), khác người viết. Không ai tự xác nhận.
   */
  private async mayReview(staffId: number, report: ReportRec, snap: OrgSnapshot) {
    if (report.authorId === staffId || report.state === 'draft') return false
    const [template] = await this.db
      .select({ reviewMode: reportTemplates.reviewMode })
      .from(reportTemplates)
      .where(eq(reportTemplates.id, report.templateId))
    if (!template || template.reviewMode === 'khong') return false
    const scope = scopeOf(staffId, 'report', snap)
    // Cấp trên trực tiếp, người nhìn cả chuỗi, hoặc người có người viết trong cây con
    // của mình — bếp trưởng không xác nhận báo cáo cuối ngày của quản lý chi nhánh
    const manager =
      managersOf(report.authorId, snap).includes(staffId) || inScope(scope, report.authorId, snap)
    if (template.reviewMode === 'cap-tren') return manager
    // Ca sau: người cùng ghế nộp (không cần đứng đúng ca của bản này) hoặc quản lý
    const seats = (
      await this.db
        .select({ positionId: reportTemplatePositions.positionId })
        .from(reportTemplatePositions)
        .where(eq(reportTemplatePositions.templateId, report.templateId))
    ).map((s) => s.positionId)
    return (
      manager || snap.holdings.some((h) => h.staffId === staffId && seats.includes(h.positionId))
    )
  }

  /**
   * Suất phải nộp của các mẫu trong 7 ngày (4 tuần / 2 tháng) gần nhất. `forStaff`:
   * chỉ những ca người đó đứng (báo cáo theo ca).
   */
  private async slotsOf(templates: TemplateRec[], forStaff: number | null): Promise<Slot[]> {
    if (templates.length === 0) return []
    const branchIds = [...new Set(templates.map((t) => t.branchId))]
    const zones = new Map(
      (
        await this.db
          .select({ id: branches.id, timezone: branches.timezone })
          .from(branches)
          .where(inArray(branches.id, branchIds))
      ).map((b) => [b.id, b.timezone]),
    )
    const now = new Date()
    const grace = await this.params.getNumber('workreport.graceMinutes', 15)
    const shifts = await this.db
      .select()
      .from(shiftTemplates)
      .where(inArray(shiftTemplates.branchId, branchIds))
    const today = todayVN()
    const entries = templates.some((t) => t.cadence === 'ca')
      ? await this.db
          .select({
            branchId: scheduleEntries.branchId,
            workDate: scheduleEntries.workDate,
            templateId: scheduleEntries.templateId,
            startMinute: scheduleEntries.startMinute,
            endMinute: scheduleEntries.endMinute,
            staffId: employees.staffId,
          })
          .from(scheduleEntries)
          .innerJoin(employees, eq(employees.id, scheduleEntries.employeeId))
          .where(
            and(
              inArray(scheduleEntries.branchId, branchIds),
              eq(scheduleEntries.state, 'published'),
              gte(scheduleEntries.workDate, addDays(today, -7)),
              lte(scheduleEntries.workDate, addDays(today, 1)),
            ),
          )
      : []
    /** Ca mẫu của một ô lịch: khoá ca mẫu, hoặc khớp giờ với một ca mẫu của chi nhánh */
    const shiftOf = (e: (typeof entries)[number]) =>
      e.templateId ??
      shifts.find(
        (s) =>
          s.branchId === e.branchId &&
          s.startMinute === e.startMinute &&
          s.endMinute === e.endMinute,
      )?.id ??
      null

    const out: Slot[] = []
    for (const t of templates) {
      const tz = zones.get(t.branchId) ?? ORG_TZ
      const local = businessDateOf(now, tz)
      for (const periodStart of recentPeriodStarts(t.cadence, local)) {
        const periodKey = periodKeyOf(t.cadence, periodStart)
        const shiftIds: (number | null)[] =
          t.cadence === 'ca'
            ? [
                ...new Set(
                  entries
                    .filter(
                      (e) =>
                        e.branchId === t.branchId &&
                        e.workDate === periodStart &&
                        (forStaff === null || e.staffId === forStaff),
                    )
                    .map(shiftOf)
                    .filter(
                      (id): id is number =>
                        id !== null &&
                        (t.shiftTemplateIds.length === 0 || t.shiftTemplateIds.includes(id)),
                    ),
                ),
              ]
            : [null]
        for (const shiftId of shiftIds) {
          const shift = shiftId !== null ? shifts.find((s) => s.id === shiftId) : undefined
          const due = new Date(
            startOfBusinessDay(periodStart, tz).getTime() +
              dueMinuteOf(t.cadence, periodStart, t.dueOffsetMinutes, shift?.endMinute ?? null) *
                60_000,
          )
          out.push({
            templateId: t.id,
            templateName: t.name,
            cadence: t.cadence,
            branchId: t.branchId,
            businessDate: periodStart,
            periodStart,
            periodKey,
            shiftTemplateId: shiftId,
            shiftLabel: shift ? shiftLabel(shift) : null,
            dueAt: due.toISOString(),
            kenhNv: t.kenhNv,
            reportId: null,
            state: null,
            overdue: now.getTime() > due.getTime() + grace * 60_000,
          })
        }
      }
    }
    if (out.length === 0) return []

    const reports = await this.db
      .select({
        id: workReports.id,
        templateId: workReports.templateId,
        periodKey: workReports.periodKey,
        shiftTemplateId: workReports.shiftTemplateId,
        state: workReports.state,
      })
      .from(workReports)
      .where(
        and(
          inArray(
            workReports.templateId,
            templates.map((t) => t.id),
          ),
          inArray(workReports.periodKey, [...new Set(out.map((s) => s.periodKey))]),
        ),
      )
    const byKey = new Map(
      reports.map((r) => [slotKey(r.templateId, r.periodKey, r.shiftTemplateId), r]),
    )
    for (const slot of out) {
      const report = byKey.get(slotKey(slot.templateId, slot.periodKey, slot.shiftTemplateId))
      if (!report) continue
      slot.reportId = report.id
      slot.state = report.state
      if (report.state !== 'draft') slot.overdue = false
    }
    return out.sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        Number(a.state !== null && a.state !== 'draft') -
          Number(b.state !== null && b.state !== 'draft') ||
        a.dueAt.localeCompare(b.dueAt),
    )
  }

  private async toRows(rows: ReportRec[]): Promise<WorkReportRow[]> {
    if (rows.length === 0) return []
    const templateNames = new Map(
      (
        await this.db
          .select({ id: reportTemplates.id, name: reportTemplates.name })
          .from(reportTemplates)
          .where(inArray(reportTemplates.id, [...new Set(rows.map((r) => r.templateId))]))
      ).map((t) => [t.id, t.name]),
    )
    const staffIds = [
      ...new Set(
        rows.flatMap((r) => [r.authorId, r.reviewedBy]).filter((x): x is number => x !== null),
      ),
    ]
    const names = new Map(
      (
        await this.db
          .select({ id: staff.id, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, staffIds))
      ).map((s) => [s.id, s.fullName]),
    )
    const shiftIds = [
      ...new Set(rows.map((r) => r.shiftTemplateId).filter((x): x is number => x !== null)),
    ]
    const shiftNames = new Map(
      shiftIds.length === 0
        ? []
        : (
            await this.db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds))
          ).map((s) => [s.id, shiftLabel(s)]),
    )
    const addenda = new Map(
      (
        await this.db
          .select({ reportId: workReportAddenda.reportId, n: sql<number>`count(*)::int` })
          .from(workReportAddenda)
          .where(
            inArray(
              workReportAddenda.reportId,
              rows.map((r) => r.id),
            ),
          )
          .groupBy(workReportAddenda.reportId)
      ).map((a) => [a.reportId, a.n]),
    )
    return rows.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      templateName: templateNames.get(r.templateId) ?? '',
      branchId: r.branchId,
      businessDate: r.businessDate,
      periodKey: r.periodKey,
      shiftLabel: r.shiftTemplateId !== null ? (shiftNames.get(r.shiftTemplateId) ?? null) : null,
      state: r.state,
      authorName: names.get(r.authorId) ?? '',
      channel: r.channel,
      dueAt: r.dueAt.toISOString(),
      submittedAt: iso(r.submittedAt),
      onTime: r.onTime,
      reviewedByName: r.reviewedBy !== null ? (names.get(r.reviewedBy) ?? null) : null,
      reviewedAt: iso(r.reviewedAt),
      addendaCount: addenda.get(r.id) ?? 0,
    }))
  }

  private async detailOf(
    report: ReportRec,
    me: StaffActor,
    snap: OrgSnapshot,
    who: { submitter: boolean; reviewer: boolean },
  ): Promise<WorkReportDetail> {
    const [row] = await this.toRows([report])
    const [template] = await this.db
      .select({ reviewMode: reportTemplates.reviewMode })
      .from(reportTemplates)
      .where(eq(reportTemplates.id, report.templateId))
    const fields = report.fieldsSnapshot as ReportField[]
    const roles = this.rolesOf(snap, me.staffId)
    const autoOf = Object.fromEntries(fields.map((f) => [f.key, f.auto])) as Record<
      string,
      ReportAutoKey | undefined
    >
    // Nháp: số tự điền là XEM TRƯỚC, tính lại mỗi lần mở; đã nộp: số đóng băng
    let autoValues: Record<string, AutoValue>
    if (report.state === 'draft') {
      const computed = await this.auto.compute(
        fields.flatMap((f) => (f.auto ? [f.auto] : [])),
        {
          branchId: report.branchId,
          date: report.businessDate,
          shiftTemplateId: report.shiftTemplateId,
          roles,
        },
      )
      autoValues = {}
      for (const f of fields) if (f.auto) autoValues[f.key] = computed[f.auto]!
    } else {
      autoValues = this.auto.mask(report.autoValues as Record<string, AutoValue>, autoOf, roles)
    }
    const addenda = await this.db
      .select({
        id: workReportAddenda.id,
        body: workReportAddenda.body,
        createdAt: workReportAddenda.createdAt,
        authorName: staff.fullName,
      })
      .from(workReportAddenda)
      .innerJoin(staff, eq(staff.id, workReportAddenda.authorId))
      .where(eq(workReportAddenda.reportId, report.id))
      .orderBy(asc(workReportAddenda.createdAt))
    const draft = report.state === 'draft'
    return {
      ...row!,
      reviewMode: template?.reviewMode ?? 'khong',
      fields,
      values: report.values as Record<string, ReportValue>,
      autoValues,
      reviewNote: report.reviewNote,
      addenda: addenda.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      canEdit: draft && who.submitter,
      canSubmit: draft && who.submitter,
      canReview: report.state === 'submitted' && who.reviewer && report.authorId !== me.staffId,
      canAddendum: !draft && (report.authorId === me.staffId || who.submitter || who.reviewer),
    }
  }

  private async toTemplateViews(rows: TemplateRec[]): Promise<ReportTemplateView[]> {
    if (rows.length === 0) return []
    const links = await this.db
      .select({
        templateId: reportTemplatePositions.templateId,
        positionId: reportTemplatePositions.positionId,
        role: reportTemplatePositions.role,
        title: positions.title,
        unitName: orgUnits.name,
      })
      .from(reportTemplatePositions)
      .innerJoin(positions, eq(positions.id, reportTemplatePositions.positionId))
      .innerJoin(orgUnits, eq(orgUnits.id, positions.unitId))
      .where(
        inArray(
          reportTemplatePositions.templateId,
          rows.map((r) => r.id),
        ),
      )
    return rows.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      cadence: t.cadence,
      branchId: t.branchId,
      version: t.version,
      fields: t.fields as ReportField[],
      shiftTemplateIds: t.shiftTemplateIds,
      dueOffsetMinutes: t.dueOffsetMinutes,
      reviewMode: t.reviewMode,
      kenhNv: t.kenhNv,
      active: t.active,
      positions: links.filter((l) => l.templateId === t.id).map(({ templateId: _t, ...l }) => l),
    }))
  }
}
