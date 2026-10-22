import { formatVnd } from './money.js'
import type { ActionKey } from './permissions.js'

/**
 * KPI — hợp đồng dữ liệu giữa API, Office (N9 · N10 · N11 · H7) và Kênh nhân viên
 * (N14).
 *
 * Danh mục chỉ số nằm trong CODE, không cho tạo chỉ số tự do: mỗi chỉ số tự động
 * phải có đúng một nguồn số thật, và định nghĩa được test đối chiếu với báo cáo
 * (KPI doanh thu = B2). Bộ KPI theo chức danh chọn 3–6 chỉ số trong danh mục.
 *
 * Số lưu dạng `*_milli` (giá trị hiển thị × 1000) để không lệch vì số thực.
 */

/** Đối tượng của chỉ số: cá nhân · ca trực của người đó · bộ phận · chi nhánh */
export const KPI_SUBJECTS = ['ca-nhan', 'ca-truc', 'bo-phan', 'chi-nhanh'] as const
export type KpiSubject = (typeof KPI_SUBJECTS)[number]

export const KPI_SUBJECT_LABELS: Record<KpiSubject, string> = {
  'ca-nhan': 'Cá nhân',
  'ca-truc': 'Ca trực của người đó',
  'bo-phan': 'Bộ phận',
  'chi-nhanh': 'Chi nhánh',
}

export type KpiDirection = 'cao' | 'thap'
export type KpiUnit = 'vnd' | 'pct' | 'phut' | 'giay' | 'lan' | 'diem' | 'vnd-gio'

export const KPI_UNIT_LABELS: Record<KpiUnit, string> = {
  vnd: '₫',
  pct: '%',
  phut: 'phút',
  giay: 'giây',
  lan: 'lần',
  diem: 'điểm',
  'vnd-gio': '₫/giờ công',
}

export type KpiSource = 'tu-dong' | 'nhap-tay' | 'phieu-kiem-tra'

export interface KpiMetricDef {
  label: string
  /** Công thức nói bằng lời — hiện ở N9 để người được chấm hiểu mình bị đo gì */
  formula: string
  source: KpiSource
  subject: KpiSubject
  direction: KpiDirection
  unit: KpiUnit
  /** Số tiền: người không có quyền này (và phiên Kênh NV) chỉ thấy % đạt */
  need?: ActionKey
  /** Ngưỡng mẫu tối thiểu — dưới ngưỡng là "không có dữ liệu", không phải 0 */
  minSample?: 'tickets' | 'ratings' | 'events' | 'tasks'
  /** Chỉ tiêu mặc định (đơn vị hiển thị) khi bộ KPI không đặt */
  defaultTarget: number
}

/**
 * Danh mục v1. Cố ý KHÔNG có: doanh thu theo phục vụ, upsell, giảm giá theo người,
 * thời gian bếp theo đầu bếp, SỐ sự cố, giờ làm thêm (D10) — đo những thứ đó là
 * khuyến khích giành bàn, giấu sự cố, ép làm thêm.
 */
