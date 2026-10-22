import { Money, useToast } from '@sora/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { api, type RequestKind } from '../api'
import { useCart } from '../cart-context'
import { KINDS } from '../components/CallStaffSheet'
import { HostApproval } from '../components/HostApproval'
import { IconBell, IconOffline, IconReceipt } from '../icons'
import { PromotionsProvider } from '../promotions'
import { useTable, useTableSession } from '../table-context'
import { ScanAgain, useOutbox } from './Shell'

interface IpadCall {
  /** Mở bảng "Gọi nhân viên" dưới thanh trên */
  open: () => void
  /** Gọi thẳng một việc — nút "Gọi thu ngân" ở tạm tính và thanh toán */
  call: (kind: RequestKind, note?: string) => void
  calling: boolean
}

const CallCtx = createContext<IpadCall | null>(null)

export function useIpadCall(): IpadCall {
  const value = useContext(CallCtx)
  if (!value) throw new Error('useIpadCall phải nằm trong <IpadShell>')
  return value
}

/** Để yên bấy lâu thì làm mờ màn (§9.1b) */
const DIM_AFTER_MS = 3 * 60_000

/**
 * Khung Sora Table trên iPad gắn bàn (§9.1).
 *
 * Một khung cao đúng bằng màn, chỉ các vùng bên trong cuộn: thanh trên, cột nhóm
 * và nút Gửi bếp không bao giờ trôi khỏi tầm tay. Trang cả khối mà cuộn trong
 * Safari thì thanh địa chỉ co giãn theo, và nút ở đáy nhảy lên nhảy xuống dưới
 * ngón tay khách.
 *
 * Màn chào ở `/` không có thanh trên — nó là hộp thoại mở bữa, đứng một mình.
 */
export function IpadShell() {
  const { session, ready, ended } = useTable()
  const { pathname } = useLocation()

  if (!ready) {
    return (
      <main className="grid h-dvh place-items-center bg-surface-2 font-sans text-ink-mute">
        Đang mở bàn…
      </main>
    )
  }
  if (!session) return <ScanAgain ended={ended} />

  return (
    <PromotionsProvider branchId={session.branchId}>
      <CallProvider>
        <div className="flex h-dvh flex-col overflow-hidden bg-surface-2 font-sans text-[length:var(--fs-b2)] leading-[1.45] text-ink-body">
          {pathname === '/' ? null : <TopBar />}
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </div>
        {pathname.startsWith('/tra-tien') ? null : <IdleDimmer />}
        <HostApproval />
      </CallProvider>
    </PromotionsProvider>
  )
}

