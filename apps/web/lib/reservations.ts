import { apiGet, apiPost } from './api'
import type { SeatKindId } from '../content/site'

export interface AvailabilitySlot {
  /** Phút kể từ đầu ngày làm việc — khoá định danh của một khung */
  minute: number
  label: string
  at: string
  open: boolean
  closedReason: 'full' | 'too-soon' | 'past' | null
}

export interface Availability {
  branchId: string
  businessDate: string
  seatKind: SeatKindId
  guestCount: number
  /** Số chỗ đúng kiểu và đủ sức chứa cho nhóm này */
  capacity: number
  holdMinutes: number
  tableHoldMinutes: number
  autoConfirm: boolean
  /** Tiền cọc của kiểu chỗ đang chọn — 0 là không thu (R3) */
  depositVnd: number
  /** Ngày quán không nhận đặt, kèm lý do (R3) */
  blocked: { reason: string } | null
  slots: AvailabilitySlot[]
}

export interface Hold {
  token: string
  expiresAt: string
  holdSeconds: number
  slotAt: string
}

export interface Reservation {
  displayCode: string
  status: 'pending' | 'confirmed'
  slotAt: string
  businessDate: string
  /** Chìa mở lại suất — nằm trong liên kết nhắc hẹn của R4 */
  guestToken: string
  /** Khác 0 thì suất chờ nhà hàng gọi thu cọc (R3) */
  depositVnd: number
  tableHoldMinutes: number
}

export interface MyReservation {
  displayCode: string
  branchName: string
  branchAddress: string | null
  branchPhone: string | null
  seatKind: SeatKindId
  guestCount: number
  customerName: string
  slotAt: string
  status: 'pending' | 'confirmed' | 'seated' | 'done' | 'cancelled' | 'no_show'
  note: string | null
  guestConfirmedAt: string | null
  tableHoldMinutes: number
}

export interface SlotRef {
  branchId: string
  date: string
  guestCount: number
  seatKind: SeatKindId
  minute: number
}

export function fetchAvailability(query: Omit<SlotRef, 'minute'>): Promise<Availability> {
  const params = new URLSearchParams({
    branch: query.branchId,
    date: query.date,
    guests: String(query.guestCount),
    seat: query.seatKind,
  })
  return apiGet<Availability>(`/api/reservations/availability?${params}`)
}

export function createHold(ref: SlotRef): Promise<Hold> {
  return apiPost<Hold>('/api/reservations/holds', ref)
}

/** Nhả suất khi khách quay lại — dùng `keepalive` để còn kịp gửi lúc rời trang */
export function releaseHold(token: string): void {
  void fetch(`/api/reservations/holds/${token}`, { method: 'DELETE', keepalive: true }).catch(
    () => undefined,
  )
}

export function confirmReservation(
  input: SlotRef & { name: string; phone: string; note?: string; holdToken?: string },
): Promise<Reservation> {
  return apiPost<Reservation>('/api/reservations', input)
}

/** Suất của chính khách, mở bằng chìa trong liên kết nhắc hẹn (R4) */
export function fetchMyReservation(token: string): Promise<MyReservation> {
  return apiGet<MyReservation>(`/api/reservations/track/${encodeURIComponent(token)}`)
}

/** Một chạm xác nhận lại — đổ thẳng về hàng đợi nhắc của R4 */
export function reconfirmReservation(token: string): Promise<MyReservation> {
  return apiPost<MyReservation>(`/api/reservations/track/${encodeURIComponent(token)}/confirm`, {})
}
