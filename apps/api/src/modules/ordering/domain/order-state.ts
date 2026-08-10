/**
 * Máy trạng thái đơn hàng — TRIEN-KHAI §3.
 *
 *   new → confirmed → cooking → ready → delivering → done
 *                                          ↘ (tại bàn / mang về bỏ qua delivering)
 *   new, confirmed → cancelled
 *
 * Hai quyết định đã cân nhắc:
 *
 * 1. **Huỷ chỉ từ `new` và `confirmed`.** Sơ đồ trong tài liệu vẽ mũi tên huỷ từ mọi
 *    trạng thái, nhưng phần chữ ngay dưới ghi rõ: "không cho huỷ khi đã `cooking`
 *    trở đi — POS hiện hộp 'Không thể huỷ, món đã lên bếp'". Chọn theo phần chữ vì
 *    nó cụ thể hơn và khớp PHẦN G.4 ("huỷ sau thanh toán bị chặn — chỉ có luồng
 *    hoàn tiền có duyệt + bút toán ngược"). Sự cố sau khi lên bếp đi đường hoàn
 *    tiền, không đi đường huỷ.
 *
 * 2. **Chuyển trạng thái trùng = thành công, không đổi gì** (`changed: false`).
 *    Đây là điều kiện để hàng đợi offline của POS/KDS gửi lại mù mà không sinh
 *    hiệu ứng phụ — cùng với `Idempotency-Key` ở tầng HTTP.
 *
 * Hàm thuần: không DB, không Nest.
 */

