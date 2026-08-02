import { apiFetch } from '@sora/core'

export interface OfficeStaff {
  id: number | null
  fullName: string | null
  roles: string[]
}

export interface BranchRow {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  timezone: string
  /** Chuỗi giờ mở như '11:00–14:00 · 17:00–23:00' — miền đặt bàn đọc chính nó */
  openHours: string | null
  active: boolean
}

export interface ParameterRow {
  key: string
  unit: string | null
  sensitive: boolean
  chainValue: unknown
  branchValue: unknown
  /** Con số engine thật sự đọc cho chi nhánh đang chọn */
  effectiveValue: unknown
  scope: 'chain' | 'branch'
  updatedAt: string
  updatedBy: string | null
}

export interface ParameterChange {
  branchId: string | null
  oldValue: unknown
  newValue: unknown
  changedAt: string
  changedBy: string | null
}

export interface AreaRow {
  id: number
  name: string
  sort: number
}

export interface TableRow {
  id: number
  areaId: number | null
  code: string
  kind: 'standard' | 'grill' | 'private'
  hasGrill: boolean
  grillType: 'than' | 'gas' | 'dien' | null
  seatMin: number
  seatMax: number
  active: boolean
  /** Đang có khách ngồi — không sửa giữa bữa */
  busy: boolean
}

export interface TableInput {
  branchId: string
  areaId: number | null
  code: string
  kind: TableRow['kind']
  hasGrill: boolean
  grillType: TableRow['grillType']
  seatMin: number
  seatMax: number
  active: boolean
}

// ------------------------------------------------------- A1 · A2 · A4 · A5 · A7

export type RoleCode = string

export interface RoleGrant {
  roleCode: RoleCode
  /** null = phạm vi toàn chuỗi */
  branchId: string | null
}

export interface AccountRow {
  id: number
  code: string
  fullName: string
  phone: string | null
  email: string | null
  active: boolean
  /** Đăng nhập Office được không — bản băm không bao giờ rời máy chủ */
  hasPassword: boolean
  /** Đăng nhập POS/kiosk được không */
  hasPin: boolean
  roles: RoleGrant[]
  employeeBranchId: string | null
}

export interface AccountInput {
  code: string
  fullName: string
  phone: string | null
  email: string | null
  active: boolean
  password: string | null
  pin: string | null
  roles: RoleGrant[]
}

export interface RoleHolder {
  staffId: number
  fullName: string
}

export interface RoleAssignments {
  branches: { id: string; name: string }[]
  roles: {
    code: RoleCode
    label: string
    chainWide: RoleHolder[]
    byBranch: Record<string, RoleHolder[]>
  }[]
}

export interface DeviceRow {
  id: number
  kind: 'pos' | 'cashier' | 'kds' | 'kiosk' | 'bridge'
  name: string
  stationId: string | null
  stationName: string | null
  pairedAt: string
  pairedByName: string | null
  revokedAt: string | null
  /** Ai đang đăng nhập trên máy này ngay lúc này */
  signedIn: string[]
}

export interface PendingCode {
  code: string
  kind: string
  stationId: string | null
  expiresAt: string
}

export interface PrinterRow {
  id: number
  branchId: string
  name: string
  kind: 'bill' | 'tem'
  stationId: string | null
  stationName: string | null
  host: string
  port: number
  template: string
  copies: number
  active: boolean
  updatedAt: string
  updatedBy: string | null
}

export interface PrinterInput {
  branchId: string
  name: string
  kind: PrinterRow['kind']
  stationId: string | null
  host: string
  port: number
  template: string
  copies: number
  active: boolean
}

export interface AuditRow {
  id: number
  branchId: string | null
  actorKind: string
  actorId: string | null
  actorName: string | null
  action: string
  entity: string
  entityId: string
  payload: unknown
  approvalId: number | null
  deviceId: number | null
  createdAt: string
}

export interface EinvoiceConfig {
  branchId: string
  chain: {
    taxCode: string
    provider: string
    certificateSerial: string
    certificateExpiry: string
  }
  branch: { serial: string; enabled: boolean }
  /** Số ngày còn lại của chứng thư số; null khi chưa khai */
  certificateDaysLeft: number | null
}

export interface CmsPost {
  id: number
  title: string
  category: string
  excerpt: string | null
  publishedOn: string
  published: boolean
  updatedAt: string
  updatedBy: string | null
}

export interface CmsJob {
  id: number
  title: string
  branchId: string | null
  branchName: string | null
  employment: string
  slots: number
  published: boolean
  sort: number
  updatedAt: string
  updatedBy: string | null
}

export interface DishRow {
  id: string
  code: string
  kind: 'dish' | 'set' | 'drink'
  categoryId: string | null
  subCategory: string | null
  nameVi: string
  nameEn: string | null
  nameJa: string | null
  kana: string | null
  shortDesc: string | null
  longDesc: string | null
  allergens: string[] | null
  tags: string[] | null
  routingMethod: 'fixed' | 'song' | 'nuong' | 'linh_hoat' | null
  stationGrill: string | null
  stationNoGrill: string | null
  stationTakeaway: string | null
  stationDelivery: string | null
  secondaryStation: string | null
  primaryLabel: string | null
  secondaryLabel: string | null
  prepSeconds: number
  basePrice: number
  vatCode: string
  onlineVisible: boolean
  tableOrderable: boolean
  signature: boolean
  active: boolean
  sort: number
  onlinePrice: number | null
  override: {
    price: number | null
    active: boolean | null
    onlineVisible: boolean | null
    onlinePrice: number | null
  } | null
  /** Giá và trạng thái chi nhánh đang xem thật sự bán */
  effectivePrice: number
  effectiveActive: boolean
  effectiveOnlineVisible: boolean
  effectiveOnlinePrice: number
}

