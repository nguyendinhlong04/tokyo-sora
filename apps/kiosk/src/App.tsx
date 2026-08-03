import { ApiError, clearDevice, getDeviceToken, watchConnectivity } from '@sora/core'
import { PinPad, ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { api, type PunchResult, type StaffOption } from './api'
import { Greeting } from './screens/Greeting'
import { Pair } from './screens/Pair'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 60_000 } },
})

/**
 * H10 — Kiosk chấm công.
 *
 * Máy gắn cứng ở chi nhánh, chạy toàn màn, không có ai đăng nhập thường trực:
 * mỗi lượt chấm là một phiên sống đúng vài giây rồi tự đóng. Vì vậy màn này KHÔNG
 * giữ phiên nhân viên — bỏ quên một phiên trên cái tablet ai đi qua cũng chạm
 * được là bỏ quên đúng thứ mà PIN sinh ra để chặn.
 *
 * Chi nhánh lấy từ THIẾT BỊ đã ghép, không có ô chọn: "thiết bị gắn chi nhánh —
 * không chấm từ ngoài" (§26 H10).
 */
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
  return paired ? (
    <Board onUnpair={() => setPaired(false)} />
  ) : (
    <Pair onPaired={() => setPaired(true)} />
  )
}

/** Người chọn tên rồi bỏ đi thì màn tự về lưới — tên người khác không nằm chờ sẵn */
const IDLE_RESET_MS = 20_000
/** Màn chào đứng đủ lâu để đọc xong, rồi tự nhường chỗ cho người tiếp theo */
const GREETING_MS = 6_000

function Board({ onUnpair }: { onUnpair: () => void }) {
  const device = useQuery({ queryKey: ['device'], queryFn: api.me })
  const branchId = device.data?.branchId ?? null

  const people = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api.staffList(branchId!),
    enabled: Boolean(branchId),
    // Người mới vào làm phải hiện ra mà không cần ai khởi động lại cái tablet
    refetchInterval: 5 * 60_000,
  })

  const [picked, setPicked] = useState<StaffOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PunchResult | null>(null)

  const reset = useCallback(() => {
    setPicked(null)
    setError(null)
  }, [])

  // Bỏ dở giữa chừng thì màn tự dọn
  useEffect(() => {
    if (!picked || busy) return
    const timer = setTimeout(reset, IDLE_RESET_MS)
    return () => clearTimeout(timer)
  }, [picked, busy, reset])

  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), GREETING_MS)
    return () => clearTimeout(timer)
  }, [result])

  const submit = async (pin: string) => {
    if (!picked || !branchId) return
    setBusy(true)
    setError(null)
    try {
      await api.login({ branchId, staffId: picked.id, pin })
      try {
        setResult(await api.punch())
        reset()
      } finally {
        // Chấm xong là phiên đóng ngay, kể cả khi lượt chấm bị từ chối. Cái tablet
        // này đứng ở lối vào, không phải máy của ai.
        await api.logout().catch(() => undefined)
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.isOffline
            ? 'Mất mạng — gọi quản lý, đừng bỏ ca chưa chấm'
            : err.message
          : 'Không chấm được',
      )
    } finally {
      setBusy(false)
    }
  }

  if (result) return <Greeting result={result} onDone={() => setResult(null)} />

  return (
    <main className="flex h-dvh flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between px-8 py-5">
        <div className="flex items-baseline gap-3">
          <span className="font-jp text-[length:var(--fs-t1)] text-accent-ink">空</span>
          <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Chấm công</span>
          <span className="text-[length:var(--fs-b2)] text-ink-mute">
            {device.isError ? 'Máy chưa nối được máy chủ' : (branchId ?? '')}
          </span>
        </div>
        <WallClock />
      </header>

      <div className="flex min-h-0 flex-1 items-start justify-center px-8 pb-8">
        {!picked ? (
          <div className="flex w-full max-w-5xl flex-col gap-5">
            <p className="text-center text-[length:var(--fs-b1)] text-ink-mute">
              Chạm vào tên của bạn
            </p>
            {people.isPending ? (
              <p className="text-center text-ink-mute">Đang tải danh sách…</p>
            ) : people.isError ? (
              <p className="text-center text-danger">
                Không tải được danh sách. Kiểm tra máy đã ghép với chi nhánh chưa.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-4 md:grid-cols-4">
                {people.data?.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => setPicked(person)}
                    className="flex min-h-[96px] items-center justify-center rounded-md border border-line-2 bg-surface-3 px-3 text-center text-[length:var(--fs-t2)] font-semibold text-ink-hi active:bg-surface-4"
                  >
                    {person.fullName}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <p className="text-[length:var(--fs-t1)] text-ink-hi">
              Chào <span className="font-semibold">{picked.fullName}</span> — nhập PIN
            </p>
            <PinPad onComplete={submit} disabled={busy} error={error} />
            <button
              type="button"
              onClick={reset}
              className="h-[var(--hit-target)] px-4 text-[length:var(--fs-b1)] text-ink-mute"
            >
              Không phải tôi
            </button>
          </div>
        )}
      </div>

      {/* Ngắt ghép nằm ở góc, chữ nhỏ: việc của người lắp máy, không phải của ca làm */}
      <footer className="flex shrink-0 justify-end px-8 pb-4">
        <button
          type="button"
          onClick={() => {
            clearDevice()
            onUnpair()
          }}
          className="text-[length:var(--fs-c2)] text-ink-mute"
        >
          Ngắt ghép máy
        </button>
      </footer>
    </main>
  )
}

/** Đồng hồ treo tường — người ta nhìn nó để biết mình có muộn không */
function WallClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <span className="font-mono text-[length:var(--fs-d3)] tabular-nums text-ink-hi">
      {now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}
