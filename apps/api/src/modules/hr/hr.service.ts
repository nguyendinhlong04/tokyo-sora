import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import { PeriodLockService } from '../../common/period-lock.service'
import { isUniqueViolation } from '../../common/pg-error'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  employees,
  payrollLines,
  payrollPeriods,
  scheduleEntries,
  shiftTemplates,
  staff,
} from '../../db/schema'
import { ExpensesService } from '../expenses/expenses.service'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import {
  computePayrollLine,
  splitMinutes,
  sumSplits,
  type DayKind,
  type MinuteSplit,
  type PayrollRates,
} from './domain/payroll'

export interface EmployeeInput {
  staffId: number
  branchId: string
  position: string
  payKind: 'hourly' | 'monthly'
  hourlyRateVnd: number
  monthlySalaryVnd: number
  fixedAllowanceVnd: number
  startedOn: string
  endedOn: string | null
  bankAccount: string | null
  active: boolean
}

export interface ScheduleCell {
  employeeId: number
  workDate: string
  templateId: number | null
  startMinute: number
  endMinute: number
  breakMinutes: number
  dayKind: DayKind
  note: string | null
}

/** Máy trạng thái 5 bước của H7 — mỗi bước chỉ đi được từ đúng một bước trước */
const NEXT_STATE: Record<string, string> = {
  draft: 'locked',
  locked: 'submitted',
  submitted: 'checked',
  checked: 'approved',
  approved: 'paid',
}

/**
 * Nhân sự — H1 hồ sơ · H2 xếp lịch · H7 kỳ lương.
 *
 * DÒNG CHẢY LỊCH → CÔNG → LƯƠNG, mỗi bước khoá bước trước (§26). Ba chỗ cưỡng chế
 * điều đó nằm ở đây:
 *   · `publishSchedule` — lịch nháp nhân viên không thấy, nên công chỉ tính từ
 *     lịch ĐÃ công bố.
 *   · `lockTimesheet` — chốt công đóng băng giờ của kỳ; sau đó sửa lịch của kỳ đó
 *     bị chặn, sai thì bút toán công kỳ sau.
 *   · `advance` — không bước nào nhảy cóc: không duyệt được kỳ chưa kiểm, không
 *     kiểm được kỳ chưa trình.
 *
 * KHÔNG CÓ CHẤM CÔNG (H3/H10 chưa dựng): giờ công = giờ theo lịch đã công bố.
 */
