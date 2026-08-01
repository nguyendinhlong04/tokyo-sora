import { Button, EmptyState, ErrorState, Money, Skeleton } from '@sora/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Dish } from '../api'
import { BottomBar, BottomBarSpacer } from '../components/BottomBar'
import { DishRow } from '../components/DishRow'
import { DishSheet } from '../components/DishSheet'
import { useCart } from '../cart-context'
import { useMenu } from '../menu'
import { useTableSession } from '../table-context'

/** T2 Thực đơn — dải nhóm món dính trên, danh sách theo nhóm, giỏ ghim dưới */
export function Menu() {
  const session = useTableSession()
  const navigate = useNavigate()
  const cart = useCart()
  const menu = useMenu(session.branchId)
  const [open, setOpen] = useState<Dish | null>(null)
  const [soldOutNotice, setSoldOutNotice] = useState<string[]>([])

  /**
   * T16: bếp báo hết món đang nằm trong giỏ thì bỏ ra NGAY, đừng để khách bấm
   * "Gửi bếp" rồi mới ăn lỗi 409 — lúc đó họ đã tưởng mình gọi được món rồi.
   */
  useEffect(() => {
    if (menu.soldOut.size === 0) return
    const dropped = cart.dropSoldOut(menu.soldOut)
    if (dropped.length > 0) setSoldOutNotice(dropped)
  }, [menu.soldOut, cart])

  const groups = useMemo(() => {
    const byCategory = new Map<string | null, Dish[]>()
    for (const dish of menu.dishes) {
      byCategory.set(dish.categoryId, [...(byCategory.get(dish.categoryId) ?? []), dish])
    }
    return menu.categories
      .map((c) => ({ ...c, dishes: byCategory.get(c.id) ?? [] }))
      .filter((c) => c.dishes.length > 0)
  }, [menu.categories, menu.dishes])

  if (menu.isError) {
    return (
      <div className="p-4">
        <ErrorState
          message="Chưa tải được thực đơn. Có thể mạng chập chờn — thử lại giúp bạn."
          action={<Button onClick={menu.refetch}>Thử lại</Button>}
        />
      </div>
    )
  }

  if (menu.isPending) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-22 w-22 flex-none rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-4.5 w-3/5" />
              <Skeleton className="mt-2.5 h-3.5 w-4/5" />
              <Skeleton className="mt-2.5 h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <main>
      <nav className="sticky top-12 z-40 flex gap-1.5 overflow-x-auto border-b border-accent/16 bg-surface-2/96 px-4 py-2 backdrop-blur">
        {groups.map((c) => (
          <a
            key={c.id}
            href={`#nhom-${c.id}`}
            className="flex h-9 flex-none items-center gap-1.5 rounded-pill border border-line-3 px-3.5 text-[length:var(--fs-b2)] text-ink-body"
          >
            {c.kanji ? <span className="font-jp text-accent">{c.kanji}</span> : null}
            {c.nameVi}
          </a>
        ))}
      </nav>

      {groups.length === 0 ? (
        <EmptyState title="Chi nhánh chưa phát hành thực đơn. Nhờ nhân viên giúp bạn gọi món nhé." />
      ) : (
        groups.map((group) => (
          <section key={group.id} id={`nhom-${group.id}`} className="scroll-mt-24">
            <header className="px-4 pt-8 pb-5 text-center">
              <h2 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
                {group.nameVi}
              </h2>
              {group.kanji ? (
                <p className="mt-2 font-jp tracking-[0.2em] text-[length:var(--fs-b2)] text-ink-mute">
                  {group.kanji}
                </p>
              ) : null}
            </header>
            {group.dishes.map((dish) => (
              <DishRow
                key={dish.id}
                dish={dish}
                soldOut={menu.soldOut.has(dish.id)}
                onOpen={() => setOpen(dish)}
                onAdd={() =>
                  cart.add({ dishId: dish.id, name: dish.nameVi, price: dish.price, note: '' })
                }
              />
            ))}
          </section>
        ))
      )}

      <BottomBarSpacer />
      <BottomBar>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[length:var(--fs-b1)] text-ink-hi">
              {cart.count > 0 ? `${cart.count} món trong giỏ` : 'Giỏ đang trống'}
            </p>
            <Money amount={cart.total} className="text-[length:var(--fs-c1)] text-ink-mute" />
          </div>
          <Button
            variant="primary"
            size="lg"
            disabled={cart.count === 0}
            onClick={() => void navigate('/gio')}
          >
            Xem giỏ
          </Button>
        </div>
      </BottomBar>

      <DishSheet
        dish={open}
        soldOut={open ? menu.soldOut.has(open.id) : false}
        hasGrill={session.table.hasGrill}
        onClose={() => setOpen(null)}
      />

      <SoldOutNotice names={soldOutNotice} onClose={() => setSoldOutNotice([])} />
    </main>
  )
}

/** T16 — món trong giỏ vừa hết */
function SoldOutNotice({ names, onClose }: { names: string[]; onClose: () => void }) {
  if (names.length === 0) return null

  return (
    <div className="fixed inset-0 z-110 grid place-items-center bg-canvas/78 p-6">
      <div className="w-full rounded-lg border border-accent/16 bg-surface-4 p-6 animate-[sora-rise_var(--dur-panel)_var(--ease-sora)]">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-warn">
          <path d="M12 3 2.5 20h19L12 3Z" />
          <path d="M12 9.5v5" />
        </svg>
        <p className="mt-4.5 text-[length:var(--fs-t2)] font-semibold leading-snug text-ink-hi">
          {names.join(', ')} vừa hết — đã bỏ khỏi giỏ của bạn.
        </p>
        <p className="mt-3 text-[length:var(--fs-b1)] text-ink-body">
          Chọn món khác giúp bạn, hoặc gọi nhân viên để được gợi ý.
        </p>
        <Button variant="primary" size="lg" block className="mt-5" onClick={onClose}>
          Đã hiểu
        </Button>
      </div>
    </div>
  )
}
