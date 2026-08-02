import { ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router'
import { Branches } from './routes/Branches'
import { Dishes } from './routes/Dishes'
import { Floorplan } from './routes/Floorplan'
import { Login } from './routes/Login'
import { Parameters } from './routes/Parameters'
import { ReservationConfig } from './routes/ReservationConfig'
import { SessionProvider, useSession } from './session-context'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: true } },
})

/**
 * Điều hướng của Office — nhóm theo đúng cột trái của bản thiết kế.
 *
 * Chỉ liệt kê những màn ĐÃ dựng. Bốn nhóm còn lại (Món & kho, Kinh doanh, Nhân
 * sự, Tài chính) thêm vào khi có màn thật: một mục bấm vào không ra gì tệ hơn
 * một mục chưa có.
 */
const NAV = [
  {
    group: 'Món & kho',
    items: [{ to: '/mon', label: 'M1 · Món và set' }],
  },
  {
    group: 'Quản trị',
    items: [
      { to: '/tham-so', label: 'A6 · Trung tâm tham số' },
      { to: '/so-do-ban', label: 'A3 · Khu vực & bàn' },
      { to: '/chi-nhanh', label: 'A10 · Chi nhánh' },
    ],
  },
  {
    group: 'Kênh online & đặt bàn',
    items: [{ to: '/nhan-dat', label: 'R3 · Cấu hình nhận đặt' }],
  },
]

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <SessionProvider>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/mon" element={<Dishes />} />
                <Route path="/tham-so" element={<Parameters />} />
                <Route path="/so-do-ban" element={<Floorplan />} />
                <Route path="/chi-nhanh" element={<Branches />} />
                <Route path="/nhan-dat" element={<ReservationConfig />} />
              </Route>
              <Route path="*" element={<Navigate to="/mon" replace />} />
            </Routes>
          </SessionProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

function Shell() {
  const { staff, ready, branchId, signOut } = useSession()

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-ink-mute">
        Đang khôi phục phiên…
      </div>
    )
  }
  if (!staff) return <Login />

  return (
    <div className="flex min-h-dvh bg-canvas font-sans text-ink-body">
      <aside className="flex w-60 flex-none flex-col border-r border-line-1">
        <div className="flex-none border-b border-line-1 px-5 py-4">
          <div className="flex items-baseline gap-2">
            <span className="font-jp text-[length:var(--fs-b2)] text-accent">東京空</span>
            <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.16em] text-ink-hi">
              TOKYO SORA
            </span>
          </div>
        </div>

        <div className="flex-none border-b border-line-1 px-5 py-3.5">
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Chi nhánh đang xem
          </p>
          <p className="mt-1.5 text-[length:var(--fs-b2)] text-ink-hi">{branchId}</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((group) => (
            <div key={group.group} className="mb-4">
              <p className="px-5 pb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.14em] text-ink-mute uppercase">
                {group.group}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex h-10 items-center px-5 text-[length:var(--fs-b2)] ${
                      isActive
                        ? 'bg-surface-3 font-medium text-ink-hi shadow-[inset_3px_0_0_var(--color-accent)]'
                        : 'text-ink-mute hover:text-ink-hi'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex-none border-t border-line-1 px-5 py-4">
          <p className="text-[length:var(--fs-b2)] text-ink-hi">{staff.fullName}</p>
          <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">{staff.roles.join(' · ')}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 text-[length:var(--fs-c1)] text-accent-ink"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
