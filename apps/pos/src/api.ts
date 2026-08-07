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
  /** Đặt chỗ trong 90 phút tới — nhãn `Đặt 19:00` trên ô bàn (P2) */
  reservation: {
    id: number
    displayCode: string
    slotAt: string
    guestCount: number
    customerName: string
  } | null
}

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'done'
  | 'cancelled'
  | 'no_show'

export interface ReservationRow {
  id: number
  displayCode: string
  status: ReservationStatus
  seatKind: 'standard' | 'grill' | 'private'
  guestCount: number
  slotAt: string
  endAt: string
  tableId: number | null
  customerName: string
  customerPhone: string
  note: string | null
  source: 'web' | 'phone' | 'walkin'
  cancelReason: string | null
}

export interface ReservationBoard {
  branchId: string
  businessDate: string
  tables: {
    id: number
    code: string
    area: string | null
    kind: 'standard' | 'grill' | 'private'
    hasGrill: boolean
    seatMax: number
  }[]
  reservations: ReservationRow[]
  serverNow: string
  lateAfterMinutes: number
}

export interface ReservationDetail extends ReservationRow {
  history: { visits: number; noShows: number }
  fittingTables: {
    id: number
    code: string
    area: string | null
    seatMax: number
    free: boolean
    occupiedNow: boolean
    takenBy: string | null
  }[]
}

export interface LateReservation extends ReservationRow {
  lateMinutes: number
  canNoShow: boolean
}

/** Hai cữ nhắc của R4: trước một ngày và trước hai tiếng */
export type ReminderStage = 'h24' | 'h2'
export type ReminderChannel = 'phone' | 'zalo' | 'sms' | 'messenger'
export type ReminderOutcome = 'reached' | 'no_answer'

