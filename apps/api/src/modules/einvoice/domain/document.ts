import type {
  InvoiceBuyer,
  InvoiceDocument,
  InvoiceLine,
  InvoiceSeller,
  VatCode,
  VatRateTotals,
} from '@sora/contracts'

/**
 * Dựng nội dung một hoá đơn GTGT từ đơn đã tính tiền (NĐ 254/2026 Điều 10, Phụ lục
 * mục 5). Hàm thuần: cùng đơn ra cùng hoá đơn, dựng lại bao nhiêu lần cũng vậy —
 * mỗi lượt thử phát hành dựng lại để người mua vừa sửa có mặt trên hoá đơn.
 *
 * Tiền lấy NGUYÊN từ đơn (`vat_breakdown` do `computeOrderTotals` ghi lúc tính
 * tiền), không tính lại: khách đã trả theo bill, hoá đơn phải ra đúng bill đó.
 */

export interface DocumentOrder {
  displayCode: string
  moneySub: number
  moneyDiscount: number
  moneyService: number
  moneyShip: number
  moneyVat: number
  moneyRound: number
  moneyTotal: number
  /** `orders.vat_breakdown`; rỗng với đơn tính trước khi có VAT theo nhóm thuế */
  vatBreakdown: readonly VatRateTotals[]
  /** Chương trình hoá đơn đang hưởng — tên in trên dòng chiết khấu */
  billPromotionName: string | null
}

/** Một dòng CHA còn sống của đơn (dòng con của set giá 0, không lên hoá đơn) */
export interface DocumentLine {
  name: string
  /** Tên tuỳ chọn đã chọn — chênh giá của chúng đã nằm trong `unitPrice` */
  modifiers: readonly string[]
  qty: number
  unitPrice: number
  discountVnd: number
  vatCode: VatCode
  isSet: boolean
  /** Chương trình món của dòng, khi dòng được giảm */
  promotionName: string | null
}

export interface DocumentInput {
  order: DocumentOrder
  lines: readonly DocumentLine[]
  /** Thuế suất từng nhóm thuế lúc này (basis point) — chỉ để biết dòng nào thuộc thuế suất nào */
  rates: Readonly<Record<VatCode, number>>
  seller: InvoiceSeller
  buyer: InvoiceBuyer | null
  /** `payments.kind` của các khoản đã thu, thêm `corporate` khi bill ghi nợ công ty */
  paymentKinds: readonly string[]
}

export type DocumentResult =
  | { ok: true; document: InvoiceDocument }
  | { ok: false; code: 'no_lines' | 'snapshot_mismatch'; message: string }

/** Ký hiệu hình thức thanh toán quen dùng trên hoá đơn */
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'TM',
  cod: 'TM',
  vietqr: 'CK',
  card: 'Thẻ',
  corporate: 'Công nợ',
}

