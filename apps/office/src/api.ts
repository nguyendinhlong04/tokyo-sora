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
  override: { price: number | null; active: boolean | null } | null
  /** Giá và trạng thái chi nhánh đang xem thật sự bán */
  effectivePrice: number
  effectiveActive: boolean
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

  createDish: (input: Omit<DishRow, 'override' | 'effectivePrice' | 'effectiveActive'>) =>
    apiFetch<DishRow>('/api/admin/dishes', { method: 'POST', body: input }),

  updateDish: (
    id: string,
    patch: Partial<Omit<DishRow, 'override' | 'effectivePrice' | 'effectiveActive'>>,
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
    input: { price: number | null; active: boolean | null },
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
}
