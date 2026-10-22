import type { ActionKey } from './permissions.js'
import type { TaskRow } from './tasks.js'

/**
 * Báo cáo công việc và sự cố — hợp đồng dữ liệu giữa API, Office (N7 · N8 · N1)
 * và Kênh nhân viên (N15).
 *
 * Báo cáo là một MẪU có danh sách trường; mỗi suất (ngày, ca, tuần, tháng) một
 * bản. Trường tự điền do máy tính lúc nộp và ĐÓNG BĂNG vào bản nộp — báo cáo
 * cuối ngày hôm qua không tự đổi khi sáng nay có người sửa một đơn.
 */

export const REPORT_FIELD_TYPES = [
  'so',
  'tien',
  'chu',
  'doan',
  'co-khong',
  'chon',
  'nhieu-chon',
  'gio',
  'url',
] as const
export type ReportFieldType = (typeof REPORT_FIELD_TYPES)[number]

export const REPORT_FIELD_TYPE_LABELS: Record<ReportFieldType, string> = {
  so: 'Số',
  tien: 'Tiền',
  chu: 'Một dòng chữ',
  doan: 'Đoạn văn',
  'co-khong': 'Có / không',
  chon: 'Chọn một',
  'nhieu-chon': 'Chọn nhiều',
  gio: 'Giờ',
  url: 'Đường dẫn https',
}

export const REPORT_CADENCES = ['ca', 'ngay', 'tuan', 'thang'] as const
export type ReportCadence = (typeof REPORT_CADENCES)[number]

export const REPORT_CADENCE_LABELS: Record<ReportCadence, string> = {
  ca: 'Mỗi ca',
  ngay: 'Mỗi ngày',
  tuan: 'Mỗi tuần',
  thang: 'Mỗi tháng',
}

/** Ai xác nhận: cấp trên theo sơ đồ · người nhận ca sau · không cần */
export const REPORT_REVIEW_MODES = ['cap-tren', 'ca-sau', 'khong'] as const
export type ReportReviewMode = (typeof REPORT_REVIEW_MODES)[number]

export const REPORT_REVIEW_MODE_LABELS: Record<ReportReviewMode, string> = {
  'cap-tren': 'Cấp trên xem',
  'ca-sau': 'Ca sau nhận ca',
  khong: 'Không cần xác nhận',
}

/**
 * Trường TỰ ĐIỀN — máy tính từ dữ liệu thật lúc nộp. `need`: khoá quyền phải có
 * để thấy con số; người nộp thiếu quyền thì ô ghi "không có quyền xem" chứ không
 * lộ số. Định nghĩa số liệu dùng đúng hàm của B2/B5 (reports/sql.ts).
 */
export const REPORT_AUTO_FIELDS = {
  'doanh-thu-thuan': {
    label: 'Doanh thu thuần',
    type: 'tien',
    need: 'report.branch-revenue',
  },
  'so-don': { label: 'Số đơn đã thanh toán', type: 'so', need: 'report.branch-revenue' },
  'so-khach': { label: 'Số khách', type: 'so', need: null },
  'don-huy': { label: 'Đơn huỷ', type: 'so', need: null },
  'mon-huy-sau-gui-bep': { label: 'Món huỷ sau khi gửi bếp', type: 'so', need: null },
  've-tre': { label: 'Vé bếp ra trễ / vé đã xong', type: 'chu', need: null },
  'khieu-nai': { label: 'Lượt khách chấm 1–2 sao', type: 'so', need: null },
  'diem-hai-long': { label: 'Điểm khách chấm trung bình', type: 'so', need: null },
  'chenh-lech-ket': {
    label: 'Chênh lệch két (đếm − sổ)',
    type: 'tien',
    need: 'report.branch-revenue',
  },
  'qr-treo': { label: 'Thanh toán QR chưa về', type: 'so', need: null },
  'nhan-su-ca': { label: 'Người đứng ca (lịch đã công bố)', type: 'so', need: null },
  'checklist-ca': { label: 'Checklist SOP xong / tổng', type: 'chu', need: null },
} as const satisfies Record<
  string,
  { label: string; type: ReportFieldType; need: ActionKey | null }
>
export type ReportAutoKey = keyof typeof REPORT_AUTO_FIELDS

export interface ReportField {
  /** Khoá không dấu, duy nhất trong mẫu */
  key: string
  label: string
  type: ReportFieldType
  required?: boolean
  /** Bắt buộc khi trường khác lệch khỏi 0 quá ngưỡng — vd. giải trình két */
  requiredIf?: { field: string; absGreaterThan: number }
  options?: string[]
  /** Trường tự điền: không nhập tay */
  auto?: ReportAutoKey
  hint?: string
}

export type ReportValue = string | number | boolean | string[] | null

export interface AutoValue {
  value: number | string | null
  /** "không có quyền xem", "chưa có dữ liệu"… */
  note?: string
}

export const WORK_REPORT_STATES = ['draft', 'submitted', 'reviewed'] as const
export type WorkReportState = (typeof WORK_REPORT_STATES)[number]

export const WORK_REPORT_STATE_LABELS: Record<WorkReportState, string> = {
  draft: 'Nháp',
  submitted: 'Đã nộp',
  reviewed: 'Đã xem',
}

