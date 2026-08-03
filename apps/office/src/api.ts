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

/** R3 — một ngày quán không nhận đặt, kèm lý do để người trực trả lời khách */
export interface BlockedDay {
  id: number
  day: string
  reason: string
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

// ------------------------------------------------------- B2 · B4 … B9

export interface Slice {
  key: string
  label: string
  value: number
  previous: number
  diff: number
  percent: number | null
  /** Tỉ trọng trong kỳ hiện tại */
  share: number
}

/** Tỉ lệ có thể chưa đo được — mẫu số 0 thì `null`, không phải 0 */
export interface RateDelta {
  value: number | null
  previous: number | null
}

export interface RevenueReport {
  branchId: string
  period: ResolvedPeriod
  total: Delta
  orders: Delta
  guests: Delta
  perGuest: Delta
  daily: { day: string; value: number; baselineDay: string | null; baseline: number }[]
  byHour: Slice[]
  byArea: Slice[]
  byType: Slice[]
  byChannel: Slice[]
  byPayment: Slice[]
}

export interface CostMarginReport {
  branchId: string
  period: ResolvedPeriod
  target: number
  revenue: Delta
  cogs: Delta
  grossMargin: Delta
  foodCost: { value: number | null; previous: number | null; overTarget: boolean | null }
  daily: {
    day: string
    revenueVnd: number
    cogsVnd: number
    foodCost: number | null
    overTarget: boolean | null
  }[]
  byCategory: {
    key: string
    label: string
    revenueVnd: number
    cogsVnd: number
    grossVnd: number
    foodCost: number | null
    grossDelta: Delta
  }[]
}

export interface KitchenReport {
  branchId: string
  period: ResolvedPeriod
  avgSeconds: Delta
  tickets: Delta
  lateRate: RateDelta
  byStation: {
    key: string
    total: number
    late: number
    avgSeconds: number
    p90Seconds: number
    bySource: Record<string, number>
    lateRate: number | null
  }[]
  byHour: { key: string; label: string; avgSeconds: number; tickets: number; lateRate: number | null }[]
  slowestDishes: {
    dishId: string
    name: string
    avgSeconds: number
    served: number
    lateRate: number | null
  }[]
}

export interface TurnoverReport {
  branchId: string
  period: ResolvedPeriod
  avgMinutes: Delta
  sessions: Delta
  guests: Delta
  turnsPerTableDay: number | null
  byTable: {
    tableId: number
    code: string
    areaName: string | null
    seatMax: number
    sessions: number
    turnsPerDay: number
    avgMinutes: number
    guests: number
    revenueVnd: number
    occupancy: number | null
  }[]
  byHour: { key: string; label: string; sessions: number; avgMinutes: number }[]
}

export interface StaffReport {
  branchId: string
  period: ResolvedPeriod
  rows: {
    staffId: string
    fullName: string
    revenue: Delta
    orders: number
    perOrderVnd: number
    cancels: number
    approvalRequests: number
  }[]
  totals: { revenueVnd: number; cancels: number; approvalRequests: number }
}

export interface SetsReport {
  branchId: string
  period: ResolvedPeriod
  sets: {
    dishId: string
    name: string
    sold: number
    soldDelta: Delta
    revenueVnd: number
    cogsVnd: number
    grossVnd: number
    foodCost: number | null
  }[]
  discount: {
    ordersWithDiscount: number
    ordersTotal: number
    rate: number | null
    amountVnd: Delta
    avgWithDiscountVnd: number
    avgWithoutDiscountVnd: number
  }
  promotionsNote: string
}

export interface OnlineReport {
  branchId: string
  period: ResolvedPeriod
  online: {
    orders: Delta
    revenue: Delta
    cancelRate: RateDelta
    avgDeliverySeconds: Delta
    byHour: { key: string; label: string; orders: number; cancelled: number }[]
  }
  reservations: {
    total: Delta
    seated: Delta
    noShowRate: RateDelta
    cancelRate: RateDelta
    bySeatKind: { key: string; label: string; total: number; noShow: number; noShowRate: number | null }[]
  }
}

// ------------------------------------------------------------ S3 … S12

export interface SupplierItemRow {
  supplierId: number
  ingredientId: string
  ingredientName: string
  priceVnd: number
  minOrderPurchase: number
  leadTimeDays: number
  preferred: boolean
}

export interface SupplierRow {
  id: number
  code: string
  name: string
  taxCode: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  paymentTermDays: number
  cutoffMinute: number | null
  note: string | null
  active: boolean
  items: SupplierItemRow[]
}

export interface SupplierInput {
  code: string
  name: string
  taxCode: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  paymentTermDays: number
  cutoffMinute: number | null
  note: string | null
  active: boolean
}

export interface ReorderRow {
  ingredientId: string
  ingredientName: string
  groupName: string | null
  baseUnit: string
  purchaseUnit: string
  onHandBase: number
  minLevelBase: number
  perDayBase: number
  /** Còn đủ bán mấy ngày nữa; null khi kỳ qua không bán gì */
  daysOfCover: number | null
  pendingPurchase: number
  suggestPurchase: number
  supplierId: number | null
  supplierName: string | null
  priceVnd: number | null
  leadTimeDays: number
}

export interface PurchaseOrderLine {
  id: number
  ingredientId: string
  ingredientName: string
  purchaseUnit: string
  qtyPurchase: number
  priceVnd: number
  receivedPurchase: number
  outstandingPurchase: number
}

export interface PurchaseOrderRow {
  id: number
  displayCode: string
  branchId: string
  supplierId: number
  supplierName: string
  state: 'draft' | 'sent' | 'received' | 'cancelled'
  expectedOn: string | null
  note: string | null
  createdByName: string | null
  totalVnd: number
  lines: PurchaseOrderLine[]
}

export interface ReceiveResult {
  ingredientId: string
  lotId: number | null
  qtyBase: number
  costPerBaseMilli: number
  costPerBaseMilliBefore: number
  unitPaidVnd: number
  agreedPriceVnd: number | null
  /** Lệch so với giá thoả thuận, điểm cơ bản. Cảnh báo chứ không chặn. */
  priceVarianceBp: number | null
}

export type ExpiryBand = 'het-han' | 'sap-het' | 'con-han' | 'khong-han'

export interface LotRow {
  id: number
  ingredientId: string
  ingredientName: string
  baseUnit: string
  lotCode: string
  receivedOn: string
  labelExpiresOn: string | null
  /** Hạn THẬT — keg đã đục tính từ ngày đục */
  expiresOn: string | null
  band: ExpiryBand
  qtyInBase: number
  qtyRemainBase: number
  remainValueVnd: number
  state: 'sealed' | 'open'
  openedAt: string | null
  receiveTempDeciC: number | null
  supplierName: string | null
  tappable: boolean
}

export interface LotBook {
  branchId: string
  today: string
  lots: LotRow[]
  summary: {
    expired: number
    expiringSoon: number
    expiredValueVnd: number
    expiringSoonValueVnd: number
  }
}

export interface CountLine {
  ingredientId: string
  ingredientName: string
  groupName: string | null
  baseUnit: string
  snapshotBase: number
  countedBase: number | null
  diffBase: number | null
  diffVnd: number | null
  note: string | null
  countedAt: string | null
}

export interface CountSheet {
  id: number
  branchId: string
  groupName: string | null
  state: 'counting' | 'closed' | 'cancelled'
  businessDate: string
  openedAt: string
  closedAt: string | null
  lines: CountLine[]
  countedLines: number
  diffVnd: number
}

export interface TransferLine {
  ingredientId: string
  ingredientName: string
  baseUnit: string
  qtyBase: number
  receivedBase: number | null
}

export interface TransferRow {
  id: number
  displayCode: string
  fromBranchId: string
  toBranchId: string
  state: 'sent' | 'received' | 'rejected'
  note: string | null
  sentByName: string | null
  sentAt: string
  receivedAt: string | null
  businessDate: string
  direction: 'in' | 'out'
  lines: TransferLine[]
}

export interface WasteRow {
  ingredientId: string
  ingredientName: string
  groupName: string | null
  baseUnit: string
  theoreticalBase: number
  saleBase: number
  writeOffBase: number
  writeOffVnd: number
  internalBase: number
  internalVnd: number
  countBase: number
  actualBase: number
  diffBase: number
  diffVnd: number
  ratio: number | null
  isDraftBeer: boolean
}

export interface WasteReport {
  branchId: string
  from: string
  to: string
  rows: WasteRow[]
  totals: { varianceVnd: number; writeOffVnd: number; internalVnd: number }
  draftBeer: {
    ingredientId: string
    ingredientName: string
    baseUnit: string
    pouredBase: number
    kegUsedBase: number
    diffBase: number
    diffVnd: number
    ratio: number | null
  }[]
}

export interface StockCardMove {
  id: number
  businessDate: string
  createdAt: string
  kind: string
  qtyBase: number
  costVnd: number
  lotCode: string | null
  docKind: string | null
  docId: number | null
  orderLineId: number | null
  note: string | null
  actorName: string | null
  /** Tồn ngay sau bút toán này */
  balanceBase: number
}

export interface StockCard {
  branchId: string
  ingredient: { id: string; name: string; baseUnit: string; costPerBaseMilli: number }
  from: string
  to: string
  openingBase: number
  closingBase: number
  moves: StockCardMove[]
}

export interface ProductionResult {
  runId: number
  totalInVnd: number
  totalInBase: number
  totalOutBase: number
  /** Hao = vào trừ ra; tiền của nó đã nằm trong giá đầu ra */
  wasteBase: number
  outputs: { ingredientId: string; qtyBase: number; costVnd: number; unitCostMilli: number }[]
}

// ---------------------------------------------------------------- C5

export interface InputInvoiceRow {
  id: number
  branchId: string
  voucherId: number | null
  sellerName: string
  sellerTaxCode: string
  invoiceNo: string
  serial: string | null
  issuedOn: string
  netVnd: number
  vatVnd: number
  deductible: boolean
  note: string | null
  createdAt: string
  voucherMemo: string | null
  voucherAmount: number | null
  categoryName: string | null
  createdByName: string | null
}

export interface MissingInvoiceVoucher {
  id: number
  paidOn: string
  supplier: string | null
  memo: string | null
  amountVnd: number
  vatVnd: number
  categoryName: string
}

export interface InputInvoiceBook {
  branchId: string
  from: string
  to: string
  /** Phiếu chi từ mức này trở lên mà thiếu hoá đơn thì bị nêu tên */
  thresholdVnd: number
  rows: InputInvoiceRow[]
  /** Con số F4 cộng vào thuế đầu vào */
  deductibleVnd: number
  /** VAT đã gõ trên phiếu chi nhưng không có hoá đơn đứng sau — không khấu trừ được */
  declaredButUndocumentedVnd: number
  missingVouchers: MissingInvoiceVoucher[]
}

export interface InputInvoiceInput {
  branchId: string
  voucherId: number | null
  sellerName: string
  sellerTaxCode: string
  invoiceNo: string
  serial: string | null
  issuedOn: string
  netVnd: number
  vatVnd: number
  deductible: boolean
  note: string | null
}

// --------------------------------------------------------- H3 · H4 · H5

export type AttendanceStatus =
  | 'dang-lam'
  | 'xong-ca'
  | 'vang'
  | 'chua-toi-gio'
  | 'nghi'
  | 'ngoai-lich'

export interface AttendanceRow {
  employeeId: number
  staffId: number
  fullName: string
  position: string
  scheduled: { startMinute: number; endMinute: number; dayKind: DayKind } | null
  clockIn: string | null
  clockOut: string | null
  breakMinutes: number
  source: 'kiosk' | 'manual' | 'pos' | null
  workedMinutes: number
  lateMinutes: number
  earlyLeaveMinutes: number
  onLeave: string | null
  status: AttendanceStatus
  /** Có phiên đăng nhập POS/KDS mà chưa chấm công */
  warnWorkedWithoutClock: boolean
  /** Đã chấm công mà không có hoạt động nào ở quán */
  warnClockWithoutWork: boolean
}

export interface AttendanceBoard {
  branchId: string
  workDate: string
  rows: AttendanceRow[]
  summary: { scheduled: number; clockedIn: number; late: number; absent: number; working: number }
}

export interface TimesheetDay {
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

export interface TimesheetRow {
  employeeId: number
  fullName: string
  position: string
  payKind: PayKind
  days: TimesheetDay[]
  total: { worked: number; otNormal: number; otRest: number; otHoliday: number }
  /** Ngày có ca mà không có công và cũng không có phép */
  missingDays: string[]
  leaveDays: number
  openShifts: number
}

export interface TimesheetGrid {
  branchId: string
  from: string
  to: string
  locked: { id: number; state: string; periodStart: string; periodEnd: string } | null
  rows: TimesheetRow[]
}

export type LeaveKind = 'nghi-phep' | 'nghi-khong-luong' | 'nghi-om' | 'doi-ca'

export interface LeaveRow {
  id: number
  employeeId: number
  employeeName: string
  kind: LeaveKind
  fromDate: string
  toDate: string
  counterpartId: number | null
  counterpartName: string | null
  reason: string
  state: 'pending' | 'approved' | 'rejected'
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
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
  /** Lịch bán M11 — khai ở màn Set & Combo, dùng chung cho mọi món */
  saleFrom: string | null
  saleTo: string | null
  saleDays: number
  saleStartMinute: number | null
  saleEndMinute: number | null
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

// ------------------------------------------------ M10 · Cây danh mục

/** M5 — một lựa chọn trong nhóm tuỳ chọn */
export interface ModifierOptionRow {
  id: string
  groupId: string
  name: string
  priceDelta: number
  /** Có trừ kho không: "thêm tỏi" là nguyên liệu thật, "ít cay" thì không */
  affectsStock: boolean
  sort: number
}

export interface ModifierGroupRow {
  id: string
  name: string
  required: boolean
  multi: boolean
  pickMin: number
  pickMax: number | null
  options: ModifierOptionRow[]
  /** Bao nhiêu món đang hỏi khách nhóm này */
  dishCount: number
  priceMin: number
  priceMax: number
}

export interface ModifierGroupInput {
  id: string
  name: string
  required: boolean
  multi: boolean
  pickMin: number
  pickMax: number | null
  options: {
    /** Rỗng = lựa chọn mới; giữ mã cũ khi sửa để giỏ hàng trên POS không hỏng */
    id?: string | null
    name: string
    priceDelta: number
    affectsStock: boolean
  }[]
}

export interface CategoryNode {
  id: string
  parentId: string | null
  nameVi: string
  nameEn: string | null
  nameJa: string | null
  kanji: string | null
  imageUrl: string | null
  onlineVisible: boolean
  tableVisible: boolean
  sort: number
  /** Cấp trong cây, 0 = gốc — màn M10 thụt lề theo con số này */
  depth: number
  dishCount: number
  /** Gồm cả món nằm trong nhóm con */
  totalDishCount: number
  childCount: number
}

export type CategoryInput = Pick<
  CategoryNode,
  'id' | 'parentId' | 'nameVi' | 'nameEn' | 'nameJa' | 'kanji' | 'imageUrl' | 'onlineVisible' | 'tableVisible'
>

// ------------------------------------------------- M11 · Set & Combo

export interface SaleSchedule {
  saleFrom: string | null
  saleTo: string | null
  /** Bitmask thứ: bit 0 = T2 … bit 6 = CN. 127 = cả tuần */
  saleDays: number
  saleStartMinute: number | null
  saleEndMinute: number | null
}

export interface SetOverviewRow {
  id: string
  code: string
  nameVi: string
  active: boolean
  priceVnd: number
  onlineVisible: boolean
  tableOrderable: boolean
  branchOverride: { price: number | null; active: boolean | null } | null
  courses: { groupId: string; label: string; pickCount: number | null; minVnd: number; maxVnd: number }[]
  courseCount: number
  costMinVnd: number
  costMaxVnd: number
  /** null khi còn món thành phần chưa khai công thức — dải chưa đọc được */
  foodCostMin: number | null
  foodCostMax: number | null
  unknownDishes: string[]
  schedule: SaleSchedule
  scheduleLabel: string | null
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
  /** Pha ở bếp chứ không mua ngoài — công thức mẻ khai ở M8 */
  isSemiFinished: boolean
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

// ------------------------------------------------- M8 · Bán thành phẩm

export interface PrepRow {
  id: string
  code: string
  name: string
  groupName: string | null
  baseUnit: string
  /** Sản lượng một mẻ chuẩn, ĐVT cơ sở; 0 = chưa khai */
  yieldBase: number
  lineCount: number
  batchCostVnd: number
  /** Giá vốn mỗi ĐVT cơ sở THEO CÔNG THỨC; null = chưa đủ dữ kiện */
  standardMilli: number | null
  /** Giá đang dùng thật, do lượt nấu S7 đẩy lên theo bình quân gia quyền */
  costPerBaseMilli: number
  usedByDishes: number
}

export interface PrepRecipeView {
  prep: {
    id: string
    code: string
    name: string
    baseUnit: string
    yieldBase: number
    costPerBaseMilli: number
  }
  lines: (RecipeLine & { isSemiFinished: boolean })[]
  batchCostVnd: number
  standardMilli: number | null
}

// -------------------------------------------- M9 · Lịch sử công thức

export type RecipeSubjectKind = 'dish' | 'prep'

export interface RecipeChangeRow {
  id: number
  subjectKind: RecipeSubjectKind
  subjectId: string
  subjectName: string
  version: number
  lineCount: number
  yieldBase: number | null
  costVnd: number
  /** Giá vốn của phiên bản liền trước; null = đây là bản đầu tiên */
  previousCostVnd: number | null
  actorName: string | null
  createdAt: string
}

export interface RecipeVersionRow {
  version: number
  lineCount: number
  yieldBase: number | null
  costVnd: number
  actorName: string | null
  createdAt: string
}

export interface RecipeVersionList {
  subjectKind: RecipeSubjectKind
  subjectId: string
  subjectName: string
  versions: RecipeVersionRow[]
}

export interface RecipeVersionLineSnapshot {
  ingredientId: string
  name: string
  qtyBase: number
  wasteBp: number
  costPerBaseMilli: number
  costVnd: number
}

export interface RecipeVersionCompare {
  subjectKind: RecipeSubjectKind
  subjectId: string
  from: { version: number; costVnd: number; yieldBase: number | null; actorName: string | null; createdAt: string }
  to: { version: number; costVnd: number; yieldBase: number | null; actorName: string | null; createdAt: string }
  lines: {
    ingredientId: string
    name: string
    before: RecipeVersionLineSnapshot | null
    after: RecipeVersionLineSnapshot | null
    change: 'added' | 'removed' | 'changed' | 'same'
  }[]
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
  receivable: ReceivableReport & { note: string }
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

// ------------------------------------- B11 · B12 · B13 · B14 · B15 (nhóm CRM)

export type PromotionKind = 'percent' | 'amount' | 'free_dish' | 'set_price'
export type PromotionState = 'draft' | 'active' | 'paused' | 'ended'

export interface PromotionInput {
  code: string
  name: string
  kind: PromotionKind
  percentBp: number | null
  amountVnd: number | null
  targetDishId: string | null
  setPriceVnd: number | null
  maxDiscountVnd: number | null
  channels: string[]
  branchIds: string[]
  weekdays: number[]
  fromMinute: number | null
  toMinute: number | null
  minOrderVnd: number
  requiresVoucher: boolean
  startsOn: string
  endsOn: string
}

export interface PromotionRow extends PromotionInput {
  id: number
  state: PromotionState
  targetDishName: string | null
  activatedAt: string | null
  activatedBy: string | null
  uses: number
  discountVnd: number
  voucherCount: number
  voucherLive: number
}

export interface PromoVoucherRow {
  id: number
  code: string
  maxUses: number
  usedCount: number
  expiresOn: string | null
  state: 'live' | 'void'
}

export interface CustomerRow {
  id: number
  phone: string
  /** true = vai trò hiện tại chỉ được thấy SĐT che ba số giữa */
  phoneMasked: boolean
  name: string | null
  allergies: string | null
  note: string | null
  firstSeenOn: string
  lastSeenOn: string
  visits: number
  spendTotalVnd: number
  spend12MonthsVnd: number
  pointsBalance: number
  tier: 'dong' | 'bac' | 'vang'
  tierLabel: string
  noShowCount: number
}

export interface LoyaltyConfig {
  vndPerPoint: number
  vndPerPointRedeem: number
  redeemCapVndPerOrder: number
  expiryMonths: number
  tierSilverVnd: number
  tierGoldVnd: number
}

export interface LoyaltyEntry {
  id: number
  kind: 'earn' | 'redeem' | 'reclaim' | 'adjust' | 'expire'
  points: number
  orderId: number | null
  baseVnd: number | null
  reason: string | null
  staffName: string | null
  businessDate: string
  expiresOn: string | null
}

export interface CustomerProfile {
  id: number
  phone: string
  phoneMasked: boolean
  name: string | null
  allergies: string | null
  note: string | null
  firstSeenOn: string
  lastSeenOn: string
  spendTotalVnd: number
  spend12MonthsVnd: number
  visitCount: number
  loyalty: {
    balance: number
    tier: CustomerRow['tier']
    tierLabel: string
    next: { tier: CustomerRow['tier']; remainingVnd: number } | null
    config: LoyaltyConfig
    entries: LoyaltyEntry[]
  }
  visits: {
    orderId: number
    displayCode: string
    branchId: string
    channel: string
    businessDate: string
    moneyTotal: number
    paymentState: string
  }[]
  favourites: { dishId: string; name: string; times: number; qty: number }[]
  bookings: {
    id: number
    displayCode: string
    branchId: string
    slotAt: string
    guestCount: number
    status: string
  }[]
}

export interface FeedbackItem {
  id: number
  orderId: number
  displayCode: string
  stars: number
  comment: string | null
  source: 'table' | 'online'
  state: 'new' | 'assigned' | 'resolved'
  assignedTo: number | null
  assignedName: string | null
  dueAt: string | null
  resolution: string | null
  resolvedAt: string | null
  businessDate: string
  createdAt: string
  moneyTotal: number
  dishes: { name: string; qty: number }[]
  overdue: boolean
}

export interface FeedbackQueue {
  rules: { 'feedback.complaintStars': number; 'feedback.responseHours': number }
  items: FeedbackItem[]
}

export interface FeedbackSummary {
  overall: { count: number; average: number; oneStar: number; fiveStar: number; open: number }
  byShift: { shiftId: number | null; openedAt: string | null; count: number; average: number }[]
  byDish: { dishId: string; name: string; count: number; billAverage: number }[]
}

export interface CorporateInput {
  code: string
  name: string
  taxCode: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  creditLimitVnd: number
  paymentTermDays: number
  reconcileDay: number
  blockAfterOverdueDays: number | null
  einvoiceMode: 'per-bill' | 'aggregate' | null
  active: boolean
}

export interface AgingBuckets {
  currentVnd: number
  d0to30Vnd: number
  d31to60Vnd: number
  over60Vnd: number
  totalVnd: number
  maxOverdueDays: number
}

export interface CorporateRow extends CorporateInput {
  id: number
  einvoiceModeEffective: 'per-bill' | 'aggregate'
  blockAfterOverdueDaysEffective: number
  aging: AgingBuckets
  outstandingVnd: number
  availableVnd: number
  /** null = POS ghi nợ được; có chữ = lý do bị chặn */
  blockedReason: string | null
}

export interface CorporateStatement {
  company: CorporateRow
  period: { from: string; to: string }
  charges: {
    id: number
    orderId: number
    displayCode: string
    branchId: string
    amountVnd: number
    chargedOn: string
    dueOn: string
    signer: string | null
    settledVnd: number
    remainingVnd: number
    overdueDays: number
  }[]
  settlements: {
    id: number
    chargeId: number
    kind: 'payment' | 'write-off'
    amountVnd: number
    paidOn: string
    note: string | null
    byName: string | null
  }[]
  aging: AgingBuckets
  totals: { chargedVnd: number; settledVnd: number; outstandingVnd: number }
}

export interface ReceivableReport {
  companies: {
    id: number
    code: string
    name: string
    creditLimitVnd: number
    paymentTermDays: number
    contactName: string | null
    contactPhone: string | null
    aging: AgingBuckets
  }[]
  totals: AgingBuckets
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