export const KPI_METRICS = {
  // ---- Bán hàng
  'cn.doanh-thu-thuan': {
    label: 'Doanh thu thuần',
    formula: 'Tổng tạm tính − giảm giá + phí phục vụ của đơn đã trả, không huỷ (định nghĩa B2)',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'vnd',
    need: 'report.branch-revenue',
    defaultTarget: 1_500_000_000,
  },
  'cn.doanh-thu-gio-cong': {
    label: 'Doanh thu trên giờ công',
    formula: 'Doanh thu thuần ÷ tổng giờ công đã chấm của chi nhánh trong kỳ',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'vnd-gio',
    need: 'report.branch-revenue',
    defaultTarget: 450_000,
  },
  'kh.doanh-thu-web': {
    label: 'Doanh thu kênh website',
    formula: 'Doanh thu thuần của đơn kênh web',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'vnd',
    need: 'report.branch-revenue',
    defaultTarget: 100_000_000,
  },
  // ---- Bếp (quy về trạm / bộ phận, không về đầu bếp)
  'bep.ti-le-tre': {
    label: 'Tỉ lệ vé bếp trễ',
    formula: 'Vé ra sau hạn ÷ vé đã xong (định nghĩa B5), theo trạm của tổ hoặc cả bếp',
    source: 'tu-dong',
    subject: 'bo-phan',
    direction: 'thap',
    unit: 'pct',
    minSample: 'tickets',
    defaultTarget: 8,
  },
  'bep.food-cost': {
    label: 'Food cost',
    formula: 'Giá vốn xuất bán (sổ kho) ÷ doanh thu thuần',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'thap',
    unit: 'pct',
    need: 'report.margin-foodcost',
    defaultTarget: 35,
  },
  'bep.hao-hut': {
    label: 'Hao hụt nguyên liệu',
    formula: 'Giá trị xuất huỷ ÷ giá vốn xuất bán',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'thap',
    unit: 'pct',
    need: 'report.margin-foodcost',
    defaultTarget: 3,
  },
  // ---- Kho
  'kho.lech-kiem-ke': {
    label: 'Lệch kiểm kê',
    formula: 'Giá trị tuyệt đối điều chỉnh của các phiếu kiểm kê đã chốt ÷ giá vốn xuất bán của kỳ',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'thap',
    unit: 'pct',
    need: 'report.margin-foodcost',
    defaultTarget: 1,
  },
  'kho.so-lan-kiem-ke': {
    label: 'Số lần kiểm kê đã chốt',
    formula: 'Số phiếu kiểm kê chốt trong kỳ',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'lan',
    defaultTarget: 4,
  },
  'kho.xuat-huy': {
    label: 'Giá trị xuất huỷ',
    formula: 'Tổng giá trị phiếu xuất huỷ trong kỳ',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'thap',
    unit: 'vnd',
    need: 'report.margin-foodcost',
    defaultTarget: 5_000_000,
  },
  // ---- Khách
  'kh.diem-hai-long': {
    label: 'Điểm khách chấm',
    formula: 'Trung bình sao khách chấm (một phiếu mỗi bữa, view customer_ratings)',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'diem',
    minSample: 'ratings',
    defaultTarget: 4.5,
  },
  'kh.khieu-nai-dung-han': {
    label: 'Khiếu nại phản hồi đúng hạn',
    formula: 'Khiếu nại B13 đóng trước hạn phản hồi ÷ khiếu nại có hạn trong kỳ',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'pct',
    minSample: 'events',
    defaultTarget: 90,
  },
  'kh.khach-moi': {
    label: 'Khách mới',
    formula: 'Khách gặp lần đầu trong kỳ ở chi nhánh (đơn hoặc đặt bàn, khớp số điện thoại)',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'lan',
    defaultTarget: 150,
  },
  'kh.no-show': {
    label: 'Tỉ lệ đặt bàn không đến',
    formula: 'Suất no-show ÷ suất đã xác nhận có ngày trong kỳ',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'thap',
    unit: 'pct',
    minSample: 'events',
    defaultTarget: 8,
  },
  // ---- Sàn
  'san.phan-hoi-ban': {
    label: 'Thời gian phản hồi bàn (p90)',
    formula: '90% yêu cầu từ bàn được xử lý trong số phút này, trong ca trực của người đó',
    source: 'tu-dong',
    subject: 'ca-truc',
    direction: 'thap',
    unit: 'phut',
    minSample: 'events',
    defaultTarget: 3,
  },
  // ---- Két
  'tn.ket-khop': {
    label: 'Ca két khớp',
    formula: 'Ca đóng két lệch không quá ngưỡng (kpi.cashToleranceVnd) ÷ ca đã đóng của người đó',
    source: 'tu-dong',
    subject: 'ca-nhan',
    direction: 'cao',
    unit: 'pct',
    defaultTarget: 95,
  },
  'tn.qr-treo': {
    label: 'Thanh toán QR treo',
    formula: 'Thanh toán VietQR còn chờ quá 1 ngày, tạo trong ca két của người đó',
    source: 'tu-dong',
    subject: 'ca-nhan',
    direction: 'thap',
    unit: 'lan',
    defaultTarget: 0,
  },
  // ---- Online
  'ol.xac-nhan': {
    label: 'Thời gian xác nhận đơn online (p90)',
    formula: '90% đơn kênh web được xác nhận trong số phút này (tính từ lúc khách đặt)',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'thap',
    unit: 'phut',
    minSample: 'events',
    defaultTarget: 5,
  },
  'ol.dung-gio': {
    label: 'Đơn hẹn giờ đúng hạn',
    formula:
      'Đơn web xong trước giờ hẹn ÷ đơn web có giờ hẹn (Grab/Shopee/Be không có giờ hẹn thật)',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'pct',
    minSample: 'events',
    defaultTarget: 95,
  },
  // ---- Lễ tân
  'lt.nhac-hen': {
    label: 'Đặt bàn được gọi nhắc',
    formula:
      'Suất được gọi nhắc thành công hoặc khách tự xác nhận lại ÷ suất đặt trước giờ đến hơn 24 giờ',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'pct',
    minSample: 'events',
    defaultTarget: 90,
  },
  // ---- Văn phòng
  'kt.khoa-so': {
    label: 'Khoá sổ đúng hạn',
    formula: 'Ngày khoá sổ kỳ trước so với hạn ngày 5 tháng sau (số ngày trễ)',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'thap',
    unit: 'lan',
    defaultTarget: 0,
  },
  'kt.duyet-phieu-chi': {
    label: 'Phiếu chi được xử lý trong 2 ngày',
    formula:
      'Phiếu chi được duyệt trong 48 giờ ÷ phiếu chi cần người duyệt của kỳ (bỏ phiếu quỹ nhỏ tự duyệt)',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'pct',
    minSample: 'events',
    defaultTarget: 90,
  },
  // ---- Chuyên cần
  'cc.dung-gio': {
    label: 'Vào ca đúng giờ',
    formula: 'Ca chấm vào không trễ quá payroll.lateGraceMinutes ÷ ca đã chấm',
    source: 'tu-dong',
    subject: 'ca-nhan',
    direction: 'cao',
    unit: 'pct',
    minSample: 'events',
    defaultTarget: 95,
  },
  'cc.vang': {
    label: 'Ca vắng không phép',
    formula: 'Ca đã công bố đã qua mà không có công, không có phép',
    source: 'tu-dong',
    subject: 'ca-nhan',
    direction: 'thap',
    unit: 'lan',
    defaultTarget: 0,
  },
  // ---- Tổ chức
  'tc.viec-dung-han': {
    label: 'Việc xong đúng hạn',
    formula: 'Việc giao (đích danh) nộp trước hạn ÷ việc đến hạn trong kỳ, trừ việc bị huỷ',
    source: 'tu-dong',
    subject: 'ca-nhan',
    direction: 'cao',
    unit: 'pct',
    minSample: 'tasks',
    defaultTarget: 90,
  },
  'tc.checklist': {
    label: 'Checklist ca hoàn thành',
    formula: 'Việc định kỳ của ca người đó đứng được nộp trước hạn ÷ việc định kỳ của các ca đó',
    source: 'tu-dong',
    subject: 'ca-truc',
    direction: 'cao',
    unit: 'pct',
    minSample: 'tasks',
    defaultTarget: 95,
  },
  'tc.bao-cao-dung-han': {
    label: 'Báo cáo nộp đúng hạn',
    formula:
      'Báo cáo người đó đã nộp đúng hạn ÷ báo cáo người đó đã nộp trong kỳ (suất bỏ trống xem ở N7 "Còn thiếu")',
    source: 'tu-dong',
    subject: 'ca-nhan',
    direction: 'cao',
    unit: 'pct',
    minSample: 'tasks',
    defaultTarget: 95,
  },
  'tc.xac-nhan-van-ban': {
    label: 'Xác nhận văn bản',
    formula: 'Văn bản cần xác nhận đã xác nhận ÷ văn bản cần xác nhận gửi tới người đó trong kỳ',
    source: 'tu-dong',
    subject: 'ca-nhan',
    direction: 'cao',
    unit: 'pct',
    defaultTarget: 100,
  },
  'tc.su-co-dung-han': {
    label: 'Sự cố khắc phục đúng hạn',
    formula: 'Việc khắc phục sự cố xong trước hạn ÷ việc khắc phục đến hạn trong kỳ (chi nhánh)',
    source: 'tu-dong',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'pct',
    minSample: 'tasks',
    defaultTarget: 90,
  },
  // ---- Nhập tay và phiếu kiểm tra
  'nt.ve-sinh': {
    label: 'Điểm kiểm tra vệ sinh ATTP',
    formula:
      'Trung bình điểm các phiếu kiểm tra vệ sinh (N11) của chi nhánh trong kỳ, trừ phiếu do chính người được chấm ghi',
    source: 'phieu-kiem-tra',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'diem',
    defaultTarget: 90,
  },
  'nt.khach-bi-mat': {
    label: 'Điểm khách bí mật',
    formula:
      'Trung bình điểm các phiếu khách bí mật (N11) của chi nhánh trong kỳ, trừ phiếu do chính người được chấm ghi',
    source: 'phieu-kiem-tra',
    subject: 'chi-nhanh',
    direction: 'cao',
    unit: 'diem',
    defaultTarget: 85,
  },
  'nt.thai-do': {
    label: 'Thái độ phục vụ',
    formula: 'Quản lý chấm 1–5 kèm nhận xét',
    source: 'nhap-tay',
    subject: 'ca-nhan',
    direction: 'cao',
    unit: 'diem',
    defaultTarget: 4,
  },
  'nt.tay-nghe': {
    label: 'Tay nghề',
    formula: 'Bếp trưởng chấm 1–5 kèm nhận xét',
    source: 'nhap-tay',
    subject: 'ca-nhan',
    direction: 'cao',
    unit: 'diem',
    defaultTarget: 4,
  },
} as const satisfies Record<string, KpiMetricDef>

