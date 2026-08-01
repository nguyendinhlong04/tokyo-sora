'use client'

import { formatVnd } from '@sora/contracts'
import { QrCode } from '@sora/ui/QrCode'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, type PaymentTicket, type TrackedOrder } from '../../../../lib/api'

/** Năm bước khách nhìn thấy, đúng thang than hồng của §23.2 */
const STEPS: { status: TrackedOrder['status']; label: string }[] = [
  { status: 'new', label: 'Đã nhận đơn' },
  { status: 'confirmed', label: 'Quán xác nhận' },
  { status: 'cooking', label: 'Bếp đang làm' },
  { status: 'ready', label: 'Đóng gói xong' },
  { status: 'delivering', label: 'Đang giao' },
]

const ORDER: TrackedOrder['status'][] = [
  'new',
  'confirmed',
  'cooking',
  'ready',
  'delivering',
  'done',
]

/** O7 theo dõi đơn · O13 mã VietQR · O14 chờ ngân hàng xác nhận */
export function TrackOrder({ token }: { token: string }) {
  const params = useSearchParams()
  const [order, setOrder] = useState<TrackedOrder | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [ticket, setTicket] = useState<PaymentTicket | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setOrder(await apiGet<TrackedOrder>(`/api/online/track/${token}`))
    } catch {
      setNotFound(true)
    }
  }, [token])

  useEffect(() => {
    void load()
    // Đơn đi qua bếp và shipper trong lúc khách nhìn màn này — hỏi lại đều đặn.
    const timer = setInterval(() => void load(), 10_000)
    return () => clearInterval(timer)
  }, [load])

  const createQr = useCallback(async () => {
    setPayError(null)
    try {
      setTicket(await apiPost<PaymentTicket>(`/api/online/track/${token}/pay/vietqr`, {}))
    } catch {
      setPayError('Chưa tạo được mã QR. Gọi quán sẽ nhanh hơn chờ.')
    }
  }, [token])

  // Khách chọn trả trước ở O6 thì mở thẳng mã, không bắt bấm thêm một nút nữa
  useEffect(() => {
    if (params.get('tra-ngay') === '1' && order?.paymentState === 'unpaid' && !ticket) {
      void createQr()
    }
  }, [params, order?.paymentState, ticket, createQr])

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-16 pb-24 text-center">
        <span className="font-jp text-[56px] leading-none text-gold-900">空</span>
        <p className="mt-6 text-[length:var(--fs-t2)] font-medium text-ink-hi">
          Không tìm thấy đơn với mã theo dõi này.
        </p>
        <p className="mt-3 text-[length:var(--fs-b1)] text-ink-body">
          Kiểm tra lại đường dẫn trong tin nhắn, hoặc gọi 024 3782 4400.
        </p>
      </main>
    )
  }

  if (!order) {
    return <main className="grid min-h-[60dvh] place-items-center text-ink-mute">Đang tải…</main>
  }

  const paid = order.paymentState === 'paid'
  const current = ORDER.indexOf(order.status)

  return (
    <main className="mx-auto max-w-2xl px-4 pt-10 pb-24">
      <div className="grid h-16 w-16 place-items-center rounded-pill border border-ok">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="text-ok">
          <path d="M4 12.5 9.5 18 20 7" />
        </svg>
      </div>
      <h1 className="mt-6 font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
        {order.status === 'cancelled' ? 'Đơn đã huỷ' : 'Đã nhận đơn của bạn'}
      </h1>
      <p className="mt-3.5 font-mono text-[length:var(--fs-t1)] tracking-[0.06em] text-accent-ink">
        {order.displayCode}
      </p>

      {order.status === 'cancelled' ? (
        <p className="mt-5 rounded-md border border-danger bg-danger/8 p-4 text-[length:var(--fs-b1)] text-ink-hi">
          Lý do: {order.cancelReason ?? 'không ghi'}. Tiền đã trả sẽ được hoàn — quán gọi lại cho
          bạn.
        </p>
      ) : (
        <>
          {/* O13 · O14 — chỉ hiện khi còn nợ tiền */}
          {!paid ? (
            <section className="mt-7 rounded-md border border-accent/16 bg-surface-4 p-5">
              {ticket && !waiting ? (
                <>
                  <p className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                    Quét để trả {formatVnd(ticket.amount)}
                  </p>
                  <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
                    Quét bằng app ngân hàng bất kỳ. Đơn xuống bếp khi ngân hàng báo có.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <div className="rounded-md bg-[var(--sora-washi-100)] p-4">
                      <QrCode value={ticket.qrString} size={220} label="Mã VietQR để thanh toán" />
                    </div>
                  </div>
                  <div className="mt-4 rounded-sm border border-line-3 bg-surface-2 px-4 py-3">
                    <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                      Số tài khoản
                    </p>
                    <p className="mt-1.5 font-mono text-[length:var(--fs-t2)] text-ink-hi">
                      {ticket.vaNumber}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWaiting(true)}
                    className="mt-4 h-13 w-full rounded-sm border border-accent text-[length:var(--fs-b1)] text-accent-ink"
                  >
                    Đã chuyển xong
                  </button>
                </>
              ) : ticket && waiting ? (
                <>
                  <p className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                    Đang chờ ngân hàng xác nhận…
                  </p>
                  <p className="mt-2 text-[length:var(--fs-b1)] text-ink-body">
                    {formatVnd(ticket.amount)} · bạn có thể đóng trang này, kết quả vẫn được ghi
                    nhận.
                  </p>
                  <button
                    type="button"
                    onClick={() => setWaiting(false)}
                    className="mt-4 h-11 text-[length:var(--fs-b2)] text-ink-mute underline"
                  >
                    Xem lại mã QR
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                    Còn phải trả {formatVnd(order.money.total)}
                  </p>
                  <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
                    Trả trước bằng VietQR, hoặc trả khi nhận hàng.
                  </p>
                  <button
                    type="button"
                    onClick={() => void createQr()}
                    className="mt-4 h-13 w-full rounded-sm bg-accent-strong text-[length:var(--fs-b1)] font-semibold text-on-accent"
                  >
                    Trả bằng VietQR
                  </button>
                  {payError ? (
                    <p className="mt-3 text-[length:var(--fs-b2)] text-danger">{payError}</p>
                  ) : null}
                </>
              )}
            </section>
          ) : (
            <p className="mt-7 rounded-md border border-ok bg-ok/8 p-4 text-[length:var(--fs-b1)] text-ink-hi">
              Đã nhận {formatVnd(order.money.total)}. Cảm ơn bạn!
            </p>
          )}

          <section className="mt-8">
            {STEPS.filter(
              (step) => step.status !== 'delivering' || order.type === 'delivery',
            ).map((step) => {
              const index = ORDER.indexOf(step.status)
              const done = current > index || order.status === 'done'
              const now = current === index
              return (
                <div key={step.status} className="flex items-start gap-3.5 pb-4.5">
                  <span
                    className={[
                      'mt-1.5 h-2.5 w-2.5 flex-none rounded-pill',
                      done ? 'bg-ok' : now ? 'bg-accent' : 'bg-line-3',
                    ].join(' ')}
                  />
                  <p
                    className={[
                      'text-[length:var(--fs-b1)]',
                      now ? 'font-semibold text-ink-hi' : done ? 'text-ink-body' : 'text-ink-mute',
                    ].join(' ')}
                  >
                    {step.label}
                  </p>
                </div>
              )
            })}
          </section>
        </>
      )}

      <section className="mt-4 rounded-md border border-line-2 bg-surface-1 p-5">
        <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
          Đơn của bạn
        </p>
        <div className="mt-3">
          {order.lines.map((line, index) => (
            <div key={index} className="flex items-start gap-2.5 py-1.5">
              <span className="w-6 flex-none font-mono text-[length:var(--fs-b2)] text-ink-mute">
                {line.qty}×
              </span>
              <span className="min-w-0 flex-1 text-[length:var(--fs-b2)] text-ink-body">
                {line.nameSnapshot}
              </span>
              <span className="flex-none font-mono text-[length:var(--fs-b2)] text-ink-hi">
                {formatVnd(line.priceTotal)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-line-1 pt-3">
          {order.money.ship > 0 ? (
            <div className="flex justify-between py-1">
              <span className="text-[length:var(--fs-b2)] text-ink-mute">Phí giao</span>
              <span className="font-mono text-[length:var(--fs-b2)] text-ink-body">
                {formatVnd(order.money.ship)}
              </span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between pt-2">
            <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Tổng</span>
            <span className="font-mono text-[length:var(--fs-t1)] text-accent-ink">
              {formatVnd(order.money.total)}
            </span>
          </div>
        </div>
      </section>

      <p className="mt-6 text-center text-[length:var(--fs-b2)] text-ink-mute">
        Lưu đường dẫn này để xem lại đơn bất cứ lúc nào.
      </p>
    </main>
  )
}