  blockedDays: (branchId: string) =>
    apiFetch<BlockedDay[]>(
      `/api/admin/reservations/blocked-days?branch=${encodeURIComponent(branchId)}`,
    ),

  blockDay: (branchId: string, day: string, reason: string) =>
    apiFetch<BlockedDay & { existingReservations: number }>(
      `/api/admin/reservations/blocked-days?branch=${encodeURIComponent(branchId)}`,
      { method: 'POST', body: { day, reason } },
    ),

  unblockDay: (id: number) =>
    apiFetch<{ id: number; day: string }>(`/api/admin/reservations/blocked-days/${id}`, {
      method: 'DELETE',
    }),

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

  // -------------------------------------------------------------------- M10

  categories: () => apiFetch<CategoryNode[]>('/api/admin/categories'),

  createCategory: (input: CategoryInput) =>
    apiFetch<CategoryNode>('/api/admin/categories', { method: 'POST', body: input }),

  updateCategory: (id: string, patch: Partial<CategoryInput>) =>
    apiFetch<CategoryNode>(`/api/admin/categories/${id}`, { method: 'PATCH', body: patch }),

  moveCategory: (id: string, parentId: string | null, position: number) =>
    apiFetch<{ id: string; position: number }>(`/api/admin/categories/${id}/move`, {
      method: 'PUT',
      body: { parentId, position },
    }),

