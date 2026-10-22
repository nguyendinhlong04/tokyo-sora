import type { ActionKey } from '@sora/contracts'
import { ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, useEffect, useMemo, useState, type ComponentType } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { ConfigBranchProvider } from './components/config-branch'
import { InboxBell } from './components/InboxBell'
import { PublishConfig } from './components/publish-config'
import { ReportBranchProvider } from './components/report'
import { ScreenBoundary } from './components/ScreenBoundary'
import { Login } from './routes/Login'
import { MyDesk } from './routes/MyDesk'
import { SessionProvider, useSession } from './session-context'

/**
 * Mỗi file màn là một chunk riêng, tải lần đầu mở màn đó: gộp cả Office vào một
 * chunk thì đã vượt ngân sách JS 250 KB gzip của §8, và màn nào thêm vào cũng
 * cộng thẳng vào lần tải đầu của mọi người.
 *
 * Chỉ N1 `/ban-lam-viec` và màn đăng nhập ở lại chunk đầu: đường dẫn lạ nào cũng về
 * `/ban-lam-viec`, nên đó là màn ai đăng nhập cũng thấy trước. Không gộp thêm nhóm
 * màn — các màn hay mở liền nhau vốn chung một file (danh sách + màn sửa công thức,
 * F2–F6 ở Accounting, S4–S5 ở Purchasing…) nên đã chung một chunk.
 *
 * Màn mới khai ở đây bằng `screen(...)`. Import tĩnh một màn là kéo nó về chunk đầu.
 */
