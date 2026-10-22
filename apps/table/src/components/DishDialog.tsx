import { Button, Money, PromoTag } from '@sora/ui'
import { useEffect, useState } from 'react'
import type { Dish, ModifierGroup } from '../api'
import { useCart } from '../cart-context'
import { IconBook, IconCheck, IconClose, IconMinus, IconPlus } from '../icons'
import type { SetCourse, SetExtra } from '../menu'
import { usePromos } from '../promotions'
import { DishArt } from './DishArt'
import { DishLine } from './DishLine'

/**
 * T3 Chi tiết món trên iPad — hộp thoại hai cột giữa màn.
 *
 * Bản điện thoại là tấm trượt từ đáy cho ngón cái; trên iPad nằm ngang thì hộp
 * giữa màn hợp hơn: cột trái là món (ảnh, tên, giá, dị ứng) đứng yên, cột phải
 * là phần phải chọn (vị, thêm, ghi chú) cuộn được, nút thêm ghim đáy cột phải.
 * Khách đọc món bên trái trong lúc tay chọn vị bên phải, không phải cuộn qua lại.
 *
 * Luật chọn giữ đúng như `DishSheet`: nhóm bắt buộc chọn sẵn lựa chọn đầu, nhóm
 * tuỳ chọn để trống — không ai muốn tự dưng bị tính thêm tỏi.
 */
