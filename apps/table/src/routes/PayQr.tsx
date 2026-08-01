import { Button, Money, QrCode, useToast } from '@sora/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api'
import { useTableSession } from '../table-context'

/** Vòng chờ đầy trong 30 giây; quá 45 giây thì rủ khách gọi nhân viên */
const RING_SECONDS = 30
const LATE_SECONDS = 45

/**
 * T13 VietQR · T14 Chờ xác nhận.
 *
 * Nút "Đã chuyển xong" CHỈ đổi màn hình. Trạng thái đã trả do webhook ngân hàng
 * quyết định (§20) — tin vào nút bấm của khách thì ai cũng bấm rồi đi về.
 */
export function PayQr() {
  const { paymentId } = useParams()
  const id = Number(paymentId)
  const session = useTableSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [waiting, setWaiting] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const payment = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api.paymentStatus(id),
    // Hỏi lại đều đặn: webhook có thể về bất cứ lúc nào, kể cả trước khi khách bấm
    refetchInterval: (query) => (query.state.data?.state === 'pending' ? 3_000 : false),
  })

  const state = payment.data?.state
  const paid = state === 'paid'

  useEffect(() => {
    if (!waiting || paid) return
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [waiting, paid])

  useEffect(() => {
    if (!paid) return
    void queryClient.invalidateQueries({ queryKey: ['bill', session.id] })
    void queryClient.invalidateQueries({ queryKey: ['order', session.id] })
  }, [paid, queryClient, session.id])

  if (!payment.data) {
    return (
      <main className="grid min-h-[calc(100dvh-3rem)] place-items-center px-6 text-center text-ink-mute">
        {payment.isError ? 'Không đọc được lượt trả này — nhờ nhân viên giúp bạn.' : 'Đang tải…'}
      </main>
    )
  }

  const data = payment.data

  if (paid) {
    return (
      <main className="flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center px-6 text-center animate-[sora-fade_var(--dur-reveal)_var(--ease-sora)]">
        <div className="grid h-24 w-24 place-items-center rounded-pill border border-ok">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ok">
            <path d="M4 12.5 9.5 18 20 7" />
          </svg>
        </div>
        <p className="mt-8 text-[length:var(--fs-t1)] font-semibold leading-snug text-ink-hi">
          Đã nhận <Money amount={data.amount} />
          <br />
          Cảm ơn bạn!
        </p>
        <Button variant="primary" size="lg" block className="mt-9" onClick={() => void navigate('/hoa-don')}>
          Xem hoá đơn
        </Button>
      </main>
    )
  }

  if (state && state !== 'pending') {
    return (
      <main className="flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center px-6 text-center">
        <p className="text-[length:var(--fs-t1)] font-semibold leading-snug text-ink-hi">
          {state === 'mismatch'
            ? 'Số tiền nhận được không khớp lượt trả này.'
            : 'Lượt trả này đã hết hạn.'}
        </p>
        <p className="mt-3.5 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          {state === 'mismatch'
            ? 'Nhân viên sẽ tới đối chiếu giúp bạn — chưa cần chuyển thêm.'
            : 'Tạo lại mã mới giúp bạn, tiền chưa bị trừ lượt này.'}
        </p>
        <Button variant="primary" size="lg" block className="mt-8" onClick={() => void navigate('/tra-tien')}>
          Về cách trả
        </Button>
      </main>
    )
  }

  if (waiting) {
    const ratio = Math.min(1, elapsed / RING_SECONDS)
    const circumference = 2 * Math.PI * 54

    return (
      <main className="flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center px-6 text-center">
        <div className="relative h-33 w-33">
          <svg viewBox="0 0 132 132" className="-rotate-90">
            <circle cx="66" cy="66" r="54" fill="none" stroke="var(--sora-line-1)" strokeWidth="3" />
            <circle
              cx="66"
              cy="66"
              r="54"
              fill="none"
              stroke="var(--sora-gold-500)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - ratio)}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-mono text-[length:var(--fs-t1)] text-ink-hi">
            {Math.round(ratio * 100)}%
          </span>
        </div>

        <p className="mt-8 text-[length:var(--fs-t2)] font-medium text-ink-hi">
          Đang chờ ngân hàng xác nhận…
        </p>
        <Money amount={data.amount} className="mt-3.5 text-[length:var(--fs-t1)] text-accent-ink" />

        {elapsed > LATE_SECONDS ? (
          <p className="mt-6 rounded-md border border-warn bg-warn/8 px-4 py-3.5 text-[length:var(--fs-b1)] leading-normal text-gold-200">
            Lâu hơn thường lệ. Nhân viên sẽ tới xác nhận giúp bạn.
          </p>
        ) : null}

        <p className="mt-7 text-[length:var(--fs-b2)] leading-relaxed text-ink-mute">
          Bạn có thể đóng màn này — kết quả vẫn được ghi nhận.
        </p>
        <Button variant="ghost" block className="mt-3" onClick={() => setWaiting(false)}>
          Xem lại mã QR
        </Button>
      </main>
    )
  }

  return (
    <main className="pb-10">
      <header className="px-4 pt-5 text-center">
        <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">Quét để trả</h1>
        <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">Quét bằng app ngân hàng bất kỳ</p>
      </header>

      <div className="flex justify-center px-4 pt-6">
        {data.qrString ? (
          <div className="rounded-lg bg-[var(--sora-washi-100)] p-4.5">
            <QrCode value={data.qrString} size={244} label="Mã VietQR để thanh toán" />
          </div>
        ) : (
          <p className="text-ink-mute">Mã QR chưa sẵn sàng — nhờ nhân viên giúp bạn.</p>
        )}
      </div>

      <div className="grid gap-3 px-4 pt-7">
        <CopyRow
          label="Số tài khoản"
          value={data.vaNumber ?? '—'}
          onCopied={() => toast('Đã chép số tài khoản', 'ok')}
        />
        <div className="flex items-center gap-3 rounded-sm border border-accent bg-surface-4 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Số tiền
            </p>
            <Money amount={data.amount} className="mt-1.5 block text-[length:var(--fs-t1)] text-accent-ink" />
          </div>
        </div>
      </div>

      <div className="px-4 pt-7">
        <Button variant="primary" size="lg" block onClick={() => setWaiting(true)}>
          Đã chuyển xong
        </Button>
        <Button variant="ghost" block className="mt-2" onClick={() => void navigate('/tra-tien')}>
          Đổi cách trả
        </Button>
      </div>
    </main>
  )
}

function CopyRow({
  label,
  value,
  onCopied,
}: {
  label: string
  value: string
  onCopied: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-line-3 bg-surface-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
          {label}
        </p>
        <p className="mt-1.5 font-mono text-[length:var(--fs-t2)] text-ink-hi">{value}</p>
      </div>
      <button
        type="button"
        aria-label={`Chép ${label}`}
        onClick={() => {
          navigator.clipboard?.writeText(value).then(onCopied, () => undefined)
        }}
        className="grid h-[var(--hit-target)] w-[var(--hit-target)] flex-none place-items-center rounded-sm border border-line-3 text-accent-ink"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M15 5H6a2 2 0 0 0-2 2v9" />
        </svg>
      </button>
    </div>
  )
}
