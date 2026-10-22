import { computeOrderTotals, type InvoiceSeller, type VatCode } from '@sora/contracts'
import { describe, expect, it } from 'vitest'
import { buildInvoiceDocument, type DocumentInput, type DocumentLine } from './document'

const seller: InvoiceSeller = {
  name: 'CÔNG TY TNHH TOKYO SORA',
  taxCode: '0101234567',
  address: '12 Trần Thái Tông, Cầu Giấy, Hà Nội',
  branchName: 'Cầu Giấy',
  branchAddress: '12 Trần Thái Tông, Cầu Giấy, Hà Nội',
}
const rates: Record<VatCode, number> = { standard: 800, alcohol: 1000 }

const line = (over: Partial<DocumentLine>): DocumentLine => ({
  name: 'Ba chỉ bò',
  modifiers: [],
  qty: 2,
  unitPrice: 285_000,
  discountVnd: 0,
  vatCode: 'standard',
  isSet: false,
  promotionName: null,
  ...over,
})

/** Đơn như `recomputeTotals` ghi: tiền tính bằng chính `computeOrderTotals` */
function inputOf(
  lines: DocumentLine[],
  opts: { bill?: Record<number, number>; serviceRate?: number; ship?: number } = {},
): DocumentInput {
  const money = computeOrderTotals({
    lines: lines.map((l, i) => ({
      qty: l.qty,
      unitPrice: l.unitPrice,
      discount: l.discountVnd,
      billDiscount: opts.bill?.[i] ?? 0,
      vatRateBp: rates[l.vatCode],
    })),
    serviceRate: opts.serviceRate ?? 0,
    ship: opts.ship ?? 0,
  })
  return {
    order: {
      displayCode: 'ON-2610-0001',
      moneySub: money.sub,
      moneyDiscount: money.discount,
      moneyService: money.service,
      moneyShip: money.ship,
      moneyVat: money.vat,
      moneyRound: money.round,
      moneyTotal: money.total,
      vatBreakdown: money.byRate,
      billPromotionName: opts.bill ? 'Hoá đơn giảm 10%' : null,
    },
    lines,
    rates,
    seller,
    buyer: null,
    paymentKinds: ['cash'],
  }
}

const beer = (over: Partial<DocumentLine> = {}) =>
  line({ name: 'Bia Asahi', unitPrice: 95_000, vatCode: 'alcohol', ...over })

describe('dựng hoá đơn GTGT từ đơn', () => {
  it('món ăn 8% và bia 10%, giảm hoá đơn: mỗi thuế suất một dòng chiết khấu', () => {
    const result = buildInvoiceDocument(
      inputOf([line({}), beer()], { bill: { 0: 57_000, 1: 19_000 } }),
    )
    if (!result.ok) throw new Error(result.message)
    const { lines, amounts, vatBreakdown } = result.document

    expect(lines.map((l) => [l.no, l.kind, l.name, l.amount, l.vatRateBp])).toEqual([
      [1, 'item', 'Ba chỉ bò', 570_000, 800],
      [2, 'item', 'Bia Asahi', 190_000, 1000],
      [3, 'discount', 'Khuyến mại: Hoá đơn giảm 10%', -57_000, 800],
      [4, 'discount', 'Khuyến mại: Hoá đơn giảm 10%', -19_000, 1000],
    ])
    expect(vatBreakdown.map((r) => [r.rateBp, r.net, r.vat])).toEqual([
      [800, 513_000, 41_040],
      [1000, 171_000, 17_100],
    ])
    // Hoá đơn ghi số chính xác; khách trả 742.000 sau làm tròn
    expect(amounts).toMatchObject({ vat: 58_140, round: -140, total: 742_140 })
  })

  it('giảm món nằm trên chính dòng món, kèm tên chương trình; không sinh dòng chiết khấu', () => {
    const result = buildInvoiceDocument(
      inputOf([line({ discountVnd: 114_000, promotionName: 'Ba chỉ bò giảm 20%' })]),
    )
    if (!result.ok) throw new Error(result.message)
    expect(result.document.lines).toEqual([
      {
        no: 1,
        kind: 'item',
        name: 'Ba chỉ bò',
        unit: 'phần',
        qty: 2,
        unitPrice: 285_000,
        discount: 114_000,
        amount: 456_000,
        vatRateBp: 800,
        note: 'Ba chỉ bò giảm 20%',
      },
    ])
  })

  it('set tính theo suất; tuỳ chọn ghi vào tên món', () => {
    const result = buildInvoiceDocument(
      inputOf([
        line({ name: 'Set Sora', qty: 1, unitPrice: 1_280_000, isSet: true }),
        line({ modifiers: ['Tỏi nướng'] }),
      ]),
    )
    if (!result.ok) throw new Error(result.message)
    expect(result.document.lines.map((l) => [l.name, l.unit])).toEqual([
      ['Set Sora', 'suất'],
      ['Ba chỉ bò (Tỏi nướng)', 'phần'],
    ])
  })

  it('phí phục vụ tách theo thuế suất; phí giao một dòng chưa tính VAT', () => {
    const result = buildInvoiceDocument(
      inputOf([line({}), beer()], { serviceRate: 0.05, ship: 25_000 }),
    )
    if (!result.ok) throw new Error(result.message)
    const extra = result.document.lines.filter(
      (l) => l.name !== 'Ba chỉ bò' && l.name !== 'Bia Asahi',
    )
    expect(extra.map((l) => [l.name, l.amount, l.vatRateBp])).toEqual([
      ['Phí phục vụ', 28_500, 800],
      ['Phí phục vụ', 9_500, 1000],
      ['Phí giao hàng', 25_000, null],
    ])
  })

  it('thuế suất đổi sau khi đơn đã tính tiền: không lập hoá đơn lệch bill', () => {
    const input = inputOf([line({}), beer()])
    const result = buildInvoiceDocument({ ...input, rates: { standard: 1000, alcohol: 1000 } })
    expect(result).toMatchObject({ ok: false, code: 'snapshot_mismatch' })
  })

  it('đơn tính trước khi có nhóm thuế: cả bill một thuế suất suy từ tiền đơn', () => {
    const input = inputOf([line({}), beer()])
    const legacy = buildInvoiceDocument({
      ...input,
      order: {
        ...input.order,
        vatBreakdown: [],
        moneyVat: 60_800,
        moneyTotal: 820_800,
        moneyRound: 0,
      },
    })
    if (!legacy.ok) throw new Error(legacy.message)
    expect(legacy.document.vatBreakdown).toEqual([
      { rateBp: 800, goods: 760_000, discount: 0, service: 0, net: 760_000, vat: 60_800 },
    ])
    expect(legacy.document.lines.every((l) => l.vatRateBp === 800)).toBe(true)
  })

  it('đơn chưa có món thì không có gì để lập', () => {
    expect(buildInvoiceDocument({ ...inputOf([line({})]), lines: [] })).toMatchObject({
      ok: false,
      code: 'no_lines',
    })
  })

  it('hình thức thanh toán ghép theo các khoản đã thu', () => {
    const base = inputOf([line({})])
    const method = (kinds: string[]) => {
      const r = buildInvoiceDocument({ ...base, paymentKinds: kinds })
      return r.ok ? r.document.paymentMethod : null
    }
    expect(method(['cash', 'vietqr', 'cash'])).toBe('TM/CK')
    expect(method(['card'])).toBe('Thẻ')
    expect(method(['corporate'])).toBe('Công nợ')
    expect(method([])).toBe('TM/CK')
  })
})
