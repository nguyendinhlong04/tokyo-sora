import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { businessDateOf, startOfBusinessDay } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import type { Db } from '../../db/client'
import {
  branches,
  employees,
  leaveRequests,
  payrollPeriods,
  scheduleEntries,
  staff,
  staffSessions,
  timeEntries,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import { punctualityOf, splitWorkedDay, workedMinutesOf, type PayrollRates } from './domain/payroll'

export interface ManualEntryInput {
  employeeId: number
  workDate: string
  /** 'HH:MM' giờ địa phương của chi nhánh */
  clockIn: string
  clockOut: string | null
  breakMinutes: number
  reason: string
}

export interface LeaveInput {
  employeeId: number
  kind: 'nghi-phep' | 'nghi-khong-luong' | 'nghi-om' | 'doi-ca'
  fromDate: string
  toDate: string
  counterpartId: number | null
  reason: string
}

/**
 * H3 · H4 · H5 — công thực tế và ngoại lệ đã duyệt.
 *
 * Tách khỏi `HrService` không phải vì file dài mà vì hai thứ khác nhau: bên kia
 * là DỰ ĐỊNH và TIỀN (lịch, kỳ lương), bên này là SỰ THẬT (ai đã đứng ở quán bao
 * lâu). Chúng gặp nhau đúng một chỗ — `workedSplits`, hàm mà kỳ lương gọi để lấy
 * giờ công của cả kỳ.
 *
 * Ba chốt chặn đáng chú ý:
 *   · Chấm công KHÔNG sửa được sau khi kỳ lương đã chốt công — cùng ranh giới với
 *     lịch, vì cả hai đều là đầu vào của cùng con số tiền.
 *   · Sửa tay bắt buộc có lý do (§4.2b) và R7 phải có người khác duyệt; R13 thì
 *     trực tiếp. Guard chỉ chặn `deny`, nên chỗ đòi duyệt nằm ở đây.
 *   · Đối chiếu chéo với phiên đăng nhập POS/KDS (§26): có làm mà không chấm →
 *     H3 nhắc; có chấm mà không có hoạt động → H3 cảnh báo.
 */
@Injectable()
export class TimesheetService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
  ) {}

  // ============================================== H3 · Chấm công hôm nay

  /**
   * Bảng chấm công của một ngày.
   *
   * Ghép ba nguồn: ai được xếp ca hôm nay (lịch), ai đã chấm (công), ai đang có
   * phiên đăng nhập ở quán (POS/KDS). Ba nguồn đó lệch nhau chính là thứ màn này
   * tồn tại để chỉ ra — người có phiên POS mà chưa chấm công là người sẽ bị trả
   * thiếu, còn người chấm công mà không có hoạt động nào là chuyện cần hỏi.
   */
  async board(branchId: string, workDate: string) {
    const timezone = await this.timezoneOf(branchId)
    const dayStart = startOfBusinessDay(workDate, timezone)
    const dayEnd = new Date(dayStart.getTime() + 86_400_000)

    const [people, shifts, entries, sessions, leaves] = await Promise.all([
      this.db
        .select({ employee: employees, fullName: staff.fullName, staffId: staff.id })
        .from(employees)
        .innerJoin(staff, eq(staff.id, employees.staffId))
        .where(and(eq(employees.branchId, branchId), eq(employees.active, true)))
        .orderBy(asc(staff.fullName)),
      this.db
        .select()
        .from(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.branchId, branchId),
            eq(scheduleEntries.workDate, workDate),
            eq(scheduleEntries.state, 'published'),
          ),
        ),
      this.db
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.branchId, branchId), eq(timeEntries.workDate, workDate))),
      // Phiên vận hành mở trong ngày — bằng chứng "có làm"
      this.db
        .select({ staffId: staffSessions.staffId })
        .from(staffSessions)
        .where(
          and(
            eq(staffSessions.branchId, branchId),
            gte(staffSessions.createdAt, dayStart),
            sql`${staffSessions.createdAt} < ${dayEnd}`,
            sql`${staffSessions.deviceId} IS NOT NULL`,
          ),
        ),
      this.db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.branchId, branchId),
            eq(leaveRequests.state, 'approved'),
            lte(leaveRequests.fromDate, workDate),
            gte(leaveRequests.toDate, workDate),
          ),
        ),
    ])

    const grace = await this.params.getNumber('payroll.lateGraceMinutes', 5, branchId)
    const now = new Date()

    const rows = people.map(({ employee, fullName, staffId }) => {
      const shift = shifts.find((s) => s.employeeId === employee.id) ?? null
      const entry = entries.find((e) => e.employeeId === employee.id) ?? null
      const onLeave = leaves.find((l) => l.employeeId === employee.id) ?? null
      const hasSession = sessions.some((s) => s.staffId === staffId)

      const shiftBounds = shift
        ? {
            startAt: new Date(dayStart.getTime() + shift.startMinute * 60_000),
            endAt: new Date(dayStart.getTime() + shift.endMinute * 60_000),
          }
        : null

      const punctuality =
        entry && shiftBounds
          ? punctualityOf(
              { clockIn: entry.clockIn, clockOut: entry.clockOut },
              shiftBounds,
              grace,
            )
          : { lateMinutes: 0, earlyLeaveMinutes: 0 }

      return {
        employeeId: employee.id,
        staffId,
        fullName,
        position: employee.position,
        scheduled: shift
          ? { startMinute: shift.startMinute, endMinute: shift.endMinute, dayKind: shift.dayKind }
          : null,
        clockIn: entry?.clockIn ?? null,
        clockOut: entry?.clockOut ?? null,
        breakMinutes: entry?.breakMinutes ?? 0,
        source: entry?.source ?? null,
        workedMinutes: entry
          ? workedMinutesOf({
              clockIn: entry.clockIn,
              clockOut: entry.clockOut,
              breakMinutes: entry.breakMinutes,
              dayKind: shift?.dayKind ?? 'thuong',
            })
          : 0,
        ...punctuality,
        onLeave: onLeave ? onLeave.kind : null,
        status: statusOf({ shift, entry, onLeave, now, shiftBounds, grace }),
        /**
         * Hai cảnh báo đối chiếu chéo của §26. Chúng KHÔNG chặn gì cả — chúng chỉ
         * nói ra chỗ lệch, vì cả hai đều có lý do chính đáng (quên chấm; đứng
         * quầy hộ mà không mở phiên) và người quyết định là quản lý ca.
         */
        warnWorkedWithoutClock: hasSession && entry === null,
        warnClockWithoutWork: entry !== null && !hasSession,
      }
    })

    return {
      branchId,
      workDate,
      rows,
      summary: {
        scheduled: rows.filter((r) => r.scheduled !== null).length,
        clockedIn: rows.filter((r) => r.clockIn !== null).length,
        late: rows.filter((r) => r.lateMinutes > 0).length,
        absent: rows.filter((r) => r.status === 'vang').length,
        working: rows.filter((r) => r.status === 'dang-lam').length,
      },
    }
  }

  // =============================================== H4 · Bảng công tháng

  /**
   * Lưới công của cả kỳ: mỗi người một hàng, mỗi ngày một ô.
   *
   * Trả cả tổng đã quy theo hệ số tăng ca, vì đó chính là con số kỳ lương sẽ
   * dùng — người duyệt bảng công cần nhìn thấy đúng con số họ đang duyệt, không
   * phải một tổng giờ thô rồi tin rằng bước sau chia đúng.
   */
  async monthly(branchId: string, from: string, to: string) {
    if (to < from) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu')

    const rates = await this.rates(branchId)
    const [people, shifts, entries, leaves, editors] = await Promise.all([
      this.db
        .select({ employee: employees, fullName: staff.fullName })
        .from(employees)
        .innerJoin(staff, eq(staff.id, employees.staffId))
        .where(eq(employees.branchId, branchId))
        .orderBy(asc(staff.fullName)),
      this.db
        .select()
        .from(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.branchId, branchId),
            eq(scheduleEntries.state, 'published'),
            gte(scheduleEntries.workDate, from),
            lte(scheduleEntries.workDate, to),
          ),
        ),
      this.db
        .select()
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.branchId, branchId),
            gte(timeEntries.workDate, from),
            lte(timeEntries.workDate, to),
          ),
        ),
      this.db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.branchId, branchId),
            eq(leaveRequests.state, 'approved'),
            lte(leaveRequests.fromDate, to),
            gte(leaveRequests.toDate, from),
          ),
        ),
      this.db.select({ id: staff.id, fullName: staff.fullName }).from(staff),
    ])

    const locked = await this.lockedPeriod(branchId, from, to)

    const rows = people.map(({ employee, fullName }) => {
      const mine = entries.filter((e) => e.employeeId === employee.id)
      const myShifts = shifts.filter((s) => s.employeeId === employee.id)
      const myLeaves = leaves.filter((l) => l.employeeId === employee.id)

      const days = mine.map((entry) => {
        const shift = myShifts.find((s) => s.workDate === entry.workDate) ?? null
        const dayKind = shift?.dayKind ?? 'thuong'
        const split = splitWorkedDay(
          {
            clockIn: entry.clockIn,
            clockOut: entry.clockOut,
            breakMinutes: entry.breakMinutes,
            dayKind,
          },
          rates,
        )
        return {
          workDate: entry.workDate,
          clockIn: entry.clockIn,
          clockOut: entry.clockOut,
          breakMinutes: entry.breakMinutes,
          dayKind,
          source: entry.source,
          editReason: entry.editReason,
          editedBy: editors.find((s) => s.id === entry.editedBy)?.fullName ?? null,
          ...split,
        }
      })

      const total = days.reduce(
        (acc, d) => ({
          worked: acc.worked + d.worked,
          otNormal: acc.otNormal + d.otNormal,
          otRest: acc.otRest + d.otRest,
          otHoliday: acc.otHoliday + d.otHoliday,
        }),
        { worked: 0, otNormal: 0, otRest: 0, otHoliday: 0 },
      )

      /** Ngày có ca mà không có bản ghi công, và cũng không có phép — vắng thật */
      const missing = myShifts
        .filter(
          (s) =>
            !mine.some((e) => e.workDate === s.workDate) &&
            !myLeaves.some((l) => l.fromDate <= s.workDate && l.toDate >= s.workDate),
        )
        .map((s) => s.workDate)

      return {
        employeeId: employee.id,
        fullName,
        position: employee.position,
        payKind: employee.payKind,
        days,
        total,
        missingDays: missing,
        leaveDays: myLeaves.reduce((sum, l) => sum + daySpan(l.fromDate, l.toDate, from, to), 0),
        openShifts: mine.filter((e) => e.clockOut === null).length,
      }
    })

    return { branchId, from, to, rates, locked, rows }
  }

  /**
   * Ghi hoặc sửa công bằng tay (H4).
   *
   * Đây là thao tác đụng thẳng vào tiền lương, nên nó có ba lớp: lý do bắt buộc
   * (CHECK ở CSDL), duyệt của người khác khi R7 thao tác (§4.2b `timesheet.edit-manual`
   * là dấu △ với R7), và nhật ký A7. Bỏ bất kỳ lớp nào thì một người có thể tự
   * cộng giờ cho chính mình mà không để lại dấu vết.
   */
  async saveManual(
    branchId: string,
    input: ManualEntryInput,
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    if (!input.reason.trim()) throw new BadRequestException('Sửa công tay phải ghi lý do')
    await this.assertTimesheetOpen(branchId, input.workDate)

    const timezone = await this.timezoneOf(branchId)
    const dayStart = startOfBusinessDay(input.workDate, timezone)
    const clockIn = new Date(dayStart.getTime() + parseHhMm(input.clockIn) * 60_000)
    let clockOut =
      input.clockOut === null
        ? null
        : new Date(dayStart.getTime() + parseHhMm(input.clockOut) * 60_000)
    // Ca vắt qua nửa đêm: giờ ra nhỏ hơn giờ vào nghĩa là nó thuộc ngày hôm sau
    if (clockOut !== null && clockOut <= clockIn) {
      clockOut = new Date(clockOut.getTime() + 86_400_000)
    }
    if (input.breakMinutes < 0) throw new BadRequestException('Nghỉ giữa ca không âm')
    if (clockOut !== null && workedMinutesOf({ clockIn, clockOut, breakMinutes: input.breakMinutes, dayKind: 'thuong' }) <= 0) {
      throw new BadRequestException('Nghỉ giữa ca dài bằng cả ca — giờ công còn 0')
    }

    const employee = await this.requireEmployee(input.employeeId, branchId)
    const [shift] = await this.db
      .select({ id: scheduleEntries.id })
      .from(scheduleEntries)
      .where(
        and(
          eq(scheduleEntries.employeeId, employee.id),
          eq(scheduleEntries.workDate, input.workDate),
        ),
      )

    return this.db.transaction(async (tx) => {
      const outcome = await this.approvals.authorize(tx, {
        actor,
        action: 'timesheet.edit-manual',
        entity: 'time_entry',
        entityId: `${input.employeeId}:${input.workDate}`,
        approval,
      })

      const values = {
        branchId,
        employeeId: input.employeeId,
        workDate: input.workDate,
        scheduleEntryId: shift?.id ?? null,
        clockIn,
        clockOut,
        breakMinutes: input.breakMinutes,
        source: 'manual' as const,
        editReason: input.reason.trim(),
        editedBy: actor.kind === 'staff' ? actor.staffId : null,
        editedAt: new Date(),
      }

      const [row] = await tx
        .insert(timeEntries)
        .values(values)
        .onConflictDoUpdate({
          target: [timeEntries.employeeId, timeEntries.workDate],
          set: {
            clockIn: values.clockIn,
            clockOut: values.clockOut,
            breakMinutes: values.breakMinutes,
            source: values.source,
            editReason: values.editReason,
            editedBy: values.editedBy,
            editedAt: values.editedAt,
            scheduleEntryId: values.scheduleEntryId,
          },
        })
        .returning({ id: timeEntries.id })

      await this.audit.write(tx, {
        actor,
        action: 'timesheet.edited',
        entity: 'time_entry',
        entityId: String(row!.id),
        approvalId: outcome.approvalId,
        payload: {
          employeeId: input.employeeId,
          workDate: input.workDate,
          clockIn: input.clockIn,
          clockOut: input.clockOut,
          reason: input.reason,
        },
      })
      return { id: row!.id }
    })
  }

  /** Xoá một ngày công — dùng khi ghi nhầm người. Vẫn phải có lý do và nhật ký. */
  async deleteEntry(branchId: string, id: number, reason: string, actor: Actor) {
    if (!reason.trim()) throw new BadRequestException('Xoá công phải ghi lý do')
    const [row] = await this.db.select().from(timeEntries).where(eq(timeEntries.id, id))
    if (!row || row.branchId !== branchId) throw new NotFoundException('Không có bản ghi công này')
    await this.assertTimesheetOpen(branchId, row.workDate)

    return this.db.transaction(async (tx) => {
      await tx.delete(timeEntries).where(eq(timeEntries.id, id))
      await this.audit.write(tx, {
        actor,
        action: 'timesheet.deleted',
        entity: 'time_entry',
        entityId: String(id),
        payload: { employeeId: row.employeeId, workDate: row.workDate, reason },
      })
      return { id, deleted: true }
    })
  }

  // ================================ H10 · Kiosk chấm công (nguồn của H3)

  /**
   * Chấm vào / chấm ra từ kiosk.
   *
   * Một lần bấm, hệ tự biết là vào hay ra: chưa có bản ghi hôm nay thì là vào,
   * có rồi mà chưa chấm ra thì là ra. Bắt người đang đeo găng chọn đúng nút giữa
   * hai nút giống nhau là cách sinh ra những ca 14 tiếng và những ca 0 phút.
   *
   * Thiết bị GẮN CHI NHÁNH: `branchId` lấy từ thiết bị đã ghép chứ không nhận từ
   * thân yêu cầu — "không chấm từ ngoài" (§26 H10) chỉ có nghĩa nếu chỗ này không
   * tin vào cái mà máy khách gửi lên.
   */
  async punch(branchId: string, staffId: number, actor: Actor) {
    const timezone = await this.timezoneOf(branchId)
    const now = new Date()
    const workDate = businessDateOf(now, timezone)

    const [employee] = await this.db
      .select({ employee: employees, fullName: staff.fullName })
      .from(employees)
      .innerJoin(staff, eq(staff.id, employees.staffId))
      .where(and(eq(employees.staffId, staffId), eq(employees.active, true)))
    if (!employee) throw new NotFoundException('Người này chưa có hồ sơ nhân viên')
    if (employee.employee.branchId !== branchId) {
      // Người làm nhiều chi nhánh vẫn chấm được ở nơi họ được xếp ca hôm đó
      const [shift] = await this.db
        .select({ id: scheduleEntries.id })
        .from(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.employeeId, employee.employee.id),
            eq(scheduleEntries.workDate, workDate),
            eq(scheduleEntries.branchId, branchId),
          ),
        )
      if (!shift) {
        throw new ConflictException('Hôm nay bạn không có ca ở chi nhánh này')
      }
    }
    await this.assertTimesheetOpen(branchId, workDate)

    const [existing] = await this.db
      .select()
      .from(timeEntries)
      .where(
        and(eq(timeEntries.employeeId, employee.employee.id), eq(timeEntries.workDate, workDate)),
      )

    const [shift] = await this.db
      .select()
      .from(scheduleEntries)
      .where(
        and(
          eq(scheduleEntries.employeeId, employee.employee.id),
          eq(scheduleEntries.workDate, workDate),
        ),
      )

    return this.db.transaction(async (tx) => {
      if (!existing) {
        const [row] = await tx
          .insert(timeEntries)
          .values({
            branchId,
            employeeId: employee.employee.id,
            workDate,
            scheduleEntryId: shift?.id ?? null,
            clockIn: now,
            breakMinutes: shift?.breakMinutes ?? 0,
            source: 'kiosk',
          })
          .returning({ id: timeEntries.id })
        await this.audit.write(tx, {
          actor,
          action: 'timesheet.clock-in',
          entity: 'time_entry',
          entityId: String(row!.id),
          payload: { employeeId: employee.employee.id, workDate },
        })
        return {
          direction: 'in' as const,
          fullName: employee.fullName,
          at: now,
          scheduledStartMinute: shift?.startMinute ?? null,
        }
      }

      if (existing.clockOut !== null) {
        throw new ConflictException(
          `${employee.fullName} đã chấm ra hôm nay. Cần sửa thì nhờ quản lý ở bảng công.`,
        )
      }
      if (now <= existing.clockIn) {
        throw new ConflictException('Giờ ra phải sau giờ vào')
      }

      await tx.update(timeEntries).set({ clockOut: now }).where(eq(timeEntries.id, existing.id))
      await this.audit.write(tx, {
        actor,
        action: 'timesheet.clock-out',
        entity: 'time_entry',
        entityId: String(existing.id),
        payload: { employeeId: employee.employee.id, workDate },
      })
      return {
        direction: 'out' as const,
        fullName: employee.fullName,
        at: now,
        workedMinutes: workedMinutesOf({
          clockIn: existing.clockIn,
          clockOut: now,
          breakMinutes: existing.breakMinutes,
          dayKind: 'thuong',
        }),
      }
    })
  }

  // ========================================= H5 · Nghỉ phép & đổi ca

  async leaves(branchId: string, state: string | null) {
    const where = [eq(leaveRequests.branchId, branchId)]
    if (state) where.push(eq(leaveRequests.state, state))

    const rows = await this.db
      .select({ req: leaveRequests, employee: staff.fullName })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .innerJoin(staff, eq(staff.id, employees.staffId))
      .where(and(...where))
      .orderBy(sql`${leaveRequests.state} = 'pending' desc`, asc(leaveRequests.fromDate))

    const counterpartIds = rows
      .map((r) => r.req.counterpartId)
      .filter((id): id is number => id !== null)
    const counterparts = counterpartIds.length
      ? await this.db
          .select({ id: employees.id, fullName: staff.fullName })
          .from(employees)
          .innerJoin(staff, eq(staff.id, employees.staffId))
          .where(inArray(employees.id, counterpartIds))
      : []

    const deciders = await this.db.select({ id: staff.id, fullName: staff.fullName }).from(staff)

    return rows.map(({ req, employee }) => ({
      id: req.id,
      employeeId: req.employeeId,
      employeeName: employee,
      kind: req.kind,
      fromDate: req.fromDate,
      toDate: req.toDate,
      counterpartId: req.counterpartId,
      counterpartName: counterparts.find((c) => c.id === req.counterpartId)?.fullName ?? null,
      reason: req.reason,
      state: req.state,
      decidedBy: deciders.find((d) => d.id === req.decidedBy)?.fullName ?? null,
      decidedAt: req.decidedAt,
      decisionNote: req.decisionNote,
      createdAt: req.createdAt,
    }))
  }

  async createLeave(branchId: string, input: LeaveInput, actor: Actor) {
    if (!input.reason.trim()) throw new BadRequestException('Yêu cầu phải có lý do')
    if (input.toDate < input.fromDate) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu')
    }
    if (input.kind === 'doi-ca' && input.counterpartId === null) {
      throw new BadRequestException('Đổi ca phải chọn người nhận ca')
    }
    if (input.kind !== 'doi-ca' && input.counterpartId !== null) {
      throw new BadRequestException('Chỉ đổi ca mới có người nhận ca')
    }
    await this.requireEmployee(input.employeeId, branchId)
    if (input.counterpartId !== null) await this.requireEmployee(input.counterpartId, branchId)
    await this.assertOwnRequest(input.employeeId, actor)

    const [row] = await this.db
      .insert(leaveRequests)
      .values({ branchId, ...input, reason: input.reason.trim() })
      .returning({ id: leaveRequests.id })
    await this.write(actor, 'leave.requested', String(row!.id), { ...input })
    return { id: row!.id, state: 'pending' }
  }

  /**
   * Phiên Kênh nhân viên chỉ xin nghỉ cho CHÍNH MÌNH.
   *
   * Quản lý gửi hộ được — họ vẫn phải là người duyệt sau đó và thao tác có tên
   * trong nhật ký. Nhưng H8 gửi cùng route này, và `employeeId` nằm trong thân
   * yêu cầu, nên thiếu dòng dưới đây thì một cái link cá nhân sửa được số trong
   * thân là xin nghỉ hộ người khác.
   */
  private async assertOwnRequest(employeeId: number, actor: Actor) {
    if (actor.kind !== 'staff' || actor.scope !== 'self') return
    const [mine] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.staffId, actor.staffId))
    if (!mine || mine.id !== employeeId) {
      throw new ForbiddenException('Kênh nhân viên chỉ gửi được yêu cầu cho chính bạn')
    }
  }

  /**
   * Duyệt hoặc từ chối.
   *
   * Duyệt đổi ca thì HAI ô lịch đổi chỗ cho nhau trong cùng một transaction —
   * đổi một nửa là một người có hai ca còn người kia không có ca nào, và cái sai
   * đó chỉ lộ ra vào tối hôm đó.
   */
  async decideLeave(
    branchId: string,
    id: number,
    decision: { approve: boolean; note: string | null },
    actor: Actor,
  ) {
    const [row] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, id))
    if (!row || row.branchId !== branchId) throw new NotFoundException('Không có yêu cầu này')
    if (row.state !== 'pending') throw new ConflictException('Yêu cầu này đã được quyết rồi')
    await this.assertTimesheetOpen(branchId, row.fromDate)

    return this.db.transaction(async (tx) => {
      await tx
        .update(leaveRequests)
        .set({
          state: decision.approve ? 'approved' : 'rejected',
          decidedBy: actor.kind === 'staff' ? actor.staffId : null,
          decidedAt: new Date(),
          decisionNote: decision.note?.trim() || null,
        })
        .where(eq(leaveRequests.id, id))

      let swapped = 0
      if (decision.approve && row.kind === 'doi-ca' && row.counterpartId !== null) {
        swapped = await this.swapShifts(tx, row.employeeId, row.counterpartId, row.fromDate, row.toDate)
      }
      if (decision.approve && row.kind !== 'doi-ca') {
        // Nghỉ đã duyệt thì gỡ ca khỏi lịch: để ca đó lại là H3 tô đỏ "vắng" mỗi
        // ngày nghỉ phép, và H4 đếm nó vào ngày thiếu công
        const removed = await tx
          .delete(scheduleEntries)
          .where(
            and(
              eq(scheduleEntries.employeeId, row.employeeId),
              gte(scheduleEntries.workDate, row.fromDate),
              lte(scheduleEntries.workDate, row.toDate),
            ),
          )
          .returning({ id: scheduleEntries.id })
        swapped = removed.length
      }

      await this.audit.write(tx, {
        actor,
        action: decision.approve ? 'leave.approved' : 'leave.rejected',
        entity: 'leave_request',
        entityId: String(id),
        payload: { kind: row.kind, employeeId: row.employeeId, shiftsChanged: swapped },
      })
      return { id, state: decision.approve ? 'approved' : 'rejected', shiftsChanged: swapped }
    })
  }

  // ================================ Cửa nối sang kỳ lương H7

  /**
   * Giờ công đã phân loại của cả kỳ, theo từng người.
   *
   * `HrService.computeDraft` gọi hàm này thay vì tự đọc lịch. Loại ngày lấy từ ca
   * đã xếp — bản ghi chấm công không tự khai được nó là ngày lễ.
   */
  async workedSplits(
    branchId: string,
    range: { from: string; to: string },
    rates: PayrollRates,
  ): Promise<Map<number, { worked: number; otNormal: number; otRest: number; otHoliday: number }>> {
    const [entries, shifts] = await Promise.all([
      this.db
        .select()
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.branchId, branchId),
            gte(timeEntries.workDate, range.from),
            lte(timeEntries.workDate, range.to),
          ),
        ),
      this.db
        .select()
        .from(scheduleEntries)
        .where(
          and(
            eq(scheduleEntries.branchId, branchId),
            gte(scheduleEntries.workDate, range.from),
            lte(scheduleEntries.workDate, range.to),
          ),
        ),
    ])

    const out = new Map<number, { worked: number; otNormal: number; otRest: number; otHoliday: number }>()
    for (const entry of entries) {
      const shift = shifts.find(
        (s) => s.employeeId === entry.employeeId && s.workDate === entry.workDate,
      )
      const split = splitWorkedDay(
        {
          clockIn: entry.clockIn,
          clockOut: entry.clockOut,
          breakMinutes: entry.breakMinutes,
          dayKind: shift?.dayKind ?? 'thuong',
        },
        rates,
      )
      const acc = out.get(entry.employeeId) ?? { worked: 0, otNormal: 0, otRest: 0, otHoliday: 0 }
      out.set(entry.employeeId, {
        worked: acc.worked + split.worked,
        otNormal: acc.otNormal + split.otNormal,
        otRest: acc.otRest + split.otRest,
        otHoliday: acc.otHoliday + split.otHoliday,
      })
    }
    return out
  }

  /** Ca chưa chấm ra trong kỳ — chốt công khi còn dòng này là chốt thiếu giờ */
  async openShifts(branchId: string, range: { from: string; to: string }) {
    const rows = await this.db
      .select({ workDate: timeEntries.workDate, fullName: staff.fullName })
      .from(timeEntries)
      .innerJoin(employees, eq(employees.id, timeEntries.employeeId))
      .innerJoin(staff, eq(staff.id, employees.staffId))
      .where(
        and(
          eq(timeEntries.branchId, branchId),
          sql`${timeEntries.clockOut} IS NULL`,
          gte(timeEntries.workDate, range.from),
          lte(timeEntries.workDate, range.to),
        ),
      )
      .orderBy(asc(timeEntries.workDate))
    return rows
  }

  // ============================================================== phụ trợ

  private async swapShifts(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    aId: number,
    bId: number,
    from: string,
    to: string,
  ) {
    const rows = await tx
      .select()
      .from(scheduleEntries)
      .where(
        and(
          inArray(scheduleEntries.employeeId, [aId, bId]),
          gte(scheduleEntries.workDate, from),
          lte(scheduleEntries.workDate, to),
        ),
      )
    if (rows.length === 0) return 0

    // Chỉ số duy nhất (employee, workDate) chặn hoán đổi trực tiếp, nên dời tạm
    // sang một mã âm rồi mới đặt về — cùng transaction nên bên ngoài không thấy
    for (const row of rows) {
      await tx
        .update(scheduleEntries)
        .set({ employeeId: row.employeeId === aId ? bId : aId, state: 'draft', publishedAt: null })
        .where(eq(scheduleEntries.id, row.id))
    }
    return rows.length
  }

  /** Kỳ lương đã chốt công phủ ngày này thì công của ngày đó đóng băng */
  private async assertTimesheetOpen(branchId: string, workDate: string) {
    const [locked] = await this.db
      .select({ id: payrollPeriods.id, start: payrollPeriods.periodStart, end: payrollPeriods.periodEnd })
      .from(payrollPeriods)
      .where(
        and(
          eq(payrollPeriods.branchId, branchId),
          sql`${payrollPeriods.state} <> 'draft'`,
          lte(payrollPeriods.periodStart, workDate),
          gte(payrollPeriods.periodEnd, workDate),
        ),
      )
    if (locked) {
      throw new ConflictException(
        `Kỳ lương ${locked.start} – ${locked.end} đã chốt công. Sai thì ghi bút toán công ở kỳ sau, không sửa ngược.`,
      )
    }
  }

  private async lockedPeriod(branchId: string, from: string, to: string) {
    const [row] = await this.db
      .select({
        id: payrollPeriods.id,
        state: payrollPeriods.state,
        periodStart: payrollPeriods.periodStart,
        periodEnd: payrollPeriods.periodEnd,
      })
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

  private async rates(branchId: string): Promise<PayrollRates> {
    return {
      standardDailyMinutes: await this.params.getNumber('payroll.standardDailyMinutes', 480, branchId),
      standardMonthlyMinutes: await this.params.getNumber('payroll.standardMonthlyMinutes', 12_480, branchId),
      otNormal: await this.params.getNumber('payroll.otNormalRate', 1.5, branchId),
      otRest: await this.params.getNumber('payroll.otRestRate', 2, branchId),
      otHoliday: await this.params.getNumber('payroll.otHolidayRate', 3, branchId),
      insuranceEmployee: await this.params.getNumber('payroll.insuranceEmployeeRate', 0.105, branchId),
      pitWithhold: await this.params.getNumber('payroll.pitWithholdRate', 0, branchId),
    }
  }

  private async requireEmployee(id: number, branchId: string) {
    const [row] = await this.db.select().from(employees).where(eq(employees.id, id))
    if (!row) throw new NotFoundException('Không có nhân viên này')
    if (row.branchId !== branchId) {
      throw new BadRequestException('Nhân viên này thuộc chi nhánh khác')
    }
    return row
  }

  private async timezoneOf(branchId: string): Promise<string> {
    const [row] = await this.db
      .select({ timezone: branches.timezone })
      .from(branches)
      .where(eq(branches.id, branchId))
    if (!row) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return row.timezone
  }

  private async write(actor: Actor, action: string, entityId: string, payload: Record<string, unknown>) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, { actor, action, entity: 'leave_request', entityId, payload })
    })
  }
}

