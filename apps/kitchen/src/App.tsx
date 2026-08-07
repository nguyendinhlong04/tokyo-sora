import { ApiError, calibrate, clearDevice, getDeviceToken, watchConnectivity } from '@sora/core'
import { Button, ToastProvider } from '@sora/ui'
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
  defaultOptions: {
    queries: {
      /**
       * Chỉ thử lại lỗi MẠNG và lỗi phía máy chủ.
       *
       * Lỗi 4xx là máy chủ đã hiểu và từ chối — "màn này chưa ghim vào trạm nào"
       * hay "thiết bị đã bị thu hồi" thì thử lại một nghìn lần cũng vậy. Thử lại
       * chỉ kéo dài quãng màn hình đứng ở chữ "Đang tải hàng vé…", đúng lúc đầu
       * bếp cần biết vì sao vé không hiện.
       */
      retry: (soLan, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false
        return soLan < 2
      },
      refetchOnWindowFocus: true,
    },
  },
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
  /**
   * K4 Chờ ra TẠM ẨN — không xoá.
   *
   * Chưa màn nào cho chọn đợt lúc gọi món nên mọi món đều vào đợt 1 và xuống bếp
   * ngay: khối "Đợt sau" gần như luôn rỗng. Còn vé hẹn giờ thì tới mốc là máy tự
   * đẩy sang K2, bếp không phải mở tab này mới được nấu. Một tab trống quanh năm
   * chỉ tổ chiếm chỗ trên thanh điều hướng.
   *
   * Bật lại: bỏ chú thích dòng dưới. Màn `Holding`, chip cam đếm vé và số "N chờ
   * ra" ở đầu màn vẫn còn nguyên, không phải dựng lại gì.
   */
  // { id: 'holding', label: 'Chờ ra', code: 'K4' },
  { id: 'soldout', label: 'Hết món', code: 'K5' },
  // Nhãn là "Ra món" chứ không phải "Expo": không ai trong bếp hiểu chữ Expo.
  // Tên trong code giữ nguyên `expo` — nó còn là tên đường dẫn API và phòng
  // realtime, đổi theo chỉ tổ rước rủi ro mà nhân viên chẳng thấy khác gì.
  { id: 'expo', label: 'Ra món', code: 'K6' },
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

  // Chỉ còn nuôi chip cam trên tab K4 — tab đang ẩn nên số này không hiện ở đâu.
  // Giữ lại để bật lại K4 là xong, không phải dựng lại phép đếm.
  const waitingCount = (queue.data?.tickets ?? []).filter((t) => t.state === 'waiting').length
  // Vé `ready` còn nằm trên màn cho tới hết cửa sổ hoàn tác, nhưng nó KHÔNG còn
  // là việc đang chạy: đếm nó vào đây là vừa sai nhãn ở đầu màn, vừa hoãn bản
  // PWA mới thêm một cửa sổ nữa mỗi lần bếp bấm Xong.
  const liveCount = (queue.data?.tickets ?? []).filter(
    (t) => t.state === 'queued' || t.state === 'cooking',
  ).length

  // Bản mới chỉ được áp dụng khi màn không còn vé nào đang chạy
  const { needRefresh } = usePwaUpdate(liveCount === 0)

  return (
    <main className="flex h-dvh flex-col bg-canvas">
      {/*
        Lỗi tải hàng vé PHẢI hiện ra.
        Trước đây `queue.error` không được dùng ở đâu cả: mọi thất bại — màn chưa
        ghim trạm, thiết bị bị thu hồi từ xa, máy chủ chết — đều rơi xuống thành
        "Chưa có vé nào. Vé mới sẽ tự hiện ở đây." Bếp nhìn một màn hình trống
        trông y hệt lúc vắng khách, trong khi vé vẫn đang dồn ở dưới bàn.
      */}
      {queue.isError ? (
        <div className="shrink-0 bg-danger px-6 py-3 text-[length:var(--fs-t2)] font-semibold text-canvas">
          Không tải được hàng vé: {(queue.error as Error).message}
        </div>
      ) : null}

      <header className="flex h-16 shrink-0 items-center justify-between gap-6 border-b border-line-1 px-6">
        <div className="flex items-baseline gap-3">
          <span className="font-jp text-[length:var(--fs-t1)] text-accent-ink">
            {queue.data?.station.kanji ?? '焼'}
          </span>
          <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
            {queue.data?.station.name ?? 'Màn bếp'}
          </span>
          <span className="text-[length:var(--fs-b2)] text-ink-mute">{liveCount} vé đang chạy</span>
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
          <ZoomControl />
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

      {/*
        Khung phải là FLEX CONTAINER, không phải block.
        K3–K6 đều tự khai `overflow-y-auto`, nhưng thanh cuộn chỉ mọc ra khi phần
        tử bị chặn chiều cao. Là block thì chúng cao theo nội dung, tràn khỏi
        khung và bị `overflow-hidden` cắt đứt — phần dưới đáy màn MẤT HẲN chứ
        không phải chờ cuộn tới. Màn TV cao thì ít lộ, laptop thì lộ ngay.
      */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        {queue.isError && screen === 'queue' ? (
          <p className="shrink-0 text-warn">
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

/**
 * Chỉnh cỡ chữ của riêng màn này.
 *
 * Thang chữ tự hạ theo chiều cao màn (xem tokens.css), nhưng đó vẫn là phỏng
 * đoán: cùng một quán có TV treo tường nhìn từ ba mét và laptop đặt trước mặt,
 * và không cỡ nào đúng cho cả hai. Nấc chỉnh nhớ theo THIẾT BỊ nên mỗi màn giữ
 * cỡ của nó, không phải chỉnh lại mỗi ca.
 */
const ZOOM_KEY = 'sora.kds.zoom'
const ZOOM_STEPS = [0.7, 0.8, 0.9, 1, 1.15]

function useKdsZoom() {
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(ZOOM_KEY))
    return ZOOM_STEPS.includes(saved) ? saved : 1
  })

  useEffect(() => {
    document.documentElement.style.setProperty('--kds-zoom', String(zoom))
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      // Trình duyệt chặn lưu trữ — cỡ vẫn áp cho phiên này
    }
  }, [zoom])

  const at = ZOOM_STEPS.indexOf(zoom)
  return {
    zoom,
    canShrink: at > 0,
    canGrow: at < ZOOM_STEPS.length - 1,
    step: (dir: -1 | 1) => setZoom((current) => {
      const next = ZOOM_STEPS.indexOf(current) + dir
      return ZOOM_STEPS[next] ?? current
    }),
  }
}

function ZoomControl() {
  const { zoom, canShrink, canGrow, step } = useKdsZoom()

  // Kích thước CỐ ĐỊNH, không đi theo `--hit-target`: hạ cỡ xuống nấc nhỏ nhất
  // mà chính hai nút này cũng teo lại thì không còn gì để bấm quay lại.
  const button =
    'h-9 w-9 rounded-sm border border-line-3 text-[16px] text-ink-mute disabled:opacity-35'

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Giảm cỡ chữ"
        disabled={!canShrink}
        onClick={() => step(-1)}
        className={button}
      >
        A−
      </button>
      <span className="w-10 text-center font-mono text-[13px] text-ink-mute tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        aria-label="Tăng cỡ chữ"
        disabled={!canGrow}
        onClick={() => step(1)}
        className={button}
      >
        A+
      </button>
    </div>
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
