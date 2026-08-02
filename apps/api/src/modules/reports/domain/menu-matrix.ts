/**
 * B3 — ma trận Ngôi sao / Bò sữa / Câu đố / Bỏ đi.
 *
 * Phương pháp Kasavana–Smith: xếp mỗi món theo HAI trục độc lập rồi chia bốn ô.
 *  · Trục ngang — độ phổ biến: tỉ trọng số lượng bán của món so với ngưỡng
 *    `70% / số món`. Chia đều thì mỗi món chiếm 1/N; lấy 70% của mức đó làm vạch
 *    để một thực đơn dài không biến gần như mọi món thành "kém phổ biến".
 *  · Trục dọc — đóng góp mỗi phần, so với đóng góp bình quân của cả thực đơn
 *    (bình quân có trọng số theo số lượng, không phải trung bình cộng các món:
 *    món bán 300 phần phải kéo vạch mạnh hơn món bán 3 phần).
 *
 * HÀM NÀY KHÔNG BIẾT ĐÓNG GÓP ĐƯỢC TÍNH THẾ NÀO. Nơi gọi truyền `contribution`
 * vào. Hôm nay chưa có công thức (M4) và chưa có giá vốn bình quân từ kho (S2/S11)
 * nên tầng dịch vụ truyền DOANH THU — tức là coi giá vốn bằng 0. Xếp hạng theo
 * trục dọc vì thế đang là "món đắt tiền hơn", chưa phải "món lãi hơn": món nướng
 * giá cao mà giá vốn cũng cao sẽ nằm nhầm ô. Khi S2/M4 xong thì đổi đúng một chỗ
 * ở `ReportsService.menuMatrix`, hàm này không phải sửa.
 */

/** Ô của ma trận, đặt tên theo bảng §25 */
export type Quadrant = 'ngoi-sao' | 'bo-sua' | 'cau-do' | 'bo-di'

export interface MenuItemStat {
  dishId: string
  code: string
  name: string
  qty: number
  revenue: number
  /** Tổng đóng góp của món trong kỳ (đơn vị VND) */
  contribution: number
}

export interface MenuMatrixRow extends MenuItemStat {
  /** Tỉ trọng số lượng trong tổng số phần bán ra */
  qtyShare: number
  /** Đóng góp bình quân một phần */
  unitContribution: number
  popular: boolean
  profitable: boolean
  quadrant: Quadrant
}

export interface MenuMatrix {
  rows: MenuMatrixRow[]
  totals: { dishes: number; qty: number; revenue: number; contribution: number }
  /** Vạch phổ biến — tỉ trọng số lượng phải đạt mức này mới tính là bán chạy */
  popularityCut: number
  /** Vạch đóng góp — VND mỗi phần */
  contributionCut: number
}

/** Hệ số 70% của Kasavana–Smith; để tham số hoá được vì bếp có thể muốn siết hơn */
export const DEFAULT_POPULARITY_FACTOR = 0.7

export function classifyMenu(
  items: readonly MenuItemStat[],
  popularityFactor = DEFAULT_POPULARITY_FACTOR,
): MenuMatrix {
  const qty = items.reduce((sum, i) => sum + i.qty, 0)
  const revenue = items.reduce((sum, i) => sum + i.revenue, 0)
  const contribution = items.reduce((sum, i) => sum + i.contribution, 0)

  const popularityCut = items.length === 0 ? 0 : popularityFactor / items.length
  const contributionCut = qty === 0 ? 0 : contribution / qty

  const rows = items.map((item) => {
    const qtyShare = qty === 0 ? 0 : item.qty / qty
    const unitContribution = item.qty === 0 ? 0 : item.contribution / item.qty
    // `>=` ở cả hai trục: thực đơn mà mọi món bán bằng nhau thì tất cả là ngôi sao,
    // đúng hơn là tất cả bị đẩy xuống "bỏ đi" vì không ai vượt được vạch.
    const popular = qtyShare >= popularityCut
    const profitable = unitContribution >= contributionCut
    return {
      ...item,
      qtyShare,
      unitContribution,
      popular,
      profitable,
      quadrant: quadrantOf(popular, profitable),
    }
  })

  // Ngôi sao trước, trong mỗi ô thì món bán nhiều đứng trên
  rows.sort((a, b) => QUADRANT_ORDER[a.quadrant] - QUADRANT_ORDER[b.quadrant] || b.qty - a.qty)

  return {
    rows,
    totals: { dishes: items.length, qty, revenue, contribution },
    popularityCut,
    contributionCut,
  }
}

function quadrantOf(popular: boolean, profitable: boolean): Quadrant {
  if (popular) return profitable ? 'ngoi-sao' : 'bo-sua'
  return profitable ? 'cau-do' : 'bo-di'
}

const QUADRANT_ORDER: Record<Quadrant, number> = {
  'ngoi-sao': 0,
  'bo-sua': 1,
  'cau-do': 2,
  'bo-di': 3,
}

/**
 * Món đã dịch chuyển giữa hai kỳ — "trục thời gian xem món dịch chuyển giữa các
 * ô qua các kỳ" (§25 B3). Món mới xuất hiện trong kỳ này trả `null` chứ không trả
 * 'bo-di': chưa từng bán không giống với bán mà ế.
 */
export function quadrantShift(
  current: MenuMatrix,
  baseline: MenuMatrix,
): Map<string, Quadrant | null> {
  const before = new Map(baseline.rows.map((r) => [r.dishId, r.quadrant]))
  return new Map(current.rows.map((r) => [r.dishId, before.get(r.dishId) ?? null]))
}
