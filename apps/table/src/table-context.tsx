import { ApiError } from '@sora/core'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { api, type TableSession, type TerminalState } from './api'
import { CART_KEY, CartProvider } from './cart-context'
import { PAYMENTS_KEY } from './my-payments'
import { RECENT_KEY } from './recent-searches'

interface TableValue {
  /** Bàn của iPad này; null khi chưa hỏi được máy chủ lần nào */
  terminal: TerminalState | null
  /** Phiên đang sống của bàn; null = bàn chưa mở */
  session: TableSession | null
  ready: boolean
  /** Chỉ khi CHƯA hỏi được lần nào — mất mạng giữa bữa thì giữ bản đang có */
  error: Error | null
  retry: () => void
}

const Ctx = createContext<TableValue | null>(null)

export function useTable() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useTable phải nằm trong <TableProvider>')
  return value
}

/** Dùng trong các màn chỉ render sau khi khung đã xác nhận có phiên bàn */
export function useTableSession(): TableSession {
  const { session } = useTable()
  if (!session) throw new Error('Màn này chỉ render khi đã có phiên bàn')
  return session
}

/** Dấu vết một lượt khách để lại trên iPad */
const GUEST_KEY = 'sora.table.guest'
const GUEST_DATA = [CART_KEY, PAYMENTS_KEY, RECENT_KEY]

/**
 * Đổi lượt khách thì xoá giỏ, lượt trả và từ khoá tìm của khách trước.
 *
 * So với mã phiên GHI trong máy chứ không chỉ so trong bộ nhớ: iPad tải lại trang
 * giữa bữa thì giữ nguyên giỏ, tải lại sau khi bàn đã đổi khách thì xoá. Gọi ngay
 * lúc dựng chứ không đợi effect, vì giỏ đọc kho lưu trữ đúng lúc nó dựng — đợi
 * effect là giỏ của khách trước đã kịp hiện ra. Gọi lặp lại vô hại.
 */
function enterGuest(sessionId: number | null) {
  const guest = sessionId === null ? '' : String(sessionId)
  try {
    if (sessionStorage.getItem(GUEST_KEY) === guest) return
    for (const key of GUEST_DATA) sessionStorage.removeItem(key)
    sessionStorage.setItem(GUEST_KEY, guest)
  } catch {
    // Trình duyệt chặn lưu trữ: không có gì nằm lại để xoá
  }
}

/** Nhịp hỏi lại bàn — thay bằng Realtime ở §9.5 bước 2 */
function pollMs(session: TableSession | null | undefined): number {
  // Đóng bàn thì iPad về màn đầu trong ≤ 3 giây (§9.1)
  if (session?.status === 'paid_wait_clear') return 2_000
  if (session) return 10_000
  // Bàn trống: nhân viên mở ở POS thì khách chạm "Bắt đầu" vẫn vào đúng phiên đó,
  // nên không cần hỏi dày — 40 iPad trống hỏi 5 giây một lần là 8 lượt mỗi giây
  return 15_000
}

/**
 * Bàn của iPad này (§9.1).
 *
 * iPad không giữ phiên nào: mỗi lần hỏi, máy chủ tra phiên đang sống của BÀN mà
 * iPad được ghim lúc ghép. Nhân viên mở bàn ở POS hay khách tự mở trên iPad, đóng
 * bàn hay chuyển bàn — iPad chỉ đi theo câu trả lời đó.
 */
export function TableProvider({
  onUnpaired,
  children,
}: {
  /** Máy không còn là iPad của bàn nào — phải ghép lại */
  onUnpaired: () => void
  children: ReactNode
}) {
  const navigate = useNavigate()
  const terminal = useQuery({
    queryKey: ['terminal'],
    queryFn: () => api.terminal(),
    // Máy chủ đã từ chối thì hỏi lại cũng vậy; mất mạng thì thử thêm một lần
    retry: (count, err) => !(err instanceof ApiError && err.isRejection) && count < 1,
    refetchInterval: (query) => pollMs(query.state.data?.session),
  })

  const failure = terminal.error
  useEffect(() => {
    // 401: máy bị ngắt ở A4. 403: token không còn là iPad của bàn nào — ngoài đời chỉ
    // gặp khi máy đã bị ngắt mà trình duyệt còn cookie nhân viên (máy dev: `localhost`
    // dùng chung cookie giữa các cổng). Nhập nhầm mã loại máy khác thì màn ghép bắt.
    if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) {
      onUnpaired()
    }
  }, [failure, onUnpaired])

  const data = terminal.data ?? null
  const session = data?.session ?? null
  const guest = data ? (session?.id ?? null) : undefined
  if (guest !== undefined) enterGuest(guest)

  // Khách trước vừa rời bàn: iPad về màn đầu dù đang đứng ở trang nào. Bàn trống
  // vừa có phiên thì không — khách tự mở bàn đang được đưa thẳng vào thực đơn.
  const previous = useRef(guest)
  useEffect(() => {
    if (typeof previous.current === 'number' && previous.current !== guest) {
      void navigate('/', { replace: true })
    }
    previous.current = guest
  }, [guest, navigate])

  return (
    <Ctx.Provider
      value={{
        terminal: data,
        session,
        ready: data !== null,
        error: data ? null : failure,
        retry: () => void terminal.refetch(),
      }}
    >
      {/* Đổi lượt khách là dựng lại giỏ và mọi màn bên dưới từ đầu */}
      <CartProvider key={String(guest)}>{children}</CartProvider>
    </Ctx.Provider>
  )
}
