import { emberColor, formatClock, isOverdue } from '@sora/core'
import { Badge } from './primitives'

export interface TicketItemView {
  id: number
  name: string
  qty: number
  note: string | null
  setLabel: string | null
  componentLabel: string | null
  portionLabel: string | null
  weightGrams: number | null
}

export interface OrderTicketProps {
  displayCode: string
  tableCode: string | null
  batchNo: number
  state: 'waiting' | 'queued' | 'cooking' | 'ready'
  /** Giây đã trôi kể từ khi vé vào hàng — tính theo giờ SERVER */
  elapsedSeconds: number
  prepSeconds: number
  grillServiceNote: string | null
  items: TicketItemView[]
  /** ST-02 hiện gram từ cân điện tử thay vì số phần */
  showGrams?: boolean
  onStart?: () => void
  onDone?: () => void
}

/**
 * Vé bếp trên màn KDS.
 *
 * Cỡ chữ bám thang KDS ×1.25 (tên món 24 · số lượng 30 · đồng hồ 40 mono) và nút
 * cao 72px — bếp đeo găng, hơi nước, tay ướt.
 *
 * Ghi chú của khách dùng màu kohaku và KHÔNG BAO GIỜ bị ẩn (§22).
 */
export function OrderTicket({
  displayCode,
  tableCode,
  batchNo,
  state,
  elapsedSeconds,
  prepSeconds,
  grillServiceNote,
  items,
  showGrams = false,
  onStart,
  onDone,
}: OrderTicketProps) {
  const ratio = prepSeconds > 0 ? elapsedSeconds / prepSeconds : 0
  const overdue = isOverdue(ratio) && state !== 'waiting'
  const waiting = state === 'waiting'

  return (
    <article
      className={[
        'flex flex-col rounded-md border-2 bg-surface-1',
        overdue ? 'animate-[sora-late_1.2s_step-end_infinite] border-danger' : 'border-line-2',
      ].join(' ')}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-line-1 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
            {tableCode ? `Bàn ${tableCode}` : 'Mang về'} · Đợt {batchNo}
          </span>
          <span className="font-mono text-[length:var(--fs-b2)] text-ink-mute">{displayCode}</span>
        </div>
        {waiting ? (
          <Badge>Chờ ra</Badge>
        ) : (
          <span
            className="font-mono text-[length:var(--fs-clock)] tabular-nums"
            style={{ color: emberColor(ratio) }}
          >
            {formatClock(elapsedSeconds)}
          </span>
        )}
      </header>

      {grillServiceNote ? (
        <p className="border-b border-line-1 px-4 py-2 text-[length:var(--fs-b2)] text-info">
          {grillServiceNote}
        </p>
      ) : null}

      <ul className="flex flex-1 flex-col gap-3 px-4 py-3">
        {items.map((item) => (
          <li key={item.id} className="flex gap-3">
            <span className="min-w-[3ch] font-mono text-[length:var(--fs-ticket-qty)] font-semibold text-accent-ink">
              {showGrams && item.weightGrams ? `${item.weightGrams}g` : `${item.qty}×`}
            </span>
            <div className="flex flex-1 flex-col">
              <span className="text-[length:var(--fs-ticket-dish)] leading-tight font-semibold text-ink-hi uppercase">
                {item.name}
              </span>
              {item.setLabel ? (
                <span className="text-[length:var(--fs-b2)] text-accent">[{item.setLabel}]</span>
              ) : null}
              {item.componentLabel ? (
                <span className="text-[length:var(--fs-b2)] text-ink-mute">{item.componentLabel}</span>
              ) : null}
              {item.portionLabel ? (
                <span className="font-mono text-[length:var(--fs-b2)] text-ink-mute">
                  {item.portionLabel}
                </span>
              ) : null}
              {item.note ? (
                <span className="text-[length:var(--fs-t2)] text-warn">{item.note}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {!waiting && (onStart || onDone) ? (
        <footer className="flex gap-px border-t border-line-1">
          {state === 'queued' && onStart ? (
            <button
              type="button"
              onClick={onStart}
              className="h-[72px] flex-1 rounded-bl-md bg-surface-3 text-[length:var(--fs-t2)] font-semibold text-ink-hi active:bg-surface-4"
            >
              Bắt đầu
            </button>
          ) : null}
          {state === 'cooking' && onDone ? (
            <button
              type="button"
              onClick={onDone}
              className="h-[72px] flex-1 rounded-b-md bg-accent-strong text-[length:var(--fs-t2)] font-semibold text-on-accent active:brightness-110"
            >
              Xong
            </button>
          ) : null}
          {state === 'ready' ? (
            <div className="flex h-[72px] flex-1 items-center justify-center text-[length:var(--fs-t2)] text-ok">
              Đã xong
            </div>
          ) : null}
        </footer>
      ) : null}
    </article>
  )
}
