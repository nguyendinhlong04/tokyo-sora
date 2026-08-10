import { Badge, Button, Money, SectionLabel } from '@sora/ui'
import { useState } from 'react'
import type { Dish, ModifierGroup } from '../api'
import { useCart } from '../cart-context'
import { Plate } from './Plate'
import { Sheet } from './Sheet'

/**
 * T3 Chi tiết món.
 *
 * Nhóm BẮT BUỘC mở sẵn lựa chọn đầu tiên: khách gọi món nướng luôn phải có một
 * vị chấm, để trống rồi bắt họ tìm xem thiếu gì là bắt họ làm việc của mình.
 * Nhóm không bắt buộc thì để trống — không ai muốn tự dưng bị tính thêm tỏi.
 */
export function DishSheet({
  dish,
  groups,
  soldOut,
  hasGrill,
  onClose,
}: {
  dish: Dish
  groups: ModifierGroup[]
  soldOut: boolean
  hasGrill: boolean
  onClose: () => void
}) {
  const cart = useCart()
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  // Nơi gọi gắn `key` theo mã món nên mỗi lượt mở là một lượt dựng mới — không
  // cần effect nào đi dọn lại trạng thái của món trước.
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.id, g.required && g.options[0] ? [g.options[0].id] : []]),
    ),
  )

  const toggle = (group: ModifierGroup, optionId: string) =>
    setPicked((current) => {
      const on = current[group.id] ?? []
      if (!group.multi) return { ...current, [group.id]: [optionId] }
      return {
        ...current,
        [group.id]: on.includes(optionId)
          ? on.filter((id) => id !== optionId)
          : [...on, optionId],
      }
    })

  const chosen = groups.flatMap((g) =>
    g.options.filter((o) => (picked[g.id] ?? []).includes(o.id)),
  )
  const unitPrice = dish.price + chosen.reduce((sum, o) => sum + o.priceDelta, 0)
  const missing = groups.filter((g) => g.required && (picked[g.id] ?? []).length === 0)
  const grillWarning = !hasGrill && dish.routing?.stationGrill !== dish.routing?.stationNoGrill

  return (
    <Sheet open onClose={onClose} full>
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <Plate
          kanji={dish.kana}
          src={dish.imageUrl}
          alt={dish.nameVi}
          className="aspect-3/2 w-full"
          textClassName="text-[104px]"
        />

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

        {groups.map((group) => (
          <div key={group.id} className="mt-7">
            <SectionLabel>
              {group.name}
              {group.required ? ' *' : ''}
            </SectionLabel>
            <div className="mt-3 grid gap-2">
              {group.options.map((option) => {
                const on = (picked[group.id] ?? []).includes(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggle(group, option.id)}
                    className={[
                      'flex h-13 w-full items-center gap-3 rounded-sm border px-3.5 text-left text-[length:var(--fs-b1)]',
                      on ? 'border-accent text-gold-200' : 'border-line-3 text-ink-body',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'grid h-4.5 w-4.5 flex-none place-items-center border',
                        group.multi ? 'rounded-xs' : 'rounded-pill',
                        on ? 'border-accent bg-accent' : 'border-line-4',
                      ].join(' ')}
                    >
                      {on ? (
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" className="text-on-accent">
                          <path d="M4 12.5 9.5 18 20 7" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="flex-1">{option.name}</span>
                    {option.priceDelta > 0 ? (
                      <Money
                        amount={option.priceDelta}
                        className="flex-none text-[length:var(--fs-b2)] text-accent-ink"
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

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
          disabled={soldOut || missing.length > 0}
          onClick={() => {
            cart.add({
              dishId: dish.id,
              name: dish.nameVi,
              price: unitPrice,
              note,
              qty,
              options: chosen.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta })),
            })
            onClose()
          }}
        >
          {missing.length > 0 ? (
            `Chọn ${missing[0]!.name.toLowerCase()}`
          ) : (
            <>
              Thêm · <Money amount={unitPrice * qty} />
            </>
          )}
        </Button>
      </div>
    </Sheet>
  )
}
