import { useSyncExternalStore } from 'react'

/**
 * Ngưỡng chuyển sang bố cục iPad (§9.1).
 *
 * Chọn theo BỀ RỘNG, không theo user agent: Safari trên iPadOS tự xưng là máy
 * Mac, đoán thiết bị qua chuỗi đó là đoán sai. 900px nằm giữa iPad 10,2″ dựng
 * dọc (810) và nằm ngang (1080) — chỉ khổ ngang mới đủ chỗ cho cột nhóm, lưới ba
 * cột và cột giỏ. iPad dựng dọc và điện thoại dùng bố cục một cột như cũ; trên
 * bàn thì Guided Access đã khoá hướng xoay nên máy luôn ở khổ ngang.
 */
const QUERY = '(min-width: 900px)'

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

export function useTabletLayout(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
}
