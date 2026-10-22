import { Button, EmptyState, ErrorState, Skeleton } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, type Dish } from '../api'
import { useCart } from '../cart-context'
import { CartColumn } from '../components/CartColumn'
import { DishCard } from '../components/DishCard'
import { DishDialog } from '../components/DishDialog'
import { DishLine } from '../components/DishLine'
import { useFlyToCart } from '../components/FlyToCart'
import { StoryDialog } from '../components/StoryDialog'
import { IconArrowRight, IconCheck, IconClose, IconFilter, IconSearch, IconWarning } from '../icons'
import {
  applyFilters,
  countActive,
  FILTER_LABELS,
  matches,
  needsChoice,
  NO_FILTERS,
  SUB_LABELS,
  useMenu,
  type Filters,
} from '../menu'
import { sendRounds } from '../order-status'
import { storyMore, useStories } from '../stories'
import { useTableSession } from '../table-context'
import { loadRecent, RECENT_KEY, RECENT_MAX } from './Search'

interface Section {
  key: string
  head: { kanji: string; name: string } | null
  dishes: Dish[]
}

/**
 * T2 Thực đơn trên iPad gắn bàn — cột nhóm · lưới ba cột · cột giỏ (§9.1).
 *
 * Mỗi lần chỉ hiện MỘT nhóm chứ không cuộn cả thực đơn dài như điện thoại: trên
 * màn ngang, cột nhóm bên trái đã là mục lục luôn mở, chạm là tới. Nhóm dài
 * (Nướng) chia tiếp thành chặng bò · heo · hải sản · rau ở dải thẻ phía trên.
 * Tìm món (T4) mở ngay trong cột giữa, cột nhóm và giỏ vẫn đứng yên hai bên.
 */