function screen<K extends string, M extends Record<K, ComponentType>>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const Debts = screen(() => import('./routes/Accounting'), 'Debts')
const InvoiceBook = screen(() => import('./routes/Accounting'), 'InvoiceBook')
const PeriodClose = screen(() => import('./routes/Accounting'), 'PeriodClose')
const RevenueJournal = screen(() => import('./routes/Accounting'), 'RevenueJournal')
const TaxReport = screen(() => import('./routes/Accounting'), 'TaxReport')
const Accounts = screen(() => import('./routes/Accounts'), 'Accounts')
const Attendance = screen(() => import('./routes/Attendance'), 'Attendance')
const AuditLog = screen(() => import('./routes/AuditLog'), 'AuditLog')
const Branches = screen(() => import('./routes/Branches'), 'Branches')
const CashBook = screen(() => import('./routes/CashBook'), 'CashBook')
const Categories = screen(() => import('./routes/Categories'), 'Categories')
const Cms = screen(() => import('./routes/Cms'), 'Cms')
const Corporate = screen(() => import('./routes/Corporate'), 'Corporate')
const Assets = screen(() => import('./routes/CostCenter'), 'Assets')
const ExpenseOverview = screen(() => import('./routes/CostCenter'), 'ExpenseOverview')
const RecurringExpenses = screen(() => import('./routes/CostCenter'), 'RecurringExpenses')
const Customers = screen(() => import('./routes/Customers'), 'Customers')
const DeliveryZones = screen(() => import('./routes/DeliveryZones'), 'DeliveryZones')
const Devices = screen(() => import('./routes/Devices'), 'Devices')
const Dishes = screen(() => import('./routes/Dishes'), 'Dishes')
const DocumentPage = screen(() => import('./routes/DocumentPage'), 'DocumentPage')
const Documents = screen(() => import('./routes/Documents'), 'Documents')
const Incidents = screen(() => import('./routes/Incidents'), 'Incidents')
const KpiCycles = screen(() => import('./routes/KpiCycles'), 'KpiCycles')
const KpiTemplates = screen(() => import('./routes/KpiTemplates'), 'KpiTemplates')
const Observations = screen(() => import('./routes/Observations'), 'Observations')
const OrgChart = screen(() => import('./routes/OrgChart'), 'OrgChart')
const Positions = screen(() => import('./routes/Positions'), 'Positions')
const Tasks = screen(() => import('./routes/Tasks'), 'Tasks')
const TaskTemplates = screen(() => import('./routes/TaskTemplates'), 'TaskTemplates')
const WorkReports = screen(() => import('./routes/WorkReports'), 'WorkReports')
const EInvoice = screen(() => import('./routes/EInvoice'), 'EInvoice')
const Employees = screen(() => import('./routes/Employees'), 'Employees')
const Expenses = screen(() => import('./routes/Expenses'), 'Expenses')
const Feedback = screen(() => import('./routes/Feedback'), 'Feedback')
const Floorplan = screen(() => import('./routes/Floorplan'), 'Floorplan')
const Ingredients = screen(() => import('./routes/Ingredients'), 'Ingredients')
const InputInvoices = screen(() => import('./routes/InputInvoices'), 'InputInvoices')
const Leaves = screen(() => import('./routes/Leaves'), 'Leaves')
const LoyaltyRules = screen(() => import('./routes/LoyaltyRules'), 'LoyaltyRules')
const PayrollRules = screen(() => import('./routes/PayrollRules'), 'PayrollRules')
const Promotions = screen(() => import('./routes/Promotions'), 'Promotions')
const PrepEditor = screen(() => import('./routes/Prep'), 'PrepEditor')
const PrepList = screen(() => import('./routes/Prep'), 'PrepList')
const Printers = screen(() => import('./routes/Printers'), 'Printers')
const PurchaseOrders = screen(() => import('./routes/Purchasing'), 'PurchaseOrders')
const Receiving = screen(() => import('./routes/Purchasing'), 'Receiving')
const RecipeHistory = screen(() => import('./routes/RecipeHistory'), 'RecipeHistory')
const ReportCenter = screen(() => import('./routes/ReportCenter'), 'ReportCenter')
const CostMargin = screen(() => import('./routes/RevenueReports'), 'CostMargin')
const Revenue = screen(() => import('./routes/RevenueReports'), 'Revenue')
const SetsReport = screen(() => import('./routes/RevenueReports'), 'SetsReport')
const Roles = screen(() => import('./routes/Roles'), 'Roles')
const Sets = screen(() => import('./routes/Sets'), 'Sets')
const Lots = screen(() => import('./routes/StockBooks'), 'Lots')
const StockCardScreen = screen(() => import('./routes/StockBooks'), 'StockCardScreen')
const WasteReport = screen(() => import('./routes/StockBooks'), 'WasteReport')
const Production = screen(() => import('./routes/StockOps'), 'Production')
const StockCount = screen(() => import('./routes/StockOps'), 'StockCount')
const StockIssues = screen(() => import('./routes/StockOps'), 'StockIssues')
const Transfers = screen(() => import('./routes/StockOps'), 'Transfers')
const Suppliers = screen(() => import('./routes/Suppliers'), 'Suppliers')
const Timesheet = screen(() => import('./routes/Timesheet'), 'Timesheet')
const MenuMatrix = screen(() => import('./routes/MenuMatrix'), 'MenuMatrix')
const Modifiers = screen(() => import('./routes/Modifiers'), 'Modifiers')
const KitchenReport = screen(() => import('./routes/OperationsReports'), 'KitchenReport')
const OnlineReport = screen(() => import('./routes/OperationsReports'), 'OnlineReport')
const StaffReport = screen(() => import('./routes/OperationsReports'), 'StaffReport')
const TableTurnover = screen(() => import('./routes/OperationsReports'), 'TableTurnover')
const OnlineMenu = screen(() => import('./routes/OnlineMenu'), 'OnlineMenu')
const Parameters = screen(() => import('./routes/Parameters'), 'Parameters')
const Payroll = screen(() => import('./routes/Payroll'), 'Payroll')
const ProfitLoss = screen(() => import('./routes/ProfitLoss'), 'ProfitLoss')
const RecipeEditor = screen(() => import('./routes/Recipes'), 'RecipeEditor')
const RecipeList = screen(() => import('./routes/Recipes'), 'RecipeList')
const ReservationConfig = screen(() => import('./routes/ReservationConfig'), 'ReservationConfig')
const Schedule = screen(() => import('./routes/Schedule'), 'Schedule')
const StockLevels = screen(() => import('./routes/Stock'), 'StockLevels')
const StockOverview = screen(() => import('./routes/Stock'), 'StockOverview')
const Today = screen(() => import('./routes/Today'), 'Today')

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: true } },
})

