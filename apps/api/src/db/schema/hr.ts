import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { branches, staff } from './identity'

/**
 * ====== NHÂN SỰ: LỊCH → CÔNG → LƯƠNG ======
 *
 * "Dòng chảy chuẩn, mỗi bước khoá bước trước" (§26). Lược đồ cưỡng chế đúng thứ
 * tự đó: không chốt công thì không tính được lương nháp, chốt rồi thì lịch của kỳ
 * đó không sửa được nữa.
 *
 * Bốn bảng, bốn vai trò khác hẳn nhau:
 *   · `schedule_entries` — DỰ ĐỊNH. Ai được xếp vào ca nào (H2).
 *   · `time_entries`     — THỰC TẾ. Ai đã đứng ở quán bao lâu (H3 · H4).
 *   · `leave_requests`   — NGOẠI LỆ đã được duyệt (H5).
 *   · `payroll_*`        — TIỀN, tính từ bảng công đã chốt (H7).
 *
 * Lương tính từ `time_entries`, KHÔNG từ lịch xếp. Trả theo lịch nghĩa là trả cho
 * người không đến và quỵt của người ở lại dọn — hai lỗi ngược chiều nhau mà không
 * ai phát hiện, vì bảng lương vẫn ra một con số trông hợp lý.
 */

/**
 * H1 — Hồ sơ nhân viên. Gắn 1-1 với tài khoản đăng nhập (§26 H1).
 *
 * Tách khỏi bảng `staff` chứ không thêm cột vào đó, vì `staff` là bảng ĐỊNH DANH
 * mà POS/KDS đọc mỗi lần đăng nhập; nhét đơn giá lương vào đó nghĩa là mỗi lượt
 * xác thực ở quầy đều kéo theo số lương của người đứng quầy. Nguyên tắc cứng thứ
 * tư (§4.2b) nói lương là dữ liệu nhạy cảm — giữ nó ở bảng riêng là bước đầu tiên
 * để nói được câu đó bằng phân quyền.
 */
export const employees = pgTable(
  'employees',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    staffId: bigint('staff_id', { mode: 'number' })
      .notNull()
      .unique()
      .references(() => staff.id),
    /** Chi nhánh chính; người làm nhiều chi nhánh vẫn xếp lịch được ở nơi khác */
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    position: text('position').notNull(),
    /** `$type` để tầng miền khỏi phải ép kiểu ở mọi nơi đọc — CHECK bên dưới mới
     *  là thứ cưỡng chế, đây chỉ là nói lại cùng một điều bằng TypeScript */
    payKind: text('pay_kind').notNull().$type<'hourly' | 'monthly'>(),
    /** Đơn giá giờ, VND — dùng khi `payKind = 'hourly'` */
    hourlyRateVnd: bigint('hourly_rate_vnd', { mode: 'number' }).notNull().default(0),
    /** Lương cơ bản tháng, VND — dùng khi `payKind = 'monthly'` */
    monthlySalaryVnd: bigint('monthly_salary_vnd', { mode: 'number' }).notNull().default(0),
    /** Phụ cấp cố định mỗi kỳ (trách nhiệm, xăng xe) */
    fixedAllowanceVnd: bigint('fixed_allowance_vnd', { mode: 'number' }).notNull().default(0),
    startedOn: date('started_on').notNull(),
    endedOn: date('ended_on'),
    /** Tài khoản nhận lương — chuỗi tự do, chưa đấu nối API chi lương */
    bankAccount: text('bank_account'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    check('employees_pay_kind_check', sql`${t.payKind} IN ('hourly','monthly')`),
    check(
      'employees_rate_nonneg',
      sql`${t.hourlyRateVnd} >= 0 AND ${t.monthlySalaryVnd} >= 0 AND ${t.fixedAllowanceVnd} >= 0`,
    ),
    // Trả theo giờ mà đơn giá 0 thì kỳ lương ra 0₫ mà không ai báo gì — chặn ở đây
    check(
      'employees_rate_required',
      sql`(${t.payKind} = 'hourly' AND ${t.hourlyRateVnd} > 0)
       OR (${t.payKind} = 'monthly' AND ${t.monthlySalaryVnd} > 0)`,
    ),
    check('employees_ended_after_started', sql`${t.endedOn} IS NULL OR ${t.endedOn} >= ${t.startedOn}`),
    index('employees_branch_idx').on(t.branchId, t.active),
  ],
)

