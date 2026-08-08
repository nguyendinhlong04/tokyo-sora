'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { OnlineDish } from '../../lib/api'
import { ORDER_STORAGE_KEY, type DraftLine, type ReceiveMode } from '../../lib/order-draft'

export type { ReceiveMode }

/** Hình dạng dòng giỏ ở `lib/order-draft` — trang thương hiệu cũng ghi vào đó */
export type CartLine = DraftLine

export interface OrderDraft {
  branchId: string | null
  mode: ReceiveMode
  address: string
  ward: string
  lines: CartLine[]
  /** ISO khung giờ khách chọn; rỗng = nhận sớm nhất */
  slotAt: string | null
  customer: { name: string; phone: string; note: string }
  payment: 'vietqr' | 'cod'
}

const EMPTY: OrderDraft = {
  branchId: null,
  mode: 'takeaway',
  address: '',
  ward: '',
  lines: [],
  slotAt: null,
  customer: { name: '', phone: '', note: '' },
  payment: 'vietqr',
}

interface OrderValue {
  draft: OrderDraft
  /** Đã đọc xong bản nháp trong `sessionStorage` chưa — O2 phải đợi mới đối chiếu được */
  loaded: boolean
  count: number
  sub: number
  set: (patch: Partial<OrderDraft>) => void
  /** Đã có mấy phần món này trong giỏ — để thực đơn nói rõ thay vì chỉ có nút + */
  qtyOf: (dishId: string) => number
  add: (dish: OnlineDish, qty?: number, note?: string) => void
  setQty: (dishId: string, qty: number) => void
  /** Bỏ món chi nhánh không bán và lấy lại giá của chi nhánh — xem chú ở chỗ dựng */
  syncToBranch: (dishes: OnlineDish[]) => void
  clear: () => void
}

const Ctx = createContext<OrderValue | null>(null)

export function useOrder() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useOrder phải nằm trong <OrderProvider>')
  return value
}

/**
 * Giỏ và các lựa chọn của luồng đặt món, sống qua bốn màn O1 → O6.
 *
 * `sessionStorage` chứ không `localStorage`: khách quay lại sau ba ngày thì giá
 * và món đã khác, còn lỡ tay tải lại trang giữa chừng thì không mất giỏ. Máy chủ
 * vẫn tính lại toàn bộ tiền lúc đặt nên cái này thuần là tiện lợi.
 */
export function OrderProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OrderDraft>(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ORDER_STORAGE_KEY)
      if (raw) setDraft({ ...EMPTY, ...(JSON.parse(raw) as OrderDraft) })
    } catch {
      // Trình duyệt chặn lưu trữ — luồng vẫn chạy, chỉ không sống qua lần tải lại
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    // Chưa đọc xong thì chưa được ghi: bản rỗng ban đầu mà ghi ra trước là xoá
    // mất lựa chọn trang chủ vừa gửi sang qua `seedOrderDraft`.
    if (!loaded) return
    try {
      sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // như trên
    }
  }, [draft, loaded])

  const set = useCallback(
    (patch: Partial<OrderDraft>) => setDraft((current) => ({ ...current, ...patch })),
    [],
  )

  const value = useMemo<OrderValue>(
    () => ({
      draft,
      loaded,
      count: draft.lines.reduce((sum, l) => sum + l.qty, 0),
      sub: draft.lines.reduce((sum, l) => sum + l.price * l.qty, 0),
      // Gộp mọi dòng của cùng một món: khách dặn khác nhau thì thành hai dòng,
      // nhưng đứng ở thực đơn họ chỉ cần biết tổng đã chọn mấy phần.
      qtyOf: (dishId) =>
        draft.lines.reduce((sum, l) => (l.dishId === dishId ? sum + l.qty : sum), 0),
      set,
      add: (dish, qty = 1, note = '') =>
        setDraft((current) => {
          const at = current.lines.findIndex((l) => l.dishId === dish.id && l.note === note)
          const lines =
            at >= 0
              ? current.lines.map((l, i) => (i === at ? { ...l, qty: l.qty + qty } : l))
              : [...current.lines, { dishId: dish.id, name: dish.nameVi, price: dish.price, qty, note }]
          return { ...current, lines }
        }),
      setQty: (dishId, qty) =>
        setDraft((current) => ({
          ...current,
          lines: current.lines
            .map((l) => (l.dishId === dishId ? { ...l, qty } : l))
            .filter((l) => l.qty > 0),
        })),
      /**
       * Giỏ nhặt ở trang thương hiệu là giỏ CHƯA có chi nhánh: giá lấy từ thực
       * đơn cấp chuỗi, và món nào chi nhánh này không bán thì ở đó không biết.
       * Tới O2 mới biết sự thật, nên đối chiếu ngay tại đây — bỏ món chi nhánh
       * không có hoặc đang hết, và lấy lại đúng giá online của chi nhánh.
       *
       * Máy chủ vẫn tính lại toàn bộ tiền lúc đặt, nhưng để khách nhìn một con số
       * suốt bốn màn rồi hoá đơn ra số khác thì mất lòng tin, dù tổng vẫn đúng.
       */
      syncToBranch: (dishes) =>
        setDraft((current) => {
          const byId = new Map(dishes.map((d) => [d.id, d]))
          return {
            ...current,
            lines: current.lines
              .filter((l) => {
                const dish = byId.get(l.dishId)
                return dish !== undefined && !dish.soldOut
              })
              .map((l) => ({ ...l, price: byId.get(l.dishId)!.price })),
          }
        }),
      clear: () => setDraft((current) => ({ ...EMPTY, branchId: current.branchId, mode: current.mode })),
    }),
    [draft, loaded, set],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
