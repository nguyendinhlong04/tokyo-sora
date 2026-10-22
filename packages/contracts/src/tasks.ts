import type { DocAttachment } from './org.js'

/**
 * Giao việc và việc định kỳ (SOP) — hợp đồng dữ liệu giữa API, Office (N1 · N5 ·
 * N6) và Kênh nhân viên (N12).
 *
 * Hai nguồn việc, một bảng: việc GIAO TAY luôn giao cho một NGƯỜI; việc ĐỊNH KỲ
 * sinh từ mẫu và giao cho một CHỨC DANH — ai giữ chức danh đó và có ca đã công bố
 * đúng ngày thì thấy, checklist dùng chung, mỗi mục ghi người tích.
 */

export const TASK_STATES = ['open', 'submitted', 'done', 'cancelled'] as const
export type TaskState = (typeof TASK_STATES)[number]

export const TASK_STATE_LABELS: Record<TaskState, string> = {
  open: 'Đang làm',
  submitted: 'Chờ nghiệm thu',
  done: 'Xong',
  cancelled: 'Đã huỷ',
}

/** Hai mức là đủ: thang năm mức thì mọi việc đều thành "cao" */
export const TASK_PRIORITIES = ['thuong', 'gap'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  thuong: 'Thường',
  gap: 'Gấp',
}

export const TASK_RECURRENCES = ['hang-ngay', 'hang-tuan', 'hang-thang', 'theo-ca'] as const
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number]

export const TASK_RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  'hang-ngay': 'Hằng ngày',
  'hang-tuan': 'Hằng tuần',
  'hang-thang': 'Hằng tháng',
  'theo-ca': 'Theo ca',
}

/** Thứ theo ISO: 1 = Thứ Hai … 7 = Chủ nhật */
export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
  7: 'Chủ nhật',
}

/** Việc sinh ra từ đâu — để mở ngược về khiếu nại, sự cố, báo cáo, văn bản */
export const TASK_ENTITIES = ['feedback', 'incident', 'work-report', 'document'] as const
export type TaskEntity = (typeof TASK_ENTITIES)[number]

export const TASK_CHECKLIST_MAX = 30
/** Ngày tháng lớn nhất cho việc hằng tháng — tháng Hai chỉ có 28 ngày */
export const TASK_MONTH_DAY_MAX = 28

export interface TaskCheckItem {
  idx: number
  label: string
  checkedBy: number | null
  checkedByName: string | null
  checkedAt: string | null
}

export interface TaskRow {
  id: number
  branchId: string | null
  title: string
  priority: TaskPriority
  state: TaskState
  dueAt: string
  /** Tính lúc đọc: còn đang làm mà đã qua hạn */
  overdue: boolean
  assigneeStaffId: number | null
  assigneeName: string | null
  assigneePositionId: number | null
  assigneePositionTitle: string | null
  reviewerStaffId: number | null
  reviewerName: string | null
  reviewerPositionId: number | null
  reviewerPositionTitle: string | null
  templateId: number | null
  /** Ngày của việc định kỳ (giờ chi nhánh) */
  occurrenceDate: string | null
  /** Ca của việc theo ca, vd. "Ca sáng 07:00–15:00" */
  shiftLabel: string | null
  checklist: { total: number; checked: number }
  acceptedAt: string | null
  submittedAt: string | null
  submittedByName: string | null
  doneAt: string | null
  createdByName: string | null
  createdAt: string
  entity: TaskEntity | null
  entityId: number | null
}

export interface TaskDetail extends TaskRow {
  note: string | null
  attachments: DocAttachment[]
  items: TaskCheckItem[]
  /** Người làm ghi lúc nộp — bắt buộc khi còn mục chưa tích */
  resultNote: string | null
  /** Lời nghiệm thu, hoặc lý do trả lại */
  managerNote: string | null
  cancelReason: string | null
  /** Người đang xem làm được gì — máy chủ quyết, giao diện chỉ ẩn/hiện */
  canAccept: boolean
  canCheck: boolean
  canSubmit: boolean
  canReview: boolean
  canEdit: boolean
  canCancel: boolean
}

export interface MyTasks {
  /** Việc của tôi đang mở — đã sắp: quá hạn, hôm nay, sắp tới */
  open: TaskRow[]
  /** Việc tôi đã nộp hoặc đã xong gần đây (7 ngày) */
  recent: TaskRow[]
  /** Việc người khác nộp, chờ tôi nghiệm thu */
  toReview: TaskRow[]
  /** Ca đã công bố của tôi hôm nay — dòng đầu màn N12 */
  shiftToday: { label: string; branchName: string } | null
}

export interface TaskTemplateView {
  id: number
  branchId: string | null
  title: string
  note: string | null
  checklist: string[]
  assigneePositionId: number
  assigneePositionTitle: string
  assigneeUnitName: string
  reviewerPositionId: number | null
  reviewerPositionTitle: string | null
  recurrence: TaskRecurrence
  weekday: number | null
  monthDay: number | null
  shiftTemplateId: number | null
  shiftLabel: string | null
  /** Phút kể từ 00:00 giờ chi nhánh; theo ca mà để trống = giờ kết ca */
  dueMinute: number | null
  priority: TaskPriority
  documentId: number | null
  documentTitle: string | null
  startsOn: string
  active: boolean
}

/** Người có thể nhận việc của người đang giao — trong phạm vi theo sơ đồ */
export interface AssignableStaff {
  staffId: number
  fullName: string
  title: string | null
  unitName: string | null
  branchId: string | null
}