  deleteCategory: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/admin/categories/${id}`, { method: 'DELETE' }),

  // --------------------------------------------------------------------- M5

  modifierGroups: () => apiFetch<ModifierGroupRow[]>('/api/admin/modifier-groups'),

  /** Lưu trọn nhóm: ràng buộc "bắt buộc thì ≥ 2 lựa chọn" chỉ kiểm được cả nhóm */
  saveModifierGroup: (input: ModifierGroupInput) =>
    apiFetch<{ id: string; options: number; dropped: number }>(
      `/api/admin/modifier-groups/${input.id}`,
      { method: 'PUT', body: input },
    ),

  deleteModifierGroup: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/admin/modifier-groups/${id}`, { method: 'DELETE' }),

  dishModifierGroups: (dishId: string) =>
    apiFetch<{ dishId: string; groupIds: string[] }>(
      `/api/admin/dishes/${dishId}/modifier-groups`,
    ),

  setDishModifierGroups: (dishId: string, groupIds: string[]) =>
    apiFetch<{ dishId: string; groupIds: string[] }>(
      `/api/admin/dishes/${dishId}/modifier-groups`,
      { method: 'PUT', body: { groupIds } },
    ),

  // -------------------------------------------------------------------- M11

  sets: (branchId: string) =>
    apiFetch<SetOverviewRow[]>(`/api/admin/sets?branch=${encodeURIComponent(branchId)}`),

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

