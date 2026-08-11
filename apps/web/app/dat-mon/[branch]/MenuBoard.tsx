'use client'

import { formatVnd } from '@sora/contracts'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DishCounter } from '../../../components/DishCounter'
import { MenuIndex } from '../../../components/MenuIndex'
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
  const { draft, loaded, set, add, setQty, qtyOf, syncToBranch, count, sub } = useOrder()
  const [open, setOpen] = useState<OnlineDish | null>(null)
  const [dropped, setDropped] = useState<string[]>([])

  /**
   * Vào thẳng /dat-mon/{chi-nhánh} từ kết quả tìm kiếm thì chưa qua O1.
   *
   * `loaded` không phải cho đẹp: effect của con chạy TRƯỚC effect của cha, nên
   * không đợi thì câu này ghi chi nhánh xong `OrderProvider` mới đọc bản nháp cũ
   * ra và đè lại `branchId` về null. Vòng dựng sau `draft.branchId` vẫn là null
   * y như lúc đầu — deps không đổi, effect không chạy lại, và chi nhánh mất luôn.
   */
  useEffect(() => {
    if (!loaded) return
    if (draft.branchId !== menu.branch.id) set({ branchId: menu.branch.id })
  }, [loaded, draft.branchId, menu.branch.id, set])

  /**
   * Đối chiếu giỏ với thực đơn CHI NHÁNH này, một lần cho mỗi chi nhánh.
   *
   * Khách nhặt món bằng nút cộng ở W1/W2 lúc chưa chọn chi nhánh, nên tới đây mới
   * biết chi nhánh có bán món đó không. Đợi `loaded` là bắt buộc: `OrderProvider`
   * đọc `sessionStorage` trong effect, chạy sớm hơn là thấy giỏ rỗng, chốt "đã
   * đối chiếu" rồi giỏ thật về sau không ai soát nữa.
   */
  const checked = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || checked.current === menu.branch.id) return
    checked.current = menu.branch.id

    const byId = new Map(menu.dishes.map((d) => [d.id, d]))
    setDropped(
      draft.lines
        .filter((l) => {
          const dish = byId.get(l.dishId)
          return dish === undefined || dish.soldOut
        })
        .map((l) => l.name),
    )
    syncToBranch(menu.dishes)
  }, [loaded, menu.branch.id, menu.dishes, draft.lines, syncToBranch])

  // `useMemo` vì `MenuIndex` nhận thẳng mảng này vào deps của effect cuộn: dựng
  // mảng mới mỗi lần vẽ thì cứ thêm một phần vào giỏ là thanh mục lục tháo ra
  // lắp lại bộ nghe cuộn của nó.
  const groups = useMemo(
    () =>
      menu.categories
        .map((c) => ({ ...c, dishes: menu.dishes.filter((d) => d.categoryId === c.id) }))
        .filter((c) => c.dishes.length > 0),
    [menu.categories, menu.dishes],
  )

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

        {/* Món nhặt từ trang thương hiệu mà chi nhánh này không bán — nói tên ra
            và nói đã bỏ, chứ không lẳng lặng rút khỏi giỏ rồi để khách tự phát
            hiện thiếu món lúc nhận hàng. */}
        {dropped.length > 0 ? (
          <div className="mt-4 rounded-md border border-danger bg-danger/8 p-4">
            <p className="text-[length:var(--fs-b1)] leading-relaxed text-ink-hi">
              {menu.branch.name} không có {dropped.join(' · ')} — đã bỏ khỏi giỏ của bạn.
            </p>
            <button
              type="button"
              onClick={() => setDropped([])}
              className="mt-3 h-11 rounded-sm border border-line-3 px-4 text-[length:var(--fs-b2)] text-ink-body"
            >
              Đã hiểu
            </button>
          </div>
        ) : null}

        {/* Cùng một thanh mục lục với W2, không còn dải chip cuộn ngang: mười
            danh mục mà chỉ hở ba, bảy cái còn lại nằm sau một cử chỉ không có
            dấu hiệu nào báo là có. Ghim ở 56 — đúng chiều cao thanh đầu trang
            của luồng đặt món, xem `OrderLayout`. Dòng bám lề cột chữ (`px-4`) và
            trổ ra hai mép (`-mx-4`) như dải chip cũ. */}
        <MenuIndex chapters={groups} navClass="top-14 -mx-4 mt-4" rowClass="px-4" />

        {groups.map((group) => (
          /* 144 = thanh trên 56 + thanh mục lục lúc dày nhất 84 (hai dòng tên) +
             4 thở. Một con số cho mọi khổ: màn rộng thì mười tên gom một dòng và
             thanh chỉ còn 44, dư ra 40 — chia mức thì mỗi lần dòng tên đổi số
             dòng là phải dò lại từng ngưỡng.
             Con số này còn là mốc "đang đọc" của chính thanh mục lục: nó đọc
             `scroll-margin-top` của chương đầu ra dùng, nên sửa ở đây là hai bên
             đổi cùng lúc. */
          <section key={group.id} id={`chuong-${group.id}`} className="scroll-mt-36">
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
                  {/* Có ảnh thì hiện ảnh, chưa có thì ô chữ kanji như cũ — đường
                      dẫn khai ở Office M1 nên bổ sung ảnh cho một món là chỗ này
                      tự đổi, không phải sửa mã.
                      `<span>` chứ không phải `<div>` như `DishGlyph`: cả ô nằm
                      TRONG một `<button>`, mà button chỉ được chứa phrasing
                      content. */}
                  <span className="grid h-22 w-22 flex-none place-items-center overflow-hidden rounded-md border border-line-1 bg-[radial-gradient(120%_100%_at_50%_20%,var(--sora-line-1)_0%,var(--sora-surface-4)_74%)]">
                    {dish.imageUrl ? (
                      <img
                        src={dish.imageUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="font-jp text-[40px] leading-none text-gold-900">
                        {dish.kana ?? '空'}
                      </span>
                    )}
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
                {/* Đúng cái nút của W1 · W2 · W3: số phần nằm TRONG thanh đếm
                    chứ không còn là nhãn dán chồng lên góc nút vuông. */}
                <DishCounter
                  name={dish.nameVi}
                  qty={qtyOf(dish.id)}
                  onAdd={() => add(dish)}
                  onBot={() => setQty(dish.id, qtyOf(dish.id) - 1)}
                  disabled={dish.soldOut}
                />
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* Giỏ dính phải trên desktop */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 mt-6 rounded-md border border-line-2 bg-surface-1 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
              Giỏ của bạn
            </p>
            {/* Đổi ý cả giỏ thì bớt từng món là mười lần bấm. Nút chỉ mọc ra khi
                đã có món, và nằm ở hàng tiêu đề — xa nút "Tiếp tục" bên dưới. */}
            {draft.lines.length > 0 ? (
              <button
                type="button"
                onClick={() => set({ lines: [] })}
                className="text-[length:var(--fs-c1)] text-ink-mute underline underline-offset-4 hover:text-danger"
              >
                Xoá tất cả
              </button>
            ) : null}
          </div>
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
          <div className="flex flex-none items-center gap-2">
            {count > 0 ? (
              <button
                type="button"
                onClick={() => set({ lines: [] })}
                className="h-13 flex-none rounded-sm border border-line-3 px-3 text-[length:var(--fs-b2)] text-ink-body"
              >
                Xoá tất cả
              </button>
            ) : null}
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
      </div>

      {open ? <DishSheet dish={open} onClose={() => setOpen(null)} /> : null}
    </main>
  )
}
