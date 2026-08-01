import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Đăng ký service worker NGAY KHI NẠP MODULE, không đợi component nào render.
 *
 * Lý do: nếu đăng ký nằm trong khung đã đăng nhập thì máy mới tinh — chưa ai đăng
 * nhập lần nào — sẽ không cache gì cả, tức là đúng lúc cần nhất thì không có. Máy
 * POS phải khởi động được khi mất mạng kể cả ở lần bật đầu tiên sau khi cài.
 *
 * KHÔNG tự tải lại khi có bản mới: thu ngân có thể đang dựng phiếu order dở dang
 * trong bộ nhớ, reload là mất sạch. Bản đang chạy vẫn hoạt động bình thường trong
 * lúc chờ — service worker mới nằm im ở trạng thái waiting cho tới khi được gọi.
 */
let needRefresh = false
let applyUpdate: (() => void) | null = null
const listeners = new Set<(value: boolean) => void>()

const updateSW = registerSW({
  onNeedRefresh() {
    needRefresh = true
    for (const listener of listeners) listener(true)
  },
})

applyUpdate = () => void updateSW(true)

export function usePwaUpdate() {
  const [value, setValue] = useState(needRefresh)

  useEffect(() => {
    listeners.add(setValue)
    setValue(needRefresh)
    return () => {
      listeners.delete(setValue)
    }
  }, [])

  return { needRefresh: value, applyUpdate: () => applyUpdate?.() }
}
