import { Money } from '@sora/ui'
import type { Dish } from '../api'
import { AddButton, QtyStepper } from './AddButton'
import { DishArt } from './DishArt'

/**
 * Thẻ món trong lưới ba cột của iPad (T2).
 *
 * Hai đích chạm tách nhau như dòng món trên điện thoại: chạm ảnh/tên mở chi
 * tiết, nút + ở hàng giá thêm thẳng. Tên Việt hai dòng cố định và tên Nhật một
 * dòng ngay dưới, để mọi thẻ trong hàng cao bằng nhau và hàng giá thẳng một
 * đường — mắt lướt ngang đọc được giá cả hàng.
 */
export function DishCard({
  dish,
  soldOut,
  remaining,
  needsChoice,
  qty,
  onOpen,
  onAdd,
  onBot,
}: {
  dish: Dish
  soldOut: boolean
  remaining: number | null
  needsChoice: boolean
  /** Số phần món này đang nằm trong giỏ, gộp mọi dòng */
  qty: number
  onOpen: () => void
  onAdd: (from: HTMLElement) => void
  onBot: () => void
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-md border border-line-1 bg-surface-3">
      <button
        type="button"
        aria-label={`Xem chi tiết ${dish.nameVi}${soldOut ? ' — đã hết' : ''}`}
        onClick={onOpen}
        className="flex flex-1 flex-col text-left"
      >
        <DishArt dish={dish} soldOut={soldOut} size="card">
          {!soldOut && remaining !== null ? (
            <span className="absolute top-2 left-2 flex h-[22px] items-center rounded-sm border border-warn bg-canvas/80 px-2 text-[length:var(--fs-c1)] font-medium text-ink-hi">
              Còn {remaining}
            </span>
          ) : null}
        </DishArt>
        <span className="flex flex-1 flex-col px-3 pt-2.5">
          <span
            className={[
              'block h-10 overflow-hidden text-[length:var(--fs-b2)] leading-5 font-semibold',
              soldOut ? 'text-ink-mute' : 'text-ink-hi',
            ].join(' ')}
          >
            {dish.nameVi}
          </span>
          {dish.nameJa ? (
            <span
              lang="ja"
              className="mt-0.5 block truncate font-jp text-[length:var(--fs-c1)] leading-[18px] text-ink-mute"
            >
              {dish.nameJa}
            </span>
          ) : null}
          <span className="min-h-1 flex-1" />
        </span>
      </button>
      <div className="flex items-center justify-between gap-1.5 pr-0.5 pb-0.5 pl-3">
        <Money
          amount={dish.price}
          className={[
            'flex-none text-[length:var(--fs-b2)] whitespace-nowrap',
            soldOut ? 'text-ink-mute' : 'text-gold-300',
          ].join(' ')}
        />
        {qty > 0 && !soldOut ? (
          <QtyStepper name={dish.nameVi} qty={qty} onAdd={onAdd} onBot={onBot} />
        ) : (
          <AddButton name={dish.nameVi} onAdd={onAdd} disabled={soldOut} choice={needsChoice} />
        )}
      </div>
    </div>
  )
}
