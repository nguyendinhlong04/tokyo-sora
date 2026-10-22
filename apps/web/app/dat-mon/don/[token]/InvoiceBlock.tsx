'use client'

import {
  CONSUMER_BUYER_LABEL,
  invoiceNumberLabel,
  type InvoiceBuyer,
  type InvoiceStatus,
  type InvoiceView,
} from '@sora/contracts'
import { InvoiceBuyerFields, useInvoiceBuyerForm } from '@sora/ui/InvoiceBuyer'
import { useState } from 'react'
import { ApiError, apiPut, lookupTaxCode } from '../../../../lib/api'

/**
 * O7 — hoá đơn điện tử của đơn web (§9.7).
 *
 * Trước lúc phát hành khách còn bổ sung hay sửa người mua (`editable` do máy chủ
 * tính). Phát hành rồi thì sửa là lập hoá đơn thay thế ở quầy. Không dùng màu đỏ:
 * hoá đơn chưa lên được là việc của quán, khách không phải làm gì.
 */
export function InvoiceBlock({
  token,
  status,
  onChange,
}: {
  token: string
  status: InvoiceStatus
  onChange: (status: InvoiceStatus) => void
}) {
  const [editing, setEditing] = useState(false)
  const invoice = status.invoice
  // Phát hành rồi thì đọc người mua trên chính hoá đơn — thứ đã gửi cơ quan thuế
  const buyer =
    invoice?.state === 'issued' && invoice.document ? invoice.document.buyer : status.buyer

  return (
    <section className="mt-4 rounded-md border border-line-2 bg-surface-1 p-5">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
        Hoá đơn VAT
      </p>

      {editing && status.editable ? (
        <BuyerEditor
          token={token}
          buyer={status.buyer}
          onSaved={(next) => {
            onChange(next)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="mt-3 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
            {invoice?.state === 'issued' ? (
              <>
                Đã phát hành ·{' '}
                <span className="font-mono text-ink-hi">{invoiceNumberLabel(invoice)}</span>
              </>
            ) : invoice?.state === 'failed' ? (
              'Quán sẽ gửi lại hoá đơn trong hôm nay — bạn không cần làm gì.'
            ) : invoice?.state === 'pending' ? (
              'Đang lập hoá đơn điện tử…'
            ) : buyer ? (
              'Hoá đơn lập khi quán nhận đủ tiền — đơn giao thì lúc giao xong — và ghi:'
            ) : (
              `Hoá đơn ghi “${CONSUMER_BUYER_LABEL}”.`
            )}
          </p>

          {buyer ? (
            <div className="mt-3 rounded-sm border border-line-1 bg-surface-2 px-4 py-3">
              <p className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">{buyer.name}</p>
              {buyer.taxCode ? (
                <p className="mt-0.5 font-mono text-[length:var(--fs-b2)] text-ink-body">
                  MST {buyer.taxCode}
                </p>
              ) : null}
              {buyer.email ? (
                <p className="mt-0.5 text-[length:var(--fs-b2)] text-ink-mute">
                  Gửi về {buyer.email}
                </p>
              ) : null}
            </div>
          ) : invoice?.state === 'issued' ? (
            <p className="mt-1 text-[length:var(--fs-b2)] text-ink-mute">{CONSUMER_BUYER_LABEL}</p>
          ) : null}

          {invoice?.state === 'issued' ? <Lookup invoice={invoice} /> : null}

          {status.editable ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-4 h-13 w-full rounded-sm border border-accent text-[length:var(--fs-b1)] text-accent-ink"
            >
              {buyer ? 'Sửa thông tin xuất hoá đơn' : 'Xuất hoá đơn công ty'}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

/** Mã tra cứu và đường tới trang tra cứu của nhà cung cấp hoá đơn */
function Lookup({ invoice }: { invoice: InvoiceView }) {
  // Địa chỉ do nhà cung cấp trả về — chỉ nhận https, không đặt thẳng vào `href`
  const url = invoice.lookupUrl && /^https:\/\//.test(invoice.lookupUrl) ? invoice.lookupUrl : null
  return (
    <>
      {invoice.lookupCode ? (
        <p className="mt-3 font-mono text-[length:var(--fs-b2)] text-ink-body">
          Mã tra cứu {invoice.lookupCode}
        </p>
      ) : null}
      {invoice.test ? (
        <p className="mt-1 text-[length:var(--fs-b2)] text-ink-mute">
          Hoá đơn thử — bản giả lập, không có giá trị.
        </p>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex h-13 w-full items-center justify-center rounded-sm border border-accent text-[length:var(--fs-b1)] text-accent-ink"
        >
          Tra cứu hoá đơn
        </a>
      ) : null}
      <p className="mt-3 text-[length:var(--fs-b2)] leading-relaxed text-ink-mute">
        Thông tin trên hoá đơn sai? Gọi quán{' '}
        <span className="whitespace-nowrap">024 3782 4400</span> — quán lập hoá đơn thay thế.
      </p>
    </>
  )
}

function BuyerEditor({
  token,
  buyer,
  onSaved,
  onCancel,
}: {
  token: string
  buyer: InvoiceBuyer | null
  onSaved: (status: InvoiceStatus) => void
  onCancel: () => void
}) {
  const form = useInvoiceBuyerForm({
    initial: buyer,
    lookup: lookupTaxCode,
    defaultKind: 'company',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (next: InvoiceBuyer | null) => {
    setBusy(true)
    setError(null)
    try {
      onSaved(
        await apiPut<InvoiceStatus>(`/api/online/track/${token}/invoice-buyer`, { buyer: next }),
      )
    } catch (err) {
      // 409 khi hoá đơn vừa phát hành trong lúc khách gõ — máy chủ nói rõ vì sao
      setError(err instanceof ApiError ? err.message : 'Chưa lưu được, thử lại giúp bạn')
      setBusy(false)
    }
  }

  const submit = () => {
    const next = form.validate()
    if (next !== undefined) void save(next)
  }

  return (
    <div className="mt-4">
      <InvoiceBuyerFields form={form} size="lg" kinds={['company', 'person']} />
      {error ? (
        <p className="mt-4 rounded-md border border-danger bg-danger/8 p-4 text-[length:var(--fs-b1)] text-ink-hi">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="h-13 flex-1 rounded-sm border border-line-4 text-[length:var(--fs-b1)] text-ink-body"
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="h-13 flex-[2] rounded-sm bg-accent-strong text-[length:var(--fs-b1)] font-semibold text-on-accent"
        >
          {busy ? 'Đang lưu…' : 'Lưu thông tin'}
        </button>
      </div>
      {buyer ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(null)}
          className="mt-3 h-11 text-[length:var(--fs-b2)] text-ink-mute underline underline-offset-4"
        >
          Không xuất hoá đơn công ty nữa
        </button>
      ) : null}
    </div>
  )
}
