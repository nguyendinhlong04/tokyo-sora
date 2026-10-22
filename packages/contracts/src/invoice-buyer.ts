import { z } from 'zod'
import { isOrgTaxCode, isPersonalTaxCode, normalizeTaxCode } from './invoice.js'
import { isPhone, normalizePhone, PHONE_ERROR } from './phone.js'

/**
 * Schema người mua trên hoá đơn — API và form `@sora/ui/InvoiceBuyer` cùng kiểm bằng nó.
 *
 * Để riêng, KHÔNG chung file với hằng của `invoice.ts`: M1 Office chỉ cần `VAT_CODES`,
 * mà bundler chỉ bỏ được cả một file khi không ai dùng export nào của nó — dùng một hằng
 * là giữ luôn lệnh dựng schema ở cấp module, kéo cả zod vào màn không parse gì
 * (CLAUDE.md §8).
 */

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
