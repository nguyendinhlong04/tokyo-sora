/**
 * Tiền VND = SỐ NGUYÊN đồng, không thập phân. Dùng `number` — an toàn tuyệt đối
 * dưới 2^53 (mọi hoá đơn/báo cáo thực tế). Đây là module tính tiền DUY NHẤT của
 * hệ thống: API tính chính thức, client chỉ dùng để ước hiển thị.
 */

export function assertVnd(n: number, label = 'amount'): number {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`${label} phải là số nguyên VND, nhận ${n}`)
  }
  return n
}

/** Làm tròn half-up về bội số `unit` (tham số `rounding` A6, mặc định 1000). */
export function roundToUnit(amount: number, unit: number): number {
  assertVnd(amount)
  if (!Number.isSafeInteger(unit) || unit <= 0) {
    throw new RangeError(`unit làm tròn không hợp lệ: ${unit}`)
  }
  if (unit === 1) return amount
  return Math.floor(amount / unit + 0.5) * unit
}

export interface OrderLineInput {
  qty: number
  unitPrice: number
  /** Chênh giá modifier đã đóng băng vào dòng */
  modifierDeltas?: number[]
  /** Giảm món đã đóng băng vào dòng (§9.6) */
  discount?: number
  /** Phần giảm hoá đơn chia về dòng này — `priceBill().shares` */
  billDiscount?: number
  /** Thuế suất của dòng, basis point (800 = 8%). Không có thì dùng `vatRate` của đơn */
  vatRateBp?: number
}

export interface OrderTotalsInput {
  lines: OrderLineInput[]
  /**
   * Tổng tiền giảm (đã qua kiểm tra trần theo vai trò ở tầng API). Dòng nào đã
   * mang `discount`/`billDiscount` thì đây chỉ để đối chiếu: khác tổng của dòng
   * là lỗi. Không dòng nào mang thì số này được chia về các dòng theo tiền món.
   */
  discount?: number
  /** Tỉ lệ phí phục vụ, ví dụ 0.05 = 5% (param A6, mặc định 0) */
  serviceRate?: number
  /** Tỉ lệ VAT mặc định, ví dụ 0.08 (param A6, mặc định 0) — dòng có `vatRateBp` thì theo dòng */
  vatRate?: number
  /** Phí giao hàng (đơn online) */
  ship?: number
  /** Bội số làm tròn tổng cuối (param A6, mặc định 1000) */
  roundingUnit?: number
}

/** Tiền của một thuế suất — đúng các cột hoá đơn GTGT ghi cho từng thuế suất */
export interface VatRateTotals {
  /** Basis point: 800 = 8% */
  rateBp: number
  /** Tiền món giá niêm yết */
  goods: number
  /** Giảm món + phần giảm hoá đơn chia về các dòng của thuế suất này */
  discount: number
  /** Phần phí phục vụ chia về thuế suất này */
  service: number
  /** Giá tính thuế = goods − discount + service */
  net: number
  vat: number
}

export interface OrderTotals {
  sub: number
  discount: number
  service: number
  vat: number
  ship: number
  /** Chênh lệch do làm tròn (total − trước làm tròn) — lưu vào sổ để khớp từng đồng */
  round: number
  total: number
  /** Theo từng thuế suất, thuế suất thấp trước. Σ vat = `vat` */
  byRate: VatRateTotals[]
}

