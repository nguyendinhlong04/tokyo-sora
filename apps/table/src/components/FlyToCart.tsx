import { useCallback, useEffect, useRef, useState } from 'react'

interface Flight {
  id: number
  x: number
  y: number
  dx: number
  dy: number
  label: string
  go: boolean
}

/** Bấm liên tiếp cùng một món trong khoảng này thì nhãn cộng dồn: +1, +2, +3… */
const BURST_MS = 1500
const FLIGHT_MS = 560

/**
 * Nhãn "+N" bay từ nút vừa bấm vào số phần ở đầu cột giỏ, rồi số đó nảy lên.
 *
 * Trên iPad giỏ nằm ở cột bên phải, cách nút + cả nửa màn hình — thêm món mà
 * không có gì chuyển động thì khách không biết món đã vào chưa và bấm thêm lần
 * nữa. Bấm dồn cùng một món thì nhãn cộng dồn chứ không bay ba nhãn chồng nhau:
 * khách đếm được mình vừa thêm mấy phần.
 *
 * Người tắt hiệu ứng chuyển động (prefers-reduced-motion) thì bỏ phần bay, chỉ
 * còn cái nảy của con số.
 */
export function useFlyToCart() {
  const target = useRef<HTMLSpanElement>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  /** Đếm lên mỗi lần một món hạ cánh — cột giỏ nhìn số này để nảy */
  const [landed, setLanded] = useState(0)
  const burst = useRef<{ dishId: string; n: number; at: number } | null>(null)
  const seq = useRef(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  const fly = useCallback((from: HTMLElement | null, dishId: string, qty: number) => {
    const now = Date.now()
    const last = burst.current
    const n = last && last.dishId === dishId && now - last.at < BURST_MS ? last.n + qty : qty
    burst.current = { dishId, n, at: now }

    const to = target.current?.getBoundingClientRect()
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!from || !to || still) {
      setLanded((c) => c + 1)
      return
    }

    const r = from.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const id = ++seq.current
    setFlight({
      id,
      x,
      y,
      dx: to.left + to.width / 2 - x,
      dy: to.top + to.height / 2 - y,
      label: `+${n}`,
      go: false,
    })
    // Hai nhịp khung hình: nhịp đầu vẽ nhãn tại chỗ bấm, nhịp sau mới cho bay —
    // gộp làm một thì trình duyệt bỏ qua điểm xuất phát và nhãn hiện ngay ở đích.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setFlight((f) => (f?.id === id ? { ...f, go: true } : f))),
    )
    timers.current.push(
      window.setTimeout(() => {
        setFlight((f) => (f?.id === id ? null : f))
        setLanded((c) => c + 1)
      }, FLIGHT_MS + 40),
    )
  }, [])

  const node = flight ? (
    <span
      aria-hidden
      className="pointer-events-none fixed z-[120] flex h-7 items-center rounded-sm bg-accent px-2.5 font-mono text-[length:var(--fs-b2)] font-medium whitespace-nowrap text-on-accent"
      style={{
        left: flight.x,
        top: flight.y,
        opacity: flight.go ? 0.25 : 1,
        transform: flight.go
          ? `translate(calc(-50% + ${flight.dx}px), calc(-50% + ${flight.dy}px)) scale(0.7)`
          : 'translate(-50%, -50%)',
        transition: `transform ${FLIGHT_MS}ms var(--ease-sora), opacity ${FLIGHT_MS}ms var(--ease-sora)`,
      }}
    >
      {flight.label}
    </span>
  ) : null

  return { target, fly, landed, node }
}
