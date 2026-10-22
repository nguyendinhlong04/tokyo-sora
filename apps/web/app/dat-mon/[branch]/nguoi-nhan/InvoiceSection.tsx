'use client'

import { InvoiceBuyerFields, type InvoiceBuyerForm } from '@sora/ui/InvoiceBuyer'

/**
 * O5 "Xuất hoá đơn công ty (VAT)" — mục mở/đóng, không bắt buộc. Đóng lại là hoá
 * đơn ghi "Bán cho người tiêu dùng". Hoá đơn lập lúc quán nhận đủ tiền (đơn giao:
 * lúc giao xong), gửi về email khách để lại.
 */
export function InvoiceSection({
  open,
  onToggle,
  form,
}: {
  open: boolean
  onToggle: (open: boolean) => void
  form: InvoiceBuyerForm
}) {
  return (
    <section className="rounded-md border border-line-2 bg-surface-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(!open)}
        className="flex min-h-13 w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[length:var(--fs-b1)] font-semibold text-ink-hi">
            Xuất hoá đơn công ty (VAT)
          </span>
          <span className="mt-0.5 block text-[length:var(--fs-b2)] text-ink-mute">
            Không bắt buộc — để trống thì hoá đơn ghi người tiêu dùng
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className={[
            'flex-none text-ink-mute transition-transform',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="border-t border-line-1 px-4 pt-4 pb-5">
          <InvoiceBuyerFields form={form} size="lg" kinds={['company', 'person']} />
          <p className="mt-4 text-[length:var(--fs-b2)] leading-relaxed text-ink-mute">
            Hoá đơn điện tử lập lúc quán nhận đủ tiền — đơn giao thì lúc giao xong — và gửi về email
            bạn để lại.
          </p>
        </div>
      ) : null}
    </section>
  )
}
