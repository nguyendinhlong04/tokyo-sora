import { Badge, Button, Money, SectionLabel } from '@sora/ui'
import { useEffect, useState } from 'react'
import type { Dish } from '../api'
import { useCart } from '../cart-context'
import { Plate } from './Plate'
import { Sheet } from './Sheet'

/**
 * T3 Chi tiết món.
 *
 * Chưa có nhóm tuỳ chọn (thêm tỏi, chọn vị): danh mục hiện chưa mô tả modifier
 * nào — P6 của POS cũng vậy. Ghi chú cho bếp thì có, vì dòng đơn đã có chỗ chứa
 * và bếp đọc được ngay trên vé.
 */
export function DishSheet({
  dish,
  soldOut,
  hasGrill,
  onClose,
}: {
  dish: Dish | null
  soldOut: boolean
  hasGrill: boolean
  onClose: () => void
}) {
  const cart = useCart()
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  useEffect(() => {
    setQty(1)
    setNote('')
  }, [dish])

  if (!dish) return null

  const grillWarning = !hasGrill && dish.routing?.stationGrill !== dish.routing?.stationNoGrill

  return (
    <Sheet open onClose={onClose} full>
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <Plate kanji={dish.kana} className="aspect-3/2 w-full" textClassName="text-[104px]" />

        <p className="mt-5 text-[length:var(--fs-t1)] font-semibold text-ink-hi">{dish.nameVi}</p>
        {dish.nameJa ? (
          <p className="mt-1.5 font-jp tracking-[0.12em] text-[length:var(--fs-b2)] text-accent-ink">
            {dish.nameJa}
          </p>
        ) : null}

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <Money amount={dish.price} className="text-[length:var(--fs-t2)] text-accent-ink" />
          {soldOut ? <Badge tone="danger">Tạm hết</Badge> : null}
        </div>

        {dish.shortDesc ? (
          <p className="mt-3 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
            {dish.shortDesc}
          </p>
        ) : null}

        {dish.allergens && dish.allergens.length > 0 ? (
          <div className="mt-4.5 flex flex-wrap gap-2">
            {dish.allergens.map((a) => (
              <Badge key={a} tone="warn">
                {a}
              </Badge>
            ))}
          </div>
        ) : null}

        {grillWarning ? (
          <p className="mt-4.5 rounded-md border border-info bg-info/8 p-4 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
            Bàn bạn không có bếp — bếp sẽ nướng sẵn, món ra chậm hơn khoảng 8 phút.
          </p>
        ) : null}

        <div className="mt-7 pb-6">
          <SectionLabel>Ghi chú cho bếp</SectionLabel>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Ví dụ: cắt dày, không hành"
            className="mt-3 w-full resize-y rounded-sm border border-line-3 bg-surface-4 px-3.5 py-3 text-[length:var(--fs-b1)] leading-relaxed text-ink-hi"
          />
        </div>
      </div>

      <div className="flex flex-none gap-3 border-t border-accent/16 bg-surface-4 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex h-14 flex-none items-center rounded-sm border border-line-3">
          <button
            type="button"
            aria-label="Bớt một"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            className="h-full w-11 text-[length:var(--fs-t2)] text-accent-ink"
          >
            −
          </button>
          <span className="min-w-8 text-center font-mono text-[length:var(--fs-t2)] text-ink-hi">
            {qty}
          </span>
          <button
            type="button"
            aria-label="Thêm một"
            onClick={() => setQty((n) => Math.min(99, n + 1))}
            className="h-full w-11 text-[length:var(--fs-t2)] text-accent-ink"
          >
            +
          </button>
        </div>
        <Button
          variant="primary"
          size="lg"
          className="h-14 flex-1"
          disabled={soldOut}
          onClick={() => {
            cart.add({ dishId: dish.id, name: dish.nameVi, price: dish.price, note, qty })
            onClose()
          }}
        >
          Thêm · <Money amount={dish.price * qty} />
        </Button>
      </div>
    </Sheet>
  )
}
