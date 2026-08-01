/**
 * Fixture chép nguyên bảng phân loại 27 món nướng ĐÃ CHỐT — kế hoạch thiết kế §16.
 * Đây là "bản gốc" để test định tuyến; sửa fixture này chỉ khi tài liệu §16 đổi.
 */
import { ST, presetRouting, type DishRouting, type RoutingMethod } from '../routing'

export interface FixtureDish {
  id: string
  name: string
  method: RoutingMethod
  /** Trạm cố định (chỉ với method 'fixed') */
  station?: string
  prepSeconds: number
}

/** SỐNG → mặc định ST-02 (16 món): 12 bò sau tách + 4 heo */
export const SONG_DISHES: FixtureDish[] = [
  { id: 'luoibo', name: 'Lưỡi bò', method: 'song', prepSeconds: 180 },
  { id: 'cuongtim', name: 'Cuống tim bò', method: 'song', prepSeconds: 180 },
  { id: 'diemthan', name: 'Diềm thăn bò', method: 'song', prepSeconds: 180 },
  { id: 'desuon', name: 'Dẻ sườn bò', method: 'song', prepSeconds: 180 },
  { id: 'gaubo', name: 'Gầu bò', method: 'song', prepSeconds: 180 },
  { id: 'thanbo', name: 'Thăn bò', method: 'song', prepSeconds: 180 },
  { id: 'bachibo', name: 'Ba chỉ bò', method: 'song', prepSeconds: 180 },
  { id: 'bachicuonnam', name: 'Ba chỉ bò cuộn nấm', method: 'song', prepSeconds: 180 },
  { id: 'nambo', name: 'Nầm bò', method: 'song', prepSeconds: 180 },
  { id: 'longbo', name: 'Lòng bò', method: 'song', prepSeconds: 180 },
  { id: 'ganbo', name: 'Gan bò', method: 'song', prepSeconds: 180 },
  { id: 'xienbo', name: 'Xiên bò', method: 'song', prepSeconds: 180 },
  { id: 'maheo', name: 'Má heo', method: 'song', prepSeconds: 180 },
  { id: 'bachiheo', name: 'Ba chỉ heo', method: 'song', prepSeconds: 180 },
  { id: 'namheo', name: 'Nầm heo', method: 'song', prepSeconds: 180 },
  // Xiên heo chuyển sang SỐNG vì đã tẩm sẵn, khách nướng được (ghi chú § 16)
  { id: 'xienheo', name: 'Xiên heo', method: 'song', prepSeconds: 180 },
]

/** NƯỚNG → luôn ST-06 (6 món) — bếp nướng, ra chín */
export const NUONG_DISHES: FixtureDish[] = [
  { id: 'yakitori', name: 'Xiên gà Yakitori', method: 'nuong', prepSeconds: 720 },
  { id: 'canhga', name: 'Cánh gà Teriyaki', method: 'nuong', prepSeconds: 720 },
  { id: 'mega', name: 'Mề gà nướng', method: 'nuong', prepSeconds: 720 },
  { id: 'hau', name: 'Hàu nướng', method: 'nuong', prepSeconds: 600 },
  { id: 'sodiep', name: 'Sò điệp Hokkaido', method: 'nuong', prepSeconds: 600 },
  { id: 'somai', name: 'Sò mai', method: 'nuong', prepSeconds: 600 },
]

/** LINH HOẠT (5 món) — bàn có bếp → ST-02, không bếp → ST-06 */
export const LINH_HOAT_DISHES: FixtureDish[] = [
  { id: 'tomsu', name: 'Tôm sú', method: 'linh_hoat', prepSeconds: 180 },
  { id: 'muctrung', name: 'Mực trứng', method: 'linh_hoat', prepSeconds: 180 },
  { id: 'namdui', name: 'Nấm đùi gà', method: 'linh_hoat', prepSeconds: 180 },
  { id: 'mangtay', name: 'Măng tây', method: 'linh_hoat', prepSeconds: 180 },
  { id: 'otchuong', name: 'Ớt chuông', method: 'linh_hoat', prepSeconds: 180 },
]

/** Món không nướng — trạm cố định bất kể loại bàn */
export const FIXED_DISHES: FixtureDish[] = [
  { id: 'sashimi', name: 'Sashimi cá hồi', method: 'fixed', station: ST.COLD, prepSeconds: 270 },
  { id: 'duamuoi', name: 'Dưa muối ba vị', method: 'fixed', station: ST.COLD, prepSeconds: 180 },
  { id: 'karaage', name: 'Gà chiên Karaage', method: 'fixed', station: ST.HOT1, prepSeconds: 600 },
  { id: 'milanh', name: 'Mì lạnh', method: 'fixed', station: ST.HOT2, prepSeconds: 420 },
  { id: 'biatuoi', name: 'Bia tươi Asahi', method: 'fixed', station: ST.BAR, prepSeconds: 60 },
]

export const ALL_GRILL_DISHES = [...SONG_DISHES, ...NUONG_DISHES, ...LINH_HOAT_DISHES]

export function routingOf(dish: FixtureDish): DishRouting {
  return presetRouting(dish.method, { station: dish.station, prepSeconds: dish.prepSeconds })
}

/** Lẩu Sukiyaki — món ĐA TRẠM: nồi ở ST-04, khay thịt sống ở ST-02 (§16) */
export const SUKIYAKI: DishRouting = {
  method: 'fixed',
  stationGrill: ST.HOT2,
  stationNoGrill: ST.HOT2,
  stationTakeaway: ST.HOT2,
  stationDelivery: ST.HOT2,
  secondaryStation: ST.RAW,
  primaryLabel: 'nồi',
  secondaryLabel: 'khay thịt',
  prepSeconds: 600,
}