export interface ReminderRow extends ReservationRow {
  stage: ReminderStage
  dueAt: string
  /** Số lần đã gọi mà không nghe máy */
  attempts: number
  lastAttemptAt: string | null
  guestConfirmedAt: string | null
  /** Liên kết một chạm để dán vào Zalo — rỗng với suất đặt trước khi có chìa */
  confirmUrl: string | null
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

export interface ModifierGroup {
  id: string
  name: string
  /** Bắt buộc chọn: món nướng phải có vị, lẩu phải có số người ăn */
  required: boolean
  multi: boolean
  options: { id: string; name: string; priceDelta: number }[]
}

export interface ConfigDish {
  id: string
  kind: 'dish' | 'set' | 'drink'
  categoryId: string | null
  nameVi: string
  price: number
  modifierGroupIds: string[]
  routing: { stationGrill: string | null; stationNoGrill: string | null } | null
}

export interface ConfigBundle {
  version: string
  branch: { id: string; name: string; timezone: string }
  stations: { id: string; name: string; ticketPrefix: string }[]
  categories: { id: string; nameVi: string; kanji: string | null }[]
  dishes: ConfigDish[]
  modifiers: ModifierGroup[]
}

export interface AvailabilityRow {
  dishId: string
  status: 'sold_out' | 'limited'
  remaining: number | null
}

/** O8 — thẻ đơn trên bảng điều phối */
export interface DispatchCard {
  id: number
  displayCode: string
  channel: 'web' | 'grab' | 'shopee' | 'be' | 'pos' | 'table'
  type: 'takeaway' | 'delivery' | 'dinein'
  status: 'new' | 'confirmed' | 'cooking' | 'ready' | 'delivering' | 'done' | 'cancelled'
  paymentState: 'unpaid' | 'partial' | 'paid' | 'refunded'
  slotMode: 'asap' | 'scheduled' | null
  slotAt: string | null
  createdAt: string
  total: number
  customerName: string | null
  customerPhone: string | null
  address: string | null
  externalCode: string | null
  itemCount: number
  /** Bước bấm được với vai trò đang đăng nhập — POS không tự đoán luật §3 */
  nextStatuses: DispatchCard['status'][]
}

/** O9 — chi tiết đơn trong ngăn kéo bên phải */
export interface DispatchDetail extends DispatchCard {
  customer: Record<string, unknown> | null
  shipper: { name: string; phone: string | null; provider: string | null } | null
  cancelReason: string | null
  money: { sub: number; service: number; vat: number; ship: number; round: number; total: number }
  lines: {
    id: number
    parentLineId: number | null
    nameSnapshot: string
    qty: number
    unitPrice: number
    priceTotal: number
    note: string | null
    modifiers: { name: string }[] | null
    state: string
  }[]
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

/** P14 — bảng số liệu trước khi đếm két */
export interface ShiftSummary {
  shift: {
    id: number
    branchId: string
    businessDate: string
    state: 'open' | 'closed'
    openedAt: string
    closedAt: string | null
    openingCash: number
    cashier: string | null
  }
  cash: { opening: number; sales: number; expected: number }
  revenue: { byKind: { kind: string; amount: number; count: number }[]; total: number }
  bank: {
    system: number
    statement: number
    matched: number
    unassigned: number
    mismatched: number
  }
}

/** P15 — ba nhóm đối soát */
export interface ReconcileBoard {
  businessDate: string
  serverNow: string
  lastEventAt: string | null
  /** Lượt trả đang chờ ngân hàng — điều kiện thứ hai của banner đỏ */
  pending: { count: number; amount: number }
  matched: {
    paymentId: number
    amount: number
    vaNumber: string | null
    bankRef: string | null
    paidAt: string | null
    tableCode: string | null
    orderCode: string | null
  }[]
  mismatch: {
    paymentId: number
    expected: number
    received: number
    diff: number
    vaNumber: string | null
    bankRef: string
    receivedAt: string
    tableCode: string | null
    orderCode: string | null
  }[]
  unassigned: {
    bankEventId: number
    amount: number
    vaNumber: string | null
    bankRef: string
    receivedAt: string
  }[]
}

/** Sổ COD của dải P16 */
export interface CodBook {
  shippers: {
    name: string
    phone: string | null
    due: number
    orders: { id: number; displayCode: string; due: number }[]
  }[]
  total: number
}

export const api = {
  staffList: (branchId: string) =>
    apiFetch<StaffOption[]>(`/api/auth/staff?branchId=${encodeURIComponent(branchId)}`),

  login: (input: { branchId: string; staffId: number; pin: string }) =>
    apiFetch<{ token: string; staff: { id: number; fullName: string; roles: string[] } }>(
      '/api/auth/login',
      { method: 'POST', body: input },
    ),

  /**
   * K1 · A4: máy nhập mã 6 số quản lý đọc cho, nhận token dài hạn.
   *
   * Công khai vì lúc này máy chưa có danh tính nào — chính mã ghép là thứ chứng
   * minh người thao tác đang đứng trong quán. Token trả về ĐÚNG MỘT LẦN.
   */
  pair: (code: string, name: string) =>
    apiFetch<{ token: string; deviceId: number }>('/api/auth/pair', {
      method: 'POST',
      body: { code, name },
    }),

  me: () =>
    apiFetch<{
      kind: string
      branchId: string
      fullName?: string
      roles?: string[]
      deviceKind?: string
      stationId?: string | null
    }>('/api/auth/me'),

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

  /** P5 — thứ tự 20 ô bàn phím nhanh; tên và giá vẫn lấy từ config bundle */
  quickKeys: (branchId: string) =>
    apiFetch<{ dishIds: string[]; days: number; since: string }>(
      `/api/quick-keys?branch=${encodeURIComponent(branchId)}`,
    ),

  // --- P14 đóng ca · P15 đối soát · sổ COD ---

  shiftSummary: (shiftId: number) => apiFetch<ShiftSummary>(`/api/shifts/${shiftId}/summary`),

  closeShift: (shiftId: number, countedCash: number, note: string | null) =>
    apiFetch<{ expected: number; counted: number; variance: number }>(
      `/api/shifts/${shiftId}/close`,
      { method: 'POST', body: { countedCash, note } },
    ),

  reconcile: (branchId: string, date?: string) =>
    apiFetch<ReconcileBoard>(
      `/api/payments/reconcile?branch=${encodeURIComponent(branchId)}${date ? `&date=${date}` : ''}`,
    ),

  acceptMismatch: (paymentId: number) =>
    apiFetch<{ credited: number; gap: number }>(`/api/payments/${paymentId}/accept-mismatch`, {
      method: 'POST',
    }),

  requestTopUp: (paymentId: number) =>
    apiFetch<{ credited: number; gap: number }>(`/api/payments/${paymentId}/request-topup`, {
      method: 'POST',
    }),

  assignBankEvent: (bankEventId: number, sessionId: number) =>
    apiFetch<{ credited: number; paymentState: string }>(`/api/bank-events/${bankEventId}/assign`, {
      method: 'POST',
      body: { sessionId },
    }),

  codBook: (branchId: string) =>
    apiFetch<CodBook>(`/api/orders/cod?branch=${encodeURIComponent(branchId)}`),

  settleCod: (input: {
    branchId: string
    shipper: string
    orderIds: number[]
    receivedAmount?: number | null
  }) =>
    apiFetch<{ orders: number; due: number; received: number; variance: number }>(
      '/api/orders/cod/settle',
      { method: 'POST', body: input },
    ),

  shipperBook: (branchId: string) =>
    apiFetch<{ name: string; phone: string | null; trips: number }[]>(
      `/api/shippers?branch=${encodeURIComponent(branchId)}`,
    ),

  // --- P9 chuyển · ghép · tách bàn ---

  /**
   * Ba thao tác này KHÔNG đi qua hàng đợi offline: máy chủ còn phải trả lời "món
   * này đổi trạm, có chắc không" trước khi chạy, mà một lệnh nằm chờ mạng thì
   * không trả lời được câu đó.
   */
  moveSession: (sessionId: number, tableId: number, confirmReroute = false) =>
    apiFetch<{ sessionId: number; tableCode: string; rerouted: number }>(
      `/api/table-sessions/${sessionId}/move`,
      { method: 'POST', body: { tableId, confirmReroute } },
    ),

  transferLines: (
    sessionId: number,
    input: {
      lineIds: number[]
      targetSessionId?: number | null
      targetTableId?: number | null
      guestCount?: number | null
      confirmReroute?: boolean
    },
  ) =>
    apiFetch<{
      targetSessionId: number
      targetTableCode: string
      movedLines: number
      rerouted: number
    }>(`/api/table-sessions/${sessionId}/transfer`, { method: 'POST', body: input }),

  mergeSessions: (sessionId: number, targetSessionId: number) =>
    apiFetch<{ movedLines: number; rerouted: number }>(
      `/api/table-sessions/${sessionId}/merge`,
      { method: 'POST', body: { targetSessionId } },
    ),

  // --- O8 · O9 · O12 điều phối đơn online ---

  dispatchBoard: (branchId: string) =>
    apiFetch<{ serverTime: string; orders: DispatchCard[] }>(
      `/api/orders?branch=${encodeURIComponent(branchId)}`,
    ),

  orderDetail: (orderId: number) => apiFetch<DispatchDetail>(`/api/orders/${orderId}`),

  setOrderStatus: (orderId: number, to: DispatchCard['status']) =>
    apiFetch<{ status: string; changed: boolean; tickets?: number }>(
      `/api/orders/${orderId}/status`,
      { method: 'POST', body: { to } },
    ),

  cancelOrder: (orderId: number, reason: string) =>
    apiFetch<{ changed: boolean }>(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      body: { reason },
    }),

