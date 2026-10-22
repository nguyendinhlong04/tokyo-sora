import { clearDevice, getDeviceToken, watchConnectivity } from '@sora/core'
import { ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { IpadInvoice } from './routes/IpadInvoice'
import { IpadMenu } from './routes/IpadMenu'
import { IpadOrders } from './routes/IpadOrders'
import { IpadPair } from './routes/IpadPair'
import { IpadPay } from './routes/IpadPay'
import { IpadPayQr } from './routes/IpadPayQr'
import { IpadShell } from './routes/IpadShell'
import { IpadWelcome } from './routes/IpadWelcome'
import { TableProvider } from './table-context'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // iPad khoá màn rồi sáng lại giữa bữa: quay lại là lấy dữ liệu mới, khỏi
      // nhìn số tiền cũ.
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

/**
 * Sora Table — iPad gắn bàn (§9.1).
 *
 * Chưa có token thiết bị thì chỉ có màn ghép máy: iPad không có bàn nào để phục
 * vụ cho tới khi quản lý sinh mã ở Office A4 cho đúng một bàn. Máy bị ngắt từ xa
 * thì xoá token và quay về đúng màn đó.
 */
export function App() {
  useEffect(() => watchConnectivity(), [])
  const [paired, setPaired] = useState(() => getDeviceToken() !== null)
  const [revoked, setRevoked] = useState(false)

  const unpair = useCallback(() => {
    clearDevice()
    // Dữ liệu của bàn cũ không được sống sang lần ghép sau
    queryClient.clear()
    setRevoked(true)
    setPaired(false)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider placement="bottom-center">
        {paired ? (
          <BrowserRouter>
            <TableProvider onUnpaired={unpair}>
              <Routes>
                <Route element={<IpadShell />}>
                  <Route path="/" element={<IpadWelcome />} />
                  <Route path="/thuc-don" element={<IpadMenu />} />
                  <Route path="/don" element={<IpadOrders />} />
                  <Route path="/tra-tien" element={<IpadPay />} />
                  <Route path="/tra-tien/:paymentId" element={<IpadPayQr />} />
                  <Route path="/hoa-don" element={<IpadInvoice />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </TableProvider>
          </BrowserRouter>
        ) : (
          <IpadPair
            revoked={revoked}
            onPaired={() => {
              setRevoked(false)
              setPaired(true)
            }}
          />
        )}
      </ToastProvider>
    </QueryClientProvider>
  )
}