function CallProvider({ children }: { children: ReactNode }) {
  const session = useTableSession()
  const toast = useToast()
  const [open, setOpen] = useState(false)

  /**
   * KHÔNG qua hàng đợi offline, giống bản điện thoại: gọi người mà lệnh nằm chờ
   * có mạng thì khách cứ ngồi đợi một cái chuông không kêu.
   */
  const request = useMutation({
    mutationFn: (input: { kind: RequestKind; note?: string }) =>
      api.callStaff(session.id, input.kind, input.note),
    onSuccess: (result) => {
      setOpen(false)
      toast(`Đã gọi “${result.label}” — nhân viên đang tới bàn ${session.table.code}`, 'ok')
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const value: IpadCall = {
    open: () => setOpen(true),
    call: (kind, note) => request.mutate({ kind, note }),
    calling: request.isPending,
  }

  return (
    <CallCtx.Provider value={value}>
      {children}
      {open ? (
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-canvas/55 animate-[sora-fade_var(--dur-panel)_var(--ease-sora)]"
          />
          <div
            role="dialog"
            aria-label="Gọi nhân viên"
            className="absolute top-[calc(3.75rem+env(safe-area-inset-top))] right-3 w-90 rounded-lg border border-accent/22 bg-surface-3 p-4 animate-[sora-rise_var(--dur-panel)_var(--ease-sora)]"
          >
            <p className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Gọi nhân viên</p>
            <p className="mt-0.5 mb-3 text-[length:var(--fs-c1)] text-ink-mute">
              Chạm một việc, nhân viên gần nhất sẽ tới bàn {session.table.code}.
            </p>
            <div className="grid gap-1.5">
              {/* Bàn không có bếp thì không có than nào để thêm */}
              {KINDS.filter((k) => k.kind !== 'them-than' || session.table.hasGrill).map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  disabled={request.isPending}
                  onClick={() => request.mutate({ kind: k.kind })}
                  className="flex h-12 w-full items-center rounded-sm border border-line-3 bg-surface-4 px-3.5 text-left text-[length:var(--fs-b2)] font-medium text-ink-hi disabled:text-ink-mute"
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </CallCtx.Provider>
  )
}

function TopBar() {
  const session = useTableSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const outbox = useOutbox()
  const call = useIpadCall()

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
    refetchInterval: 15_000,
  })
  const total = order.data?.order.moneyTotal ?? 0
  const onOrder = pathname === '/don' || pathname.startsWith('/tra-tien') || pathname === '/hoa-don'

  return (
    <>
      <div className="flex-none bg-surface-1 pt-[env(safe-area-inset-top)]">
        <header className="flex h-14 items-center gap-1 border-b border-accent/16 pr-3 pl-5">
          <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] whitespace-nowrap text-ink-hi">
            TOKYO SORA
          </span>
          <span aria-hidden className="mx-3.5 h-5 w-px flex-none bg-line-3" />
          <span className="text-[length:var(--fs-b1)] font-semibold whitespace-nowrap text-ink-hi">
            Bàn {session.table.code}
          </span>
          <span className="ml-2.5 text-[length:var(--fs-c1)] whitespace-nowrap text-ink-mute">
            {[session.table.area, `${session.guestCount} khách`].filter(Boolean).join(' · ')}
          </span>
          <div className="flex-1" />
          <TopButton onClick={call.open}>
            <IconBell />
            Gọi nhân viên
          </TopButton>
          <TopButton active={onOrder} onClick={() => void navigate('/don')}>
            <IconReceipt />
            Đơn của bàn
            {total > 0 ? <Money amount={total} className="text-gold-300" /> : null}
          </TopButton>
        </header>
      </div>

      {!outbox.online ? (
        <div
          role="status"
          className="flex h-9 flex-none items-center gap-2.5 border-b border-warn/55 bg-warn/12 px-5 text-[length:var(--fs-c1)] text-ink-hi"
        >
          <IconOffline size={16} className="flex-none text-warn" />
          <span className="flex-1">
            Mất kết nối — bạn vẫn chọn món được, món sẽ tự gửi bếp khi có mạng.
          </span>
          {outbox.pending > 0 ? (
            <span className="text-ink-mute">{outbox.pending} lệnh chờ gửi</span>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

/** Nút trên thanh trên: viên 36px vẽ ra, vùng chạm vẫn đủ 44px */
function TopButton({
  active = false,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className="ml-2 h-11 py-1">
      <span
        className={[
          'flex h-9 items-center gap-2 rounded-sm border px-3 text-[length:var(--fs-b2)] font-medium whitespace-nowrap text-ink-hi',
          active ? 'border-accent/45 bg-surface-4' : 'border-line-3',
        ].join(' ')}
      >
        {children}
      </span>
    </button>
  )
}

/**
 * Màn mờ khi bàn đang mở mà không ai chạm (§9.1b).
 *
 * KHÔNG quay về màn quảng cáo: giữa bữa mà quảng cáo che mất giỏ đang chọn dở
 * thì khách tưởng mất món. Chỉ tối màn và để lại đúng một con số họ hay nhìn —
 * đơn tới giờ bao nhiêu. Không tính màn thanh toán: QR đang chờ quét mà bị phủ
 * tối là khách phải chạm thêm một lần mới quét được.
 */
function IdleDimmer() {
  const session = useTableSession()
  const cart = useCart()
  const [dim, setDim] = useState(false)

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
    enabled: dim,
  })

  useEffect(() => {
    let timer = setTimeout(() => setDim(true), DIM_AFTER_MS)
    const wake = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setDim(true), DIM_AFTER_MS)
    }
    window.addEventListener('pointerdown', wake, true)
    window.addEventListener('keydown', wake, true)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', wake, true)
      window.removeEventListener('keydown', wake, true)
    }
  }, [])

  if (!dim) return null

  return (
    <button
      type="button"
      aria-label="Chạm để tiếp tục"
      onClick={() => setDim(false)}
      className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-canvas/90 font-sans text-ink-body animate-[sora-fade_var(--dur-reveal)_var(--ease-sora)]"
    >
      <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.14em] text-ink-mute uppercase">
        Bàn {session.table.code} · {session.guestCount} khách
      </span>
      <span className="mt-3.5 text-[length:var(--fs-b2)]">Đơn của bàn tới giờ</span>
      <Money
        amount={order.data?.order.moneyTotal ?? 0}
        className="mt-1 text-[length:var(--fs-d3)] text-ink-hi"
      />
      {cart.count > 0 ? (
        <span className="mt-3 text-[length:var(--fs-b2)] text-gold-200">
          {cart.count} phần đang chọn, chưa gửi bếp
        </span>
      ) : null}
      <span className="mt-8 text-[length:var(--fs-b2)] font-medium text-gold-200">
        Chạm để tiếp tục gọi món
      </span>
    </button>
  )
}
