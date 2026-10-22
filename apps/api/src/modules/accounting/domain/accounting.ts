/**
 * Kế toán — phần tính toán của F2 · F4 · F6.
 *
 * Hàm thuần: gộp doanh thu theo thuế suất, và quyết định một tháng đã khoá sổ hay
 * chưa. Việc nhỏ nhưng là chỗ sai thì phát hiện muộn — sai thuế suất thì tờ khai
 * sai, sai khoá sổ thì kỳ đã chốt bị sửa sau lưng. Ký hiệu và số hoá đơn nằm ở
 * `einvoice/domain/serial.ts`.
 */

/** Tháng dạng YYYY-MM-01 */
export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function lastOfMonth(monthIso: string): string {
  const year = Number(monthIso.slice(0, 4))
  const month = Number(monthIso.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

/** Mọi tháng chạm tới bởi một khoảng ngày */
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = []
  let cursor = firstOfMonth(from)
  const end = firstOfMonth(to)
  while (cursor <= end) {
    out.push(cursor)
    const year = Number(cursor.slice(0, 4))
    const month = Number(cursor.slice(5, 7))
    cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  }
  return out
}

export interface VatBucket {
  /** Thuế suất dạng tỉ lệ: 0.08 = 8% */
  rate: number
  /** Doanh thu trước thuế */
  netVnd: number
  vatVnd: number
}

/**
 * Gộp doanh thu theo THUẾ SUẤT cho tờ khai.
 *
 * Đơn tính từ khi có VAT theo nhóm thuế mang sẵn tiền từng thuế suất
 * (`orders.vat_breakdown`): một bill có món ăn 8% và bia 10% ra đúng hai dòng.
 * Suy thuế suất từ tổng của bill như trước thì ra một thuế suất "pha" kiểu 8,6% —
 * không có dòng nào như vậy trên tờ khai.
 *
 * Đơn cũ hơn chỉ có tổng: suy thuế suất từ cặp (doanh thu, VAT) của đơn — hồi đó
 * cả đơn một thuế suất nên phép suy là đúng. Làm tròn về 4 chữ số để 0,08000001
 * và 0,08 không thành hai dòng khác nhau trên tờ khai.
 */
export function vatBuckets(
  orders: readonly {
    netVnd: number
    vatVnd: number
    /** `orders.vat_breakdown`; rỗng hoặc thiếu với đơn tính trước khi có nhóm thuế */
    breakdown?: readonly { rateBp: number; net: number; vat: number }[]
  }[],
): VatBucket[] {
  const byRate = new Map<number, VatBucket>()
  const add = (rate: number, netVnd: number, vatVnd: number) => {
    const bucket = byRate.get(rate) ?? { rate, netVnd: 0, vatVnd: 0 }
    bucket.netVnd += netVnd
    bucket.vatVnd += vatVnd
    byRate.set(rate, bucket)
  }

  for (const order of orders) {
    if (order.breakdown && order.breakdown.length > 0) {
      for (const part of order.breakdown) add(part.rateBp / 10_000, part.net, part.vat)
      continue
    }
    const rate =
      order.netVnd === 0 ? 0 : Math.round((order.vatVnd / order.netVnd) * 10_000) / 10_000
    add(rate, order.netVnd, order.vatVnd)
  }

  return [...byRate.values()].sort((a, b) => a.rate - b.rate)
}

export interface TaxSummary {
  vatOutVnd: number
  vatInVnd: number
  /** Dương = phải nộp; âm = được khấu trừ chuyển kỳ sau */
  vatPayableVnd: number
  pitWithheldVnd: number
}

export function taxSummary(input: {
  vatOutVnd: number
  vatInVnd: number
  pitWithheldVnd: number
}): TaxSummary {
  return {
    ...input,
    vatPayableVnd: input.vatOutVnd - input.vatInVnd,
  }
}

/**
 * Đối chiếu tổng hoá đơn điện tử với doanh thu hệ thống — "lệch là đỏ" (§28 F4).
 *
 * Lệch ở đây gần như luôn có nghĩa: hoặc có bill chưa phát hành được hoá đơn
 * (hàng đợi lỗi F3), hoặc có hoá đơn phát hành cho thứ không phải bill. Cả hai
 * đều là việc phải xử lý trước khi nộp tờ khai.
 */
export function reconcile(systemVnd: number, invoicedVnd: number) {
  const diff = systemVnd - invoicedVnd
  return {
    systemVnd,
    invoicedVnd,
    diffVnd: diff,
    matched: diff === 0,
  }
}
