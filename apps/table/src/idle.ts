import { useEffect, useRef } from 'react'

/**
 * Gọi `onIdle` khi không ai chạm iPad trong `ms` — `null` là tạm thôi đếm.
 *
 * Nghe chạm và phím ở pha bắt (capture) của cả cửa sổ: hộp thoại nào chặn sự kiện
 * lan lên thì lần chạm vào nó vẫn được tính là có người.
 */
export function useIdleTimer(ms: number | null, onIdle: () => void) {
  const latest = useRef(onIdle)
  useEffect(() => {
    latest.current = onIdle
  })

  useEffect(() => {
    if (ms === null) return
    let timer = setTimeout(() => latest.current(), ms)
    const wake = () => {
      clearTimeout(timer)
      timer = setTimeout(() => latest.current(), ms)
    }
    window.addEventListener('pointerdown', wake, true)
    window.addEventListener('keydown', wake, true)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', wake, true)
      window.removeEventListener('keydown', wake, true)
    }
  }, [ms])
}
