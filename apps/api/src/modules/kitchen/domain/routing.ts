/**
 * Định tuyến món xuống trạm bếp — `Trạm đích = f(món, ngữ cảnh phục vụ)`.
 *
 * Hàm THUẦN: không DB, không Nest. Đây là logic rủi ro nhất của hệ thống nên
 * được tách riêng để test bằng đúng bảng phân loại đã chốt (kế hoạch §16).
 *
 * Mô hình: mỗi món khai 4 NHÁNH trạm — đúng như màn cấu hình M6 trong prototype
 * (`Sora Office.dc.html:1775`: Bàn có bếp nướng · Bàn không có bếp · Đơn mang về ·
 * Đơn giao hàng). Ba "phương thức" SỐNG/NƯỚNG/LINH HOẠT chỉ là preset điền sẵn 4
 * nhánh đó, không phải nhánh logic riêng — nhờ vậy thêm kiểu định tuyến mới sau
 * này chỉ là thêm preset, engine không đổi.
 *
 * Ghi chú về mâu thuẫn tài liệu đã giải: §16 ghi "SỐNG → ST-02" nghe như cố định,
 * nhưng T3 (§20) yêu cầu món SỐNG ở bàn không bếp hiện "Bếp nướng sẵn · thêm 8
 * phút", M6 khai riêng nhánh "Bàn không có bếp → ST-06", và vé bếp có dòng
 * "Bàn 12 không có bếp" (`Sora Kitchen.dc.html:505`). Kết luận: SỐNG cũng đổi trạm
 * theo loại bàn. Do đó preset `song` và `linh_hoat` cho ra cùng bộ 4 nhánh; khác
 * nhau ở NHÃN hiển thị cho khách, giữ riêng để M6 và copy khách vẫn đúng từ ngữ.
 */

/** Ngữ cảnh phục vụ — quyết định lấy nhánh nào */
export type ServiceContext =
  | { kind: 'dinein'; tableCode: string; tableHasGrill: boolean }
  | { kind: 'takeaway' }
  | { kind: 'delivery' }

export type RoutingMethod = 'fixed' | 'song' | 'nuong' | 'linh_hoat'

/** Bốn nhánh trạm của một món (sau khi đã áp ghi đè theo chi nhánh) */
export interface DishRouting {
  method: RoutingMethod
  /** Bàn CÓ bếp tại bàn */
  stationGrill: string
  /** Bàn KHÔNG có bếp — bếp nướng hộ */
  stationNoGrill: string
  /** Đơn mang về; bỏ trống ⇒ dùng nhánh không bếp */
  stationTakeaway?: string | null
  /** Đơn giao hàng; bỏ trống ⇒ dùng nhánh không bếp */
  stationDelivery?: string | null
  /** Món đa trạm (VD lẩu Sukiyaki: nồi ST-04 + khay thịt ST-02) */
  secondaryStation?: string | null
  primaryLabel?: string | null
  secondaryLabel?: string | null
  /** Thời gian chuẩn của nhánh chính, giây */
  prepSeconds: number
}

export interface RoutingPart {
  station: string
  /** Nhãn thành phần trên vé — chỉ có với món đa trạm ('nồi' / 'khay thịt') */
  componentLabel: string | null
  prepSeconds: number
}

export interface ResolvedRouting {
  primary: RoutingPart
  /** Vé thứ hai của món đa trạm; null nếu món một trạm */
  secondary: RoutingPart | null
  /**
   * true khi món vốn để khách tự nướng nhưng bếp phải nướng hộ (bàn không bếp,
   * mang về, giao hàng). Vé bếp hiện dòng giải thích; khách thấy nhãn
   * "Bếp nướng sẵn · thêm N phút". Nướng hộ KHÔNG phụ thu (§16).
   */
  grillService: boolean
  /** Dòng giải thích in trên vé ST-06, null nếu không phải nướng hộ tại bàn */
  grillServiceNote: string | null
}

export interface RoutingParams {
  /** Tham số A6 "Thêm khi bếp nướng sẵn" — mặc định 8 phút */
  grillServiceExtraSeconds: number
}

