import { Button, Card, Money, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type PaymentTicket } from '../api'
import { BottomBar, BottomBarSpacer } from '../components/BottomBar'
import { myPayments, rememberPayment } from '../my-payments'
import { useTableSession } from '../table-context'
import { useCallStaff, useOutbox } from './Shell'

type Mode = 'all' | 'even' | 'pick'

const MODES: { mode: Mode; name: string; hint: string }[] = [
  { mode: 'all', name: 'Trả hết', hint: 'Một người trả trọn số còn lại của bàn.' },
  { mode: 'even', name: 'Chia đều', hint: 'Chia số còn lại thành các phần bằng nhau.' },
  { mode: 'pick', name: 'Chọn món mình trả', hint: 'Chỉ trả những món bạn ăn.' },
]

/** T11 Chia tiền · T12 Chọn món mình trả · T17 khi mất mạng */
export function Split() {
  const session = useTableSession()
  const navigate = useNavigate()
  const toast = useToast()
  const outbox = useOutbox()
  const callStaff = useCallStaff()
  const [mode, setMode] = useState<Mode | null>(null)
  const [parts, setParts] = useState(2)

  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
    refetchInterval: 10_000,
  })

  const preview = useQuery({
    queryKey: ['split-preview', session.id, parts, bill.data?.outstanding],
    queryFn: () => api.splitPreview(session.id, parts),
    enabled: mode === 'even' && (bill.data?.outstanding ?? 0) > 0,
  })

  const goPay = (ticket: PaymentTicket) => {
    rememberPayment(ticket.id)
    void navigate(`/tra-tien/${ticket.id}`)
  }

  const createQr = useMutation({
    mutationFn: (amount: number) => api.vietqr(session.id, amount),
    onSuccess: goPay,
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  /**
   * T17: thanh toán KHÔNG được xếp hàng đợi offline.
   *
   * Lượt trả phải có VA thật từ ngân hàng ngay lúc này; gửi sau thì khách đã quét
   * một mã QR chưa tồn tại. Gọi món thì hàng đợi cứu được, tiền thì không.
   */
  if (!outbox.online) {
    return (
      <main className="flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center px-6 text-center">
        <span className="font-jp text-[56px] leading-none text-gold-900">断</span>
        <p className="mt-6 text-[length:var(--fs-t1)] font-semibold leading-snug text-ink-hi">
          Thanh toán cần mạng ổn định.
          <br />
          Vui lòng gọi thu ngân.
        </p>
        <p className="mt-3.5 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          Giỏ hàng của bạn vẫn thao tác được và sẽ tự gửi khi có mạng.
        </p>
        <Button variant="primary" size="lg" block className="mt-8" onClick={callStaff}>
          Gọi thu ngân
        </Button>
        <Button size="lg" block className="mt-2.5" onClick={() => void navigate('/tam-tinh')}>
          Về tạm tính
        </Button>
      </main>
    )
  }

  const outstanding = bill.data?.outstanding ?? 0

  if (bill.data && outstanding === 0) {
    return (
      <main className="flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center px-6 text-center">
        <p className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
          Bàn đã trả đủ. Cảm ơn bạn!
        </p>
        <Button variant="primary" size="lg" block className="mt-8" onClick={() => void navigate('/hoa-don')}>
          Xem hoá đơn
        </Button>
      </main>
    )
  }

  if (mode === 'pick') {
    return <PickLines onBack={() => setMode(null)} onCreated={goPay} />
  }

  const perHead = preview.data?.amounts[0] ?? 0

  return (
    <main>
      <header className="px-4 pt-5 pb-2">
        <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
          Trả thế nào?
        </h1>
        <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
          Còn phải trả <Money amount={outstanding} />
        </p>
      </header>

      {bill.data && bill.data.paid > 0 ? (
        <Card className="mx-4 mt-3 border-ok p-4">
          <p className="text-[length:var(--fs-b1)] text-ink-hi">
            Đã trả <Money amount={bill.data.paid} /> · còn <Money amount={outstanding} />
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 px-4 pt-5">
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            onClick={() => setMode(option.mode)}
            className={[
              'rounded-md border p-4 text-left',
              mode === option.mode ? 'border-accent bg-surface-4' : 'border-line-3',
            ].join(' ')}
          >
            <p className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">{option.name}</p>
            <p className="mt-1.5 text-[length:var(--fs-b2)] leading-normal text-ink-body">
              {option.hint}
            </p>
          </button>
        ))}
      </div>

      {mode === 'even' ? (
        <div className="px-4 pt-6">
          <SectionLabel>Chia cho mấy người</SectionLabel>
          <div className="mt-3 flex h-16 items-center rounded-sm border border-line-3">
            <button
              type="button"
              aria-label="Bớt một người"
              onClick={() => setParts((n) => Math.max(2, n - 1))}
              className="h-full w-16 text-[length:var(--fs-t1)] text-accent-ink"
            >
              −
            </button>
            <span className="flex-1 text-center font-mono text-[length:var(--fs-t1)] text-ink-hi">
              {parts}
            </span>
            <button
              type="button"
              aria-label="Thêm một người"
              onClick={() => setParts((n) => Math.min(20, n + 1))}
              className="h-full w-16 text-[length:var(--fs-t1)] text-accent-ink"
            >
              +
            </button>
          </div>
          <p className="mt-4 text-[length:var(--fs-b1)] text-ink-hi">
            Mỗi người <Money amount={perHead} className="text-accent-ink" />
          </p>
          <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
            Bạn trả một phần; những người còn lại quét mã của họ trên máy mình.
          </p>
        </div>
      ) : null}

      <BottomBarSpacer />
      <BottomBar>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={mode === null || createQr.isPending || (mode === 'even' && perHead <= 0)}
          onClick={() => createQr.mutate(mode === 'even' ? perHead : outstanding)}
        >
          {mode === 'even' ? (
            <>
              Trả phần của tôi · <Money amount={perHead} />
            </>
          ) : (
            <>
              Trả <Money amount={outstanding} />
            </>
          )}
        </Button>
      </BottomBar>
    </main>
  )
}

