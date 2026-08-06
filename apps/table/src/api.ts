import { apiFetch, enqueue } from '@sora/core'

export interface TableSession {
  id: number
  branchId: string
  status: 'open' | 'paid_wait_clear' | 'closed'
  guestCount: number
  openedAt: string
  table: { id: number; code: string; area: string | null; hasGrill: boolean; seatMax: number }
}

export interface Dish {
  id: string
  kind: 'dish' | 'set' | 'drink'
  categoryId: string | null
  /** Chặng trong nhóm: nhóm Nướng chia bò · heo · hải sản · rau */
  subCategory: string | null
  nameVi: string
  nameJa: string | null
  kana: string | null
  shortDesc: string | null
  allergens: string[] | null
  /** `chay` · `cay` · `hai-san` — nguồn của bộ lọc T5 */
  tags: string[] | null
  price: number
  tableOrderable: boolean
  modifierGroupIds: string[]
  routing: { stationGrill: string | null; stationNoGrill: string | null } | null
}

export interface ModifierOption {
  id: string
  name: string
  priceDelta: number
}

export interface ModifierGroup {
  id: string
  name: string
  /** Bắt buộc chọn: món nướng phải có vị, lẩu phải có số người ăn */
  required: boolean
  multi: boolean
  options: ModifierOption[]
}

export interface ConfigBundle {
  version: string
  branch: { id: string; name: string; address: string | null; phone: string | null }
  categories: { id: string; nameVi: string; kanji: string | null }[]
  dishes: Dish[]
  modifiers: ModifierGroup[]
}

export interface AvailabilityRow {
  dishId: string
  status: 'sold_out' | 'limited'
  remaining: number | null
}

export interface OrderLineRow {
  id: number
  parentLineId: number | null
  batchNo: number
  dishId: string
  nameSnapshot: string
  qty: number
  unitPrice: number
  priceTotal: number
  note: string | null
  setLabel: string | null
  state: 'draft' | 'queued' | 'cooking' | 'ready' | 'served' | 'voided'
}

export interface SessionOrder {
  order: {
    id: number
    displayCode: string
    moneySub: number
    moneyService: number
    moneyVat: number
    moneyRound: number
    moneyTotal: number
    paymentState: 'unpaid' | 'partial' | 'paid' | 'refunded'
  }
  lines: OrderLineRow[]
  batches: { batchNo: number; state: 'held' | 'fired'; firedAt: string | null }[]
}

export interface Bill {
  sessionId: number
  orderId?: number
  displayCode?: string
  total: number
  paid: number
  outstanding: number
  paymentState?: string
  payments: { id: number; kind: string; amount: number; paidAt: string | null }[]
  claimedLines: { orderLineId: number; paymentId: number }[]
}

/** Một lượt trả — T13 hiện QR, T14 hỏi lại trạng thái */
export interface PaymentTicket {
  id: number
  amount: number
  vaNumber: string
  qrString: string
  expiresAt: string
}

export interface PaymentStatus {
  id: number
  state: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'mismatch'
  amount: number
  vaNumber: string | null
  qrString: string | null
  expiresAt: string | null
  paidAt: string | null
}

export type RequestKind = 'phuc-vu' | 'them-than' | 'da-nuoc' | 'tinh-tien' | 'khac'

export interface NewLine {
  dishId: string
  qty: number
  note?: string | null
  modifierOptionIds?: string[]
}

export type DeviceState = 'waiting' | 'admitted' | 'rejected'

export interface JoinResult {
  deviceId: number
  sessionId: number
  branchId: string
  state: DeviceState
  isHost: boolean
  tableCode: string
}

export interface PendingList {
  guestCount: number
  admittedCount: number
  waiting: { deviceId: number; since: string }[]
}

