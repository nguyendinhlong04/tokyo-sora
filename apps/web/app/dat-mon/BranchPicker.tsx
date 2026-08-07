'use client'

import { formatVnd } from '@sora/contracts'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { apiGet, type Branch, type DeliveryZone, type Quote } from '../../lib/api'
import { useOrder } from './order-context'

/**
 * O1 — chọn chi nhánh và cách nhận.
 *
 * Kiểm vùng giao NGAY tại đây, trước khi khách chọn món: biết mình ngoài vùng
 * sau khi đã bỏ đầy giỏ là lúc khó chịu nhất, và họ sẽ bỏ luôn cả đơn mang về mà
 * lẽ ra vẫn nhận được.
 */
export function BranchPicker({ branches }: { branches: Branch[] }) {
  const { draft, set } = useOrder()
  const router = useRouter()
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)

  const branchId = draft.branchId ?? branches[0]?.id ?? null

  useEffect(() => {
    if (!branchId || draft.mode !== 'delivery') return
    let cancelled = false
    apiGet<DeliveryZone[]>(`/api/online/zones?branch=${branchId}`)
      .then((rows) => !cancelled && setZones(rows))
      .catch(() => !cancelled && setZones([]))
    return () => {
      cancelled = true
    }
  }, [branchId, draft.mode])

  useEffect(() => {
    if (!branchId || draft.mode !== 'delivery' || !draft.ward) {
      setQuote(null)
      return
    }
    let cancelled = false
    apiGet<Quote>(`/api/online/quote?branch=${branchId}&ward=${encodeURIComponent(draft.ward)}`)
      .then((q) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setQuote(null))
    return () => {
      cancelled = true
    }
  }, [branchId, draft.mode, draft.ward])

  const ready =
    branchId !== null &&
    (draft.mode === 'takeaway' || (draft.address.trim() !== '' && quote?.inZone === true))

  return (
    <>
      <p className="mt-5 text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase sm:mt-7">
        Chi nhánh
      </p>
      <div className="mt-3 grid gap-3">
        {branches.map((branch) => {
          const picked = branch.id === branchId
          return (
            <button
              key={branch.id}
              type="button"
              onClick={() => set({ branchId: branch.id })}
              className={[
                /* p-3.5 và hai khoảng 2 bên dưới là phần còn lại của 28 điểm ảnh
                   phải giành lại cho khối "Cách nhận" — ba thẻ nên mỗi điểm nhân ba */
                'rounded-md border p-3.5 text-left transition-colors sm:p-4',
                picked ? 'border-accent bg-surface-4' : 'border-line-3 hover:border-line-4',
              ].join(' ')}
            >
              <span className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                {branch.name}
              </span>
              <span className="mt-2 block sm:mt-2.5 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
                {branch.address}
              </span>
              {branch.openHours?.raw ? (
                <span className="mt-2 block sm:mt-2.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {branch.openHours.raw}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <p className="mt-5 text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase sm:mt-7">
        Cách nhận
      </p>
      <div className="mt-3 flex overflow-hidden rounded-sm border border-line-3">
        {(
          [
            { mode: 'takeaway' as const, label: 'Mang về' },
            { mode: 'delivery' as const, label: 'Giao hàng' },
          ]
        ).map((option) => (
          <button
            key={option.mode}
            type="button"
            onClick={() => set({ mode: option.mode })}
            className={[
              'h-13 flex-1 text-[length:var(--fs-b1)]',
              draft.mode === option.mode
                ? 'bg-accent-strong font-semibold text-on-accent'
                : 'text-ink-body',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {draft.mode === 'delivery' ? (
        <div className="mt-5">
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
            Địa chỉ giao
          </p>
          <input
            value={draft.address}
            onChange={(e) => set({ address: e.target.value })}
            placeholder="Số nhà, đường"
            className="mt-3 h-13 w-full rounded-sm border border-line-3 bg-surface-4 px-3.5 text-[length:var(--fs-b1)] text-ink-hi"
          />
          <select
            value={draft.ward}
            onChange={(e) => set({ ward: e.target.value })}
            className="mt-3 h-13 w-full rounded-sm border border-line-3 bg-surface-4 px-3 text-[length:var(--fs-b1)] text-ink-hi"
          >
            <option value="">Chọn phường/xã</option>
            {zones.map((zone) => (
              <optgroup key={zone.id} label={zone.name}>
                {zone.wards.map((ward) => (
                  <option key={ward} value={ward}>
                    {ward}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {quote?.inZone === true ? (
            <div className="mt-3.5 rounded-md border border-ok bg-ok/8 p-4">
              <p className="text-[length:var(--fs-b1)] leading-relaxed text-ink-hi">
                {quote.zone.name} · phí giao {formatVnd(quote.feeVnd)} · khoảng {quote.etaMinutes}{' '}
                phút
              </p>
              <p className="mt-1.5 text-[length:var(--fs-b2)] text-ink-body">
                Nhận đơn từ {formatVnd(quote.minOrderVnd)} tiền món trở lên.
              </p>
            </div>
          ) : null}

          {quote?.inZone === false ? (
            <div className="mt-3.5 rounded-md border border-danger bg-danger/8 p-4">
              <p className="text-[length:var(--fs-b1)] leading-relaxed text-ink-hi">
                Ngoài vùng giao của chi nhánh này.
              </p>
              <button
                type="button"
                onClick={() => set({ mode: 'takeaway' })}
                className="mt-3 h-11 w-full rounded-sm border border-accent text-[length:var(--fs-b2)] text-accent-ink"
              >
                Đổi sang mang về
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-line-1 bg-surface-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            disabled={!ready}
            onClick={() => branchId && router.push(`/dat-mon/${branchId}`)}
            className="h-14 w-full rounded-sm bg-accent-strong text-[length:var(--fs-b1)] font-semibold text-on-accent disabled:bg-transparent disabled:text-ink-mute disabled:outline disabled:outline-line-4"
          >
            {draft.mode === 'delivery' && !draft.ward ? 'Chọn phường để xem phí giao' : 'Xem thực đơn'}
          </button>
        </div>
      </div>
    </>
  )
}
