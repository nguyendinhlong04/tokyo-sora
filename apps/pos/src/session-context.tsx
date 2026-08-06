import { getDeviceInfo, setDeviceInfo, setDeviceToken } from '@sora/core'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'

interface StaffSession {
  id: number
  fullName: string
  roles: string[]
}

interface SessionValue {
  branchId: string | null
  staff: StaffSession | null
  ready: boolean
  signIn: (staff: StaffSession) => void
  signOut: () => Promise<void>
  pairDevice: (token: string, deviceId: number) => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

export function useSession() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession phải nằm trong <SessionProvider>')
  return value
}

/**
 * Phiên của máy POS.
 *
 * Token phiên nhân viên là cookie httpOnly nên JavaScript không đọc được — muốn
 * biết ai đang đăng nhập thì phải hỏi server qua /api/auth/me. Đổi lại, XSS không
 * lấy được phiên.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [branchId, setBranchId] = useState<string | null>(() => getDeviceInfo()?.branchId ?? null)
  const [staff, setStaff] = useState<StaffSession | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((me) => {
        if (cancelled) return
        setBranchId(me.branchId)
        if (me.kind === 'staff' && me.fullName) {
          setStaff({ id: 0, fullName: me.fullName, roles: me.roles ?? [] })
        }
      })
      .catch(() => {
        // Chưa ghép máy hoặc chưa đăng nhập — màn đăng nhập sẽ lo
      })
      .finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback((next: StaffSession) => setStaff(next), [])

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setStaff(null)
  }, [])

  /**
   * Ghi token vừa ghép rồi HỎI LẠI máy chủ xem mình là máy gì.
   *
   * Đường ghép chỉ trả về token và mã máy — chi nhánh, loại máy và trạm đều do
   * mã ghép quyết định, nên máy khách không tự biết. Đoán bừa ở đây là màn bếp
   * ghép nhầm thành máy thu ngân, hoặc POS gắn sai chi nhánh và hiện thực đơn
   * của quán khác.
   */
  const pairDevice = useCallback(async (token: string, deviceId: number) => {
    setDeviceToken(token)
    const me = await api.me()
    setDeviceInfo({
      deviceId,
      branchId: me.branchId,
      kind: me.deviceKind ?? 'cashier',
      stationId: me.stationId ?? null,
      name: 'POS',
    })
    setBranchId(me.branchId)
  }, [])

  const value = useMemo(
    () => ({ branchId, staff, ready, signIn, signOut, pairDevice }),
    [branchId, staff, ready, signIn, signOut, pairDevice],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
