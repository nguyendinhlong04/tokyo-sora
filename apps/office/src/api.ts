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

/** Ô chưa có nguồn dữ liệu; `blockedBy` nói rõ màn nào mở khoá nó */
export interface BlockedTile {
  value: null
  blockedBy: string
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
  foodCost: BlockedTile
  hourly: { hour: number; revenue: number; orders: number; baselineRevenue: number }[]
  soldOut: { dishId: string; code: string; name: string; status: string; remaining: number | null }[]
  stockAlert: BlockedTile
}

export type Quadrant = 'ngoi-sao' | 'bo-sua' | 'cau-do' | 'bo-di'

export interface MenuMatrixReport {
  branchId: string
  period: ResolvedPeriod
  costBasis: 'gia-ban' | 'gia-von'
  costNote: string | null
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
  cashOut: BlockedTile
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

export interface PnlReport {
  branchId: string
  period: ResolvedPeriod
  rows: PnlRow[]
  orderCount: number
  primeCost: BlockedTile
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

  profitLoss: (branchId: string, period: PeriodChoice) =>
    apiFetch<PnlReport>(`/api/reports/pnl?${periodQuery(branchId, period)}`),
}
