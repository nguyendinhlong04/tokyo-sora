'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useOrder } from '../../order-context'

/** Số điện thoại Việt Nam: 10 số, bắt đầu bằng 0 */
const PHONE = /^0\d{9}$/

/** O5 — người nhận */
export function RecipientForm({ branchId }: { branchId: string }) {
  const { draft, set } = useOrder()
  const { customer } = draft

  const phoneOk = PHONE.test(customer.phone.replace(/\s/g, ''))
  const ready =
    customer.name.trim().length > 1 &&
    phoneOk &&
    (draft.mode === 'takeaway' || draft.address.trim() !== '')

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">Người nhận</h1>
      <p className="mt-2.5 text-[length:var(--fs-b1)] text-ink-mute">
        Chúng tôi chỉ gọi khi shipper tới cửa.
      </p>

      <div className="mt-6 grid gap-5">
        <Field label="Tên">
          <input
            value={customer.name}
            onChange={(e) => set({ customer: { ...customer, name: e.target.value } })}
            placeholder="Nguyễn Minh"
            autoComplete="name"
            className="h-13 w-full rounded-sm border border-line-3 bg-surface-4 px-3.5 text-[length:var(--fs-b1)] text-ink-hi"
          />
        </Field>

        <Field label="Số điện thoại">
          <input
            value={customer.phone}
            onChange={(e) => set({ customer: { ...customer, phone: e.target.value } })}
            placeholder="09xx xxx xxx"
            inputMode="tel"
            autoComplete="tel"
            className="h-13 w-full rounded-sm border border-line-3 bg-surface-4 px-3.5 font-mono text-[length:var(--fs-b1)] text-ink-hi"
          />
          {customer.phone && !phoneOk ? (
            <p className="mt-2 text-[length:var(--fs-b2)] text-danger">
              Số điện thoại 10 chữ số, bắt đầu bằng 0 — shipper cần gọi được cho bạn.
            </p>
          ) : null}
        </Field>

        {draft.mode === 'delivery' ? (
          <Field label="Địa chỉ">
            <input
              value={draft.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="Số nhà, đường"
              autoComplete="street-address"
              className="h-13 w-full rounded-sm border border-line-3 bg-surface-4 px-3.5 text-[length:var(--fs-b1)] text-ink-hi"
            />
            <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
              Phường {draft.ward || '—'} · đổi ở bước chọn chi nhánh
            </p>
          </Field>
        ) : null}

        <Field label={draft.mode === 'delivery' ? 'Ghi chú giao' : 'Ghi chú'}>
          <textarea
            rows={2}
            value={customer.note}
            onChange={(e) => set({ customer: { ...customer, note: e.target.value } })}
            maxLength={300}
            placeholder={
              draft.mode === 'delivery' ? 'Gọi trước khi lên, cổng sau…' : 'Tới lấy lúc mấy giờ…'
            }
            className="w-full resize-y rounded-sm border border-line-3 bg-surface-4 px-3.5 py-3 text-[length:var(--fs-b1)] leading-relaxed text-ink-hi"
          />
        </Field>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line-1 bg-surface-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          <Link
            href={`/dat-mon/${branchId}/thanh-toan`}
            aria-disabled={!ready}
            className={[
              'flex h-14 items-center justify-center rounded-sm text-[length:var(--fs-b1)] font-semibold',
              ready
                ? 'bg-accent-strong text-on-accent'
                : 'pointer-events-none border border-line-4 text-ink-mute',
            ].join(' ')}
          >
            Tới bước thanh toán
          </Link>
        </div>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}
