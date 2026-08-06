import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useRef, type ReactNode } from 'react'
import { api, type TableSession } from './api'

interface TableValue {
  session: TableSession | null
  /** Đã hỏi xong máy chủ — chưa xong thì đừng vội bảo khách quét lại mã */
  ready: boolean
  /** Đã từng vào bàn trong lượt mở app này, và bàn vừa đóng — để chào tạm biệt đúng lời */
  ended: boolean
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
    // Nhân viên đóng bàn sau khi dọn — khách phải thấy trong vòng vài giây, chứ
    // không phải ngồi trước một cái app đã chết cho tới lúc tự tay tải lại trang
    refetchInterval: 10_000,
  })

  const ready = !me.isPending && (sessionId === null || !session.isPending)

  /**
   * `isError` là mấu chốt.
   *
   * Bàn đóng thì token của máy hết hiệu lực và lời gọi này bị từ chối — nhưng
   * thư viện dữ liệu VẪN GIỮ kết quả thành công lần trước trong `data`. Chỉ nhìn
   * `data` thì app tưởng bàn còn sống và cứ thế chạy tiếp, mãi tới khi khách tự
   * tải lại trang. Đúng lỗi đã gặp ngoài đời.
   */
  const live =
    !session.isError && session.data && session.data.status !== 'closed' ? session.data : null

  /**
   * Đã từng ngồi bàn trong lượt mở app này chưa.
   *
   * Dùng để phân biệt hai chuyện rất khác nhau đối với khách: người vừa mở app
   * mà chưa quét mã, và người vừa ăn xong. Cùng một màn trắng cho cả hai là mời
   * người vừa trả tiền đi quét mã lại.
   */
  const daTungVaoBan = useRef(false)
  if (live) daTungVaoBan.current = true

  return (
    <Ctx.Provider
      value={{ session: live, ready, ended: ready && !live && daTungVaoBan.current }}
    >
      {children}
    </Ctx.Provider>
  )
}
