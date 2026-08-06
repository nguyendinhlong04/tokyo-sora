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
  /** Trạng thái của RIÊNG món này — bếp bấm theo món, không theo cả vé */
  state?: 'queued' | 'cooking' | 'done' | 'voided'
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
  /**
   * Chỉ truyền khi vé CÒN trong cửa sổ hoàn tác. Hết cửa sổ thì bỏ trống và ô vé
   * quay về nhãn "Đã xong" — nút biến mất là tín hiệu cho bếp biết đã chốt.
   */
  onUndo?: () => void
  /**
   * Chạm vào MỘT dòng món để bấm riêng món đó.
   *
   * Một vé có thể gồm món nướng 40 giây và món hầm 15 phút — bấm cả vé một lượt
   * là báo cho khách rằng món hầm đã xong trong khi nồi còn chưa sôi. Nút ở chân
   * vé vẫn giữ, cho vé mà mọi món ra cùng lúc.
   */
  onItemTap?: (item: TicketItemView) => void
}

/**
 * Vé bếp trên màn KDS.
 *
 * Cỡ chữ bám thang KDS ×1.25 (tên món 24 · số lượng 30 · đồng hồ 40 mono) và nút
 * cao 72px — bếp đeo găng, hơi nước, tay ướt. Trên màn thấp cả thang này hạ
 * xuống một nấc, xem `@media (max-height: 900px)` trong tokens.css.
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
  onUndo,
  onItemTap,
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
      <header className="flex items-baseline justify-between gap-3 border-b border-line-1 px-3 py-2">
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

      <ul className="flex flex-1 flex-col gap-0.5 px-2 py-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            /*
              Cả dòng là một đích chạm — bếp đeo găng, tay ướt. Chiều cao tối
              thiểu theo `--ticket-row-min`: 56px trên TV treo tường, 44px trên
              màn thấp (xem tokens.css). Món đang làm viền vàng, món xong mờ đi
              và gạch ngang: liếc một cái là biết còn gì phải nấu.
            */
            onClick={onItemTap ? () => onItemTap(item) : undefined}
            className={[
              'flex min-h-[var(--ticket-row-min)] items-start gap-2 rounded-sm px-2 py-1',
              onItemTap ? 'cursor-pointer active:bg-surface-3' : '',
              item.state === 'cooking' ? 'bg-accent/10 ring-1 ring-accent' : '',
              item.state === 'done' ? 'opacity-45' : '',
            ].join(' ')}
          >
            <span className="min-w-[3ch] font-mono text-[length:var(--fs-ticket-qty)] font-semibold text-accent-ink">
              {showGrams && item.weightGrams ? `${item.weightGrams}g` : `${item.qty}×`}
            </span>
            <div className={`flex flex-1 flex-col ${item.state === 'done' ? 'line-through' : ''}`}>
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

            {/*
              Mỗi dòng phải TỰ NÓI nó là một cái nút và chạm vào thì được gì.
              Không có chữ này thì dòng món trông như chữ thường, bếp không biết
              chạm được, và họ đi tìm cái nút to ở chân vé — cái đánh dấu cả vé.
            */}
            {onItemTap && item.state ? (
              <span
                className={[
                  'flex-none self-center rounded-sm px-2 py-1 text-[length:var(--fs-c1)] font-semibold',
                  item.state === 'queued' ? 'border border-line-3 text-ink-mute' : '',
                  item.state === 'cooking' ? 'bg-accent-strong text-on-accent' : '',
                  item.state === 'done' ? 'text-ok' : '',
                ].join(' ')}
              >
                {item.state === 'queued' ? 'Bắt đầu' : item.state === 'cooking' ? 'Xong' : '✓'}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {/*
        NHÃN PHẢI NÓI RÕ PHẠM VI.
        Khi bếp chạm một dòng món cho nó "đang làm", vé suy ra thành "đang làm" và
        nút này hiện lên ngay bên dưới — nếu nhãn chỉ ghi "Xong" thì nó đọc y như
        "xong món vừa bắt đầu", trong khi nó đánh dấu xong CẢ VÉ. Đã có người bấm
        nhầm đúng kiểu đó, và cả vé bị gạch hết.
      */}
      {!waiting && (onStart || onDone || onUndo) ? (
        <footer className="flex gap-px border-t border-line-1">
          {state === 'queued' && onStart ? (
            <button
              type="button"
              onClick={onStart}
              className="h-[var(--ticket-action-h)] flex-1 rounded-bl-md bg-surface-3 text-[length:var(--fs-t2)] font-semibold text-ink-hi active:bg-surface-4"
            >
              Bắt đầu cả vé{items.length > 1 ? ` · ${items.length} món` : ''}
            </button>
          ) : null}
          {state === 'cooking' && onDone ? (
            <button
              type="button"
              onClick={onDone}
              className="h-[var(--ticket-action-h)] flex-1 rounded-b-md bg-accent-strong text-[length:var(--fs-t2)] font-semibold text-on-accent active:brightness-110"
            >
              Xong cả vé{items.length > 1 ? ` · ${items.length} món` : ''}
            </button>
          ) : null}
          {state === 'ready' && onUndo ? (
            <button
              type="button"
              onClick={onUndo}
              className="h-[var(--ticket-action-h)] flex-1 rounded-b-md bg-surface-3 text-[length:var(--fs-t2)] font-semibold text-warn active:bg-surface-4"
            >
              Hoàn tác cả vé
            </button>
          ) : null}
          {state === 'ready' && !onUndo ? (
            <div className="flex h-[var(--ticket-action-h)] flex-1 items-center justify-center text-[length:var(--fs-t2)] text-ok">
              Đã xong
            </div>
          ) : null}
        </footer>
      ) : null}
    </article>
  )
}
