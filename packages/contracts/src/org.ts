import type { Role } from './permissions.js'

/**
 * Sơ đồ tổ chức — hợp đồng dữ liệu giữa API, Office và Kênh nhân viên.
 *
 * Mô hình theo CHỨC DANH trên CÂY ĐƠN VỊ: người không gắn thẳng vào nhau mà gắn
 * vào chức danh; cấp trên trực tiếp là người giữ chức danh trưởng của đơn vị gần
 * nhất phía trên. Người nghỉ việc thì ghế trống còn đó, việc và KPI của ghế không
 * mất theo người.
 */

/** Loại đơn vị — slug không dấu như mọi enum nghiệp vụ */
export const ORG_UNIT_KINDS = ['cong-ty', 'khoi', 'phong', 'chi-nhanh', 'bo-phan', 'to'] as const
export type OrgUnitKind = (typeof ORG_UNIT_KINDS)[number]

export const ORG_UNIT_KIND_LABELS: Record<OrgUnitKind, string> = {
  'cong-ty': 'Công ty',
  khoi: 'Khối',
  phong: 'Phòng ban',
  'chi-nhanh': 'Chi nhánh',
  'bo-phan': 'Bộ phận',
  to: 'Tổ / nhóm',
}

export const ASSIGNMENT_KINDS = ['chinh', 'kiem-nhiem'] as const
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number]

export const ASSIGNMENT_KIND_LABELS: Record<AssignmentKind, string> = {
  chinh: 'Chức danh chính',
  'kiem-nhiem': 'Kiêm nhiệm',
}

/** Mô tả công việc chuẩn ba phần; mỗi phần là danh sách dòng ngắn */
export const JOB_SECTION_MAX_LINES = 20

export interface OrgUnitView {
  id: number
  parentId: number | null
  kind: OrgUnitKind
  name: string
  /** Chỉ đơn vị loại chi nhánh mang mã chi nhánh; đơn vị con suy ra từ tổ tiên */
  branchId: string | null
  /** Tổ bếp ↔ trạm KDS (ST-01…ST-06) — để số đo bếp quy được về đúng tổ */
  stationId: string | null
  sort: number
  active: boolean
}

export interface OrgHolderView {
  assignmentId: number
  staffId: number
  fullName: string
  kind: AssignmentKind
  fromDate: string
  /** Ngày đầu tiên KHÔNG còn giữ (khoảng nửa mở); null = đang giữ */
  toDate: string | null
  /** Căn cứ: văn bản quyết định, hoặc ghi chú khi gán tay */
  documentId: number | null
  note: string | null
  /** Bổ nhiệm có ngày hiệu lực trong tương lai */
  upcoming: boolean
  /** Chưa có vai trò gợi ý của chức danh ở A1 — sơ đồ không tự cấp quyền */
  roleMismatch: boolean
  /** Hồ sơ H1 ghi chi nhánh khác với chi nhánh của đơn vị */
  branchMismatch: boolean
}

export interface OrgPositionView {
  id: number
  unitId: number
  title: string
  isHead: boolean
  /** Định biên — chỉ để cảnh báo thiếu/thừa, không chặn gán */
  headcount: number
  suggestedRole: Role | null
  duties: string[]
  authorities: string[]
  requirements: string[]
  sort: number
  active: boolean
  /** Người đang giữ hoặc sắp nhận (chưa tới ngày hiệu lực) */
  holders: OrgHolderView[]
}

export interface OrgPersonView {
  staffId: number
  fullName: string
  code: string
  /** Chi nhánh chính theo hồ sơ H1 — null với người chưa có hồ sơ */
  branchId: string | null
  roles: { role: Role; branchId: string | null }[]
}

export interface OrgChart {
  /** Ngày xem sơ đồ (giờ Việt Nam) */
  date: string
  /** Người xem sửa được cơ cấu và gán chức danh */
  canManage: boolean
  /** Người xem nhìn toàn chuỗi; ngược lại chỉ nhận cây con trong phạm vi */
  chainWide: boolean
  units: OrgUnitView[]
  positions: OrgPositionView[]
  /** Người trong phạm vi chưa giữ chức danh nào — chỗ để bổ nhiệm */
  unassigned: OrgPersonView[]
  /** Chi nhánh đang chạy mà chưa có đơn vị trên sơ đồ */
  missingBranches: { id: string; name: string }[]
}

export interface OrgAssignmentRow {
  assignmentId: number
  staffId: number
  fullName: string
  kind: AssignmentKind
  fromDate: string
  toDate: string | null
  documentId: number | null
  endDocumentId: number | null
  note: string | null
  createdAt: string
}

// ======================================================================= Văn bản

export const DOC_KINDS = ['thong-bao', 'quyet-dinh', 'quy-dinh'] as const
export type DocKind = (typeof DOC_KINDS)[number]

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  'thong-bao': 'Thông báo',
  'quyet-dinh': 'Quyết định',
  'quy-dinh': 'Quy định',
}

