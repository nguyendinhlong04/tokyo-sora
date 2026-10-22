import { z } from 'zod'
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