export type KpiMetricCode = keyof typeof KPI_METRICS

export const KPI_OBSERVATION_KINDS = ['ve-sinh', 'khach-bi-mat'] as const
export type KpiObservationKind = (typeof KPI_OBSERVATION_KINDS)[number]

export const KPI_OBSERVATION_LABELS: Record<KpiObservationKind, string> = {
  've-sinh': 'Kiểm tra vệ sinh ATTP',
  'khach-bi-mat': 'Khách bí mật',
}

export const KPI_CYCLE_STATES = ['draft', 'open', 'review', 'closed'] as const
export type KpiCycleState = (typeof KPI_CYCLE_STATES)[number]

export const KPI_CYCLE_STATE_LABELS: Record<KpiCycleState, string> = {
  draft: 'Nháp — đặt chỉ tiêu',
  open: 'Đang chạy',
  review: 'Đang đánh giá',
  closed: 'Đã chốt',
}

export type KpiGrade = 'A' | 'B' | 'C' | 'D'

/** Luật chấm và mức thưởng ĐÓNG BĂNG lúc mở kỳ (Điều 104: quy chế thưởng công bố trước) */
export interface KpiRules {
  gradeA: number
  gradeB: number
  gradeC: number
  achievementCapPct: number
  zeroTargetPenaltyPct: number
  minCoveragePct: number
  minSample: { tickets: number; ratings: number; events: number; tasks: number }
  bonusVnd: Record<KpiGrade, number>
  prorateByHours: boolean
  standardMonthlyMinutes: number
  cashToleranceVnd: number
}

