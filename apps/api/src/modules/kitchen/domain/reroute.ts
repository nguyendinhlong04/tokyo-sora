/**
 * Chuyển bàn khác loại → tính lại định tuyến.
 *
 * Quy tắc §16: "Chuyển bàn khác loại giữa chừng → POS bắt xác nhận định tuyến lại,
 * KHÔNG tự đổi im lặng." API trả 409 kèm diff này; POS hiện hộp xác nhận; gọi lại
 * có cờ xác nhận thì void vé cũ, phát vé mới, ghi nhật ký `routing.changed` (A7).
 *
 * Món ĐANG NẤU trở đi giữ nguyên trạm — không ai giật miếng thịt khỏi vỉ để chuyển
 * sang trạm khác. Chỉ món chưa động tới mới đổi được.
 */
import { resolveRouting, type DishRouting, type RoutingParams, type ServiceContext } from './routing'

export type LineState = 'draft' | 'queued' | 'cooking' | 'ready' | 'served' | 'voided'

export interface RerouteLine {
  lineId: string
  dishId: string
  name: string
  state: LineState
  /** Trạm đang gắn với dòng (đã phát vé) */
  currentStation: string | null
  routing: DishRouting
}

export interface RerouteChange {
  lineId: string
  dishId: string
  name: string
  from: string | null
  to: string
}

export interface RerouteStuck extends Omit<RerouteChange, 'to'> {
  /** Trạm lẽ ra phải chuyển sang nếu món chưa lên bếp */
  wouldBe: string
  reason: 'dang-nau'
}

export interface RerouteDiff {
  /** Dòng đổi được — void vé cũ, phát vé mới */
  moves: RerouteChange[]
  /** Dòng phải giữ nguyên trạm vì đã lên bếp */
  stuck: RerouteStuck[]
  /** Có gì cần người xác nhận không */
  requiresConfirmation: boolean
}

/** Món đã lên bếp thì không đổi trạm được nữa */
const LOCKED_STATES: ReadonlySet<LineState> = new Set(['cooking', 'ready', 'served'])

export function diffReroute(
  lines: RerouteLine[],
  to: ServiceContext,
  params?: RoutingParams,
): RerouteDiff {
  const moves: RerouteChange[] = []
  const stuck: RerouteStuck[] = []

  for (const line of lines) {
    if (line.state === 'voided') continue

    const target = resolveRouting(line.routing, to, params).primary.station
    if (target === line.currentStation) continue

    const base = { lineId: line.lineId, dishId: line.dishId, name: line.name }
    if (LOCKED_STATES.has(line.state)) {
      stuck.push({ ...base, from: line.currentStation, wouldBe: target, reason: 'dang-nau' })
    } else {
      moves.push({ ...base, from: line.currentStation, to: target })
    }
  }

  return { moves, stuck, requiresConfirmation: moves.length > 0 || stuck.length > 0 }
}
