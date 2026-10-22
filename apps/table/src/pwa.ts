import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker của iPad tại bàn — đăng ký NGAY KHI NẠP MODULE, như màn bếp: iPad
 * vừa lắp, chưa ghép, chính là máy cần có vỏ app trong bộ đệm nhất.
 *
 * Bản mới tải sẵn ở nền nhưng chỉ ÁP — tải lại trang — khi iPad đang ở màn chờ
 * quảng cáo (§9.1): tải lại giữa bữa là mất giỏ đang chọn dở và màn khách đang xem.
 */
let ready = false
let registration: ServiceWorkerRegistration | undefined
const listeners = new Set<() => void>()

let reloading = false
const reload = () => {
  if (reloading) return
  reloading = true
  window.location.reload()
}

const updateSW = registerSW({
  onNeedRefresh() {
    ready = true
    for (const listener of listeners) listener()
  },
  onNeedReload: reload,
  onRegisteredSW(_url, reg) {
    registration = reg
  },
})

/**
 * Áp bản đang chờ rồi tải lại khi nó nhận trang.
 *
 * Tự nghe `controllerchange` chứ không trông vào workbox-window: nó chỉ tải lại khi
 * lúc đăng ký trang ĐÃ có service worker điều khiển. Trang mở lần đầu trên máy — đúng
 * iPad vừa lắp, rồi đứng nguyên trang đó nhiều ngày — thì bản mới vẫn được kích hoạt
 * nhưng trang không tải lại, và iPad chạy code cũ dưới service worker mới.
 */
function applyUpdate() {
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true })
  void updateSW(true)
}

/**
 * Dùng ở màn chờ: có bản mới đang đợi thì áp ngay, và hỏi máy chủ định kỳ.
 *
 * iPad đứng một trang cả ngày, không bao giờ điều hướng, nên trình duyệt hầu như
 * không tự hỏi bản mới — màn bếp đang dính đúng chuyện này (§9.4). Phải tự hỏi.
 */
export function useApplyUpdateWhenIdle(intervalMs: number) {
  useEffect(() => {
    if (ready) applyUpdate()
    listeners.add(applyUpdate)
    const check = () => void registration?.update().catch(() => undefined)
    check()
    const timer = setInterval(check, intervalMs)
    return () => {
      listeners.delete(applyUpdate)
      clearInterval(timer)
    }
  }, [intervalMs])
}

/** Trang đã nằm dưới service worker chưa — chưa thì ảnh tải sẵn không vào bộ đệm của nó */
export function useServiceWorkerControlled(): boolean {
  const supported = 'serviceWorker' in navigator
  const [controlled, setControlled] = useState(
    () => supported && navigator.serviceWorker.controller !== null,
  )
  useEffect(() => {
    if (!supported) return
    const update = () => setControlled(navigator.serviceWorker.controller !== null)
    navigator.serviceWorker.addEventListener('controllerchange', update)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', update)
  }, [supported])
  return controlled
}
