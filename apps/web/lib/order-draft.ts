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
 * Một dòng trong giỏ.
 *
 * Đặt ở đây chứ không ở `order-context` vì trang thương hiệu cũng ghi dòng này:
 * nút cộng trên W1 và W2 bỏ món vào giỏ trước khi khách bước vào luồng đặt món.
 * Hai nơi cùng ghi vào một chỗ lưu trữ thì phải cùng một hình dạng.
 */
export interface DraftLine {
  dishId: string
  name: string
  price: number
  qty: number
  /** Lời dặn của khách — nút cộng nhanh luôn ghi rỗng */
  note: string
}

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

/**
 * Giỏ đang có gì.
 *
 * Bản nháp hỏng hay trình duyệt chặn lưu trữ đều trả về giỏ rỗng: nút cộng trên
 * trang thương hiệu vẫn bấm được, chỉ là không sống qua lần tải lại trang.
 */
export function readDraftLines(): DraftLine[] {
  try {
    const raw = sessionStorage.getItem(ORDER_STORAGE_KEY)
    const lines = raw ? (JSON.parse(raw) as { lines?: DraftLine[] }).lines : null
    return Array.isArray(lines) ? lines : []
  } catch {
    return []
  }
}

/** Ghi lại giỏ, giữ nguyên mọi lựa chọn khác đang có trong bản nháp */
export function writeDraftLines(lines: DraftLine[]): void {
  try {
    const raw = sessionStorage.getItem(ORDER_STORAGE_KEY)
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify({ ...current, lines }))
  } catch {
    // như trên
  }
}
