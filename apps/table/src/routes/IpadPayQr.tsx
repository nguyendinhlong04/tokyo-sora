import { Button, Money, QrCode, useToast } from '@sora/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api'
import { PayHeader } from '../components/PayHeader'
import { IconCheck, IconCopy } from '../icons'
import { useTableSession } from '../table-context'
import { Aside, AsideLabel, Centered, Frame } from './IpadPay'

/** Mốc lời nhắn của T14 theo bản thiết kế: 0–20 giây · 20–60 giây · quá 60 giây */
const CALM_SECONDS = 20
const LATE_SECONDS = 60

/**
 * T13 VietQR · T14 Chờ ngân hàng báo về — trên iPad.
 *
 * "Đã chuyển xong" CHỈ đổi màn hình. Đã trả hay chưa do webhook ngân hàng quyết
 * định — tin vào nút bấm của khách thì ai cũng bấm rồi đi về. Màn hỏi lại trạng
 * thái ba giây một lần suốt từ lúc hiện mã: tiền có thể về trước cả khi khách
 * kịp bấm nút.
 */
export function IpadPayQr() {
  const { paymentId } = useParams()
  const id = Number(paymentId)
  const session = useTableSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [waiting, setWaiting] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const payment = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api.paymentStatus(id),
    refetchInterval: (query) => (query.state.data?.state === 'pending' ? 3_000 : false),
  })
  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
  })

  const state = payment.data?.state
  const paid = state === 'paid'

  useEffect(() => {
    if (!waiting || paid) return
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [waiting, paid])

  // Đồng hồ hết hạn của mã chạy theo giây khi mã còn đang hiện
  useEffect(() => {
    if (waiting || state !== 'pending') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [waiting, state])

  useEffect(() => {
    if (!paid) return
    void queryClient.invalidateQueries({ queryKey: ['bill', session.id] })
    void queryClient.invalidateQueries({ queryKey: ['order', session.id] })
    void queryClient.invalidateQueries({ queryKey: ['session', session.id] })
  }, [paid, queryClient, session.id])

  const toMethods = { label: 'Cách trả', onClick: () => void navigate('/tra-tien') }

  if (!payment.data) {
    return (
      <Frame header={<PayHeader step={2} title="Quét để trả" sub="" back={toMethods} />}>
        <Centered>
          <p className="text-[length:var(--fs-b2)] text-ink-mute">
            {payment.isError
              ? 'Không đọc được lượt trả này — nhờ nhân viên giúp bạn.'
              : 'Đang tải…'}
          </p>
        </Centered>
      </Frame>
    )
  }

  const data = payment.data

  if (paid) {
    const left = bill.data?.outstanding ?? 0
    return (
      <Frame header={<PayHeader step={3} title="Xác nhận" sub="Ngân hàng đã báo về" />}>
        <Centered>
          <span className="grid h-18 w-18 place-items-center rounded-pill border-[1.5px] border-ok text-ok">
            <IconCheck size={34} />
          </span>
          <h2 className="mt-5 font-display text-[length:var(--fs-d3)] leading-[1.15] font-light text-ink-hi">
            Đã nhận <Money amount={data.amount} />
          </h2>
          <p className="mt-1.5 text-[length:var(--fs-b1)] text-ink-body">Cảm ơn bạn!</p>
          {bill.data ? (
            <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
              {left > 0 ? (
                <>
                  Đã trả <Money amount={bill.data.paid} /> · còn <Money amount={left} />
                </>
              ) : (
                <>
                  Bàn {session.table.code} đã trả đủ <Money amount={bill.data.total} />
                </>
              )}
            </p>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            className="mt-6 w-70"
            onClick={() => void navigate(left > 0 ? '/tra-tien' : '/hoa-don')}
          >
            {left > 0 ? 'Người tiếp theo trả' : 'Xem hoá đơn'}
          </Button>
        </Centered>
      </Frame>
    )
  }

  if (state && state !== 'pending') {
    return (
      <Frame header={<PayHeader step={2} title="Quét để trả" sub="" back={toMethods} />}>
        <Centered>
          <p className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            {state === 'mismatch'
              ? 'Số tiền nhận được không khớp lượt trả này.'
              : 'Lượt trả này đã hết hạn.'}
          </p>
          <p className="mt-2 text-[length:var(--fs-b2)] text-ink-body">
            {state === 'mismatch'
              ? 'Nhân viên sẽ tới đối chiếu giúp bạn — chưa cần chuyển thêm.'
              : 'Tạo lại mã mới giúp bạn, tiền chưa bị trừ lượt này.'}
          </p>
          <Button
            variant="primary"
            size="lg"
            className="mt-6 w-70"
            onClick={() => void navigate('/tra-tien')}
          >
            Về cách trả
          </Button>
        </Centered>
      </Frame>
    )
  }

  if (waiting) {
    const ratio = Math.min(1, elapsed / LATE_SECONDS)
    const circumference = 2 * Math.PI * 58
    // Vòng chờ đi theo đúng nấc của thang than hồng: tro tới 40%, đồng tới 70%, rồi than
    const ring =
      ratio < 0.4
        ? 'var(--sora-ember-0)'
        : ratio < 0.7
          ? 'var(--sora-ember-1)'
          : 'var(--sora-ember-2)'
    return (
      <Frame
        header={
          <PayHeader
            step={3}
            title="Xác nhận"
            sub="Ngân hàng báo về là xong — thường dưới một phút"
          />
        }
      >
        <Centered>
          <div className="relative h-33 w-33">
            <svg viewBox="0 0 132 132" width="132" height="132" aria-hidden className="-rotate-90">
              <circle
                cx="66"
                cy="66"
                r="58"
                fill="none"
                stroke="var(--sora-line-1)"
                strokeWidth="3"
              />
              <circle
                cx="66"
                cy="66"
                r="58"
                fill="none"
                stroke={ring}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ratio)}
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center font-mono text-[length:var(--fs-t2)] text-ink-hi">
              {elapsed} giây
            </span>
          </div>
          <p className="mt-6 text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            {elapsed < CALM_SECONDS
              ? 'Đang chờ ngân hàng báo về…'
              : elapsed < LATE_SECONDS
                ? 'Thường mất dưới 1 phút'
                : 'Lâu hơn thường lệ'}
          </p>
          <Money amount={data.amount} className="mt-1.5 text-[length:var(--fs-b1)] text-gold-300" />
          {elapsed >= LATE_SECONDS ? (
            <p className="mt-3 text-[length:var(--fs-b2)] text-ink-body">
              Nhân viên sẽ tới xác nhận giúp bạn.
            </p>
          ) : null}
          <p className="mt-6 text-[length:var(--fs-c1)] text-ink-mute">
            Bạn có thể đóng màn này, kết quả sẽ báo lại.
          </p>
          <div className="mt-1.5 flex gap-2">
            <Button variant="ghost" onClick={() => setWaiting(false)}>
              Xem lại mã QR
            </Button>
            <Button variant="ghost" onClick={() => void navigate('/thuc-don')}>
              Về thực đơn
            </Button>
          </div>
        </Centered>
      </Frame>
    )
  }

  const copy = (value: string, done: string) => {
    navigator.clipboard?.writeText(value).then(
      () => toast(done, 'ok'),
      () => undefined,
    )
  }
  const expiresIn = data.expiresAt
    ? Math.max(0, Math.floor((Date.parse(data.expiresAt) - now) / 1000))
    : null

  return (
    <Frame
      header={
        <PayHeader
          step={2}
          title="Quét để trả"
          sub={`Mã chỉ dùng cho lượt trả này của bàn ${session.table.code}`}
          back={toMethods}
        />
      }
    >
      <Centered>
        {data.qrString ? (
          <div className="rounded-md bg-[var(--sora-washi-100)] p-4">
            <QrCode value={data.qrString} size={264} label="Mã VietQR để thanh toán" />
          </div>
        ) : (
          <p className="text-ink-mute">Mã QR chưa sẵn sàng — nhờ nhân viên giúp bạn.</p>
        )}
        <p className="mt-3.5 text-[length:var(--fs-c1)] text-ink-mute">
          Quét bằng app ngân hàng bất kỳ
          {expiresIn !== null ? (
            <>
              {' · mã hết hạn sau '}
              <span className="font-mono text-ink-hi">
                {String(Math.floor(expiresIn / 60)).padStart(2, '0')}:
                {String(expiresIn % 60).padStart(2, '0')}
              </span>
            </>
          ) : null}
        </p>
      </Centered>
      <Aside>
        <AsideLabel>Số tiền</AsideLabel>
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <Money amount={data.amount} className="text-[length:var(--fs-d3)] text-ink-hi" />
          <CopyButton
            label="Chép số tiền"
            onClick={() => copy(String(data.amount), 'Đã chép số tiền')}
          />
        </div>
        <div className="mt-4.5 grid gap-3 border-t border-line-1 pt-4">
          <div>
            <p className="text-[length:var(--fs-c1)] text-ink-mute">Số tài khoản</p>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">
                {data.vaNumber ?? '—'}
              </span>
              {data.vaNumber ? (
                <CopyButton
                  label="Chép số tài khoản"
                  onClick={() => copy(data.vaNumber!, 'Đã chép số tài khoản')}
                />
              ) : null}
            </div>
          </div>
          <p className="text-[length:var(--fs-c1)] leading-[1.55] text-ink-mute">
            Tài khoản này chỉ dùng cho lượt trả này của bàn {session.table.code}. Chuyển đúng số
            tiền, không cần ghi nội dung.
          </p>
        </div>
        <div className="flex-1" />
        <Button variant="primary" size="lg" block onClick={() => setWaiting(true)}>
          Đã chuyển xong
        </Button>
        <Button block className="mt-2" onClick={() => void navigate('/tra-tien')}>
          Đổi cách trả
        </Button>
      </Aside>
    </Frame>
  )
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 flex-none items-center gap-1.5 rounded-sm border border-line-3 px-2.5 text-[length:var(--fs-c1)] text-ink-body"
    >
      <IconCopy size={14} />
      Chép
    </button>
  )
}