export interface DeliveryZone {
  id: number
  branchId: string
  name: string
  wards: string[]
  feeVnd: number
  minOrderVnd: number
  etaMinutes: number
  active: boolean
  sort: number
}

export interface SetCourse {
  label: string
  kanji: string | null
  pickCount: number | null
  batchOffset: number
  items: { dishId: string; qty: number; portionLabel: string | null }[]
}

export interface DishDetail {
  dish: DishRow
  courses: SetCourse[]
  overrides: { branchId: string; price: number | null; active: boolean | null }[]
}

// ------------------------------------------- Kho & công thức M7 · M4 · S1 · S2

/**
 * Ô chưa có nguồn dữ liệu; `blockedBy` nói rõ màn nào mở khoá nó.
 *
 * Dùng chung cho cả nhóm kho lẫn nhóm báo cáo: cả hai đều có ô mà máy chủ cố ý
 * trả về trống thay vì trả 0.
 */
export interface BlockedTile {
  value: null
  blockedBy: string
}

export interface IngredientRow {
  id: string
  code: string
  name: string
  groupName: string | null
  /** ĐVT công thức và tồn kho đếm bằng: g · ml · cái */
  baseUnit: string
  /** ĐVT trên hoá đơn nhập: kg · keg 20L · thùng 24 lon */
  purchaseUnit: string
  basePerPurchase: number
  /** Giá bình quân, phần nghìn đồng mỗi ĐVT cơ sở */
  costPerBaseMilli: number
  costPerPurchaseVnd: number
  minLevelBase: number
  lotRequired: boolean
  active: boolean
  sort: number
  qtyBase: number
  qtyPurchase: number
  valueVnd: number
  belowMin: boolean
  /** Mức cạn trên thang than hồng (0 = đầy, 1 = hết); null = chưa khai định mức */
  emberRatio: number | null
  usedByDishes: number
}

export type IngredientInput = Omit<
  IngredientRow,
  | 'costPerBaseMilli'
  | 'costPerPurchaseVnd'
  | 'qtyBase'
  | 'qtyPurchase'
  | 'valueVnd'
  | 'belowMin'
  | 'emberRatio'
  | 'usedByDishes'
>

export type FoodCostBand = 'tot' | 'canh-bao' | 'bao-dong' | 'chua-co'

export interface RecipeLine {
  ingredientId: string
  code: string
  name: string
  baseUnit: string
  costPerBaseMilli: number
  qtyBase: number
  /** Hao hụt, điểm cơ bản: 600 = 6% */
  wasteBp: number
  sort: number
  effectiveQtyBase: number
  costVnd: number
  share: number
}

export interface RecipeView {
  dish: { id: string; code: string; nameVi: string; kind: string; basePrice: number }
  lines: RecipeLine[]
  costVnd: number
  priceVnd: number
  /** null = món chưa khai công thức, khác hẳn với 0% */
  percent: number | null
  band: FoodCostBand
  grossProfitVnd: number | null
}

export interface StockOverview {
  branchId: string
  totalValueVnd: number
  ingredientCount: number
  belowMin: IngredientRow[]
  withoutCost: number
  dishesWithoutRecipe: number
  consumedThisMonthVnd: number
  expiringLots: BlockedTile
  wasteThisMonth: BlockedTile
}

export interface StockMove {
  id: number
  kind: 'receipt' | 'sale' | 'count_adjust'
  qtyBase: number
  costVnd: number
  note: string | null
  orderLineId: number | null
  businessDate: string
  createdAt: string
}

// --------------------------------- Kế toán F2 · F3 · F4 · F5 · F6

export interface JournalRow {
  id: number
  kind: 'sale' | 'discount' | 'comp' | 'void' | 'refund' | 'payment' | 'shift_adjust'
  amount: number
  memo: string | null
  orderCode: string | null
  actorName: string | null
  approverName: string | null
  approvalReason: string | null
  businessDate: string
  createdAt: string
}

export interface JournalView {
  branchId: string
  from: string
  to: string
  rows: JournalRow[]
  totals: { kind: string; amount: number }[]
  readOnly: boolean
}

export type InvoiceState = 'pending' | 'issued' | 'failed' | 'voided' | 'replaced'

export interface InvoiceRow {
  id: number
  branchId: string
  orderId: number
  orderCode: string
  serial: string
  invoiceNo: string | null
  taxCode: string | null
  state: InvoiceState
  lastError: string | null
  amountSub: number
  amountVat: number
  amountTotal: number
  replacesId: number | null
  voidReason: string | null
  issuedAt: string | null
  issuedByName: string | null
  businessDate: string
}

export interface InvoiceBook {
  branchId: string
  /** Ký hiệu hoá đơn của chi nhánh; null = chưa khai ở A6 */
  serial: string | null
  rows: InvoiceRow[]
  queue: { id: number; orderCode: string; error: string | null }[]
  /** Bill đã trả đủ mà chưa có hoá đơn nào */
  missing: {
    orderId: number
    displayCode: string
    moneySub: number
    moneyVat: number
    moneyTotal: number
    businessDate: string
  }[]
}

export interface TaxReport {
  branchId: string
  from: string
  to: string
  buckets: { rate: number; netVnd: number; vatVnd: number }[]
  summary: {
    vatOutVnd: number
    vatInVnd: number
    /** Dương = phải nộp; âm = được khấu trừ chuyển kỳ sau */
    vatPayableVnd: number
    pitWithheldVnd: number
  }
  reconciliation: {
    systemVnd: number
    invoicedVnd: number
    diffVnd: number
    matched: boolean
    systemOrders: number
    issuedInvoices: number
  }
  vatInNote: string
  pitNote: string
}

