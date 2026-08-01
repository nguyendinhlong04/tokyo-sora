import { Badge, Button, EmptyState, Money } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api, type OrderLineRow } from '../api'
import { BottomBar, BottomBarSpacer } from '../components/BottomBar'
import { useTableSession } from '../table-context'

/** Bốn nấc khách nhìn thấy; `draft` là món chưa gửi nên chưa vào thang này */
const STEPS: OrderLineRow['state'][] = ['queued', 'cooking', 'ready', 'served']

const LABELS: Record<OrderLineRow['state'], string> = {
  draft: 'Chờ gửi bếp',
  queued: 'Bếp đã nhận',
  cooking: 'Đang làm',
  ready: 'Sắp ra',
  served: 'Đã ra',
  voided: 'Đã huỷ',
}

/**
 * T8 Đơn của bàn.
 *
 * Nhóm theo ĐỢT chứ không theo món: khách nhớ bữa ăn theo lượt gọi ("đợt sau
 * mình gọi thêm bò"), và đợt cũng chính là đơn vị bếp làm.
 */
export function Orders() {
  const session = useTableSession()
  const navigate = useNavigate()

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
    refetchInterval: 15_000,
  })

  const lines = (order.data?.lines ?? []).filter((l) => l.parentLineId === null)
  const batches = [...new Set(lines.map((l) => l.batchNo))].sort((a, b) => a - b)

  if (!order.isPending && lines.length === 0) {
    return (
      <main className="min-h-[calc(100dvh-3rem)]">
        <EmptyState
          title="Bàn chưa gọi món nào."
          action={
            <Button size="lg" onClick={() => void navigate('/thuc-don')}>
              Xem thực đơn
            </Button>
          }
        />
      </main>
    )
  }

  return (
    <main>
      <header className="px-4 pt-5 pb-2">
        <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
          Đơn của bàn {session.table.code}
        </h1>
        <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
          {order.data ? `Mã đơn ${order.data.order.displayCode}` : 'Đang tải…'}
        </p>
      </header>

      {batches.map((batchNo) => {
        const batch = order.data?.batches.find((b) => b.batchNo === batchNo)
        return (
          <section key={batchNo} className="pb-2">
            <div className="flex items-center justify-between border-y border-accent/16 bg-surface-4 px-4 py-3.5">
              <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                Đợt {batchNo}
              </span>
              <span className="font-mono text-[length:var(--fs-b2)] text-ink-mute">
                {batch?.state === 'held'
                  ? 'Chờ ra'
                  : batch?.firedAt
                    ? new Date(batch.firedAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
              </span>
            </div>

            {lines
              .filter((l) => l.batchNo === batchNo)
              .map((line) => (
                <LineRow key={line.id} line={line} />
              ))}
          </section>
        )
      })}

      <BottomBarSpacer />
      <BottomBar>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[length:var(--fs-c1)] text-ink-mute">Tạm tính</p>
            <Money
              amount={order.data?.order.moneyTotal ?? 0}
              className="text-[length:var(--fs-t2)] text-ink-hi"
            />
          </div>
          <Button size="lg" onClick={() => void navigate('/tam-tinh')}>
            Xem tạm tính
          </Button>
        </div>
      </BottomBar>
    </main>
  )
}

function LineRow({ line }: { line: OrderLineRow }) {
  const step = STEPS.indexOf(line.state)
  const voided = line.state === 'voided'

  return (
    <div className="border-b border-surface-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={[
            'text-[length:var(--fs-b1)]',
            voided ? 'text-ink-mute line-through' : 'text-ink-hi',
          ].join(' ')}
        >
          {line.qty} × {line.nameSnapshot}
        </p>
        <Badge tone={voided ? 'danger' : line.state === 'served' ? 'ok' : 'accent'}>
          {LABELS[line.state]}
        </Badge>
      </div>

      {line.note ? (
        <p className="mt-2 pl-3 text-[length:var(--fs-c1)] text-warn">▸ {line.note}</p>
      ) : null}

      {!voided && step >= 0 ? (
        <div className="mt-3 flex gap-1">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={[
                'h-1 flex-1 rounded-pill',
                index <= step ? 'bg-accent' : 'bg-line-2',
              ].join(' ')}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
