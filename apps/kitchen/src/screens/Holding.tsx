import { formatClock, serverNow } from '@sora/core'
import { Badge, EmptyState } from '@sora/ui'
import type { Queue, Ticket } from '../api'

/**
 * K4 Chờ ra.
 *
 * Hai loại vé nằm đây, và chúng CHẠY ĐỒNG HỒ NGƯỢC NHAU:
 *   · Đợt sau của đơn tại bàn — chờ phục vụ bấm "Ra đợt tiếp", chưa tính giờ.
 *   · Đơn online hẹn giờ — đếm NGƯỢC tới mốc phải bắt đầu nấu (giờ hẹn trừ thời
 *     gian nấu trừ đệm giao). Nếu dùng chung logic với đơn tại bàn thì bếp nấu
 *     sớm và món nguội — đây là điểm dễ sai được nêu riêng trong §22.
 */
export function Holding({ queue }: { queue: Queue | undefined }) {
  const waiting = (queue?.tickets ?? []).filter((t) => t.state === 'waiting')

  const scheduled = waiting.filter((t) => t.startBy)
  const batches = waiting.filter((t) => !t.startBy)

  if (waiting.length === 0) {
    return <EmptyState title="Không có vé nào đang chờ ra." />
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto">
      {scheduled.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
            Đơn hẹn giờ — đếm ngược tới lúc phải bắt đầu
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {scheduled.map((ticket) => (
              <ScheduledCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </section>
      ) : null}

      {batches.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
            Đợt sau — chờ phục vụ bấm “Ra đợt tiếp”
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {batches.map((ticket) => (
              <HeldCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ScheduledCard({ ticket }: { ticket: Ticket }) {
  const secondsLeft = Math.round((new Date(ticket.startBy!).getTime() - serverNow()) / 1000)
  // Quá mốc rồi mà chưa bắt đầu thì món sẽ trễ giờ hẹn — báo đỏ
  const late = secondsLeft <= 0
  const soon = secondsLeft > 0 && secondsLeft <= 300

  return (
    <article
      className={[
        'flex flex-col gap-2 rounded-md border-2 bg-surface-1 p-4',
        late ? 'animate-[sora-late_1.2s_step-end_infinite] border-danger' : 'border-info',
      ].join(' ')}
    >
      <header className="flex items-baseline justify-between">
        <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">{ticket.displayCode}</span>
        <span
          className={[
            'font-mono text-[length:var(--fs-clock)] tabular-nums',
            late ? 'text-danger' : soon ? 'text-warn' : 'text-info',
          ].join(' ')}
        >
          {formatClock(secondsLeft)}
        </span>
      </header>
      <Badge tone={late ? 'danger' : 'info'}>{late ? 'Phải nấu ngay' : 'Chưa tới giờ nấu'}</Badge>
      <ul className="flex flex-col gap-1">
        {ticket.items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span className="font-mono text-accent-ink">{item.qty}×</span>
            <span className="text-[length:var(--fs-b1)] text-ink-body uppercase">
              {item.nameSnapshot}
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}

function HeldCard({ ticket }: { ticket: Ticket }) {
  return (
    <article className="flex flex-col gap-2 rounded-md border border-line-2 bg-surface-1 p-4">
      <header className="flex items-baseline justify-between">
        <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
          {ticket.tableCode ? `Bàn ${ticket.tableCode}` : 'Mang về'} · Đợt {ticket.batchNo}
        </span>
        <span className="font-mono text-[length:var(--fs-b2)] text-ink-mute">
          {ticket.displayCode}
        </span>
      </header>
      <Badge>Chờ ra đợt</Badge>
      <ul className="flex flex-col gap-1">
        {ticket.items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span className="font-mono text-accent-ink">{item.qty}×</span>
            <div className="flex flex-col">
              <span className="text-[length:var(--fs-b1)] text-ink-body uppercase">
                {item.nameSnapshot}
              </span>
              {item.setLabel ? (
                <span className="text-[length:var(--fs-b2)] text-accent">[{item.setLabel}]</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </article>
  )
}