  assignShipper: (orderId: number, name: string, phone: string | null) =>
    apiFetch<{ shipper: string }>(`/api/orders/${orderId}/assign-shipper`, {
      method: 'POST',
      body: { name, phone },
    }),

  createExternalOrder: (input: {
    branchId: string
    channel: 'grab' | 'shopee' | 'be'
    type: 'takeaway' | 'delivery'
    externalCode: string
    customer: { name?: string | null; phone?: string | null; note?: string | null }
    lines: { dishId: string; qty: number }[]
  }) => apiFetch<{ id: number; displayCode: string }>('/api/orders/external', {
    method: 'POST',
    body: input,
  }),

  tableRequests: (branchId: string) =>
    apiFetch<{ serverTime: string; requests: TableRequest[] }>(
      `/api/table-requests?branch=${encodeURIComponent(branchId)}`,
    ),

  // --- R1 · R2 · R4 · P13 quầy đặt bàn ---

  reservationBoard: (branchId: string, date?: string) =>
    apiFetch<ReservationBoard>(
      `/api/desk/reservations?branch=${encodeURIComponent(branchId)}${date ? `&date=${date}` : ''}`,
    ),

  reservationDetail: (id: number) => apiFetch<ReservationDetail>(`/api/desk/reservations/${id}`),