export function buildInvoiceDocument(input: DocumentInput): DocumentResult {
  const { order } = input
  if (input.lines.length === 0) {
    return {
      ok: false,
      code: 'no_lines',
      message: 'Đơn chưa có món nào — không có gì để lập hoá đơn',
    }
  }

  const breakdown = order.vatBreakdown.length > 0 ? [...order.vatBreakdown] : [legacyRow(order)]
  // Đơn cũ chỉ có MỘT thuế suất cho cả bill — mọi dòng theo đúng thuế suất đó
  const rateOf = (line: DocumentLine) =>
    order.vatBreakdown.length > 0 ? input.rates[line.vatCode] : breakdown[0]!.rateBp

  const mismatch: DocumentResult = {
    ok: false,
    code: 'snapshot_mismatch',
    message:
      'Thuế suất đã đổi sau khi tính tiền đơn — tiền món theo thuế suất không khớp bill. Kế toán xử lý ở F3',
  }
  for (const row of breakdown) {
    const goods = input.lines
      .filter((l) => rateOf(l) === row.rateBp)
      .reduce((s, l) => s + l.qty * l.unitPrice, 0)
    if (goods !== row.goods) return mismatch
  }
  if (input.lines.some((l) => !breakdown.some((r) => r.rateBp === rateOf(l)))) return mismatch

  const items: Omit<InvoiceLine, 'no'>[] = input.lines.map((l) => ({
    kind: 'item',
    name: l.modifiers.length > 0 ? `${l.name} (${l.modifiers.join(', ')})` : l.name,
    unit: l.isSet ? 'suất' : 'phần',
    qty: l.qty,
    unitPrice: l.unitPrice,
    discount: l.discountVnd,
    amount: l.qty * l.unitPrice - l.discountVnd,
    vatRateBp: rateOf(l),
    note: l.discountVnd > 0 ? l.promotionName : null,
  }))

  const service: Omit<InvoiceLine, 'no'>[] = breakdown
    .filter((r) => r.service > 0)
    .map((r) => ({
      kind: 'item',
      name: 'Phí phục vụ',
      unit: null,
      qty: 1,
      unitPrice: r.service,
      discount: 0,
      amount: r.service,
      vatRateBp: r.rateBp,
      note: null,
    }))

  // Phí giao chưa chịu VAT trong `computeOrderTotals` — kế toán chưa xác nhận
  const ship: Omit<InvoiceLine, 'no'>[] =
    order.moneyShip > 0
      ? [
          {
            kind: 'item',
            name: 'Phí giao hàng',
            unit: null,
            qty: 1,
            unitPrice: order.moneyShip,
            discount: 0,
            amount: order.moneyShip,
            vatRateBp: null,
            note: null,
          },
        ]
      : []

  /**
   * Giảm của cả hoá đơn, tách theo thuế suất: phần giảm của thuế suất trừ đi giảm
   * món của các dòng thuộc nó. Hoá đơn phải thể hiện rõ chiết khấu, khuyến mại
   * (NĐ 254 Phụ lục mục 5 điểm đ), và VAT tính trên giá sau giảm của từng thuế suất.
   */
  const discounts: Omit<InvoiceLine, 'no'>[] = []
  for (const row of breakdown) {
    const itemDiscount = input.lines
      .filter((l) => rateOf(l) === row.rateBp)
      .reduce((s, l) => s + l.discountVnd, 0)
    const billPart = row.discount - itemDiscount
    if (billPart < 0) return mismatch
    if (billPart === 0) continue
    discounts.push({
      kind: 'discount',
      name: order.billPromotionName
        ? `Khuyến mại: ${order.billPromotionName}`
        : 'Chiết khấu thương mại',
      unit: null,
      qty: 1,
      unitPrice: 0,
      discount: 0,
      amount: -billPart,
      vatRateBp: row.rateBp,
      note: null,
    })
  }

  const lines = [...items, ...service, ...ship, ...discounts].map((l, i) => ({ ...l, no: i + 1 }))
  const methods = [
    ...new Set(input.paymentKinds.map((k) => PAYMENT_LABELS[k]).filter((x) => x !== undefined)),
  ]

  return {
    ok: true,
    document: {
      orderCode: order.displayCode,
      seller: input.seller,
      buyer: input.buyer,
      lines,
      vatBreakdown: breakdown,
      amounts: {
        goods: order.moneySub,
        discount: order.moneyDiscount,
        service: order.moneyService,
        ship: order.moneyShip,
        vat: order.moneyVat,
        round: order.moneyRound,
        // Hoá đơn ghi số chính xác; chênh làm tròn của bill ghi sổ riêng như trước
        total: order.moneyTotal - order.moneyRound,
      },
      paymentMethod: methods.length > 0 ? methods.join('/') : 'TM/CK',
    },
  }
}

/**
 * Đơn tính trước khi có VAT theo nhóm thuế: cả bill một thuế suất, suy từ cặp
 * (giá tính thuế, VAT) — đúng phép suy F4 vẫn dùng cho những đơn này.
 */
function legacyRow(order: DocumentOrder): VatRateTotals {
  const net = order.moneySub - order.moneyDiscount + order.moneyService
  return {
    rateBp: net === 0 ? 0 : Math.round((order.moneyVat * 10_000) / net),
    goods: order.moneySub,
    discount: order.moneyDiscount,
    service: order.moneyService,
    net,
    vat: order.moneyVat,
  }
}