/** Ca mẫu để kéo thả trên H2: Sáng 8–16 · Chiều 15–23 · Gãy… */
export const shiftTemplates = pgTable(
  'shift_templates',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    name: text('name').notNull(),
    /** Phút kể từ 00:00 giờ địa phương */
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    /** Nghỉ giữa ca, phút — trừ khỏi giờ công */
    breakMinutes: integer('break_minutes').notNull().default(0),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check('shift_templates_range_check', sql`${t.endMinute} > ${t.startMinute}`),
    check(
      'shift_templates_break_check',
      sql`${t.breakMinutes} >= 0 AND ${t.breakMinutes} < ${t.endMinute} - ${t.startMinute}`,
    ),
    index('shift_templates_branch_idx').on(t.branchId, t.sort),
  ],
)

/**
 * H2 — Một ô của lưới lịch tuần: một người, một ngày, một ca.
 *
 * `state = 'draft'` là lịch nháp — nhân viên KHÔNG thấy (§26 H2). Công bố là thao
 * tác theo cả tuần × chi nhánh, nhưng trạng thái nằm trên từng ô để một ca thêm
 * vào sau khi công bố không âm thầm hiện ra trước khi người xếp lịch công bố lại.
 */
export const scheduleEntries = pgTable(
  'schedule_entries',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    employeeId: bigint('employee_id', { mode: 'number' })
      .notNull()
      .references(() => employees.id),
    workDate: date('work_date').notNull(),
    templateId: bigint('template_id', { mode: 'number' }).references(() => shiftTemplates.id),
    /** Đóng băng lúc xếp: sửa ca mẫu về sau không được làm đổi lịch đã công bố */
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    breakMinutes: integer('break_minutes').notNull().default(0),
    /** Ngày lễ tính hệ số tăng ca 300%; ngày nghỉ tuần 200% (§26 H6) */
    dayKind: text('day_kind').notNull().default('thuong').$type<'thuong' | 'nghi' | 'le'>(),
    state: text('state').notNull().default('draft'),
    note: text('note'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('schedule_entries_range_check', sql`${t.endMinute} > ${t.startMinute}`),
    check(
      'schedule_entries_break_check',
      sql`${t.breakMinutes} >= 0 AND ${t.breakMinutes} < ${t.endMinute} - ${t.startMinute}`,
    ),
    check('schedule_entries_state_check', sql`${t.state} IN ('draft','published')`),
    check('schedule_entries_day_kind_check', sql`${t.dayKind} IN ('thuong','nghi','le')`),
    check(
      'schedule_entries_published_at_check',
      sql`(${t.state} = 'draft' AND ${t.publishedAt} IS NULL)
       OR (${t.state} = 'published' AND ${t.publishedAt} IS NOT NULL)`,
    ),
    // Một người một ngày một ca: ca gãy khai bằng giờ bắt đầu/kết thúc rộng hơn,
    // không phải bằng hai dòng — hai dòng sẽ làm giờ công cộng trùng phần nghỉ
    uniqueIndex('schedule_entries_one_per_day').on(t.employeeId, t.workDate),
    index('schedule_entries_grid_idx').on(t.branchId, t.workDate),
  ],
)

/**
 * H3 · H4 — Công THỰC TẾ. Một dòng = một người, một ngày.
 *
 * Vào ca và ra ca là hai mốc tuyệt đối (`timestamptz`), không phải hai số phút:
 * ca đêm vắt qua nửa đêm thì "phút kể từ 00:00" của lúc ra nhỏ hơn lúc vào, và
 * mọi phép trừ sau đó ra số âm. `workDate` là NGÀY LÀM VIỆC mà ca đó thuộc về,
 * tính theo múi giờ chi nhánh — nó gắn ca 22:00–02:00 vào đúng một ngày.
 *
 * `source` nói con số này từ đâu ra, và đó là thông tin kiểm toán chứ không phải
 * trang trí: giờ do kiosk ghi và giờ do quản lý gõ tay có mức tin cậy khác nhau,
 * nên H4 hiện rõ dòng nào đã bị sửa, ai sửa và vì sao.
 */