  lateReservations: (branchId: string) =>
    apiFetch<{ serverNow: string; holdMinutes: number; rows: LateReservation[] }>(
      `/api/desk/reservations/late?branch=${encodeURIComponent(branchId)}`,
    ),

  noShowStats: (branchId: string) =>
    apiFetch<{ days: number; sources: { source: string; total: number; noShow: number; rate: number }[] }>(
      `/api/desk/reservations/no-show-stats?branch=${encodeURIComponent(branchId)}`,
    ),

  remindQueue: (branchId: string) =>
    apiFetch<{ serverNow: string; aheadHours: number; soonHours: number; rows: ReminderRow[] }>(
      `/api/desk/reservations/remind-queue?branch=${encodeURIComponent(branchId)}`,
    ),

  logReminder: (
    id: number,
    input: { stage: ReminderStage; channel: ReminderChannel; outcome: ReminderOutcome },
  ) =>
    apiFetch<{ reservationId: number; stage: ReminderStage; outcome: ReminderOutcome; sentAt: string }>(
      `/api/desk/reservations/${id}/remind`,
      { method: 'POST', body: input },
    ),

  assignReservationTable: (id: number, tableId: number | null) =>
    apiFetch<ReservationDetail>(`/api/desk/reservations/${id}/table`, {
      method: 'PATCH',
      body: { tableId },
    }),

  setReservationNote: (id: number, note: string | null) =>
    apiFetch<ReservationDetail>(`/api/desk/reservations/${id}/note`, {
      method: 'PATCH',
      body: { note },
    }),

  confirmReservation: (id: number) =>
    apiFetch<ReservationDetail>(`/api/desk/reservations/${id}/confirm`, { method: 'POST' }),

  /** "Đã đến" mở phiên bàn — từ đây mọi thứ đi tiếp qua vòng vận hành tại bàn */
  arriveReservation: (id: number, tableId?: number | null) =>
    apiFetch<{ reservation: ReservationDetail; sessionId: number }>(
      `/api/desk/reservations/${id}/arrive`,
      { method: 'POST', body: { tableId } },
    ),

  noShowReservation: (id: number) =>
    apiFetch<ReservationDetail>(`/api/desk/reservations/${id}/no-show`, { method: 'POST' }),

  cancelReservation: (id: number, reason: string) =>
    apiFetch<ReservationDetail>(`/api/desk/reservations/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),

  // --- Thao tác ghi: đi qua hàng đợi offline, kể cả khi đang online ---

  /**
   * P3 mở bàn. `ignoreReservation` là lần bấm thứ hai sau khi máy chủ báo bàn đã
   * dành cho khách đặt — nhân viên vẫn là người quyết.
   */
  openTable: (
    tableId: number,
    guestCount: number,
    tableCode: string,
    ignoreReservation = false,
  ) =>
    enqueue<{ id: number }>({
      method: 'POST',
      path: `/api/tables/${tableId}/open`,
      payload: { guestCount, ignoreReservation },
      label: `Mở bàn ${tableCode}`,
    }),

  addLines: (
    sessionId: number,
    lines: { dishId: string; qty: number; note?: string | null; modifierOptionIds?: string[] }[],
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

  /**
   * Phục vụ xác nhận đã đặt món lên bàn — khách thấy "Đã ra".
   *
   * Qua hàng đợi offline như mọi thao tác sàn khác: tay đang bưng khay, mất sóng
   * một góc phòng thì lệnh tự gửi khi có mạng, không bắt đứng lại bấm mãi.
   */
  /** Mang ra bàn TỪNG MÓN — món nào bếp xong thì bưng món đó, không chờ cả đợt */
  markLineServed: (lineId: number, name: string, tableCode: string) =>
    enqueue<{ served: boolean }>({
      method: 'POST',
      path: `/api/order-lines/${lineId}/served`,
      payload: {},
      label: `Mang ra bàn ${tableCode} · ${name}`,
    }),

  markServed: (orderId: number, batchNo: number, tableCode: string) =>
    enqueue<{ served: boolean }>({
      method: 'POST',
      path: `/api/orders/${orderId}/batches/${batchNo}/served`,
      payload: {},
      label: `Mang ra bàn ${tableCode} đợt ${batchNo}`,
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