export interface ReportTemplateView {
  id: number
  code: string
  name: string
  cadence: ReportCadence
  branchId: string
  version: number
  fields: ReportField[]
  /** Theo ca: chỉ các ca mẫu này; rỗng = mọi ca đã công bố */
  shiftTemplateIds: number[]
  dueOffsetMinutes: number
  reviewMode: ReportReviewMode
  /** Nộp được trên Kênh nhân viên — mẫu có trường tiền thì không */
  kenhNv: boolean
  active: boolean
  positions: {
    positionId: number
    title: string
    unitName: string
    role: 'nop' | 'du-phong'
  }[]
}

/** Một suất báo cáo phải nộp — tính lúc đọc, không lưu */
export interface ReportSlot {
  templateId: number
  templateName: string
  cadence: ReportCadence
  branchId: string
  /** Ngày đầu kỳ (giờ chi nhánh) */
  businessDate: string
  periodKey: string
  shiftTemplateId: number | null
  shiftLabel: string | null
  dueAt: string
  kenhNv: boolean
  reportId: number | null
  state: WorkReportState | null
  /** Đã qua hạn (cộng thời gian ân hạn) mà chưa nộp */
  overdue: boolean
}

export interface WorkReportRow {
  id: number
  templateId: number
  templateName: string
  branchId: string
  businessDate: string
  periodKey: string
  shiftLabel: string | null
  state: WorkReportState
  authorName: string
  channel: 'office' | 'kenh-nv' | null
  dueAt: string
  submittedAt: string | null
  onTime: boolean | null
  reviewedByName: string | null
  reviewedAt: string | null
  addendaCount: number
}

export interface WorkReportDetail extends WorkReportRow {
  reviewMode: ReportReviewMode
  fields: ReportField[]
  values: Record<string, ReportValue>
  /** Đóng băng lúc nộp; lúc còn nháp là số xem trước, chưa chốt */
  autoValues: Record<string, AutoValue>
  reviewNote: string | null
  addenda: { id: number; authorName: string; body: string; createdAt: string }[]
  canEdit: boolean
  canSubmit: boolean
  canReview: boolean
  canAddendum: boolean
}

// ------------------------------------------------------------------ Sự cố

export const INCIDENT_CATEGORIES = [
  'tai-nan-lao-dong',
  'an-toan-thuc-pham',
  'khieu-nai-nghiem-trong',
  'hong-thiet-bi',
  'an-ninh-mat-mat',
  'chay-no',
  'khac',
] as const
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number]

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  'tai-nan-lao-dong': 'Tai nạn lao động',
  'an-toan-thuc-pham': 'An toàn thực phẩm',
  'khieu-nai-nghiem-trong': 'Khiếu nại nghiêm trọng',
  'hong-thiet-bi': 'Hỏng thiết bị',
  'an-ninh-mat-mat': 'An ninh, mất mát',
  'chay-no': 'Cháy nổ',
  khac: 'Khác',
}

export const INCIDENT_SEVERITIES = [
  'nhe',
  'trung-binh',
  'nghiem-trong',
  'rat-nghiem-trong',
] as const
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number]

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  nhe: 'Nhẹ',
  'trung-binh': 'Trung bình',
  'nghiem-trong': 'Nghiêm trọng',
  'rat-nghiem-trong': 'Rất nghiêm trọng',
}

export const INCIDENT_STATES = ['open', 'investigating', 'closed'] as const
export type IncidentState = (typeof INCIDENT_STATES)[number]

export const INCIDENT_STATE_LABELS: Record<IncidentState, string> = {
  open: 'Mới báo',
  investigating: 'Đang xử lý',
  closed: 'Đã đóng',
}

/**
 * Loại phải khai báo ra ngoài khi ở mức nghiêm trọng trở lên: tai nạn lao động,
 * ngộ độc thực phẩm, cháy nổ. Hệ thống chỉ nhắc và lưu mốc — số hiệu văn bản pháp
 * luật cụ thể cần pháp chế xác minh.
 */
export const INCIDENT_EXTERNAL_CATEGORIES: readonly IncidentCategory[] = [
  'tai-nan-lao-dong',
  'an-toan-thuc-pham',
  'chay-no',
]

export interface IncidentRow {
  id: number
  code: string
  branchId: string
  category: IncidentCategory
  severity: IncidentSeverity
  state: IncidentState
  title: string
  occurredAt: string
  reportedAt: string
  reportedByName: string
  ownerName: string | null
  externalReportRequired: boolean
  externalReportedAt: string | null
  /** Việc khắc phục chưa xong */
  openTasks: number
}

export interface IncidentDetail extends IncidentRow {
  description: string
  immediateAction: string | null
  injuredCount: number
  customerInvolved: boolean
  rootCause: string | null
  correctiveAction: string | null
  /** Chỉ người xử lý sự cố thấy */
  lossEstimateVnd: number | null
  externalReportRef: string | null
  evidenceUrls: string[]
  closedAt: string | null
  closedByName: string | null
  closeNote: string | null
  tasks: TaskRow[]
  canEdit: boolean
  canClose: boolean
}

export interface MyIncident {
  id: number
  code: string
  title: string
  category: IncidentCategory
  severity: IncidentSeverity
  state: IncidentState
  reportedAt: string
}