export function IpadMenu() {
  const session = useTableSession()
  const cart = useCart()
  const menu = useMenu(session.branchId)
  const stories = useStories()
  const fly = useFlyToCart()
  const grid = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const [catId, setCatId] = useState<string | null>(null)
  const [sub, setSub] = useState('all')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const [open, setOpen] = useState<Dish | null>(null)
  const [flash, setFlash] = useState<{ dishId: string; at: number } | null>(null)
  const [soldNotice, setSoldNotice] = useState<Dish[]>([])
  const [storyDish, setStoryDish] = useState<Dish | null>(null)

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
    refetchInterval: 15_000,
  })
  const nextRound = sendRounds(order.data).length + 1

  const dishById = useMemo(() => new Map(menu.dishes.map((d) => [d.id, d])), [menu.dishes])

  /**
   * "Gọi món này" từ Bí quyết ở Đơn của bàn dẫn về đây kèm mã món: mở đúng nhóm
   * và chi tiết món đó, như khách tự tìm tới. Xoá dấu khỏi lịch sử ngay để lùi
   * rồi tới lại không bật hộp lần nữa.
   */
  const wanted = (location.state as { open?: string } | null)?.open
  useEffect(() => {
    const dish = wanted ? dishById.get(wanted) : undefined
    if (!dish) return
    setCatId(dish.categoryId)
    setOpen(dish)
    void navigate(location.pathname, { replace: true, state: null })
  }, [wanted, dishById, navigate, location.pathname])

  /**
   * T16: bếp báo hết món đang nằm trong giỏ thì bỏ ra NGAY và nói rõ, kèm món
   * thay — đừng để khách bấm Gửi bếp rồi mới ăn lỗi, lúc đó họ đã tưởng gọi xong.
   */
  useEffect(() => {
    if (menu.soldOut.size === 0) return
    const hit = cart.items.filter((l) => menu.soldOut.has(l.dishId))
    if (hit.length === 0) return
    cart.dropSoldOut(menu.soldOut)
    setSoldNotice(
      [...new Set(hit.map((l) => l.dishId))]
        .map((id) => dishById.get(id))
        .filter((d): d is Dish => d !== undefined),
    )
  }, [menu.soldOut, cart, dishById])

  // Nhóm không còn món nào gọi được ở bàn thì không chiếm chỗ trên cột nhóm
  const rail = useMemo(
    () => menu.categories.filter((c) => menu.dishes.some((d) => d.categoryId === c.id)),
    [menu.categories, menu.dishes],
  )
  const ci = Math.max(
    0,
    rail.findIndex((c) => c.id === catId),
  )
  const cat = rail[ci] ?? null
  const next = rail[ci + 1] ?? null

  const shown = useMemo(
    () => applyFilters(menu.dishes, filters, menu.soldOut),
    [menu.dishes, filters, menu.soldOut],
  )
  const activeFilters = countActive(filters)
  const inCat = shown.filter((d) => d.categoryId === cat?.id)
  const catTotal = menu.dishes.filter((d) => d.categoryId === cat?.id).length

  const subs = Object.entries(SUB_LABELS).filter(([key]) =>
    inCat.some((d) => d.subCategory === key),
  )
  const hasSubs = subs.length > 1
  const tabs: [string, { name: string; kanji: string }][] = [
    ['all', { name: 'Tất cả', kanji: '' }],
    ...subs,
  ]
  const curSub = hasSubs && subs.some(([key]) => key === sub) ? sub : 'all'

  const sections: Section[] = !hasSubs
    ? inCat.length > 0
      ? [{ key: 'all', head: null, dishes: inCat }]
      : []
    : curSub !== 'all'
      ? [{ key: curSub, head: null, dishes: inCat.filter((d) => d.subCategory === curSub) }]
      : [
          ...subs.map(([key, label]) => ({
            key,
            head: label,
            dishes: inCat.filter((d) => d.subCategory === key),
          })),
          // Món chưa gắn chặng vẫn phải có chỗ, không được rơi khỏi nhóm
          {
            key: 'khac',
            head: null,
            dishes: inCat.filter((d) => !d.subCategory || !(d.subCategory in SUB_LABELS)),
          },
        ].filter((s) => s.dishes.length > 0)

  const qtyByCat = new Map<string, number>()
  for (const line of cart.items) {
    const c = dishById.get(line.dishId)?.categoryId
    if (c) qtyByCat.set(c, (qtyByCat.get(c) ?? 0) + line.qty)
  }

  const toTop = () => grid.current?.scrollTo({ top: 0 })
  const pickCat = (id: string) => {
    setCatId(id)
    setSub('all')
    setSearching(false)
    toTop()
  }

  const landed = (dishId: string, from: HTMLElement | null, qty: number) => {
    fly.fly(from, dishId, qty)
    setFlash({ dishId, at: Date.now() })
  }

  /** Món phải chọn vị / số người ăn thì + là MỞ chi tiết — y như điện thoại */
  const addOrOpen = (dish: Dish, from: HTMLElement | null) => {
    if (menu.soldOut.has(dish.id)) return
    if (needsChoice(menu.groupsOf(dish))) {
      setOpen(dish)
      return
    }
    cart.add({ dishId: dish.id, name: dish.nameVi, price: dish.price, note: '', options: [] })
    landed(dish.id, from, 1)
  }

  /** Chỉ nhớ từ khoá đã TÌM RA món khách chọn — chữ gõ dở không đáng gợi ý lại */
  const remember = () => {
    const term = query.trim()
    if (!term) return
    const nextRecent = [term, ...recent.filter((r) => r !== term)].slice(0, RECENT_MAX)
    setRecent(nextRecent)
    try {
      sessionStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent))
    } catch {
      // Trình duyệt chặn lưu trữ — mất gợi ý, không mất gì khác
    }
  }

  if (menu.isError) {
    return (
      <div className="grid flex-1 place-items-center p-8">
        <ErrorState
          message="Chưa tải được thực đơn. Có thể mạng chập chờn — thử lại giúp bạn."
          action={<Button onClick={menu.refetch}>Thử lại</Button>}
        />
      </div>
    )
  }

  if (menu.isPending) return <MenuSkeleton />

  if (!cat) {
    return (
      <div className="grid flex-1 place-items-center">
        <EmptyState title="Chi nhánh chưa phát hành thực đơn. Nhờ nhân viên giúp bạn gọi món nhé." />
      </div>
    )
  }

  const results = query.trim() ? menu.dishes.filter((d) => matches(d, query)) : []
  const story = storyDish ? stories.storyOf(storyDish.id) : null
  const metaOf = (d: Dish) =>
    [
      menu.categories.find((c) => c.id === d.categoryId)?.nameVi,
      d.subCategory ? SUB_LABELS[d.subCategory]?.name : undefined,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="Nhóm món"
        className="flex w-46 flex-none flex-col border-r border-accent/16 bg-surface-1 p-2"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {rail.map((c) => {
            const on = c.id === cat.id && !searching
            const qty = qtyByCat.get(c.id) ?? 0
            return (
              <button
                key={c.id}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => pickCat(c.id)}
                className={[
                  'flex h-12 w-full flex-none items-center gap-2.5 rounded-sm border pr-2.5 pl-2 text-left text-[length:var(--fs-b2)] leading-tight',
                  on
                    ? 'border-accent/45 bg-surface-4 font-semibold text-gold-200'
                    : 'border-transparent font-medium text-ink-body',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'w-6 flex-none text-center font-jp text-[length:var(--fs-t2)] leading-none font-normal',
                    on ? 'text-gold-300' : 'text-gold-700',
                  ].join(' ')}
                >
                  {c.kanji}
                </span>
                <span className="min-w-0 flex-1">{c.nameVi}</span>
                {qty > 0 ? (
                  <span className="grid h-5 min-w-[22px] flex-none place-items-center rounded-sm border border-accent/45 px-1.5 font-mono text-[length:var(--fs-c1)] leading-none font-normal text-ink-hi">
                    {qty}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex flex-none flex-col gap-1.5 border-t border-surface-4 pt-2">
          <RailTool
            on={searching}
            onClick={() => {
              setSearching(true)
              setQuery('')
            }}
          >
            <IconSearch />
            Tìm món
          </RailTool>
          <RailTool on={activeFilters > 0} onClick={() => setFilterOpen(true)}>
            <IconFilter />
            {activeFilters > 0 ? `Bộ lọc · ${activeFilters}` : 'Bộ lọc'}
          </RailTool>
        </div>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        {searching ? (
          <>
            <div className="flex flex-none items-center gap-2 px-5 pt-4">
              <div className="flex h-11 flex-1 items-center gap-2.5 rounded-sm border border-accent/45 bg-surface-3 pr-1 pl-3.5 text-ink-mute">
                <IconSearch />
                {/* Bật bàn phím ngay: khách vừa chủ động bấm Tìm món */}
                {/* `text` chứ không `search`: ô tìm kiểu search có sẵn nút xoá của trình
                    duyệt, đứng cạnh nút xoá của ta thành hai dấu × */}
                <input
                  type="text"
                  enterKeyHint="search"
                  autoFocus
                  aria-label="Tìm món"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Gõ không dấu cũng được — bo ba chi"
                  className="h-10 min-w-0 flex-1 bg-transparent text-[length:var(--fs-b2)] text-ink-hi outline-none placeholder:text-ink-mute"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Xoá chữ đã gõ"
                    onClick={() => setQuery('')}
                    className="grid h-9 w-9 place-items-center rounded-sm"
                  >
                    <IconClose size={16} />
                  </button>
                ) : null}
              </div>
              <Button variant="ghost" onClick={() => setSearching(false)}>
                Đóng
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6 [scrollbar-width:none]">
              {!query.trim() ? (
                recent.length > 0 ? (
                  <>
                    <Label>Tìm gần đây</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {recent.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => setQuery(term)}
                          className="h-11 py-1"
                        >
                          <span className="flex h-9 items-center rounded-sm border border-line-3 px-3 text-[length:var(--fs-b2)] text-ink-body">
                            {term}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[length:var(--fs-b2)] text-ink-mute">
                    Gõ tên món bằng tiếng Việt hay tiếng Nhật, có dấu hay không dấu đều được.
                  </p>
                )
              ) : results.length === 0 ? (
                <p className="py-10 text-center text-[length:var(--fs-b2)] text-ink-body">
                  Không thấy món nào khớp. Thử từ khoá khác nhé.
                </p>
              ) : (
                <>
                  <p className="mb-2.5 text-[length:var(--fs-c1)] text-ink-mute">
                    {results.length} món khớp “{query.trim()}”
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {results.map((dish) => (
                      <DishLine
                        key={dish.id}
                        dish={dish}
                        meta={metaOf(dish)}
                        soldOut={menu.soldOut.has(dish.id)}
                        needsChoice={needsChoice(menu.groupsOf(dish))}
                        onOpen={() => {
                          remember()
                          setOpen(dish)
                        }}
                        onAdd={(from) => {
                          remember()
                          addOrOpen(dish, from)
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-none items-center gap-3 px-5 pt-4">
              <span
                aria-hidden
                className="font-jp text-[length:var(--fs-t1)] leading-none text-accent"
              >
                {cat.kanji}
              </span>
              <h1 className="font-display text-[length:var(--fs-d3)] leading-[1.1] font-light text-ink-hi">
                {cat.nameVi}
              </h1>
              <div className="flex-1" />
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {activeFilters > 0 ? `${inCat.length}/${catTotal}` : catTotal} món
              </span>
            </div>

            {hasSubs ? (
              <div
                role="tablist"
                aria-label="Nhóm con"
                className="flex flex-none gap-1.5 overflow-x-auto px-5 pt-2.5 [scrollbar-width:none]"
              >
                {tabs.map(([key, label]) => {
                  const on = key === curSub
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => {
                        setSub(key)
                        toTop()
                      }}
                      className="h-11 flex-none py-1"
                    >
                      <span
                        className={[
                          'flex h-9 items-center gap-1.5 rounded-sm border px-3 text-[length:var(--fs-b2)] whitespace-nowrap',
                          on
                            ? 'border-accent/60 bg-surface-4 font-semibold text-gold-200'
                            : 'border-line-3 font-medium text-ink-body',
                        ].join(' ')}
                      >
                        {label.kanji ? (
                          <span
                            aria-hidden
                            className={[
                              'font-jp text-[length:var(--fs-b1)] leading-none font-normal',
                              on ? 'text-gold-300' : 'text-gold-700',
                            ].join(' ')}
                          >
                            {label.kanji}
                          </span>
                        ) : null}
                        {label.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}

            <div
              ref={grid}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3.5 pb-6 [scrollbar-width:none]"
            >
              {sections.map((section) => (
                <section key={section.key} className="mb-5">
                  {section.head ? (
                    <h2 className="mb-2.5 flex items-center gap-2">
                      <span
                        aria-hidden
                        className="font-jp text-[length:var(--fs-b1)] leading-none text-accent"
                      >
                        {section.head.kanji}
                      </span>
                      <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                        {section.head.name}
                      </span>
                      <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {section.dishes.length}
                      </span>
                      <span aria-hidden className="ml-1.5 h-px flex-1 bg-line-1" />
                    </h2>
                  ) : null}
                  <div className="grid grid-cols-3 gap-3">
                    {section.dishes.map((dish) => (
                      <DishCard
                        key={dish.id}
                        dish={dish}
                        soldOut={menu.soldOut.has(dish.id)}
                        remaining={menu.remainingOf.get(dish.id) ?? null}
                        needsChoice={needsChoice(menu.groupsOf(dish))}
                        qty={cart.qtyOf(dish.id)}
                        onOpen={() => setOpen(dish)}
                        onAdd={(from) => addOrOpen(dish, from)}
                        onBot={() => cart.botOf(dish.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {sections.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <p className="text-[length:var(--fs-b2)] text-ink-body">
                    Nhóm này chưa có món nào hợp bộ lọc.
                  </p>
                  <Button className="mt-3" onClick={() => setFilters(NO_FILTERS)}>
                    Xoá bộ lọc
                  </Button>
                </div>
              ) : null}

              {next ? (
                <button
                  type="button"
                  onClick={() => pickCat(next.id)}
                  className="flex h-11 w-full items-center justify-center gap-2.5 rounded-sm border border-line-1 text-[length:var(--fs-b2)] font-medium text-ink-mute"
                >
                  Nhóm tiếp
                  <span
                    aria-hidden
                    className="font-jp text-[length:var(--fs-b1)] leading-none text-accent"
                  >
                    {next.kanji}
                  </span>
                  <span className="text-ink-hi">{next.nameVi}</span>
                  <IconArrowRight size={16} />
                </button>
              ) : null}
            </div>
          </>
        )}
      </main>

      <CartColumn nextRound={nextRound} target={fly.target} landed={fly.landed} flash={flash} />

      {open ? (
        <DishDialog
          key={open.id}
          dish={open}
          groups={menu.groupsOf(open)}
          courses={menu.coursesOf(open)}
          extras={menu.extrasOf(open)}
          soldOut={menu.soldOut.has(open.id)}
          hasGrill={session.table.hasGrill}
          onClose={() => setOpen(null)}
          onAdded={(from, qty) => landed(open.id, from, qty)}
          onOpenDish={setOpen}
          onQuickAdd={addOrOpen}
          onStory={stories.storyOf(open.id) ? () => setStoryDish(open) : null}
        />
      ) : null}

      {storyDish && story ? (
        <StoryDialog
          dish={storyDish}
          story={story}
          stories={stories}
          soldOut={menu.soldOut.has(storyDish.id)}
          more={storyMore(storyDish, story, menu)}
          onOrder={(from) => {
            setStoryDish(null)
            setOpen(null)
            addOrOpen(storyDish, from)
          }}
          onOpenDish={(d) => {
            setStoryDish(null)
            setOpen(d)
          }}
          onQuickAdd={(d, from) => {
            // Món phải chọn vị mở chi tiết NẰM DƯỚI hộp này — đóng hộp để thấy nó
            if (needsChoice(menu.groupsOf(d))) setStoryDish(null)
            addOrOpen(d, from)
          }}
          onClose={() => setStoryDish(null)}
        />
      ) : null}

      {filterOpen ? (
        <FilterPopover
          filters={filters}
          matchCount={shown.length}
          onChange={setFilters}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {soldNotice.length > 0 ? (
        <SoldOutNotice
          dropped={soldNotice}
          alternatives={alternativesFor(soldNotice[0]!, menu.dishes, menu.soldOut, cart.qtyOf)}
          isChoice={(d) => needsChoice(menu.groupsOf(d))}
          onOpen={(d) => {
            setSoldNotice([])
            setOpen(d)
          }}
          onAdd={(d, from) => {
            setSoldNotice([])
            addOrOpen(d, from)
          }}
          onClose={() => setSoldNotice([])}
        />
      ) : null}

      {fly.node}
    </div>
  )
}

function RailTool({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-11 w-full items-center gap-2.5 rounded-sm border px-3 text-[length:var(--fs-b2)] font-medium',
        on ? 'border-accent/45 bg-surface-4 text-gold-200' : 'border-line-1 text-ink-body',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
      {children}
    </p>
  )
}

/**
 * Món thay cho món vừa hết: cùng nhóm, ưu tiên cùng chặng, giá gần nhất.
 *
 * Khách vừa chọn ba chỉ bò thì cái họ cần là một miếng bò khác tầm tiền đó,
 * không phải món bán chạy nhất quán.
 */
function alternativesFor(
  gone: Dish,
  dishes: Dish[],
  soldOut: Set<string>,
  qtyOf: (dishId: string) => number,
): Dish[] {
  return dishes
    .filter(
      (d) =>
        d.id !== gone.id &&
        d.categoryId === gone.categoryId &&
        !soldOut.has(d.id) &&
        qtyOf(d.id) === 0,
    )
    .sort(
      (a, b) =>
        Number(b.subCategory === gone.subCategory) - Number(a.subCategory === gone.subCategory) ||
        Math.abs(a.price - gone.price) - Math.abs(b.price - gone.price),
    )
    .slice(0, 2)
}

/** T16 — món trong giỏ vừa hết */
function SoldOutNotice({
  dropped,
  alternatives,
  isChoice,
  onOpen,
  onAdd,
  onClose,
}: {
  dropped: Dish[]
  alternatives: Dish[]
  isChoice: (dish: Dish) => boolean
  onOpen: (dish: Dish) => void
  onAdd: (dish: Dish, from: HTMLElement) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-canvas/78 animate-[sora-fade_var(--dur-panel)_var(--ease-sora)]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Món vừa hết"
        className="w-[460px] rounded-lg border border-accent/22 bg-surface-3 p-6 animate-[sora-rise_var(--dur-panel)_var(--ease-sora)]"
      >
        <IconWarning size={28} className="text-warn" />
        <p className="mt-3 text-[length:var(--fs-b1)] leading-snug font-semibold text-ink-hi">
          {dropped.map((d) => d.nameVi).join(', ')} vừa hết — đã bỏ khỏi giỏ của bạn.
        </p>
        <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
          {alternatives.length > 0 ? 'Bếp vừa báo hết. Thay bằng món khác?' : 'Bếp vừa báo hết.'}
        </p>
        {alternatives.length > 0 ? (
          <div className="mt-3.5 grid gap-2">
            {alternatives.map((d) => (
              <DishLine
                key={d.id}
                dish={d}
                meta={d.nameJa ?? ''}
                soldOut={false}
                needsChoice={isChoice(d)}
                onOpen={() => onOpen(d)}
                onAdd={(from) => onAdd(d, from)}
              />
            ))}
          </div>
        ) : null}
        <Button variant="primary" block className="mt-4" onClick={onClose}>
          Đã hiểu
        </Button>
      </div>
    </div>
  )
}

/**
 * T5 Bộ lọc — bảng nổi cạnh nút Bộ lọc, lọc ngay khi chạm.
 *
 * Nút dưới cùng nói luôn còn bao nhiêu món hợp điều kiện: khách thấy hậu quả
 * của điều kiện vừa chọn, thay vì chọn mù rồi mới biết mình vừa lọc sạch thực đơn.
 */
function FilterPopover({
  filters,
  matchCount,
  onChange,
  onClose,
}: {
  filters: Filters
  matchCount: number
  onChange: (next: Filters) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label="Đóng bộ lọc"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/55 animate-[sora-fade_var(--dur-panel)_var(--ease-sora)]"
      />
      <div
        role="dialog"
        aria-label="Bộ lọc"
        className="absolute bottom-2.5 left-48 w-80 rounded-lg border border-accent/22 bg-surface-3 p-4 animate-[sora-rise_var(--dur-panel)_var(--ease-sora)]"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Bộ lọc</p>
          {countActive(filters) > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onChange(NO_FILTERS)}>
              Xoá lọc
            </Button>
          ) : null}
        </div>
        <div className="mt-2.5 mb-3.5 grid gap-1.5">
          {FILTER_LABELS.map((row) => {
            const on = filters[row.key]
            return (
              <button
                key={row.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onChange({ ...filters, [row.key]: !on })}
                className={[
                  'flex h-11 w-full items-center gap-3 rounded-sm border px-3.5 text-left text-[length:var(--fs-b2)]',
                  on ? 'border-accent/60 bg-surface-4 text-ink-hi' : 'border-line-3 text-ink-body',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'grid h-5 w-5 flex-none place-items-center rounded-sm border-[1.5px] text-on-accent',
                    on ? 'border-accent bg-accent' : 'border-line-4',
                  ].join(' ')}
                >
                  {on ? <IconCheck size={12} stroke={3} /> : null}
                </span>
                {row.label}
              </button>
            )
          })}
        </div>
        <Button variant="primary" block onClick={onClose}>
          Xem {matchCount} món
        </Button>
      </div>
    </div>
  )
}

/** Đang tải = khung đúng hình cột nhóm và lưới thẻ, không phải vòng xoay (§4.5) */
function MenuSkeleton() {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-46 flex-none flex-col gap-1.5 border-r border-accent/16 bg-surface-1 p-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
      <div className="min-w-0 flex-1 px-5 pt-4">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-[4/4.4] rounded-md" />
          ))}
        </div>
      </div>
      <div className="w-76 flex-none border-l border-accent/16 bg-surface-1" />
    </div>
  )
}
