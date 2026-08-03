import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, gte, lte, ne } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import {
  branches,
  employees,
  leaveRequests,
  scheduleEntries,
  shiftTemplates,
  staff,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { TimesheetService } from './timesheet.service'

/**
 * H8 · H9 — Kênh nhân viên.
 *
 * Mọi hàm ở đây bắt đầu bằng cùng một câu hỏi: NGƯỜI ĐANG GỌI LÀ AI. Không hàm
 * nào nhận `employeeId` từ máy khách, kể cả để lọc — một tham số như vậy là một
 * lời mời sửa số trên thanh địa chỉ để đọc phiếu lương của người khác.
 *
 * Con số hiển thị ở đây phải TRÙNG với con số quản lý thấy ở H4 và với con số kỳ
 * lương trả, nên bảng công gọi thẳng `TimesheetService.monthly` rồi lấy đúng dòng
 * của mình. Tính lại bằng một truy vấn riêng là tạo nguồn thứ hai cho cùng một
 * con số, và hai nguồn đó sẽ lệch nhau vào đúng tháng có người khiếu nại.
 */
@Injectable()
export class ChannelService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly timesheets: TimesheetService,
  ) {}

  /** Hồ sơ rút gọn: đủ để chào tên, KHÔNG có đơn giá lương */
  async me(actor: Actor) {
    const { employee, fullName, branchName } = await this.requireSelf(actor)
    return {
      employeeId: employee.id,
      fullName,
      position: employee.position,
      branchId: employee.branchId,
      branchName,
      startedOn: employee.startedOn,
    }
  }

  /**
   * Lịch tuần của tôi — CHỈ ca đã công bố.
   *
   * Lọc theo `employeeId` chứ không theo chi nhánh: người làm nhiều chi nhánh
   * phải thấy đủ cả tuần của mình, còn ca ở đâu thì mỗi ô tự nói.
   */
  async week(actor: Actor, weekStart: string) {
    const { employee } = await this.requireSelf(actor)
    const weekEnd = addDays(weekStart, 6)

    const rows = await this.db
      .select({ cell: scheduleEntries, templateName: shiftTemplates.name, branchName: branches.name })
      .from(scheduleEntries)
      .leftJoin(shiftTemplates, eq(shiftTemplates.id, scheduleEntries.templateId))
      .innerJoin(branches, eq(branches.id, scheduleEntries.branchId))
      .where(
        and(
          eq(scheduleEntries.employeeId, employee.id),
          eq(scheduleEntries.state, 'published'),
          gte(scheduleEntries.workDate, weekStart),
          lte(scheduleEntries.workDate, weekEnd),
        ),
      )
      .orderBy(asc(scheduleEntries.workDate))

    return {
      weekStart,
      weekEnd,
      days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
      shifts: rows.map(({ cell, templateName, branchName }) => ({
        workDate: cell.workDate,
        startMinute: cell.startMinute,
        endMinute: cell.endMinute,
        breakMinutes: cell.breakMinutes,
        dayKind: cell.dayKind,
        note: cell.note,
        branchId: cell.branchId,
        branchName,
        templateName,
      })),
    }
  }

  /** Bảng công tháng của tôi — đúng dòng của mình trong bảng H4 */
  async timesheet(actor: Actor, from: string, to: string) {
    const { employee } = await this.requireSelf(actor)
    const board = await this.timesheets.monthly(employee.branchId, from, to)
    const mine = board.rows.find((row) => row.employeeId === employee.id) ?? null

    return {
      from,
      to,
      /**
       * Kỳ đã chốt công phủ lên khoảng này, nếu có. Trả về CẢ MỐC chứ không phải
       * một cờ đúng/sai: kỳ lương hiếm khi trùng khít tháng dương lịch, và câu
       * "tháng này đã chốt" nói khi mới chốt hai ngày đầu tháng là nói sai.
       */
      locked: board.locked
        ? { periodStart: board.locked.periodStart, periodEnd: board.locked.periodEnd }
        : null,
      days: mine?.days ?? [],
      total: mine?.total ?? { worked: 0, otNormal: 0, otRest: 0, otHoliday: 0 },
      missingDays: mine?.missingDays ?? [],
      openShifts: mine?.openShifts ?? 0,
    }
  }

  /** Yêu cầu nghỉ / đổi ca của tôi, kể cả đã bị từ chối — kèm lý do từ chối */
  async leaves(actor: Actor) {
    const { employee } = await this.requireSelf(actor)
    const rows = await this.db
      .select({ request: leaveRequests, deciderName: staff.fullName })
      .from(leaveRequests)
      .leftJoin(staff, eq(staff.id, leaveRequests.decidedBy))
      .where(eq(leaveRequests.employeeId, employee.id))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(50)

    return rows.map(({ request, deciderName }) => ({
      id: request.id,
      kind: request.kind,
      fromDate: request.fromDate,
      toDate: request.toDate,
      reason: request.reason,
      state: request.state,
      decisionNote: request.decisionNote,
      decidedBy: deciderName,
      decidedAt: request.decidedAt,
      createdAt: request.createdAt,
    }))
  }

  /**
   * Đồng nghiệp để chọn người nhận ca. Chỉ tên và mã hồ sơ — kênh này không phải
   * chỗ tra danh bạ, và số điện thoại của đồng nghiệp không phải việc của nó.
   */
  async colleagues(actor: Actor) {
    const { employee } = await this.requireSelf(actor)
    return this.db
      .select({ employeeId: employees.id, fullName: staff.fullName })
      .from(employees)
      .innerJoin(staff, eq(staff.id, employees.staffId))
      .where(
        and(
          eq(employees.branchId, employee.branchId),
          eq(employees.active, true),
          ne(employees.id, employee.id),
        ),
      )
      .orderBy(asc(staff.fullName))
  }

  /**
   * Người đang gọi, dịch sang hồ sơ nhân sự của họ.
   *
   * Một chỗ duy nhất trả lời câu "tôi là ai", nên không có màn nào của kênh này
   * lỡ quên hỏi.
   */
  async requireSelf(actor: Actor) {
    if (actor.kind !== 'staff') {
      throw new ForbiddenException('Kênh nhân viên cần đăng nhập bằng link cá nhân')
    }
    const [row] = await this.db
      .select({ employee: employees, fullName: staff.fullName, branchName: branches.name })
      .from(employees)
      .innerJoin(staff, eq(staff.id, employees.staffId))
      .innerJoin(branches, eq(branches.id, employees.branchId))
      .where(and(eq(employees.staffId, actor.staffId), eq(employees.active, true)))
    if (!row) throw new ForbiddenException('Bạn chưa có hồ sơ nhân viên — hỏi quản lý nhân sự')
    return row
  }
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}
