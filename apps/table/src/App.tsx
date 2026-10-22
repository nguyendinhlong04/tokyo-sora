import { watchConnectivity } from '@sora/core'
import { ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { CartProvider } from './cart-context'
import { Bill } from './routes/Bill'
import { Cart } from './routes/Cart'
import { Enter } from './routes/Enter'
import { Invoice } from './routes/Invoice'
import { Menu } from './routes/Menu'
import { Orders } from './routes/Orders'
import { PayQr } from './routes/PayQr'
import { Search } from './routes/Search'
import { Shell } from './routes/Shell'
import { Split } from './routes/Split'
import { Waiting } from './routes/Waiting'
import { Welcome } from './routes/Welcome'
import { TableProvider } from './table-context'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Điện thoại hay bị khoá màn rồi mở lại giữa bữa: quay lại là lấy dữ liệu
      // mới, khỏi nhìn số tiền cũ.
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 5_000,
    },
    mutations: {
      // Không để thư viện tự hoãn lệnh ghi khi trình duyệt báo mất mạng (mặc định
      // của nó). Hoãn ở đây thì "Gửi bếp" đứng im và món không bao giờ vào hàng đợi
      // offline — chính chỗ lo chuyện mất mạng; còn gọi nhân viên, trả tiền thì phải
      // báo lỗi ngay, chứ không phải bắn đi vài phút sau khi đã vô nghĩa.
      networkMode: 'always',
    },
  },
})

export function App() {
  useEffect(() => watchConnectivity(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <TableProvider>
            <CartProvider>
              <Routes>
                {/* Địa chỉ in trong mã QR dán bàn — dán cố định, không phải bí mật */}
                <Route path="/t/:branchId/:tableCode" element={<Enter />} />
                <Route path="/cho-duyet" element={<Waiting />} />
                <Route element={<Shell />}>
                  <Route path="/" element={<Welcome />} />
                  <Route path="/thuc-don" element={<Menu />} />
                  <Route path="/tim" element={<Search />} />
                  <Route path="/gio" element={<Cart />} />
                  <Route path="/don" element={<Orders />} />
                  <Route path="/tam-tinh" element={<Bill />} />
                  <Route path="/tra-tien" element={<Split />} />
                  <Route path="/tra-tien/:paymentId" element={<PayQr />} />
                  <Route path="/hoa-don" element={<Invoice />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </CartProvider>
          </TableProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
