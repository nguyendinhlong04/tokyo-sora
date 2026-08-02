/**
 * Giá vốn — phần tính toán của kho và công thức (M4 · M7 · S1 · S2).
 *
 * Hàm thuần, không CSDL, không Nest: mọi quyết định làm tròn và mọi công thức
 * bình quân gia quyền nằm ở đây để kiểm được bằng test thay vì kiểm bằng cách
 * nhìn màn hình rồi đoán.
 *
 * HAI ĐƠN VỊ, ĐỪNG TRỘN:
 *   · `milli` — phần nghìn đồng cho MỘT ĐVT cơ sở. Đây là đơn vị của nguyên liệu.
 *     Cần phần lẻ vì đá lạnh 800₫/kg là 0,8₫/g, làm tròn về đồng là thành miễn phí.
 *   · `vnd`   — đồng nguyên. Đây là đơn vị của MÓN và của SỔ KHO, tức là chỗ con
 *     số thật sự trở thành tiền. Chỉ làm tròn ở ranh giới này, đúng một lần.
 */

/** Ngưỡng food cost §24 M4: xanh dưới 30% · vàng 30–38% · đỏ trên 38% */
export const FOOD_COST_BANDS = { good: 0.3, warn: 0.38 } as const
export type FoodCostBand = 'tot' | 'canh-bao' | 'bao-dong' | 'chua-co'

export interface RecipeLineInput {
  ingredientId: string
  /** Định lượng cho MỘT phần, ĐVT cơ sở */
  qtyBase: number
  /** Hao hụt, điểm cơ bản (600 = 6%) */
  wasteBp: number
  /** Giá bình quân của nguyên liệu, phần nghìn đồng / ĐVT cơ sở */
  costPerBaseMilli: number
}

/**
 * Lượng nguyên liệu THẬT SỰ phải xuất kho cho `portions` phần.
 *
 * Hao hụt cộng vào chứ không trừ ra: công thức khai 500ml bia mỗi cốc với hao hụt
 * bọt 6% nghĩa là kho phải xuất 530ml mới rót được 500ml vào cốc.
 *
 * Nhân số phần TRƯỚC rồi mới làm tròn một lần: làm tròn từng phần rồi nhân lên sẽ
 * cộng dồn sai số, và bàn gọi 10 phần sẽ lệch hẳn một đơn vị so với bàn gọi 1 phần
 * mười lần.
 */
export function effectiveQtyBase(portions: number, qtyBase: number, wasteBp: number): number {
  return Math.round((portions * qtyBase * (10_000 + wasteBp)) / 10_000)
}

/** Giá vốn một dòng công thức cho `portions` phần, đồng nguyên */
export function lineCostVnd(line: RecipeLineInput, portions = 1): number {
  return Math.round((effectiveQtyBase(portions, line.qtyBase, line.wasteBp) * line.costPerBaseMilli) / 1_000)
}

export interface DishCostBreakdown {
  /** Giá vốn một phần, đồng nguyên */
  costVnd: number
  lines: {
    ingredientId: string
    qtyBase: number
    wasteBp: number
    effectiveQtyBase: number
    costVnd: number
    /** Phần trăm đóng góp vào giá vốn của món — cột "% đóng góp" của M4 */
    share: number
  }[]
}

/**
 * Giá vốn một phần món, kèm cột đóng góp của từng nguyên liệu.
 *
 * Cộng giá vốn ĐÃ LÀM TRÒN của từng dòng chứ không làm tròn ở tổng: bảng M4 hiện
 * giá vốn từng dòng, và một bảng có các dòng cộng lại không bằng dòng tổng là
 * bảng không ai tin.
 */
export function dishCost(lines: readonly RecipeLineInput[]): DishCostBreakdown {
  const priced = lines.map((line) => ({
    ingredientId: line.ingredientId,
    qtyBase: line.qtyBase,
    wasteBp: line.wasteBp,
    effectiveQtyBase: effectiveQtyBase(1, line.qtyBase, line.wasteBp),
    costVnd: lineCostVnd(line),
  }))

  const costVnd = priced.reduce((sum, l) => sum + l.costVnd, 0)
  return {
    costVnd,
    lines: priced.map((l) => ({ ...l, share: costVnd === 0 ? 0 : l.costVnd / costVnd })),
  }
}

export interface FoodCost {
  costVnd: number
  priceVnd: number
  /** null khi món chưa có công thức hoặc giá bán bằng 0 — không phải 0% */
  percent: number | null
  band: FoodCostBand
  /** Lãi gộp một phần, đồng nguyên */
  grossProfitVnd: number | null
}

/**
 * Food cost và lãi gộp của một món.
 *
 * `hasRecipe` phải truyền vào chứ không suy từ `costVnd === 0`: món chưa khai công
 * thức và món có công thức toàn nguyên liệu chưa có giá đều ra 0₫, nhưng cái đầu
 * là "chưa biết" còn cái sau là "biết và bằng 0". Hiện 0% cho món chưa khai công
 * thức là cách chắc chắn nhất để cả thực đơn trông như đang lãi 100%.
 */
export function foodCost(costVnd: number, priceVnd: number, hasRecipe: boolean): FoodCost {
  if (!hasRecipe || priceVnd <= 0) {
    return { costVnd, priceVnd, percent: null, band: 'chua-co', grossProfitVnd: null }
  }
  const percent = costVnd / priceVnd
  return {
    costVnd,
    priceVnd,
    percent,
    band: foodCostBand(percent),
    grossProfitVnd: priceVnd - costVnd,
  }
}

export function foodCostBand(percent: number): FoodCostBand {
  if (percent < FOOD_COST_BANDS.good) return 'tot'
  if (percent <= FOOD_COST_BANDS.warn) return 'canh-bao'
  return 'bao-dong'
}

/**
 * Giá bình quân gia quyền DI ĐỘNG sau một lần nhập (§25, quyết định 1).
 *
 *   giá mới = (tồn cũ × giá cũ + tiền nhập) / (tồn cũ + lượng nhập)
 *
 * Tồn ÂM bị coi như 0 khi tính trọng số. Kho âm là chuyện có thật — bếp nấu trước,
 * phiếu nhập về sau — nhưng để số âm vào mẫu số thì một lần nhập bình thường có
 * thể đẩy giá bình quân lên trời hoặc xuống âm, và con số sai đó dính vào mọi món
 * dùng nguyên liệu này cho tới lần nhập kế tiếp. Coi như 0 nghĩa là lô mới tự
 * quyết định giá, đúng với thứ vừa thật sự trả tiền.
 */
export function movingAverageMilli(input: {
  onHandBase: number
  currentMilli: number
  inBase: number
  inTotalVnd: number
}): number {
  const { currentMilli, inBase, inTotalVnd } = input
  if (inBase <= 0) throw new RangeError(`Lượng nhập phải lớn hơn 0, nhận ${inBase}`)

  const onHand = Math.max(0, input.onHandBase)
  const incomingMilli = inTotalVnd * 1_000
  if (onHand === 0) return Math.round(incomingMilli / inBase)

  return Math.round((onHand * currentMilli + incomingMilli) / (onHand + inBase))
}

/** Mức tồn so với định mức, đưa về thang than hồng: cạn = lửa, đầy = tro */
export function stockRatio(qtyBase: number, minLevelBase: number): number | null {
  if (minLevelBase <= 0) return null
  // Đảo chiều: thang than hồng đo mức NÓNG, mà kho thì cạn mới nóng
  return Math.max(0, 1 - qtyBase / minLevelBase)
}
