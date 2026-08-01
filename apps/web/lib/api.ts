/**
 * Gọi API Sora từ Sora Web.
 *
 * Trên trình duyệt: đường dẫn tương đối `/api/...` — cùng origin, đi qua rewrite
 * của Next. Trên máy chủ Next (server component): phải là địa chỉ tuyệt đối vì
 * `fetch` của Node không có khái niệm "trang hiện tại".
 */
const SERVER_ORIGIN = process.env.SORA_API_URL ?? 'http://localhost:3000'

export function apiUrl(path: string): string {
  return typeof window === 'undefined' ? `${SERVER_ORIGIN}${path}` : path
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), { cache: 'no-store', ...init })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as T
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as T
}

async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as {
    code?: string
    message?: string
  } | null
  return new ApiError(res.status, body?.code ?? null, body?.message ?? `Lỗi ${res.status}`)
}

// ------------------------------------------------------------------ Kiểu

export interface Branch {
  id: string
  name: string
  address: string | null
  phone: string | null
  openHours: { raw?: string } | null
}

export interface OnlineDish {
  id: string
  categoryId: string | null
  subCategory: string | null
  nameVi: string
  nameJa: string | null
  kana: string | null
  shortDesc: string | null
  allergens: string[] | null
  tags: string[] | null
  price: number
  soldOut: boolean
  /** Món rời vỉ than là nguội — O3 nhắc chọn khung giờ gần nhất */
  bestWithin30: boolean
}

export interface OnlineMenu {
  branch: Branch
  categories: { id: string; nameVi: string; kanji: string | null }[]
  dishes: OnlineDish[]
}

export interface DeliveryZone {
  id: number
  name: string
  wards: string[]
  feeVnd: number
  minOrderVnd: number
  etaMinutes: number
}

export type Quote =
  | { inZone: true; zone: { id: number; name: string }; feeVnd: number; minOrderVnd: number; etaMinutes: number }
  | { inZone: false; zones: { name: string; wards: string[] }[] }

export interface Slot {
  at: string
  taken: number
  capacity: number
  open: boolean
  closedReason: 'full' | 'too-soon' | null
}

export interface CreatedOrder {
  id: number
  displayCode: string
  trackToken: string
  slotAt: string
  etaMinutes: number
  money: { sub: number; ship: number; vat: number; total: number }
}

export interface TrackedOrder {
  displayCode: string
  status: 'new' | 'confirmed' | 'cooking' | 'ready' | 'delivering' | 'done' | 'cancelled'
  type: 'takeaway' | 'delivery'
  paymentState: 'unpaid' | 'partial' | 'paid' | 'refunded'
  slotMode: 'asap' | 'scheduled' | null
  slotAt: string | null
  etaMinutes: number
  money: { sub: number; vat: number; ship: number; total: number }
  lines: { nameSnapshot: string; qty: number; priceTotal: number; state: string }[]
  cancelReason: string | null
}

export interface PaymentTicket {
  id: number
  amount: number
  vaNumber: string
  qrString: string
  expiresAt: string
}
