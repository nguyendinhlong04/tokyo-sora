/**
 * Dựng vé bếp từ các dòng đơn — trái tim của việc đấu nối bếp.
 *
 * Quy tắc (TRIEN-KHAI §4 + kế hoạch §16, §22):
 *  1. Dòng SET là dòng chứa giá, KHÔNG xuống bếp; các dòng con đã nổ sẵn lúc tạo
 *     đơn (xem explode.ts) mới là thứ đi bếp.
 *  2. Một vé cho MỖI (trạm × đợt) — không phải một vé cho cả đơn.
 *  3. Món đa trạm sinh thêm item ở trạm phụ, hai item chung `linkGroup` để Expo
 *     biết chúng phải ra cùng lúc.
 *  4. Đợt chưa bấm "Ra đợt" ⇒ vé `waiting`, ĐỒNG HỒ CHƯA CHẠY (điểm dễ sai §9.5:
 *     đồng hồ tính từ lúc vé vào hàng, không phải từ lúc khách bấm đặt).
 *  5. Đơn online hẹn giờ có `startBy` = giờ hẹn − thời gian nấu − đệm đóng gói/giao,
 *     để KDS đếm NGƯỢC đến lúc phải bắt đầu (§22 — logic ngược với đơn tại bàn).
 *
 * Hàm thuần: không DB, không Nest, không đọc đồng hồ hệ thống (`now` truyền vào)
 * để test tất định.
 */
import {
  resolveRouting,
  type RoutingParams,
  type ServiceContext,
  DEFAULT_ROUTING_PARAMS,
  type DishRouting,
} from './routing'

export type TicketSource = 'pos' | 'table' | 'online'
export type OrderChannel = 'pos' | 'table' | 'web' | 'grab' | 'shopee' | 'be'

/** Dòng đơn đã lưu (set cha + con đã nổ), đầu vào cho việc dựng vé */
export interface OrderLineForTicket {
  lineId: string
  dishId: string
  /** Dòng set cha chỉ giữ giá, không xuống bếp */
  kind: 'dish' | 'set_parent'
  qty: number
  batchNo: number
  note?: string | null
  setLabel?: string | null
  portionLabel?: string | null
}

export interface DishInfo {
  name: string
  routing: DishRouting
}

export interface OrderForTicket {
  /** Phần số của mã hiển thị — VD '0412' của ON-2608-0412 */
  orderNumber: string
  channel: OrderChannel
  context: ServiceContext
  /** Khung giờ của đơn online — đơn `asap` cũng được gán một khung, xem `slotMode` */
  slotAt?: Date | null
  /**
   * `scheduled` = khách tự chọn giờ; `asap` = nhận sớm nhất có thể.
   *
   * Phải phân biệt, vì đơn `asap` VẪN mang `slotAt` (khung sớm nhất còn mở, cách
   * hiện tại đúng `online.leadMinutes`). Chỉ nhìn `slotAt` thì đơn "nhận ngay"
   * cũng bị giữ lại chờ tới giờ — đúng chữ nhưng sai việc.
   */
  slotMode?: 'asap' | 'scheduled' | null
}

export interface TicketingParams extends RoutingParams {
  /** Đệm đóng gói đơn mang về, giây */
  packBufferSeconds: number
  /** Đệm giao hàng, giây */
  deliveryBufferSeconds: number
}

export const DEFAULT_TICKETING_PARAMS: TicketingParams = {
  ...DEFAULT_ROUTING_PARAMS,
  packBufferSeconds: 5 * 60,
  deliveryBufferSeconds: 20 * 60,
}

export interface DraftTicketItem {
  orderLineId: string
  dishId: string
  name: string
  qty: number
  note: string | null
  /** Nhãn set để bếp biết các món thuộc cùng một set, ra cùng lúc */
  setLabel: string | null
  /** 'nồi' / 'khay thịt' — chỉ món đa trạm */
  componentLabel: string | null
  /** Định lượng in trên vé: '100g' */
  portionLabel: string | null
  /**
   * Các item cùng `linkGroup` thuộc cùng một món đa trạm, nằm ở hai vé khác trạm;
   * Expo chỉ báo sẵn sàng khi cả nhóm xong.
   */
  linkGroup: string | null
  /** Món này bếp nướng hộ vì bàn không có bếp / đơn mang về */
  grillService: boolean
}

