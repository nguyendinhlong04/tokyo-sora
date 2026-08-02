import { apiFetch } from '@sora/core'

/**
 * Link cá nhân — yếu tố SỞ HỮU của kênh này.
 *
 * Để ở localStorage vì cùng lý do token thiết bị của POS nằm đó: nó định danh
 * CÁI MÁY (điện thoại riêng của một người), phải sống qua mọi lần đóng/mở trình
 * duyệt, và máy chủ luôn kiểm lại nó có còn hiệu lực không — quản lý cấp lại
 * link là bản cũ chết ngay. Token PHIÊN thì vẫn là cookie httpOnly, JavaScript
 * không đọc được.
 */
const LINK_KEY = 'sora.channel.link'

export function getChannelLink(): string | null {
  try {
    return localStorage.getItem(LINK_KEY)
  } catch {
    return null
  }
}

export function setChannelLink(token: string): void {
  localStorage.setItem(LINK_KEY, token)
}

export function clearChannelLink(): void {
  localStorage.removeItem(LINK_KEY)
}

export type DayKind = 'thuong' | 'nghi' | 'le'
export type LeaveKind = 'nghi-phep' | 'nghi-khong-luong' | 'nghi-om' | 'doi-ca'

export interface Profile {
  employeeId: number
  fullName: string
  position: string
  branchId: string
  branchName: string
  startedOn: string
}

export interface WeekShift {
  workDate: string
  startMinute: number
  endMinute: number
  breakMinutes: number
  dayKind: DayKind
  note: string | null
  branchId: string
  branchName: string
  templateName: string | null
}

export interface MyWeek {
  weekStart: string
  weekEnd: string
  days: string[]
  shifts: WeekShift[]
}

export interface WorkedDay {
  workDate: string
  clockIn: string
  clockOut: string | null
  breakMinutes: number
  dayKind: DayKind
  source: 'kiosk' | 'manual' | 'pos'
  editReason: string | null
  editedBy: string | null
  worked: number
  otNormal: number
  otRest: number
  otHoliday: number
}

export interface MinuteTotal {
  worked: number
  otNormal: number
  otRest: number
  otHoliday: number
}

export interface MyTimesheet {
  from: string
  to: string
  locked: boolean
  days: WorkedDay[]
  total: MinuteTotal
  missingDays: string[]
  openShifts: number
}

export interface MyLeave {
  id: number
  kind: LeaveKind
  fromDate: string
  toDate: string
  reason: string
  state: 'pending' | 'approved' | 'rejected'
  decisionNote: string | null
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
}

export interface Colleague {
  employeeId: number
  fullName: string
}

/** H9 — một kỳ lương của chính mình, giữ nguyên hình của bảng `payroll_lines` */
export interface Payslip {
  period: {
    id: number
    periodStart: string
    periodEnd: string
    state: string
    paidAt: string | null
  }
  line: {
    nameSnapshot: string
    positionSnapshot: string
    payKind: 'hourly' | 'monthly'
    rateSnapshotVnd: number
    workedMinutes: number
    otNormalMinutes: number
    otRestMinutes: number
    otHolidayMinutes: number
    basePayVnd: number
    overtimePayVnd: number
    allowanceVnd: number
    bonusVnd: number
    grossPayVnd: number
    insuranceVnd: number
    taxVnd: number
    advanceVnd: number
    netPayVnd: number
    note: string | null
  }
}

export const api = {
  login: (token: string, pin: string) =>
    apiFetch<{ staff: { fullName: string; branchId: string } }>('/api/auth/channel/login', {
      method: 'POST',
      body: { token, pin },
    }),

  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => apiFetch<Profile>('/api/hr/me'),

  week: (weekStart: string) => apiFetch<MyWeek>(`/api/hr/me/schedule?week=${weekStart}`),

  timesheet: (from: string, to: string) =>
    apiFetch<MyTimesheet>(`/api/hr/me/timesheet?from=${from}&to=${to}`),

  leaves: () => apiFetch<MyLeave[]>('/api/hr/me/leaves'),

  colleagues: () => apiFetch<Colleague[]>('/api/hr/me/colleagues'),

  /**
   * Gửi yêu cầu vào ĐÚNG hàng đợi duyệt của H5 — không có hàng đợi riêng cho
   * kênh này. Máy chủ tự chặn việc gửi hộ người khác.
   */
  sendLeave: (input: {
    branchId: string
    employeeId: number
    kind: LeaveKind
    fromDate: string
    toDate: string
    counterpartId: number | null
    reason: string
  }) => apiFetch<{ id: number; state: string }>('/api/hr/leaves', { method: 'POST', body: input }),

  payslips: () => apiFetch<Payslip[]>('/api/hr/payroll/my-payslips'),
}
