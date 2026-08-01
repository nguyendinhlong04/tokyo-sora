import { Button, Money } from '@sora/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Dish } from '../api'
import { BottomBar, BottomBarSpacer } from '../components/BottomBar'
import { DishRow } from '../components/DishRow'
import { DishSheet } from '../components/DishSheet'
import { useCart } from '../cart-context'
import { matches, useMenu } from '../menu'
import { useTableSession } from '../table-context'

/**
 * T4 Tìm món.
 *
 * Lọc ngay trên máy: cả thực đơn đã nằm trong bundle cấu hình rồi, gõ một chữ mà
 * phải chờ mạng thì tìm bằng mắt còn nhanh hơn.
 */
export function Search() {
  const session = useTableSession()
  const navigate = useNavigate()
  const cart = useCart()
  const menu = useMenu(session.branchId)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Dish | null>(null)

  const results = query.trim() ? menu.dishes.filter((d) => matches(d, query)) : []

  return (
    <main>
      <div className="p-4">
        <div className="flex h-13 items-center gap-2.5 rounded-sm border border-accent bg-surface-4 px-3.5">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" className="flex-none text-ink-mute">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
          </svg>
          {/* Bật bàn phím ngay: khách vừa chủ động bấm nút tìm, không ai vào đây để ngắm ô trống */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gõ không dấu cũng được — bo ba chi"
            className="h-12 flex-1 bg-transparent text-[length:var(--fs-b1)] text-ink-hi outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Xoá từ khoá"
              onClick={() => setQuery('')}
              className="h-8 w-8 flex-none text-[length:var(--fs-t2)] text-ink-mute"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {query.trim() && results.length === 0 ? (
        <p className="px-4 pt-4 text-[length:var(--fs-t2)] font-medium text-ink-hi">
          Không thấy món nào khớp. Thử từ khoá khác nhé.
        </p>
      ) : null}

      {results.map((dish) => (
        <DishRow
          key={dish.id}
          dish={dish}
          soldOut={menu.soldOut.has(dish.id)}
          onOpen={() => setOpen(dish)}
          onAdd={() => cart.add({ dishId: dish.id, name: dish.nameVi, price: dish.price, note: '' })}
        />
      ))}

      <BottomBarSpacer />
      <BottomBar>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[length:var(--fs-b1)] text-ink-hi">
              {cart.count > 0 ? `${cart.count} món trong giỏ` : 'Giỏ đang trống'}
            </p>
            <Money amount={cart.total} className="text-[length:var(--fs-c1)] text-ink-mute" />
          </div>
          <Button size="lg" onClick={() => void navigate('/thuc-don')}>
            Về thực đơn
          </Button>
        </div>
      </BottomBar>

      <DishSheet
        dish={open}
        soldOut={open ? menu.soldOut.has(open.id) : false}
        hasGrill={session.table.hasGrill}
        onClose={() => setOpen(null)}
      />
    </main>
  )
}
