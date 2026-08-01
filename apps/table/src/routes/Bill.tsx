import { Button, Card, Money } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useTableSession } from '../table-context'
import { useCallStaff } from './Shell'

/**
 * T10 Tạm tính.
 *
 * Là bản xem trước, KHÔNG phải hoá đơn: hoá đơn chỉ có sau khi trả xong (T15).
 * Nói rõ điều đó ngay dưới tiêu đề để không ai cầm màn này đi tra cứu thuế.
 */
export function Bill() {
  const session = useTableSession()
  const navigate = useNavigate()
  const callStaff = useCallStaff()

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
  })

  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
    refetchInterval: 15_000,
  })

  const money = order.data?.order
  const lines = (order.data?.lines ?? []).filter(
    (l) => l.parentLineId === null && l.state !== 'voided',
  )

  return (
    <main className="pb-10">
      <header className="px-4 pt-5 pb-2">
        <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">Tạm tính</h1>
        <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
          Bàn {session.table.code} · {session.guestCount} khách · chưa phải hoá đơn
        </p>
      </header>

      <div className="pt-4">
        {lines.map((line) => (
          <div key={line.id} className="flex items-start gap-3 border-b border-surface-4 px-4 py-3">
            <span className="w-7 flex-none font-mono text-[length:var(--fs-b1)] text-ink-mute">
              {line.qty}×
            </span>
            <p className="min-w-0 flex-1 text-[length:var(--fs-b1)] text-ink-hi">
              {line.nameSnapshot}
            </p>
            <Money
              amount={line.priceTotal}
              className="flex-none text-[length:var(--fs-b1)] text-ink-body"
            />
          </div>
        ))}
      </div>

      <div className="px-4 pt-5">
        <Row label="Tạm tính" amount={money?.moneySub ?? 0} />
        {money && money.moneyService > 0 ? (
          <Row label="Phí phục vụ" amount={money.moneyService} />
        ) : null}
        {money && money.moneyVat > 0 ? <Row label="Thuế VAT" amount={money.moneyVat} /> : null}
        {money && money.moneyRound !== 0 ? (
          <Row label="Làm tròn" amount={money.moneyRound} />
        ) : null}

        <div className="mt-2 flex items-baseline justify-between border-t border-accent/16 pt-4.5">
          <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Tổng</span>
          <Money
            amount={money?.moneyTotal ?? 0}
            className="text-[length:var(--fs-t1)] text-accent-ink"
          />
        </div>

        {bill.data && bill.data.paid > 0 ? (
          <Card className="mt-5 border-ok p-4">
            <p className="text-[length:var(--fs-b1)] text-ink-hi">
              Đã trả <Money amount={bill.data.paid} /> · còn{' '}
              <Money amount={bill.data.outstanding} />
            </p>
          </Card>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-8">
        {bill.data && bill.data.outstanding === 0 && bill.data.total > 0 ? (
          <Button
            variant="primary"
            size="lg"
            className="col-span-2"
            onClick={() => void navigate('/hoa-don')}
          >
            Xem hoá đơn
          </Button>
        ) : (
          <>
            <Button variant="primary" size="lg" onClick={() => void navigate('/tra-tien')}>
              Tự thanh toán
            </Button>
            <Button size="lg" onClick={callStaff}>
              Gọi thu ngân
            </Button>
          </>
        )}
      </div>
    </main>
  )
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-[length:var(--fs-b1)] text-ink-body">{label}</span>
      <Money amount={amount} className="text-[length:var(--fs-b1)] text-ink-hi" />
    </div>
  )
}
