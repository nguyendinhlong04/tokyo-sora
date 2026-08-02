import type { ActionKey } from '@sora/contracts'
import { ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router'
import { Branches } from './routes/Branches'
import { CashBook } from './routes/CashBook'
import { Assets, ExpenseOverview, RecurringExpenses } from './routes/CostCenter'
import { DeliveryZones } from './routes/DeliveryZones'
import { Dishes } from './routes/Dishes'
import { Employees } from './routes/Employees'
import { Expenses } from './routes/Expenses'
import { Floorplan } from './routes/Floorplan'
import { Ingredients } from './routes/Ingredients'
import { Login } from './routes/Login'
import { MenuMatrix } from './routes/MenuMatrix'
import { OnlineMenu } from './routes/OnlineMenu'
import { Parameters } from './routes/Parameters'
import { Payroll } from './routes/Payroll'
import { ProfitLoss } from './routes/ProfitLoss'
import { RecipeEditor, RecipeList } from './routes/Recipes'
import { ReservationConfig } from './routes/ReservationConfig'
import { Schedule } from './routes/Schedule'
import { StockLevels, StockOverview } from './routes/Stock'
import { Today } from './routes/Today'
import { SessionProvider, useSession } from './session-context'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: true } },
})

/**
 * Điều hướng của Office — nhóm theo đúng cột trái của bản thiết kế.
 *
 * Chỉ liệt kê những màn ĐÃ dựng. Các nhóm còn lại (Kho, Nhân sự) thêm vào khi có
 * màn thật: một mục bấm vào không ra gì tệ hơn một mục chưa có.
 *
 * Mục nào khai `need` thì chỉ hiện với vai trò có quyền đó — cùng lý do: mục bấm
 * vào chỉ để nhận màn "không được phép" là mục thừa. Guard ở máy chủ vẫn là thứ
 * cưỡng chế, đây chỉ là dọn màn hình.
 */
const NAV: { group: string; items: { to: string; label: string; need?: ActionKey }[] }[] = [
  {
    group: 'Kinh doanh',
    items: [
      { to: '/hom-nay', label: 'B1 · Hôm nay', need: 'report.branch-revenue' },
      { to: '/phan-tich-mon', label: 'B3 · Phân tích món', need: 'report.margin-foodcost' },
    ],
  },
  {
    group: 'Nhân sự',
    items: [
      { to: '/xep-lich', label: 'H2 · Xếp lịch tuần', need: 'schedule.publish' },
      { to: '/nhan-vien', label: 'H1 · Hồ sơ nhân viên', need: 'payroll.configure' },
      { to: '/ky-luong', label: 'H7 · Kỳ lương', need: 'payroll.view-others' },
    ],
  },
  {
    group: 'Chi phí & tài sản',
    items: [
      { to: '/chi-phi-tong-quan', label: 'C1 · Tổng quan chi phí', need: 'expense.record-petty' },
      { to: '/chi-phi', label: 'C2 · Sổ phiếu chi', need: 'expense.record-petty' },
      { to: '/dinh-ky', label: 'C3 · Chi phí định kỳ', need: 'expense.record-petty' },
      { to: '/tai-san', label: 'C4 · Tài sản & khấu hao', need: 'asset.ledger' },
    ],
  },
  {
    group: 'Tài chính',
    items: [
      { to: '/so-quy', label: 'F1 · Sổ quỹ & đối soát', need: 'accounting.ledger-close-period' },
      { to: '/lai-lo', label: 'F7 · Lãi / Lỗ', need: 'report.pnl-branch-summary' },
    ],
  },
  {
    group: 'Món & kho',
    items: [
      { to: '/mon', label: 'M1 · Món và set' },
      { to: '/cong-thuc', label: 'M4 · Công thức & giá vốn', need: 'cost.view-recipe' },
      { to: '/nguyen-lieu', label: 'M7 · Nguyên liệu', need: 'cost.view-recipe' },
      { to: '/kho', label: 'S1 · Tổng quan kho', need: 'cost.view-recipe' },
      { to: '/ton-kho', label: 'S2 · Tồn kho', need: 'cost.view-recipe' },
    ],
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
    items: [
      { to: '/vung-giao', label: 'O10 · Vùng giao & phí' },
      { to: '/menu-online', label: 'O11 · Menu online' },
      { to: '/nhan-dat', label: 'R3 · Cấu hình nhận đặt' },
    ],
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
                <Route path="/hom-nay" element={<Today />} />
                <Route path="/phan-tich-mon" element={<MenuMatrix />} />
                <Route path="/so-quy" element={<CashBook />} />
                <Route path="/lai-lo" element={<ProfitLoss />} />
                <Route path="/mon" element={<Dishes />} />
                <Route path="/cong-thuc" element={<RecipeList />} />
                <Route path="/cong-thuc/:dishId" element={<RecipeEditor />} />
                <Route path="/nguyen-lieu" element={<Ingredients />} />
                <Route path="/kho" element={<StockOverview />} />
                <Route path="/ton-kho" element={<StockLevels />} />
                <Route path="/xep-lich" element={<Schedule />} />
                <Route path="/nhan-vien" element={<Employees />} />
                <Route path="/ky-luong" element={<Payroll />} />
                <Route path="/chi-phi-tong-quan" element={<ExpenseOverview />} />
                <Route path="/chi-phi" element={<Expenses />} />
                <Route path="/dinh-ky" element={<RecurringExpenses />} />
                <Route path="/tai-san" element={<Assets />} />
                <Route path="/tham-so" element={<Parameters />} />
                <Route path="/so-do-ban" element={<Floorplan />} />
                <Route path="/chi-nhanh" element={<Branches />} />
                <Route path="/vung-giao" element={<DeliveryZones />} />
                <Route path="/menu-online" element={<OnlineMenu />} />
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
  const { staff, ready, branchId, signOut, can } = useSession()

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-ink-mute">
        Đang khôi phục phiên…
      </div>
    )
  }
  if (!staff) return <Login />

  const visible = NAV.map((group) => ({
    group: group.group,
    items: group.items.filter((item) => !item.need || can(item.need)),
  })).filter((group) => group.items.length > 0)

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
          {visible.map((group) => (
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