export interface DraftTicket {
  displayCode: string
  station: string
  source: TicketSource
  tableCode: string | null
  batchNo: number
  /** `waiting` = đợt chưa ra, đồng hồ chưa chạy */
  state: 'waiting' | 'queued'
  /** Dòng giải thích in trên vé ST-06: 'Bàn 05 không có bếp' */
  grillServiceNote: string | null
  /** Thời gian chuẩn của vé = lâu nhất trong các món, giây */
  prepSeconds: number
  queuedAt: Date | null
  dueAt: Date | null
  /** Đơn hẹn giờ: mốc phải bắt đầu nấu; KDS đếm ngược tới đây */
  startBy: Date | null
  items: DraftTicketItem[]
}

export interface BuildTicketsInput {
  order: OrderForTicket
  lines: OrderLineForTicket[]
  /** Tra cứu món: tên + 4 nhánh trạm (đã áp ghi đè theo chi nhánh) */
  catalog: (dishId: string) => DishInfo | undefined
  /** Các đợt đã bấm "Ra đợt" — đợt ngoài danh sách này sinh vé `waiting` */
  firedBatches: ReadonlySet<number>
  /** Tiền tố mã vé theo trạm: ST-06 → 'A', ST-02 → 'B'… (prototype KDS) */
  stationPrefixes: Record<string, string>
  now: Date
  params?: TicketingParams
}

export class TicketingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TicketingError'
  }
}

function sourceOf(channel: OrderChannel): TicketSource {
  if (channel === 'pos') return 'pos'
  if (channel === 'table') return 'table'
  return 'online'
}

function addSeconds(at: Date, seconds: number): Date {
  return new Date(at.getTime() + seconds * 1000)
}

/** Đơn online dùng tiền tố 'O'; đơn tại bàn dùng tiền tố của trạm */
function ticketCode(
  source: TicketSource,
  station: string,
  orderNumber: string,
  prefixes: Record<string, string>,
): string {
  if (source === 'online') return `O-${orderNumber}`
  const prefix = prefixes[station]
  if (!prefix) throw new TicketingError(`Trạm ${station} chưa khai tiền tố mã vé`)
  return `${prefix}-${orderNumber}`
}

interface PendingItem {
  station: string
  batchNo: number
  item: DraftTicketItem
  prepSeconds: number
  grillServiceNote: string | null
}

