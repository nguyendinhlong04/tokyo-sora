'use client'

import { formatVnd } from '@sora/contracts'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ApiError, apiGet, apiPost, type CreatedOrder, type Quote } from '../../../../lib/api'
import { useOrder } from '../../order-context'

const METHODS = [
  {
    id: 'vietqr' as const,
    name: 'Chuyển khoản VietQR',
    hint: 'Quét mã bằng app ngân hàng. Đơn xuống bếp ngay khi ngân hàng báo có.',
  },
  {
    id: 'cod' as const,
    name: 'Trả khi nhận',
    hint: 'Trả tiền mặt cho shipper hoặc tại quầy khi tới lấy.',
  },
]

/** O6 — chọn cách trả rồi đặt đơn */
export function PayStep({ branchId }: { branchId: string }) {
  const { draft, sub, set, clear } = useOrder()
  const router = useRouter()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (draft.mode !== 'delivery' || !draft.ward) return
    let cancelled = false
    apiGet<Quote>(`/api/online/quote?branch=${branchId}&ward=${encodeURIComponent(draft.ward)}`)
      .then((q) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setQuote(null))
    return () => {
      cancelled = true
    }
  }, [branchId, draft.mode, draft.ward])

  const ship = quote?.inZone ? quote.feeVnd : 0

  /**
   * Đặt đơn. Máy chủ tính lại toàn bộ tiền — con số hiện ở đây chỉ để khách biết
   * mình sắp trả bao nhiêu, không phải thứ được tin.
   */
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await apiPost<CreatedOrder>('/api/online/orders', {
        branchId,
        type: draft.mode,
        customer: {
          name: draft.customer.name.trim(),
          phone: draft.customer.phone.replace(/\s/g, ''),
          address: draft.mode === 'delivery' ? draft.address.trim() : null,
          ward: draft.mode === 'delivery' ? draft.ward : null,
          note: draft.customer.note.trim() || null,
        },
        lines: draft.lines.map((l) => ({
          dishId: l.dishId,
          qty: l.qty,
          note: l.note.trim() || null,
        })),
        slotMode: draft.slotAt ? 'scheduled' : 'asap',
        slotAt: draft.slotAt,
      })

      clear()
      const suffix = draft.payment === 'vietqr' ? '?tra-ngay=1' : ''
      router.replace(`/dat-mon/don/${created.trackToken}${suffix}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đặt được đơn, thử lại giúp bạn')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">Thanh toán</h1>
      <p className="mt-2.5 text-[length:var(--fs-b1)] text-ink-mute">
        Tổng {formatVnd(sub + ship)}
        {draft.mode === 'delivery' ? ` (gồm ${formatVnd(ship)} phí giao)` : ''}
      </p>

      <div className="mt-6 grid gap-3">
        {METHODS.map((method) => {
          const picked = draft.payment === method.id
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => {
                set({ payment: method.id })
                setError(null)
              }}
              className={[
                'rounded-md border p-4 text-left',
                picked ? 'border-accent bg-surface-4' : 'border-line-3',
              ].join(' ')}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                  {method.name}
                </span>
                {picked ? <span className="text-accent">✓</span> : null}
              </span>
              <span className="mt-2 block text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
                {method.hint}
              </span>
            </button>
          )
        })}
      </div>

      {error ? (
        <p className="mt-5 rounded-md border border-danger bg-danger/8 p-4 text-[length:var(--fs-b1)] text-ink-hi">
          {error}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-line-1 bg-surface-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            disabled={busy || draft.lines.length === 0}
            onClick={submit}
            className="h-14 w-full rounded-sm bg-accent-strong text-[length:var(--fs-b1)] font-semibold text-on-accent disabled:bg-transparent disabled:text-ink-mute disabled:outline disabled:outline-line-4"
          >
            {busy ? 'Đang gửi đơn…' : `Đặt đơn · ${formatVnd(sub + ship)}`}
          </button>
        </div>
      </div>
    </main>
  )
}
