import {
  calibrate,
  clearDevice,
  elapsedSeconds,
  getDeviceToken,
  setDeviceInfo,
  setDeviceToken,
  watchConnectivity,
} from '@sora/core'
import { Button, Card, EmptyState, OrderTicket, ToastProvider, useToast } from '@sora/ui'
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type Ticket } from './api'

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
  return paired ? <TicketQueue onUnpair={() => setPaired(false)} /> : <PairScreen onPaired={() => setPaired(true)} />
}

/**
 * K1 Ghép thiết bị.
 *
 * Màn bếp treo trên tường, không có bàn phím — nhập mã 6 số bằng lưới phím to.
 * Ghép xong thì màn này không hiện lại nữa, kể cả sau khi mất điện bật lại.
 */
function PairScreen({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.pair(value, 'Màn bếp')
      setDeviceToken(result.token)
      const me = await api.me()
      setDeviceInfo({
        deviceId: result.deviceId,
        branchId: me.branchId,
        kind: 'kds',
        stationId: me.stationId,
        name: 'Màn bếp',
      })
      onPaired()
    } catch {
      setError('Mã không đúng hoặc đã hết hạn')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const press = (digit: string) => {
    const next = code + digit
    setCode(next)
    if (next.length === 6) void submit(next)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-10">
      <Card className="flex flex-col items-center gap-8 p-10">
        <div className="flex flex-col items-center gap-1">
          <span className="font-jp text-[length:var(--fs-d3)] text-accent-ink">焼</span>
          <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Ghép màn bếp</h1>
          <p className="text-[length:var(--fs-b2)] text-ink-mute">
            Nhập mã 6 số do quản lý cấp
          </p>
        </div>

        <div className="flex gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className="flex h-16 w-12 items-center justify-center rounded-md border border-line-3 bg-surface-3 font-mono text-[length:var(--fs-d3)] text-ink-hi"
            >
              {code[i] ?? ''}
            </span>
          ))}
        </div>

        {error ? <p className="text-danger">{error}</p> : null}

        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              disabled={busy}
              onClick={() => press(d)}
              className="h-24 w-24 rounded-md border border-line-2 bg-surface-3 font-mono text-[length:var(--fs-d3)] text-ink-hi active:bg-surface-4"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCode('')}
            className="h-24 w-24 rounded-md border border-line-2 text-ink-mute"
          >
            Xoá
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => press('0')}
            className="h-24 w-24 rounded-md border border-line-2 bg-surface-3 font-mono text-[length:var(--fs-d3)] text-ink-hi active:bg-surface-4"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setCode((c) => c.slice(0, -1))}
            className="h-24 w-24 rounded-md border border-line-2 text-ink-mute"
          >
            ←
          </button>
        </div>
      </Card>
    </main>
  )
}

/**
 * K2 Hàng vé.
 *
 * Không cuộn: lưới cố định theo số cột của trạm, quá số ô thì hiện "còn N đơn".
 * Bếp không rảnh tay để cuộn, và vé trôi khỏi màn là vé bị quên.
 */
function TicketQueue({ onUnpair }: { onUnpair: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [, setTick] = useState(0)

  const queue = useQuery({
    queryKey: ['queue'],
    queryFn: api.queue,
    // Realtime của Supabase là đường chính; hỏi lại 5 giây là lưới an toàn cho
    // trường hợp WebSocket rớt mà chưa kịp nối lại.
    refetchInterval: 5_000,
  })

  // Đồng hồ đếm chạy mỗi giây; hiệu chỉnh theo giờ SERVER mỗi lần có dữ liệu mới
  useEffect(() => {
    if (queue.data?.serverTime) calibrate(queue.data.serverTime)
  }, [queue.data?.serverTime])

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // Màn bếp không được tắt màn giữa ca
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen')
      } catch {
        // Trình duyệt từ chối (thường vì tab ẩn) — thử lại khi hiện lại
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

  const setState = useMutation({
    mutationFn: ({ ticket, action }: { ticket: Ticket; action: 'start' | 'done' }) =>
      api.setState(ticket.id, action, `${action === 'start' ? 'Bắt đầu' : 'Xong'} ${ticket.displayCode}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['queue'] }),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const tickets = queue.data?.tickets ?? []
  const live = tickets.filter((t) => t.state !== 'waiting')
  const waiting = tickets.filter((t) => t.state === 'waiting')

  // Quá giờ nhảy lên đầu — vé trễ phải đập vào mắt trước
  const sorted = [...live].sort((a, b) => {
    const ratioOf = (t: Ticket) =>
      t.prepSeconds > 0 ? elapsedSeconds(t.queuedAt) / t.prepSeconds : 0
    return ratioOf(b) - ratioOf(a)
  })

  // Lưới cố định theo số cột của TRẠM (§22): ST-02 sáu cột vé thấp, ST-06 bốn cột
  // vé cao. Hai hàng là vừa tầm mắt trên TV treo tường.
  const columns = queue.data?.station.columns ?? 4
  const shown = sorted.slice(0, columns * 2)
  const overflow = sorted.length - shown.length

  return (
    <main className="flex h-dvh flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line-1 px-6">
        <div className="flex items-baseline gap-3">
          <span className="font-jp text-[length:var(--fs-t1)] text-accent-ink">
            {queue.data?.station.kanji ?? '焼'}
          </span>
          <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
            {queue.data?.station.name ?? 'Hàng vé'}
          </span>
          <span className="text-[length:var(--fs-b2)] text-ink-mute">
            {live.length} vé đang chạy
            {waiting.length > 0 ? ` · ${waiting.length} chờ ra` : ''}
          </span>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            clearDevice()
            onUnpair()
          }}
        >
          Ngắt ghép
        </Button>
      </header>

      <div className="flex-1 overflow-hidden p-4">
        {queue.isPending ? (
          <p className="text-ink-mute">Đang tải hàng vé…</p>
        ) : queue.isError ? (
          <EmptyState
            title="Không nối được máy chủ. Vé đã hiện vẫn giữ nguyên, sẽ tự nối lại."
          />
        ) : shown.length === 0 ? (
          <EmptyState title="Chưa có vé nào. Vé mới sẽ tự hiện ở đây." />
        ) : (
          <div
            className="grid content-start gap-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {shown.map((ticket) => (
              <OrderTicket
                key={ticket.id}
                displayCode={ticket.displayCode}
                tableCode={ticket.tableCode}
                batchNo={ticket.batchNo}
                state={ticket.state}
                elapsedSeconds={elapsedSeconds(ticket.queuedAt)}
                prepSeconds={ticket.prepSeconds}
                grillServiceNote={ticket.grillServiceNote}
                showGrams={ticket.stationId === 'ST-02'}
                items={ticket.items.map((i) => ({
                  id: i.id,
                  name: i.nameSnapshot,
                  qty: i.qty,
                  note: i.note,
                  setLabel: i.setLabel,
                  componentLabel: i.componentLabel,
                  portionLabel: i.portionLabel,
                  weightGrams: i.weightGrams,
                }))}
                onStart={() => setState.mutate({ ticket, action: 'start' })}
                onDone={() => setState.mutate({ ticket, action: 'done' })}
              />
            ))}
          </div>
        )}
      </div>

      {overflow > 0 ? (
        <footer className="shrink-0 border-t border-line-1 px-6 py-3 text-[length:var(--fs-t2)] text-warn">
          Còn {overflow} vé nữa
        </footer>
      ) : null}
    </main>
  )
}