export function DishDialog({
  dish,
  groups,
  courses,
  extras,
  soldOut,
  hasGrill,
  onClose,
  onAdded,
  onOpenDish,
  onQuickAdd,
  onStory,
}: {
  dish: Dish
  groups: ModifierGroup[]
  courses: SetCourse[]
  extras: SetExtra[]
  soldOut: boolean
  hasGrill: boolean
  onClose: () => void
  /** Đã thêm vào giỏ — nơi gọi cho nhãn "+N" bay từ nút thêm */
  onAdded: (from: HTMLElement, qty: number) => void
  /** Chạm vào một món gợi ý kèm set: mở chi tiết của chính món đó */
  onOpenDish: (dish: Dish) => void
  /** Bấm + ở món gợi ý: luật "thêm thẳng hay mở chi tiết" nằm ở nơi gọi */
  onQuickAdd: (dish: Dish, from: HTMLElement) => void
  /** Mở "Bí quyết thưởng thức" — `null` với món chưa có bài kể, khi đó không có nút */
  onStory: (() => void) | null
}) {
  const cart = useCart()
  const promos = usePromos()
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  // Nơi gọi gắn `key` theo mã món nên mỗi món mở ra là một lượt dựng mới
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.id, g.required && g.options[0] ? [g.options[0].id] : []]),
    ),
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (group: ModifierGroup, optionId: string) =>
    setPicked((current) => {
      const on = current[group.id] ?? []
      const has = on.includes(optionId)
      if (group.multi) {
        return {
          ...current,
          [group.id]: has ? on.filter((id) => id !== optionId) : [...on, optionId],
        }
      }
      // Nhóm chọn một mà không bắt buộc: chạm lại lựa chọn đang bật là bỏ chọn
      if (!group.required && has) return { ...current, [group.id]: [] }
      return { ...current, [group.id]: [optionId] }
    })

  const chosen = groups.flatMap((g) => g.options.filter((o) => (picked[g.id] ?? []).includes(o.id)))
  const unitPrice = dish.price + chosen.reduce((sum, o) => sum + o.priceDelta, 0)
  // Giỏ giữ giá niêm yết (máy chủ tự chấm lại lúc gửi); nút thêm báo giá khách sẽ trả
  const offer = soldOut ? null : promos.offerOf(dish)
  const payUnit = promos.unitPriceOf(dish, unitPrice)
  const missing = groups.filter((g) => g.required && (picked[g.id] ?? []).length === 0)
  // Món định tuyến khác nhau theo bàn có bếp hay không = món nướng tại bàn
  const grillDish =
    dish.routing !== null && dish.routing.stationGrill !== dish.routing.stationNoGrill
  const setCount = courses.reduce((sum, c) => sum + c.items.length, 0)

  const add = (from: HTMLElement) => {
    cart.add({
      dishId: dish.id,
      name: dish.nameVi,
      price: unitPrice,
      note: note.trim(),
      qty,
      options: chosen.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta })),
    })
    onAdded(from, qty)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-3">
      <button
        type="button"
        aria-label="Đóng chi tiết món"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/74 animate-[sora-fade_var(--dur-panel)_var(--ease-sora)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dish.nameVi}
        className="relative grid h-[620px] max-h-full w-[820px] max-w-full grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-lg border border-accent/22 bg-surface-3 animate-[sora-rise_var(--dur-sheet)_var(--ease-sora)]"
      >
        <div className="overflow-y-auto overscroll-contain border-r border-line-1 p-5 [scrollbar-width:none]">
          <DishArt dish={dish} soldOut={soldOut} size="detail" />
          <h2 className="mt-4 text-[length:var(--fs-t1)] leading-tight font-semibold text-ink-hi">
            {dish.nameVi}
          </h2>
          {dish.nameJa ? (
            <p
              lang="ja"
              className="mt-1 font-jp text-[length:var(--fs-b2)] tracking-[0.08em] text-gold-300"
            >
              {dish.nameJa}
            </p>
          ) : null}
          {offer && offer.price < dish.price ? (
            <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <Money
                amount={offer.price}
                className="text-[length:var(--fs-t2)] font-medium text-ember-2"
              />
              <Money
                amount={dish.price}
                className="text-[length:var(--fs-b2)] text-ink-mute line-through"
              />
            </p>
          ) : (
            <Money
              amount={dish.price}
              className="mt-2.5 block text-[length:var(--fs-b1)] text-gold-300"
            />
          )}
          {offer ? (
            <p className="mt-2">
              <PromoTag label={offer.badge} />
            </p>
          ) : null}
          {setCount > 0 ? (
            <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
              {setCount} món trong set
            </p>
          ) : null}
          {dish.shortDesc ? (
            <p className="mt-2.5 text-[length:var(--fs-b2)] leading-[1.6] text-ink-body">
              {dish.shortDesc}
            </p>
          ) : null}
          {onStory ? (
            <button
              type="button"
              onClick={onStory}
              className="mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-accent/45 text-[length:var(--fs-b2)] font-semibold text-gold-200"
            >
              <IconBook />
              Bí quyết thưởng thức
            </button>
          ) : null}
          {grillDish ? (
            <p className="mt-3.5 rounded-md border border-info/60 bg-info/8 px-3 py-2.5 text-[length:var(--fs-c1)] leading-normal text-ink-body">
              {hasGrill
                ? 'Món ra sống — bạn tự nướng trên bếp than của bàn.'
                : 'Bàn bạn không có bếp — bếp sẽ nướng sẵn, món ra chậm hơn khoảng 8 phút.'}
            </p>
          ) : null}
          {dish.allergens && dish.allergens.length > 0 ? (
            <p className="mt-3 text-[length:var(--fs-c1)] leading-normal text-ink-mute">
              Dị ứng: <span className="text-ink-body">{dish.allergens.join(', ')}</span>
            </p>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-2 [scrollbar-width:none]">
            {groups.map((group) => (
              <div
                key={group.id}
                role={group.multi ? 'group' : 'radiogroup'}
                aria-label={group.name}
                className="mb-5"
              >
                <div className="mb-2 flex items-center gap-2.5 pr-11">
                  <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                    {group.name}
                  </span>
                  <span
                    className={[
                      'rounded-sm border px-2 text-[length:var(--fs-c1)]',
                      group.required
                        ? 'border-accent/45 font-medium text-ink-hi'
                        : 'border-line-3 text-ink-mute',
                    ].join(' ')}
                  >
                    {group.required ? 'Bắt buộc' : 'Tuỳ chọn'}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {group.options.map((option) => {
                    const on = (picked[group.id] ?? []).includes(option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role={group.multi ? 'checkbox' : 'radio'}
                        aria-checked={on}
                        onClick={() => toggle(group, option.id)}
                        className={[
                          'flex h-12 w-full items-center gap-3 rounded-sm border px-3.5 text-left text-[length:var(--fs-b2)]',
                          on
                            ? 'border-accent/60 bg-surface-4 text-ink-hi'
                            : 'border-line-3 text-ink-body',
                        ].join(' ')}
                      >
                        <span
                          aria-hidden
                          className={[
                            'grid h-5 w-5 flex-none place-items-center border-[1.5px] text-on-accent',
                            group.multi ? 'rounded-sm' : 'rounded-pill',
                            on ? 'border-accent bg-accent' : 'border-line-4',
                          ].join(' ')}
                        >
                          {on ? <IconCheck size={12} stroke={3} /> : null}
                        </span>
                        <span className="flex-1">{option.name}</span>
                        {option.priceDelta > 0 ? (
                          <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                            +<Money amount={option.priceDelta} />
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {courses.length > 0 ? (
              <div className="mb-5">
                <p className="mb-3 pr-11 text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                  Trong set có gì
                </p>
                <div className="grid gap-3">
                  {courses.map((course) => (
                    <div key={course.id}>
                      <p className="mb-0.5 flex items-baseline gap-2 text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                        {course.label}
                        {/* Chặng "chọn N trong M" là danh sách để chọn, không phải được cả M */}
                        {course.pickCount !== null ? (
                          <span className="font-mono font-normal tracking-normal normal-case">
                            chọn {course.pickCount} trong {course.items.length}
                          </span>
                        ) : null}
                      </p>
                      {course.items.map((item) => (
                        <div
                          key={item.dishId}
                          className="flex justify-between gap-3 py-0.5 text-[length:var(--fs-b2)]"
                        >
                          <span className="text-ink-body">{item.name}</span>
                          <span className="flex-none font-mono text-[length:var(--fs-c1)] text-ink-mute">
                            {item.portion}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Chỉ mọc khi có món gọi được NGAY: `extrasOf` đã bỏ món hết và món không bán ở bàn */}
            {extras.length > 0 ? (
              <div className="mb-5">
                <p className="mb-2 text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                  Gọi thêm cho vừa miệng
                </p>
                <div className="grid gap-2">
                  {extras.map((extra) => (
                    <DishLine
                      key={extra.dish.id}
                      dish={extra.dish}
                      meta={extra.dish.nameJa ?? ''}
                      soldOut={false}
                      needsChoice={extra.needsChoice}
                      onOpen={() => onOpenDish(extra.dish)}
                      onAdd={(from) => onQuickAdd(extra.dish, from)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <label
              htmlFor="ghi-chu-bep"
              className="mb-2 block text-[length:var(--fs-b2)] font-semibold text-ink-hi"
            >
              Ghi chú cho bếp
            </label>
            <textarea
              id="ghi-chu-bep"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Ví dụ: cắt dày, ít mỡ"
              className="block w-full resize-none rounded-sm border border-line-3 bg-surface-4 px-3 py-2.5 text-[length:var(--fs-b2)] leading-normal text-ink-hi placeholder:text-ink-mute"
            />
          </div>

          <div className="flex flex-none gap-2.5 border-t border-line-1 px-5 pt-3 pb-4">
            <div className="flex h-[calc(var(--hit-target)*1.25)] flex-none items-center rounded-sm border border-line-3">
              <button
                type="button"
                aria-label="Bớt một phần"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                className="grid h-full w-12 place-items-center text-gold-300"
              >
                <IconMinus size={18} stroke={1.8} />
              </button>
              <span className="min-w-7 text-center font-mono text-[length:var(--fs-b1)] text-ink-hi">
                {qty}
              </span>
              <button
                type="button"
                aria-label="Thêm một phần"
                onClick={() => setQty((n) => Math.min(99, n + 1))}
                className="grid h-full w-12 place-items-center text-gold-300"
              >
                <IconPlus size={18} stroke={1.8} />
              </button>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              disabled={soldOut || missing.length > 0}
              onClick={(e) => add(e.currentTarget)}
            >
              {soldOut ? (
                'Đã hết'
              ) : missing.length > 0 ? (
                `Chọn ${missing[0]!.name.toLowerCase()}`
              ) : (
                <>
                  Thêm vào giỏ · <Money amount={payUnit * qty} />
                </>
              )}
            </Button>
          </div>
        </div>

        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="absolute top-2 right-2 grid h-11 w-11 place-items-center rounded-sm text-ink-body"
        >
          <IconClose size={20} />
        </button>
      </div>
    </div>
  )
}
