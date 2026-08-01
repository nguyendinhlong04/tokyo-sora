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
  price: number
  qty: number
  note: string
}

interface CartValue {
  items: CartItem[]
  count: number
  total: number
  add: (item: Omit<CartItem, 'qty'> & { qty?: number }) => void
  setQty: (index: number, qty: number) => void
  remove: (index: number) => void
  clear: () => void
  /** Món vừa bị bếp báo hết thì bỏ khỏi giỏ và nói cho khách biết (T16) */
  dropSoldOut: (soldOutIds: Set<string>) => string[]
  toLines: () => NewLine[]
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

  const value = useMemo<CartValue>(
    () => ({
      items,
      count: items.reduce((sum, l) => sum + l.qty, 0),
      total: items.reduce((sum, l) => sum + l.price * l.qty, 0),

      add: (item) =>
        update((current) => {
          const qty = item.qty ?? 1
          const at = current.findIndex((l) => l.dishId === item.dishId && l.note === item.note)
          if (at >= 0) {
            return current.map((l, i) => (i === at ? { ...l, qty: l.qty + qty } : l))
          }
          return [...current, { ...item, qty }]
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

      toLines: () =>
        items.map((l) => ({ dishId: l.dishId, qty: l.qty, note: l.note.trim() || null })),
    }),
    [items, update],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
