import { elapsedSeconds } from '@sora/core'
import { EmptyState, OrderTicket, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
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
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = queue?.station.columns ?? 4
  const rows = useFittingRows(gridRef, columns)

  const ACTION_LABEL = { start: 'Bắt đầu', done: 'Xong', undo: 'Hoàn tác' } as const

  const setState = useMutation({
    mutationFn: ({ ticket, action }: { ticket: Ticket; action: 'start' | 'done' | 'undo' }) =>
      api.setState(ticket.id, action, `${ACTION_LABEL[action]} ${ticket.displayCode}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['queue'] }),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const setItem = useMutation({
    mutationFn: ({
      itemId,
      action,
      name,
    }: {
      itemId: number
      action: 'start' | 'done' | 'undo'
      name: string
    }) => api.setItemState(itemId, action, `${ACTION_LABEL[action]} ${name}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['queue'] }),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  /**
   * Chạm một dòng món là đi tiếp một nấc: chưa làm → đang làm → xong.
   *
   * Món đã xong thì chạm lại là HOÀN TÁC, và chỉ trong cửa sổ cho phép — quá hạn
   * thì máy chủ từ chối và toast nói rõ, chứ không im lặng nuốt cú chạm.
   */
  const tapItem = (item: { id: number; name: string; state?: string }) => {
    const action = item.state === 'queued' ? 'start' : item.state === 'cooking' ? 'done' : 'undo'
    setItem.mutate({ itemId: item.id, action, name: item.name })
  }

  const live = (queue?.tickets ?? []).filter((t) => t.state !== 'waiting')

  /**
   * Đồng hồ vé DỪNG lúc bấm Xong. Để nó chạy tiếp thì vé vừa xong đúng giờ vẫn
   * đỏ dần lên trong lúc nằm chờ hoàn tác, và bếp đọc thành làm trễ.
   */
  const cookSeconds = (t: Ticket) =>
    t.state === 'ready' && t.readyAt && t.queuedAt
      ? Math.max(0, Math.round((Date.parse(t.readyAt) - Date.parse(t.queuedAt)) / 1000))
      : elapsedSeconds(t.queuedAt)

  // Quá giờ nhảy lên đầu — vé trễ phải đập vào mắt trước. Vé đã xong thì xuống
  // cuối dù đồng hồ có cao: chỗ trên cùng để dành cho việc CÒN PHẢI LÀM.
  const sorted = [...live].sort((a, b) => {
    if ((a.state === 'ready') !== (b.state === 'ready')) return a.state === 'ready' ? 1 : -1
    const ratioOf = (t: Ticket) => (t.prepSeconds > 0 ? cookSeconds(t) / t.prepSeconds : 0)
    return ratioOf(b) - ratioOf(a)
  })

  /**
   * Cửa sổ hoàn tác tính theo giờ máy chủ đã hiệu chỉnh, cùng mốc mà máy chủ dùng
   * để chặn. Máy chủ vẫn là bên quyết định — cái này chỉ để nút biến mất đúng lúc
   * thay vì để bếp bấm vào một thứ chắc chắn bị từ chối.
   */
  const undoSeconds = queue?.undoSeconds ?? 30
  const stillUndoable = (t: Ticket) =>
    t.state === 'ready' && t.readyAt !== null && elapsedSeconds(t.readyAt) <= undoSeconds

  // Số CỘT cố định theo trạm (§22): ST-02 sáu cột vé thấp, ST-06 bốn cột vé cao.
  // Số HÀNG thì theo chỗ thật còn lại trên màn — xem useFittingRows.
  const shown = sorted.slice(0, columns * rows)
  const overflow = sorted.length - shown.length

  if (loading) return <p className="p-4 text-ink-mute">Đang tải hàng vé…</p>
  if (shown.length === 0) {
    return <EmptyState title="Chưa có vé nào. Vé mới sẽ tự hiện ở đây." />
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={gridRef}
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
            elapsedSeconds={cookSeconds(ticket)}
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
              state: i.state,
            }))}
            onItemTap={(item) => tapItem({ id: item.id, name: item.name, state: item.state })}
            onStart={() => setState.mutate({ ticket, action: 'start' })}
            onDone={() => setState.mutate({ ticket, action: 'done' })}
            onUndo={
              stillUndoable(ticket)
                ? () => setState.mutate({ ticket, action: 'undo' })
                : undefined
            }
          />
        ))}
      </div>

      {overflow > 0 ? (
        <p className="shrink-0 pt-3 text-[length:var(--fs-t2)] text-warn">Còn {overflow} vé nữa</p>
      ) : null}
    </div>
  )
}

/** Hai hàng là tối đa: quá tầm mắt thì vé hàng dưới không ai đọc */
const MAX_ROWS = 2
/** Khớp `gap-4` của lưới */
const GRID_GAP = 16

/**
 * Số hàng vé VỪA trong khung — đo thật, không đoán theo chiều cao màn.
 *
 * Ngưỡng cố định kiểu "màn cao hơn X thì hai hàng" không dùng được, vì thẻ vé cao
 * theo SỐ MÓN: vé một món ~295px, vé ba món ~525px. Đúng giờ đông — lúc vé dài
 * nhất và lúc màn này quan trọng nhất — ngưỡng nào cũng sai.
 *
 * Hàng thứ hai bị đáy màn cắt ngang thân thẻ còn tệ hơn không hiện: bếp tưởng đã
 * đọc hết vé đó trong khi món cuối nằm dưới mép màn. Vé không vừa thì rơi xuống
 * dòng "Còn N vé nữa", đúng cách màn này vẫn xử lý phần tràn.
 *
 * Đo theo HÀNG ĐẦU, hàng luôn hiện dù đang một hay hai hàng — nên con số không
 * đổi theo chính kết quả của nó, và lưới không nhấp nháy giữa một và hai hàng.
 */
function useFittingRows(grid: RefObject<HTMLDivElement | null>, columns: number) {
  const [rows, setRows] = useState(MAX_ROWS)

  // Không cần ResizeObserver: màn này vẽ lại mỗi giây để nhích đồng hồ vé, nên
  // phép đo tự bám theo cả lúc đổi cỡ cửa sổ lẫn lúc vé thay đổi số món.
  useLayoutEffect(() => {
    const el = grid.current
    if (!el) return
    const firstRow = [...el.children].slice(0, columns) as HTMLElement[]
    const rowHeight = Math.max(0, ...firstRow.map((card) => card.offsetHeight))
    if (rowHeight === 0) return
    const fits = Math.floor((el.clientHeight + GRID_GAP) / (rowHeight + GRID_GAP))
    setRows(Math.min(MAX_ROWS, Math.max(1, fits)))
  })

  return rows
}