/**
 * Thứ tự phép tính CỐ ĐỊNH (không đổi giữa các nơi gọi):
 *   sub = Σ qty × (unitPrice + Σ modifierDeltas)
 *   base = sub − discount
 *   service = floor(serviceRate × base)
 *   mỗi thuế suất r: net_r = (tiền món − giảm) của các dòng r + phần phí phục vụ
 *                    vat_r = floor(r × net_r)   ← VAT tính sau phí phục vụ;
 *                                                 kế toán xác nhận lại khi bật VAT ≠ 0
 *   vat = Σ vat_r
 *   total = round(base + service + vat + ship, roundingUnit)
 *
 * VAT tính RIÊNG từng thuế suất rồi mới cộng vì hoá đơn GTGT ghi tiền thuế theo
 * từng thuế suất (NĐ 254/2026): món ăn 8% còn bia, rượu 10% trên cùng một bill.
 * Phí phục vụ chia về các thuế suất theo tỉ lệ giá tính thuế, phần dư lớn nhất —
 * tổng luôn khớp từng đồng. Phí giao chưa chịu VAT, chờ kế toán xác nhận.
 *
 * Mọi tỉ lệ đổi ra basis point rồi tính bằng số nguyên: `0.29 × 100` trong số
 * thực ra 28,999… và floor về 28 — tiền thuế không được lệch vì chuyện đó.
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const ship = assertVnd(input.ship ?? 0, 'ship')
  const serviceBp = toBp(input.serviceRate ?? 0, 'serviceRate')
  const defaultBp = toBp(input.vatRate ?? 0, 'vatRate')
  const roundingUnit = input.roundingUnit ?? 1000

  const gross: number[] = []
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.qty) || line.qty <= 0) {
      throw new RangeError(`qty không hợp lệ: ${line.qty}`)
    }
    assertVnd(line.unitPrice, 'unitPrice')
    let unit = line.unitPrice
    for (const d of line.modifierDeltas ?? []) unit += assertVnd(d, 'modifierDelta')
    gross.push(line.qty * unit)
  }
  const sub = gross.reduce((s, g) => s + g, 0)

  // Phần giảm của từng dòng: dòng tự mang, hoặc chia tổng giảm theo tiền món
  const perLine = input.lines.some((l) => l.discount !== undefined || l.billDiscount !== undefined)
  let lineDiscounts: number[]
  if (perLine) {
    lineDiscounts = input.lines.map((l, i) => {
      const d =
        assertVnd(l.discount ?? 0, 'line.discount') +
        assertVnd(l.billDiscount ?? 0, 'line.billDiscount')
      if (d < 0 || d > gross[i]!) {
        throw new RangeError(`giảm của dòng ${i} ngoài khoảng [0, ${gross[i]}]: ${d}`)
      }
      return d
    })
    const sum = lineDiscounts.reduce((s, d) => s + d, 0)
    if (input.discount !== undefined && assertVnd(input.discount, 'discount') !== sum) {
      throw new RangeError(`discount ${input.discount} khác tổng giảm của các dòng ${sum}`)
    }
  } else {
    const discount = assertVnd(input.discount ?? 0, 'discount')
    if (discount < 0 || discount > sub) {
      throw new RangeError(`discount ngoài khoảng [0, ${sub}]: ${discount}`)
    }
    lineDiscounts = allocateByWeight(discount, gross)
  }
  const discount = lineDiscounts.reduce((s, d) => s + d, 0)

  const base = sub - discount
  const service = Math.floor((serviceBp * base) / BP)

  const groups = new Map<number, { goods: number; discount: number }>()
  input.lines.forEach((line, i) => {
    const rateBp = line.vatRateBp === undefined ? defaultBp : checkBp(line.vatRateBp, 'vatRateBp')
    const group = groups.get(rateBp) ?? { goods: 0, discount: 0 }
    group.goods += gross[i]!
    group.discount += lineDiscounts[i]!
    groups.set(rateBp, group)
  })
  const rates = [...groups.keys()].sort((a, b) => a - b)
  const serviceShares =
    service === 0
      ? rates.map(() => 0)
      : allocateByWeight(
          service,
          rates.map((r) => groups.get(r)!.goods - groups.get(r)!.discount),
        )

  const byRate = rates.map((rateBp, i): VatRateTotals => {
    const group = groups.get(rateBp)!
    const net = group.goods - group.discount + serviceShares[i]!
    return {
      rateBp,
      goods: group.goods,
      discount: group.discount,
      service: serviceShares[i]!,
      net,
      vat: Math.floor((rateBp * net) / BP),
    }
  })
  const vat = byRate.reduce((s, r) => s + r.vat, 0)
  const beforeRound = base + service + vat + ship
  const total = roundToUnit(beforeRound, roundingUnit)

  return { sub, discount, service, vat, ship, round: total - beforeRound, total, byRate }
}

/** 1 = 0,01% — đơn vị của mọi tỉ lệ thuế, phí trong module này */
const BP = 10_000

/** 0.08 → 800. Tỉ lệ phải nằm trong [0, 1] và biểu diễn được bằng basis point */
function toBp(rate: number, label: string): number {
  if (!Number.isFinite(rate)) throw new RangeError(`${label} không hợp lệ: ${rate}`)
  return checkBp(Math.round(rate * BP), label)
}

function checkBp(bp: number, label: string): number {
  if (!Number.isSafeInteger(bp) || bp < 0 || bp > BP) {
    throw new RangeError(`${label} ngoài khoảng [0, ${BP}] basis point: ${bp}`)
  }
  return bp
}

/**
 * Chia `total` theo trọng số — phần dư lớn nhất: mỗi phần lấy phần nguyên của tỉ
 * lệ, đồng còn thiếu trao cho phần có phần lẻ lớn nhất (hoà thì phần đứng trước).
 * Tổng các phần LUÔN bằng `total`; trọng số 0 không bao giờ nhận đồng nào.
 *
 * Tích trọng số × tổng có thể vượt 2^53 (bill 900 triệu × dòng 30 triệu) nên tính
 * bằng BigInt.
 */
export function allocateByWeight(total: number, weights: readonly number[]): number[] {
  assertVnd(total, 'total')
  if (total < 0) throw new RangeError(`total âm: ${total}`)
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`trọng số không hợp lệ: ${w}`)
  }
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum === 0) {
    if (total === 0) return weights.map(() => 0)
    throw new RangeError(`không có trọng số để chia ${total}`)
  }

  const bigSum = BigInt(sum)
  const products = weights.map((w) => BigInt(w) * BigInt(total))
  const parts = products.map((p) => Number(p / bigSum))
  const remainders = products.map((p) => p % bigSum)
  let left = total - parts.reduce((s, p) => s + p, 0)

  const order = weights
    .map((_, i) => i)
    .filter((i) => weights[i]! > 0)
    .sort((a, b) =>
      remainders[b]! > remainders[a]! ? 1 : remainders[b]! < remainders[a]! ? -1 : a - b,
    )
  for (const i of order) {
    if (left === 0) break
    parts[i] = parts[i]! + 1
    left--
  }
  return parts
}

/**
 * Chia đều `total` cho `n` phần — largest remainder: các phần chênh nhau tối đa 1đ
 * và LUÔN cộng lại đúng bằng total (T11 chia đều N).
 */
export function splitEven(total: number, n: number): number[] {
  assertVnd(total, 'total')
  if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError(`n không hợp lệ: ${n}`)
  const base = Math.floor(total / n)
  const remainder = total - base * n
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base))
}

/** Định dạng hiển thị 285000 → "285.000₫" (đúng chuẩn copy trong thiết kế). */
export function formatVnd(amount: number): string {
  assertVnd(amount)
  const sign = amount < 0 ? '−' : ''
  const digits = Math.abs(amount).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${grouped}₫`
}
