import { checkPermission, type ActionKey, type Role } from '@sora/contracts'
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
  fullName: string
  roles: Role[]
}

interface SessionValue {
  branchId: string | null
  staff: OfficeSession | null
  ready: boolean
  can: (action: ActionKey) => boolean
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
        if (me.kind === 'staff' && me.fullName) {
          setStaff({ fullName: me.fullName, roles: (me.roles ?? []) as Role[] })
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
   */
  const can = useCallback(
    (action: ActionKey) => checkPermission(action, staff?.roles ?? []) !== 'deny',
    [staff],
  )

  const value = useMemo(
    () => ({ branchId, staff, ready, can, signIn, signOut }),
    [branchId, staff, ready, can, signIn, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
