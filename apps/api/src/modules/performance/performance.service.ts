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
  KPI_METRICS,
  STANDARD_KPI_SETS,
  type KpiBonusSuggestions,
  type KpiCycleView,
  type KpiItemView,
  type KpiMetricCode,
  type KpiObservationKind,
  type KpiObservationView,
  type KpiReviewDetail,
  type KpiReviewRow,
  type KpiRules,
  type KpiTemplateView,
  type Role,
} from '@sora/contracts'
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  employees,
  kpiCycles,
  kpiObservations,
  kpiReviewItems,
  kpiReviews,
  kpiTemplateItems,
  kpiTemplates,
  orgUnits,
  payrollPeriods,
  positions,
  staff,
} from '../../db/schema'
import type { Actor, StaffActor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { branchOfUnit, managersOf, scopeOf, type OrgSnapshot } from '../org/domain/org'
import { OrgService, requireStaff, todayVN } from '../org/org.service'
import { bonusOf, checkWeights, scoreOf, type ScoreItem } from './domain/kpi-score'
import { MetricsService, type MetricSubject } from './metrics.service'

type CycleRec = typeof kpiCycles.$inferSelect
type ReviewRec = typeof kpiReviews.$inferSelect
type ItemRec = typeof kpiReviewItems.$inferSelect

const conflict = (code: string, message: string) => new ConflictException({ code, message })
const forbidden = (code: string, message: string) => new ForbiddenException({ code, message })
const notFound = (what: string) =>
  new NotFoundException({ code: 'kpi_not_found', message: `Không có ${what} này` })

const iso = (at: Date | null) => at?.toISOString() ?? null

function addMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number)
  const at = new Date(Date.UTC(y!, m! - 1 + months, 1))
  return at.toISOString().slice(0, 10)
}

/**
 * KPI — bộ KPI theo chức danh (N9), kỳ đánh giá (N10), phiếu kiểm tra (N11), KPI
 * của tôi (N14) và thưởng gợi ý cho kỳ lương H7.
 *
 * Bốn cam kết:
 *   1. Luật chấm, mức thưởng đóng băng lúc MỞ kỳ (Điều 104) — đổi A6 giữa kỳ không
 *      đổi kỳ đang chạy.
 *   2. Không ai tự chấm, tự chốt KPI của chính mình (CHECK + service).
 *   3. Thưởng gợi ý chỉ người có `payroll.view-others` thấy; H7 điền sẵn, người
 *      tính lương xác nhận — không tự cộng vào lương.
 *   4. Không phạt, không khấu trừ (Điều 127): hạng D nghĩa là thưởng gợi ý 0.
 */
