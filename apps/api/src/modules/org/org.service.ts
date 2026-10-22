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
  STANDARD_BRANCH_HEAD,
  STANDARD_BRANCH_UNITS,
  STANDARD_CHAIN_UNITS,
  STANDARD_OPERATIONS_UNIT,
  type AssignmentKind,
  type MyOrgProfile,
  type OrgAssignmentRow,
  type OrgChart,
  type OrgPersonView,
  type OrgPositionView,
  type OrgUnitKind,
  type Role,
  type StandardPosition,
  type StandardUnit,
} from '@sora/contracts'
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { isCheckViolation, isUniqueViolation } from '../../common/pg-error'
import type { DbOrTx, Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  employees,
  orgUnits,
  positionAssignments,
  positions,
  staff,
  staffRoles,
  stations,
} from '../../db/schema'
import { actorRoles, type Actor, type StaffActor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import {
  branchOfUnit,
  buildSnapshot,
  managersOf,
  scopeOf,
  wouldCycle,
  type OrgSnapshot,
  type Person,
  type ScopeDomain,
} from './domain/org'

/**
 * Sơ đồ tổ chức dùng một múi giờ: mọi chi nhánh hiện ở Việt Nam, và "hôm nay ai
 * giữ chức gì" phải là MỘT câu trả lời cho cả chuỗi chứ không đổi theo chi nhánh.
 */
export const ORG_TZ = 'Asia/Ho_Chi_Minh'
export const todayVN = () => businessDateOf(new Date(), ORG_TZ)

export interface UnitInput {
  parentId: number
  kind: Exclude<OrgUnitKind, 'cong-ty'>
  name: string
  branchId: string | null
  stationId: string | null
  sort: number
}

export interface UnitPatch {
  name?: string
  parentId?: number
  sort?: number
  stationId?: string | null
  active?: boolean
}

export interface PositionInput {
  unitId: number
  title: string
  isHead: boolean
  headcount: number
  suggestedRole: Role | null
  duties: string[]
  authorities: string[]
  requirements: string[]
  sort: number
}

export type PositionPatch = Partial<Omit<PositionInput, 'unitId'>> & { active?: boolean }

export interface AssignInput {
  staffIds: number[]
  positionId: number
  kind: AssignmentKind
  fromDate: string
  note: string
  /** Người đang giữ chức chính khác: đóng chức cũ đúng ngày nhận chức mới */
  replaceMain: boolean
}

const conflict = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new ConflictException({ code, message, ...extra })

export function requireStaff(actor: Actor): StaffActor {
  // Thiết bị KDS mang vai trò R4 nên đi qua được guard "của tôi" — chặn ở đây
  if (actor.kind !== 'staff') {
    throw new ForbiddenException({
      code: 'staff_only',
      message: 'Chỉ nhân viên đăng nhập mới dùng được',
    })
  }
  return actor
}

@Injectable()
export class OrgService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  // ================================================================ Ảnh chụp

  /**
   * Ảnh chụp tổ chức ở một ngày — đầu vào của mọi câu hỏi "ai quản ai". Module
   * khác (việc, văn bản, KPI) gọi hàm này rồi hỏi các hàm thuần ở domain/org.ts.
   */
  async snapshot(date = todayVN(), db: DbOrTx = this.db): Promise<OrgSnapshot> {
    const units = await db
      .select({
        id: orgUnits.id,
        parentId: orgUnits.parentId,
        kind: orgUnits.kind,
        branchId: orgUnits.branchId,
        active: orgUnits.active,
      })
      .from(orgUnits)
    const positionRows = await db
      .select({
        id: positions.id,
        unitId: positions.unitId,
        isHead: positions.isHead,
        active: positions.active,
      })
      .from(positions)
    const holdings = await db
      .select({
        staffId: positionAssignments.staffId,
        positionId: positionAssignments.positionId,
        kind: positionAssignments.kind,
        fromDate: positionAssignments.fromDate,
        toDate: positionAssignments.toDate,
      })
      .from(positionAssignments)
      .where(
        and(
          lte(positionAssignments.fromDate, date),
          or(isNull(positionAssignments.toDate), gt(positionAssignments.toDate, date)),
        ),
      )
    return buildSnapshot({
      units,
      positions: positionRows,
      holdings,
      people: await this.people(db),
      date,
    })
  }

  private async people(db: DbOrTx): Promise<Person[]> {
    const rows = await db.select({ id: staff.id, active: staff.active }).from(staff)
    const roles = await db.select().from(staffRoles)
    const profiles = await db
      .select({ staffId: employees.staffId, branchId: employees.branchId })
      .from(employees)
    const branchOf = new Map(profiles.map((p) => [p.staffId, p.branchId]))
    const rolesOf = new Map<number, Person['roles']>()
    for (const r of roles) {
      const list = rolesOf.get(r.staffId) ?? []
      list.push({ role: r.roleCode as Role, branchId: r.branchId })
      rolesOf.set(r.staffId, list)
    }
    return rows.map((r) => ({
      staffId: r.id,
      active: r.active,
      employeeBranchId: branchOf.get(r.id) ?? null,
      roles: rolesOf.get(r.id) ?? [],
    }))
  }

  /** Chức danh chính đang giữ của từng người — cho danh sách người ký, người nhận việc */
  async titlesOf(snap: OrgSnapshot): Promise<Map<number, string>> {
    const rows = await this.db.select({ id: positions.id, title: positions.title }).from(positions)
    const titles = new Map(rows.map((p) => [p.id, p.title]))
    const out = new Map<number, string>()
    for (const h of snap.holdings) {
      const title = titles.get(h.positionId)
      if (h.kind === 'chinh' && title) out.set(h.staffId, title)
    }
    return out
  }

  /** Phạm vi của người gọi ở một miền — cho các module khác dùng chung */
  async scopeFor(actor: Actor, domain: ScopeDomain, snap?: OrgSnapshot) {
    const me = requireStaff(actor)
    const current = snap ?? (await this.snapshot())
    return { snap: current, scope: scopeOf(me.staffId, domain, current) }
  }

  // ================================================================ Sơ đồ

  async chart(actor: Actor, date = todayVN()): Promise<OrgChart> {
    const me = requireStaff(actor)
    const snap = await this.snapshot(date)
    // Đồng bộ theo HÔM NAY, không theo ngày đang xem — xem trước sơ đồ tháng sau
    // không được ghi nhãn tháng sau vào hồ sơ H1
    await this.syncTitles(this.db)
    const scope = scopeOf(me.staffId, 'org', snap)
    const canManage = checkPermission('org.manage', actorRoles(actor)) === 'allow'

    /**
     * CẤU TRÚC xem được cả chuỗi: ai ngồi ghế nào không phải bí mật (không có số
     * lương ở đây), và người soạn văn bản, giao việc cần thấy đơn vị để chọn nơi
     * nhận. Phạm vi theo cây áp cho THAO TÁC — giao việc, ký, chấm KPI — chứ
     * không cho việc xem sơ đồ.
     */
    const units = await this.db
      .select()
      .from(orgUnits)
      .where(eq(orgUnits.active, true))
      .orderBy(asc(orgUnits.sort), asc(orgUnits.id))
    const unitIds = new Set(units.map((u) => u.id))

    const positionRows = await this.db
      .select()
      .from(positions)
      .where(eq(positions.active, true))
      .orderBy(asc(positions.sort), asc(positions.id))

    // Đang giữ hoặc sắp nhận — dòng đã đóng trước ngày xem thì thuộc về lịch sử
    const open = await this.db
      .select({ a: positionAssignments, fullName: staff.fullName })
      .from(positionAssignments)
      .innerJoin(staff, eq(staff.id, positionAssignments.staffId))
      .where(or(isNull(positionAssignments.toDate), gt(positionAssignments.toDate, date)))
      .orderBy(asc(positionAssignments.fromDate), asc(positionAssignments.id))

    const people = await this.db
      .select({ id: staff.id, fullName: staff.fullName, code: staff.code, active: staff.active })
      .from(staff)
      .orderBy(asc(staff.fullName))

    const positionViews: OrgPositionView[] = positionRows
      .filter((p) => unitIds.has(p.unitId))
      .map((p) => {
        const unitBranch = branchOfUnit(p.unitId, snap.units)
        return {
          id: p.id,
          unitId: p.unitId,
          title: p.title,
          isHead: p.isHead,
          headcount: p.headcount,
          suggestedRole: (p.suggestedRole as Role | null) ?? null,
          duties: p.duties,
          authorities: p.authorities,
          requirements: p.requirements,
          sort: p.sort,
          active: p.active,
          holders: open
            .filter((row) => row.a.positionId === p.id)
            .map(({ a, fullName }) => {
              const person = snap.people.get(a.staffId)
              const grants = person?.roles ?? []
              return {
                assignmentId: a.id,
                staffId: a.staffId,
                fullName,
                kind: a.kind,
                fromDate: a.fromDate,
                toDate: a.toDate,
                documentId: a.documentId,
                note: a.note,
                upcoming: a.fromDate > date,
                roleMismatch:
                  p.suggestedRole !== null &&
                  !grants.some(
                    (g) =>
                      g.role === p.suggestedRole &&
                      (g.branchId === null || unitBranch === null || g.branchId === unitBranch),
                  ),
                branchMismatch:
                  unitBranch !== null &&
                  person?.employeeBranchId != null &&
                  person.employeeBranchId !== unitBranch,
              }
            }),
        }
      })

    // "Chưa xếp ghế" là danh sách việc của người dựng sơ đồ — người chỉ xem thì không cần
    const holding = new Set(open.map((row) => row.a.staffId))
    const unassigned: OrgPersonView[] = people
      .filter((p) => canManage && p.active && !holding.has(p.id))
      .map((p) => {
        const person = snap.people.get(p.id)
        return {
          staffId: p.id,
          fullName: p.fullName,
          code: p.code,
          branchId: person?.employeeBranchId ?? null,
          roles: person?.roles ?? [],
        }
      })
      // Người chưa có vai trò nào (tài khoản dở dang) không thuộc bộ máy
      .filter((p) => p.roles.length > 0)

    const branchRows = await this.db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.active, true))
      .orderBy(asc(branches.id))
    const placed = new Set(units.map((u) => u.branchId).filter(Boolean))

    return {
      date,
      canManage,
      chainWide: scope.chain,
      units: units.map((u) => ({
        id: u.id,
        parentId: u.parentId,
        kind: u.kind,
        name: u.name,
        branchId: u.branchId,
        stationId: u.stationId,
        sort: u.sort,
        active: u.active,
      })),
      positions: positionViews,
      unassigned,
      missingBranches: canManage ? branchRows.filter((b) => !placed.has(b.id)) : [],
    }
  }

  /** Quá trình giữ một chức danh — cả người đã rời ghế */
  async positionHistory(positionId: number): Promise<OrgAssignmentRow[]> {
    const rows = await this.db
      .select({ a: positionAssignments, fullName: staff.fullName })
      .from(positionAssignments)
      .innerJoin(staff, eq(staff.id, positionAssignments.staffId))
      .where(eq(positionAssignments.positionId, positionId))
      .orderBy(desc(positionAssignments.fromDate), desc(positionAssignments.id))
    return rows.map(({ a, fullName }) => ({
      assignmentId: a.id,
      staffId: a.staffId,
      fullName,
      kind: a.kind,
      fromDate: a.fromDate,
      toDate: a.toDate,
      documentId: a.documentId,
      endDocumentId: a.endDocumentId,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    }))
  }

  // ================================================================ Đơn vị

  async createUnit(input: UnitInput, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const parent = await this.requireUnit(tx, input.parentId)
      if (!parent.active) throw conflict('unit_inactive', 'Đơn vị cha đã ngừng hoạt động')
      if (input.kind === 'chi-nhanh') {
        const [branch] = await tx.select().from(branches).where(eq(branches.id, input.branchId!))
        if (!branch)
          throw new NotFoundException({
            code: 'branch_not_found',
            message: 'Không có chi nhánh này',
          })
      }
      if (input.stationId) await this.requireStation(tx, input.stationId)
      try {
        const [row] = await tx
          .insert(orgUnits)
          .values({
            parentId: input.parentId,
            kind: input.kind,
            name: input.name,
            branchId: input.kind === 'chi-nhanh' ? input.branchId : null,
            stationId: input.stationId,
            sort: input.sort,
          })
          .returning()
        await this.audit.write(tx, {
          actor,
          action: 'org.unit.created',
          entity: 'org_unit',
          entityId: String(row!.id),
          payload: { name: input.name, kind: input.kind, parentId: input.parentId },
        })
        return row!
      } catch (err) {
        if (isUniqueViolation(err, 'org_units_one_per_branch')) {
          throw conflict('org_branch_unit_exists', 'Chi nhánh này đã có đơn vị trên sơ đồ')
        }
        throw err
      }
    })
  }

  async updateUnit(id: number, patch: UnitPatch, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const unit = await this.requireUnit(tx, id)
      const isRoot = unit.parentId === null
      if (isRoot && (patch.parentId !== undefined || patch.active === false)) {
        throw conflict('org_root_locked', 'Gốc công ty không chuyển hay ngừng được')
      }

      if (patch.parentId !== undefined && patch.parentId !== unit.parentId) {
        const parent = await this.requireUnit(tx, patch.parentId)
        if (!parent.active) throw conflict('unit_inactive', 'Đơn vị cha đã ngừng hoạt động')
        const snap = await this.snapshot(todayVN(), tx)
        if (wouldCycle(id, patch.parentId, snap.units)) {
          throw conflict(
            'org_unit_cycle',
            'Không đặt được một đơn vị vào dưới chính cây con của nó',
          )
        }
      }

      if (patch.active === false && unit.active) {
        const [children] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(orgUnits)
          .where(and(eq(orgUnits.parentId, id), eq(orgUnits.active, true)))
        const [holders] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(positionAssignments)
          .innerJoin(positions, eq(positions.id, positionAssignments.positionId))
          .where(
            and(
              eq(positions.unitId, id),
              or(isNull(positionAssignments.toDate), gt(positionAssignments.toDate, todayVN())),
            ),
          )
        if ((children?.n ?? 0) > 0 || (holders?.n ?? 0) > 0) {
          throw conflict(
            'unit_not_empty',
            'Đơn vị còn đơn vị con hoặc còn người giữ chức danh — chuyển đi trước khi ngừng',
          )
        }
      }
      if (patch.stationId) await this.requireStation(tx, patch.stationId)

      try {
        const [row] = await tx
          .update(orgUnits)
          .set({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
            ...(patch.sort !== undefined ? { sort: patch.sort } : {}),
            ...(patch.stationId !== undefined ? { stationId: patch.stationId } : {}),
            ...(patch.active !== undefined ? { active: patch.active } : {}),
          })
          .where(eq(orgUnits.id, id))
          .returning()
        await this.audit.write(tx, {
          actor,
          action: 'org.unit.updated',
          entity: 'org_unit',
          entityId: String(id),
          payload: patch as Record<string, unknown>,
        })
        return row!
      } catch (err) {
        // Lưới cuối: hai lần đổi cha chéo nhau chạy song song — trigger 9007 bắt
        if (isCheckViolation(err, 'org_units_no_cycle')) {
          throw conflict(
            'org_unit_cycle',
            'Không đặt được một đơn vị vào dưới chính cây con của nó',
          )
        }
        throw err
      }
    })
  }

  // ================================================================ Chức danh

  async createPosition(input: PositionInput, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const unit = await this.requireUnit(tx, input.unitId)
      if (!unit.active) throw conflict('unit_inactive', 'Đơn vị đã ngừng hoạt động')
      try {
        const [row] = await tx
          .insert(positions)
          .values({ ...input, headcount: input.isHead ? 1 : input.headcount })
          .returning()
        await this.audit.write(tx, {
          actor,
          action: 'org.position.created',
          entity: 'position',
          entityId: String(row!.id),
          payload: { title: input.title, unitId: input.unitId, isHead: input.isHead },
        })
        return row!
      } catch (err) {
        throw this.positionConflict(err)
      }
    })
  }

  async updatePosition(id: number, patch: PositionPatch, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(positions).where(eq(positions.id, id))
      if (!current)
        throw new NotFoundException({
          code: 'position_not_found',
          message: 'Không có chức danh này',
        })

      if (patch.active === false && current.active) {
        const [holders] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(positionAssignments)
          .where(
            and(
              eq(positionAssignments.positionId, id),
              or(isNull(positionAssignments.toDate), gt(positionAssignments.toDate, todayVN())),
            ),
          )
        if ((holders?.n ?? 0) > 0) {
          throw conflict(
            'position_has_holders',
            'Chức danh còn người giữ — kết thúc hoặc điều chuyển trước',
          )
        }
      }
      const isHead = patch.isHead ?? current.isHead
      const headcount = isHead ? 1 : (patch.headcount ?? current.headcount)
      try {
        const [row] = await tx
          .update(positions)
          .set({ ...patch, isHead, headcount })
          .where(eq(positions.id, id))
          .returning()
        await this.audit.write(tx, {
          actor,
          action: 'org.position.updated',
          entity: 'position',
          entityId: String(id),
          payload: patch as Record<string, unknown>,
        })
        await this.syncTitles(tx)
        return row!
      } catch (err) {
        throw this.positionConflict(err)
      }
    })
  }

  private positionConflict(err: unknown) {
    if (isUniqueViolation(err, 'positions_one_head_per_unit')) {
      return conflict('position_head_exists', 'Đơn vị này đã có chức danh trưởng')
    }
    if (isUniqueViolation(err, 'positions_unit_title_unique')) {
      return conflict('position_title_exists', 'Đơn vị này đã có chức danh cùng tên')
    }
    return err
  }

  // ================================================================ Gán chức danh

  /**
   * Gán người vào chức danh — gán tay khi dựng sơ đồ, kèm lý do. Bổ nhiệm chính
   * thức đi qua quyết định (văn bản) và ghi căn cứ vào cùng bảng này.
   *
   * Không ai tự gán cho mình: đó là cửa leo thang quyền gọn nhất — tự làm trưởng
   * của gốc là có phạm vi cả chuỗi.
   */
  async assign(input: AssignInput, actor: Actor) {
    const me = requireStaff(actor)
    if (input.staffIds.includes(me.staffId)) {
      throw conflict(
        'self_assignment',
        'Không tự gán chức danh cho chính mình — nhờ người khác gán',
      )
    }

    return this.db.transaction(async (tx) => {
      const [position] = await tx.select().from(positions).where(eq(positions.id, input.positionId))
      if (!position || !position.active) {
        throw new NotFoundException({
          code: 'position_not_found',
          message: 'Không có chức danh này',
        })
      }
      const unit = await this.requireUnit(tx, position.unitId)
      if (!unit.active) throw conflict('unit_inactive', 'Đơn vị đã ngừng hoạt động')

      const created: number[] = []
      for (const staffId of input.staffIds) {
        const [person] = await tx.select().from(staff).where(eq(staff.id, staffId))
        if (!person || !person.active) {
          throw conflict('staff_inactive', 'Người này không còn hoạt động', { staffId })
        }

        let replaced: number | null = null
        if (input.kind === 'chinh') {
          // Khoá dòng chức chính đang mở: hai lần điều chuyển cùng lúc không chồng nhau
          const [main] = await tx
            .select()
            .from(positionAssignments)
            .where(
              and(
                eq(positionAssignments.staffId, staffId),
                eq(positionAssignments.kind, 'chinh'),
                isNull(positionAssignments.toDate),
              ),
            )
            .for('update')
          if (main && main.positionId !== input.positionId) {
            if (!input.replaceMain) {
              const [held] = await tx
                .select()
                .from(positions)
                .where(eq(positions.id, main.positionId))
              throw conflict(
                'assignment_main_exists',
                `${person.fullName} đang giữ chức danh chính "${held?.title ?? ''}" — chọn điều chuyển để đóng chức cũ`,
                { staffId, currentPositionId: main.positionId },
              )
            }
            if (main.fromDate > input.fromDate) {
              throw conflict(
                'assignment_overlap',
                'Ngày nhận chức mới sớm hơn ngày nhận chức đang giữ',
                { staffId },
              )
            }
            await tx
              .update(positionAssignments)
              .set({ toDate: input.fromDate })
              .where(eq(positionAssignments.id, main.id))
            replaced = main.positionId
          }
        }

        try {
          const [row] = await tx
            .insert(positionAssignments)
            .values({
              staffId,
              positionId: input.positionId,
              kind: input.kind,
              fromDate: input.fromDate,
              note: input.note,
              createdBy: me.staffId,
            })
            .returning({ id: positionAssignments.id })
          created.push(row!.id)
        } catch (err) {
          if (isUniqueViolation(err, 'position_assignments_no_dup')) {
            throw conflict('assignment_duplicate', `${person.fullName} đang giữ chức danh này`, {
              staffId,
            })
          }
          if (isUniqueViolation(err, 'position_assignments_one_main')) {
            throw conflict(
              'assignment_main_exists',
              `${person.fullName} đang giữ một chức danh chính khác`,
              {
                staffId,
              },
            )
          }
          throw err
        }

        await this.audit.write(tx, {
          actor,
          action: 'org.assignment.created',
          entity: 'position',
          entityId: String(input.positionId),
          payload: {
            staffId,
            kind: input.kind,
            fromDate: input.fromDate,
            replaced,
            note: input.note,
          },
        })
      }

      await this.syncTitles(tx)
      return { created }
    })
  }

  async endAssignment(id: number, input: { toDate: string; note: string }, actor: Actor) {
    const me = requireStaff(actor)
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(positionAssignments)
        .where(eq(positionAssignments.id, id))
        .for('update')
      if (!row)
        throw new NotFoundException({
          code: 'assignment_not_found',
          message: 'Không có bản ghi này',
        })
      if (row.toDate !== null)
        throw conflict('assignment_not_open', 'Chức danh này đã kết thúc rồi')
      if (row.staffId === me.staffId) {
        throw conflict('self_assignment', 'Không tự kết thúc chức danh của chính mình')
      }
      if (input.toDate < row.fromDate) {
        throw new BadRequestException({
          code: 'validation_error',
          message: 'Ngày kết thúc không được trước ngày nhận chức',
        })
      }
      await tx
        .update(positionAssignments)
        .set({ toDate: input.toDate })
        .where(eq(positionAssignments.id, id))
      await this.audit.write(tx, {
        actor,
        action: 'org.assignment.ended',
        entity: 'position',
        entityId: String(row.positionId),
        payload: { staffId: row.staffId, toDate: input.toDate, note: input.note },
      })
      await this.syncTitles(tx)
      return { id, toDate: input.toDate }
    })
  }

  /**
   * Chức danh trên hồ sơ H1 theo sơ đồ: H1, H7 (phiếu lương), H8 đọc cột chữ
   * `employees.position` — đồng bộ một câu, không giữ trạng thái, chỉ sửa dòng
   * đang lệch. Bổ nhiệm ghi ngày hiệu lực tương lai tự đổi nhãn ở lần đầu có
   * người mở sơ đồ hay gán chức sau ngày đó.
   */
  async syncTitles(db: DbOrTx, date = todayVN()) {
    await db.execute(sql`
      UPDATE employees e
         SET position = p.title
        FROM position_assignments a
        JOIN positions p ON p.id = a.position_id
       WHERE a.staff_id = e.staff_id
         AND a.kind = 'chinh'
         AND a.from_date <= ${date}
         AND (a.to_date IS NULL OR a.to_date > ${date})
         AND e.position IS DISTINCT FROM p.title
    `)
  }

  // ================================================================ Mẫu chuẩn

  /**
   * Dựng bộ máy theo mẫu chuẩn — khung chuỗi (`chuoi`) hoặc một chi nhánh.
   * Idempotent: đơn vị trùng tên trong cùng đơn vị cha, chức danh trùng tên trong
   * cùng đơn vị đều bỏ qua — sửa tay sau khi áp không bị ghi đè ở lần áp sau.
   */
  async applyStandard(target: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const tally = { units: 0, positions: 0 }
      const stationIds = new Set(
        (await tx.select({ id: stations.id }).from(stations)).map((s) => s.id),
      )
      const root = await this.root(tx)

      if (target === 'chuoi') {
        for (const unit of STANDARD_CHAIN_UNITS)
          await this.ensureUnit(tx, root, unit, stationIds, tally)
        // Chi nhánh đang treo thẳng dưới gốc thì về dưới khối vận hành
        const operations = await this.findChild(tx, root, STANDARD_OPERATIONS_UNIT)
        if (operations) {
          await tx
            .update(orgUnits)
            .set({ parentId: operations })
            .where(and(eq(orgUnits.parentId, root), eq(orgUnits.kind, 'chi-nhanh')))
        }
      } else {
        const [branch] = await tx.select().from(branches).where(eq(branches.id, target))
        if (!branch)
          throw new NotFoundException({
            code: 'branch_not_found',
            message: 'Không có chi nhánh này',
          })
        let [unit] = await tx.select().from(orgUnits).where(eq(orgUnits.branchId, target))
        if (!unit) {
          const parent = (await this.findChild(tx, root, STANDARD_OPERATIONS_UNIT)) ?? root
          ;[unit] = await tx
            .insert(orgUnits)
            .values({ parentId: parent, kind: 'chi-nhanh', name: branch.name, branchId: target })
            .returning()
          tally.units += 1
        }
        await this.ensurePosition(tx, unit!.id, STANDARD_BRANCH_HEAD, tally)
        for (const child of STANDARD_BRANCH_UNITS) {
          await this.ensureUnit(tx, unit!.id, child, stationIds, tally)
        }
      }

      await this.audit.write(tx, {
        actor,
        action: 'org.standard-applied',
        entity: 'org_unit',
        entityId: target,
        payload: tally,
      })
      return { unitsCreated: tally.units, positionsCreated: tally.positions }
    })
  }

  private async ensureUnit(
    tx: Tx,
    parentId: number,
    spec: StandardUnit,
    stationIds: Set<string>,
    tally: { units: number; positions: number },
  ) {
    let id = await this.findChild(tx, parentId, spec.name)
    if (id === null) {
      const [row] = await tx
        .insert(orgUnits)
        .values({
          parentId,
          kind: spec.kind,
          name: spec.name,
          stationId: spec.stationId && stationIds.has(spec.stationId) ? spec.stationId : null,
        })
        .returning({ id: orgUnits.id })
      id = row!.id
      tally.units += 1
    }
    for (const position of spec.positions) await this.ensurePosition(tx, id, position, tally)
    for (const child of spec.children ?? []) await this.ensureUnit(tx, id, child, stationIds, tally)
  }

  private async ensurePosition(
    tx: Tx,
    unitId: number,
    spec: StandardPosition,
    tally: { units: number; positions: number },
  ) {
    const existing = await tx
      .select({ title: positions.title, isHead: positions.isHead, active: positions.active })
      .from(positions)
      .where(eq(positions.unitId, unitId))
    if (existing.some((p) => p.title === spec.title)) return
    // Đơn vị đã có trưởng (đặt tên khác) thì giữ trưởng của người dùng, bỏ trưởng mẫu
    if (spec.isHead && existing.some((p) => p.isHead && p.active)) return
    await tx.insert(positions).values({
      unitId,
      title: spec.title,
      isHead: spec.isHead ?? false,
      headcount: spec.isHead ? 1 : spec.headcount,
      suggestedRole: spec.suggestedRole,
      duties: spec.duties,
      authorities: spec.authorities,
      requirements: spec.requirements,
    })
    tally.positions += 1
  }

  private async findChild(db: DbOrTx, parentId: number, name: string): Promise<number | null> {
    const [row] = await db
      .select({ id: orgUnits.id })
      .from(orgUnits)
      .where(and(eq(orgUnits.parentId, parentId), eq(orgUnits.name, name)))
    return row?.id ?? null
  }

  private async root(db: DbOrTx): Promise<number> {
    const [row] = await db
      .select({ id: orgUnits.id })
      .from(orgUnits)
      .where(isNull(orgUnits.parentId))
    if (!row) throw conflict('org_root_missing', 'Chưa có gốc công ty — chạy migration 9007')
    return row.id
  }

  // ================================================================ Của tôi

  async me(actor: Actor): Promise<MyOrgProfile> {
    const me = requireStaff(actor)
    const date = todayVN()
    const snap = await this.snapshot(date)
    const mine = snap.holdings.filter((h) => h.staffId === me.staffId)

    const positionRows = await this.db
      .select({
        id: positions.id,
        title: positions.title,
        unitId: positions.unitId,
        unitName: orgUnits.name,
      })
      .from(positions)
      .innerJoin(orgUnits, eq(orgUnits.id, positions.unitId))
    const byId = new Map(positionRows.map((p) => [p.id, p]))

    const managerIds = managersOf(me.staffId, snap)
    const names = managerIds.length
      ? await this.db
          .select({ id: staff.id, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, managerIds))
      : []
    const nameOf = new Map(names.map((n) => [n.id, n.fullName]))
    const titleOf = (staffId: number) => {
      const held = snap.holdings.find((h) => h.staffId === staffId && h.kind === 'chinh')
      return held ? (byId.get(held.positionId)?.title ?? null) : null
    }

    return {
      positions: mine
        .map((h) => {
          const p = byId.get(h.positionId)
          return p
            ? {
                positionId: p.id,
                title: p.title,
                unitId: p.unitId,
                unitName: p.unitName,
                kind: h.kind,
                fromDate: h.fromDate,
              }
            : null
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
      managers: managerIds.map((id) => ({
        staffId: id,
        fullName: nameOf.get(id) ?? '',
        title: titleOf(id),
      })),
    }
  }

  // ================================================================ Tiện ích

  private async requireUnit(db: DbOrTx, id: number) {
    const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.id, id))
    if (!unit)
      throw new NotFoundException({ code: 'unit_not_found', message: 'Không có đơn vị này' })
    return unit
  }

  private async requireStation(db: DbOrTx, id: string) {
    const [row] = await db.select({ id: stations.id }).from(stations).where(eq(stations.id, id))
    if (!row)
      throw new BadRequestException({ code: 'station_not_found', message: 'Không có trạm bếp này' })
  }
}