export const ORDER_STATUSES = [
  'new',
  'confirmed',
  'cooking',
  'ready',
  'delivering',
  'done',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type OrderType = 'dinein' | 'takeaway' | 'delivery'

/** Vai trò theo ma trận §4.2; `CUSTOMER` là khách (R0 tại bàn hoặc khách online) */
export type ActorRole =
  | 'CUSTOMER'
  | 'R1'
  | 'R2'
  | 'R3'
  | 'R4'
  | 'R5'
  | 'R6'
  | 'R7'
  | 'R8'
  | 'R9'
  | 'R10'
  | 'R11'
  | 'R12'
  | 'R13'

interface TransitionRule {
  to: OrderStatus
  /** Ai được phép bấm (§4.2) */
  roles: readonly ActorRole[]
  /** Chỉ áp dụng cho các loại đơn này; bỏ trống = mọi loại */
  orderTypes?: readonly OrderType[]
}

/** Nhận/xác nhận đơn: thu ngân · quản lý ca · điều phối · chủ */
const CONFIRM_ROLES = ['R2', 'R7', 'R12', 'R10'] as const
/** Đổi trạng thái món trên KDS: bếp · bếp trưởng · quản lý ca · chủ */
const KITCHEN_ROLES = ['R4', 'R5', 'R7', 'R10'] as const
/** Giao vận & chốt đơn: thu ngân · quản lý ca · điều phối · chủ */
const DISPATCH_ROLES = ['R2', 'R7', 'R12', 'R10'] as const

const TRANSITIONS: Record<OrderStatus, readonly TransitionRule[]> = {
  new: [
    { to: 'confirmed', roles: CONFIRM_ROLES },
    // Khách được huỷ khi món chưa lên bếp
    { to: 'cancelled', roles: [...DISPATCH_ROLES, 'CUSTOMER'] },
  ],
  confirmed: [
    { to: 'cooking', roles: KITCHEN_ROLES },
    { to: 'cancelled', roles: [...DISPATCH_ROLES, 'CUSTOMER'] },
  ],
  cooking: [{ to: 'ready', roles: KITCHEN_ROLES }],
  ready: [
    { to: 'delivering', roles: DISPATCH_ROLES, orderTypes: ['delivery'] },
    // Tại bàn và mang về không có bước giao — ra món/khách nhận là xong
    { to: 'done', roles: [...DISPATCH_ROLES, 'R1'], orderTypes: ['dinein', 'takeaway'] },
  ],
  delivering: [{ to: 'done', roles: DISPATCH_ROLES }],
  done: [],
  cancelled: [],
}

export interface TransitionContext {
  orderType: OrderType
  roles: readonly ActorRole[]
}

export type TransitionFailure =
  | 'cancel-locked'
  | 'invalid-transition'
  | 'not-applicable'
  | 'forbidden'
  | 'terminal'

export type TransitionResult =
  | { ok: true; changed: boolean; status: OrderStatus }
  | { ok: false; code: TransitionFailure; message: string }

/** Trạng thái đã lên bếp — không huỷ được nữa */
const COOKING_ONWARDS: ReadonlySet<OrderStatus> = new Set([
  'cooking',
  'ready',
  'delivering',
  'done',
])

export function isTerminal(status: OrderStatus): boolean {
  return status === 'done' || status === 'cancelled'
}

export function applyTransition(
  from: OrderStatus,
  to: OrderStatus,
  ctx: TransitionContext,
): TransitionResult {
  // Gửi lại lệnh cũ (replay hàng đợi offline) — thành công, không đổi gì
  if (from === to) return { ok: true, changed: false, status: from }

  if (to === 'cancelled' && COOKING_ONWARDS.has(from)) {
    return {
      ok: false,
      code: 'cancel-locked',
      message: 'Không thể huỷ, món đã lên bếp',
    }
  }

  if (isTerminal(from)) {
    return {
      ok: false,
      code: 'terminal',
      message: `Đơn đã ${from === 'done' ? 'hoàn tất' : 'huỷ'}, không đổi trạng thái được nữa`,
    }
  }

  const rule = TRANSITIONS[from].find((r) => r.to === to)
  if (!rule) {
    return {
      ok: false,
      code: 'invalid-transition',
      message: `Không đi thẳng từ "${from}" sang "${to}" được`,
    }
  }

  if (rule.orderTypes && !rule.orderTypes.includes(ctx.orderType)) {
    return {
      ok: false,
      code: 'not-applicable',
      message: `Bước "${to}" không áp dụng cho đơn ${ctx.orderType}`,
    }
  }

  if (!ctx.roles.some((role) => rule.roles.includes(role))) {
    return {
      ok: false,
      code: 'forbidden',
      message: `Vai trò hiện tại không được phép chuyển đơn sang "${to}"`,
    }
  }

  return { ok: true, changed: true, status: to }
}

/** Các bước hợp lệ tiếp theo — dùng để POS/UI chỉ hiện nút bấm được */
export function nextStatuses(from: OrderStatus, ctx: TransitionContext): OrderStatus[] {
  return TRANSITIONS[from]
    .filter((r) => applyTransition(from, r.to, ctx).ok)
    .map((r) => r.to)
}

export type TicketRollupState = 'waiting' | 'queued' | 'cooking' | 'ready' | 'closed' | 'voided'

/**
 * Suy trạng thái đơn từ trạng thái các vé bếp — bếp bấm nút là đơn tự đổi bước,
 * không cần POS thao tác thêm (TRIEN-KHAI §3: cooking do K2, ready do K4/K6).
 *
 * - Có vé bắt đầu nấu ⇒ đơn `cooking`
 * - Mọi vé còn sống đều xong ⇒ đơn `ready`
 * Không bao giờ kéo lùi trạng thái đơn.
 */
export function deriveStatusFromTickets(
  current: OrderStatus,
  ticketStates: readonly TicketRollupState[],
): OrderStatus {
  if (current !== 'confirmed' && current !== 'cooking') return current

  const live = ticketStates.filter((s) => s !== 'voided')
  if (live.length === 0) return current

  const allDone = live.every((s) => s === 'ready' || s === 'closed')
  if (allDone) return 'ready'

  const anyStarted = live.some((s) => s === 'cooking' || s === 'ready' || s === 'closed')
  return anyStarted ? 'cooking' : current
}

export type LineState = 'draft' | 'queued' | 'cooking' | 'ready' | 'served' | 'voided'

/**
 * Suy trạng thái DÒNG SET CHA từ các món thành phần của nó.
 *
 * Dòng set cha chỉ giữ giá, không xuống bếp, nên nó không nằm trong vé nào —
 * `syncOrderLines` kéo trạng thái từ vé về dòng món sẽ không bao giờ chạm tới nó.
 * Thiếu mắt xích này thì set đứng nguyên ở "Bếp đã nhận" tới hết bữa: đo trên bản
 * chạy thật ngày 10-08-2026, một Set Kiwami có đủ 16/16 món con `served` mà dòng
 * cha vẫn `queued`, và màn "Đơn của bàn" của khách chỉ đọc dòng cha.
 *
 * Mốc "đang làm" lấy theo món ĐẦU TIÊN động đậy, không phải món chậm nhất — khác
 * hẳn cách suy của một dòng món đa trạm. Set là bữa ăn nhiều chặng kéo dài cả
 * tiếng: lấy mức chậm nhất thì khách đã ăn xong chặng thứ năm mà màn hình vẫn báo
 * "Bếp đã nhận", vì chặng tráng miệng chưa ai đụng tới.
 *
 * Trả `null` khi không có gì để nói: set chưa nổ ra món con nào.
 */
export function deriveSetParentState(children: readonly LineState[]): LineState | null {
  if (children.length === 0) return null

  const live = children.filter((s) => s !== 'voided')
  // Huỷ sạch món thành phần thì cái set không còn là món đang bán nữa
  if (live.length === 0) return 'voided'

  if (live.every((s) => s === 'draft')) return 'draft'
  if (live.every((s) => s === 'served')) return 'served'
  if (live.every((s) => s === 'ready' || s === 'served')) return 'ready'
  if (live.some((s) => s === 'cooking' || s === 'ready' || s === 'served')) return 'cooking'
  return 'queued'
}
