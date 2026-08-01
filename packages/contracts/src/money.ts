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
}

export interface OrderTotalsInput {
  lines: OrderLineInput[]
  /** Số tiền giảm tuyệt đối (đã qua kiểm tra trần theo vai trò ở tầng API) */
  discount?: number
  /** Tỉ lệ phí phục vụ, ví dụ 0.05 = 5% (param A6, mặc định 0) */
  serviceRate?: number
  /** Tỉ lệ VAT, ví dụ 0.08 (param A6, mặc định 0) */
  vatRate?: number
  /** Phí giao hàng (đơn online) */
  ship?: number
  /** Bội số làm tròn tổng cuối (param A6, mặc định 1000) */
  roundingUnit?: number
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
}

/**
 * Thứ tự phép tính CỐ ĐỊNH (không đổi giữa các nơi gọi):
 *   sub = Σ qty × (unitPrice + Σ modifierDeltas)
 *   base = sub − discount
 *   service = floor(serviceRate × base)
 *   vat = floor(vatRate × (base + service))   ← VAT tính sau phí phục vụ;
 *                                               kế toán xác nhận lại khi bật VAT ≠ 0
 *   total = round(base + service + vat + ship, roundingUnit)
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const discount = assertVnd(input.discount ?? 0, 'discount')
  const ship = assertVnd(input.ship ?? 0, 'ship')
  const serviceRate = input.serviceRate ?? 0
  const vatRate = input.vatRate ?? 0
  const roundingUnit = input.roundingUnit ?? 1000

  let sub = 0
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.qty) || line.qty <= 0) {
      throw new RangeError(`qty không hợp lệ: ${line.qty}`)
    }
    assertVnd(line.unitPrice, 'unitPrice')
    let unit = line.unitPrice
    for (const d of line.modifierDeltas ?? []) unit += assertVnd(d, 'modifierDelta')
    sub += line.qty * unit
  }

  if (discount < 0 || discount > sub) {
    throw new RangeError(`discount ngoài khoảng [0, ${sub}]: ${discount}`)
  }

  const base = sub - discount
  const service = Math.floor(serviceRate * base)
  const vat = Math.floor(vatRate * (base + service))
  const beforeRound = base + service + vat + ship
  const total = roundToUnit(beforeRound, roundingUnit)

  return { sub, discount, service, vat, ship, round: total - beforeRound, total }
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
