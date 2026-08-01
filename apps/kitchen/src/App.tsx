import { calibrate, clearDevice, getDeviceToken, watchConnectivity } from '@sora/core'
import { Button, OutboxBanner, ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from './api'
import { usePwaUpdate } from './pwa'
import { DishTotals } from './screens/DishTotals'
import { Expo } from './screens/Expo'
import { Holding } from './screens/Holding'
import { Pair } from './screens/Pair'
import { SoldOut } from './screens/SoldOut'
import { TicketQueue } from './screens/TicketQueue'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: true } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </QueryClientProvider>
  )
}

function Root() {
  const [paired, setPaired] = useState(() => Boolean(getDeviceToken()))
  useEffect(() => watchConnectivity(), [])
  return paired ? <Shell onUnpair={() => setPaired(false)} /> : <Pair onPaired={() => setPaired(true)} />
}

type ScreenId = 'queue' | 'totals' | 'holding' | 'soldout' | 'expo'

const SCREENS: { id: ScreenId; label: string; code: string }[] = [
  { id: 'queue', label: 'Hàng vé', code: 'K2' },
  { id: 'totals', label: 'Tổng món', code: 'K3' },
  { id: 'holding', label: 'Chờ ra', code: 'K4' },
  { id: 'soldout', label: 'Hết món', code: 'K5' },
  { id: 'expo', label: 'Expo', code: 'K6' },
]

function Shell({ onUnpair }: { onUnpair: () => void }) {
  const [screen, setScreen] = useState<ScreenId>('queue')

  const queue = useQuery({
    queryKey: ['queue'],
    queryFn: api.queue,
    // Realtime của Supabase là đường chính; hỏi lại 5 giây là lưới an toàn cho
    // trường hợp WebSocket rớt mà chưa kịp nối lại.
    refetchInterval: 5_000,
  })

  // Hiệu chỉnh đồng hồ theo giờ SERVER mỗi lần có dữ liệu mới
  useEffect(() => {
    if (queue.data?.serverTime) calibrate(queue.data.serverTime)
  }, [queue.data?.serverTime])

  // Đồng hồ đếm phải nhích mỗi giây dù dữ liệu chưa đổi
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useScreenWakeLock()

  const waitingCount = (queue.data?.tickets ?? []).filter((t) => t.state === 'waiting').length
  const liveCount = (queue.data?.tickets ?? []).filter((t) => t.state !== 'waiting').length

  // Bản mới chỉ được áp dụng khi màn không còn vé nào đang chạy
  const { needRefresh } = usePwaUpdate(liveCount === 0)

  return (
    <main className="flex h-dvh flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center justify-between gap-6 border-b border-line-1 px-6">
        <div className="flex items-baseline gap-3">
          <span className="font-jp text-[length:var(--fs-t1)] text-accent-ink">
            {queue.data?.station.kanji ?? '焼'}
          </span>
          <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
            {queue.data?.station.name ?? 'Màn bếp'}
          </span>
          <span className="text-[length:var(--fs-b2)] text-ink-mute">
            {liveCount} vé đang chạy
            {waitingCount > 0 ? ` · ${waitingCount} chờ ra` : ''}
          </span>
        </div>

        <nav className="flex gap-1">
          {SCREENS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScreen(item.id)}
              className={[
                'flex h-[var(--hit-target)] items-center gap-2 rounded-sm px-4 text-[length:var(--fs-b1)]',
                screen === item.id
                  ? 'bg-surface-3 text-ink-hi'
                  : 'text-ink-mute hover:bg-surface-2',
              ].join(' ')}
            >
              <span className="font-mono text-[length:var(--fs-c2)] text-ink-mute">{item.code}</span>
              {item.label}
              {item.id === 'holding' && waitingCount > 0 ? (
                <span className="rounded-pill bg-warn px-2 font-mono text-[length:var(--fs-c2)] text-canvas">
                  {waitingCount}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {needRefresh ? (
            <span className="rounded-sm border border-line-3 px-3 py-1.5 text-[length:var(--fs-b2)] text-ink-mute">
              Có bản mới — cập nhật khi hết vé
            </span>
          ) : null}
          <OutboxBanner />
          <Button
            variant="ghost"
            onClick={() => {
              clearDevice()
              onUnpair()
            }}
          >
            Ngắt ghép
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden p-4">
        {queue.isError && screen === 'queue' ? (
          <p className="text-warn">
            Không nối được máy chủ. Vé đã hiện vẫn giữ nguyên, máy sẽ tự nối lại.
          </p>
        ) : null}

        {screen === 'queue' ? <TicketQueue queue={queue.data} loading={queue.isPending} /> : null}
        {screen === 'totals' ? <DishTotals queue={queue.data} /> : null}
        {screen === 'holding' ? <Holding queue={queue.data} /> : null}
        {screen === 'soldout' ? <SoldOut /> : null}
        {screen === 'expo' ? <Expo /> : null}
      </div>
    </main>
  )
}

/** Màn bếp không được tắt màn giữa ca */
function useScreenWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen')
      } catch {
        // Trình duyệt từ chối (thường vì tab đang ẩn) — thử lại khi hiện lại
      }
    }
    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
}
