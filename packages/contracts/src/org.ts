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