@Injectable()
export class HrService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly expenses: ExpensesService,
    private readonly locks: PeriodLockService,
  ) {}

  // ================================================= H1 · Hồ sơ nhân viên

  async employees(branchId: string) {
    await this.requireBranch(branchId)
    const rows = await this.db
      .select({ employee: employees, fullName: staff.fullName, code: staff.code })
      .from(employees)
      .innerJoin(staff, eq(staff.id, employees.staffId))
      .where(eq(employees.branchId, branchId))
      .orderBy(asc(employees.active), asc(staff.fullName))

    return rows.map(({ employee, fullName, code }) => ({ ...employee, fullName, code }))
  }

  /** Tài khoản đăng nhập chưa có hồ sơ — nguồn cho ô chọn khi tạo hồ sơ mới */
  async staffWithoutRecord(branchId: string) {
    return this.db
      .select({ id: staff.id, code: staff.code, fullName: staff.fullName })
      .from(staff)
      .where(
        sql`${staff.active} AND not exists (select 1 from ${employees} e where e.staff_id = ${staff.id})
            AND exists (select 1 from staff_roles r where r.staff_id = ${staff.id}
                        AND (r.branch_id = ${branchId} OR r.branch_id IS NULL))`,
      )
      .orderBy(asc(staff.fullName))
  }

  async saveEmployee(input: EmployeeInput, actor: Actor, id?: number) {
    this.assertEmployee(input)
    await this.requireBranch(input.branchId)

    return this.db.transaction(async (tx) => {
      try {
        if (id) {
          const [row] = await tx
            .update(employees)
            .set(input)
            .where(eq(employees.id, id))
            .returning()
          if (!row) throw new NotFoundException('Không có hồ sơ này')
          await this.audit.write(tx, {
            actor,
            action: 'employee.updated',
            entity: 'employee',
            entityId: String(id),
            payload: { position: input.position, payKind: input.payKind },
          })
          return row
        }

        const [row] = await tx.insert(employees).values(input).returning()
        await this.audit.write(tx, {
          actor,
          action: 'employee.created',
          entity: 'employee',
          entityId: String(row!.id),
          payload: { staffId: input.staffId, position: input.position },
        })
        return row!
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException('Tài khoản này đã có hồ sơ nhân viên')
        }
        throw err
      }
    })
  }

  private assertEmployee(input: EmployeeInput) {
    if (!input.position.trim()) throw new BadRequestException('Phải khai vị trí')
    if (input.payKind === 'hourly' && input.hourlyRateVnd <= 0) {
      throw new BadRequestException('Trả theo giờ thì phải có đơn giá giờ lớn hơn 0')
    }
    if (input.payKind === 'monthly' && input.monthlySalaryVnd <= 0) {
      throw new BadRequestException('Trả theo tháng thì phải có lương cơ bản lớn hơn 0')
    }
  }

  // ==================================================== H2 · Xếp lịch tuần

  async shiftTemplates(branchId: string) {
    return this.db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.branchId, branchId))
      .orderBy(asc(shiftTemplates.sort), asc(shiftTemplates.startMinute))
  }

  async createTemplate(
    input: { branchId: string; name: string; startMinute: number; endMinute: number; breakMinutes: number },
    actor: Actor,
  ) {
    if (input.endMinute <= input.startMinute) {
      throw new BadRequestException('Ca phải kết thúc sau khi bắt đầu')
    }
    const [row] = await this.db.insert(shiftTemplates).values(input).returning()
    await this.db.transaction((tx) =>
      this.audit.write(tx, {
        actor,
        action: 'shift-template.created',
        entity: 'shift_template',
        entityId: String(row!.id),
        payload: { name: input.name },
      }),
    )
    return row!
  }

  /** Lưới lịch một tuần: 7 ngày × nhân viên đang làm việc của chi nhánh */
  async week(branchId: string, weekStart: string) {
    await this.requireBranch(branchId)
    const weekEnd = addDays(weekStart, 6)

    const [people, entries, templates, period] = await Promise.all([
      this.employees(branchId),
      this.db
        .select()
        .from(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.branchId, branchId),
            gte(scheduleEntries.workDate, weekStart),
            lte(scheduleEntries.workDate, weekEnd),
          ),
        ),
      this.shiftTemplates(branchId),
      this.lockedPeriodCovering(branchId, weekStart, weekEnd),
    ])

    const rates = await this.rates(branchId)

    return {
      branchId,
      weekStart,
      weekEnd,
      days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
      templates,
      /** Tuần nằm trong kỳ đã chốt công thì lưới chỉ đọc */
      locked: period !== null,
      lockedReason: period
        ? `Kỳ lương ${period.periodStart} – ${period.periodEnd} đã chốt công; sửa lịch của kỳ đã chốt phải đi qua bút toán công kỳ sau`
        : null,
      employees: people
        .filter((p) => p.active)
        .map((person) => {
          const mine = entries.filter((e) => e.employeeId === person.id)
          const minutes = sumSplits(mine.filter((e) => e.state === 'published').map((e) => splitMinutes(e, rates)))
          return {
            employeeId: person.id,
            fullName: person.fullName,
            position: person.position,
            payKind: person.payKind,
            cells: mine.map((e) => ({
              id: e.id,
              workDate: e.workDate,
              templateId: e.templateId,
              startMinute: e.startMinute,
              endMinute: e.endMinute,
              breakMinutes: e.breakMinutes,
              dayKind: e.dayKind,
              state: e.state,
              note: e.note,
            })),
            /** Giờ công tuần này, chỉ tính ca ĐÃ công bố */
            minutes,
            totalMinutes: minutes.worked + minutes.otNormal + minutes.otRest + minutes.otHoliday,
          }
        }),
    }
  }

  /**
   * Thay CẢ TUẦN của một người, không sửa từng ô.
   *
   * Cùng lý do với công thức món: kéo thả trên lưới thường đổi vài ca một lúc, và
   * một API sửa từng ô sẽ để lịch nằm ở trạng thái nửa vời — đúng lúc đó có người
   * bấm Công bố thì nhân viên nhận được một tuần dở dang.
   */
  async setWeek(
    branchId: string,
    weekStart: string,
    employeeId: number,
    cells: Omit<ScheduleCell, 'employeeId'>[],
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    const weekEnd = addDays(weekStart, 6)
    await this.assertWeekEditable(branchId, weekStart, weekEnd)

    for (const cell of cells) {
      if (cell.workDate < weekStart || cell.workDate > weekEnd) {
        throw new BadRequestException(`Ngày ${cell.workDate} không thuộc tuần đang sửa`)
      }
      if (cell.endMinute <= cell.startMinute) {
        throw new BadRequestException('Ca phải kết thúc sau khi bắt đầu')
      }
      if (cell.breakMinutes < 0 || cell.breakMinutes >= cell.endMinute - cell.startMinute) {
        throw new BadRequestException('Nghỉ giữa ca phải nhỏ hơn độ dài ca')
      }
    }

    return this.db.transaction(async (tx) => {
      // Sửa lịch của tuần ĐÃ QUA là sửa công — theo §4.2b đó là `timesheet.edit-manual`,
      // dòng mà quản lý ca chỉ có ở mức △
      if (weekEnd < todayIso()) {
        await this.approvals.authorize(tx, {
          actor,
          action: 'timesheet.edit-manual',
          entity: 'schedule_week',
          entityId: `${branchId}:${weekStart}:${employeeId}`,
          approval,
        })
      }

      await tx
        .delete(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.employeeId, employeeId),
            gte(scheduleEntries.workDate, weekStart),
            lte(scheduleEntries.workDate, weekEnd),
          ),
        )

      if (cells.length > 0) {
        await tx.insert(scheduleEntries).values(
          cells.map((cell) => ({ ...cell, branchId, employeeId, state: 'draft' as const })),
        )
      }

      await this.audit.write(tx, {
        actor,
        action: 'schedule.updated',
        entity: 'schedule_week',
        entityId: `${branchId}:${weekStart}:${employeeId}`,
        payload: { cells: cells.length },
      })

      return { employeeId, weekStart, cells: cells.length }
    })
  }

  /** Công bố lịch tuần: nháp → nhân viên thấy được, và giờ công bắt đầu tính */
  async publishWeek(branchId: string, weekStart: string, actor: Actor) {
    const weekEnd = addDays(weekStart, 6)
    await this.assertWeekEditable(branchId, weekStart, weekEnd)

    return this.db.transaction(async (tx) => {
      const published = await tx
        .update(scheduleEntries)
        .set({ state: 'published', publishedAt: new Date() })
        .where(
          and(
            eq(scheduleEntries.branchId, branchId),
            eq(scheduleEntries.state, 'draft'),
            gte(scheduleEntries.workDate, weekStart),
            lte(scheduleEntries.workDate, weekEnd),
          ),
        )
        .returning({ id: scheduleEntries.id })

      await this.audit.write(tx, {
        actor,
        action: 'schedule.published',
        entity: 'schedule_week',
        entityId: `${branchId}:${weekStart}`,
        payload: { entries: published.length },
      })

      // Kênh nhân viên (H8) và đẩy Zalo chưa dựng — công bố hiện chỉ đổi trạng thái
      return { weekStart, published: published.length }
    })
  }

  /** Sao chép tuần trước — nút của H2, chép sang dạng NHÁP để còn sửa */
  async copyPreviousWeek(branchId: string, weekStart: string, actor: Actor) {
    const source = addDays(weekStart, -7)
    const weekEnd = addDays(weekStart, 6)
    await this.assertWeekEditable(branchId, weekStart, weekEnd)

    return this.db.transaction(async (tx) => {
      const previous = await tx
        .select()
        .from(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.branchId, branchId),
            gte(scheduleEntries.workDate, source),
            lte(scheduleEntries.workDate, addDays(source, 6)),
          ),
        )
      if (previous.length === 0) {
        throw new BadRequestException('Tuần trước chưa có lịch để chép')
      }

      await tx
        .delete(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.branchId, branchId),
            gte(scheduleEntries.workDate, weekStart),
            lte(scheduleEntries.workDate, weekEnd),
          ),
        )

      await tx.insert(scheduleEntries).values(
        previous.map((e) => ({
          branchId,
          employeeId: e.employeeId,
          workDate: addDays(e.workDate, 7),
          templateId: e.templateId,
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          breakMinutes: e.breakMinutes,
          // Loại ngày KHÔNG chép: lễ của tuần trước không phải lễ của tuần này
          dayKind: 'thuong' as const,
          state: 'draft' as const,
          note: e.note,
        })),
      )

      await this.audit.write(tx, {
        actor,
        action: 'schedule.copied',
        entity: 'schedule_week',
        entityId: `${branchId}:${weekStart}`,
        payload: { from: source, entries: previous.length },
      })

      return { weekStart, copied: previous.length }
    })
  }

  // ======================================================= H7 · Kỳ lương

  async periods(branchId: string) {
    return this.db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.branchId, branchId))
      .orderBy(sql`${payrollPeriods.periodStart} desc`)
  }

  async openPeriod(
    input: { branchId: string; periodStart: string; periodEnd: string },
    actor: Actor,
  ) {
    if (input.periodEnd < input.periodStart) {
      throw new BadRequestException('Kỳ lương phải kết thúc sau khi bắt đầu')
    }
    await this.requireBranch(input.branchId)
    await this.locks.assertOpen(
      input.branchId,
      [input.periodStart, input.periodEnd],
      'mở kỳ lương',
    )

    return this.db.transaction(async (tx) => {
      try {
        const [row] = await tx.insert(payrollPeriods).values(input).returning()
        await this.audit.write(tx, {
          actor,
          action: 'payroll.period-opened',
          entity: 'payroll_period',
          entityId: String(row!.id),
          payload: { ...input },
        })
        return row!
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictException('Kỳ lương này đã mở')
        throw err
      }
    })
  }

  /**
   * Bước 1 — CHỐT CÔNG. Đóng băng giờ của kỳ và hệ số đang áp.
   *
   * Sau bước này lịch của kỳ không sửa được nữa (`assertWeekEditable` chặn), và
   * hệ số lưu vào `rates` để một lần đổi tham số A6 về sau không viết lại kỳ cũ.
   */
  async lockTimesheet(periodId: number, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const period = await this.requirePeriod(tx, periodId, 'draft')
      const rates = await this.rates(period.branchId)

      await tx
        .update(payrollPeriods)
        .set({
          state: 'locked',
          lockedAt: new Date(),
          lockedBy: actor.kind === 'staff' ? actor.staffId : null,
          rates: JSON.stringify(rates),
        })
        .where(eq(payrollPeriods.id, periodId))

      await this.audit.write(tx, {
        actor,
        action: 'payroll.timesheet-locked',
        entity: 'payroll_period',
        entityId: String(periodId),
        payload: { rates },
      })
      return { periodId, state: 'locked' }
    })
  }

  /**
   * Bước 2 — TÍNH NHÁP. Dựng lại toàn bộ dòng lương từ lịch đã công bố.
   *
   * Chạy lại được nhiều lần khi kỳ còn ở trạng thái `locked`: người tính sửa
   * thưởng hay tạm ứng rồi tính lại là chuyện bình thường. Trình duyệt rồi thì
   * không tính lại được nữa — đó là điểm của việc trình.
   */
  async computeDraft(
    periodId: number,
    adjustments: { employeeId: number; bonusVnd?: number; advanceVnd?: number; note?: string }[],
    actor: Actor,
  ) {
    return this.db.transaction(async (tx) => {
      const period = await this.requirePeriod(tx, periodId, 'locked')
      const rates: PayrollRates = period.rates
        ? (JSON.parse(period.rates) as PayrollRates)
        : await this.rates(period.branchId)

      const people = await tx
        .select({ employee: employees, fullName: staff.fullName })
        .from(employees)
        .innerJoin(staff, eq(staff.id, employees.staffId))
        .where(and(eq(employees.branchId, period.branchId), eq(employees.active, true)))

      const entries = await tx
        .select()
        .from(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.branchId, period.branchId),
            eq(scheduleEntries.state, 'published'),
            gte(scheduleEntries.workDate, period.periodStart),
            lte(scheduleEntries.workDate, period.periodEnd),
          ),
        )

      await tx.delete(payrollLines).where(eq(payrollLines.periodId, periodId))

      /**
       * Tạm ứng lấy TỰ ĐỘNG từ phiếu chi loại tạm ứng (C2) trong kỳ. Số nhập tay
       * ở `adjustments` chỉ dùng khi phiếu chi chưa có — một khoản ứng đã có phiếu
       * mà còn gõ lại bằng tay là trừ hai lần vào lương của người ta.
       */
      const advances = await this.expenses.openAdvances(
        period.branchId,
        period.periodStart,
        period.periodEnd,
      )

      const rows = people.map(({ employee, fullName }) => {
        const mine = entries.filter((e) => e.employeeId === employee.id)
        const minutes: MinuteSplit = sumSplits(mine.map((e) => splitMinutes(e, rates)))
        const extra = adjustments.find((a) => a.employeeId === employee.id)
        const fromVouchers = advances.get(employee.id) ?? 0

        const line = computePayrollLine({
          employee,
          minutes,
          rates,
          bonusVnd: extra?.bonusVnd ?? 0,
          advanceVnd: fromVouchers > 0 ? fromVouchers : (extra?.advanceVnd ?? 0),
        })

        return {
          periodId,
          employeeId: employee.id,
          nameSnapshot: fullName,
          positionSnapshot: employee.position,
          payKind: employee.payKind,
          rateSnapshotVnd: line.hourlyRateVnd,
          workedMinutes: minutes.worked,
          otNormalMinutes: minutes.otNormal,
          otRestMinutes: minutes.otRest,
          otHolidayMinutes: minutes.otHoliday,
          basePayVnd: line.basePayVnd,
          overtimePayVnd: line.overtimePayVnd,
          allowanceVnd: line.allowanceVnd,
          bonusVnd: line.bonusVnd,
          grossPayVnd: line.grossPayVnd,
          insuranceVnd: line.insuranceVnd,
          taxVnd: line.taxVnd,
          advanceVnd: line.advanceVnd,
          netPayVnd: line.netPayVnd,
          note: extra?.note ?? null,
        }
      })

      if (rows.length > 0) await tx.insert(payrollLines).values(rows)

      await this.audit.write(tx, {
        actor,
        action: 'payroll.draft-computed',
        entity: 'payroll_period',
        entityId: String(periodId),
        payload: { lines: rows.length, gross: rows.reduce((s, r) => s + r.grossPayVnd, 0) },
      })

      return { periodId, lines: rows.length }
    })
  }

  /**
   * Bước 3–5 — trình · kiểm · duyệt · phát.
   *
   * Mỗi bước là một hành động RIÊNG trong ma trận §4.2b, giữ đúng phân tách nhiệm
   * vụ: R13 trình, R8 kiểm, R10 duyệt và phát. Guard ở controller chặn vai trò
   * sai; hàm này chặn thứ tự sai.
   */
  async advance(periodId: number, to: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [period] = await tx.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId))
      if (!period) throw new NotFoundException('Không có kỳ lương này')

      if (NEXT_STATE[period.state] !== to) {
        throw new ConflictException(
          `Kỳ đang ở bước "${period.state}", bước kế tiếp phải là "${NEXT_STATE[period.state] ?? 'không còn bước nào'}"`,
        )
      }

      if (to === 'submitted') {
        const [count] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(payrollLines)
          .where(eq(payrollLines.periodId, periodId))
        if (Number(count?.n ?? 0) === 0) {
          throw new BadRequestException('Chưa tính nháp — không có dòng lương nào để trình')
        }
      }

      const now = new Date()
      const staffId = actor.kind === 'staff' ? actor.staffId : null
      const stamp = {
        submitted: { submittedAt: now, submittedBy: staffId },
        checked: { checkedAt: now, checkedBy: staffId },
        approved: { approvedAt: now, approvedBy: staffId },
        paid: { paidAt: now },
      }[to]

      await tx
        .update(payrollPeriods)
        .set({ state: to, ...stamp })
        .where(eq(payrollPeriods.id, periodId))

      // Duyệt xong thì đánh dấu tạm ứng đã khấu trừ — kỳ sau không trừ lại
      if (to === 'approved') {
        await this.expenses.settleAdvances(
          tx,
          period.branchId,
          period.periodStart,
          period.periodEnd,
          periodId,
        )
      }

      await this.audit.write(tx, {
        actor,
        action: `payroll.${to}`,
        entity: 'payroll_period',
        entityId: String(periodId),
        payload: { from: period.state },
      })

      return { periodId, state: to }
    })
  }

  /** Bảng lương của một kỳ. Chỉ vai trò có `payroll.view-others` gọi tới đây */
  async periodLines(periodId: number) {
    const [period] = await this.db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.id, periodId))
    if (!period) throw new NotFoundException('Không có kỳ lương này')

    const lines = await this.db
      .select()
      .from(payrollLines)
      .where(eq(payrollLines.periodId, periodId))
      .orderBy(asc(payrollLines.nameSnapshot))

    return {
      period,
      lines,
      totals: {
        gross: lines.reduce((s, l) => s + l.grossPayVnd, 0),
        insurance: lines.reduce((s, l) => s + l.insuranceVnd, 0),
        tax: lines.reduce((s, l) => s + l.taxVnd, 0),
        net: lines.reduce((s, l) => s + l.netPayVnd, 0),
      },
    }
  }

  /**
   * Phiếu lương của CHÍNH MÌNH (§4.2b dòng đầu, ai cũng có).
   *
   * Không nhận `employeeId` từ ngoài: người gọi chỉ xem được của mình, và cách
   * chắc chắn nhất để không nhầm là không cho họ nói mình là ai.
   */
  async myPayslips(actor: Actor) {
    if (actor.kind !== 'staff' || !actor.staffId) {
      throw new ForbiddenException('Chỉ nhân viên xem được phiếu lương')
    }
    const [me] = await this.db
      .select()
      .from(employees)
      .where(eq(employees.staffId, actor.staffId))
    if (!me) return []

    return this.db
      .select({ line: payrollLines, period: payrollPeriods })
      .from(payrollLines)
      .innerJoin(payrollPeriods, eq(payrollPeriods.id, payrollLines.periodId))
      .where(
        and(
          eq(payrollLines.employeeId, me.id),
          // Phiếu lương chỉ tồn tại sau khi chủ duyệt — bản nháp không phải phiếu
          inArray(payrollPeriods.state, ['approved', 'paid']),
        ),
      )
      .orderBy(sql`${payrollPeriods.periodStart} desc`)
  }

  /**
   * Chi phí nhân sự của một khoảng ngày — nguồn cho dòng Nhân sự của F7.
   *
   * Ghi nhận theo KỲ KẾT THÚC trong khoảng, không chia nhỏ theo ngày: kỳ lương là
   * một lần chốt, và cắt đôi nó theo biên báo cáo sẽ cho ra con số không khớp với
   * bất kỳ chứng từ nào. Chỉ tính kỳ đã duyệt trở đi — kỳ nháp chưa phải chi phí.
   */
  async labourCost(branchId: string, from: string, to: string) {
    const [row] = await this.db
      .select({
        gross: sql<number>`coalesce(sum(${payrollLines.grossPayVnd}), 0)::float8`,
        people: sql<number>`count(distinct ${payrollLines.employeeId})::int`,
        periods: sql<number>`count(distinct ${payrollLines.periodId})::int`,
      })
      .from(payrollLines)
      .innerJoin(payrollPeriods, eq(payrollPeriods.id, payrollLines.periodId))
      .where(
        and(
          eq(payrollPeriods.branchId, branchId),
          inArray(payrollPeriods.state, ['approved', 'paid']),
          gte(payrollPeriods.periodEnd, from),
          lte(payrollPeriods.periodEnd, to),
        ),
      )

    return {
      grossVnd: Number(row?.gross ?? 0),
      people: Number(row?.people ?? 0),
      periods: Number(row?.periods ?? 0),
    }
  }

  /**
   * Chi nhân sự TÁCH THEO TỪNG NGƯỜI — chỉ F7 ở chế độ đầy đủ gọi tới.
   *
   * Nguyên tắc cứng thứ tư (§4.2b) sống hay chết ở chỗ này: quản lý ca đọc được
   * dòng tổng nhưng không bao giờ đi tới hàm này. Nên nó là hàm riêng chứ không
   * phải một tham số của `labourCost` — một cờ boolean quên truyền là một lần rò
   * lương, còn một hàm không gọi tới thì không rò được.
   */
  async labourByEmployee(branchId: string, range: { from: string; to: string }) {
    const rows = await this.db
      .select({
        name: payrollLines.nameSnapshot,
        position: payrollLines.positionSnapshot,
        grossPayVnd: sql<number>`coalesce(sum(${payrollLines.grossPayVnd}), 0)::float8`,
      })
      .from(payrollLines)
      .innerJoin(payrollPeriods, eq(payrollPeriods.id, payrollLines.periodId))
      .where(
        and(
          eq(payrollPeriods.branchId, branchId),
          inArray(payrollPeriods.state, ['approved', 'paid']),
          gte(payrollPeriods.periodEnd, range.from),
          lte(payrollPeriods.periodEnd, range.to),
        ),
      )
      .groupBy(payrollLines.nameSnapshot, payrollLines.positionSnapshot)
      .orderBy(sql`3 desc`)

    return rows.map((r) => ({ ...r, grossPayVnd: Number(r.grossPayVnd) }))
  }

  // --------------------------------------------------------------- phụ trợ

  /** Hệ số lấy từ Trung tâm tham số A6 — H6 là cửa vào theo ngữ cảnh (§26 H6) */
  private async rates(branchId: string): Promise<PayrollRates> {
    const get = (key: string, fallback: number) => this.params.getNumber(key, fallback, branchId)
    return {
      standardDailyMinutes: await get('payroll.standardDailyMinutes', 480),
      standardMonthlyMinutes: await get('payroll.standardMonthlyMinutes', 26 * 480),
      otNormal: await get('payroll.otNormalRate', 1.5),
      otRest: await get('payroll.otRestRate', 2),
      otHoliday: await get('payroll.otHolidayRate', 3),
      insuranceEmployee: await get('payroll.insuranceEmployeeRate', 0.105),
      pitWithhold: await get('payroll.pitWithholdRate', 0),
    }
  }

  private async lockedPeriodCovering(branchId: string, from: string, to: string) {
    const [row] = await this.db
      .select()
      .from(payrollPeriods)
      .where(
        and(
          eq(payrollPeriods.branchId, branchId),
          sql`${payrollPeriods.state} <> 'draft'`,
          lte(payrollPeriods.periodStart, to),
          gte(payrollPeriods.periodEnd, from),
        ),
      )
    return row ?? null
  }

  private async assertWeekEditable(branchId: string, weekStart: string, weekEnd: string) {
    // Hai lớp khác nhau: khoá sổ kế toán (F6) chặn cả tháng, còn chốt công (H7)
    // chỉ chặn kỳ lương. Một tuần vắt qua mốc tháng thì lớp đầu kiểm cả hai tháng.
    await this.locks.assertOpen(branchId, [weekStart, weekEnd], 'sửa lịch làm')

    const locked = await this.lockedPeriodCovering(branchId, weekStart, weekEnd)
    if (locked) {
      throw new ConflictException({
        code: 'period_locked',
        message: `Kỳ lương ${locked.periodStart} – ${locked.periodEnd} đã chốt công — sai thì ghi bút toán công ở kỳ sau, không sửa lịch cũ`,
      })
    }
  }

  private async requirePeriod(tx: Tx, periodId: number, expected: string) {
    const [period] = await tx.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId))
    if (!period) throw new NotFoundException('Không có kỳ lương này')
    if (period.state !== expected) {
      throw new ConflictException(`Kỳ đang ở bước "${period.state}", không phải "${expected}"`)
    }
    return period
  }

  private async requireBranch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return branch
  }
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