export function buildTickets(input: BuildTicketsInput): DraftTicket[] {
  const { order, lines, catalog, firedBatches, stationPrefixes, now } = input
  const params = input.params ?? DEFAULT_TICKETING_PARAMS
  const source = sourceOf(order.channel)
  const tableCode = order.context.kind === 'dinein' ? order.context.tableCode : null

  const pending: PendingItem[] = []

  for (const line of lines) {
    // Dòng set chỉ giữ giá — món thành phần đã là dòng riêng
    if (line.kind === 'set_parent') continue

    const dish = catalog(line.dishId)
    if (!dish) throw new TicketingError(`Không tìm thấy món ${line.dishId} trong danh mục`)

    const routed = resolveRouting(dish.routing, order.context, params)
    const isMultiStation = routed.secondary !== null
    const linkGroup = isMultiStation ? line.lineId : null

    const base = {
      orderLineId: line.lineId,
      dishId: line.dishId,
      name: dish.name,
      qty: line.qty,
      note: line.note ?? null,
      setLabel: line.setLabel ?? null,
      portionLabel: line.portionLabel ?? null,
      linkGroup,
    }

    pending.push({
      station: routed.primary.station,
      batchNo: line.batchNo,
      prepSeconds: routed.primary.prepSeconds,
      grillServiceNote: routed.grillServiceNote,
      item: {
        ...base,
        componentLabel: routed.primary.componentLabel,
        grillService: routed.grillService,
      },
    })

    if (routed.secondary) {
      pending.push({
        station: routed.secondary.station,
        batchNo: line.batchNo,
        prepSeconds: routed.secondary.prepSeconds,
        grillServiceNote: null,
        item: {
          ...base,
          componentLabel: routed.secondary.componentLabel,
          grillService: false,
        },
      })
    }
  }

  // Gom theo (trạm × đợt) — một vé cho mỗi tổ hợp
  const groups = new Map<string, PendingItem[]>()
  for (const p of pending) {
    const key = `${p.station}#${p.batchNo}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(p)
    else groups.set(key, [p])
  }

  const tickets: DraftTicket[] = []
  for (const bucket of groups.values()) {
    const first = bucket[0]!
    const prepSeconds = Math.max(...bucket.map((p) => p.prepSeconds))
    const startBy = startByOf(order, prepSeconds, params)

    /**
     * Đơn HẸN GIỜ chưa tới mốc phải nấu thì CHƯA vào hàng, dù đợt đã ra.
     *
     * Đơn hẹn 19h30 mà xác nhận lúc 14h: fire ngay thì đồng hồ vé chạy từ 14h và
     * tới 15h nó đã đỏ như vé trễ một tiếng, trước cả khi ai đó chạm vào. Vé nằm
     * ở K4 "Chờ ra" đếm ngược tới `startBy`, rồi tự vào hàng đúng lúc — xem
     * `KitchenService.fireDueScheduledTickets`.
     *
     * CHỈ đơn `scheduled`. Đơn `asap` cũng có `startBy` (vì cũng được gán khung
     * giờ), nhưng khách bấm "nhận ngay" là muốn bếp làm ngay — giữ nó lại nửa
     * tiếng chờ khung là biến đơn nhanh thành đơn hẹn.
     */
    const notYetDue = order.slotMode === 'scheduled' && startBy !== null && startBy > now
    const fired = firedBatches.has(first.batchNo) && !notYetDue
    const queuedAt = fired ? now : null

    tickets.push({
      displayCode: ticketCode(source, first.station, order.orderNumber, stationPrefixes),
      station: first.station,
      source,
      tableCode,
      batchNo: first.batchNo,
      state: fired ? 'queued' : 'waiting',
      // Vé mang ít nhất một món nướng hộ thì in dòng giải thích cho đầu bếp
      grillServiceNote: bucket.find((p) => p.grillServiceNote)?.grillServiceNote ?? null,
      prepSeconds,
      queuedAt,
      dueAt: queuedAt ? addSeconds(queuedAt, prepSeconds) : null,
      startBy,
      items: bucket.map((p) => p.item),
    })
  }

  return tickets
}

/**
 * Mốc phải bắt đầu nấu cho đơn hẹn giờ:
 *   giờ hẹn − thời gian nấu − đệm đóng gói (mang về) hoặc đệm giao (giao hàng).
 * Đơn tại bàn và đơn "nhận ngay" không có mốc này.
 */
function startByOf(
  order: OrderForTicket,
  prepSeconds: number,
  params: TicketingParams,
): Date | null {
  if (!order.slotAt) return null
  const buffer =
    order.context.kind === 'delivery' ? params.deliveryBufferSeconds : params.packBufferSeconds
  return addSeconds(order.slotAt, -(prepSeconds + buffer))
}

/**
 * Bấm "Ra đợt tiếp": vé `waiting` của đợt đó vào hàng, ĐỒNG HỒ BẮT ĐẦU CHẠY từ đây.
 * Trả về vé đã cập nhật; vé không thuộc đợt giữ nguyên.
 */
export function fireBatch<T extends DraftTicket>(tickets: T[], batchNo: number, now: Date): T[] {
  return tickets.map((t) =>
    t.state === 'waiting' && t.batchNo === batchNo
      ? { ...t, state: 'queued' as const, queuedAt: now, dueAt: addSeconds(now, t.prepSeconds) }
      : t,
  )
}
