import type { PromoClock, PromotionRule, SiteMenu } from '@sora/contracts'
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
  /** Ảnh khai ở Office M1 — chưa có thì ô món rơi về chữ kanji */
  imageUrl: string | null
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

/**
 * Một chặng của set — "Mở bữa · Bò trên than · Chốt bữa" (đấu nối §9.1).
 *
 * Chỉ khai những trường T3 vẽ ra. `batchOffset` (chặng ra ở đợt thứ mấy) là nhịp
 * bếp mang món, không phải thứ khách cần biết trước khi gọi.
 */
export interface SetGroup {
  id: string
  label: string
  /** null = cả chặng đều nằm trong set; số = "chọn N trong danh sách" */
  pickCount: number | null
  items: { dishId: string; qty: number; portionLabel: string | null }[]
}

export interface SetDefinition {
  setDishId: string
  label: string
  /** Món gợi ý gọi thêm cho vừa miệng — người nhập khai ở Office M1 */
  extraDishIds: string[]
  groups: SetGroup[]
}

export interface ConfigBundle {
  version: string
  branch: { id: string; name: string; address: string | null; phone: string | null }
  categories: { id: string; nameVi: string; kanji: string | null }[]
  dishes: Dish[]
  /** Chặng của từng set — bundle vẫn phát sẵn, T3 đọc để nói "trong set có gì" */
  sets: SetDefinition[]
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
  /** Tiền dòng SAU khuyến mãi món: `qty × unitPrice − discountVnd` (§9.6) */
  priceTotal: number
  promotionId: number | null
  discountVnd: number
  promoQty: number
  /** Tuỳ chọn đóng băng lúc gọi — "Tương Sora · Tỏi nướng" ở Đơn của bàn */
  modifiers: { optionId: string; name: string; priceDelta: number }[] | null
  note: string | null
  setLabel: string | null
  state: 'draft' | 'queued' | 'cooking' | 'ready' | 'served' | 'voided'
  voidReason: string | null
  /** Mọi dòng của cùng một lần "Gửi bếp" mang cùng mốc này — xem `sendRounds` */
  sentAt: string | null
}

export interface SessionOrder {
  order: {
    id: number
    displayCode: string
    /** Tiền món theo GIÁ NIÊM YẾT; giảm món và giảm hoá đơn cùng nằm ở `moneyDiscount` */
    moneySub: number
    moneyDiscount: number
    moneyBillDiscount: number
    billPromotionId: number | null
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

/** Chương trình đang chạy của chi nhánh, kèm giờ của chi nhánh do máy chủ tính */
export interface LivePromotions {
  clock: PromoClock
  maxDiscountRate: number
  rules: PromotionRule[]
}

export type RequestKind = 'phuc-vu' | 'them-than' | 'da-nuoc' | 'tinh-tien' | 'khac'

export interface NewLine {
  dishId: string
  qty: number
  note?: string | null
  modifierOptionIds?: string[]
}

/**
 * Bàn của iPad này, hỏi bằng chính token thiết bị (§9.1).
 *
 * iPad ghim cứng một bàn từ lúc ghép mã ở Office A4; phiên thì đi theo BÀN — nhân
 * viên mở bàn ở POS hay khách tự mở ở đây, iPad đều thấy cùng một phiên.
 */
export interface TerminalState {
  branchId: string
  table: {
    id: number
    code: string
    area: string | null
    hasGrill: boolean
    seatMin: number
    seatMax: number
    active: boolean
  }
  /** null = bàn chưa mở */
  session: TableSession | null
  /** Bàn có khách đặt trong 90′ tới — iPad không tự mở, chỉ báo giờ, không tên */
  reservedAt: string | null
}

export const api = {
  /** Mã 6 số quản lý sinh ở Office A4 cho đúng một bàn → token dài hạn của iPad */
  pair: (code: string, name: string) =>
    apiFetch<{ token: string; deviceId: number }>('/api/auth/pair', {
      method: 'POST',
      body: { code, name },
    }),

  terminal: () => apiFetch<TerminalState>('/api/table-terminal'),

  /**
   * T1 khách tự mở bàn. Không qua hàng đợi offline: mở bàn mà nằm chờ có mạng thì
   * khách ngồi trước một thực đơn không gọi được món — mất mạng thì nói thẳng.
   */
  openTable: (guestCount: number) =>
    apiFetch<TerminalState & { overCapacity: boolean }>('/api/table-terminal/open', {
      method: 'POST',
      body: { guestCount },
    }),

  config: (branchId: string) => apiFetch<ConfigBundle>(`/api/config?branch=${branchId}`),

  availability: (branchId: string) =>
    apiFetch<AvailabilityRow[]>(`/api/availability?branch=${branchId}`),

  /** Khuyến mãi đang chạy — công khai như thực đơn, chương trình cần mã không có ở đây */
  promotions: (branchId: string) =>
    apiFetch<LivePromotions>(`/api/crm/promotions/live?branch=${branchId}`),

  /**
   * Thực đơn công khai của trang web — chỉ để đọc phần kể chuyện của món cho nút
   * "Bí quyết thưởng thức". Giá và món gọi được vẫn lấy từ bundle cấu hình.
   */
  siteMenu: () => apiFetch<SiteMenu>('/api/site/menu'),

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
