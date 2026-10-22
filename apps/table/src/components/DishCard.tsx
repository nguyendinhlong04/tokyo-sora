import { Money } from '@sora/ui'
import type { Dish } from '../api'
import { usePromos } from '../promotions'
import { AddButton, QtyStepper } from './AddButton'
import { DishArt } from './DishArt'
import { PromoTag } from './PromoTag'

/**
 * Thẻ món trong lưới ba cột của iPad (T2).
 *
 * Hai đích chạm tách nhau như dòng món trên điện thoại: chạm ảnh/tên mở chi
 * tiết, nút + ở hàng giá thêm thẳng. Tên Việt hai dòng cố định và tên Nhật một
 * dòng ngay dưới, để mọi thẻ trong hàng cao bằng nhau và hàng giá thẳng một
 * đường — mắt lướt ngang đọc được giá cả hàng.
 *
 * Món đang khuyến mãi (§9.6): viền và giá màu cam than, nhãn ở góc ảnh, giá gốc
 * gạch ngang trên hàng giá. Món hết thì thôi khoe khuyến mãi — không bán được thì
 * giảm bao nhiêu cũng vô nghĩa; thẻ đang báo "Còn N" thì nhãn đó quan trọng hơn.
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
  const promos = usePromos()
  const offer = soldOut ? null : promos.offerOf(dish)
  const cheaper = offer !== null && offer.price < dish.price
  return (
    <div
      className={[
        'relative flex flex-col overflow-hidden rounded-md border bg-surface-3',
        offer ? 'border-ember-2/60' : 'border-line-1',
      ].join(' ')}
    >
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
          ) : offer ? (
            <span className="absolute top-2 left-2">
              <PromoTag label={offer.badge} />
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
          {cheaper ? (
            <Money
              amount={dish.price}
              className="mt-1 block text-[length:var(--fs-c1)] leading-4 text-ink-mute line-through"
            />
          ) : null}
        </span>
      </button>
      <div className="flex items-center justify-between gap-1.5 pr-0.5 pb-0.5 pl-3">
        <Money
          amount={cheaper ? offer.price : dish.price}
          className={[
            'flex-none whitespace-nowrap',
            cheaper
              ? 'text-[length:var(--fs-b1)] font-medium text-ember-2'
              : soldOut
                ? 'text-[length:var(--fs-b2)] text-ink-mute'
                : 'text-[length:var(--fs-b2)] text-gold-300',
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