export interface DebtReport {
  branchId: string
  from: string
  to: string
  payable: {
    receivedVnd: number
    vouchersVnd: number
    receiptCount: number
    note: string
  }
  receivable: BlockedTile
}

export interface PeriodLock {
  month: string
  lockedAt: string
  lockedByName: string | null
  note: string | null
}

export interface PeriodReadiness {
  month: string
  blockers: string[]
}

// ------------------------------------- Chi phí & tài sản C1 · C2 · C3 · C4 · C6

/** Dòng của F7 mà một khoản mục cộng vào */
export type PnlLine =
  | 'cogs'
  | 'labour'
  | 'rent'
  | 'utilities'
  | 'depreciation'
  | 'marketing'
  | 'payment-fee'
  | 'other-opex'
  | 'tax'

export interface ExpenseCategory {
  id: string
  parentId: string | null
  name: string
  pnlLine: PnlLine
  /** Khoản mục máy tự ghi (giá vốn, nhân sự) — không nhập tay được */
  automatic: boolean
  active: boolean
  sort: number
}

export type VoucherKind = 'expense' | 'advance'
export type PayMethod = 'cash' | 'transfer'
export type ApprovalTier = 'tu-ghi' | 'ke-toan-duyet' | 'chu-duyet'

export interface VoucherRow {
  id: number
  branchId: string
  categoryId: string
  categoryName: string
  pnlLine: PnlLine
  kind: VoucherKind
  supplier: string | null
  memo: string | null
  amountVnd: number
  vatVnd: number
  method: PayMethod
  amortizeMonths: number
  amortizeFrom: string
  advanceEmployeeId: number | null
  state: 'draft' | 'approved' | 'void'
  paidOn: string
  createdByName: string | null
  tier: ApprovalTier
}

export interface VoucherInput {
  branchId: string
  categoryId: string
  kind: VoucherKind
  supplier: string | null
  memo: string | null
  amountVnd: number
  vatVnd: number
  method: PayMethod
  amortizeMonths: number
  amortizeFrom: string
  advanceEmployeeId: number | null
  paidOn: string
}

export interface RecurringExpense {
  id: number
  branchId: string
  categoryId: string
  name: string
  supplier: string | null
  expectedVnd: number
  dayOfMonth: number
  method: PayMethod
  active: boolean
}

export interface AssetRow {
  id: number
  branchId: string
  categoryId: string
  name: string
  costVnd: number
  inServiceFrom: string
  depreciationMonths: number
  retiredOn: string | null
  note: string | null
  monthlyVnd: number
  accumulatedVnd: number
  remainingVnd: number
}

export interface ExpenseThresholds {
  pettyCashVnd: number
  ownerApprovalVnd: number
  assetVnd: number
}

export interface ExpenseOverview {
  branchId: string
  month: string
  totalVnd: number
  previousTotalVnd: number
  lines: {
    categoryId: string
    name: string
    pnlLine: string
    amountVnd: number
    previousVnd: number
    budgetVnd: number | null
    overBudget: boolean
  }[]
  draftVouchers: number
  thresholds: ExpenseThresholds
}

// --------------------------------------------- Nhân sự H1 · H2 · H7

export type PayKind = 'hourly' | 'monthly'
export type DayKind = 'thuong' | 'nghi' | 'le'

export interface EmployeeRow {
  id: number
  staffId: number
  branchId: string
  position: string
  payKind: PayKind
  hourlyRateVnd: number
  monthlySalaryVnd: number
  fixedAllowanceVnd: number
  startedOn: string
  endedOn: string | null
  bankAccount: string | null
  active: boolean
  fullName: string
  code: string
}

export type EmployeeInput = Omit<EmployeeRow, 'id' | 'fullName' | 'code'>

export interface ShiftTemplate {
  id: number
  branchId: string
  name: string
  startMinute: number
  endMinute: number
  breakMinutes: number
  sort: number
}

export interface ScheduleCell {
  id?: number
  workDate: string
  templateId: number | null
  startMinute: number
  endMinute: number
  breakMinutes: number
  dayKind: DayKind
  state?: 'draft' | 'published'
  note: string | null
}

export interface MinuteSplit {
  worked: number
  otNormal: number
  otRest: number
  otHoliday: number
}

export interface ScheduleWeek {
  branchId: string
  weekStart: string
  weekEnd: string
  days: string[]
  templates: ShiftTemplate[]
  /** Tuần nằm trong kỳ đã chốt công thì lưới chỉ đọc */
  locked: boolean
  lockedReason: string | null
  employees: {
    employeeId: number
    fullName: string
    position: string
    payKind: PayKind
    cells: ScheduleCell[]
    minutes: MinuteSplit
    totalMinutes: number
  }[]
}

export type PeriodState = 'draft' | 'locked' | 'submitted' | 'checked' | 'approved' | 'paid'

export interface PayrollPeriod {
  id: number
  branchId: string
  periodStart: string
  periodEnd: string
  state: PeriodState
  lockedAt: string | null
  submittedAt: string | null
  checkedAt: string | null
  approvedAt: string | null
  paidAt: string | null
}

export interface PayrollLine {
  periodId: number
  employeeId: number
  nameSnapshot: string
  positionSnapshot: string
  payKind: PayKind
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
  /** Có thể ÂM khi tạm ứng vượt lương kỳ này */
  netPayVnd: number
  note: string | null
}

