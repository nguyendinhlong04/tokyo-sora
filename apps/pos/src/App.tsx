import { watchConnectivity } from '@sora/core'
import { Button, OutboxBanner, ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router'
import { Floorplan } from './routes/Floorplan'
import { Pay } from './routes/Pay'
import { ShiftLogin } from './routes/ShiftLogin'
import { TableOrder } from './routes/TableOrder'
import { SessionProvider, useSession } from './session-context'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // POS mở suốt ca, cửa sổ hay bị che rồi hiện lại — lấy lại dữ liệu khi quay
      // về là lưới an toàn rẻ tiền bên cạnh realtime.
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 5_000,
    },
  },
})

export function App() {
  useEffect(() => watchConnectivity(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <SessionProvider>
            <Routes>
              <Route path="/shift" element={<ShiftLogin />} />
              <Route element={<Shell />}>
                <Route path="/floor" element={<Floorplan />} />
                <Route path="/table/:sessionId" element={<TableOrder />} />
                <Route path="/table/:sessionId/pay" element={<Pay />} />
              </Route>
              <Route path="*" element={<Navigate to="/floor" replace />} />
            </Routes>
          </SessionProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

/** Khung chung: chưa đăng nhập ca thì mọi màn vận hành đều đẩy về P1 */
function Shell() {
  const { staff, ready, signOut } = useSession()
  const navigate = useNavigate()

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-ink-mute">
        Đang khôi phục phiên…
      </div>
    )
  }

  if (!staff) return <Navigate to="/shift" replace />

  return (
    <div className="min-h-dvh bg-canvas text-ink-body">
      <header className="flex h-14 items-center justify-between border-b border-line-1 px-4">
        <div className="flex items-center gap-3">
          <span className="font-jp text-accent-ink">空</span>
          <span className="text-[length:var(--fs-b2)] text-ink-hi">{staff.fullName}</span>
        </div>
        <div className="flex items-center gap-3">
          <OutboxBanner />
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut()
              void navigate('/shift')
            }}
          >
            Đóng ca
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
