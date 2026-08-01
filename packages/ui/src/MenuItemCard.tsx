import { Money } from './primitives'

export interface MenuItemCardProps {
  name: string
  price: number
  /** Huy hiệu trạm để nhân viên biết món đi đâu */
  station?: string | null
  soldOut?: boolean
  remaining?: number | null
  /** Món có nhóm tuỳ chọn bắt buộc — chấm vàng nhắc phải chọn trước */
  hasRequiredModifier?: boolean
  onClick?: () => void
}

/**
 * Ô món trên lưới gọi món P4.
 *
 * KHÔNG có ảnh: đây là lưới bấm nhanh của nhân viên, chữ + giá đọc nhanh hơn ảnh
 * và tiết kiệm hẳn một đường tải cho máy POS. Ảnh chỉ dành cho khách (Table/Web).
 */
export function MenuItemCard({
  name,
  price,
  station,
  soldOut = false,
  remaining,
  hasRequiredModifier = false,
  onClick,
}: MenuItemCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soldOut}
      className={[
        'relative flex min-h-[92px] flex-col justify-between rounded-md border border-line-2 bg-surface-1 p-3 text-left',
        'transition-colors hover:bg-surface-3 active:bg-surface-4',
        soldOut ? 'cursor-not-allowed opacity-45' : '',
      ].join(' ')}
      style={{ transitionDuration: 'var(--dur-micro)' }}
    >
      {hasRequiredModifier ? (
        <span
          className="absolute top-2 right-2 h-2 w-2 rounded-pill bg-accent"
          title="Có tuỳ chọn bắt buộc"
        />
      ) : null}

      <span
        className={[
          'text-[length:var(--fs-b1)] leading-snug font-semibold text-ink-hi',
          // Món hết bị gạch chéo chứ không ẩn đi — nhân viên vẫn thấy để báo khách
          soldOut ? 'line-through decoration-danger' : '',
        ].join(' ')}
      >
        {name}
      </span>

      <div className="flex items-end justify-between gap-2">
        <Money amount={price} className="text-[length:var(--fs-b2)] text-accent-ink" />
        <div className="flex flex-col items-end gap-0.5">
          {station ? (
            <span className="font-mono text-[length:var(--fs-c2)] text-ink-mute">{station}</span>
          ) : null}
          {soldOut ? (
            <span className="text-[length:var(--fs-c2)] text-danger">Hết</span>
          ) : typeof remaining === 'number' ? (
            <span className="text-[length:var(--fs-c2)] text-warn">còn {remaining}</span>
          ) : null}
        </div>
      </div>
    </button>
  )
}
