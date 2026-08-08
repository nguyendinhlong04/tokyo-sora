'use client'

import { formatVnd } from '@sora/contracts'
import Link from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { readDraftLines, writeDraftLines, type DraftLine } from '../lib/order-draft'

/**
 * Nút cộng trên trang thương hiệu — bỏ món vào giỏ mà không rời trang.
 *
 * W1 và W2 là server component và KHÔNG nằm trong `<OrderProvider>` của luồng
 * đặt món: §23.1.6 cấm kéo context của luồng đó vào bundle trang marketing. Chỗ
 * này giữ một kho nhỏ của riêng nó và ghi thẳng xuống cùng một `sessionStorage`
 * mà `OrderProvider` sẽ đọc khi khách bước sang `/dat-mon`.
 *
 * Ở đây CHƯA biết chi nhánh nào, mà giá lẫn tình trạng còn/hết đều là chuyện của
 * từng chi nhánh — thực đơn thương hiệu chỉ có giá tại quán của cấp chuỗi. Nên
 * đây thuần là chỗ nhặt món: khách chọn chi nhánh ở O1, rồi O2 đối chiếu lại giỏ
 * với thực đơn chi nhánh đó (`syncToBranch`) trước khi ai kịp trả tiền.
 */

export interface QuickDish {
  id: string
  nameVi: string
  price: number
}

interface QuickValue {
  qtyOf: (dishId: string) => number
  add: (dish: QuickDish) => void
}

const Ctx = createContext<QuickValue | null>(null)

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<DraftLine[]>([])
  const [loaded, setLoaded] = useState(false)

  // Đọc SAU khi dựng xong chứ không lúc khởi tạo state: máy chủ không có
  // `sessionStorage` nên dựng ra giỏ rỗng, đọc sớm là hai bên lệch cây hydrate.
  useEffect(() => {
    setLines(readDraftLines())
    setLoaded(true)
  }, [])

  useEffect(() => {
    // Chưa đọc xong thì chưa được ghi: mảng rỗng ban đầu mà ghi ra trước là xoá
    // sạch giỏ khách đã nhặt ở trang trước.
    if (!loaded) return
    writeDraftLines(lines)
  }, [lines, loaded])

  const add = useCallback((dish: QuickDish) => {
    setLines((current) => {
      // Gộp vào dòng không lời dặn: bấm cộng năm lần là một dòng năm phần, chứ
      // không phải năm dòng một phần nằm chồng nhau trong giỏ.
      const at = current.findIndex((l) => l.dishId === dish.id && l.note === '')
      return at >= 0
        ? current.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l))
        : [...current, { dishId: dish.id, name: dish.nameVi, price: dish.price, qty: 1, note: '' }]
    })
  }, [])

  const value = useMemo<QuickValue>(
    () => ({
      qtyOf: (dishId) => lines.reduce((sum, l) => (l.dishId === dishId ? sum + l.qty : sum), 0),
      add,
    }),
    [lines, add],
  )

  const count = lines.reduce((sum, l) => sum + l.qty, 0)
  const sub = lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Thanh ghim đáy chỉ hiện khi giỏ có món: trang marketing không phải lúc
          nào cũng là trang gọi món, che mất một dải chân trang cho người chỉ
          đang đọc là mất chỗ vô ích. */}
      {count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-accent/28 bg-surface-4/97 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:px-10">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                {count} phần đã chọn
              </p>
              {/* Nói thẳng giá còn đổi, ngay chỗ khách nhìn thấy con số: thực đơn
                  thương hiệu in giá tại quán, còn đơn online tính theo giá của
                  chi nhánh. Giấu chuyện này tới bước thanh toán là bội tín. */}
              <p className="truncate font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {formatVnd(sub)} · tính lại theo chi nhánh bạn chọn
              </p>
            </div>
            <Link
              href="/dat-mon"
              className="flex h-12 flex-none items-center rounded-sm bg-accent-strong px-6 text-[length:var(--fs-b1)] font-semibold text-on-accent"
            >
              Xem giỏ
            </Link>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  )
}

/**
 * Ô món nào cũng là một thẻ liên kết sang trang chi tiết, nên nút này KHÔNG được
 * nằm trong thẻ đó — nút trong liên kết là HTML sai và bấm cộng sẽ nhảy trang.
 * Nơi gọi dựng nó thành anh em của liên kết rồi ghim bằng `absolute`.
 */
export function AddDishButton({ dish, className = '' }: { dish: QuickDish; className?: string }) {
  const quick = useContext(Ctx)
  if (!quick) return null

  const qty = quick.qtyOf(dish.id)
  return (
    <button
      type="button"
      aria-label={`Thêm ${dish.nameVi} vào giỏ`}
      onClick={() => quick.add(dish)}
      className={`z-10 grid h-11 w-11 flex-none place-items-center rounded-sm border border-accent bg-canvas/85 text-[length:var(--fs-t1)] leading-none text-accent-ink transition-colors hover:bg-accent hover:text-on-accent ${className}`}
    >
      {qty > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-strong px-1 font-mono text-[length:var(--fs-c2)] font-semibold text-on-accent">
          {qty}
        </span>
      ) : null}
      +
    </button>
  )
}
