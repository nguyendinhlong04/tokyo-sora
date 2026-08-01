import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Đăng ký service worker NGAY KHI NẠP MODULE, không đợi component nào render.
 *
 * Lý do: nếu đăng ký nằm trong khung sau khi ghép thiết bị thì màn bếp mới tinh sẽ
 * không cache gì — mà màn chưa ghép chính là màn cần cache nhất, vì nó sắp được
 * treo lên tường và chạy suốt ca.
 *
 * Bản mới được tự áp dụng khi hàng vé RỖNG: màn treo tường không có ai bấm nút,
 * nhưng tải lại giữa lúc đang có vé thì đầu bếp mất chỗ đang nhìn. Bếp lúc nào
 * cũng có khoảng trống giữa hai lượt khách nên bản mới không phải chờ lâu.
 */
let needRefresh = false
const listeners = new Set<(value: boolean) => void>()

const updateSW = registerSW({
  onNeedRefresh() {
    needRefresh = true
    for (const listener of listeners) listener(true)
  },
})

export function usePwaUpdate(safeToReload: boolean) {
  const [value, setValue] = useState(needRefresh)

  useEffect(() => {
    listeners.add(setValue)
    setValue(needRefresh)
    return () => {
      listeners.delete(setValue)
    }
  }, [])

  useEffect(() => {
    if (!value || !safeToReload) return
    // Chờ một nhịp để chắc chắn màn thật sự rảnh chứ không phải vừa xong vé cuối
    const timer = setTimeout(() => void updateSW(true), 3000)
    return () => clearTimeout(timer)
  }, [value, safeToReload])

  return { needRefresh: value }
}
