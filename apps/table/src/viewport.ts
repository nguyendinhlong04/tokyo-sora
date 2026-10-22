import { useEffect, useState } from 'react'

export interface VisualViewport {
  /** Chiều cao phần màn còn thấy được — trừ bàn phím ảo */
  height: number
  /** Safari đẩy khung nhìn lên khi bàn phím mở — phần bị đẩy */
  offsetTop: number
  /** Bàn phím ảo đang che một phần màn */
  keyboard: boolean
}

const read = (): VisualViewport => {
  const vv = typeof window === 'undefined' ? null : window.visualViewport
  const full = typeof window === 'undefined' ? 0 : window.innerHeight
  const height = vv?.height ?? full
  return { height, offsetTop: vv?.offsetTop ?? 0, keyboard: height < full * 0.8 }
}

/**
 * Phần màn thật sự còn thấy khi bàn phím ảo mở (iPad, Safari 18).
 *
 * `position: fixed` neo theo khung bố cục chứ không theo phần còn thấy: bàn phím
 * mở là nửa dưới hộp thoại — nút Lưu ở đáy — nằm sau bàn phím. Hộp thoại đọc số
 * này để bám mép trên và co chiều cao lại.
 */
export function useVisualViewport(): VisualViewport {
  const [state, setState] = useState(read)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setState(read())
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return state
}