export interface KpiTemplateView {
  id: number
  positionId: number
  positionTitle: string
  unitName: string
  branchId: string | null
  version: number
  active: boolean
  items: { metricCode: KpiMetricCode; weightPct: number; defaultTargetMilli: number }[]
}

export interface KpiCycleView {
  id: number
  branchId: string
  kind: 'thang' | 'quy'
  periodStart: string
  periodEnd: string
  state: KpiCycleState
  policyUrl: string | null
  rules: KpiRules | null
  reviews: number
  finalized: number
  lastComputedAt: string | null
}

export interface KpiItemView {
  metricCode: KpiMetricCode
  label: string
  unit: KpiUnit
  direction: KpiDirection
  source: KpiSource
  weightPct: number
  targetMilli: number
  targetNote: string | null
  /** null = không có dữ liệu (không phải 0) */
  actualMilli: number | null
  sampleCount: number | null
  selfScore: number | null
  managerScore: number | null
  excludedReason: string | null
  achievementMilli: number | null
  contributionMilli: number | null
  /** Số tiền bị che với người xem này — chỉ còn % đạt */
  masked: boolean
}

export interface KpiReviewRow {
  id: number
  cycleId: number
  /** Kỳ của phiếu — để danh sách "KPI của tôi" ghi được "Tháng 9/2026 · Đã chốt" */
  cycleKind: 'thang' | 'quy'
  periodStart: string
  periodEnd: string
  cycleState: KpiCycleState
  staffId: number
  fullName: string
  positionTitle: string | null
  reviewerId: number | null
  reviewerName: string | null
  selfSubmittedAt: string | null
  finalizedAt: string | null
  scoreMilli: number | null
  coverageMilli: number | null
  grade: KpiGrade | null
  /** Chỉ người có `payroll.view-others` thấy */
  suggestedBonusVnd?: number | null
  exempt: boolean
}