export interface PayrollDetail {
  period: PayrollPeriod
  lines: PayrollLine[]
  totals: { gross: number; insurance: number; tax: number; net: number }
}

// ------------------------------------------------------- Báo cáo B1 · B3 · F1 · F7

export type PeriodKind = 'ngay' | 'tuan' | 'thang' | 'quy' | 'tuy-chon'
export type CompareKind = 'ky-truoc' | 'tuan-truoc' | 'nam-truoc'

export interface PeriodChoice {
  kind: PeriodKind
  compare: CompareKind
  anchor?: string
  from?: string
  to?: string
}

export interface ResolvedPeriod {
  kind: PeriodKind
  compare: CompareKind
  current: { from: string; to: string }
  baseline: { from: string; to: string }
  days: number
}

export interface Delta {
  value: number
  previous: number
  diff: number
  /** null khi kỳ trước bằng 0 — không có phần trăm để in */
  percent: number | null
}

export interface Tile {
  value: number
  vsYesterday: Delta
  vsLastWeek: Delta
}

/** Food cost thật; `coverage` = tỉ trọng doanh thu đã phủ công thức */
export interface FoodCostTile {
  value: number
  cogsVnd: number
  coverage: number
  vsYesterday: Delta
  vsLastWeek: Delta
}

export interface TodayReport {
  branchId: string
  date: string
  yesterday: string
  lastWeek: string
  revenue: Tile
  guests: Tile
  perGuest: Tile
  orderCount: Tile
  foodCost: FoodCostTile | BlockedTile
  hourly: { hour: number; revenue: number; orders: number; baselineRevenue: number }[]
  soldOut: { dishId: string; code: string; name: string; status: string; remaining: number | null }[]
  stockAlert: BlockedTile
}

export type Quadrant = 'ngoi-sao' | 'bo-sua' | 'cau-do' | 'bo-di'

export interface MenuMatrixReport {
  branchId: string
  period: ResolvedPeriod
  costBasis: 'gia-ban' | 'gia-von' | 'hon-hop'
  costNote: string | null
  dishesWithoutRecipe: number
  popularityCut: number
  contributionCut: number
  totals: { dishes: number; qty: number; revenue: number; contribution: number }
  rows: {
    dishId: string
    code: string
    name: string
    qty: number
    revenue: number
    qtyShare: number
    unitContribution: number
    /** null = món chưa khai công thức; đóng góp đang lấy tạm bằng doanh thu */
    unitCostVnd: number | null
    quadrant: Quadrant
    previousQuadrant: Quadrant | null
    previousQty: number
  }[]
}

export interface CashbookReport {
  branchId: string
  date: string
  shifts: {
    id: number
    cashier: string | null
    state: string
    openedAt: string
    closedAt: string | null
    openingCash: number
    cashIn: number
    /** Phiếu chi tiền mặt của NGÀY (phiếu chi không gắn ca) */
    cashOut: number
    expected: number | null
    counted: number | null
    variance: number | null
    note: string | null
  }[]
  byKind: { kind: string; paid: number; count: number }[]
  transfers: {
    paymentId: number
    kind: string
    amount: number
    vaNumber: string | null
    bankRef: string | null
    paidAt: string | null
    orderCode: string | null
  }[]
  pending: {
    paymentId: number
    kind: string
    amount: number
    vaNumber: string | null
    createdAt: string
  }[]
  unmatchedBankEvents: {
    id: number
    provider: string
    bankRef: string
    vaNumber: string | null
    amount: number
    matchState: string
    receivedAt: string
  }[]
  adjustments: { id: number; amount: number; memo: string | null; createdAt: string }[]
  /** Phiếu chi tiền mặt trong ngày, từ sổ phiếu chi C2 */
  cashVouchers: {
    id: number
    categoryName: string
    supplier: string | null
    memo: string | null
    amountVnd: number
    state: string
  }[]
  otherIncome: BlockedTile
}

export interface PnlRow {
  key: string
  label: string
  amount: number | null
  baseline: number | null
  kind: 'revenue' | 'deduction' | 'cost' | 'subtotal' | 'memo'
  blockedBy?: string
  note?: string
}

/** Chỉ số sống còn F&B: (giá vốn + nhân sự) / doanh thu thuần, báo động trên 60% */
export interface PrimeCost {
  value: number
  amountVnd: number
  cogsVnd: number
  labourVnd: number
  overThreshold: boolean
}

/** Dồn tích = chi phí theo kỳ phân bổ · Dòng tiền = theo tiền ra thực */
export type PnlBasis = 'don-tich' | 'dong-tien'

export interface PnlReport {
  branchId: string
  period: ResolvedPeriod
  basis: PnlBasis
  detailLevel: 'full' | 'summary'
  rows: PnlRow[]
  orderCount: number
  primeCost: PrimeCost | BlockedTile
  /** Chỉ có với vai trò được xem chi tiết lương (§4.2b) */
  labourDetail?: { name: string; position: string; grossPayVnd: number }[]
}

function periodQuery(branchId: string, period: PeriodChoice): string {
  const params = new URLSearchParams({
    branch: branchId,
    kind: period.kind,
    compare: period.compare,
  })
  if (period.anchor) params.set('anchor', period.anchor)
  if (period.from) params.set('from', period.from)
  if (period.to) params.set('to', period.to)
  return params.toString()
}

/** PIN người duyệt — gửi kèm khi vai trò chỉ ở mức △ với hành động đang làm */
export interface Approval {
  approverStaffId: number
  approverPin: string
  reason: string
}

