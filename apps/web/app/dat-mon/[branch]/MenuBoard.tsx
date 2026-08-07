'use client'

import { formatVnd } from '@sora/contracts'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { OnlineDish, OnlineMenu } from '../../../lib/api'
import { useOrder } from '../order-context'
import { DishSheet } from './DishSheet'

/**
 * O2 — thực đơn online.
 *
 * Desktop hai cột: thực đơn trái, giỏ dính phải (§23.2). Mobile một cột, giỏ
 * nằm ở thanh ghim đáy — ngón cái với tới được.
 */
export function MenuBoard({ menu }: { menu: OnlineMenu }) {
  const { draft, set, add, setQty, qtyOf, count, sub } = useOrder()
  const [open, setOpen] = useState<OnlineDish | null>(null)

  // Vào thẳng /dat-mon/{chi-nhánh} từ kết quả tìm kiếm thì chưa qua O1
  useEffect(() => {
    if (draft.branchId !== menu.branch.id) set({ branchId: menu.branch.id })
  }, [draft.branchId, menu.branch.id, set])

  const groups = menu.categories
    .map((c) => ({ ...c, dishes: menu.dishes.filter((d) => d.categoryId === c.id) }))
    .filter((c) => c.dishes.length > 0)

  return (
    <main className="mx-auto max-w-6xl px-4 pb-32 lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:pb-12">
      <div>
        <header className="pt-6">
          <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
            Đặt món · {menu.branch.name}
          </h1>
          <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
            {draft.mode === 'delivery' ? 'Giao tận nơi' : 'Mang về tại quán'} ·{' '}
            {menu.branch.address}
          </p>
        </header>

        <nav className="sticky top-14 z-40 -mx-4 mt-4 flex gap-1.5 overflow-x-auto border-b border-accent/16 bg-surface-2/96 px-4 py-2 backdrop-blur">
          {groups.map((group) => (
            <a
              key={group.id}
              href={`#nhom-${group.id}`}
              /* 44 chứ không 36: đây là điều hướng chính của màn gọi món, mà 36
                 dưới ngưỡng ngón tay. Thanh cao thêm 8 nên `scroll-mt` của các
                 nhóm bên dưới phải nới theo, xem chú ở đó. */
              className="flex h-11 flex-none items-center gap-1.5 rounded-pill border border-line-3 px-3.5 text-[length:var(--fs-b2)] text-ink-body"
            >
              {group.kanji ? <span className="font-jp text-accent">{group.kanji}</span> : null}
              {group.nameVi}
            </a>
          ))}
        </nav>

        {groups.map((group) => (
          /* 120 = thanh trên 56 + thanh nhóm 60 (chip 44 + đệm 8×2) + 4 thở.
             Nhảy tới một nhóm mà dừng ở 112 như trước là tiêu đề nhóm chui xuống
             dưới đúng cái thanh vừa bấm. */
          <section key={group.id} id={`nhom-${group.id}`} className="scroll-mt-30">
            <header className="px-1 pt-8 pb-4 text-center">
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
              <div
                key={dish.id}
                className="flex h-26 items-center gap-3.5 border-b border-surface-4"
              >
                <button
                  type="button"
                  onClick={() => setOpen(dish)}
                  /* `min-w-0` là bắt buộc, không phải cho đẹp: mặc định flex-item
                     có `min-width:auto` nên không co dưới bề rộng nội dung, mà
                     `truncate` bên trong là `nowrap` — min-content của nó bằng CẢ
                     câu mô tả. Thiếu một chữ này thì trên điện thoại hàng món đẩy
                     nút + ra ngoài màn hình. */
                  className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                >
                  <span className="grid h-22 w-22 flex-none place-items-center rounded-md border border-line-1 bg-[radial-gradient(120%_100%_at_50%_20%,var(--sora-line-1)_0%,var(--sora-surface-4)_74%)]">
                    <span className="font-jp text-[40px] leading-none text-gold-900">
                      {dish.kana ?? '空'}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                      {dish.nameVi}
                    </span>
                    {dish.shortDesc ? (
                      <span className="mt-1 block truncate text-[length:var(--fs-b2)] text-ink-body">
                        {dish.shortDesc}
                      </span>
                    ) : null}
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[length:var(--fs-b1)] text-accent-ink">
                        {formatVnd(dish.price)}
                      </span>
                      {dish.soldOut ? (
                        <span className="inline-flex h-5.5 items-center rounded-pill border border-danger px-2 text-[length:var(--fs-c2)] font-semibold text-danger">
                          Tạm hết
                        </span>
                      ) : null}
                      {/* Nhãn "ngon nhất trong 30 phút" để ở màn chi tiết: gần như
                          cả nhóm Nướng đều rời vỉ than, gắn lên từng dòng thì
                          mười dòng liền nhau cùng một nhãn và nhãn hết nghĩa */}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Thêm ${dish.nameVi}`}
                  disabled={dish.soldOut}
                  onClick={() => add(dish)}
                  className="relative h-11 w-11 flex-none rounded-sm border border-accent text-[length:var(--fs-t1)] text-accent-ink disabled:border-line-4 disabled:text-ink-mute"
                >
                  {/* Đã chọn mấy phần, gắn thẳng lên nút. Không đặt xuống hàng giá:
                      hàng đó nằm trong dòng cao cố định và món tên dài sẽ bị đẩy
                      xuống dòng thứ hai rồi tràn ra ngoài. */}
                  {qtyOf(dish.id) > 0 ? (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-strong px-1 font-mono text-[length:var(--fs-c2)] font-semibold text-on-accent">
                      {qtyOf(dish.id)}
                    </span>
                  ) : null}
                  +
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* Giỏ dính phải trên desktop */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 mt-6 rounded-md border border-line-2 bg-surface-1 p-5">
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
            Giỏ của bạn
          </p>
          {draft.lines.length === 0 ? (
            <p className="mt-4 text-[length:var(--fs-b2)] text-ink-mute">
              Chưa có món nào. Bấm dấu cộng ở mỗi món là thêm được ngay.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {draft.lines.map((line) => (
                <div key={line.dishId} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Bớt ${line.name}`}
                    onClick={() => setQty(line.dishId, line.qty - 1)}
                    className="h-8 w-8 rounded-sm border border-line-3 text-ink-body"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-mono text-ink-hi">{line.qty}</span>
                  <span className="flex-1 text-[length:var(--fs-b2)] text-ink-body">
                    {line.name}
                  </span>
                  <span className="font-mono text-[length:var(--fs-b2)] text-accent-ink">
                    {formatVnd(line.price * line.qty)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-baseline justify-between border-t border-line-1 pt-4">
            <span className="text-[length:var(--fs-b2)] text-ink-mute">Tạm tính</span>
            <span className="font-mono text-[length:var(--fs-t2)] text-ink-hi">
              {formatVnd(sub)}
            </span>
          </div>
          <Link
            href={`/dat-mon/${menu.branch.id}/gio`}
            aria-disabled={count === 0}
            className={[
              'mt-4 flex h-13 items-center justify-center rounded-sm text-[length:var(--fs-b1)] font-semibold',
              count === 0
                ? 'pointer-events-none border border-line-4 text-ink-mute'
                : 'bg-accent-strong text-on-accent',
            ].join(' ')}
          >
            Tiếp tục
          </Link>
        </div>
      </aside>

      {/* Thanh ghim đáy trên mobile */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line-1 bg-surface-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[length:var(--fs-b1)] text-ink-hi">
              {count > 0 ? `${count} món` : 'Giỏ đang trống'}
            </p>
            <p className="font-mono text-[length:var(--fs-c1)] text-ink-mute">{formatVnd(sub)}</p>
          </div>
          <Link
            href={`/dat-mon/${menu.branch.id}/gio`}
            aria-disabled={count === 0}
            className={[
              'flex h-13 items-center rounded-sm px-6 text-[length:var(--fs-b1)] font-semibold',
              count === 0
                ? 'pointer-events-none border border-line-4 text-ink-mute'
                : 'bg-accent-strong text-on-accent',
            ].join(' ')}
          >
            Xem giỏ
          </Link>
        </div>
      </div>

      {open ? <DishSheet dish={open} onClose={() => setOpen(null)} /> : null}
    </main>
  )
}