export const api = {
  /**
   * T1: quét mã dán bàn.
   *
   * Mã QR chỉ nói "bàn nào" — nó không phải bí mật. Máy chứng minh được đang ở
   * trong quán thì vào thẳng; không thì nhận `waiting` và phải chờ chủ bàn duyệt.
   */
  join: (branchId: string, tableCode: string) =>
    apiFetch<JoinResult>('/api/table-devices/join', {
      method: 'POST',
      body: { branchId, tableCode },
    }),

  /** Máy đang chờ hỏi lại "tôi được duyệt chưa" */
  deviceState: () =>
    apiFetch<{ deviceId: number; state: DeviceState; isHost: boolean; sessionId: number }>(
      '/api/table-devices/me',
    ),

  /** Chủ bàn xem ai đang xin vào, kèm bối cảnh số khách */
  pending: () => apiFetch<PendingList>('/api/table-devices/pending'),

  /** Chủ bàn bấm Đồng ý / Từ chối */
  decide: (deviceId: number, approve: boolean) =>
    apiFetch<{ deviceId: number; state: DeviceState }>('/api/table-devices/decide', {
      method: 'POST',
      body: { deviceId, approve },
    }),

  me: () => apiFetch<{ kind: string; tableSessionId?: number; branchId: string }>('/api/auth/me'),

  session: (sessionId: number) => apiFetch<TableSession>(`/api/table-sessions/${sessionId}`),

  config: (branchId: string) => apiFetch<ConfigBundle>(`/api/config?branch=${branchId}`),

  availability: (branchId: string) =>
    apiFetch<AvailabilityRow[]>(`/api/availability?branch=${branchId}`),

  order: (sessionId: number) => apiFetch<SessionOrder | null>(`/api/table-sessions/${sessionId}/order`),

  bill: (sessionId: number) => apiFetch<Bill>(`/api/table-sessions/${sessionId}/bill`),

  paymentStatus: (paymentId: number) =>
    apiFetch<PaymentStatus>(`/api/payments/${paymentId}/status`),

  // --- Ghi ---

  /**
   * T6 gửi bếp. Đi qua hàng đợi offline: khách mất sóng giữa nhà hàng là chuyện
   * thường, và mất đơn vì sóng là lỗi không được phép có (TRIEN-KHAI §6).
   * Trả `null` nghĩa là còn nằm trong hàng đợi, sẽ tự gửi khi có mạng.
   */
  addLines: (sessionId: number, lines: NewLine[]) =>
    enqueue<{ money: { sub: number; total: number } }>({
      method: 'POST',
      path: `/api/table-sessions/${sessionId}/lines`,
      payload: { lines },
      label: `Gọi ${lines.length} món`,
    }),

  send: (sessionId: number) =>
    enqueue<{ tickets: number }>({
      method: 'POST',
      path: `/api/table-sessions/${sessionId}/send`,
      payload: {},
      label: 'Gửi bếp',
    }),

  /** T1 khách chốt lại bàn mình mấy người */
  setGuestCount: (sessionId: number, guestCount: number) =>
    apiFetch<{ sessionId: number; guestCount: number }>(
      `/api/table-sessions/${sessionId}/guests`,
      { method: 'POST', body: { guestCount } },
    ),

  /** T15 chấm sao và nhận xét */
  feedback: (sessionId: number) =>
    apiFetch<{ stars: number; comment: string | null } | null>(
      `/api/table-sessions/${sessionId}/feedback`,
    ),

  sendFeedback: (sessionId: number, stars: number, comment: string) =>
    apiFetch<{ id: number; stars: number }>(`/api/table-sessions/${sessionId}/feedback`, {
      method: 'POST',
      body: { stars, comment: comment.trim() || null },
    }),

  /** T9 gọi nhân viên — không qua hàng đợi: gọi người mà chờ có mạng thì vô nghĩa */
  callStaff: (sessionId: number, kind: RequestKind, note?: string) =>
    apiFetch<{ id: number; label: string }>(`/api/table-sessions/${sessionId}/requests`, {
      method: 'POST',
      body: { kind, note: note ?? null },
    }),

  /** T11 xem trước các phần khi chia đều */
  splitPreview: (sessionId: number, parts: number) =>
    apiFetch<{ parts: number; amounts: number[]; outstanding: number }>(
      `/api/table-sessions/${sessionId}/split/preview`,
      { method: 'POST', body: { parts } },
    ),

  /** T12 nhận các món mình trả */
  claim: (sessionId: number, orderLineIds: number[]) =>
    apiFetch<PaymentTicket>(`/api/table-sessions/${sessionId}/split/claim`, {
      method: 'POST',
      body: { orderLineIds },
    }),

  /** T13 tạo QR cho một số tiền */
  vietqr: (sessionId: number, amount: number) =>
    apiFetch<PaymentTicket>(`/api/table-sessions/${sessionId}/pay/vietqr`, {
      method: 'POST',
      body: { amount },
    }),
}
