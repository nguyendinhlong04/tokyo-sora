import { z } from 'zod'
import type { VatRateTotals } from './money.js'
import { isPhone, normalizePhone, PHONE_ERROR } from './phone.js'

/**
 * Người mua trên hoá đơn điện tử khởi tạo từ máy tính tiền (NĐ 254/2026/NĐ-CP,
 * TT 91/2026/TT-BTC — hiệu lực 01/7/2026).
 *
 * Thông tin người mua chỉ ghi khi người mua YÊU CẦU. Không đưa thì hoá đơn ghi
 * "Bán cho người tiêu dùng" — không được để trống (NĐ 254, Phụ lục mục 4 điểm b).
 * POS, iPad bàn và web cùng gửi một dạng `InvoiceBuyer`, API kiểm bằng đúng schema
 * này: không app nào được nới hay siết riêng.
 */
export const CONSUMER_BUYER_LABEL = 'Bán cho người tiêu dùng'

// ============================================================== Mã số thuế

/**
 * Về dạng lưu duy nhất: bỏ khoảng trắng, chấm; 13 số liền thì chèn gạch thành
 * `10-3` (MST chi nhánh, đơn vị phụ thuộc). KHÔNG hứa hợp lệ — xem `isOrgTaxCode`.
 */
export function normalizeTaxCode(raw: string): string {
  const compact = raw.replace(/[\s.]/g, '')
  return /^\d{13}$/.test(compact) ? `${compact.slice(0, 10)}-${compact.slice(10)}` : compact
}

/** MST tổ chức: 10 số, chi nhánh và đơn vị phụ thuộc thêm `-` và 3 số */
export function isOrgTaxCode(code: string): boolean {
  return /^\d{10}(-\d{3})?$/.test(code)
}

/**
 * Mã số thuế của người mua là cá nhân, hộ kinh doanh.
 *
 * Từ 01/7/2025 số định danh cá nhân 12 số dùng thay mã số thuế (TT 86/2024/TT-BTC);
 * MST cá nhân 10 số cấp trước đó vẫn còn gặp.
 */
export function isPersonalTaxCode(code: string): boolean {
  return /^(\d{10}|\d{12})$/.test(code)
}

/**
 * Số kiểm tra của MST 10 số: trọng số 31,29,23,19,17,13,7,5,3 cho 9 số đầu, số
 * thứ 10 = 10 − (tổng mod 11). Đúng với các MST thật đã đối chiếu (0101248141,
 * 0100109106, 0300588569).
 *
 * CHỈ để CẢNH BÁO "mã số thuế có vẻ sai", không chặn: không có văn bản công bố
 * phép kiểm này, và MST mẫu trong seed/test (0101234567) không qua được nó. Chặn
 * thật là việc của tra cứu mã số thuế.
 */
export function taxCodeChecksumOk(code: string): boolean {
  const digits = code.slice(0, 10)
  if (!/^\d{10}$/.test(digits)) return false
  const weights = [31, 29, 23, 19, 17, 13, 7, 5, 3]
  const sum = weights.reduce((s, w, i) => s + w * Number(digits[i]), 0)
  const check = 10 - (sum % 11)
  return check <= 9 && check === Number(digits[9])
}

// ============================================================== Người mua

export const BUYER_KINDS = ['company', 'person'] as const
export type BuyerKind = (typeof BUYER_KINDS)[number]

/** Ô bỏ trống gửi lên là chuỗi rỗng — coi như không có, không bắt khách xoá cho sạch */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const requiredText = (max: number, message: string) =>
  z.string({ error: message }).trim().min(1, message).max(max)
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional())
const optionalEmail = z.preprocess(
  blankToUndefined,
  z.string().trim().toLowerCase().email('Email nhận hoá đơn chưa đúng').max(160).optional(),
)

export const InvoiceBuyerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('company'),
    taxCode: z
      .string({ error: 'Thiếu mã số thuế' })
      .transform(normalizeTaxCode)
      .refine(isOrgTaxCode, 'Mã số thuế doanh nghiệp gồm 10 số; chi nhánh thêm "-" và 3 số'),
    /** Tên đúng như đăng ký kinh doanh — được viết tắt TNHH, CP… (NĐ 254 Phụ lục mục 4) */
    name: requiredText(400, 'Thiếu tên công ty'),
    /** Doanh nghiệp bắt buộc có địa chỉ trên hoá đơn */
    address: requiredText(400, 'Thiếu địa chỉ công ty'),
    email: optionalEmail,
    /** "Họ tên người mua hàng" — người đứng ra lấy hoá đơn cho công ty */
    contactName: optionalText(120),
    /**
     * Hồ sơ khách doanh nghiệp B15 mà thu ngân đã chọn. Chỉ nhân viên gửi được —
     * API gỡ trường này khỏi lượt gửi của iPad bàn và web.
     */
    corporateId: z.number().int().positive().optional(),
  }),
  z
    .object({
      kind: z.literal('person'),
      name: requiredText(120, 'Thiếu họ tên'),
      taxCode: z.preprocess(
        blankToUndefined,
        z
          .string()
          .transform(normalizeTaxCode)
          .refine(isPersonalTaxCode, 'Mã số thuế cá nhân gồm 10 số, hoặc số định danh 12 số')
          .optional(),
      ),
      address: optionalText(400),
      email: optionalEmail,
      phone: z.preprocess(
        blankToUndefined,
        z.string().transform(normalizePhone).refine(isPhone, PHONE_ERROR).optional(),
      ),
    })
    // Đưa số định danh thì hoá đơn phải ghi đủ tên, địa chỉ, số (NĐ 254 Phụ lục mục 4 điểm b)
    .refine((b) => b.taxCode === undefined || b.address !== undefined, {
      path: ['address'],
      message: 'Có mã số thuế hoặc số định danh thì cần thêm địa chỉ',
    }),
])
export type InvoiceBuyer = z.infer<typeof InvoiceBuyerSchema>

