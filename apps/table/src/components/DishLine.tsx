import { Money } from '@sora/ui'
import type { Dish } from '../api'
import { usePromos } from '../promotions'
import { AddButton } from './AddButton'

/**
 * Dòng món gọn 64px — kết quả tìm, món gợi ý kèm set, món thay khi vừa hết.
 *
 * Những chỗ này là danh sách để CHỌN NHANH, không phải để ngắm: một hàng chữ
 * với ô kana nhỏ, giá, và nút + là đủ; muốn xem kỹ thì chạm vào tên.
 */
export function DishLine({
  dish,
  meta,
  soldOut,
  needsChoice,
  onOpen,
  onAdd,
}: {
  dish: Dish
  /** Dòng phụ cạnh giá: nhóm món, hay tên Nhật */
  meta: string
  soldOut: boolean
  needsChoice: boolean
  onOpen: () => void
  onAdd: (from: HTMLElement) => void
}) {
  const promos = usePromos()
  const offer = soldOut ? null : promos.offerOf(dish)
  const cheaper = offer !== null && offer.price < dish.price
  return (
    <div
      className={[
        'flex h-16 items-center gap-1 rounded-md border bg-surface-3 pr-1 pl-2',
        offer ? 'border-ember-2/60' : 'border-line-1',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label={`Xem chi tiết ${dish.nameVi}`}
        onClick={onOpen}
        className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          aria-hidden
          className="grid h-12 w-12 flex-none place-items-center rounded-sm bg-[radial-gradient(120%_100%_at_50%_20%,var(--sora-line-1)_0%,var(--sora-surface-4)_74%)]"
        >
          <span className="font-jp text-[length:var(--fs-t1)] leading-none text-gold-700">
            {dish.kana ?? '空'}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[length:var(--fs-b2)] font-semibold text-ink-hi">
            {dish.nameVi}
          </span>
          <span className="mt-0.5 flex items-baseline gap-2 overflow-hidden whitespace-nowrap">
            <Money
              amount={cheaper ? offer.price : dish.price}
              className={[
                'flex-none text-[length:var(--fs-b2)]',
                cheaper ? 'font-medium text-ember-2' : soldOut ? 'text-ink-mute' : 'text-gold-300',
              ].join(' ')}
            />
            {cheaper ? (
              <Money
                amount={dish.price}
                className="flex-none text-[length:var(--fs-c1)] text-ink-mute line-through"
              />
            ) : null}
            <span className="min-w-0 truncate text-[length:var(--fs-c1)] text-ink-mute">
              {soldOut ? 'Đã hết' : offer && !cheaper ? offer.badge : meta}
            </span>
          </span>
        </span>
      </button>
      <AddButton name={dish.nameVi} onAdd={onAdd} disabled={soldOut} choice={needsChoice} />
    </div>
  )
}
