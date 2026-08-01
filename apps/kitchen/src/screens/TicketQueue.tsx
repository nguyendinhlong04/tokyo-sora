import { elapsedSeconds } from '@sora/core'
import { EmptyState, OrderTicket, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Queue, type Ticket } from '../api'

/**
 * K2 Hàng vé.
 *
 * Không cuộn: lưới cố định theo số cột của trạm, quá số ô thì hiện "còn N đơn".
 * Bếp không rảnh tay để cuộn, và vé trôi khỏi màn là vé bị quên.
 */
export function TicketQueue({ queue, loading }: { queue: Queue | undefined; loading: boolean }) {
  const toast = useToast()
  const qc = useQueryClient()

  const setState = useMutation({
    mutationFn: ({ ticket, action }: { ticket: Ticket; action: 'start' | 'done' }) =>
      api.setState(
        ticket.id,
        action,
        `${action === 'start' ? 'Bắt đầu' : 'Xong'} ${ticket.displayCode}`,
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['queue'] }),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const live = (queue?.tickets ?? []).filter((t) => t.state !== 'waiting')

  // Quá giờ nhảy lên đầu — vé trễ phải đập vào mắt trước
  const sorted = [...live].sort((a, b) => {
    const ratioOf = (t: Ticket) =>
      t.prepSeconds > 0 ? elapsedSeconds(t.queuedAt) / t.prepSeconds : 0
    return ratioOf(b) - ratioOf(a)
  })

  // Lưới cố định theo số cột của TRẠM (§22): ST-02 sáu cột vé thấp, ST-06 bốn cột
  // vé cao. Hai hàng là vừa tầm mắt trên TV treo tường.
  const columns = queue?.station.columns ?? 4
  const shown = sorted.slice(0, columns * 2)
  const overflow = sorted.length - shown.length

  if (loading) return <p className="p-4 text-ink-mute">Đang tải hàng vé…</p>
  if (shown.length === 0) {
    return <EmptyState title="Chưa có vé nào. Vé mới sẽ tự hiện ở đây." />
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="grid flex-1 content-start gap-4 overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {shown.map((ticket) => (
          <OrderTicket
            key={ticket.id}
            displayCode={ticket.displayCode}
            tableCode={ticket.tableCode}
            batchNo={ticket.batchNo}
            state={ticket.state}
            elapsedSeconds={elapsedSeconds(ticket.queuedAt)}
            prepSeconds={ticket.prepSeconds}
            grillServiceNote={ticket.grillServiceNote}
            showGrams={ticket.stationId === 'ST-02'}
            items={ticket.items.map((i) => ({
              id: i.id,
              name: i.nameSnapshot,
              qty: i.qty,
              note: i.note,
              setLabel: i.setLabel,
              componentLabel: i.componentLabel,
              portionLabel: i.portionLabel,
              weightGrams: i.weightGrams,
            }))}
            onStart={() => setState.mutate({ ticket, action: 'start' })}
            onDone={() => setState.mutate({ ticket, action: 'done' })}
          />
        ))}
      </div>

      {overflow > 0 ? (
        <p className="shrink-0 pt-3 text-[length:var(--fs-t2)] text-warn">Còn {overflow} vé nữa</p>
      ) : null}
    </div>
  )
}
