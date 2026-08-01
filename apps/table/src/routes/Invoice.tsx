import { Button, Card, Money } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { RatingCard } from '../components/RatingCard'
import { useMenu } from '../menu'
import { useTableSession } from '../table-context'

/**
 * T15 Hoá đơn.
 *
 * Bản thiết kế còn có mã tra cứu hoá đơn điện tử và dòng điểm tích luỹ. Hai thứ
 * đó chưa hiện ở đây vì chưa có nguồn: HĐĐT phải do nhà cung cấp cấp mã mới tra
 * cứu được trên hệ thống thuế, còn điểm tích luỹ cần danh tính khách mà khách
 * tại bàn thì chỉ có token của bàn. In ra một mã không tra được gì thì tệ hơn là
 * không in.
 */
export function Invoice() {
  const session = useTableSession()
  const navigate = useNavigate()
  const menu = useMenu(session.branchId)

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
  })

  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
  })

  const money = order.data?.order
  const lines = (order.data?.lines ?? []).filter(
    (l) => l.parentLineId === null && l.state !== 'voided',
  )
  const settled = bill.data ? bill.data.outstanding === 0 && bill.data.total > 0 : false

  return (
    <main className="px-4 pt-5 pb-10">
      {!settled && bill.data ? (
        <Card className="mb-4 border-warn p-4">
          <p className="text-[length:var(--fs-b1)] text-ink-hi">
            Bàn còn <Money amount={bill.data.outstanding} /> chưa trả — đây vẫn là bản tạm tính.
          </p>
        </Card>
      ) : null}

      <Card className="border-accent/16 bg-surface-4 p-6">
        <header className="border-b border-line-1 pb-5 text-center">
          <p className="font-jp tracking-[0.3em] text-[length:var(--fs-b1)] text-accent">東京空</p>
          <p className="mt-2 text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] text-ink-hi">
            TOKYO SORA
          </p>
          {menu.branch ? (
            <p className="mt-2.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              {menu.branch.name}
              {menu.branch.address ? (
                <>
                  <br />
                  {menu.branch.address}
                </>
              ) : null}
            </p>
          ) : null}
          {money ? (
            <p className="mt-2.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
              {money.displayCode} · Bàn {session.table.code}
            </p>
          ) : null}
        </header>

        <div className="py-4">
          {lines.map((line) => (
            <div key={line.id} className="flex items-start gap-2.5 py-1.5">
              <span className="w-6 flex-none font-mono text-[length:var(--fs-b2)] text-ink-mute">
                {line.qty}×
              </span>
              <span className="min-w-0 flex-1 text-[length:var(--fs-b2)] text-ink-body">
                {line.nameSnapshot}
              </span>
              <Money
                amount={line.priceTotal}
                className="flex-none text-[length:var(--fs-b2)] text-ink-hi"
              />
            </div>
          ))}
        </div>

        <div className="border-t border-line-1 pt-3.5">
          {money && money.moneyService > 0 ? (
            <Row label="Phí phục vụ" amount={money.moneyService} />
          ) : null}
          {money && money.moneyVat > 0 ? <Row label="Thuế VAT" amount={money.moneyVat} /> : null}
          {money && money.moneyRound !== 0 ? (
            <Row label="Làm tròn" amount={money.moneyRound} />
          ) : null}

          <div className="mt-2.5 flex items-baseline justify-between border-t border-line-1 pt-4">
            <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
              {settled ? 'Tổng đã trả' : 'Tổng'}
            </span>
            <Money
              amount={money?.moneyTotal ?? 0}
              className="text-[length:var(--fs-t1)] text-accent-ink"
            />
          </div>
        </div>

        {bill.data && bill.data.payments.length > 0 ? (
          <div className="mt-4 border-t border-line-1 pt-3.5">
            {bill.data.payments.map((p) => (
              <div key={p.id} className="flex justify-between py-1">
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  {p.kind === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                  {p.paidAt
                    ? ` · ${new Date(p.paidAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </span>
                <Money amount={p.amount} className="text-[length:var(--fs-c1)] text-ink-body" />
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <RatingCard sessionId={session.id} />

      <p className="mt-8 text-center text-[length:var(--fs-b1)] text-ink-mute">
        Cảm ơn bạn đã đến Tokyo Sora.
      </p>

      <Button size="lg" block className="mt-6" onClick={() => void navigate('/don')}>
        Xem lại đơn của bàn
      </Button>
    </main>
  )
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-[length:var(--fs-b2)] text-ink-mute">{label}</span>
      <Money amount={amount} className="text-[length:var(--fs-b2)] text-ink-body" />
    </div>
  )
}
