import { Button, Money, SectionLabel } from '@sora/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Dish } from '../api'
import { BottomBar, BottomBarSpacer } from '../components/BottomBar'
import { DishRow } from '../components/DishRow'
import { DishSheet } from '../components/DishSheet'
import { useCart } from '../cart-context'
import { matches, needsChoice, useMenu } from '../menu'
import { useTableSession } from '../table-context'

const RECENT_KEY = 'sora.table.recent-searches'
const RECENT_MAX = 4

function loadRecent(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/**
 * T4 Tìm món.
 *
 * Lọc ngay trên máy: cả thực đơn đã nằm trong bundle cấu hình rồi, gõ một chữ mà
 * phải chờ mạng thì tìm bằng mắt còn nhanh hơn.
 *
 * Từ khoá vừa tìm giữ trong `sessionStorage`: giữa bữa ăn khách hay tìm lại đúng
 * món vừa xem, nhưng người ngồi bàn sau không việc gì phải thấy khách trước đã
 * tìm gì.
 */
export function Search() {
  const session = useTableSession()
  const navigate = useNavigate()
  const cart = useCart()
  const menu = useMenu(session.branchId)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const [open, setOpen] = useState<Dish | null>(null)

  const results = query.trim() ? menu.dishes.filter((d) => matches(d, query)) : []

  /** Chỉ ghi lại từ khoá TÌM RA món — từ gõ dở dang không đáng gợi ý lại */
  const remember = (term: string) => {
    const clean = term.trim()
    if (!clean || results.length === 0) return
    const next = [clean, ...recent.filter((r) => r !== clean)].slice(0, RECENT_MAX)
    setRecent(next)
    try {
      sessionStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      // Trình duyệt chặn lưu trữ — mất gợi ý, không mất gì khác
    }
  }

  const addOrOpen = (dish: Dish) => {
    if (needsChoice(menu.groupsOf(dish))) {
      setOpen(dish)
      return
    }
    cart.add({ dishId: dish.id, name: dish.nameVi, price: dish.price, note: '', options: [] })
  }

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
            onBlur={() => remember(query)}
            placeholder="Gõ không dấu cũng được — bo ba chi"
            className="h-12 flex-1 bg-transparent text-[length:var(--fs-b1)] text-ink-hi outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Xoá từ khoá"
              onClick={() => {
                remember(query)
                setQuery('')
              }}
              className="h-8 w-8 flex-none text-[length:var(--fs-t2)] text-ink-mute"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {!query.trim() && recent.length > 0 ? (
        <div className="px-4 pt-2">
          <SectionLabel>Tìm gần đây</SectionLabel>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {recent.map((term) => (
              <Button key={term} className="rounded-pill" onClick={() => setQuery(term)}>
                {term}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

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
          needsChoice={needsChoice(menu.groupsOf(dish))}
          qty={cart.qtyOf(dish.id)}
          onOpen={() => setOpen(dish)}
          onAdd={() => addOrOpen(dish)}
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

      {open ? (
        <DishSheet
          key={open.id}
          dish={open}
          groups={menu.groupsOf(open)}
          soldOut={menu.soldOut.has(open.id)}
          hasGrill={session.table.hasGrill}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </main>
  )
}