export const timeEntries = pgTable(
  'time_entries',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    employeeId: bigint('employee_id', { mode: 'number' })
      .notNull()
      .references(() => employees.id),
    workDate: date('work_date').notNull(),
    /** Ca đã xếp tương ứng; NULL khi người này đi làm mà không có trong lịch */
    scheduleEntryId: bigint('schedule_entry_id', { mode: 'number' }).references(
      () => scheduleEntries.id,
    ),

    clockIn: timestamp('clock_in', { withTimezone: true }).notNull(),
    /** NULL = đang trong ca, chưa chấm ra */
    clockOut: timestamp('clock_out', { withTimezone: true }),
    /** Nghỉ giữa ca, phút — mặc định lấy theo ca đã xếp */
    breakMinutes: integer('break_minutes').notNull().default(0),

    /** 'kiosk' H10 · 'manual' quản lý gõ ở H4 · 'pos' suy từ phiên đăng nhập */
    source: text('source').notNull().default('kiosk'),
    /** Ảnh chụp lúc chấm (bật/tắt ở A6) — đường dẫn, chưa có kho ảnh nên để trống */
    photoUrl: text('photo_url'),

    /** Bắt buộc khi có sửa tay: §4.2b "sửa công tay kèm lý do, ghi nhật ký" */
    editReason: text('edit_reason'),
    editedBy: bigint('edited_by', { mode: 'number' }).references(() => staff.id),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('time_entries_source_check', sql`${t.source} IN ('kiosk','manual','pos')`),
    check('time_entries_order_check', sql`${t.clockOut} IS NULL OR ${t.clockOut} > ${t.clockIn}`),
    check('time_entries_break_nonneg', sql`${t.breakMinutes} >= 0`),
    // Sửa tay mà không nói lý do thì bảng công mất đường truy ngược
    check(
      'time_entries_edit_reason_check',
      sql`${t.source} <> 'manual' OR ${t.editReason} IS NOT NULL`,
    ),
    // Một người một ngày một bản ghi công: ca gãy khai bằng `break_minutes`, cùng
    // quy ước với `schedule_entries` — hai dòng sẽ cộng trùng phần nghỉ
    uniqueIndex('time_entries_one_per_day').on(t.employeeId, t.workDate),
    index('time_entries_board_idx').on(t.branchId, t.workDate),
  ],
)

/**
 * H5 — Yêu cầu nghỉ và đổi ca.
 *
 * Một bảng cho hai loại vì chúng đi qua CÙNG một hàng đợi duyệt và cùng một hệ
 * quả: duyệt xong thì lịch H2 và bảng công H4 đổi theo. Tách hai bảng chỉ để rồi
 * viết hai lần cùng một luồng duyệt.
 *
 * Đổi ca có `counterpartId` — người nhận ca. Quy tắc "quản lý duyệt cả cặp" (§26
 * H5) nghĩa là một bản ghi mang cả hai người, không phải hai bản ghi rời có thể
 * bị duyệt lệch nhau.
 */
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    employeeId: bigint('employee_id', { mode: 'number' })
      .notNull()
      .references(() => employees.id),
    /** 'nghi-phep' · 'nghi-khong-luong' · 'nghi-om' · 'doi-ca' */
    kind: text('kind').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    /** Người nhận ca — chỉ với `kind = 'doi-ca'` */
    counterpartId: bigint('counterpart_id', { mode: 'number' }).references(() => employees.id),
    reason: text('reason').notNull(),

    state: text('state').notNull().default('pending'),
    decidedBy: bigint('decided_by', { mode: 'number' }).references(() => staff.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Lý do từ chối — người bị từ chối có quyền biết vì sao */
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'leave_requests_kind_check',
      sql`${t.kind} IN ('nghi-phep','nghi-khong-luong','nghi-om','doi-ca')`,
    ),
    check('leave_requests_state_check', sql`${t.state} IN ('pending','approved','rejected')`),
    check('leave_requests_range_check', sql`${t.toDate} >= ${t.fromDate}`),
    // Đổi ca phải có người nhận; nghỉ phép thì không
    check(
      'leave_requests_counterpart_check',
      sql`(${t.kind} = 'doi-ca' AND ${t.counterpartId} IS NOT NULL)
       OR (${t.kind} <> 'doi-ca' AND ${t.counterpartId} IS NULL)`,
    ),
    check('leave_requests_not_self', sql`${t.counterpartId} IS DISTINCT FROM ${t.employeeId}`),
    // Đã quyết thì phải có người quyết và lúc quyết
    check(
      'leave_requests_decided_check',
      sql`${t.state} = 'pending' OR (${t.decidedBy} IS NOT NULL AND ${t.decidedAt} IS NOT NULL)`,
    ),
    index('leave_requests_queue_idx').on(t.branchId, t.state, t.fromDate),
  ],
)

/**
 * H7 — Kỳ lương. Máy trạng thái 5 bước của mẫu WZ, cưỡng chế bằng CHECK.
 *
 * `timesheet_locked` là mốc không quay lại được: "sau chốt không sửa — sai thì
 * bút toán công kỳ sau" (§26 H7).
 */
