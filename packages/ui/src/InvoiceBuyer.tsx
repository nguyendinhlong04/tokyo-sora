import {
  CONSUMER_BUYER_LABEL,
  InvoiceBuyerSchema,
  isOrgTaxCode,
  normalizeTaxCode,
  taxCodeChecksumOk,
  type InvoiceBuyer,
  type TaxCodeLookupView,
} from '@sora/contracts'
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

/**
 * Người mua trên hoá đơn điện tử — một form cho POS, iPad bàn, web và Office.
 *
 * Entry riêng `@sora/ui/InvoiceBuyer` (như `QrCode`): chỉ kéo React và
 * `@sora/contracts`, web không phải kéo Dexie của `@sora/core`. Lượt tra MST do app
 * truyền vào — mỗi app gọi một cửa khác (nhân viên, iPad, web công khai).
 */

export type BuyerChoice = 'consumer' | InvoiceBuyer['kind']

export interface InvoiceBuyerDraft {
  kind: BuyerChoice
  taxCode: string
  name: string
  address: string
  email: string
  /** Công ty: người đứng ra lấy hoá đơn */
  contactName: string
  /** Cá nhân */
  phone: string
  /** Hồ sơ B15 — chỉ POS điền, iPad và web không bao giờ có */
  corporateId?: number
}

type Field = Exclude<keyof InvoiceBuyerDraft, 'kind' | 'corporateId'>
export type InvoiceBuyerErrors = Partial<Record<Field, string>>

export type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; result: TaxCodeLookupView }
  | { status: 'not_found' }
  | { status: 'unavailable'; message: string }

export function draftOf(buyer: InvoiceBuyer | null): InvoiceBuyerDraft {
  const empty = { taxCode: '', name: '', address: '', email: '', contactName: '', phone: '' }
  if (!buyer) return { kind: 'consumer', ...empty }
  if (buyer.kind === 'company') {
    return {
      ...empty,
      kind: 'company',
      taxCode: buyer.taxCode,
      name: buyer.name,
      address: buyer.address,
      email: buyer.email ?? '',
      contactName: buyer.contactName ?? '',
      corporateId: buyer.corporateId,
    }
  }
  return {
    ...empty,
    kind: 'person',
    taxCode: buyer.taxCode ?? '',
    name: buyer.name,
    address: buyer.address ?? '',
    email: buyer.email ?? '',
    phone: buyer.phone ?? '',
  }
}

/** Kiểm bằng CHÍNH schema máy chủ dùng — lỗi hiện dưới đúng ô, không đợi lượt gửi */
export function buyerOfDraft(
  draft: InvoiceBuyerDraft,
): { ok: true; buyer: InvoiceBuyer | null } | { ok: false; errors: InvoiceBuyerErrors } {
  if (draft.kind === 'consumer') return { ok: true, buyer: null }
  const parsed = InvoiceBuyerSchema.safeParse(
    draft.kind === 'company'
      ? {
          kind: 'company',
          taxCode: draft.taxCode,
          name: draft.name,
          address: draft.address,
          email: draft.email,
          contactName: draft.contactName,
          corporateId: draft.corporateId,
        }
      : {
          kind: 'person',
          taxCode: draft.taxCode,
          name: draft.name,
          address: draft.address,
          email: draft.email,
          phone: draft.phone,
        },
  )
  if (parsed.success) return { ok: true, buyer: parsed.data }
  const errors: InvoiceBuyerErrors = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as Field | undefined
    if (field && !errors[field]) errors[field] = issue.message
  }
  return { ok: false, errors }
}

/** Từ nguồn tra ngoài: "NNT ngừng hoạt động…" — hoá đơn cho công ty đã đóng là chuyện phải hỏi lại */
export function looksInactive(status: string | null): boolean {
  return status !== null && /ngừng|chấm dứt|bỏ địa chỉ|tạm ngừng/i.test(status)
}