export const DECISION_TYPES = [
  'bo-nhiem',
  'dieu-chuyen',
  'mien-nhiem',
  'khen-thuong',
  'ky-luat',
  'khac',
] as const
export type DecisionType = (typeof DECISION_TYPES)[number]

export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  'bo-nhiem': 'Bổ nhiệm',
  'dieu-chuyen': 'Điều chuyển',
  'mien-nhiem': 'Miễn nhiệm',
  'khen-thuong': 'Khen thưởng',
  'ky-luat': 'Kỷ luật',
  khac: 'Khác',
}

/** Quyết định đổi chức danh trên sơ đồ — áp vào cây đúng lúc ký, không thu hồi được */
export const PERSONNEL_DECISIONS: readonly DecisionType[] = [
  'bo-nhiem',
  'dieu-chuyen',
  'mien-nhiem',
]

export const DOC_STATES = ['draft', 'pending', 'issued', 'revoked'] as const
export type DocState = (typeof DOC_STATES)[number]

export const DOC_STATE_LABELS: Record<DocState, string> = {
  draft: 'Nháp',
  pending: 'Chờ ký',
  issued: 'Đã ban hành',
  revoked: 'Đã thu hồi',
}

/** Người nhận khai bằng QUY TẮC; danh sách người cụ thể chụp lại lúc ký */
export type DocTarget =
  | { kind: 'toan-chuoi' }
  | { kind: 'chi-nhanh'; branchId: string }
  | { kind: 'don-vi'; unitId: number; includeChildren: boolean }
  | { kind: 'chuc-danh'; positionId: number }
  | { kind: 'vai-tro'; role: Role; branchId: string | null }
  | { kind: 'ca-nhan'; staffId: number }

export interface DocAttachment {
  name: string
  /** Chỉ https — chưa có kho tệp, văn bản ký tay quét lên kho ngoài rồi dán link */
  url: string
}

/** Một dòng của quyết định nhân sự: ai, vào/rời ghế nào, chính hay kiêm nhiệm */
export interface PersonnelChange {
  staffId: number
  positionId: number
  assignmentKind: AssignmentKind
}

export interface DocumentRow {
  id: number
  kind: DocKind
  decisionType: DecisionType | null
  /** Số hiệu cấp lúc ký: TB-2610-0001 · QD-… · QYD-… */
  number: string | null
  title: string
  state: DocState
  requiresAck: boolean
  effectiveFrom: string
  effectiveTo: string | null
  authorId: number
  authorName: string
  signerId: number | null
  signerName: string | null
  signedAt: string | null
  createdAt: string
  /** Biên nhận: số người nhận, đã đọc, đã xác nhận (0 khi chưa ký) */
  recipients: number
  read: number
  acked: number
}

export interface DocumentDetail extends DocumentRow {
  body: string
  attachments: DocAttachment[]
  targets: DocTarget[]
  changes: PersonnelChange[] | null
  returnNote: string | null
  revokedAt: string | null
  revokeReason: string | null
  /** Người chưa đọc / chưa xác nhận — chỉ tác giả, người ký, R10 · R11 · R13 thấy */
  pending: { staffId: number; fullName: string; read: boolean }[] | null
  /** Người xem này làm được gì với văn bản */
  canEdit: boolean
  canSign: boolean
  canRevoke: boolean
}

export interface MyDocument {
  id: number
  kind: DocKind
  decisionType: DecisionType | null
  number: string | null
  title: string
  signerName: string | null
  signedAt: string | null
  effectiveFrom: string
  requiresAck: boolean
  readAt: string | null
  ackedAt: string | null
}

export interface MyDocumentDetail extends MyDocument {
  body: string
  attachments: DocAttachment[]
}

/** Người ký hợp lệ cho một loại văn bản — có quyền ký VÀ đã có PIN */
export interface SignerOption {
  staffId: number
  fullName: string
  title: string | null
}

/**
 * Hộp "Việc cần xử lý" — chỉ đếm. Mỗi giai đoạn thêm nhóm của mình; nhóm vắng
 * mặt là chưa có, không phải bằng 0.
 */
export interface InboxCounts {
  documents: { unread: number; toAck: number; toSign: number }
  tasks: { open: number; overdue: number; toReview: number }
  /** Chỉ có với người xử lý khiếu nại (`feedback.respond`) */
  feedback?: { assigned: number; overdue: number }
  /** Báo cáo tôi phải nộp (đến hạn hoặc quá hạn) · báo cáo chờ tôi xem */
  reports: { due: number; overdue: number; toReview: number }
  /** Chỉ có với người xử lý sự cố (`incident.manage`) */
  incidents?: { open: number; severeOpen: number }
}

export interface MyOrgProfile {
  positions: {
    positionId: number
    title: string
    unitId: number
    unitName: string
    kind: AssignmentKind
    fromDate: string
  }[]
  /** Cấp trên trực tiếp — có thể nhiều người khi dự phòng theo vai trò */
  managers: { staffId: number; fullName: string; title: string | null }[]
}