  // ------------------------------------------------- B2 · B4 … B9

  revenueReport: (branchId: string, period: PeriodChoice) =>
    apiFetch<RevenueReport>(`/api/reports/revenue?${periodQuery(branchId, period)}`),

  costMargin: (branchId: string, period: PeriodChoice) =>
    apiFetch<CostMarginReport>(`/api/reports/cost-margin?${periodQuery(branchId, period)}`),

  kitchenReport: (branchId: string, period: PeriodChoice) =>
    apiFetch<KitchenReport>(`/api/reports/kitchen?${periodQuery(branchId, period)}`),

  tableTurnover: (branchId: string, period: PeriodChoice) =>
    apiFetch<TurnoverReport>(`/api/reports/table-turnover?${periodQuery(branchId, period)}`),

  staffReport: (branchId: string, period: PeriodChoice) =>
    apiFetch<StaffReport>(`/api/reports/staff?${periodQuery(branchId, period)}`),

  setsReport: (branchId: string, period: PeriodChoice) =>
    apiFetch<SetsReport>(`/api/reports/sets?${periodQuery(branchId, period)}`),

  onlineReport: (branchId: string, period: PeriodChoice) =>
    apiFetch<OnlineReport>(`/api/reports/online?${periodQuery(branchId, period)}`),

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

