'use client'

import { formatVnd } from '@sora/contracts'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiGet, type Quote, type Slot } from '../../../../lib/api'
import { useOrder } from '../../order-context'

/** Giờ treo tường của một khung, theo múi giờ máy khách — khách và quán cùng ở VN */
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

/** O4 — giỏ và chọn giờ nhận */
export function CartAndSlot({ branchId }: { branchId: string }) {
  const { draft, set, setQty, sub } = useOrder()
  const [slots, setSlots] = useState<Slot[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)

  useEffect(() => {
    let cancelled = false
    apiGet<{ slots: Slot[] }>(`/api/online/slots?branch=${branchId}`)
      .then((res) => !cancelled && setSlots(res.slots))
      .catch(() => !cancelled && setSlots([]))
    return () => {
      cancelled = true
    }
  }, [branchId])

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
  const firstOpen = slots.find((s) => s.open)

  if (draft.lines.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-16 pb-24 text-center">
        <span className="font-jp text-[56px] leading-none text-gold-900">空</span>
        <p className="mt-6 text-[length:var(--fs-t2)] font-medium text-ink-hi">
          Chưa có món nào trong giỏ.
        </p>
        <Link
          href={`/dat-mon/${branchId}`}
          className="mt-8 inline-flex h-13 items-center rounded-sm border border-accent px-6 text-[length:var(--fs-b1)] text-accent-ink"
        >
          Xem thực đơn
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
        Giỏ của bạn
      </h1>

      <div className="mt-3">
        {draft.lines.map((line) => (
          <div key={`${line.dishId}#${line.note}`} className="border-b border-surface-4 py-3.5">
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1 text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                {line.name}
              </span>
              <span className="flex-none font-mono text-[length:var(--fs-b1)] text-accent-ink">
                {formatVnd(line.price * line.qty)}
              </span>
            </div>
            {line.note ? (
              <p className="mt-1.5 pl-3 text-[length:var(--fs-c1)] text-warn">▸ {line.note}</p>
            ) : null}
            <div className="mt-3 flex h-11 w-fit items-center rounded-sm border border-line-3">
              <button
                type="button"
                aria-label={`Bớt ${line.name}`}
                onClick={() => setQty(line.dishId, line.qty - 1)}
                className="h-full w-11 text-[length:var(--fs-t2)] text-accent-ink"
              >
                −
              </button>
              <span className="min-w-8 text-center font-mono text-[length:var(--fs-b1)] text-ink-hi">
                {line.qty}
              </span>
              <button
                type="button"
                aria-label={`Thêm ${line.name}`}
                onClick={() => setQty(line.dishId, line.qty + 1)}
                className="h-full w-11 text-[length:var(--fs-t2)] text-accent-ink"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <section className="pt-7">
        <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
          Nhận lúc nào
        </p>

        <button
          type="button"
          onClick={() => set({ slotAt: null })}
          className={[
            'mt-3 flex h-16 w-full items-center justify-between rounded-sm border px-4 text-left',
            draft.slotAt === null ? 'border-accent bg-surface-4' : 'border-line-3',
          ].join(' ')}
        >
          <span>
            <span className="block text-[length:var(--fs-b1)] font-semibold text-ink-hi">
              Sớm nhất
            </span>
            <span className="mt-1 block text-[length:var(--fs-b2)] text-ink-mute">
              {firstOpen ? `khoảng ${hhmm(firstOpen.at)}` : 'hôm nay đã hết khung nhận đơn'}
            </span>
          </span>
          {draft.slotAt === null ? <span className="text-accent">✓</span> : null}
        </button>

        <p className="mt-4 text-[length:var(--fs-b2)] text-ink-mute">Hoặc chọn khung 15 phút</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((slot) => {
            const picked = draft.slotAt === slot.at
            return (
              <button
                key={slot.at}
                type="button"
                disabled={!slot.open}
                onClick={() => set({ slotAt: slot.at })}
                className={[
                  'flex h-14 flex-col items-center justify-center rounded-sm border text-[length:var(--fs-b2)]',
                  picked
                    ? 'border-accent bg-surface-4 text-gold-200'
                    : slot.open
                      ? 'border-line-3 text-ink-body'
                      : 'border-line-2 text-ink-mute',
                ].join(' ')}
              >
                <span className="font-mono">{hhmm(slot.at)}</span>
                {slot.closedReason === 'full' ? (
                  <span className="text-[length:var(--fs-c2)]">Kín chỗ</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="pt-7">
        <Row label="Tạm tính" value={sub} />
        {draft.mode === 'delivery' ? <Row label="Phí giao" value={ship} /> : null}
        <div className="mt-2 flex items-baseline justify-between border-t border-accent/16 pt-4">
          <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Tổng</span>
          <span className="font-mono text-[length:var(--fs-t1)] text-accent-ink">
            {formatVnd(sub + ship)}
          </span>
        </div>
        {quote?.inZone === true && sub < quote.minOrderVnd ? (
          <p className="mt-3 rounded-md border border-warn bg-warn/8 p-4 text-[length:var(--fs-b1)] text-gold-200">
            Vùng {quote.zone.name} nhận đơn từ {formatVnd(quote.minOrderVnd)} tiền món — còn thiếu{' '}
            {formatVnd(quote.minOrderVnd - sub)}.
          </p>
        ) : null}
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-line-1 bg-surface-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          <Link
            href={`/dat-mon/${branchId}/nguoi-nhan`}
            aria-disabled={quote?.inZone === true && sub < quote.minOrderVnd}
            className={[
              'flex h-14 items-center justify-center rounded-sm text-[length:var(--fs-b1)] font-semibold',
              quote?.inZone === true && sub < quote.minOrderVnd
                ? 'pointer-events-none border border-line-4 text-ink-mute'
                : 'bg-accent-strong text-on-accent',
            ].join(' ')}
          >
            Tiếp tục · {formatVnd(sub + ship)}
          </Link>
        </div>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-[length:var(--fs-b1)] text-ink-body">{label}</span>
      <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">{formatVnd(value)}</span>
    </div>
  )
}
