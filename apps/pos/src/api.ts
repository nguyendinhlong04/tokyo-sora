import { apiFetch, enqueue } from '@sora/core'

export interface StaffOption {
  id: number
  fullName: string
  roles: string[]
}

export interface SessionSummary {
  id: number
  status: 'open' | 'paid_wait_clear' | 'closed'
  guestCount: number
  openedAt: string
  orderId: number | null
  displayCode: string | null
  total: number
  paymentState: 'unpaid' | 'partial' | 'paid' | 'refunded'
}

export interface TableRow {
  id: number
  code: string
  area: string | null
  kind: 'standard' | 'grill' | 'private'
  hasGrill: boolean
  seatMin: number
  seatMax: number
  session: SessionSummary | null
}

export interface OrderLineRow {
  id: number
  parentLineId: number | null
  kind: 'dish' | 'set_parent'
  batchNo: number
  dishId: string
  nameSnapshot: string
  qty: number
  unitPrice: number
  priceTotal: number
  note: string | null
  setLabel: string | null
  portionLabel: string | null
  state: 'draft' | 'queued' | 'cooking' | 'ready' | 'served' | 'voided'
}

export interface SessionOrder {
  order: {
    id: number
    displayCode: string
    status: string
    moneySub: number
    moneyTotal: number
    paymentState: string
  }
  lines: OrderLineRow[]
  batches: { batchNo: number; state: 'held' | 'fired' }[]
}

export interface Bill {
  sessionId: number
  orderId?: number
  displayCode?: string
  total: number
  paid: number
  outstanding: number
  paymentState?: string
}

export interface ConfigBundle {
  version: string
  branch: { id: string; name: string; timezone: string }
  stations: { id: string; name: string; ticketPrefix: string }[]
  categories: { id: string; nameVi: string; kanji: string | null }[]
  dishes: {
    id: string
    kind: 'dish' | 'set' | 'drink'
    categoryId: string | null
    nameVi: string
    price: number
    routing: { stationGrill: string | null; stationNoGrill: string | null } | null
  }[]
}

export interface AvailabilityRow {
  dishId: string
  status: 'sold_out' | 'limited'
  remaining: number | null
}

/** P12 — một yêu cầu khách bấm từ bàn (T9) */
export interface TableRequest {
  id: number
  sessionId: number
  kind: string
  label: string
  note: string | null
  createdAt: string
  tableCode: string
  urgent: boolean
}

export const api = {
  staffList: (branchId: string) =>
    apiFetch<StaffOption[]>(`/api/auth/staff?branchId=${encodeURIComponent(branchId)}`),

  login: (input: { branchId: string; staffId: number; pin: string }) =>
    apiFetch<{ token: string; staff: { id: number; fullName: string; roles: string[] } }>(
      '/api/auth/login',
      { method: 'POST', body: input },
    ),

  me: () => apiFetch<{ kind: string; branchId: string; fullName?: string; roles?: string[] }>('/api/auth/me'),

  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  config: (branchId: string) => apiFetch<ConfigBundle>(`/api/config?branch=${branchId}`),

  availability: (branchId: string) =>
    apiFetch<AvailabilityRow[]>(`/api/availability?branch=${branchId}`),

  tables: (branchId: string) => apiFetch<TableRow[]>(`/api/tables?branch=${branchId}`),

  openShift: (branchId: string, openingCash: number) =>
    apiFetch<{ id: number }>('/api/shifts', { method: 'POST', body: { branchId, openingCash } }),

  openShiftOf: (branchId: string) =>
    apiFetch<{ id: number; openingCash: number } | null>(`/api/shifts/open?branch=${branchId}`),

  sessionOrder: (sessionId: number) =>
    apiFetch<SessionOrder | null>(`/api/table-sessions/${sessionId}/order`),

  bill: (sessionId: number) => apiFetch<Bill>(`/api/table-sessions/${sessionId}/bill`),

  tableRequests: (branchId: string) =>
    apiFetch<{ serverTime: string; requests: TableRequest[] }>(
      `/api/table-requests?branch=${encodeURIComponent(branchId)}`,
    ),

  // --- Thao tác ghi: đi qua hàng đợi offline, kể cả khi đang online ---

  openTable: (tableId: number, guestCount: number, tableCode: string) =>
    enqueue<{ id: number }>({
      method: 'POST',
      path: `/api/tables/${tableId}/open`,
      payload: { guestCount },
      label: `Mở bàn ${tableCode}`,
    }),

  addLines: (
    sessionId: number,
    lines: { dishId: string; qty: number; note?: string | null }[],
    label: string,
  ) =>
    enqueue<{ money: { sub: number; total: number } }>({
      method: 'POST',
      path: `/api/table-sessions/${sessionId}/lines`,
      payload: { lines },
      label,
    }),

  send: (sessionId: number, tableCode: string) =>
    enqueue<{ tickets: number }>({
      method: 'POST',
      path: `/api/table-sessions/${sessionId}/send`,
      payload: {},
      label: `Gửi bếp bàn ${tableCode}`,
    }),

  fireBatch: (orderId: number, batchNo: number) =>
    enqueue<{ tickets: number }>({
      method: 'POST',
      path: `/api/orders/${orderId}/batches/${batchNo}/fire`,
      payload: {},
      label: `Ra đợt ${batchNo}`,
    }),

  voidLine: (
    lineId: number,
    body: {
      reason: string
      approval?: { approverStaffId: number; approverPin: string; reason: string } | null
    },
    label: string,
  ) =>
    // Huỷ món KHÔNG qua hàng đợi: cần biết ngay có phải xin duyệt không, và câu
    // trả lời phụ thuộc trạng thái hiện tại của món chứ không hoãn lại được.
    apiFetch<{ approvalId: number | null }>(`/api/order-lines/${lineId}/void`, {
      method: 'POST',
      body,
    }).catch((err) => {
      void label
      throw err
    }),

  payCash: (sessionId: number, amount: number, tendered: number | null, tableCode: string) =>
    enqueue<{ paymentState: string; outstanding: number; change: number }>({
      method: 'POST',
      path: `/api/table-sessions/${sessionId}/pay/cash`,
      payload: { amount, tendered },
      label: `Thu tiền bàn ${tableCode}`,
    }),

  /**
   * P12 đánh dấu đã xử lý. KHÔNG qua hàng đợi offline: nhân viên bấm để hàng đợi
   * ngắn lại ngay trước mắt, một lệnh nằm chờ mạng sẽ làm hai người cùng chạy tới
   * một bàn.
   */
  markRequestDone: (requestId: number) =>
    apiFetch<{ id: number; done: boolean }>(`/api/table-requests/${requestId}/done`, {
      method: 'POST',
    }),

  /** P3 in mã QR dán bàn cho khách quét — token cũ chết ngay khi cấp mã mới */
  issueQrToken: (sessionId: number) =>
    apiFetch<{ token: string; url: string }>(`/api/table-sessions/${sessionId}/qr-token`, {
      method: 'POST',
    }),

  closeSession: (sessionId: number, tableCode: string) =>
    enqueue<{ changed: boolean }>({
      method: 'POST',
      path: `/api/table-sessions/${sessionId}/close`,
      payload: {},
      label: `Đóng bàn ${tableCode}`,
    }),
}