export const payrollPeriods = pgTable(
  'payroll_periods',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    state: text('state').notNull().default('draft'),

    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: bigint('locked_by', { mode: 'number' }).references(() => staff.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: bigint('submitted_by', { mode: 'number' }).references(() => staff.id),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    checkedBy: bigint('checked_by', { mode: 'number' }).references(() => staff.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: bigint('approved_by', { mode: 'number' }).references(() => staff.id),
    paidAt: timestamp('paid_at', { withTimezone: true }),

    /** Hệ số và tỉ lệ đóng băng lúc chốt công — đổi tham số A6 không viết lại kỳ cũ */
    rates: text('rates'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'payroll_periods_state_check',
      sql`${t.state} IN ('draft','locked','submitted','checked','approved','paid')`,
    ),
    check('payroll_periods_range_check', sql`${t.periodEnd} >= ${t.periodStart}`),
    // Mỗi bước phải có dấu vết của bước trước: không thể duyệt một kỳ chưa chốt công
    check(
      'payroll_periods_order_check',
      sql`(${t.state} = 'draft')
       OR (${t.state} = 'locked'    AND ${t.lockedAt} IS NOT NULL)
       OR (${t.state} = 'submitted' AND ${t.lockedAt} IS NOT NULL AND ${t.submittedAt} IS NOT NULL)
       OR (${t.state} = 'checked'   AND ${t.submittedAt} IS NOT NULL AND ${t.checkedAt} IS NOT NULL)
       OR (${t.state} = 'approved'  AND ${t.checkedAt} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)
       OR (${t.state} = 'paid'      AND ${t.approvedAt} IS NOT NULL AND ${t.paidAt} IS NOT NULL)`,
    ),
    uniqueIndex('payroll_periods_one_per_range').on(t.branchId, t.periodStart, t.periodEnd),
  ],
)

/**
 * Dòng lương của một người trong một kỳ.
 *
 * Mọi con số đều ĐÓNG BĂNG tại lúc tính nháp, kể cả đơn giá và hệ số: kỳ lương đã
 * duyệt phải in ra được y hệt sau một năm, dù hồ sơ nhân viên đã tăng lương và
 * tham số A6 đã đổi hai lần. Đây là cùng lý do dòng đơn chụp lại tên và giá món.
 */
export const payrollLines = pgTable(
  'payroll_lines',
  {
    periodId: bigint('period_id', { mode: 'number' })
      .notNull()
      .references(() => payrollPeriods.id),
    employeeId: bigint('employee_id', { mode: 'number' })
      .notNull()
      .references(() => employees.id),

    /** Ảnh chụp hồ sơ lúc tính */
    nameSnapshot: text('name_snapshot').notNull(),
    positionSnapshot: text('position_snapshot').notNull(),
    payKind: text('pay_kind').notNull(),
    rateSnapshotVnd: bigint('rate_snapshot_vnd', { mode: 'number' }).notNull(),

    /** Giờ công quy ra PHÚT — chia giờ ra số lẻ là chỗ sai tiền kinh điển */
    workedMinutes: integer('worked_minutes').notNull().default(0),
    otNormalMinutes: integer('ot_normal_minutes').notNull().default(0),
    otRestMinutes: integer('ot_rest_minutes').notNull().default(0),
    otHolidayMinutes: integer('ot_holiday_minutes').notNull().default(0),

    basePayVnd: bigint('base_pay_vnd', { mode: 'number' }).notNull().default(0),
    overtimePayVnd: bigint('overtime_pay_vnd', { mode: 'number' }).notNull().default(0),
    allowanceVnd: bigint('allowance_vnd', { mode: 'number' }).notNull().default(0),
    bonusVnd: bigint('bonus_vnd', { mode: 'number' }).notNull().default(0),
    /** Tổng chi phí của quán trước khấu trừ — con số F7 đọc */
    grossPayVnd: bigint('gross_pay_vnd', { mode: 'number' }).notNull().default(0),

    insuranceVnd: bigint('insurance_vnd', { mode: 'number' }).notNull().default(0),
    taxVnd: bigint('tax_vnd', { mode: 'number' }).notNull().default(0),
    advanceVnd: bigint('advance_vnd', { mode: 'number' }).notNull().default(0),
    netPayVnd: bigint('net_pay_vnd', { mode: 'number' }).notNull().default(0),

    note: text('note'),
  },
  (t) => [
    check(
      'payroll_lines_nonneg',
      sql`${t.basePayVnd} >= 0 AND ${t.overtimePayVnd} >= 0 AND ${t.allowanceVnd} >= 0
      AND ${t.bonusVnd} >= 0 AND ${t.insuranceVnd} >= 0 AND ${t.taxVnd} >= 0
      AND ${t.advanceVnd} >= 0`,
    ),
    check(
      'payroll_lines_minutes_nonneg',
      sql`${t.workedMinutes} >= 0 AND ${t.otNormalMinutes} >= 0
      AND ${t.otRestMinutes} >= 0 AND ${t.otHolidayMinutes} >= 0`,
    ),
    uniqueIndex('payroll_lines_one_per_employee').on(t.periodId, t.employeeId),
  ],
)
