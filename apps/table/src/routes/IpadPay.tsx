import { Button, Money, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { api, type PaymentTicket } from '../api'
import { PayHeader } from '../components/PayHeader'
import { IconCheck, IconLock, IconMinus, IconOffline, IconPlus, IconQr } from '../icons'
import { myPayments, rememberPayment } from '../my-payments'
import { useOutbox } from '../outbox'
import { useTableSession } from '../table-context'
import { useIpadCall } from './IpadShell'

type Mode = 'all' | 'even' | 'pick'

const MODES: { mode: Mode; name: string; hint: string }[] = [
  { mode: 'all', name: 'Trả hết', hint: 'Một người trả trọn số còn lại của bàn.' },
  { mode: 'even', name: 'Chia đều', hint: 'Chia số còn lại thành các phần bằng nhau.' },
  { mode: 'pick', name: 'Chọn món mình trả', hint: 'Chỉ trả những món bạn ăn.' },
]

/**
 * T11 Chọn cách trả · T12 Chọn món mình trả — trên iPad.
 *
 * Bên trái là quyết định (trả thế nào, món nào), bên phải là con số của quyết
 * định đó và nút đi tiếp. Số tiền lượt này đổi ngay khi khách đổi cách trả hay
 * số người chia, trước khi bấm gì — người ta muốn biết mình trả bao nhiêu rồi
 * mới quyết.
 */
export function IpadPay() {
  const session = useTableSession()
  const navigate = useNavigate()
  const toast = useToast()
  const outbox = useOutbox()
  const call = useIpadCall()
  const [mode, setMode] = useState<Mode | null>(null)
  const [parts, setParts] = useState(Math.max(2, session.guestCount))
  const [picking, setPicking] = useState(false)

  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
    refetchInterval: 10_000,
  })
  const outstanding = bill.data?.outstanding ?? 0

  const preview = useQuery({
    queryKey: ['split-preview', session.id, parts, outstanding],
    queryFn: () => api.splitPreview(session.id, parts),
    enabled: mode === 'even' && outstanding > 0,
  })
  const perHead = preview.data?.amounts[0] ?? 0

  const goPay = (ticket: PaymentTicket) => {
    rememberPayment(ticket.id)
    void navigate(`/tra-tien/${ticket.id}`)
  }

  const createQr = useMutation({
    mutationFn: (amount: number) => api.vietqr(session.id, amount),
    onSuccess: goPay,
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const toOrder = { label: 'Đơn của bàn', onClick: () => void navigate('/don') }
  const sub = `Bàn ${session.table.code} · ${session.guestCount} khách · đây là tạm tính, chưa phải hoá đơn`

  /**
   * T17: thanh toán KHÔNG xếp hàng đợi offline — lượt trả cần tài khoản định
   * danh thật từ ngân hàng ngay lúc này; gửi sau thì khách đã quét một mã chưa
   * tồn tại. Gọi món thì hàng đợi cứu được, tiền thì không.
   */
  if (!outbox.online) {
    return (
      <Frame header={<PayHeader step={1} title="Thanh toán" sub={sub} back={toOrder} />}>
        <Centered>
          <span className="grid h-18 w-18 place-items-center rounded-pill border-[1.5px] border-warn text-warn">
            <IconOffline size={32} />
          </span>
          <p className="mt-6 text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            Thanh toán cần mạng ổn định. Vui lòng gọi thu ngân.
          </p>
          <p className="mt-2 text-[length:var(--fs-b2)] text-ink-body">
            Món đang chọn vẫn thao tác được và sẽ tự gửi khi có mạng.
          </p>
          <Button
            variant="primary"
            size="lg"
            className="mt-7 w-70"
            onClick={() => call.call('tinh-tien')}
          >
            Gọi thu ngân
          </Button>
        </Centered>
      </Frame>
    )
  }

  if (bill.data && outstanding === 0) {
    return (
      <Frame header={<PayHeader step={4} title="Thanh toán" sub={sub} back={toOrder} />}>
        <Centered>
          <span className="grid h-18 w-18 place-items-center rounded-pill border-[1.5px] border-ok text-ok">
            <IconCheck size={34} />
          </span>
          <p className="mt-6 font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
            Bàn đã trả đủ. Cảm ơn bạn!
          </p>
          <Button
            variant="primary"
            size="lg"
            className="mt-7 w-70"
            onClick={() => void navigate('/hoa-don')}
          >
            Xem hoá đơn
          </Button>
        </Centered>
      </Frame>
    )
  }

  if (picking) return <PickLines onBack={() => setPicking(false)} onCreated={goPay} />

  const amount = mode === 'all' ? outstanding : mode === 'even' ? perHead : null

  return (
    <Frame header={<PayHeader step={1} title="Thanh toán" sub={sub} back={toOrder} />}>
      <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4.5 pb-6 [scrollbar-width:none]">
        <p className="mb-2.5 text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          Trả thế nào?
        </p>
        <div role="radiogroup" aria-label="Cách trả" className="grid gap-2.5">
          {MODES.map((option) => {
            const on = mode === option.mode
            return (
              <div
                key={option.mode}
                className={[
                  'rounded-md border',
                  on ? 'border-accent/60 bg-surface-4' : 'border-line-1 bg-surface-3',
                ].join(' ')}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMode(option.mode)}
                  className="flex w-full items-start gap-3.5 p-4 text-left"
                >
                  <span
                    aria-hidden
                    className={[
                      'mt-px grid h-[22px] w-[22px] flex-none place-items-center rounded-pill border-[1.5px]',
                      on ? 'border-accent' : 'border-line-4',
                    ].join(' ')}
                  >
                    {on ? <span className="h-2.5 w-2.5 rounded-pill bg-accent" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                      {option.name}
                    </span>
                    <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                      {option.hint}
                    </span>
                  </span>
                  {option.mode === 'all' ? (
                    <Money
                      amount={outstanding}
                      className="flex-none text-[length:var(--fs-b2)] text-gold-300"
                    />
                  ) : null}
                  {option.mode === 'even' && on && perHead > 0 ? (
                    <span className="flex-none font-mono text-[length:var(--fs-b2)] text-gold-300">
                      <Money amount={perHead} /> / người
                    </span>
                  ) : null}
                </button>
                {option.mode === 'even' && on ? (
                  <div className="flex items-center gap-3.5 pr-4 pb-4 pl-13">
                    <span className="text-[length:var(--fs-b2)] text-ink-body">
                      Chia cho mấy người
                    </span>
                    <div className="flex h-11 items-center rounded-sm border border-line-3">
                      <button
                        type="button"
                        aria-label="Bớt một người"
                        onClick={() => setParts((n) => Math.max(2, n - 1))}
                        className="grid h-full w-11 place-items-center text-gold-300"
                      >
                        <IconMinus size={16} stroke={1.8} />
                      </button>
                      <span className="min-w-7 text-center font-mono text-[length:var(--fs-b1)] text-ink-hi">
                        {parts}
                      </span>
                      <button
                        type="button"
                        aria-label="Thêm một người"
                        onClick={() => setParts((n) => Math.min(20, n + 1))}
                        className="grid h-full w-11 place-items-center text-gold-300"
                      >
                        <IconPlus size={16} stroke={1.8} />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-[length:var(--fs-c1)] leading-normal text-ink-mute">
          Chia đều hay chọn món: mỗi người quét mã của phần mình, lần lượt trên máy này.
        </p>
      </div>

      <Aside>
        <AsideLabel>Còn phải trả</AsideLabel>
        {bill.data ? (
          <Money
            amount={outstanding}
            className="mt-1 block text-[length:var(--fs-t1)] text-ink-hi"
          />
        ) : (
          <Skeleton className="mt-1.5 h-6 w-32" />
        )}
        {bill.data && bill.data.paid > 0 ? (
          <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">
            Đã trả <Money amount={bill.data.paid} /> · còn <Money amount={outstanding} />
          </p>
        ) : null}
        <div className="my-4.5 border-t border-line-1" />
        <AsideLabel>Lượt này</AsideLabel>
        {amount !== null && amount > 0 ? (
          <Money amount={amount} className="mt-1 block text-[length:var(--fs-d3)] text-ink-hi" />
        ) : (
          <p className="mt-1 font-mono text-[length:var(--fs-d3)] text-ink-hi">—</p>
        )}
        <div className="mt-4 flex items-center gap-3 rounded-md border border-line-1 bg-surface-3 px-3.5 py-3">
          <IconQr size={22} className="flex-none text-gold-300" />
          <span className="min-w-0 flex-1">
            <span className="block text-[length:var(--fs-b2)] font-semibold text-ink-hi">
              Chuyển khoản VietQR
            </span>
            <span className="block text-[length:var(--fs-c1)] text-ink-mute">
              Quét bằng app ngân hàng bất kỳ
            </span>
          </span>
        </div>
        <div className="flex-1" />
        <Button
          variant="primary"
          size="lg"
          block
          disabled={mode === null || createQr.isPending || (amount !== null && amount <= 0)}
          onClick={() => {
            if (mode === 'pick') setPicking(true)
            else if (amount) createQr.mutate(amount)
          }}
        >
          {mode === null ? (
            'Chọn cách trả'
          ) : mode === 'pick' ? (
            'Chọn món'
          ) : (
            <>
              Trả <Money amount={amount ?? 0} />
            </>
          )}
        </Button>
        <Button
          block
          className="mt-2"
          disabled={call.calling}
          onClick={() => call.call('tinh-tien')}
        >
          Gọi thu ngân · tiền mặt, thẻ
        </Button>
      </Aside>
    </Frame>
  )
}

/**
 * T12 Chọn món mình trả.
 *
 * Món người khác đã nhận thì khoá NGAY trên màn, không đợi bấm xong mới báo lỗi.
 * Chốt chặn thật vẫn ở partial unique index trong CSDL — màn này chỉ để khách
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
  const total = lines.filter((l) => picked.includes(l.id)).reduce((sum, l) => sum + l.priceTotal, 0)

  return (
    <Frame
      header={
        <PayHeader
          step={1}
          title="Bạn ăn món nào?"
          sub="Chọn món bạn trả. Món người khác đã nhận sẽ bị khoá."
          back={{ label: 'Cách trả', onClick: onBack }}
        />
      }
    >
      <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4.5 pb-6 [scrollbar-width:none]">
        <div role="group" aria-label="Món của bàn" className="grid gap-1.5">
          {lines.map((line) => {
            const claimedPayment = claimedBy.get(line.id)
            const locked = claimedPayment !== undefined
            const on = !locked && picked.includes(line.id)
            const opts = (line.modifiers ?? []).map((m) => m.name).join(' · ')
            return (
              <button
                key={line.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={locked}
                onClick={() =>
                  setPicked((current) =>
                    current.includes(line.id)
                      ? current.filter((id) => id !== line.id)
                      : [...current, line.id],
                  )
                }
                className={[
                  'flex min-h-14 w-full items-center gap-3.5 rounded-sm border px-4 py-2 text-left',
                  on ? 'border-accent/60 bg-surface-4' : 'border-line-1 bg-surface-3',
                  locked ? 'opacity-55' : '',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'grid h-[22px] w-[22px] flex-none place-items-center rounded-sm border-[1.5px] text-on-accent',
                    on ? 'border-accent bg-accent' : 'border-line-4',
                  ].join(' ')}
                >
                  {on ? <IconCheck size={13} stroke={3} /> : null}
                  {locked ? <IconLock size={12} stroke={2} className="text-ink-mute" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                    {line.qty} × {line.nameSnapshot}
                  </span>
                  {locked || opts ? (
                    <span className="block text-[length:var(--fs-c1)] text-ink-mute">
                      {locked
                        ? mine.has(claimedPayment)
                          ? 'Bạn đã nhận trả món này'
                          : 'Người khác đã nhận trả'
                        : opts}
                    </span>
                  ) : null}
                </span>
                <Money
                  amount={line.priceTotal}
                  className="flex-none text-[length:var(--fs-b2)] text-gold-300"
                />
              </button>
            )
          })}
        </div>
      </div>
      <Aside>
        <AsideLabel>Phần của bạn</AsideLabel>
        <Money amount={total} className="mt-1 block text-[length:var(--fs-d3)] text-ink-hi" />
        <p className="mt-1.5 text-[length:var(--fs-c1)] leading-normal text-ink-mute">
          {picked.length} món đã chọn
        </p>
        <div className="flex-1" />
        <Button
          variant="primary"
          size="lg"
          block
          disabled={picked.length === 0 || claim.isPending}
          onClick={() => claim.mutate()}
        >
          {picked.length === 0 ? (
            'Chọn ít nhất một món'
          ) : (
            <>
              Trả <Money amount={total} />
            </>
          )}
        </Button>
      </Aside>
    </Frame>
  )
}

/** Khung chung của màn thanh toán: đầu màn, rồi hai cột */
export function Frame({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  )
}

export function Aside({ children }: { children: ReactNode }) {
  return (
    <aside className="flex w-90 flex-none flex-col border-l border-accent/16 bg-surface-1 px-6 pt-5 pb-6">
      {children}
    </aside>
  )
}

export function AsideLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
      {children}
    </p>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center p-6 text-center">
      {children}
    </div>
  )
}