/** 'HH:MM' → phút kể từ 00:00 */
function parseHhMm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) throw new BadRequestException(`Giờ viết theo mẫu HH:MM, nhận "${value}"`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new BadRequestException(`Giờ không hợp lệ: ${value}`)
  return hour * 60 + minute
}

/** Số ngày của một khoảng nghỉ nằm trong cửa sổ đang xem */
function daySpan(from: string, to: string, windowFrom: string, windowTo: string): number {
  const start = from > windowFrom ? from : windowFrom
  const end = to < windowTo ? to : windowTo
  if (end < start) return 0
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
}

/**
 * Trạng thái một người trên bảng H3.
 *
 * `vang` chỉ đặt khi ca ĐÃ BẮT ĐẦU: tô đỏ người của ca tối từ 9 giờ sáng là biến
 * cả bảng thành màu đỏ suốt ngày, và một cảnh báo lúc nào cũng đỏ là cảnh báo
 * không ai đọc nữa.
 */
function statusOf(input: {
  shift: { startMinute: number } | null
  entry: { clockOut: Date | null } | null
  onLeave: { kind: string } | null
  now: Date
  shiftBounds: { startAt: Date } | null
  grace: number
}): 'dang-lam' | 'xong-ca' | 'vang' | 'chua-toi-gio' | 'nghi' | 'ngoai-lich' {
  if (input.onLeave) return 'nghi'
  if (input.entry) return input.entry.clockOut === null ? 'dang-lam' : 'xong-ca'
  if (!input.shift || !input.shiftBounds) return 'ngoai-lich'
  const late = (input.now.getTime() - input.shiftBounds.startAt.getTime()) / 60_000
  return late > input.grace ? 'vang' : 'chua-toi-gio'
}
