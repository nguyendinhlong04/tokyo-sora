import {
  REPORT_AUTO_FIELDS,
  type AutoValue,
  type ReportField,
  type ReportValue,
} from '@sora/contracts'

/**
 * Trường báo cáo — hàm thuần: kiểm mẫu lúc lưu, kiểm giá trị lúc nộp.
 */

type Result = { ok: true } | { ok: false; code: string; message: string }

const fail = (code: string, message: string): Result => ({ ok: false, code, message })

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Mẫu có đụng tiền không — tiền chỉ nộp ở máy của quán, không qua điện thoại riêng */
export function hasMoney(fields: readonly ReportField[]): boolean {
  return fields.some(
    (f) =>
      f.type === 'tien' || (f.auto !== undefined && REPORT_AUTO_FIELDS[f.auto].type === 'tien'),
  )
}

/** Kiểm hình dạng mẫu: khoá không trùng, trường chọn có lựa chọn, điều kiện trỏ đúng trường */
export function validateTemplateFields(fields: readonly ReportField[]): Result {
  if (fields.length === 0) return fail('report_fields_empty', 'Mẫu báo cáo cần ít nhất một trường')
  if (fields.length > 40) return fail('report_fields_too_many', 'Mẫu báo cáo tối đa 40 trường')
  const keys = new Set<string>()
  for (const f of fields) {
    if (!KEY.test(f.key)) {
      return fail('report_field_key', `Khoá "${f.key}" chỉ gồm chữ thường không dấu, số, gạch nối`)
    }
    if (keys.has(f.key)) return fail('report_field_duplicate', `Trùng khoá trường "${f.key}"`)
    keys.add(f.key)
    if ((f.type === 'chon' || f.type === 'nhieu-chon') && !f.auto && !f.options?.length) {
      return fail('report_field_options', `Trường "${f.label}" cần danh sách lựa chọn`)
    }
    if (f.auto && f.required) {
      return fail('report_field_auto_required', `Trường tự điền "${f.label}" không đặt bắt buộc`)
    }
  }
  for (const f of fields) {
    if (f.requiredIf && !keys.has(f.requiredIf.field)) {
      return fail('report_field_condition', `Điều kiện của "${f.label}" trỏ tới trường không có`)
    }
  }
  return { ok: true }
}

const empty = (v: ReportValue | undefined) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0)

/** Số của một trường — tự điền thì lấy số đã tính, nhập tay thì lấy giá trị nhập */
function numberOf(
  field: ReportField | undefined,
  values: Record<string, ReportValue>,
  auto: Record<string, AutoValue>,
): number | null {
  if (!field) return null
  const raw = field.auto ? auto[field.key]?.value : values[field.key]
  return typeof raw === 'number' ? raw : null
}

/**
 * Kiểm giá trị lúc NỘP (nháp thì lưu gì cũng được): đúng kiểu, đủ trường bắt buộc,
 * đủ trường "bắt buộc khi…" — vd. két lệch quá 20.000₫ thì phải giải trình.
 */
export function validateValues(
  fields: readonly ReportField[],
  values: Record<string, ReportValue>,
  auto: Record<string, AutoValue>,
): Result {
  const byKey = new Map(fields.map((f) => [f.key, f]))
  for (const f of fields) {
    if (f.auto) continue
    const v = values[f.key]
    if (!empty(v)) {
      const typeOk =
        f.type === 'so' || f.type === 'tien'
          ? typeof v === 'number' && Number.isFinite(v)
          : f.type === 'co-khong'
            ? typeof v === 'boolean'
            : f.type === 'nhieu-chon'
              ? Array.isArray(v) && v.every((x) => f.options?.includes(x))
              : f.type === 'chon'
                ? typeof v === 'string' && (f.options?.includes(v) ?? false)
                : f.type === 'url'
                  ? typeof v === 'string' && /^https:\/\/\S+$/.test(v)
                  : f.type === 'gio'
                    ? typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)
                    : typeof v === 'string' && v.length <= (f.type === 'doan' ? 4000 : 300)
      if (!typeOk) return fail('report_field_invalid', `"${f.label}" chưa đúng dạng`)
    }
    // "Có/không" bắt buộc nghĩa là phải trả lời CÓ — đó là lời cam kết, không phải câu hỏi
    if (f.required && f.type === 'co-khong' && v !== true) {
      return fail('report_field_required', `Chưa xác nhận "${f.label}"`)
    }
    if (f.required && empty(v)) return fail('report_field_required', `Chưa điền "${f.label}"`)
    if (f.requiredIf && empty(v)) {
      const n = numberOf(byKey.get(f.requiredIf.field), values, auto)
      if (n !== null && Math.abs(n) > f.requiredIf.absGreaterThan) {
        return fail('report_field_required', `Cần điền "${f.label}"`)
      }
    }
  }
  return { ok: true }
}