/** Dòng người mua in trên hoá đơn và các màn tóm tắt */
export function buyerLabelOf(buyer: InvoiceBuyer | null): string {
  return buyer ? buyer.name : CONSUMER_BUYER_LABEL
}

// ============================================================== Nhóm thuế của món

/**
 * Nhóm thuế suất của món — `dishes.vat_code`, đóng băng vào `order_lines.vat_code`.
 *
 * Thuế suất KHÔNG nằm ở đây mà ở tham số A6 (`VAT_RATE_PARAMS`): món ăn đang được
 * giảm còn 8% tới 31/12/2026 (NĐ 174/2025), sau đó tuỳ Quốc hội — kế toán đổi một
 * con số, không ai sửa món. Bia, rượu chịu thuế tiêu thụ đặc biệt nên không được
 * giảm, giữ 10%.
 */
export const VAT_CODES = ['standard', 'alcohol'] as const
export type VatCode = (typeof VAT_CODES)[number]

export const VAT_CODE_LABELS: Record<VatCode, string> = {
  standard: 'Món ăn & đồ uống không cồn',
  alcohol: 'Bia, rượu',
}

export const VAT_RATE_PARAMS: Record<VatCode, string> = {
  standard: 'sales.vatRate',
  alcohol: 'sales.vatRateAlcohol',
}

// ============================================================== Hoá đơn

export const INVOICE_STATES = ['pending', 'issued', 'failed', 'voided', 'replaced'] as const
export type InvoiceState = (typeof INVOICE_STATES)[number]

/** Một dòng trên hoá đơn GTGT */
export interface InvoiceLine {
  no: number
  /** `item` = món, phí phục vụ, phí giao · `discount` = chiết khấu / khuyến mại của cả hoá đơn */
  kind: 'item' | 'discount'
  name: string
  /** "phần", "suất"; null với dòng chiết khấu */
  unit: string | null
  qty: number
  unitPrice: number
  /** Giảm trên chính dòng này (khuyến mãi món) */
  discount: number
  /** Thành tiền chưa thuế = qty × unitPrice − discount; âm với dòng chiết khấu */
  amount: number
  /** Basis point; null = không tính VAT (phí giao — chờ kế toán xác nhận) */
  vatRateBp: number | null
  /** Tên chương trình khuyến mãi, ghi chú tặng… */
  note: string | null
}

export interface InvoiceSeller {
  /** Tên đúng giấy đăng ký doanh nghiệp */
  name: string
  taxCode: string
  address: string
  /** Địa điểm kinh doanh phát hành hoá đơn (chi nhánh) */
  branchName: string
  branchAddress: string | null
}

export interface InvoiceAmounts {
  /** Tiền món giá niêm yết */
  goods: number
  discount: number
  service: number
  ship: number
  vat: number
  /** Chênh làm tròn của bill — KHÔNG nằm trong tổng hoá đơn */
  round: number
  /** Tổng thanh toán trên hoá đơn = tiền món − giảm + phí + VAT, chưa làm tròn */
  total: number
}

/** Toàn bộ nội dung một hoá đơn — thứ gửi nhà cung cấp và thứ in ra */
export interface InvoiceDocument {
  orderCode: string
  seller: InvoiceSeller
  /** null = "Bán cho người tiêu dùng" */
  buyer: InvoiceBuyer | null
  lines: InvoiceLine[]
  vatBreakdown: VatRateTotals[]
  amounts: InvoiceAmounts
  /** TM, CK, Thẻ, Công nợ — ghép bằng "/" khi bill trả nhiều cách */
  paymentMethod: string
}

/** Hoá đơn như app đọc (POS P11, iPad T15, web theo dõi đơn, Office F3) */
export interface InvoiceView {
  id: number
  orderId: number
  state: InvoiceState
  /** Phát hành bằng bản giả lập — in "HOÁ ĐƠN THỬ", không có giá trị */
  test: boolean
  formNo: string
  serial: string
  invoiceNo: string | null
  invoiceDate: string | null
  issuedAt: string | null
  /** Mã cơ quan thuế */
  authorityCode: string | null
  lookupCode: string | null
  lookupUrl: string | null
  replacesId: number | null
  /** Vì sao chưa phát hành được — thu ngân, kế toán đọc; màn khách không hiện */
  lastError: string | null
  /** null khi chưa dựng được nội dung (cấu hình thiếu, đơn rỗng) */
  document: InvoiceDocument | null
}

/** Trạng thái hoá đơn của một đơn — một lần hỏi cho cả người mua lẫn hoá đơn */
export interface InvoiceStatus {
  /** Chi nhánh đã bật hoá đơn điện tử */
  enabled: boolean
  /** Còn sửa được người mua (chưa có hoá đơn phát hành) */
  editable: boolean
  buyer: InvoiceBuyer | null
  invoice: InvoiceView | null
}

/** "1C26MAA · 00000123" — chưa cấp số thì chỉ ký hiệu */
export function invoiceNumberLabel(view: Pick<InvoiceView, 'formNo' | 'serial' | 'invoiceNo'>) {
  const head = `${view.formNo}${view.serial}`
  return view.invoiceNo ? `${head} · ${view.invoiceNo}` : head
}
