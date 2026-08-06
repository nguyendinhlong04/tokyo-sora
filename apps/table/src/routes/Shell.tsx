import { subscribeOutbox, type OutboxState } from '@sora/core'
import { Button } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { api } from '../api'
import { CallStaffSheet } from '../components/CallStaffSheet'
import { HostApproval } from '../components/HostApproval'
import { useTable } from '../table-context'

const CallStaffCtx = createContext<() => void>(() => undefined)

/** Mở tấm "Gọi nhân viên" từ bất kỳ màn nào — chỉ có một tấm cho cả app */
export function useCallStaff() {
  return useContext(CallStaffCtx)
}

/** Trạng thái mạng lấy từ hàng đợi offline — cùng nguồn với POS và màn bếp */
export function useOutbox(): OutboxState {
  const [state, setState] = useState<OutboxState>({
    pending: 0,
    failed: 0,
    online: true,
    draining: false,
  })
  useEffect(() => subscribeOutbox(setState), [])
  return state
}

/**
 * Khung chung của Sora Table.
 *
 * Chưa có phiên bàn thì mọi màn đều dừng ở lời mời quét mã: điện thoại không có
 * token thì không có bàn nào để gọi món, và đoán mò số bàn là chuyện không được
 * phép xảy ra.
 */
export function Shell() {
  const { session, ready, ended } = useTable()
  const [calling, setCalling] = useState(false)
  const openCallStaff = useCallback(() => setCalling(true), [])
  const outbox = useOutbox()
  const location = useLocation()
  const navigate = useNavigate()

  const order = useQuery({
    queryKey: ['order', session?.id],
    queryFn: () => api.order(session!.id),
    enabled: Boolean(session),
    refetchInterval: 15_000,
  })

  if (!ready) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas text-ink-mute">
        Đang mở bàn…
      </main>
    )
  }

  if (!session) return <ScanAgain ended={ended} />

  const liveLines = (order.data?.lines ?? []).filter(
    (l) => l.state !== 'voided' && l.parentLineId === null,
  )
  const onMenu = location.pathname === '/thuc-don'

  return (
    <CallStaffCtx.Provider value={openCallStaff}>
      <div className="min-h-dvh bg-surface-2 font-sans text-ink-body">
        <header className="sticky top-0 z-60 border-b border-accent/16 bg-surface-2/95 backdrop-blur">
          <div className="flex h-12 items-center justify-between px-2">
            <Link
              to="/"
              className="px-2 text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] text-ink-hi"
            >
              TOKYO SORA
            </Link>
            <div className="flex items-center">
              <IconButton label="Gọi nhân viên" onClick={() => setCalling(true)}>
                <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h1.8a1 1 0 0 1 1 .8l.7 3a1 1 0 0 1-.5 1.1l-1.6.9a11 11 0 0 0 5.3 5.3l.9-1.6a1 1 0 0 1 1.1-.5l3 .7a1 1 0 0 1 .8 1v1.8a2.5 2.5 0 0 1-2.5 2.5A14.5 14.5 0 0 1 4 6.5Z" />
              </IconButton>
              {onMenu ? (
                <IconButton label="Tìm món" onClick={() => void navigate('/tim')}>
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="M15.5 15.5 21 21" />
                </IconButton>
              ) : null}
              <IconButton
                label="Đơn của bàn"
                badge={liveLines.length || null}
                onClick={() => void navigate('/don')}
              >
                <path d="M5 8h14l-1.3 11.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8L5 8Z" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" />
              </IconButton>
            </div>
          </div>

          {!outbox.online ? (
            <p className="border-b border-warn bg-warn/14 px-4 py-2.5 text-[length:var(--fs-b2)] text-gold-200">
              Mất kết nối — món đã chọn sẽ tự gửi khi có mạng
            </p>
          ) : null}
        </header>

        <Outlet />
        <CallStaffSheet open={calling} onClose={() => setCalling(false)} />
        {/* Chỉ hiện trên máy chủ bàn, và chỉ khi có người đang xin vào */}
        <HostApproval />
      </div>
    </CallStaffCtx.Provider>
  )
}

function IconButton({
  label,
  onClick,
  badge = null,
  children,
}: {
  label: string
  onClick: () => void
  badge?: number | null
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative grid h-[var(--hit-target)] w-[var(--hit-target)] place-items-center text-ink-body"
    >
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7">
        {children}
      </svg>
      {badge ? (
        <span className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-accent-strong px-1.5 font-mono text-[length:var(--fs-c2)] text-on-accent">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

/**
 * Không còn phiên bàn — nói rõ phải làm gì, đừng bỏ khách ở màn trắng (§13).
 *
 * Hai lời khác hẳn nhau cho hai tình huống. Người vừa trả tiền xong mà bị mời
 * "quét lại mã để bắt đầu" thì thấy như bị đuổi khéo; còn người mới mở app mà
 * đọc lời cảm ơn thì không hiểu chuyện gì.
 */
function ScanAgain({ ended }: { ended: boolean }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-8 text-center">
      <span className="font-jp text-[56px] leading-none text-gold-900">{ended ? '謝' : '空'}</span>
      <p className="text-[length:var(--fs-t2)] font-medium text-ink-hi">
        {ended ? 'Cảm ơn quý khách.' : 'Chưa vào được bàn nào.'}
      </p>
      <p className="text-[length:var(--fs-b1)] text-ink-body">
        {ended
          ? 'Bàn đã được dọn và bữa ăn kết thúc. Hẹn gặp lại quý khách ở Tokyo Sora.'
          : 'Quét mã QR dán trên bàn để bắt đầu. Nếu quét rồi mà vẫn thấy màn này, nhờ nhân viên mở bàn giúp bạn.'}
      </p>
      {ended ? null : (
        <Button size="lg" onClick={() => window.location.reload()}>
          Thử lại
        </Button>
      )}
    </main>
  )
}
