import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { NewLine } from './api'

export interface CartItem {
  dishId: string
  name: string
  /** Giá một phần ĐÃ cộng chênh giá tuỳ chọn — máy chủ tính lại y hệt khi gửi */
  price: number
  qty: number
  note: string
  options: { id: string; name: string; priceDelta: number }[]
}

interface CartValue {
  items: CartItem[]
  count: number
  total: number
  add: (item: Omit<CartItem, 'qty'> & { qty?: number }) => void
  /**
   * Tổng số phần của MỘT món trong giỏ, gộp mọi dòng của nó.
   *
   * Một món nằm ở nhiều dòng khi khách dặn khác nhau (một chấm muối, một chấm
   * miso). Đứng ở màn thực đơn thì khách chỉ cần biết đã chọn tất cả mấy phần.
   */
  qtyOf: (dishId: string) => number
  /**
   * Bớt một phần của MỘT món ngay tại thực đơn, nơi không có dòng giỏ nào để chỉ.
   *
   * Bớt ở dòng THÊM SAU CÙNG của món đó. Một món nằm nhiều dòng khi khách dặn
   * khác nhau, mà nút trừ ở thực đơn thì không hỏi được "bỏ phần chấm muối hay
   * chấm miso" — hoàn tác đúng thao tác vừa làm là câu trả lời khách đoán được.
   * Muốn bỏ đích danh một dòng thì vào giỏ, ở đó mỗi dòng có nút riêng.
   */
  botOf: (dishId: string) => void
  setQty: (index: number, qty: number) => void
  remove: (index: number) => void
  clear: () => void
  /** Món vừa bị bếp báo hết thì bỏ khỏi giỏ và nói cho khách biết (T16) */
  dropSoldOut: (soldOutIds: Set<string>) => string[]
  toLines: (sharedNote?: string) => NewLine[]
}

function sameOptions(a: CartItem['options'], b: CartItem['options']): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a.map((o) => o.id))
  return b.every((o) => ids.has(o.id))
}

const Ctx = createContext<CartValue | null>(null)

export function useCart() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useCart phải nằm trong <CartProvider>')
  return value
}

const STORAGE_KEY = 'sora.table.cart'

function load(): CartItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

/**
 * Giỏ hàng dựng ở MÁY KHÁCH, chỉ gửi khi bấm "Gửi bếp".
 *
 * Khách bấm thêm/bớt liên tục và hay đổi ý; gọi API mỗi lần chạm vừa chậm vừa
 * để lại rác trên đơn của bàn. Giữ ở `sessionStorage` để lỡ tay tải lại trang
 * giữa lúc chọn món thì giỏ vẫn còn, nhưng không sống dai hơn tab trình duyệt —
 * người sau ngồi vào bàn không thừa hưởng giỏ của người trước.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Trình duyệt chặn lưu trữ (chế độ riêng tư): giỏ vẫn chạy trong bộ nhớ
    }
  }, [items])

  /**
   * Mọi thay đổi đi qua hàm cập nhật nhận trạng thái HIỆN TẠI.
   *
   * Khách bấm + hai lần thật nhanh là hai lần bấm rơi vào cùng một lượt render;
   * đọc `items` của lần render đó thì lần bấm sau ghi đè lần trước và một món
   * biến mất khỏi giỏ.
   */
  const update = useCallback(
    (fn: (current: CartItem[]) => CartItem[]) => setItems((current) => fn(current)),
    [],
  )

  // Gộp sẵn theo món: màn thực đơn tra con số này cho từng dòng trong danh sách
  // dài (78 món), nên không để nó quét lại cả giỏ ở mỗi dòng.
  const qtyByDish = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of items) map.set(line.dishId, (map.get(line.dishId) ?? 0) + line.qty)
    return map
  }, [items])

  const value = useMemo<CartValue>(
    () => ({
      items,
      count: items.reduce((sum, l) => sum + l.qty, 0),
      total: items.reduce((sum, l) => sum + l.price * l.qty, 0),

      qtyOf: (dishId) => qtyByDish.get(dishId) ?? 0,

      add: (item) =>
        update((current) => {
          const qty = item.qty ?? 1
          // Gộp dòng chỉ khi TRÙNG CẢ ghi chú lẫn tuỳ chọn: hai phần thăn bò một
          // chấm muối một chấm miso là hai dòng khác nhau, bếp làm khác nhau.
          const at = current.findIndex(
            (l) =>
              l.dishId === item.dishId && l.note === item.note && sameOptions(l.options, item.options),
          )
          if (at >= 0) {
            return current.map((l, i) => (i === at ? { ...l, qty: l.qty + qty } : l))
          }
          return [...current, { ...item, qty }]
        }),

      botOf: (dishId) =>
        update((current) => {
          const at = current.findLastIndex((l) => l.dishId === dishId)
          if (at < 0) return current
          return current
            .map((l, i) => (i === at ? { ...l, qty: l.qty - 1 } : l))
            .filter((l) => l.qty > 0)
        }),

      setQty: (index, qty) =>
        update((current) =>
          current.map((l, i) => (i === index ? { ...l, qty } : l)).filter((l) => l.qty > 0),
        ),

      remove: (index) => update((current) => current.filter((_, i) => i !== index)),

      clear: () => update(() => []),

      dropSoldOut: (soldOutIds) => {
        const hit = items.filter((l) => soldOutIds.has(l.dishId))
        if (hit.length > 0) update((current) => current.filter((l) => !soldOutIds.has(l.dishId)))
        return hit.map((l) => l.name)
      },

      toLines: (sharedNote = '') =>
        items.map((l) => ({
          dishId: l.dishId,
          qty: l.qty,
          // Ghi chú chung của giỏ chỉ gắn vào món CHƯA có ghi chú riêng — món đã
          // dặn "cắt dày" không bị ghi đè bởi câu dặn chung.
          note: l.note.trim() || sharedNote.trim() || null,
          modifierOptionIds: l.options.map((o) => o.id),
        })),
    }),
    [items, qtyByDish, update],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