export const api = {
  officeLogin: (input: { branchId: string; email: string; password: string }) =>
    apiFetch<{ token: string; staff: OfficeStaff }>('/api/auth/office/login', {
      method: 'POST',
      body: input,
    }),

  me: () =>
    apiFetch<{ kind: string; branchId: string; fullName?: string; roles?: string[] }>('/api/auth/me'),

  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  /** Danh sách chi nhánh để chọn lúc đăng nhập — công khai, dùng chung với web */
  publicBranches: () => apiFetch<{ id: string; name: string }[]>('/api/site/branches'),

  // ---------------------------------------------------------------- A6 · R3

  parameters: (branchId: string) =>
    apiFetch<ParameterRow[]>(`/api/admin/parameters?branch=${encodeURIComponent(branchId)}`),

  parameterHistory: (key: string) =>
    apiFetch<ParameterChange[]>(`/api/admin/parameters/${encodeURIComponent(key)}/history`),

  setParameter: (key: string, value: unknown, branchId: string | null) =>
    apiFetch<{ key: string }>(`/api/admin/parameters/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: { value, branchId },
    }),

  clearParameterOverride: (key: string, branchId: string) =>
    apiFetch<{ cleared: boolean }>(
      `/api/admin/parameters/${encodeURIComponent(key)}?branch=${encodeURIComponent(branchId)}`,
      { method: 'DELETE' },
    ),

  // ------------------------------------------------------------------- A10

  branches: () => apiFetch<BranchRow[]>('/api/admin/branches'),

  updateBranch: (id: string, patch: Partial<Omit<BranchRow, 'id' | 'timezone'>>) =>
    apiFetch<BranchRow>(`/api/admin/branches/${id}`, { method: 'PATCH', body: patch }),

  // -------------------------------------------------------------------- A3

  floorplan: (branchId: string) =>
    apiFetch<{ areas: AreaRow[]; tables: TableRow[] }>(
      `/api/admin/floorplan?branch=${encodeURIComponent(branchId)}`,
    ),

  createArea: (branchId: string, name: string) =>
    apiFetch<AreaRow>('/api/admin/areas', { method: 'POST', body: { branchId, name } }),

  renameArea: (id: number, name: string) =>
    apiFetch<AreaRow>(`/api/admin/areas/${id}`, { method: 'PATCH', body: { name } }),

  deleteArea: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/api/admin/areas/${id}`, { method: 'DELETE' }),

  createTable: (input: TableInput) =>
    apiFetch<TableRow>('/api/admin/tables', { method: 'POST', body: input }),

  updateTable: (id: number, patch: Partial<TableInput>) =>
    apiFetch<TableRow>(`/api/admin/tables/${id}`, { method: 'PATCH', body: patch }),

  deactivateTable: (id: number) =>
    apiFetch<TableRow>(`/api/admin/tables/${id}`, { method: 'DELETE' }),

  // -------------------------------------------------------------------- A1

  accounts: () => apiFetch<AccountRow[]>('/api/admin/accounts'),

  createAccount: (input: AccountInput) =>
    apiFetch<AccountRow>('/api/admin/accounts', { method: 'POST', body: input }),

  updateAccount: (
    id: number,
    patch: Partial<Pick<AccountRow, 'code' | 'fullName' | 'phone' | 'email' | 'active'>>,
  ) => apiFetch<AccountRow>(`/api/admin/accounts/${id}`, { method: 'PATCH', body: patch }),

  setAccountPassword: (id: number, value: string) =>
    apiFetch<{ hasPassword: boolean }>(`/api/admin/accounts/${id}/password`, {
      method: 'PUT',
      body: { value },
    }),

  setAccountPin: (id: number, value: string) =>
    apiFetch<{ hasPin: boolean }>(`/api/admin/accounts/${id}/pin`, {
      method: 'PUT',
      body: { value },
    }),

  setAccountRoles: (id: number, roles: RoleGrant[]) =>
    apiFetch<AccountRow>(`/api/admin/accounts/${id}/roles`, { method: 'PUT', body: { roles } }),

  // -------------------------------------------------------------------- A2

  roleAssignments: () => apiFetch<RoleAssignments>('/api/admin/roles'),

  // -------------------------------------------------------------------- A4

  devices: (branchId: string) =>
    apiFetch<{
      devices: DeviceRow[]
      pendingCodes: PendingCode[]
      stations: { id: string; name: string }[]
    }>(`/api/admin/devices?branch=${encodeURIComponent(branchId)}`),

  /** Cửa duy nhất sinh mã ghép — dùng chung với luồng K1 của POS */
  createPairingCode: (input: { branchId: string; kind: string; stationId: string | null }) =>
    apiFetch<{ code: string; expiresAt: string }>('/api/auth/pairing-codes', {
      method: 'POST',
      body: input,
    }),

  revokeDevice: (id: number) =>
    apiFetch<{ sessionsKilled: number }>(`/api/admin/devices/${id}`, { method: 'DELETE' }),

  // -------------------------------------------------------------------- A5

  printers: (branchId: string) =>
    apiFetch<{
      printers: PrinterRow[]
      stations: { id: string; name: string }[]
      templates: Record<PrinterRow['kind'], string[]>
    }>(`/api/admin/printers?branch=${encodeURIComponent(branchId)}`),

  createPrinter: (input: PrinterInput) =>
    apiFetch<PrinterRow>('/api/admin/printers', { method: 'POST', body: input }),

  updatePrinter: (id: number, patch: Partial<PrinterInput>) =>
    apiFetch<PrinterRow>(`/api/admin/printers/${id}`, { method: 'PATCH', body: patch }),

  deletePrinter: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/api/admin/printers/${id}`, { method: 'DELETE' }),

  // -------------------------------------------------------------------- A7

  auditTrail: (query: {
    branchId: string | null
    from: string
    to: string
    action: string | null
    actorId: number | null
    beforeId: number | null
  }) => {
    const search = new URLSearchParams({ from: query.from, to: query.to })
    if (query.branchId) search.set('branch', query.branchId)
    if (query.action) search.set('action', query.action)
    if (query.actorId !== null) search.set('actor', String(query.actorId))
    if (query.beforeId !== null) search.set('before', String(query.beforeId))
    return apiFetch<{ rows: AuditRow[]; nextBefore: number | null }>(
      `/api/admin/audit?${search.toString()}`,
    )
  },

  auditFilters: (query: { branchId: string | null; from: string; to: string }) => {
    const search = new URLSearchParams({ from: query.from, to: query.to })
    if (query.branchId) search.set('branch', query.branchId)
    return apiFetch<{ actions: string[]; actors: { id: number; fullName: string }[] }>(
      `/api/admin/audit/filters?${search.toString()}`,
    )
  },

  // -------------------------------------------------------------------- A9

  einvoice: (branchId: string) =>
    apiFetch<EinvoiceConfig>(`/api/admin/einvoice?branch=${encodeURIComponent(branchId)}`),

  setEinvoice: (
    branchId: string,
    patch: Partial<{
      taxCode: string
      provider: string
      certificateSerial: string
      certificateExpiry: string
      serial: string
      enabled: boolean
    }>,
  ) => apiFetch<EinvoiceConfig>('/api/admin/einvoice', { method: 'PUT', body: { branchId, ...patch } }),

  // -------------------------------------------------------------------- A8

  cmsPosts: () => apiFetch<CmsPost[]>('/api/admin/cms/posts'),

  createCmsPost: (input: Omit<CmsPost, 'id' | 'updatedAt' | 'updatedBy'>) =>
    apiFetch<CmsPost>('/api/admin/cms/posts', { method: 'POST', body: input }),

  updateCmsPost: (id: number, patch: Partial<Omit<CmsPost, 'id' | 'updatedAt' | 'updatedBy'>>) =>
    apiFetch<CmsPost>(`/api/admin/cms/posts/${id}`, { method: 'PATCH', body: patch }),

  deleteCmsPost: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/api/admin/cms/posts/${id}`, { method: 'DELETE' }),

  cmsJobs: () => apiFetch<CmsJob[]>('/api/admin/cms/jobs'),

  createCmsJob: (input: Omit<CmsJob, 'id' | 'branchName' | 'updatedAt' | 'updatedBy'>) =>
    apiFetch<CmsJob>('/api/admin/cms/jobs', { method: 'POST', body: input }),

  updateCmsJob: (
    id: number,
    patch: Partial<Omit<CmsJob, 'id' | 'branchName' | 'updatedAt' | 'updatedBy'>>,
  ) => apiFetch<CmsJob>(`/api/admin/cms/jobs/${id}`, { method: 'PATCH', body: patch }),

  deleteCmsJob: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/api/admin/cms/jobs/${id}`, { method: 'DELETE' }),

  // --------------------------------------------------------------------- M1

  dishes: (branchId: string) =>
    apiFetch<DishRow[]>(`/api/admin/dishes?branch=${encodeURIComponent(branchId)}`),

  dishPickers: () =>
    apiFetch<{
      categories: { id: string; nameVi: string; kanji: string | null }[]
      stations: { id: string; name: string; kanji: string | null }[]
    }>('/api/admin/dishes/pickers'),

  dishDetail: (id: string) => apiFetch<DishDetail>(`/api/admin/dishes/${id}`),

  createDish: (input: Omit<DishRow, 'override' | 'effectivePrice' | 'effectiveActive' | 'effectiveOnlineVisible' | 'effectiveOnlinePrice'>) =>
    apiFetch<DishRow>('/api/admin/dishes', { method: 'POST', body: input }),

  updateDish: (
    id: string,
    patch: Partial<Omit<DishRow, 'override' | 'effectivePrice' | 'effectiveActive' | 'effectiveOnlineVisible' | 'effectiveOnlinePrice'>>,
    approval?: Approval | null,
  ) => apiFetch<DishRow>(`/api/admin/dishes/${id}`, { method: 'PATCH', body: { ...patch, approval } }),

  setDishCourses: (id: string, courses: SetCourse[]) =>
    apiFetch<{ courses: number }>(`/api/admin/dishes/${id}/courses`, {
      method: 'PUT',
      body: { courses },
    }),

  setDishOverride: (
    id: string,
    branchId: string,
    input: {
      price: number | null
      active: boolean | null
      onlineVisible?: boolean | null
      onlinePrice?: number | null
    },
    approval?: Approval | null,
  ) =>
    apiFetch<{ price: number | null }>(`/api/admin/dishes/${id}/branches/${branchId}`, {
      method: 'PATCH',
      body: { ...input, approval },
    }),

  clearDishOverride: (id: string, branchId: string) =>
    apiFetch<{ cleared: boolean }>(`/api/admin/dishes/${id}/branches/${branchId}`, {
      method: 'DELETE',
    }),

  // -------------------------------------------------------------------- O10

  deliveryZones: (branchId: string) =>
    apiFetch<DeliveryZone[]>(`/api/admin/delivery-zones?branch=${encodeURIComponent(branchId)}`),

  createZone: (input: Omit<DeliveryZone, 'id'>) =>
    apiFetch<DeliveryZone>('/api/admin/delivery-zones', { method: 'POST', body: input }),

  updateZone: (id: number, patch: Partial<Omit<DeliveryZone, 'id'>>) =>
    apiFetch<DeliveryZone>(`/api/admin/delivery-zones/${id}`, { method: 'PATCH', body: patch }),

  deleteZone: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/api/admin/delivery-zones/${id}`, { method: 'DELETE' }),

  // ------------------------------------------------- B1 · B3 · F1 · F7

  today: (branchId: string, date: string | null) =>
    apiFetch<TodayReport>(
      `/api/reports/today?branch=${encodeURIComponent(branchId)}${date ? `&date=${date}` : ''}`,
    ),

  menuMatrix: (branchId: string, period: PeriodChoice) =>
    apiFetch<MenuMatrixReport>(`/api/reports/menu-matrix?${periodQuery(branchId, period)}`),

  cashbook: (branchId: string, date: string | null) =>
    apiFetch<CashbookReport>(
      `/api/reports/cashbook?branch=${encodeURIComponent(branchId)}${date ? `&date=${date}` : ''}`,
    ),

  profitLoss: (branchId: string, period: PeriodChoice, basis: PnlBasis = 'don-tich') =>
    apiFetch<PnlReport>(`/api/reports/pnl?${periodQuery(branchId, period)}&basis=${basis}`),

  // --------------------------------------------- M7 · M4 · S1 · S2

  ingredients: (branchId: string) =>
    apiFetch<IngredientRow[]>(
      `/api/inventory/ingredients?branch=${encodeURIComponent(branchId)}`,
    ),

  createIngredient: (input: IngredientInput, approval?: Approval | null) =>
    apiFetch<IngredientRow>('/api/inventory/ingredients', {
      method: 'POST',
      body: { ...input, approval },
    }),

  updateIngredient: (
    id: string,
    patch: Partial<IngredientInput>,
    approval?: Approval | null,
  ) =>
    apiFetch<IngredientRow>(`/api/inventory/ingredients/${id}`, {
      method: 'PATCH',
      body: { ...patch, approval },
    }),

  stockOverview: (branchId: string) =>
    apiFetch<StockOverview>(`/api/inventory/overview?branch=${encodeURIComponent(branchId)}`),

  stockMoves: (branchId: string, ingredientId: string) =>
    apiFetch<StockMove[]>(
      `/api/inventory/ingredients/${ingredientId}/moves?branch=${encodeURIComponent(branchId)}`,
    ),

  recipe: (dishId: string) => apiFetch<RecipeView>(`/api/inventory/recipes/${dishId}`),

  setRecipe: (
    dishId: string,
    lines: { ingredientId: string; qtyBase: number; wasteBp: number }[],
    approval?: Approval | null,
  ) =>
    apiFetch<{ dishId: string; lines: number; costBefore: number; costAfter: number }>(
      `/api/inventory/recipes/${dishId}`,
      { method: 'PUT', body: { lines, approval } },
    ),

  dishCosts: () =>
    apiFetch<{ dishId: string; costVnd: number; lineCount: number }[]>(
      '/api/inventory/dish-costs',
    ),

  receiveStock: (input: {
    branchId: string
    ingredientId: string
    qtyPurchase: number
    totalVnd: number
    note?: string | null
  }) => apiFetch<{ costPerBaseMilli: number }>('/api/inventory/receipts', {
    method: 'POST',
    body: input,
  }),

  adjustStock: (
    input: { branchId: string; ingredientId: string; qtyBaseDelta: number; note: string },
    approval?: Approval | null,
  ) =>
    apiFetch<{ delta: number }>('/api/inventory/adjustments', {
      method: 'POST',
      body: { ...input, approval },
    }),

  // ---------------------------------------------- H1 · H2 · H7

  employees: (branchId: string) =>
    apiFetch<EmployeeRow[]>(`/api/hr/employees?branch=${encodeURIComponent(branchId)}`),

  employeeCandidates: (branchId: string) =>
    apiFetch<{ id: number; code: string; fullName: string }[]>(
      `/api/hr/employees/candidates?branch=${encodeURIComponent(branchId)}`,
    ),

  saveEmployee: (input: EmployeeInput, id?: number) =>
    id
      ? apiFetch<EmployeeRow>(`/api/hr/employees/${id}`, { method: 'PUT', body: input })
      : apiFetch<EmployeeRow>('/api/hr/employees', { method: 'POST', body: input }),

  scheduleWeek: (branchId: string, weekStart: string) =>
    apiFetch<ScheduleWeek>(
      `/api/hr/schedule?branch=${encodeURIComponent(branchId)}&week=${weekStart}`,
    ),

  setScheduleWeek: (
    input: {
      branchId: string
      weekStart: string
      employeeId: number
      cells: Omit<ScheduleCell, 'id' | 'state'>[]
    },
    approval?: Approval | null,
  ) => apiFetch<{ cells: number }>('/api/hr/schedule', { method: 'PUT', body: { ...input, approval } }),

  publishSchedule: (branchId: string, weekStart: string) =>
    apiFetch<{ published: number }>('/api/hr/schedule/publish', {
      method: 'POST',
      body: { branchId, weekStart, employeeId: 1, cells: [] },
    }),

  copyPreviousWeek: (branchId: string, weekStart: string) =>
    apiFetch<{ copied: number }>('/api/hr/schedule/copy-previous', {
      method: 'POST',
      body: { branchId, weekStart, employeeId: 1, cells: [] },
    }),

  createShiftTemplate: (input: {
    branchId: string
    name: string
    startMinute: number
    endMinute: number
    breakMinutes: number
  }) => apiFetch<ShiftTemplate>('/api/hr/shift-templates', { method: 'POST', body: input }),

  payrollPeriods: (branchId: string) =>
    apiFetch<PayrollPeriod[]>(`/api/hr/payroll/periods?branch=${encodeURIComponent(branchId)}`),

  payrollDetail: (periodId: number) =>
    apiFetch<PayrollDetail>(`/api/hr/payroll/periods/${periodId}`),

  openPayrollPeriod: (input: { branchId: string; periodStart: string; periodEnd: string }) =>
    apiFetch<PayrollPeriod>('/api/hr/payroll/periods', { method: 'POST', body: input }),

  computePayroll: (
    periodId: number,
    adjustments: { employeeId: number; bonusVnd?: number; advanceVnd?: number; note?: string }[],
  ) =>
    apiFetch<{ lines: number }>(`/api/hr/payroll/periods/${periodId}/compute`, {
      method: 'POST',
      body: { adjustments },
    }),

  /** Một cửa cho bốn bước cuối — quyền do máy chủ chặn theo từng bước */
  advancePayroll: (periodId: number, step: 'lock' | 'submit' | 'check' | 'approve' | 'pay') =>
    apiFetch<{ state: PeriodState }>(`/api/hr/payroll/periods/${periodId}/${step}`, {
      method: 'POST',
    }),

  // ------------------------------------- C1 · C2 · C3 · C4 · C6

  expenseCategories: () => apiFetch<ExpenseCategory[]>('/api/expenses/categories'),

  vouchers: (branchId: string, from: string, to: string) =>
    apiFetch<VoucherRow[]>(
      `/api/expenses/vouchers?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  createVoucher: (input: VoucherInput, approval?: Approval | null) =>
    apiFetch<VoucherRow>('/api/expenses/vouchers', {
      method: 'POST',
      body: { ...input, approval },
    }),

  approveVoucher: (id: number) =>
    apiFetch<VoucherRow>(`/api/expenses/vouchers/${id}/approve`, { method: 'POST' }),

  advanceTargets: (branchId: string) =>
    apiFetch<{ id: number; fullName: string }[]>(
      `/api/expenses/advance-targets?branch=${encodeURIComponent(branchId)}`,
    ),

  recurringExpenses: (branchId: string) =>
    apiFetch<{ recurring: RecurringExpense; categoryName: string }[]>(
      `/api/expenses/recurring?branch=${encodeURIComponent(branchId)}`,
    ),

  createRecurring: (input: Omit<RecurringExpense, 'id' | 'active'>) =>
    apiFetch<RecurringExpense>('/api/expenses/recurring', { method: 'POST', body: input }),

  generateRecurring: (branchId: string, month: string) =>
    apiFetch<{ created: number }>('/api/expenses/recurring/generate', {
      method: 'POST',
      body: { branchId, month },
    }),

  assets: (branchId: string) =>
    apiFetch<AssetRow[]>(`/api/expenses/assets?branch=${encodeURIComponent(branchId)}`),

  createAsset: (input: {
    branchId: string
    categoryId: string
    name: string
    costVnd: number
    inServiceFrom: string
    depreciationMonths: number
    note: string | null
  }) => apiFetch<AssetRow>('/api/expenses/assets', { method: 'POST', body: input }),

  retireAsset: (id: number, retiredOn: string) =>
    apiFetch<AssetRow>(`/api/expenses/assets/${id}/retire`, {
      method: 'POST',
      body: { retiredOn },
    }),

  generateDepreciation: (branchId: string, month: string) =>
    apiFetch<{ posted: number }>('/api/expenses/assets/depreciation', {
      method: 'POST',
      body: { branchId, month },
    }),

  expenseOverview: (branchId: string, month: string) =>
    apiFetch<ExpenseOverview>(
      `/api/expenses/overview?branch=${encodeURIComponent(branchId)}&month=${month}`,
    ),

  setExpenseBudget: (input: {
    branchId: string
    categoryId: string
    month: string
    amountVnd: number
  }) => apiFetch<{ amountVnd: number }>('/api/expenses/budgets', { method: 'PUT', body: input }),

  // ------------------------------- F2 · F3 · F4 · F5 · F6

  journal: (branchId: string, from: string, to: string) =>
    apiFetch<JournalView>(
      `/api/accounting/journal?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  invoiceBook: (branchId: string, from: string, to: string) =>
    apiFetch<InvoiceBook>(
      `/api/accounting/invoices?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  issueInvoice: (orderId: number) =>
    apiFetch<InvoiceRow>(`/api/accounting/invoices/issue/${orderId}`, { method: 'POST' }),

  voidInvoice: (id: number, input: { reason: string; replace: boolean }, approval?: Approval | null) =>
    apiFetch<{ voided: number; replacement: InvoiceRow | null }>(
      `/api/accounting/invoices/${id}/void`,
      { method: 'POST', body: { ...input, approval } },
    ),

  taxReport: (branchId: string, from: string, to: string) =>
    apiFetch<TaxReport>(
      `/api/accounting/tax-report?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  debts: (branchId: string, from: string, to: string) =>
    apiFetch<DebtReport>(
      `/api/accounting/debts?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  periodLocks: (branchId: string) =>
    apiFetch<PeriodLock[]>(`/api/accounting/periods?branch=${encodeURIComponent(branchId)}`),

  periodReadiness: (branchId: string, month: string) =>
    apiFetch<PeriodReadiness>(
      `/api/accounting/periods/readiness?branch=${encodeURIComponent(branchId)}&month=${month}`,
    ),

  lockPeriod: (branchId: string, month: string, note: string | null) =>
    apiFetch<{ locked: boolean }>('/api/accounting/periods/lock', {
      method: 'POST',
      body: { branchId, month, note },
    }),
}