/**
 * T12 Chọn món mình trả.
 *
 * Món người khác đã nhận thì khoá NGAY trên màn, không đợi bấm xong mới báo lỗi.
 * Chốt chặn thật vẫn nằm ở partial unique index trong CSDL — màn này chỉ để khách
 * khỏi chọn nhầm.
 */
function PickLines({
  onBack,
  onCreated,
}: {
  onBack: () => void
  onCreated: (ticket: PaymentTicket) => void
}) {
  const session = useTableSession()
  const toast = useToast()
  const [picked, setPicked] = useState<number[]>([])

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
  })

  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
    refetchInterval: 10_000,
  })

  const claim = useMutation({
    mutationFn: () => api.claim(session.id, picked),
    onSuccess: onCreated,
    onError: (err: Error) => {
      toast(err.message, 'danger')
      setPicked([])
      void bill.refetch()
    },
  })

  const mine = new Set(myPayments())
  const claimedBy = new Map(
    (bill.data?.claimedLines ?? []).map((c) => [c.orderLineId, c.paymentId]),
  )

  const lines = (order.data?.lines ?? []).filter(
    (l) => l.parentLineId === null && l.state !== 'voided' && l.priceTotal > 0,
  )
  const total = lines
    .filter((l) => picked.includes(l.id))
    .reduce((sum, l) => sum + l.priceTotal, 0)

  return (
    <main>
      <header className="px-4 pt-5 pb-2">
        <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
          Bạn ăn món nào?
        </h1>
        <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
          Chọn món bạn trả. Món người khác nhận sẽ bị khoá.
        </p>
      </header>

      <div className="pt-4">
        {lines.map((line) => {
          const claimedPayment = claimedBy.get(line.id)
          const locked = claimedPayment !== undefined
          const isMine = claimedPayment !== undefined && mine.has(claimedPayment)
          const on = picked.includes(line.id)

          return (
            <button
              key={line.id}
              type="button"
              disabled={locked}
              onClick={() =>
                setPicked((current) =>
                  current.includes(line.id)
                    ? current.filter((id) => id !== line.id)
                    : [...current, line.id],
                )
              }
              className={[
                'flex w-full items-center gap-3 border-b border-surface-4 px-4 py-3.5 text-left',
                locked ? 'opacity-50' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'grid h-5.5 w-5.5 flex-none place-items-center rounded-sm border',
                  on ? 'border-accent bg-accent' : 'border-line-3',
                ].join(' ')}
              >
                {on ? (
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" className="text-on-accent">
                    <path d="M4 12.5 9.5 18 20 7" />
                  </svg>
                ) : null}
              </span>
              <span className="w-7 flex-none font-mono text-[length:var(--fs-b2)] text-ink-mute">
                {line.qty}×
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[length:var(--fs-b1)] text-ink-hi">
                  {line.nameSnapshot}
                </span>
                {locked ? (
                  <span className="mt-1 block text-[length:var(--fs-c1)] text-ink-mute">
                    {isMine ? 'Bạn đã nhận trả món này' : 'Người khác đã nhận trả'}
                  </span>
                ) : null}
              </span>
              <Money
                amount={line.priceTotal}
                className="flex-none text-[length:var(--fs-b1)] text-ink-body"
              />
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-7">
        <Button variant="ghost" block onClick={onBack}>
          Đổi cách trả
        </Button>
      </div>

      <BottomBarSpacer />
      <BottomBar>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Phần của bạn</span>
          <Money amount={total} className="text-[length:var(--fs-t1)] text-accent-ink" />
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={picked.length === 0 || claim.isPending}
          onClick={() => claim.mutate()}
        >
          Tiếp tục
        </Button>
      </BottomBar>
    </main>
  )
}