export const DEFAULT_ROUTING_PARAMS: RoutingParams = { grillServiceExtraSeconds: 8 * 60 }

/** Nhánh trạm ứng với ngữ cảnh, trước khi tính nướng hộ */
function branchStation(routing: DishRouting, ctx: ServiceContext): string {
  switch (ctx.kind) {
    case 'dinein':
      return ctx.tableHasGrill ? routing.stationGrill : routing.stationNoGrill
    case 'takeaway':
      return routing.stationTakeaway ?? routing.stationNoGrill
    case 'delivery':
      return routing.stationDelivery ?? routing.stationNoGrill
  }
}

/** Món tự nướng: nhánh không-bếp khác nhánh có-bếp ⇒ bếp phải nướng hộ */
function isSelfGrillDish(routing: DishRouting): boolean {
  return routing.method === 'song' || routing.method === 'linh_hoat'
}

export function resolveRouting(
  routing: DishRouting,
  ctx: ServiceContext,
  params: RoutingParams = DEFAULT_ROUTING_PARAMS,
): ResolvedRouting {
  const station = branchStation(routing, ctx)
  const grillService = isSelfGrillDish(routing) && station !== routing.stationGrill

  const prepSeconds = grillService
    ? routing.prepSeconds + params.grillServiceExtraSeconds
    : routing.prepSeconds

  const grillServiceNote =
    grillService && ctx.kind === 'dinein' ? `Bàn ${ctx.tableCode} không có bếp` : null

  const primary: RoutingPart = {
    station,
    componentLabel: routing.secondaryStation ? (routing.primaryLabel ?? null) : null,
    prepSeconds,
  }

  const secondary: RoutingPart | null = routing.secondaryStation
    ? {
        station: routing.secondaryStation,
        componentLabel: routing.secondaryLabel ?? null,
        prepSeconds: routing.prepSeconds,
      }
    : null

  return { primary, secondary, grillService, grillServiceNote }
}

/** Mọi trạm mà một món có thể rơi vào — dùng cho M6 "xem trước định tuyến" */
export function possibleStations(routing: DishRouting): string[] {
  const all = [
    routing.stationGrill,
    routing.stationNoGrill,
    routing.stationTakeaway ?? routing.stationNoGrill,
    routing.stationDelivery ?? routing.stationNoGrill,
    routing.secondaryStation,
  ].filter((s): s is string => Boolean(s))
  return [...new Set(all)]
}

/** Mã trạm chuẩn (seed) — engine vẫn coi station là chuỗi mở đọc từ bảng `stations` */
export const ST = {
  COLD: 'ST-01',
  RAW: 'ST-02',
  HOT1: 'ST-03',
  HOT2: 'ST-04',
  BAR: 'ST-05',
  GRILL: 'ST-06',
} as const

/**
 * Preset điền 4 nhánh theo phương thức đã chốt §16.
 * `fixed` cần truyền `station`; ba preset còn lại tự suy ra ST-02/ST-06.
 */
export function presetRouting(
  method: RoutingMethod,
  opts: { station?: string; prepSeconds: number },
): Omit<DishRouting, 'secondaryStation' | 'primaryLabel' | 'secondaryLabel'> {
  const { prepSeconds } = opts
  switch (method) {
    case 'fixed': {
      const station = opts.station
      if (!station) throw new Error('preset "fixed" cần chỉ định station')
      return {
        method,
        stationGrill: station,
        stationNoGrill: station,
        stationTakeaway: station,
        stationDelivery: station,
        prepSeconds,
      }
    }
    case 'song':
    case 'linh_hoat':
      return {
        method,
        stationGrill: ST.RAW,
        stationNoGrill: ST.GRILL,
        stationTakeaway: ST.GRILL,
        stationDelivery: ST.GRILL,
        prepSeconds,
      }
    case 'nuong':
      return {
        method,
        stationGrill: ST.GRILL,
        stationNoGrill: ST.GRILL,
        stationTakeaway: ST.GRILL,
        stationDelivery: ST.GRILL,
        prepSeconds,
      }
  }
}
