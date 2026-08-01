'use client'

import { formatVnd } from '@sora/contracts'
import { useEffect, useState } from 'react'
import type { OnlineDish } from '../../../lib/api'
import { useOrder } from '../order-context'

/** O3 — chi tiết món, mở từ thực đơn */
export function DishSheet({ dish, onClose }: { dish: OnlineDish; onClose: () => void }) {
  const { add } = useOrder()
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-100" role="dialog" aria-modal="true" aria-label={dish.nameVi}>
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/72"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92%] flex-col rounded-t-lg border-t border-line-2 bg-surface-2 sm:inset-y-auto sm:top-1/2 sm:left-1/2 sm:max-h-[86%] sm:w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border">
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-11 rounded-pill bg-line-3" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-4">
          <div className="grid aspect-3/2 w-full place-items-center rounded-md border border-line-1 bg-[radial-gradient(120%_100%_at_50%_18%,var(--sora-line-1)_0%,var(--sora-surface-4)_76%)]">
            <span className="font-jp text-[104px] leading-none text-gold-900">
              {dish.kana ?? '空'}
            </span>
          </div>

          <p className="mt-5 text-[length:var(--fs-t1)] font-semibold text-ink-hi">{dish.nameVi}</p>
          {dish.nameJa ? (
            <p className="mt-1.5 font-jp tracking-[0.12em] text-[length:var(--fs-b2)] text-accent-ink">
              {dish.nameJa}
            </p>
          ) : null}
          <p className="mt-3.5 font-mono text-[length:var(--fs-t2)] text-accent-ink">
            {formatVnd(dish.price)}
          </p>
          {dish.shortDesc ? (
            <p className="mt-3 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
              {dish.shortDesc}
            </p>
          ) : null}

          {dish.soldOut ? (
            <p className="mt-4.5 rounded-md border border-danger bg-danger/8 p-4 text-[length:var(--fs-b1)] leading-relaxed text-ink-hi">
              Món này tạm hết hôm nay. Chọn giúp bạn món khác trong thực đơn nhé.
            </p>
          ) : null}

          {dish.allergens && dish.allergens.length > 0 ? (
            <div className="mt-4.5 flex flex-wrap gap-2">
              {dish.allergens.map((a) => (
                <span
                  key={a}
                  className="inline-flex h-7.5 items-center rounded-pill border border-line-3 px-3 text-[length:var(--fs-c1)] text-ink-body"
                >
                  {a}
                </span>
              ))}
            </div>
          ) : null}

          {dish.bestWithin30 ? (
            <p className="mt-4.5 rounded-md border border-warn bg-warn/8 p-4 text-[length:var(--fs-b1)] leading-relaxed text-gold-200">
              Ngon nhất trong 30 phút — nên chọn khung giờ gần nhất.
            </p>
          ) : null}

          <div className="mt-6 pb-6">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
              Ghi chú cho bếp
            </p>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Ví dụ: cắt dày, không hành"
              className="mt-3 w-full resize-y rounded-sm border border-line-3 bg-surface-4 px-3.5 py-3 text-[length:var(--fs-b1)] leading-relaxed text-ink-hi"
            />
          </div>
        </div>

        <div className="flex flex-none gap-3 border-t border-accent/16 bg-surface-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex h-14 flex-none items-center rounded-sm border border-line-3">
            <button
              type="button"
              aria-label="Bớt một"
              onClick={() => setQty((n) => Math.max(1, n - 1))}
              className="h-full w-11 text-[length:var(--fs-t2)] text-accent-ink"
            >
              −
            </button>
            <span className="min-w-8 text-center font-mono text-[length:var(--fs-t2)] text-ink-hi">
              {qty}
            </span>
            <button
              type="button"
              aria-label="Thêm một"
              onClick={() => setQty((n) => Math.min(99, n + 1))}
              className="h-full w-11 text-[length:var(--fs-t2)] text-accent-ink"
            >
              +
            </button>
          </div>
          <button
            type="button"
            disabled={dish.soldOut}
            onClick={() => {
              add(dish, qty, note)
              onClose()
            }}
            className="h-14 flex-1 rounded-sm bg-accent-strong text-[length:var(--fs-b1)] font-semibold text-on-accent disabled:bg-transparent disabled:text-ink-mute disabled:outline disabled:outline-line-4"
          >
            Thêm · {formatVnd(dish.price * qty)}
          </button>
        </div>
      </div>
    </div>
  )
}