export interface KpiReviewDetail extends KpiReviewRow {
  cycle: KpiCycleView
  items: KpiItemView[]
  selfComment: string | null
  managerComment: string | null
  employeeAckAt: string | null
  employeeFeedback: string | null
  canSelfReview: boolean
  canManagerReview: boolean
  canFinalize: boolean
  canAck: boolean
}

export interface KpiObservationView {
  id: number
  branchId: string
  kind: KpiObservationKind
  observedOn: string
  scoreMilli: number
  evidenceUrl: string
  note: string | null
  observerName: string
  voidedAt: string | null
  voidReason: string | null
}

/** H7 lấy thưởng gợi ý: kỳ KPI chưa chốt thì nói rõ vì sao, không trả 0 */
export interface KpiBonusSuggestions {
  cycleId: number | null
  blockedBy: string | null
  suggestions: {
    employeeId: number
    staffId: number
    fullName: string
    grade: KpiGrade | null
    scoreMilli: number | null
    suggestedBonusVnd: number
    basis: string
  }[]
}

/** Một chữ số thập phân, dấu phẩy thập phân, dấu chấm nghìn — như `formatVnd` */
function decimal(value: number): string {
  const [whole, fraction] = Math.abs(value).toFixed(1).split('.')
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = value < 0 && Number(value.toFixed(1)) !== 0 ? '−' : ''
  return `${sign}${grouped}${fraction === '0' ? '' : `,${fraction}`}`
}

/**
 * Số KPI để đọc — `milli` là giá trị × 1000. Một hàm cho Office và Kênh nhân viên:
 * cùng một chỉ số không được hiện "8,5%" ở chỗ này và "8.5 %" ở chỗ kia.
 */
export function formatKpiValue(milli: number, unit: KpiUnit): string {
  const value = milli / 1000
  switch (unit) {
    case 'vnd':
      return formatVnd(Math.round(value))
    case 'vnd-gio':
      return `${formatVnd(Math.round(value))}/giờ công`
    case 'pct':
      return `${decimal(value)}%`
    default:
      return `${decimal(value)} ${KPI_UNIT_LABELS[unit]}`
  }
}

/** Điểm tổng hay % đạt — `103_571` ⇒ "103,6" */
export function formatKpiScore(milli: number): string {
  return decimal(milli / 1000)
}