  // ------------------------------------------------------------- M8

  preps: () => apiFetch<PrepRow[]>('/api/inventory/preps'),

  prepRecipe: (prepId: string) => apiFetch<PrepRecipeView>(`/api/inventory/preps/${prepId}`),

  setPrepRecipe: (
    prepId: string,
    input: { yieldBase: number; lines: { ingredientId: string; qtyBase: number; wasteBp: number }[] },
    approval?: Approval | null,
  ) =>
    apiFetch<{
      lines: number
      batchCostVnd: number
      standardMilli: number | null
      /** Giá vừa được mồi cho bán thành phẩm chưa từng có giá; null = không mồi */
      seededMilli: number | null
      version: number | null
    }>(`/api/inventory/preps/${prepId}`, { method: 'PUT', body: { ...input, approval } }),

  // ------------------------------------------------------------- M9

  recipeChanges: () => apiFetch<RecipeChangeRow[]>('/api/inventory/recipe-changes'),

  recipeVersions: (kind: RecipeSubjectKind, subjectId: string) =>
    apiFetch<RecipeVersionList>(`/api/inventory/recipe-versions/${kind}/${subjectId}`),

  compareRecipeVersions: (kind: RecipeSubjectKind, subjectId: string, from: number, to: number) =>
    apiFetch<RecipeVersionCompare>(
      `/api/inventory/recipe-versions/${kind}/${subjectId}/compare?from=${from}&to=${to}`,
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

  // ---------------------------------------------------------- S3 … S12

  suppliers: () => apiFetch<SupplierRow[]>('/api/warehouse/suppliers'),

  saveSupplier: (input: SupplierInput, id?: number) =>
    id
      ? apiFetch<SupplierRow>(`/api/warehouse/suppliers/${id}`, { method: 'PUT', body: input })
      : apiFetch<SupplierRow>('/api/warehouse/suppliers', { method: 'POST', body: input }),

  setSupplierItem: (input: {
    supplierId: number
    ingredientId: string
    priceVnd: number
    minOrderPurchase: number
    leadTimeDays: number
    preferred: boolean
  }) => apiFetch<{ supplierId: number }>('/api/warehouse/supplier-items', { method: 'PUT', body: input }),

  removeSupplierItem: (supplierId: number, ingredientId: string) =>
    apiFetch<{ removed: boolean }>(`/api/warehouse/suppliers/${supplierId}/items/${ingredientId}`, {
      method: 'DELETE',
    }),

  purchaseOrders: (branchId: string, state?: string) =>
    apiFetch<PurchaseOrderRow[]>(
      `/api/warehouse/purchase-orders?branch=${encodeURIComponent(branchId)}${state ? `&state=${state}` : ''}`,
    ),

  reorderSuggestions: (branchId: string) =>
    apiFetch<ReorderRow[]>(
      `/api/warehouse/reorder-suggestions?branch=${encodeURIComponent(branchId)}`,
    ),

  createPurchaseOrder: (input: {
    branchId: string
    supplierId: number
    expectedOn: string | null
    note: string | null
    lines: { ingredientId: string; qtyPurchase: number; priceVnd: number }[]
  }) =>
    apiFetch<{ id: number; displayCode: string }>('/api/warehouse/purchase-orders', {
      method: 'POST',
      body: input,
    }),

  sendPurchaseOrder: (id: number) =>
    apiFetch<{ state: string }>(`/api/warehouse/purchase-orders/${id}/send`, { method: 'POST' }),

  cancelPurchaseOrder: (id: number, reason: string) =>
    apiFetch<{ state: string }>(`/api/warehouse/purchase-orders/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),

  /** S5 — cửa nhập đầy đủ: có lô, hạn dùng, nhiệt độ, đơn đặt hàng, cảnh báo lệch giá */
  receiveLot: (input: {
    branchId: string
    ingredientId: string
    qtyPurchase: number
    totalVnd: number
    supplierId: number | null
    purchaseOrderId: number | null
    lotCode: string | null
    expiresOn: string | null
    receiveTempDeciC: number | null
    note: string | null
  }) => apiFetch<ReceiveResult>('/api/warehouse/receipts', { method: 'POST', body: input }),

  issueStock: (
    input: {
      branchId: string
      kind: 'write_off' | 'internal'
      ingredientId: string
      qtyBase: number
      reason: string
    },
    approval?: Approval | null,
  ) =>
    apiFetch<{ qtyBase: number; shortBase: number }>('/api/warehouse/issues', {
      method: 'POST',
      body: { ...input, approval },
    }),

  produce: (input: {
    branchId: string
    kind: 'pha-che' | 'pha-loc' | 'duc-keg'
    inputs: { ingredientId: string; qtyBase: number }[]
    outputs: { ingredientId: string; qtyBase: number; costShareBp: number }[]
    note: string | null
  }) => apiFetch<ProductionResult>('/api/warehouse/production', { method: 'POST', body: input }),

  tapKeg: (lotId: number, branchId: string) =>
    apiFetch<{ lotId: number; expiresOn: string | null }>(`/api/warehouse/lots/${lotId}/tap`, {
      method: 'POST',
      body: { branchId },
    }),

  lots: (branchId: string, all = false) =>
    apiFetch<LotBook>(`/api/warehouse/lots?branch=${encodeURIComponent(branchId)}${all ? '&all=true' : ''}`),

  openCount: (branchId: string, groupName: string | null) =>
    apiFetch<{ id: number; lines: number }>('/api/warehouse/counts', {
      method: 'POST',
      body: { branchId, groupName },
    }),

  countSheet: (id: number) => apiFetch<CountSheet>(`/api/warehouse/counts/${id}`),

  saveCountLines: (
    id: number,
    lines: { ingredientId: string; countedBase: number; note: string | null }[],
  ) => apiFetch<{ saved: number }>(`/api/warehouse/counts/${id}/lines`, { method: 'PUT', body: { lines } }),

  closeCount: (id: number, approval?: Approval | null) =>
    apiFetch<{ adjusted: number; diffVnd: number }>(`/api/warehouse/counts/${id}/close`, {
      method: 'POST',
      body: { approval },
    }),

  cancelCount: (id: number) =>
    apiFetch<{ state: string }>(`/api/warehouse/counts/${id}/cancel`, { method: 'POST' }),

  transfers: (branchId: string) =>
    apiFetch<TransferRow[]>(`/api/warehouse/transfers?branch=${encodeURIComponent(branchId)}`),

  sendTransfer: (input: {
    fromBranchId: string
    toBranchId: string
    note: string | null
    lines: { ingredientId: string; qtyBase: number }[]
  }) =>
    apiFetch<{ id: number; displayCode: string }>('/api/warehouse/transfers', {
      method: 'POST',
      body: input,
    }),

  receiveTransfer: (id: number, lines: { ingredientId: string; receivedBase: number }[]) =>
    apiFetch<{ shortageVnd: number }>(`/api/warehouse/transfers/${id}/receive`, {
      method: 'POST',
      body: { lines },
    }),

  wasteReport: (branchId: string, from: string, to: string) =>
    apiFetch<WasteReport>(
      `/api/warehouse/waste?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  stockCard: (branchId: string, ingredientId: string, from: string, to: string) =>
    apiFetch<StockCard>(
      `/api/warehouse/stock-card?branch=${encodeURIComponent(branchId)}&ingredient=${encodeURIComponent(ingredientId)}&from=${from}&to=${to}`,
    ),

  // --------------------------------------------------------------- C5

  inputInvoices: (branchId: string, from: string, to: string) =>
    apiFetch<InputInvoiceBook>(
      `/api/expenses/input-invoices?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  createInputInvoice: (input: InputInvoiceInput) =>
    apiFetch<{ id: number }>('/api/expenses/input-invoices', { method: 'POST', body: input }),

  updateInputInvoice: (
    id: number,
    patch: { voucherId?: number | null; deductible?: boolean; note?: string | null },
  ) => apiFetch<{ id: number }>(`/api/expenses/input-invoices/${id}`, { method: 'PUT', body: patch }),

  deleteInputInvoice: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/api/expenses/input-invoices/${id}`, { method: 'DELETE' }),

  // ---------------------------------------------------- H3 · H4 · H5

  attendance: (branchId: string, date: string) =>
    apiFetch<AttendanceBoard>(
      `/api/hr/attendance?branch=${encodeURIComponent(branchId)}&date=${date}`,
    ),

  timesheet: (branchId: string, from: string, to: string) =>
    apiFetch<TimesheetGrid>(
      `/api/hr/timesheet?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  saveTimesheetEntry: (
    input: {
      branchId: string
      employeeId: number
      workDate: string
      clockIn: string
      clockOut: string | null
      breakMinutes: number
      reason: string
    },
    approval?: Approval | null,
  ) => apiFetch<{ id: number }>('/api/hr/timesheet', { method: 'POST', body: { ...input, approval } }),

  deleteTimesheetEntry: (id: number, branchId: string, reason: string) =>
    apiFetch<{ deleted: boolean }>(`/api/hr/timesheet/${id}`, {
      method: 'DELETE',
      body: { branchId, reason },
    }),

  leaves: (branchId: string, state?: string) =>
    apiFetch<LeaveRow[]>(
      `/api/hr/leaves?branch=${encodeURIComponent(branchId)}${state ? `&state=${state}` : ''}`,
    ),

  createLeave: (input: {
    branchId: string
    employeeId: number
    kind: LeaveKind
    fromDate: string
    toDate: string
    counterpartId: number | null
    reason: string
  }) => apiFetch<{ id: number }>('/api/hr/leaves', { method: 'POST', body: input }),

  decideLeave: (id: number, branchId: string, approve: boolean, note: string | null) =>
    apiFetch<{ state: string; shiftsChanged: number }>(`/api/hr/leaves/${id}/decision`, {
      method: 'POST',
      body: { branchId, approve, note },
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

  /** Link Kênh nhân viên (H8 · H9) — token trả về đúng một lần, cấp lại giết link cũ */
  issueChannelLink: (employeeId: number) =>
    apiFetch<{ token: string; fullName: string }>(`/api/hr/employees/${employeeId}/channel-link`, {
      method: 'POST',
    }),

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

  // ------------------------------- B11 · B12 · B13 · B14 · B15

  promotions: () => apiFetch<PromotionRow[]>('/api/crm/promotions'),

  savePromotion: (input: PromotionInput, id?: number) =>
    apiFetch<PromotionRow>(id ? `/api/crm/promotions/${id}` : '/api/crm/promotions', {
      method: id ? 'PUT' : 'POST',
      body: input,
    }),

  setPromotionState: (
    id: number,
    state: 'active' | 'paused' | 'ended',
    approval?: Approval | null,
  ) =>
    apiFetch<PromotionRow>(`/api/crm/promotions/${id}/state`, {
      method: 'POST',
      body: { state, approval: approval ?? null },
    }),

  promoVouchers: (promotionId: number) =>
    apiFetch<PromoVoucherRow[]>(`/api/crm/promotions/${promotionId}/vouchers`),

  issueVouchers: (input: {
    promotionId: number
    prefix: string
    count: number
    maxUses: number
    expiresOn: string | null
  }) => apiFetch<PromoVoucherRow[]>('/api/crm/promotions/vouchers', { method: 'POST', body: input }),

  voidVoucher: (id: number) =>
    apiFetch<PromoVoucherRow>(`/api/crm/promotions/vouchers/${id}/void`, { method: 'POST' }),

  customers: (search: string) =>
    apiFetch<CustomerRow[]>(
      `/api/crm/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),

  customer: (id: number) => apiFetch<CustomerProfile>(`/api/crm/customers/${id}`),

  saveCustomer: (input: {
    phone: string
    name: string | null
    allergies: string | null
    note: string | null
  }) => apiFetch<{ id: number }>('/api/crm/customers', { method: 'PUT', body: input }),

  loyaltyConfig: (branchId: string) =>
    apiFetch<LoyaltyConfig>(`/api/crm/loyalty/config?branch=${encodeURIComponent(branchId)}`),

  adjustPoints: (input: { customerId: number; points: number; reason: string }) =>
    apiFetch<LoyaltyEntry>('/api/crm/loyalty/adjust', { method: 'POST', body: input }),

  feedbackQueue: (branchId: string, includeResolved: boolean) =>
    apiFetch<FeedbackQueue>(
      `/api/crm/feedback?branch=${encodeURIComponent(branchId)}&resolved=${includeResolved}`,
    ),

  feedbackSummary: (branchId: string, from: string, to: string) =>
    apiFetch<FeedbackSummary>(
      `/api/crm/feedback/summary?branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`,
    ),

  /** Không truyền `staffId` = nhận việc cho chính mình */
  assignFeedback: (id: number, staffId?: number) =>
    apiFetch<FeedbackItem>(`/api/crm/feedback/${id}/assign`, {
      method: 'POST',
      body: { staffId: staffId ?? null },
    }),

  resolveFeedback: (id: number, resolution: string) =>
    apiFetch<FeedbackItem>(`/api/crm/feedback/${id}/resolve`, {
      method: 'POST',
      body: { resolution },
    }),

  corporate: () => apiFetch<CorporateRow[]>('/api/crm/corporate'),

  saveCorporate: (input: CorporateInput, id?: number) =>
    apiFetch<CorporateRow>(id ? `/api/crm/corporate/${id}` : '/api/crm/corporate', {
      method: id ? 'PUT' : 'POST',
      body: input,
    }),

  corporateStatement: (id: number, from: string, to: string) =>
    apiFetch<CorporateStatement>(`/api/crm/corporate/${id}/statement?from=${from}&to=${to}`),

  settleCorporate: (input: {
    chargeId: number
    kind: 'payment' | 'write-off'
    amountVnd: number
    paidOn: string
    note: string | null
  }) =>
    apiFetch<{ id: number }>('/api/crm/corporate/settlements', { method: 'POST', body: input }),
}