@Injectable()
export class PerformanceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly org: OrgService,
    private readonly params: ParamsService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  // ================================================================ Bộ KPI (N9)

  async templates(actor: Actor): Promise<KpiTemplateView[]> {
    requireStaff(actor)
    const rows = await this.db
      .select({
        t: kpiTemplates,
        positionTitle: positions.title,
        unitName: orgUnits.name,
      })
      .from(kpiTemplates)
      .innerJoin(positions, eq(positions.id, kpiTemplates.positionId))
      .innerJoin(orgUnits, eq(orgUnits.id, positions.unitId))
      .where(eq(kpiTemplates.active, true))
      .orderBy(asc(orgUnits.name), asc(positions.title))
    if (rows.length === 0) return []
    const items = await this.db
      .select()
      .from(kpiTemplateItems)
      .where(
        inArray(
          kpiTemplateItems.templateId,
          rows.map((r) => r.t.id),
        ),
      )
    return rows.map(({ t, positionTitle, unitName }) => ({
      id: t.id,
      positionId: t.positionId,
      positionTitle,
      unitName,
      branchId: t.branchId,
      version: t.version,
      active: t.active,
      items: items
        .filter((i) => i.templateId === t.id)
        .map((i) => ({
          metricCode: i.metricCode as KpiMetricCode,
          weightPct: i.weightPct,
          defaultTargetMilli: i.defaultTargetMilli,
        })),
    }))
  }

  /**
   * Lưu bộ KPI của một ghế = phiên bản MỚI; bản cũ tắt đi chứ không sửa — phiếu
   * của kỳ đã mở đọc theo bộ lúc mở kỳ.
   */
  async saveTemplate(
    actor: Actor,
    input: {
      positionId: number
      items: { metricCode: KpiMetricCode; weightPct: number; defaultTargetMilli: number }[]
    },
  ) {
    const me = requireStaff(actor)
    const check = checkWeights(input.items.map((i) => i.weightPct))
    if (!check.ok) throw conflict('kpi_weights_invalid', check.message)
    if (new Set(input.items.map((i) => i.metricCode)).size !== input.items.length) {
      throw conflict('kpi_metric_duplicate', 'Một chỉ số chỉ xuất hiện một lần trong bộ')
    }
    const snap = await this.org.snapshot()
    const position = snap.positions.get(input.positionId)
    if (!position?.active) throw notFound('chức danh')
    const branchId = branchOfUnit(position.unitId, snap.units)
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .update(kpiTemplates)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(kpiTemplates.positionId, input.positionId), eq(kpiTemplates.active, true)))
        .returning({ version: kpiTemplates.version })
      const [row] = await tx
        .insert(kpiTemplates)
        .values({
          positionId: input.positionId,
          branchId,
          version: (current?.version ?? 0) + 1,
          createdBy: me.staffId,
        })
        .returning({ id: kpiTemplates.id })
      await tx
        .insert(kpiTemplateItems)
        .values(input.items.map((i) => ({ ...i, templateId: row!.id })))
      await this.audit.write(tx, {
        actor,
        action: 'kpi-template.saved',
        entity: 'kpi_template',
        entityId: String(row!.id),
        payload: { positionId: input.positionId, items: input.items },
      })
      return { id: row!.id }
    })
  }

  /** Bộ KPI mẫu cho các ghế CHƯA có bộ — `chuoi` cho ghế văn phòng, mã chi nhánh cho ghế chi nhánh */
  async applyStandard(actor: Actor, target: string) {
    requireStaff(actor)
    const units = await this.db.select().from(orgUnits).where(eq(orgUnits.active, true))
    const seats = await this.db.select().from(positions).where(eq(positions.active, true))
    const withTemplate = new Set(
      (
        await this.db
          .select({ positionId: kpiTemplates.positionId })
          .from(kpiTemplates)
          .where(eq(kpiTemplates.active, true))
      ).map((t) => t.positionId),
    )
    const branchUnit = target === 'chuoi' ? null : units.find((u) => u.branchId === target)
    if (target !== 'chuoi' && !branchUnit) {
      throw conflict('branch_not_on_chart', 'Chi nhánh chưa có trên sơ đồ tổ chức')
    }
    /** Cây con của chi nhánh, để tìm "Bếp", "Tổ quầy sống"… đúng chi nhánh */
    const inBranch = new Set<number>()
    if (branchUnit) {
      inBranch.add(branchUnit.id)
      let grew = true
      while (grew) {
        grew = false
        for (const u of units) {
          if (u.parentId !== null && inBranch.has(u.parentId) && !inBranch.has(u.id)) {
            inBranch.add(u.id)
            grew = true
          }
        }
      }
    }
    let created = 0
    for (const set of STANDARD_KPI_SETS) {
      for (const seat of set.seats) {
        if ((seat.scope === 'chuoi') !== (target === 'chuoi')) continue
        const unit =
          seat.unit === null
            ? branchUnit
            : units.find(
                (u) =>
                  u.name === seat.unit &&
                  (target === 'chuoi'
                    ? !inBranch.has(u.id) && u.branchId === null
                    : inBranch.has(u.id)),
              )
        const position = unit
          ? seats.find((p) => p.unitId === unit.id && p.title === seat.title)
          : undefined
        if (!position || withTemplate.has(position.id)) continue
        await this.saveTemplate(actor, {
          positionId: position.id,
          items: set.items.map((i) => ({
            metricCode: i.metric,
            weightPct: i.weight,
            defaultTargetMilli: Math.round(KPI_METRICS[i.metric].defaultTarget * 1000),
          })),
        })
        withTemplate.add(position.id)
        created++
      }
    }
    return { created }
  }

  // ================================================================ Kỳ (N10)

  async cycles(actor: Actor, branchId?: string): Promise<KpiCycleView[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'kpi', snap)
    const rows = await this.db
      .select()
      .from(kpiCycles)
      .where(branchId ? eq(kpiCycles.branchId, branchId) : undefined)
      .orderBy(desc(kpiCycles.periodStart))
    return this.toCycleViews(rows.filter((c) => scope.chain || scope.branchIds.has(c.branchId)))
  }

  /**
   * Mở kỳ nháp: dựng phiếu cho mọi nhân viên đang làm của chi nhánh, chụp ghế,
   * bộ KPI và người đánh giá (cấp trên trực tiếp theo sơ đồ lúc này).
   */
  async createCycle(
    actor: Actor,
    input: { branchId: string; kind: 'thang' | 'quy'; periodStart: string },
  ) {
    const me = requireStaff(actor)
    const start = `${input.periodStart.slice(0, 7)}-01`
    const end = addMonths(start, input.kind === 'thang' ? 1 : 3)
    const snap = await this.org.snapshot(start)
    const scope = scopeOf(me.staffId, 'kpi', snap)
    if (!scope.chain && !scope.branchIds.has(input.branchId)) {
      throw forbidden('branch_out_of_scope', 'Chi nhánh này nằm ngoài phạm vi của bạn')
    }
    const people = await this.db
      .select({ employeeId: employees.id, staffId: employees.staffId })
      .from(employees)
      .where(
        and(
          eq(employees.branchId, input.branchId),
          eq(employees.active, true),
          lte(employees.startedOn, addDays(end, -1)),
        ),
      )
    const templates = await this.db.select().from(kpiTemplates).where(eq(kpiTemplates.active, true))
    const templateItems = templates.length
      ? await this.db
          .select()
          .from(kpiTemplateItems)
          .where(
            inArray(
              kpiTemplateItems.templateId,
              templates.map((t) => t.id),
            ),
          )
      : []
    const titles = new Map(
      (await this.db.select({ id: positions.id, title: positions.title }).from(positions)).map(
        (p) => [p.id, p.title],
      ),
    )

    return this.db.transaction(async (tx) => {
      const [cycle] = await tx
        .insert(kpiCycles)
        .values({
          branchId: input.branchId,
          kind: input.kind,
          periodStart: start,
          // Khoảng nửa mở trong code; cột lưu ngày cuối CÙNG của kỳ cho người đọc
          periodEnd: addDays(end, -1),
          createdBy: me.staffId,
        })
        .onConflictDoNothing()
        .returning()
      if (!cycle) throw conflict('kpi_cycle_exists', 'Chi nhánh đã có kỳ KPI cho khoảng này')
      for (const p of people) {
        const main = snap.holdings.find((h) => h.staffId === p.staffId && h.kind === 'chinh')
        const position = main ? snap.positions.get(main.positionId) : undefined
        const template = main ? templates.find((t) => t.positionId === main.positionId) : undefined
        const reviewer = managersOf(p.staffId, snap).find((id) => id !== p.staffId) ?? null
        const [review] = await tx
          .insert(kpiReviews)
          .values({
            cycleId: cycle.id,
            staffId: p.staffId,
            employeeId: p.employeeId,
            positionId: main?.positionId ?? null,
            positionTitle: main ? (titles.get(main.positionId) ?? null) : null,
            unitId: position?.unitId ?? null,
            templateId: template?.id ?? null,
            reviewerId: reviewer,
            exempt: !template,
            exemptReason: template ? null : 'Chức danh chưa có bộ KPI',
          })
          .returning({ id: kpiReviews.id })
        const items = templateItems.filter((i) => i.templateId === template?.id)
        if (items.length > 0) {
          await tx.insert(kpiReviewItems).values(
            items.map((i) => {
              const def = KPI_METRICS[i.metricCode as KpiMetricCode]
              return {
                reviewId: review!.id,
                metricCode: i.metricCode,
                label: def.label,
                unit: def.unit,
                direction: def.direction,
                source: def.source,
                weightPct: i.weightPct,
                targetMilli: i.defaultTargetMilli,
              }
            }),
          )
        }
      }
      await this.audit.write(tx, {
        actor,
        action: 'kpi-cycle.created',
        entity: 'kpi_cycle',
        entityId: String(cycle.id),
        payload: { branchId: input.branchId, periodStart: start, reviews: people.length },
      })
      return { id: cycle.id }
    })
  }

  /** Chỉ tiêu riêng một người — phải ghi lý do; chỉ khi kỳ còn nháp hoặc đang chạy */
  async setTarget(
    actor: Actor,
    reviewId: number,
    input: { metricCode: KpiMetricCode; targetMilli: number; note: string },
  ) {
    requireStaff(actor)
    const { cycle } = await this.loadReview(reviewId)
    if (cycle.state !== 'draft' && cycle.state !== 'open') {
      throw conflict('kpi_cycle_locked', 'Kỳ đã vào đánh giá — không đổi chỉ tiêu')
    }
    const [row] = await this.db
      .update(kpiReviewItems)
      .set({ targetMilli: input.targetMilli, targetSource: 'ca-nhan', targetNote: input.note })
      .where(
        and(eq(kpiReviewItems.reviewId, reviewId), eq(kpiReviewItems.metricCode, input.metricCode)),
      )
      .returning({ reviewId: kpiReviewItems.reviewId })
    if (!row) throw notFound('chỉ số')
    return { reviewId }
  }

  async setExempt(actor: Actor, reviewId: number, reason: string | null) {
    requireStaff(actor)
    const { cycle } = await this.loadReview(reviewId)
    if (cycle.state === 'closed') throw conflict('kpi_cycle_locked', 'Kỳ đã chốt')
    await this.db
      .update(kpiReviews)
      .set({ exempt: reason !== null, exemptReason: reason, updatedAt: new Date() })
      .where(eq(kpiReviews.id, reviewId))
    return { reviewId }
  }

  /** Công bố kỳ: chụp luật chấm và mức thưởng từ A6 — từ đây đổi A6 không đổi kỳ này */
  async openCycle(actor: Actor, cycleId: number, policyUrl: string | null) {
    const me = requireStaff(actor)
    const rules = await this.currentRules()
    const [row] = await this.db
      .update(kpiCycles)
      .set({ state: 'open', rules, policyUrl, openedBy: me.staffId, openedAt: new Date() })
      .where(and(eq(kpiCycles.id, cycleId), eq(kpiCycles.state, 'draft')))
      .returning({ id: kpiCycles.id })
    if (!row) throw conflict('kpi_cycle_not_draft', 'Kỳ không còn ở trạng thái nháp')
    await this.audit.writeStandalone({
      actor,
      action: 'kpi-cycle.opened',
      entity: 'kpi_cycle',
      entityId: String(cycleId),
      payload: { rules, policyUrl },
    })
    return { id: cycleId }
  }

  async startReview(actor: Actor, cycleId: number) {
    const me = requireStaff(actor)
    const cycle = await this.loadCycle(cycleId)
    if (cycle.periodEnd >= todayVN()) {
      throw conflict('kpi_period_not_over', 'Kỳ chưa kết thúc — đánh giá sau ngày cuối kỳ')
    }
    await this.compute(actor, cycleId, true)
    const [row] = await this.db
      .update(kpiCycles)
      .set({ state: 'review', reviewStartedBy: me.staffId, reviewStartedAt: new Date() })
      .where(and(eq(kpiCycles.id, cycleId), eq(kpiCycles.state, 'open')))
      .returning({ id: kpiCycles.id })
    if (!row) throw conflict('kpi_cycle_not_open', 'Kỳ chưa công bố hoặc đã vào đánh giá')
    return { id: cycleId }
  }

  /**
   * Tính lại số tự động của cả kỳ. GET không bao giờ ghi — chỉ bấm "Tính lại" mới
   * ghi. Khoá dòng kỳ (`FOR UPDATE`) và giãn cách `kpi.recomputeMinMinutes`: hai
   * người bấm cùng lúc không chạy hai lượt nặng.
   */
  async compute(actor: Actor, cycleId: number, force = false) {
    requireStaff(actor)
    const minMinutes = await this.params.getNumber('kpi.recomputeMinMinutes', 5)
    return this.db.transaction(async (tx) => {
      const [cycle] = await tx
        .select()
        .from(kpiCycles)
        .where(eq(kpiCycles.id, cycleId))
        .for('update')
      if (!cycle) throw notFound('kỳ KPI')
      if (cycle.state === 'closed') throw conflict('kpi_cycle_locked', 'Kỳ đã chốt')
      if (cycle.state === 'draft')
        throw conflict('kpi_cycle_not_open', 'Công bố kỳ rồi mới tính số')
      if (
        !force &&
        cycle.lastComputedAt &&
        Date.now() - cycle.lastComputedAt.getTime() < minMinutes * 60_000
      ) {
        throw conflict('kpi_recompute_too_soon', `Vừa tính xong — thử lại sau ${minMinutes} phút`)
      }
      const rules = cycle.rules as KpiRules
      const reviews = await tx.select().from(kpiReviews).where(eq(kpiReviews.cycleId, cycleId))
      const items = await tx
        .select()
        .from(kpiReviewItems)
        .where(inArray(kpiReviewItems.reviewId, reviews.map((r) => r.id).concat(0)))
      const stationOf = new Map(
        (await tx.select({ id: orgUnits.id, stationId: orgUnits.stationId }).from(orgUnits)).map(
          (u) => [u.id, u.stationId],
        ),
      )
      const subjects: MetricSubject[] = reviews.map((r) => ({
        reviewId: r.id,
        staffId: r.staffId,
        employeeId: r.employeeId,
        branchId: cycle.branchId,
        unitId: r.unitId,
        stationId: r.unitId !== null ? (stationOf.get(r.unitId) ?? null) : null,
      }))
      const auto = await this.metrics.compute(
        [
          ...new Set(
            items.filter((i) => i.source !== 'nhap-tay').map((i) => i.metricCode as KpiMetricCode),
          ),
        ],
        subjects,
        { from: cycle.periodStart, to: cycle.periodEnd },
        rules,
        tx,
      )
      for (const review of reviews) {
        const mine = items.filter((i) => i.reviewId === review.id)
        for (const item of mine) {
          if (item.source === 'nhap-tay') continue
          const value = auto.get(review.id)?.get(item.metricCode as KpiMetricCode)
          item.actualMilli = value?.actualMilli ?? null
          item.sampleCount = value?.sampleCount ?? null
        }
        await this.rescore(tx, review, mine, rules)
      }
      await tx
        .update(kpiCycles)
        .set({ lastComputedAt: new Date() })
        .where(eq(kpiCycles.id, cycleId))
      return { reviews: reviews.length }
    })
  }

  /** Chốt kỳ: mọi phiếu (trừ phiếu miễn) đã kết thúc; người chốt không là người được chấm */
  async closeCycle(actor: Actor, cycleId: number) {
    const me = requireStaff(actor)
    const cycle = await this.loadCycle(cycleId)
    if (cycle.state !== 'review') {
      throw conflict('kpi_cycle_not_review', 'Kỳ chưa vào bước đánh giá')
    }
    const reviews = await this.db.select().from(kpiReviews).where(eq(kpiReviews.cycleId, cycleId))
    if (reviews.some((r) => r.staffId === me.staffId)) {
      throw conflict('kpi_self_close', 'Bạn có phiếu trong kỳ này — người khác phải chốt')
    }
    const pending = reviews.filter((r) => !r.exempt && !r.finalizedAt)
    if (pending.length > 0) {
      throw conflict('kpi_reviews_pending', `Còn ${pending.length} phiếu chưa kết thúc đánh giá`)
    }
    const [row] = await this.db
      .update(kpiCycles)
      .set({ state: 'closed', closedBy: me.staffId, closedAt: new Date() })
      .where(and(eq(kpiCycles.id, cycleId), eq(kpiCycles.state, 'review')))
      .returning({ id: kpiCycles.id })
    if (!row) throw conflict('kpi_cycle_not_review', 'Kỳ vừa được chốt')
    await this.audit.writeStandalone({
      actor,
      action: 'kpi-cycle.closed',
      entity: 'kpi_cycle',
      entityId: String(cycleId),
    })
    return { id: cycleId }
  }

  // ================================================================ Phiếu

  async reviews(actor: Actor, cycleId: number): Promise<KpiReviewRow[]> {
    const me = requireStaff(actor)
    const cycle = await this.loadCycle(cycleId)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'kpi', snap)
    const rows = await this.db.select().from(kpiReviews).where(eq(kpiReviews.cycleId, cycleId))
    const visible = rows.filter(
      (r) => r.reviewerId === me.staffId || scope.chain || scope.branchIds.has(cycle.branchId),
    )
    return this.toRows(visible, this.mayViewBonus(snap, me.staffId))
  }

  async review(actor: Actor, reviewId: number): Promise<KpiReviewDetail> {
    const me = requireStaff(actor)
    const { review, cycle } = await this.loadReview(reviewId)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'kpi', snap)
    const allowed =
      review.staffId === me.staffId ||
      review.reviewerId === me.staffId ||
      scope.chain ||
      scope.branchIds.has(cycle.branchId)
    if (!allowed) throw notFound('phiếu KPI')
    return this.detailOf(review, cycle, me, snap, false)
  }

  /**
   * Quản lý chấm phần nhập tay (1–5) và nhận xét; loại một chỉ số có dữ liệu sai
   * thì phải ghi lý do. Chỉ người đánh giá được chụp lúc mở kỳ.
   */
  async managerReview(
    actor: Actor,
    reviewId: number,
    input: {
      comment: string | null
      items: {
        metricCode: KpiMetricCode
        managerScore?: number | null
        excludedReason?: string | null
      }[]
    },
  ) {
    const me = requireStaff(actor)
    const { review, cycle } = await this.loadReview(reviewId)
    if (review.reviewerId !== me.staffId) {
      throw forbidden('kpi_not_reviewer', 'Bạn không phải người đánh giá phiếu này')
    }
    if (review.staffId === me.staffId) throw conflict('self_decision', 'Không tự chấm KPI của mình')
    if (cycle.state !== 'review' && cycle.state !== 'open') {
      throw conflict('kpi_cycle_locked', 'Kỳ chưa mở hoặc đã chốt')
    }
    if (review.finalizedAt) throw conflict('kpi_review_finalized', 'Phiếu đã kết thúc đánh giá')
    return this.db.transaction(async (tx) => {
      for (const i of input.items) {
        const def = KPI_METRICS[i.metricCode]
        await tx
          .update(kpiReviewItems)
          .set({
            ...(i.managerScore !== undefined
              ? {
                  managerScore: i.managerScore,
                  // Chỉ số nhập tay: số thực tế là điểm quản lý chấm
                  ...(def.source === 'nhap-tay'
                    ? { actualMilli: i.managerScore === null ? null : i.managerScore * 1000 }
                    : {}),
                }
              : {}),
            ...(i.excludedReason !== undefined
              ? {
                  excludedReason: i.excludedReason,
                  excludedBy: i.excludedReason === null ? null : me.staffId,
                }
              : {}),
          })
          .where(
            and(eq(kpiReviewItems.reviewId, reviewId), eq(kpiReviewItems.metricCode, i.metricCode)),
          )
      }
      await tx
        .update(kpiReviews)
        .set({ managerComment: input.comment, updatedAt: new Date() })
        .where(eq(kpiReviews.id, reviewId))
      const items = await tx
        .select()
        .from(kpiReviewItems)
        .where(eq(kpiReviewItems.reviewId, reviewId))
      await this.rescore(tx, review, items, cycle.rules as KpiRules)
      return { reviewId }
    })
  }

  /** Kết thúc đánh giá một phiếu: người đánh giá; người được chấm đã tự đánh giá hoặc đã quá hạn */
  async finalize(actor: Actor, reviewId: number) {
    const me = requireStaff(actor)
    const { review, cycle } = await this.loadReview(reviewId)
    if (review.reviewerId !== me.staffId) {
      throw forbidden('kpi_not_reviewer', 'Bạn không phải người đánh giá phiếu này')
    }
    if (cycle.state !== 'review')
      throw conflict('kpi_cycle_not_review', 'Kỳ chưa vào bước đánh giá')
    const selfDays = await this.params.getNumber('kpi.selfReviewDays', 5, cycle.branchId)
    const waitedEnough =
      cycle.reviewStartedAt !== null &&
      Date.now() - cycle.reviewStartedAt.getTime() >= selfDays * 86_400_000
    if (!review.selfSubmittedAt && !waitedEnough) {
      throw conflict(
        'kpi_self_pending',
        `Chờ người được chấm tự đánh giá (tối đa ${selfDays} ngày từ lúc vào bước đánh giá)`,
      )
    }
    const [row] = await this.db
      .update(kpiReviews)
      .set({ finalizedBy: me.staffId, finalizedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(kpiReviews.id, reviewId), isNull(kpiReviews.finalizedAt)))
      .returning({ id: kpiReviews.id })
    if (!row) throw conflict('kpi_review_finalized', 'Phiếu đã kết thúc đánh giá')
    return { reviewId }
  }

  // ================================================================ Của tôi (N14)

  async mine(actor: Actor): Promise<KpiReviewRow[]> {
    const me = requireStaff(actor)
    const rows = await this.db
      .select()
      .from(kpiReviews)
      .where(eq(kpiReviews.staffId, me.staffId))
      .orderBy(desc(kpiReviews.createdAt))
      .limit(24)
    return this.toRows(rows, false)
  }

  async mineDetail(actor: Actor, reviewId: number): Promise<KpiReviewDetail> {
    const me = requireStaff(actor)
    const { review, cycle } = await this.loadReview(reviewId)
    if (review.staffId !== me.staffId) throw notFound('phiếu KPI')
    // Phiên Kênh nhân viên: số tiền luôn che, chỉ còn % đạt
    const selfSession = me.scope === 'self'
    return this.detailOf(review, cycle, me, await this.org.snapshot(), selfSession)
  }

  /** Tự đánh giá — để đối chiếu, không tính vào điểm */
  async selfReview(
    actor: Actor,
    reviewId: number,
    input: {
      comment: string | null
      items: { metricCode: KpiMetricCode; selfScore: number | null }[]
    },
  ) {
    const me = requireStaff(actor)
    const { review, cycle } = await this.loadReview(reviewId)
    if (review.staffId !== me.staffId) throw notFound('phiếu KPI')
    if (cycle.state !== 'open' && cycle.state !== 'review') {
      throw conflict('kpi_cycle_locked', 'Kỳ chưa mở hoặc đã chốt')
    }
    if (review.finalizedAt) throw conflict('kpi_review_finalized', 'Phiếu đã kết thúc đánh giá')
    return this.db.transaction(async (tx) => {
      for (const i of input.items) {
        await tx
          .update(kpiReviewItems)
          .set({ selfScore: i.selfScore })
          .where(
            and(eq(kpiReviewItems.reviewId, reviewId), eq(kpiReviewItems.metricCode, i.metricCode)),
          )
      }
      await tx
        .update(kpiReviews)
        .set({ selfComment: input.comment, selfSubmittedAt: new Date(), updatedAt: new Date() })
        .where(eq(kpiReviews.id, reviewId))
      return { reviewId }
    })
  }

  /** Đã xem kết quả + ý kiến — một lần, sau khi kỳ chốt */
  async ack(actor: Actor, reviewId: number, feedback: string | null) {
    const me = requireStaff(actor)
    const { review, cycle } = await this.loadReview(reviewId)
    if (review.staffId !== me.staffId) throw notFound('phiếu KPI')
    if (cycle.state !== 'closed') throw conflict('kpi_cycle_not_closed', 'Kỳ chưa chốt')
    const [row] = await this.db
      .update(kpiReviews)
      .set({ employeeAckAt: new Date(), employeeFeedback: feedback })
      .where(and(eq(kpiReviews.id, reviewId), isNull(kpiReviews.employeeAckAt)))
      .returning({ id: kpiReviews.id })
    if (!row) throw conflict('kpi_already_acked', 'Bạn đã ghi ý kiến cho phiếu này')
    return { reviewId }
  }

  async counts(actor: StaffActor) {
    const selfDue = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(kpiReviews)
      .innerJoin(kpiCycles, eq(kpiCycles.id, kpiReviews.cycleId))
      .where(
        and(
          eq(kpiReviews.staffId, actor.staffId),
          eq(kpiCycles.state, 'review'),
          isNull(kpiReviews.selfSubmittedAt),
          eq(kpiReviews.exempt, false),
        ),
      )
    const toReview = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(kpiReviews)
      .innerJoin(kpiCycles, eq(kpiCycles.id, kpiReviews.cycleId))
      .where(
        and(
          eq(kpiReviews.reviewerId, actor.staffId),
          eq(kpiCycles.state, 'review'),
          isNull(kpiReviews.finalizedAt),
          eq(kpiReviews.exempt, false),
        ),
      )
    return { selfDue: selfDue[0]?.n ?? 0, toReview: toReview[0]?.n ?? 0 }
  }

  // ================================================================ Phiếu kiểm tra (N11)

  async observations(actor: Actor, branchId?: string): Promise<KpiObservationView[]> {
    requireStaff(actor)
    const rows = await this.db
      .select({ o: kpiObservations, observerName: staff.fullName })
      .from(kpiObservations)
      .innerJoin(staff, eq(staff.id, kpiObservations.observerId))
      .where(branchId ? eq(kpiObservations.branchId, branchId) : undefined)
      .orderBy(desc(kpiObservations.observedOn), desc(kpiObservations.id))
      .limit(200)
    return rows.map(({ o, observerName }) => ({
      id: o.id,
      branchId: o.branchId,
      kind: o.kind,
      observedOn: o.observedOn,
      scoreMilli: o.scoreMilli,
      evidenceUrl: o.evidenceUrl,
      note: o.note,
      observerName,
      voidedAt: iso(o.voidedAt),
      voidReason: o.voidReason,
    }))
  }

  async createObservation(
    actor: Actor,
    input: {
      branchId: string
      kind: KpiObservationKind
      observedOn: string
      scoreMilli: number
      evidenceUrl: string
      note: string | null
    },
  ) {
    const me = requireStaff(actor)
    if (input.observedOn > todayVN()) {
      throw new BadRequestException('Ngày kiểm tra không thể ở tương lai')
    }
    const [row] = await this.db
      .insert(kpiObservations)
      .values({ ...input, observerId: me.staffId })
      .returning({ id: kpiObservations.id })
    return { id: row!.id }
  }

  async voidObservation(actor: Actor, id: number, reason: string) {
    const me = requireStaff(actor)
    const [row] = await this.db
      .update(kpiObservations)
      .set({ voidedAt: new Date(), voidedBy: me.staffId, voidReason: reason })
      .where(and(eq(kpiObservations.id, id), isNull(kpiObservations.voidedAt)))
      .returning({ id: kpiObservations.id })
    if (!row) throw conflict('kpi_observation_voided', 'Phiếu đã huỷ hoặc không tồn tại')
    return { id }
  }

  // ================================================================ Thưởng gợi ý cho H7

  /**
   * Gợi ý thưởng cho một kỳ lương: kỳ KPI cùng chi nhánh, cùng tháng, ĐÃ CHỐT. Chưa
   * chốt thì trả lý do chặn chứ không trả 0 — người tính lương phải biết vì sao ô
   * thưởng trống.
   */
  async bonusSuggestions(actor: Actor, payrollPeriodId: number): Promise<KpiBonusSuggestions> {
    requireStaff(actor)
    const [period] = await this.db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.id, payrollPeriodId))
    if (!period) throw notFound('kỳ lương')
    const [cycle] = await this.db
      .select()
      .from(kpiCycles)
      .where(
        and(
          eq(kpiCycles.branchId, period.branchId),
          lte(kpiCycles.periodStart, period.periodEnd),
          gte(kpiCycles.periodEnd, period.periodStart),
        ),
      )
      .orderBy(desc(kpiCycles.periodStart))
      .limit(1)
    if (!cycle) {
      return { cycleId: null, blockedBy: 'Chưa có kỳ KPI cho tháng này', suggestions: [] }
    }
    if (cycle.state !== 'closed') {
      return {
        cycleId: cycle.id,
        blockedBy: 'Kỳ KPI cùng tháng chưa chốt — chốt ở N10 rồi lấy thưởng gợi ý',
        suggestions: [],
      }
    }
    const rows = await this.db
      .select({ r: kpiReviews, fullName: staff.fullName })
      .from(kpiReviews)
      .innerJoin(staff, eq(staff.id, kpiReviews.staffId))
      .where(and(eq(kpiReviews.cycleId, cycle.id), eq(kpiReviews.exempt, false)))
    return {
      cycleId: cycle.id,
      blockedBy: null,
      suggestions: rows.map(({ r, fullName }) => ({
        employeeId: r.employeeId,
        staffId: r.staffId,
        fullName,
        grade: r.grade,
        scoreMilli: r.scoreMilli,
        suggestedBonusVnd: r.suggestedBonusVnd ?? 0,
        basis: r.bonusBasis ?? 'Không xếp loại (độ phủ thấp)',
      })),
    }
  }

  // ================================================================ Nội bộ

  private async currentRules(): Promise<KpiRules> {
    const n = (key: string, fallback: number) => this.params.getNumber(key, fallback)
    return {
      gradeA: await n('kpi.gradeA', 105),
      gradeB: await n('kpi.gradeB', 95),
      gradeC: await n('kpi.gradeC', 80),
      achievementCapPct: await n('kpi.achievementCapPct', 120),
      zeroTargetPenaltyPct: await n('kpi.zeroTargetPenaltyPct', 50),
      minCoveragePct: await n('kpi.minCoveragePct', 70),
      minSample: {
        tickets: await n('kpi.minSampleTickets', 30),
        ratings: await n('kpi.minSampleRatings', 10),
        events: await n('kpi.minSampleEvents', 10),
        tasks: await n('kpi.minSampleTasks', 3),
      },
      bonusVnd: {
        A: await n('kpi.bonusAVnd', 1_000_000),
        B: await n('kpi.bonusBVnd', 600_000),
        C: await n('kpi.bonusCVnd', 200_000),
        D: await n('kpi.bonusDVnd', 0),
      },
      prorateByHours: (await this.params.get<boolean>('kpi.bonusProrateByHours')) ?? true,
      standardMonthlyMinutes: await n('payroll.standardMonthlyMinutes', 26 * 8 * 60),
      cashToleranceVnd: await n('kpi.cashToleranceVnd', 20_000),
    }
  }

  /** Chấm lại một phiếu từ các chỉ số đang có — điểm, hạng, thưởng gợi ý */
  private async rescore(tx: Tx, review: ReviewRec, items: ItemRec[], rules: KpiRules) {
    const scoreItems: ScoreItem[] = items.map((i) => {
      const def = KPI_METRICS[i.metricCode as KpiMetricCode]
      return {
        weightPct: i.weightPct,
        direction: i.direction,
        targetMilli: i.targetMilli,
        actualMilli: i.actualMilli,
        sampleCount: i.sampleCount,
        minSample: 'minSample' in def && def.minSample ? rules.minSample[def.minSample] : null,
        excluded: i.excludedReason !== null,
        countMetric: def.unit === 'lan',
      }
    })
    const result = scoreOf(scoreItems, rules)
    for (const [idx, item] of items.entries()) {
      await tx
        .update(kpiReviewItems)
        .set({
          actualMilli: item.actualMilli,
          sampleCount: item.sampleCount,
          achievementMilli: result.achievements[idx],
          contributionMilli: result.contributions[idx],
        })
        .where(
          and(
            eq(kpiReviewItems.reviewId, review.id),
            eq(kpiReviewItems.metricCode, item.metricCode),
          ),
        )
    }
    const [employee] = await tx.select().from(employees).where(eq(employees.id, review.employeeId))
    const worked = await this.metrics.workedMinutes(review.employeeId, review.cycleId, tx)
    const bonus = review.exempt
      ? 0
      : bonusOf(result.grade, rules, {
          kind: employee?.payKind ?? 'monthly',
          workedMinutes: worked,
        })
    const basis =
      result.grade === null
        ? 'Không xếp loại — độ phủ dữ liệu dưới ngưỡng'
        : `Hạng ${result.grade}${employee?.payKind === 'hourly' && rules.prorateByHours ? ` × giờ công ${Math.round(worked / 60)}g` : ''}`
    await tx
      .update(kpiReviews)
      .set({
        scoreMilli: result.scoreMilli,
        coverageMilli: result.coverageMilli,
        grade: result.grade,
        suggestedBonusVnd: bonus,
        bonusBasis: basis,
        updatedAt: new Date(),
      })
      .where(eq(kpiReviews.id, review.id))
  }

  private mayViewBonus(snap: OrgSnapshot, staffId: number) {
    const roles: Role[] = (snap.people.get(staffId)?.roles ?? []).map((g) => g.role)
    return checkPermission('payroll.view-others', roles) === 'allow'
  }

  private async loadCycle(id: number): Promise<CycleRec> {
    const [cycle] = await this.db.select().from(kpiCycles).where(eq(kpiCycles.id, id))
    if (!cycle) throw notFound('kỳ KPI')
    return cycle
  }

  private async loadReview(id: number) {
    const [review] = await this.db.select().from(kpiReviews).where(eq(kpiReviews.id, id))
    if (!review) throw notFound('phiếu KPI')
    return { review, cycle: await this.loadCycle(review.cycleId) }
  }

  private async toCycleViews(rows: CycleRec[]): Promise<KpiCycleView[]> {
    if (rows.length === 0) return []
    const stats = new Map(
      (
        await this.db
          .select({
            cycleId: kpiReviews.cycleId,
            total: sql<number>`count(*) FILTER (WHERE NOT ${kpiReviews.exempt})::int`,
            finalized: sql<number>`count(${kpiReviews.finalizedAt})::int`,
          })
          .from(kpiReviews)
          .where(
            inArray(
              kpiReviews.cycleId,
              rows.map((c) => c.id),
            ),
          )
          .groupBy(kpiReviews.cycleId)
      ).map((s) => [s.cycleId, s]),
    )
    return rows.map((c) => ({
      id: c.id,
      branchId: c.branchId,
      kind: c.kind,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      state: c.state,
      policyUrl: c.policyUrl,
      rules: (c.rules as KpiRules | null) ?? null,
      reviews: stats.get(c.id)?.total ?? 0,
      finalized: stats.get(c.id)?.finalized ?? 0,
      lastComputedAt: iso(c.lastComputedAt),
    }))
  }

  private async toRows(rows: ReviewRec[], withBonus: boolean): Promise<KpiReviewRow[]> {
    if (rows.length === 0) return []
    const ids = [
      ...new Set(
        rows.flatMap((r) => [r.staffId, r.reviewerId]).filter((x): x is number => x !== null),
      ),
    ]
    const names = new Map(
      (
        await this.db
          .select({ id: staff.id, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, ids))
      ).map((s) => [s.id, s.fullName]),
    )
    return rows.map((r) => ({
      id: r.id,
      cycleId: r.cycleId,
      staffId: r.staffId,
      fullName: names.get(r.staffId) ?? '',
      positionTitle: r.positionTitle,
      reviewerName: r.reviewerId !== null ? (names.get(r.reviewerId) ?? null) : null,
      selfSubmittedAt: iso(r.selfSubmittedAt),
      finalizedAt: iso(r.finalizedAt),
      scoreMilli: r.scoreMilli,
      coverageMilli: r.coverageMilli,
      grade: r.grade,
      ...(withBonus ? { suggestedBonusVnd: r.suggestedBonusVnd } : {}),
      exempt: r.exempt,
    }))
  }

  private async detailOf(
    review: ReviewRec,
    cycle: CycleRec,
    me: StaffActor,
    snap: OrgSnapshot,
    selfSession: boolean,
  ): Promise<KpiReviewDetail> {
    const roles: Role[] = (snap.people.get(me.staffId)?.roles ?? []).map((g) => g.role)
    const [row] = await this.toRows(
      [review],
      this.mayViewBonus(snap, me.staffId) && review.staffId !== me.staffId,
    )
    const [cycleView] = await this.toCycleViews([cycle])
    const items = await this.db
      .select()
      .from(kpiReviewItems)
      .where(eq(kpiReviewItems.reviewId, review.id))
      .orderBy(desc(kpiReviewItems.weightPct))
    const views: KpiItemView[] = items.map((i) => {
      const def = KPI_METRICS[i.metricCode as KpiMetricCode]
      // Số tiền: người không có quyền (và phiên điện thoại) chỉ thấy % đạt
      const masked =
        'need' in def && def.need !== undefined
          ? selfSession || checkPermission(def.need, roles) !== 'allow'
          : false
      return {
        metricCode: i.metricCode as KpiMetricCode,
        label: i.label,
        unit: def.unit,
        direction: i.direction,
        source: i.source,
        weightPct: i.weightPct,
        targetMilli: masked ? 0 : i.targetMilli,
        targetNote: i.targetNote,
        actualMilli: masked ? null : i.actualMilli,
        sampleCount: i.sampleCount,
        selfScore: i.selfScore,
        managerScore: i.managerScore,
        excludedReason: i.excludedReason,
        achievementMilli: i.achievementMilli,
        contributionMilli: i.contributionMilli,
        masked,
      }
    })
    const running = cycle.state === 'open' || cycle.state === 'review'
    return {
      ...row!,
      cycle: cycleView!,
      items: views,
      selfComment: review.selfComment,
      managerComment: review.managerComment,
      employeeAckAt: iso(review.employeeAckAt),
      employeeFeedback: review.employeeFeedback,
      canSelfReview:
        running && review.staffId === me.staffId && !review.finalizedAt && !review.exempt,
      canManagerReview:
        running && review.reviewerId === me.staffId && !review.finalizedAt && !review.exempt,
      canFinalize:
        cycle.state === 'review' && review.reviewerId === me.staffId && !review.finalizedAt,
      canAck: cycle.state === 'closed' && review.staffId === me.staffId && !review.employeeAckAt,
    }
  }
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}
