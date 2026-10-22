import { checkPermission, needsApproval, type ActionKey, type Role } from '@sora/contracts'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from './api'

interface OfficeSession {
  /** Để lọc "của tôi" và loại chính mình khỏi danh sách người duyệt/người ký */
  staffId: number
  fullName: string
  roles: Role[]
}

interface SessionValue {
  branchId: string | null
  staff: OfficeSession | null
  ready: boolean
  can: (action: ActionKey) => boolean
  mustApprove: (action: ActionKey) => boolean
  signIn: (branchId: string, staff: OfficeSession) => void
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

export function useSession() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession phải nằm trong <SessionProvider>')
  return value
}

/**
 * Phiên Sora Office.
 *
 * Token là cookie httpOnly nên JavaScript không đọc được — muốn biết ai đang
 * đăng nhập thì hỏi máy chủ. Chi nhánh đang xem cũng lấy từ phiên chứ không giữ
 * ở localStorage: đổi chi nhánh nghĩa là đăng nhập lại đúng phạm vi, không phải
 * đổi một biến trên máy trạm.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [branchId, setBranchId] = useState<string | null>(null)
  const [staff, setStaff] = useState<OfficeSession | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((me) => {
        if (cancelled) return
        setBranchId(me.branchId)
        if (me.kind === 'staff' && me.fullName && me.staffId) {
          setStaff({
            staffId: me.staffId,
            fullName: me.fullName,
            roles: (me.roles ?? []) as Role[],
          })
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback((branch: string, next: OfficeSession) => {
    setBranchId(branch)
    setStaff(next)
  }, [])

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setStaff(null)
  }, [])

  /**
   * Quyền tính ở máy trạm chỉ để làm mờ nút và ẩn màn không dùng được — guard ở
   * máy chủ mới là thứ cưỡng chế.
   *
   * `can` trả true cho CẢ ✓ lẫn △: người ở ô △ vẫn phải thấy nút, chỉ là bấm thì
   * cần PIN người duyệt. Muốn biết có phải hỏi PIN không thì dùng `mustApprove`
   * — viết `!can(...)` để suy ra △ là sai, vì nó luôn ra false với chính người
   * cần duyệt.
   */
  const can = useCallback(
    (action: ActionKey) => checkPermission(action, staff?.roles ?? []) !== 'deny',
    [staff],
  )

  const mustApprove = useCallback(
    (action: ActionKey) => needsApproval(action, staff?.roles ?? []),
    [staff],
  )

  const value = useMemo(
    () => ({ branchId, staff, ready, can, mustApprove, signIn, signOut }),
    [branchId, staff, ready, can, mustApprove, signIn, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
