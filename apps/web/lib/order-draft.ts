/**
 * Bản nháp đơn hàng ở tầng lưu trữ — khoá và cách ghi sẵn lựa chọn.
 *
 * Tách khỏi `app/dat-mon/order-context.tsx` để trang chủ ghi được lựa chọn "giao
 * hay đến lấy" trước khi khách bước vào luồng đặt món, mà không kéo cả React
 * context của luồng đó vào bundle trang marketing (§23.1.6). Khoá lưu trữ và hình
 * dạng bản nháp vẫn chỉ có một nơi biết — chỗ này.
 */

export type ReceiveMode = 'takeaway' | 'delivery'

export const ORDER_STORAGE_KEY = 'sora.web.order'

/**
 * Ghi đè vài trường vào bản nháp đang có, giữ nguyên phần còn lại.
 *
 * Gọi TRƯỚC khi điều hướng sang `/dat-mon`: `OrderProvider` đọc `sessionStorage`
 * lúc gắn vào cây nên lựa chọn ở trang chủ có mặt ngay khi màn O1 hiện ra.
 */
export function seedOrderDraft(patch: { mode?: ReceiveMode; branchId?: string }): void {
  try {
    const raw = sessionStorage.getItem(ORDER_STORAGE_KEY)
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify({ ...current, ...patch }))
  } catch {
    // Trình duyệt chặn lưu trữ — khách chọn lại ở màn O1, luồng không gãy
  }
}
