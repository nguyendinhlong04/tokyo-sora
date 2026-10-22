'use client'

import { formatVnd } from '@sora/contracts'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ApiError, apiGet, apiPost, type CreatedOrder, type Quote } from '../../../../lib/api'
import { useOrder } from '../../order-context'
import { usePromos } from '../../promotions'

/**
 * O6 — đặt đơn rồi trả trước.
 *
 * Không còn chọn cách trả: mọi đơn web đều trả trước bằng VietQR. Đơn giao chỉ
 * trả trước TIỀN MÓN, phí giao để shipper thu tận tay — người giao đi đường không
 * cầm theo cả tiền món của khách.
 */
export function PayStep({ branchId }: { branchId: string }) {
  const { draft, clear } = useOrder()
  const promos = usePromos()
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
  // Đúng phép tính máy chủ sẽ chạy — số trên nút bấm là số mã QR sẽ đòi (§9.6)
  const pricing = promos.priceCart(draft.lines, { mode: draft.mode, ship })

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
          invoiceBuyer: draft.invoiceBuyer,
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
      // Sang thẳng mã QR: đơn chưa có tiền là đơn chưa xuống bếp, đừng bắt khách
      // bấm thêm một nút nữa mới thấy chỗ trả
      router.replace(`/dat-mon/don/${created.trackToken}?tra-ngay=1`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đặt được đơn, thử lại giúp bạn')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">Thanh toán</h1>
      <p className="mt-2.5 text-[length:var(--fs-b1)] text-ink-mute">
        Tổng {formatVnd(pricing.money.total)}
        {draft.mode === 'delivery' ? ` (gồm ${formatVnd(ship)} phí giao)` : ''}
        {pricing.money.discount > 0 ? ` · đã giảm ${formatVnd(pricing.money.discount)}` : ''}
      </p>

      {/* Chia đôi con số ngay tại đây, trước khi khách bấm: người giao chỉ cầm phí
          giao, nên khách phải biết mình sắp chuyển khoản bao nhiêu và sẽ còn phải
          cầm sẵn bao nhiêu tiền mặt lúc mở cửa. */}
      <section className="mt-6 rounded-md border border-accent/16 bg-surface-4 p-5">
        <p className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
          Chuyển khoản trước bằng VietQR
        </p>
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line-1 pt-3.5">
          <span className="text-[length:var(--fs-b1)] text-ink-body">
            {draft.mode === 'delivery' ? 'Tiền món — trả ngay bước sau' : 'Tiền món'}
          </span>
          <span className="font-mono text-[length:var(--fs-t2)] text-accent-ink">
            {formatVnd(pricing.prepay)}
          </span>
        </div>
        {draft.mode === 'delivery' ? (
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="text-[length:var(--fs-b1)] text-ink-body">
              Phí giao — trả tiền mặt cho người giao
            </span>
            <span className="font-mono text-[length:var(--fs-t2)] text-ink-hi">
              {formatVnd(ship)}
            </span>
          </div>
        ) : null}
        <p className="mt-4 text-[length:var(--fs-b2)] leading-relaxed text-ink-mute">
          Bấm đặt đơn là hiện mã QR. Đơn xuống bếp ngay khi ngân hàng báo có; quá 15 phút chưa
          nhận được tiền thì đơn tự huỷ.
        </p>
      </section>

      {draft.invoiceBuyer ? (
        <section className="mt-4 flex items-start justify-between gap-4 rounded-md border border-line-2 bg-surface-1 p-5">
          <div className="min-w-0">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Xuất hoá đơn VAT cho
            </p>
            <p className="mt-2 text-[length:var(--fs-b1)] font-semibold text-ink-hi">
              {draft.invoiceBuyer.name}
            </p>
            {draft.invoiceBuyer.taxCode ? (
              <p className="mt-1 font-mono text-[length:var(--fs-b2)] text-ink-body">
                MST {draft.invoiceBuyer.taxCode}
              </p>
            ) : null}
            <p className="mt-1 text-[length:var(--fs-b2)] text-ink-mute">
              {draft.invoiceBuyer.email
                ? `Gửi về ${draft.invoiceBuyer.email}`
                : 'Xem và tải ở trang theo dõi đơn'}
            </p>
          </div>
          <Link
            href={`/dat-mon/${branchId}/nguoi-nhan`}
            className="flex h-11 flex-none items-center px-1 text-[length:var(--fs-b2)] text-accent-ink underline underline-offset-4"
          >
            Sửa
          </Link>
        </section>
      ) : null}

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
            {busy ? 'Đang gửi đơn…' : `Đặt đơn và trả ${formatVnd(pricing.prepay)}`}
          </button>
        </div>
      </div>
    </main>
  )
}
