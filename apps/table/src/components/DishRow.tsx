import { Badge, Money } from '@sora/ui'
import type { Dish } from '../api'
import { Plate } from './Plate'

/**
 * Một dòng món trên thực đơn (bố cục A của bản thiết kế — dòng 104px).
 *
 * Chạm vào phần chữ mở chi tiết; nút + thêm thẳng vào giỏ. Hai đích chạm tách
 * hẳn nhau: khách đã biết mình muốn gì thì không phải mở thêm màn nào.
 */
export function DishRow({
  dish,
  soldOut,
  onOpen,
  onAdd,
}: {
  dish: Dish
  soldOut: boolean
  onOpen: () => void
  onAdd: () => void
}) {
  return (
    <div className="flex h-26 items-center gap-3.5 border-b border-surface-4 px-4">
      <button type="button" onClick={onOpen} className="flex flex-1 items-center gap-3.5 text-left">
        <Plate kanji={dish.kana} className="h-22 w-22 flex-none" />
        <span className="min-w-0 flex-1">
          <span className="block text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            {dish.nameVi}
          </span>
          {dish.shortDesc ? (
            <span className="mt-1 block truncate text-[length:var(--fs-b2)] text-ink-body">
              {dish.shortDesc}
            </span>
          ) : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <Money amount={dish.price} className="text-[length:var(--fs-b1)] text-accent-ink" />
            {soldOut ? <Badge tone="danger">Tạm hết</Badge> : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Thêm ${dish.nameVi}`}
        disabled={soldOut}
        onClick={onAdd}
        className="h-[var(--hit-target)] w-[var(--hit-target)] flex-none rounded-sm border border-accent text-[length:var(--fs-t1)] text-accent-ink disabled:border-line-4 disabled:text-ink-mute"
      >
        +
      </button>
    </div>
  )
}
