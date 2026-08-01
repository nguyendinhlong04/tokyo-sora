import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import { api, type TableSession } from './api'

interface TableValue {
  session: TableSession | null
  /** Đã hỏi xong máy chủ — chưa xong thì đừng vội bảo khách quét lại mã */
  ready: boolean
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

/**
 * Phiên bàn của điện thoại này.
 *
 * Danh tính nằm ở cookie httpOnly nên JavaScript không đọc được — phải hỏi máy
 * chủ "tôi là ai, đang ngồi bàn nào". Đổi lại, URL bị chụp màn hình hay dán vào
 * nhóm chat cũng không cho ai vào bàn của mình.
 */
export function TableProvider({ children }: { children: ReactNode }) {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    retry: false,
    staleTime: 60_000,
  })

  const sessionId = me.data?.kind === 'customer' ? (me.data.tableSessionId ?? null) : null

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.session(sessionId!),
    enabled: sessionId !== null,
    retry: false,
    // Bàn đóng giữa chừng (đã trả xong, nhân viên dọn bàn) thì phải biết sớm
    refetchInterval: 60_000,
  })

  const ready = !me.isPending && (sessionId === null || !session.isPending)
  const live = session.data && session.data.status !== 'closed' ? session.data : null

  return <Ctx.Provider value={{ session: live, ready }}>{children}</Ctx.Provider>
}
