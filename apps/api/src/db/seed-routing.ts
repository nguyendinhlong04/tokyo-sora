/**
 * Suy 4 nhánh trạm cho từng món của bộ dữ liệu prototype.
 *
 * Prototype chỉ có ~35 món và bản đồ trạm của nó KHÔNG phủ đúng bảng §16 (ví dụ
 * tôm/mực/nấm đùi gà là LINH HOẠT theo tài liệu nhưng prototype chỉ liệt ở ST-06).
 * Tài liệu là nguồn sự thật của QUY TẮC nghiệp vụ, prototype là nguồn của DỮ LIỆU.
 * Nên ở đây: lấy dữ liệu từ prototype, áp phân loại theo §16 bằng một bảng nhỏ,
 * viết rõ ra để người đọc kiểm được — thay vì suy đoán ngầm trong vòng lặp.
 *
 * 42 món còn thiếu so với thực đơn chốt (78 + 26 đồ uống) sẽ nhập qua Office M1
 * ở GĐ5; lúc đó bảng này không còn cần nữa.
 */
import { ST, presetRouting, type DishRouting, type RoutingMethod } from '../modules/kitchen/domain/routing'

/** Thời gian chuẩn theo trạm — lấy giữa khoảng §16 */
export const PREP_SECONDS_BY_STATION: Record<string, number> = {
  [ST.COLD]: 270, // 3–6 phút
  [ST.RAW]: 180, // 2–5 phút
  [ST.HOT1]: 600, // 6–14 phút
  [ST.HOT2]: 510, // 5–12 phút
  [ST.BAR]: 150, // 1–4 phút
  [ST.GRILL]: 720, // 8–16 phút
}

/**
 * Phân loại theo §16 cho các món nướng có trong prototype.
 * `song` = khách tự nướng (ST-02), bàn không bếp thì bếp nướng hộ (ST-06).
 * `nuong` = bếp luôn nướng, ra chín.
 * `linh_hoat` = bàn có bếp thì ra sống, không thì bếp nướng.
 */
const GRILL_METHOD: Record<string, RoutingMethod> = {
  // SỐNG — thịt cắt lát, cân theo gram ở ST-02
  bachi: 'song',
  nambo: 'song',
  thanbo: 'song',
  carbi: 'song',
  misuji: 'song',
  sagari: 'song',
  bachiheo: 'song',
  // NƯỚNG — đã tẩm ướp hoặc hải sản có vỏ, bếp nướng ra chín
  suonheo: 'nuong',
  sodiep: 'nuong',
  // LINH HOẠT — §16 liệt tôm · mực · nấm đùi gà · măng tây · ớt chuông
  tomsu: 'linh_hoat',
  muctrung: 'linh_hoat',
  namdui: 'linh_hoat',
  bingoi: 'linh_hoat',
}

/** Món đa trạm §16: lẩu Sukiyaki = nồi (ST-04) + khay thịt sống (ST-02) */
const MULTI_STATION: Record<string, { secondary: string; primaryLabel: string; secondaryLabel: string }> = {
  sukiyaki: { secondary: ST.RAW, primaryLabel: 'nồi', secondaryLabel: 'khay thịt' },
}

/** Nhóm menu → trạm cố định, cho các món không thuộc bảng nướng */
const GROUP_STATION: Record<string, string> = {
  tuoi: ST.COLD,
  ngot: ST.COLD,
  chien: ST.HOT1,
  lau: ST.HOT2,
  sup: ST.HOT2,
  bia: ST.BAR,
  ruou: ST.BAR,
  tra: ST.BAR,
}

export interface SeedDish {
  id: string
  group: string | null
  stationsFromKitchen: string[]
}

/** Trả về định tuyến đầy đủ, hoặc null nếu không xác định được (seeder sẽ báo lỗi) */
export function routingForSeedDish(dish: SeedDish): DishRouting | null {
  const method = GRILL_METHOD[dish.id]
  if (method) {
    const base = presetRouting(method, {
      // Món tự nướng tính theo nhánh ST-02; món NƯỚNG tính theo ST-06
      prepSeconds:
        method === 'nuong' ? PREP_SECONDS_BY_STATION[ST.GRILL]! : PREP_SECONDS_BY_STATION[ST.RAW]!,
    })
    return withMultiStation(dish.id, base)
  }

  const fixedStation =
    (dish.group ? GROUP_STATION[dish.group] : undefined) ?? dish.stationsFromKitchen[0]
  if (!fixedStation) return null

  const base = presetRouting('fixed', {
    station: fixedStation,
    prepSeconds: PREP_SECONDS_BY_STATION[fixedStation] ?? 300,
  })
  return withMultiStation(dish.id, base)
}

function withMultiStation(dishId: string, base: Omit<DishRouting, 'secondaryStation' | 'primaryLabel' | 'secondaryLabel'>): DishRouting {
  const multi = MULTI_STATION[dishId]
  if (!multi) return base
  return {
    ...base,
    secondaryStation: multi.secondary,
    primaryLabel: multi.primaryLabel,
    secondaryLabel: multi.secondaryLabel,
  }
}