/**
 * Điều hướng của Office — nhóm theo đúng cột trái của bản thiết kế.
 *
 * Chỉ liệt kê những màn ĐÃ dựng. Các nhóm còn lại thêm vào khi có màn thật: một
 * mục bấm vào không ra gì tệ hơn một mục chưa có.
 *
 * Mục nào khai `need` thì chỉ hiện với vai trò có quyền đó — cùng lý do: mục bấm
 * vào chỉ để nhận màn "không được phép" là mục thừa. Guard ở máy chủ vẫn là thứ
 * cưỡng chế, đây chỉ là dọn màn hình.
 *
 * Chia nhóm theo SỐ MỤC ĐỌC ĐƯỢC MỘT LẦN, không theo sơ đồ phòng ban. Trước đây
 * "Món & kho" gánh 21 mục còn "Kênh online" có 3 — mở nhóm 21 mục ra thì vẫn
 * phải cuộn, tức là thu nhóm chẳng giải quyết gì. Giờ nhóm to nhất 12 mục, vừa
 * đúng một màn hình 1080 không cần cuộn.
 */
const NAV: { group: string; items: { to: string; label: string; need?: ActionKey }[] }[] = [
  {
    group: 'Báo cáo kinh doanh',
    items: [
      { to: '/hom-nay', label: 'B1 · Hôm nay', need: 'report.branch-revenue' },
      { to: '/doanh-thu', label: 'B2 · Doanh thu', need: 'report.branch-revenue' },
      { to: '/phan-tich-mon', label: 'B3 · Phân tích món', need: 'report.margin-foodcost' },
      { to: '/gia-von', label: 'B4 · Giá vốn & lãi gộp', need: 'report.margin-foodcost' },
      { to: '/hieu-suat-bep', label: 'B5 · Hiệu suất bếp', need: 'report.margin-foodcost' },
      { to: '/vong-quay-ban', label: 'B6 · Vòng quay bàn', need: 'report.branch-revenue' },
      { to: '/nhan-su-ban-hang', label: 'B7 · Nhân sự', need: 'report.branch-revenue' },
      { to: '/set-khuyen-mai', label: 'B8 · Set & giảm giá', need: 'report.margin-foodcost' },
      { to: '/online-dat-ban', label: 'B9 · Online & đặt bàn', need: 'report.branch-revenue' },
      { to: '/trung-tam-bao-cao', label: 'B10 · Trung tâm báo cáo', need: 'report.branch-revenue' },
    ],
  },
  {
    group: 'Khách & khuyến mãi',
    items: [
      { to: '/khuyen-mai', label: 'B11 · Khuyến mãi & voucher', need: 'promo.compose' },
      { to: '/so-khach', label: 'B12 · Sổ khách', need: 'customer.view-book' },
      { to: '/phan-hoi', label: 'B13 · Phản hồi khách', need: 'feedback.respond' },
      { to: '/tich-diem', label: 'B14 · Tích điểm & hạng', need: 'customer.view-book' },
      {
        to: '/khach-doanh-nghiep',
        label: 'B15 · Khách doanh nghiệp',
        need: 'corporate.edit-profile',
      },
    ],
  },
  {
    group: 'Nhân sự',
    items: [
      { to: '/nhan-vien', label: 'H1 · Hồ sơ nhân viên', need: 'payroll.configure' },
      { to: '/xep-lich', label: 'H2 · Xếp lịch tuần', need: 'schedule.publish' },
      { to: '/cham-cong', label: 'H3 · Chấm công hôm nay', need: 'schedule.publish' },
      { to: '/bang-cong', label: 'H4 · Bảng công tháng', need: 'schedule.publish' },
      { to: '/nghi-phep', label: 'H5 · Nghỉ phép & đổi ca', need: 'schedule.publish' },
      { to: '/co-che-luong', label: 'H6 · Cơ chế lương', need: 'payroll.configure' },
      { to: '/ky-luong', label: 'H7 · Kỳ lương', need: 'payroll.view-others' },
    ],
  },
  {
    group: 'Tổ chức & điều hành',
    items: [
      { to: '/ban-lam-viec', label: 'N1 · Bàn làm việc' },
      { to: '/so-do-to-chuc', label: 'N2 · Sơ đồ tổ chức', need: 'org.view' },
      { to: '/chuc-danh', label: 'N3 · Chức danh & định biên', need: 'org.view' },
      { to: '/van-ban', label: 'N4 · Văn bản & thông báo', need: 'doc.compose' },
      { to: '/giao-viec', label: 'N5 · Giao việc', need: 'task.assign' },
      { to: '/viec-dinh-ky', label: 'N6 · Việc định kỳ & SOP', need: 'task.assign' },
      { to: '/bao-cao-cong-viec', label: 'N7 · Báo cáo công việc', need: 'workreport.review' },
      { to: '/su-co', label: 'N8 · Sự cố', need: 'incident.manage' },
      { to: '/kpi', label: 'N9 · Bộ KPI', need: 'kpi.configure' },
      { to: '/danh-gia-kpi', label: 'N10 · Kỳ đánh giá KPI', need: 'kpi.review-team' },
      { to: '/phieu-kiem-tra', label: 'N11 · Phiếu kiểm tra', need: 'kpi.observe' },
    ],
  },
  {
    group: 'Chi phí & tài sản',
    items: [
      { to: '/chi-phi-tong-quan', label: 'C1 · Tổng quan chi phí', need: 'expense.record-petty' },
      { to: '/chi-phi', label: 'C2 · Sổ phiếu chi', need: 'expense.record-petty' },
      { to: '/dinh-ky', label: 'C3 · Chi phí định kỳ', need: 'expense.record-petty' },
      { to: '/tai-san', label: 'C4 · Tài sản & khấu hao', need: 'asset.ledger' },
      { to: '/hoa-don-dau-vao', label: 'C5 · Hoá đơn đầu vào', need: 'expense.approve' },
    ],
  },
  {
    group: 'Tài chính',
    items: [
      { to: '/so-quy', label: 'F1 · Sổ quỹ & đối soát', need: 'accounting.ledger-close-period' },
      { to: '/nhat-ky', label: 'F2 · Nhật ký doanh thu', need: 'accounting.ledger-close-period' },
      { to: '/hoa-don', label: 'F3 · Sổ hoá đơn điện tử', need: 'accounting.ledger-close-period' },
      { to: '/bao-cao-thue', label: 'F4 · Báo cáo thuế', need: 'accounting.ledger-close-period' },
      { to: '/cong-no', label: 'F5 · Công nợ', need: 'accounting.ledger-close-period' },
      { to: '/khoa-so', label: 'F6 · Khoá sổ kỳ', need: 'accounting.ledger-close-period' },
      { to: '/lai-lo', label: 'F7 · Lãi / Lỗ', need: 'report.pnl-branch-summary' },
    ],
  },
  {
    group: 'Món & thực đơn',
    items: [
      { to: '/mon', label: 'M1 · Món và set' },
      { to: '/tuy-chon', label: 'M5 · Tuỳ chọn', need: 'menu.view-price' },
      { to: '/cong-thuc', label: 'M4 · Công thức & giá vốn', need: 'cost.view-recipe' },
      { to: '/nguyen-lieu', label: 'M7 · Nguyên liệu', need: 'cost.view-recipe' },
      { to: '/ban-thanh-pham', label: 'M8 · Bán thành phẩm', need: 'cost.view-recipe' },
      { to: '/lich-su-cong-thuc', label: 'M9 · Lịch sử công thức', need: 'cost.view-recipe' },
      { to: '/nhom-mon', label: 'M10 · Cây danh mục', need: 'menu.view-price' },
      { to: '/set-combo', label: 'M11 · Set & Combo', need: 'cost.view-recipe' },
    ],
  },
  {
    group: 'Kho & mua hàng',
    items: [
      { to: '/kho', label: 'S1 · Tổng quan kho', need: 'cost.view-recipe' },
      { to: '/ton-kho', label: 'S2 · Tồn kho', need: 'cost.view-recipe' },
      { to: '/nha-cung-cap', label: 'S3 · Nhà cung cấp', need: 'cost.view-recipe' },
      { to: '/dat-hang', label: 'S4 · Đơn đặt hàng', need: 'cost.view-recipe' },
      { to: '/nhap-kho', label: 'S5 · Nhập kho', need: 'stock.receive' },
      { to: '/xuat-kho', label: 'S6 · Xuất kho', need: 'stock.write-off' },
      { to: '/san-xuat', label: 'S7 · Sản xuất nội bộ', need: 'stock.receive' },
      { to: '/kiem-ke', label: 'S8 · Kiểm kê', need: 'stock.receive' },
      { to: '/lo-hang', label: 'S9 · Lô & hạn dùng', need: 'cost.view-recipe' },
      { to: '/chuyen-kho', label: 'S10 · Chuyển kho', need: 'cost.view-recipe' },
      { to: '/hao-hut', label: 'S11 · Báo cáo hao hụt', need: 'cost.view-recipe' },
      { to: '/the-kho', label: 'S12 · Thẻ kho', need: 'cost.view-recipe' },
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
  {
    group: 'Quản trị',
    items: [
      { to: '/tai-khoan', label: 'A1 · Tài khoản', need: 'admin.manage-accounts-roles' },
      { to: '/vai-tro', label: 'A2 · Vai trò & quyền', need: 'admin.manage-accounts-roles' },
      { to: '/so-do-ban', label: 'A3 · Khu vực & bàn', need: 'admin.manage-accounts-roles' },
      { to: '/thiet-bi', label: 'A4 · Thiết bị', need: 'admin.manage-accounts-roles' },
      { to: '/may-in', label: 'A5 · Máy in', need: 'admin.manage-accounts-roles' },
      { to: '/tham-so', label: 'A6 · Trung tâm tham số', need: 'admin.manage-accounts-roles' },
      { to: '/nhat-ky-thao-tac', label: 'A7 · Nhật ký thao tác', need: 'audit.view-log' },
      { to: '/noi-dung-web', label: 'A8 · Nội dung website', need: 'cms.edit' },
      {
        to: '/hoa-don-dien-tu',
        label: 'A9 · Hoá đơn điện tử',
        need: 'admin.manage-accounts-roles',
      },
      { to: '/chi-nhanh', label: 'A10 · Chi nhánh', need: 'admin.manage-accounts-roles' },
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
                <Route path="/doanh-thu" element={<Revenue />} />
                <Route path="/phan-tich-mon" element={<MenuMatrix />} />
                <Route path="/khuyen-mai" element={<Promotions />} />
                <Route path="/so-khach" element={<Customers />} />
                <Route path="/phan-hoi" element={<Feedback />} />
                <Route path="/tich-diem" element={<LoyaltyRules />} />
                <Route path="/khach-doanh-nghiep" element={<Corporate />} />
                <Route path="/gia-von" element={<CostMargin />} />
                <Route path="/hieu-suat-bep" element={<KitchenReport />} />
                <Route path="/vong-quay-ban" element={<TableTurnover />} />
                <Route path="/nhan-su-ban-hang" element={<StaffReport />} />
                <Route path="/set-khuyen-mai" element={<SetsReport />} />
                <Route path="/online-dat-ban" element={<OnlineReport />} />
                <Route path="/trung-tam-bao-cao" element={<ReportCenter />} />
                <Route path="/so-quy" element={<CashBook />} />
                <Route path="/lai-lo" element={<ProfitLoss />} />
                <Route path="/mon" element={<Dishes />} />
                <Route path="/cong-thuc" element={<RecipeList />} />
                <Route path="/cong-thuc/:dishId" element={<RecipeEditor />} />
                <Route path="/nguyen-lieu" element={<Ingredients />} />
                <Route path="/ban-thanh-pham" element={<PrepList />} />
                <Route path="/ban-thanh-pham/:prepId" element={<PrepEditor />} />
                <Route path="/lich-su-cong-thuc" element={<RecipeHistory />} />
                <Route path="/tuy-chon" element={<Modifiers />} />
                <Route path="/nhom-mon" element={<Categories />} />
                <Route path="/set-combo" element={<Sets />} />
                <Route path="/kho" element={<StockOverview />} />
                <Route path="/ton-kho" element={<StockLevels />} />
                <Route path="/nha-cung-cap" element={<Suppliers />} />
                <Route path="/dat-hang" element={<PurchaseOrders />} />
                <Route path="/nhap-kho" element={<Receiving />} />
                <Route path="/xuat-kho" element={<StockIssues />} />
                <Route path="/san-xuat" element={<Production />} />
                <Route path="/kiem-ke" element={<StockCount />} />
                <Route path="/lo-hang" element={<Lots />} />
                <Route path="/chuyen-kho" element={<Transfers />} />
                <Route path="/hao-hut" element={<WasteReport />} />
                <Route path="/the-kho" element={<StockCardScreen />} />
                <Route path="/xep-lich" element={<Schedule />} />
                <Route path="/nhan-vien" element={<Employees />} />
                <Route path="/cham-cong" element={<Attendance />} />
                <Route path="/bang-cong" element={<Timesheet />} />
                <Route path="/nghi-phep" element={<Leaves />} />
                <Route path="/co-che-luong" element={<PayrollRules />} />
                <Route path="/ky-luong" element={<Payroll />} />
                <Route path="/so-do-to-chuc" element={<OrgChart />} />
                <Route path="/chuc-danh" element={<Positions />} />
                <Route path="/van-ban" element={<Documents />} />
                <Route path="/van-ban/moi" element={<DocumentPage />} />
                <Route path="/van-ban/:id" element={<DocumentPage />} />
                <Route path="/ban-lam-viec" element={<MyDesk />} />
                <Route path="/giao-viec" element={<Tasks />} />
                <Route path="/viec-dinh-ky" element={<TaskTemplates />} />
                <Route path="/bao-cao-cong-viec" element={<WorkReports />} />
                <Route path="/su-co" element={<Incidents />} />
                <Route path="/kpi" element={<KpiTemplates />} />
                <Route path="/danh-gia-kpi" element={<KpiCycles />} />
                <Route path="/phieu-kiem-tra" element={<Observations />} />
                <Route path="/chi-phi-tong-quan" element={<ExpenseOverview />} />
                <Route path="/chi-phi" element={<Expenses />} />
                <Route path="/dinh-ky" element={<RecurringExpenses />} />
                <Route path="/tai-san" element={<Assets />} />
                <Route path="/hoa-don-dau-vao" element={<InputInvoices />} />
                <Route path="/nhat-ky" element={<RevenueJournal />} />
                <Route path="/hoa-don" element={<InvoiceBook />} />
                <Route path="/bao-cao-thue" element={<TaxReport />} />
                <Route path="/cong-no" element={<Debts />} />
                <Route path="/khoa-so" element={<PeriodClose />} />
                <Route path="/tai-khoan" element={<Accounts />} />
                <Route path="/vai-tro" element={<Roles />} />
                <Route path="/so-do-ban" element={<Floorplan />} />
                <Route path="/thiet-bi" element={<Devices />} />
                <Route path="/may-in" element={<Printers />} />
                <Route path="/tham-so" element={<Parameters />} />
                <Route path="/nhat-ky-thao-tac" element={<AuditLog />} />
                <Route path="/noi-dung-web" element={<Cms />} />
                <Route path="/hoa-don-dien-tu" element={<EInvoice />} />
                <Route path="/chi-nhanh" element={<Branches />} />
                <Route path="/vung-giao" element={<DeliveryZones />} />
                <Route path="/menu-online" element={<OnlineMenu />} />
                <Route path="/nhan-dat" element={<ReservationConfig />} />
              </Route>
              <Route path="*" element={<Navigate to="/ban-lam-viec" replace />} />
            </Routes>
          </SessionProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

const OPEN_GROUP_KEY = 'sora-office-nav-group'

function Shell() {
  const { staff, ready, branchId, signOut, can } = useSession()
  const { pathname } = useLocation()
  const [openGroup, setOpenGroup] = useState<string | null>(() =>
    localStorage.getItem(OPEN_GROUP_KEY),
  )
  const [filter, setFilter] = useState('')

  const visible = useMemo(
    () =>
      NAV.map((group) => ({
        group: group.group,
        items: group.items.filter((item) => !item.need || can(item.need)),
      })).filter((group) => group.items.length > 0),
    [can],
  )

  // Nhóm chứa trang đang xem luôn tự mở. Không có cái này thì bấm một liên kết
  // trong trang (ví dụ M4 mở màn sửa công thức) sẽ để menu chỉ vào chỗ khác.
  // So theo đoạn đường dẫn như NavLink, không theo ký tự: `startsWith` trần cho
  // `/nhat-ky-thao-tac` (A7) khớp `/nhat-ky` (F2) và mở nhầm nhóm Tài chính.
  const activeGroup = visible.find((g) =>
    g.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)),
  )?.group
  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup)
  }, [activeGroup])

  useEffect(() => {
    if (openGroup) localStorage.setItem(OPEN_GROUP_KEY, openGroup)
  }, [openGroup])

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-ink-mute">
        Đang khôi phục phiên…
      </div>
    )
  }
  if (!staff) return <Login />

  // Đang gõ lọc thì bỏ qua accordion và trải phẳng kết quả: thu nhóm lúc này chỉ
  // làm người dùng phải mở từng nhóm ra để xem cái mình vừa tìm nằm ở đâu.
  const needle = filter.trim().toLowerCase()
  const groups = needle
    ? visible
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => i.label.toLowerCase().includes(needle)),
        }))
        .filter((g) => g.items.length > 0)
    : visible

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas font-sans text-ink-body print:h-auto print:overflow-visible">
      <aside className="flex w-64 flex-none flex-col border-r border-line-1 bg-surface-1 print:hidden">
        <div className="flex flex-none items-center justify-between gap-2 border-b border-line-1 px-5 py-4">
          <div className="flex items-baseline gap-2">
            <span className="font-jp text-[length:var(--fs-b2)] text-accent">東京空</span>
            <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.16em] text-ink-hi">
              TOKYO SORA
            </span>
          </div>
          <InboxBell />
        </div>

        <div className="flex-none border-b border-line-1 px-5 py-3.5">
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Chi nhánh đang xem
          </p>
          <p className="mt-1.5 text-[length:var(--fs-b2)] text-ink-hi">{branchId}</p>
        </div>

        {/* Thu nhóm lại thì mất khả năng liếc một cái thấy hết mục. Ô lọc trả
            lại đúng khả năng đó — gõ "kho" hoặc "S5" là ra ngay, không cần nhớ
            mục nằm ở nhóm nào. */}
        <div className="flex-none border-b border-line-1 px-4 py-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Lọc menu…"
            aria-label="Lọc menu"
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-c1)] text-ink-hi outline-none placeholder:text-ink-mute focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
          />
        </div>

        {/* `scrollbar-none` ẩn thanh trượt, `overscroll-contain` chặn việc cuộn
            hết menu rồi lăn tiếp làm trôi nội dung trang bên phải. */}
        <nav className="scrollbar-none flex-1 overflow-y-auto overscroll-contain py-2">
          {groups.map((group) => {
            const open = needle !== '' || openGroup === group.group
            return (
              <div key={group.group}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenGroup(open && !needle ? null : group.group)}
                  className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="min-w-0 flex-1 truncate text-[length:var(--fs-c2)] font-semibold tracking-[0.14em] text-ink-mute uppercase">
                    {group.group}
                  </span>
                  <span className="font-mono text-[length:var(--fs-c2)] text-line-4">
                    {group.items.length}
                  </span>
                  <svg
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    className={`size-3 flex-none text-ink-mute transition-transform duration-[var(--dur-micro)] ${
                      open ? 'rotate-90' : ''
                    }`}
                  >
                    <path
                      d="M4 2.5 8 6l-4 3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>

                {open ? (
                  <div className="pb-2">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `flex h-9 items-center pr-4 pl-7 text-[length:var(--fs-b2)] transition-colors ${
                            isActive
                              ? 'bg-surface-3 font-medium text-ink-hi shadow-[inset_3px_0_0_var(--color-accent)]'
                              : 'text-ink-mute hover:bg-surface-3 hover:text-ink-hi'
                          }`
                        }
                      >
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}

          {groups.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-c1)] text-ink-mute">
              Không có mục nào khớp “{filter}”.
            </p>
          ) : null}
        </nav>

        {/* Chỉ người sửa được giá mới phát hành được — cùng khoá quyền với việc
            đổi giá, vì phát hành chính là lúc giá mới có hiệu lực ngoài quán */}
        {branchId && can('menu.edit-price') ? <PublishConfig branchId={branchId} /> : null}

        <div className="flex-none border-t border-line-1 px-5 py-4">
          <p className="truncate text-[length:var(--fs-b2)] text-ink-hi">{staff.fullName}</p>
          <p className="mt-1 truncate text-[length:var(--fs-c1)] text-ink-mute">
            {staff.roles.join(' · ')}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 rounded-sm text-[length:var(--fs-c1)] text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
        {/* Bộ lọc chi nhánh của nhóm báo cáo và chi nhánh đang cấu hình của
            nhóm cài đặt đều sống theo phiên đăng nhập: đăng xuất là Shell rơi
            về <Login /> và cả hai lựa chọn tự reset theo provider. Hai context
            cố ý tách nhau — xem chú thích ở components/config-branch.tsx. */}
        <ReportBranchProvider>
          <ConfigBranchProvider>
            <ScreenBoundary resetKey={pathname}>
              <Outlet />
            </ScreenBoundary>
          </ConfigBranchProvider>
        </ReportBranchProvider>
      </div>
    </div>
  )
}
