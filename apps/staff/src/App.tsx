import { ApiError } from '@sora/core'
import { Button, PinPad, ToastProvider } from '@sora/ui'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router'
import { api, clearChannelLink, getChannelLink, setChannelLink } from './api'
import { Payslips } from './routes/Payslips'
import { Schedule } from './routes/Schedule'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Chưa đăng nhập thì 401 là câu trả lời, không phải sự cố — đừng thử lại
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  },
})

/**
 * H8 · H9 — Kênh nhân viên.
 *
 * Nền tối, một cột, mọi thứ trong tầm ngón cái: đây là màn xem trên điện thoại
 * riêng giữa lúc đứng chờ xe, không phải màn làm việc.
 *
 * Cửa vào hai bước, cố ý giống luồng POS: LINK cá nhân đóng vai thiết bị đã ghép
 * (thứ bạn có), PIN là thứ bạn biết. Link nằm trong máy sau lần đầu bấm vào, nên
 * lần sau chỉ còn PIN — nhưng quản lý cấp lại link là bản trong máy chết ngay.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/nv/:token" element={<LinkEntry />} />
            <Route element={<Shell />}>
              <Route path="/" element={<Schedule />} />
              <Route path="/phieu-luong" element={<Payslips />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

/**
 * Cửa vào từ link cá nhân: `/nv/<token>`.
 *
 * Cất token rồi RỜI KHỎI địa chỉ này bằng `replace` — cùng lý do màn quét QR của
 * khách làm vậy: URL bị chụp màn hình, dán vào nhóm chat, hiện lại ở gợi ý gõ
 * địa chỉ. Chỗ cất nó là máy của chính người đó.
 */
function LinkEntry() {
  const { token } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (token) setChannelLink(token)
    void navigate('/', { replace: true })
  }, [token, navigate])

  return <Splash text="Đang mở…" />
}

function Shell() {
  const profile = useQuery({ queryKey: ['me'], queryFn: api.me })
  const queryClient = useQueryClient()

  if (profile.isPending) return <Splash text="Đang mở…" />

  // 401 = chưa có phiên. Có link trong máy thì hỏi PIN, không có thì phải xin link.
  if (profile.isError) {
    const status = profile.error instanceof ApiError ? profile.error.status : 0
    if (status === 401) return <Gate onDone={() => void queryClient.invalidateQueries()} />
    return (
      <Splash
        text={
          profile.error instanceof ApiError && profile.error.isOffline
            ? 'Mất mạng. Mở lại khi có sóng nhé.'
            : (profile.error as Error).message
        }
        action={
          // Không để ai kẹt ở màn báo lỗi: máy đang giữ phiên của người khác, hay
          // hồ sơ vừa bị ngưng, thì vẫn phải có đường vào lại bằng link của mình.
          <Button
            onClick={async () => {
              await api.logout().catch(() => undefined)
              clearChannelLink()
              await queryClient.invalidateQueries()
            }}
          >
            Vào bằng link khác
          </Button>
        }
      />
    )
  }

  const me = profile.data
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-canvas">
      <header className="flex items-center justify-between gap-3 px-5 pt-6 pb-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">{me.fullName}</span>
          <span className="text-[length:var(--fs-c1)] text-ink-mute">
            {me.position} · {me.branchName}
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await api.logout().catch(() => undefined)
            await queryClient.invalidateQueries()
          }}
          className="flex h-[var(--hit-target)] items-center rounded-sm px-3 text-[length:var(--fs-c1)] text-ink-mute"
        >
          Thoát
        </button>
      </header>

      <nav className="flex gap-2 px-5 pb-4">
        <Tab to="/">Lịch &amp; công</Tab>
        <Tab to="/phieu-luong">Phiếu lương</Tab>
      </nav>

      <main className="flex-1 px-5 pb-10">
        <Outlet context={me} />
      </main>
    </div>
  )
}

function Tab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        [
          'flex h-[var(--hit-target)] flex-1 items-center justify-center rounded-sm border text-[length:var(--fs-b2)]',
          isActive
            ? 'border-accent bg-surface-2 text-accent-ink'
            : 'border-line-2 text-ink-mute',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  )
}

/** Nhập PIN. Không có ô chọn người — link đã nói người này là ai. */
function Gate({ onDone }: { onDone: () => void }) {
  const link = getChannelLink()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!link) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-8 text-center">
        <span className="font-jp text-[56px] leading-none text-accent-ink">空</span>
        <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Kênh nhân viên</h1>
        <p className="text-[length:var(--fs-b1)] text-ink-body">
          Mở bằng link cá nhân quản lý gửi cho bạn qua Zalo. Mất link thì xin cấp lại — link cũ
          sẽ ngừng hoạt động ngay khi có link mới.
        </p>
      </main>
    )
  }

  const submit = async (pin: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.login(link, pin)
      onDone()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không vào được'
      setError(message)
      // Link chết thì hỏi PIN nữa cũng vô ích — quay về màn xin link mới
      if (err instanceof ApiError && err.status === 401 && message.includes('Link')) {
        clearChannelLink()
        onDone()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-canvas px-8">
      <div className="flex flex-col items-center gap-1">
        <span className="font-jp text-[length:var(--fs-d3)] text-accent-ink">空</span>
        <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Nhập PIN của bạn</h1>
        <p className="text-[length:var(--fs-c1)] text-ink-mute">Cùng mã PIN bạn dùng ở quán</p>
      </div>
      <PinPad onComplete={submit} disabled={busy} error={error} />
      <Button
        variant="ghost"
        onClick={() => {
          clearChannelLink()
          onDone()
        }}
      >
        Đây không phải máy của tôi
      </Button>
    </main>
  )
}

function Splash({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-8 text-center">
      <span className="font-jp text-[length:var(--fs-d3)] text-accent-ink">空</span>
      <p className="text-[length:var(--fs-b1)] text-ink-mute">{text}</p>
      {action}
    </main>
  )
}
