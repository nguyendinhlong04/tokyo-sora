import { watchConnectivity } from '@sora/core'
import { Button, OutboxBanner, ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router'
import { api } from './api'
import { usePwaUpdate } from './pwa'
import { Dispatch } from './routes/Dispatch'
import { DispatchRail } from './routes/DispatchRail'
import { ExternalChannels } from './routes/ExternalChannels'
import { Floorplan } from './routes/Floorplan'
import { LateReservations } from './routes/LateReservations'
import { Pay } from './routes/Pay'
import { Reconcile } from './routes/Reconcile'
import { Reservations } from './routes/Reservations'
import { ShiftClose } from './routes/ShiftClose'
import { PairDevice } from './routes/PairDevice'
import { ShiftLogin } from './routes/ShiftLogin'
import { TableMove } from './routes/TableMove'
import { TableOrder } from './routes/TableOrder'
import { TableRequests } from './routes/TableRequests'
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
              <Route path="/ghep-may" element={<PairDevice />} />
              <Route path="/shift" element={<ShiftLogin />} />
              <Route element={<Shell />}>
                <Route path="/floor" element={<Floorplan />} />
                <Route path="/yeu-cau" element={<TableRequests />} />
                <Route path="/dieu-phoi" element={<Dispatch />} />
                <Route path="/kenh-ngoai" element={<ExternalChannels />} />
                <Route path="/dat-cho" element={<Reservations />} />
                <Route path="/qua-gio" element={<LateReservations />} />
                <Route path="/doi-soat" element={<Reconcile />} />
                <Route path="/dong-ca" element={<ShiftClose />} />
                <Route path="/table/:sessionId" element={<TableOrder />} />
                <Route path="/table/:sessionId/chuyen" element={<TableMove />} />
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

/** Máy nào đang bật trạm thu ngân thì lần mở sau vẫn là trạm thu ngân */
const STATION_KEY = 'sora.pos.station'

/** Khung chung: chưa đăng nhập ca thì mọi màn vận hành đều đẩy về P1 */
function Shell() {
  const { staff, ready, branchId, signOut } = useSession()
  const { needRefresh, applyUpdate } = usePwaUpdate()
  const navigate = useNavigate()

  /**
   * P16 trạm thu ngân — dải điều phối bật/tắt cho cả máy chứ không phải một màn
   * riêng. Vận hành thường trực là "vừa tính tiền vừa liếc dải bên phải" (§21
   * P16), nên dải phải sống qua mọi lần chuyển màn; một route riêng thì mỗi lần
   * mở bàn là dải biến mất, đúng lúc đơn online kêu.
   *
   * Chỉ máy 22" trở lên mới đủ chỗ cho hai vùng — máy nhỏ bật lên sẽ bóp vùng
   * việc chính, mà quy tắc là dải KHÔNG BAO GIỜ che chỗ tính tiền.
   */
  const [station, setStation] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(STATION_KEY) === 'on',
  )
  const toggleStation = () => {
    setStation((on) => {
      localStorage.setItem(STATION_KEY, on ? 'off' : 'on')
      return !on
    })
  }

  // Chuông yêu cầu từ bàn: khách bấm gọi trên điện thoại thì phải thấy được ở
  // MỌI màn của POS, không phải chỉ khi ai đó nhớ mở P12.
  const requests = useQuery({
    queryKey: ['table-requests', branchId],
    queryFn: () => api.tableRequests(branchId!),
    enabled: Boolean(branchId) && Boolean(staff),
    refetchInterval: 15_000,
  })

  const dispatch = useQuery({
    queryKey: ['dispatch', branchId],
    queryFn: () => api.dispatchBoard(branchId!),
    enabled: Boolean(branchId) && Boolean(staff),
    refetchInterval: 15_000,
  })

  // Badge P13: đặt bàn hôm nay chưa ngồi. Khách đặt trên web xong là nhà hàng
  // phải biết ngay, không đợi ai nhớ mở màn đặt bàn (§30.3).
  const reservations = useQuery({
    queryKey: ['reservations', branchId, 'today-badge'],
    queryFn: () => api.reservationBoard(branchId!),
    enabled: Boolean(branchId) && Boolean(staff),
    refetchInterval: 30_000,
  })

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-ink-mute">
        Đang khôi phục phiên…
      </div>
    )
  }

  if (!staff) return <Navigate to="/shift" replace />

  const pendingRequests = requests.data?.requests.length ?? 0
  // Đơn online đang chạy — con số để thu ngân biết có việc mà không phải mở màn
  const liveOnline = dispatch.data?.orders.length ?? 0
  const bookingsToday = (reservations.data?.reservations ?? []).filter(
    (r) => r.status === 'pending' || r.status === 'confirmed',
  ).length

  return (
    <div className="min-h-dvh bg-canvas text-ink-body">
      <header className="flex h-14 items-center justify-between border-b border-line-1 px-4">
        <div className="flex items-center gap-3">
          <span className="font-jp text-accent-ink">空</span>
          <span className="text-[length:var(--fs-b2)] text-ink-hi">{staff.fullName}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => void navigate('/dieu-phoi')}>
            Đơn online{liveOnline > 0 ? ` · ${liveOnline}` : ''}
          </Button>
          <Button variant="ghost" onClick={() => void navigate('/dat-cho')}>
            Đặt bàn{bookingsToday > 0 ? ` · ${bookingsToday}` : ''}
          </Button>
          <Button
            variant={pendingRequests > 0 ? 'primary' : 'ghost'}
            onClick={() => void navigate('/yeu-cau')}
          >
            Yêu cầu từ bàn{pendingRequests > 0 ? ` · ${pendingRequests}` : ''}
          </Button>
          <Button variant={station ? 'primary' : 'ghost'} onClick={toggleStation}>
            Trạm thu ngân
          </Button>
          {needRefresh ? (
            <button
              type="button"
              onClick={applyUpdate}
              className="rounded-sm border border-accent px-3 py-1.5 text-[length:var(--fs-b2)] text-accent-ink"
            >
              Có bản mới — bấm để cập nhật
            </button>
          ) : null}
          <OutboxBanner />
          {/* Đóng ca là ĐẾM KÉT rồi mới đăng xuất — không phải chỉ rời máy */}
          <Button variant="ghost" onClick={() => void navigate('/dong-ca')}>
            Đóng ca
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut()
              void navigate('/shift')
            }}
          >
            Đăng xuất
          </Button>
        </div>
      </header>

      {station ? (
        <div className="flex h-[calc(100dvh-56px)] min-h-0">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
          <DispatchRail />
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  )
}