export function useInvoiceBuyerForm({
  initial,
  lookup,
}: {
  initial: InvoiceBuyer | null
  /** Không truyền thì không tra — người nhập gõ tay */
  lookup?: (taxCode: string) => Promise<TaxCodeLookupView>
}) {
  const [draft, setDraft] = useState(() => draftOf(initial))
  const [errors, setErrors] = useState<InvoiceBuyerErrors>({})
  const [lookupState, setLookupState] = useState<LookupState>({ status: 'idle' })
  /** Ô người nhập đã tự gõ — kết quả tra không được ghi đè, chỉ gợi ý */
  const edited = useRef(new Set<Field>(initial ? ['name', 'address'] : []))
  const lookupRef = useRef(lookup)
  useEffect(() => {
    lookupRef.current = lookup
  }, [lookup])

  const taxCode = draft.kind === 'company' ? normalizeTaxCode(draft.taxCode) : ''
  useEffect(() => {
    if (!lookupRef.current || !isOrgTaxCode(taxCode)) {
      setLookupState({ status: 'idle' })
      return
    }
    let live = true
    // Đợi người gõ dừng tay: gõ 10 số là 10 lượt tra nếu không chờ
    const timer = setTimeout(() => {
      setLookupState({ status: 'loading' })
      lookupRef.current!(taxCode).then(
        (result) => {
          if (!live) return
          setLookupState({ status: 'found', result })
          setDraft((d) => ({
            ...d,
            name: edited.current.has('name') && d.name.trim() ? d.name : result.name,
            address:
              edited.current.has('address') && d.address.trim()
                ? d.address
                : (result.address ?? d.address),
            email: d.email || result.email || '',
            corporateId: result.corporateId ?? d.corporateId,
          }))
        },
        (err: { code?: string | null; message?: string }) => {
          if (!live) return
          setLookupState(
            err.code === 'tax_code_not_found'
              ? { status: 'not_found' }
              : {
                  status: 'unavailable',
                  message:
                    err.code === 'too_many_lookups'
                      ? 'Tra quá nhiều lần — đợi chút hoặc nhập tay'
                      : 'Chưa tra được lúc này — nhập tay tên và địa chỉ',
                },
          )
        },
      )
    }, 300)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [taxCode])

  const set = (field: Field, value: string) => {
    if (field === 'name' || field === 'address') edited.current.add(field)
    setDraft((d) => ({
      ...d,
      [field]: value,
      // Đổi MST là đổi công ty — hồ sơ B15 đã gắn không còn đúng
      ...(field === 'taxCode' ? { corporateId: undefined } : {}),
    }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const setKind = (kind: BuyerChoice) => {
    setDraft((d) => ({ ...d, kind }))
    setErrors({})
  }

  /** Lấy tên, địa chỉ theo kết quả tra — khi người nhập đã gõ khác */
  const applyLookup = () => {
    if (lookupState.status !== 'found') return
    const { result } = lookupState
    setDraft((d) => ({ ...d, name: result.name, address: result.address ?? d.address }))
    setErrors((e) => ({ ...e, name: undefined, address: undefined }))
  }

  /** Kiểm và trả người mua để gửi — lỗi thì hiện dưới từng ô */
  const validate = (): InvoiceBuyer | null | undefined => {
    const result = buyerOfDraft(draft)
    if (!result.ok) {
      setErrors(result.errors)
      return undefined
    }
    return result.buyer
  }

  return { draft, errors, lookupState, set, setKind, applyLookup, validate }
}

export type InvoiceBuyerForm = ReturnType<typeof useInvoiceBuyerForm>

const KIND_LABELS: Record<BuyerChoice, string> = {
  consumer: 'Người tiêu dùng',
  company: 'Công ty',
  person: 'Cá nhân',
}

/**
 * Các ô nhập người mua. `sm` 36px cho Office (chuột), `md` theo vùng chạm của app
 * (`--hit-target`: 44 khách · 52 POS).
 */
export function InvoiceBuyerFields({
  form,
  size = 'md',
  kinds = ['consumer', 'company', 'person'],
}: {
  form: InvoiceBuyerForm
  size?: 'sm' | 'md'
  /** Thứ tự và loại được chọn — iPad và web có thể bỏ "Cá nhân" khi chưa cần */
  kinds?: BuyerChoice[]
}) {
  const { draft, errors, lookupState } = form
  const height =
    size === 'sm'
      ? 'h-9 text-[length:var(--fs-b2)]'
      : 'h-[var(--hit-target)] text-[length:var(--fs-b1)]'

  const lookupNote = (() => {
    if (draft.kind !== 'company') return null
    const code = normalizeTaxCode(draft.taxCode)
    if (isOrgTaxCode(code) && !taxCodeChecksumOk(code)) {
      return { tone: 'warn', text: 'Số cuối của MST không khớp số kiểm tra — đọc lại từng số' }
    }
    switch (lookupState.status) {
      case 'loading':
        return { tone: 'mute', text: 'Đang tra mã số thuế…' }
      case 'not_found':
        return { tone: 'warn', text: 'Không thấy MST này — kiểm lại, hoặc nhập tay' }
      case 'unavailable':
        return { tone: 'mute', text: lookupState.message }
      case 'found': {
        const { result } = lookupState
        if (looksInactive(result.status)) {
          return { tone: 'warn', text: `Theo Cục Thuế: ${result.status} — hỏi lại khách` }
        }
        return { tone: 'mute', text: result.status ? `Theo Cục Thuế: ${result.status}` : null }
      }
      default:
        return null
    }
  })()

  const differs =
    lookupState.status === 'found' &&
    (draft.name.trim() !== lookupState.result.name ||
      (lookupState.result.address !== null && draft.address.trim() !== lookupState.result.address))

  return (
    <div className="flex flex-col gap-4">
      {kinds.length > 1 ? (
        <div role="radiogroup" aria-label="Xuất hoá đơn cho" className="flex gap-2">
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind}
              onClick={() => form.setKind(kind)}
              className={[
                'min-w-0 flex-1 rounded-sm border px-3',
                height,
                draft.kind === kind
                  ? 'border-accent bg-surface-3 font-semibold text-ink-hi'
                  : 'border-line-3 text-ink-body',
              ].join(' ')}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      ) : null}

      {draft.kind === 'consumer' ? (
        <p className="text-[length:var(--fs-b2)] text-ink-mute">
          Hoá đơn ghi “{CONSUMER_BUYER_LABEL}” — không cần thông tin người mua.
        </p>
      ) : null}

      {draft.kind === 'company' ? (
        <>
          <TextField
            label="Mã số thuế"
            value={draft.taxCode}
            onChange={(v) => form.set('taxCode', v)}
            error={errors.taxCode}
            note={lookupNote}
            height={height}
            inputMode="numeric"
            placeholder="0101234567"
            mono
          />
          <TextField
            label="Tên công ty"
            value={draft.name}
            onChange={(v) => form.set('name', v)}
            error={errors.name}
            height={height}
            placeholder="Đúng như giấy đăng ký kinh doanh"
          />
          <TextField
            label="Địa chỉ"
            value={draft.address}
            onChange={(v) => form.set('address', v)}
            error={errors.address}
            height={height}
          />
          {differs ? (
            <button
              type="button"
              onClick={form.applyLookup}
              className="self-start text-left text-[length:var(--fs-b2)] text-ink-body underline decoration-line-3 underline-offset-4"
            >
              Theo MST: {lookupState.status === 'found' ? lookupState.result.name : ''} — dùng tên
              và địa chỉ này
            </button>
          ) : null}
          <TextField
            label="Email nhận hoá đơn (không bắt buộc)"
            value={draft.email}
            onChange={(v) => form.set('email', v)}
            error={errors.email}
            height={height}
            type="email"
            autoCapitalize="none"
          />
          <TextField
            label="Người mua hàng (không bắt buộc)"
            value={draft.contactName}
            onChange={(v) => form.set('contactName', v)}
            error={errors.contactName}
            height={height}
          />
        </>
      ) : null}

      {draft.kind === 'person' ? (
        <>
          <TextField
            label="Họ tên"
            value={draft.name}
            onChange={(v) => form.set('name', v)}
            error={errors.name}
            height={height}
          />
          <TextField
            label="Mã số thuế hoặc số định danh (không bắt buộc)"
            value={draft.taxCode}
            onChange={(v) => form.set('taxCode', v)}
            error={errors.taxCode}
            height={height}
            inputMode="numeric"
            mono
          />
          <TextField
            label="Địa chỉ"
            value={draft.address}
            onChange={(v) => form.set('address', v)}
            error={errors.address}
            height={height}
          />
          <TextField
            label="Email nhận hoá đơn (không bắt buộc)"
            value={draft.email}
            onChange={(v) => form.set('email', v)}
            error={errors.email}
            height={height}
            type="email"
            autoCapitalize="none"
          />
          <TextField
            label="Số điện thoại (không bắt buộc)"
            value={draft.phone}
            onChange={(v) => form.set('phone', v)}
            error={errors.phone}
            height={height}
            inputMode="tel"
            mono
          />
        </>
      ) : null}
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  error,
  note,
  height,
  mono = false,
  ...rest
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  note?: { tone: string; text: string | null } | null
  height: string
  mono?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[length:var(--fs-c1)] text-ink-mute">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Máy dùng chung (iPad bàn, POS): trình duyệt không được nhớ thông tin của khách trước
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        className={[
          'w-full min-w-0 rounded-sm border bg-surface-3 px-3 text-ink-hi placeholder:text-ink-mute',
          height,
          mono ? 'font-mono tabular-nums' : '',
          error ? 'border-danger-line' : 'border-line-3',
        ].join(' ')}
        {...rest}
      />
      {error ? (
        <span className="text-[length:var(--fs-c1)] text-danger-line">{error}</span>
      ) : note?.text ? (
        <span
          className={[
            'text-[length:var(--fs-c1)]',
            note.tone === 'warn' ? 'text-warn' : 'text-ink-mute',
          ].join(' ')}
        >
          {note.text}
        </span>
      ) : null}
    </label>
  )
}
