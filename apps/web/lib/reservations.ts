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
