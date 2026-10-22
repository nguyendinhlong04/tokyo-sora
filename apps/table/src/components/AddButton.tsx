import { IconMinus, IconPlus } from '../icons'

/**
 * Nút + của thẻ món trên iPad: ô vàng 32px vẽ ra, vùng chạm vẫn 44px.
 *
 * Ở lưới ba cột, nút nằm trên hàng giá của thẻ — ô vuông bo 4 cùng nhịp với mọi
 * nút khác trên màn, và nhỏ lại để tên món chứ không phải nút là thứ mắt đọc
 * trước.
 *
 * `onAdd` nhận chính nút vừa bấm: nhãn "+1" bay từ đúng chỗ ngón tay vào giỏ.
 */
export function AddButton({
  name,
  onAdd,
  disabled = false,
  choice = false,
}: {
  name: string
  onAdd: (from: HTMLElement) => void
  disabled?: boolean
  /** Món phải chọn vị: chấm kem báo trước rằng bấm sẽ mở chi tiết chứ không thêm thẳng */
  choice?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={choice ? `Chọn kiểu cho ${name}` : `Thêm ${name}`}
      disabled={disabled}
      onClick={(e) => onAdd(e.currentTarget)}
      className="relative grid h-11 w-11 flex-none place-items-center"
    >
      <span
        className={[
          'grid h-8 w-8 place-items-center rounded-sm',
          disabled ? 'bg-line-2 text-ember-0' : 'bg-accent text-on-accent',
        ].join(' ')}
      >
        <IconPlus size={16} stroke={2.2} />
      </span>
      {choice && !disabled ? (
        <span
          aria-hidden
          className="absolute top-[3px] right-[3px] h-3 w-3 rounded-pill border-2 border-surface-3 bg-gold-200"
        />
      ) : null}
    </button>
  )
}

/**
 * Thanh đếm khi món đã có trong giỏ — cùng chỗ, cùng cao 32px với nút +, để hàng
 * giá không giật khi số phần đổi từ 0 sang 1.
 */
export function QtyStepper({
  name,
  qty,
  onAdd,
  onBot,
}: {
  name: string
  qty: number
  onAdd: (from: HTMLElement) => void
  onBot: () => void
}) {
  // Nút con 32×44: phần trổ ra trên dưới viên vàng là vùng chạm trong suốt
  const half = 'grid h-11 w-8 -my-1.5 flex-none place-items-center text-on-accent'
  return (
    <div className="my-1.5 mr-1.5 flex h-8 items-center rounded-sm bg-accent text-on-accent">
      <button type="button" aria-label={`Bớt một ${name}`} onClick={onBot} className={half}>
        <IconMinus size={14} stroke={2.4} />
      </button>
      {/* Bề rộng cố định: 1 và 11 rộng khác nhau thì hai nút xê dịch dưới ngón tay */}
      <span className="min-w-5 text-center font-mono text-[length:var(--fs-b2)] font-medium tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Thêm ${name}`}
        onClick={(e) => onAdd(e.currentTarget)}
        className={half}
      >
        <IconPlus size={14} stroke={2.4} />
      </button>
    </div>
  )
}
