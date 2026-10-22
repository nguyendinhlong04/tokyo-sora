import { ApiError } from '@sora/core'
import { Button, Money, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { api, type TableSession } from '../api'
import { IconCheck, IconMinus, IconPlus } from '../icons'
import { clock } from '../order-status'
import { useTable, useTableSession } from '../table-context'
import { useIpadCall } from './IpadShell'

/** Số nút chạm nhanh; nhóm đông hơn gõ ở ô "Khác" */
const QUICK_MAX = 6

/**
 * Màn đầu của iPad (§9.1 vòng đời): bàn chưa mở thì khách tự mở; bàn nhân viên đã
 * mở ở POS thì khách chốt lại số khách; bữa đã trả đủ thì "đã thanh toán, chờ dọn".
 *
 * Màn chờ quảng cáo (§9.1b) chưa làm — tới lúc đó bàn trống đứng sẵn ở hộp mở bàn.
 */
export function IpadWelcome() {
  const { session } = useTable()
  return (
    <div className="relative grid flex-1 place-items-center overflow-hidden bg-[radial-gradient(70%_90%_at_50%_42%,var(--sora-surface-4)_0%,var(--sora-surface-1)_55%,var(--sora-bg-base)_100%)]">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-jp text-[560px] leading-none text-accent opacity-4"
      >
        空
      </span>
      {!session ? (
        <OpenTable />
      ) : session.status === 'paid_wait_clear' ? (
        <Paid />
      ) : (
        <ConfirmGuests />
      )}
    </div>
  )
}

const overNote = (guests: number, tableCode: string) =>
  `Nhóm ${guests} khách — cần ghép thêm bàn cạnh bàn ${tableCode}`

/** Bàn chưa mở: khách chọn số người rồi tự mở bàn (chốt 22/10/2026) */
function OpenTable() {
  const { terminal } = useTable()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const table = terminal!.table

  const open = useMutation({
    mutationFn: (guests: number) => api.openTable(guests),
    onSuccess: (result, guests) => {
      queryClient.setQueryData(['terminal'], result)
      // Máy chủ đã mở với đúng sức chứa của bàn; việc ghép thêm bàn phải qua người
      // — gọi sẵn cho khách, khỏi bắt họ tự đi tìm
      if (result.overCapacity && result.session) {
        api.callStaff(result.session.id, 'khac', overNote(guests, table.code)).catch(() => {
          toast('Chưa gọi được nhân viên ghép bàn — chạm Gọi nhân viên ở thanh trên', 'warn')
        })
      }
      void navigate('/thuc-don')
    },
    onError: (err: Error) => {
      toast(
        err instanceof ApiError && err.isOffline
          ? 'Mất kết nối — chưa mở được bàn. Vui lòng gọi nhân viên.'
          : err.message,
        'danger',
      )
      // Có người vừa đặt bàn này: hỏi lại để hiện lời nhắn đặt chỗ thay cho hộp mở bàn
      void queryClient.invalidateQueries({ queryKey: ['terminal'] })
    },
  })

  if (terminal!.reservedAt) return <Reserved tableCode={table.code} at={terminal!.reservedAt} />

  return (
    <GuestDialog
      table={table}
      initial={null}
      pending={open.isPending}
      onStart={(guests) => open.mutate(guests)}
    />
  )
}

/**
 * Bàn nhân viên đã mở ở P3: chốt lại số khách.
 *
 * Nhân viên đã nhập số này lúc mở bàn; người ngồi xuống mới biết chắc — và con số
 * này đi thẳng vào báo cáo doanh thu trên đầu khách. Gửi một lần khi bấm "Bắt đầu
 * gọi món" chứ không theo từng chạm: khách còn đổi ý giữa 4 và 5.
 */
function ConfirmGuests() {
  const session = useTableSession()
  const navigate = useNavigate()
  const toast = useToast()
  const call = useIpadCall()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (next: number) => api.setGuestCount(session.id, next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['terminal'] })
      void navigate('/thuc-don')
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const start = (guests: number) => {
    if (guests > session.table.seatMax) {
      // Máy chủ không cho ghi quá sức chứa bàn, nên việc ghép thêm bàn phải qua người
      call.call('khac', overNote(guests, session.table.code))
      void navigate('/thuc-don')
      return
    }
    if (guests === session.guestCount) {
      void navigate('/thuc-don')
      return
    }
    save.mutate(guests)
  }

  return (
    <GuestDialog
      table={session.table}
      initial={session.guestCount}
      pending={save.isPending}
      onStart={start}
    />
  )
}

/** Bàn có khách đặt trong 90′ tới — iPad không mở, chỉ báo GIỜ, không bao giờ báo tên */
function Reserved({ tableCode, at }: { tableCode: string; at: string }) {
  return (
    <div
      role="status"
      className="relative w-[520px] rounded-lg border border-accent/22 bg-surface-3 px-8 pt-8 pb-7"
    >
      <p className="text-[length:var(--fs-b2)] font-medium tracking-[0.12em] text-gold-300 uppercase">
        Bàn {tableCode}
      </p>
      <h1 className="mt-2.5 font-display text-[length:var(--fs-d3)] leading-[1.15] font-light text-ink-hi">
        Bàn đã có khách đặt
      </h1>
      <p className="mt-2.5 text-[length:var(--fs-b1)] leading-[1.55] text-ink-body">
        Bàn này được giữ cho khách đặt lúc <span className="font-mono">{clock(at)}</span>. Quý khách
        vui lòng gặp nhân viên để được xếp bàn — nếu đây đúng là bàn quý khách đã đặt, nhân viên mở
        bàn là iPad sẵn sàng gọi món.
      </p>
    </div>
  )
}

function GuestDialog({
  table,
  initial,
  pending,
  onStart,
}: {
  table: TableSession['table']
  /** Số nhân viên đã nhập lúc mở bàn; null = khách tự mở, chưa chọn gì */
  initial: number | null
  pending: boolean
  onStart: (guests: number) => void
}) {
  const seatMax = table.seatMax
  const quick = Array.from({ length: Math.min(QUICK_MAX, seatMax) }, (_, i) => i + 1)
  const [guests, setGuests] = useState<number | null>(initial)
  const [other, setOther] = useState(initial !== null && initial > quick.length)
  const [text, setText] = useState<string | null>(null)
  const over = guests !== null && guests > seatMax

  const setTyped = (n: number) => {
    setText(null)
    setGuests(Math.max(1, Math.min(50, n)))
  }

  return (
    <div
      role="dialog"
      aria-label="Mở bàn"
      className="relative w-[520px] rounded-lg border border-accent/22 bg-surface-3 px-8 pt-8 pb-7"
    >
      <p className="text-[length:var(--fs-b2)] font-medium tracking-[0.12em] text-gold-300 uppercase">
        {['Bàn ' + table.code, table.area].filter(Boolean).join(' · ')}
      </p>
      <h1 className="mt-2.5 font-display text-[length:var(--fs-d3)] leading-[1.15] font-light text-ink-hi">
        Chào mừng quý khách
      </h1>
      <p className="mt-2.5 text-[length:var(--fs-b2)] leading-[1.55] text-ink-body">
        {table.hasGrill
          ? 'Bàn có bếp than — món nướng ra sống, quý khách tự nướng tại bàn.'
          : 'Bàn không có bếp — bếp nướng sẵn, món nướng ra chậm hơn khoảng 8 phút.'}
      </p>

      <p className="mt-6 mb-2.5 text-[length:var(--fs-b2)] font-semibold text-ink-hi">
        Mấy người ăn?
      </p>
      <div
        role="radiogroup"
        aria-label="Số khách"
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${quick.length + 1}, minmax(0, 1fr))` }}
      >
        {quick.map((n) => (
          <GuestButton
            key={n}
            label={`${n} người`}
            on={!other && guests === n}
            onClick={() => {
              setOther(false)
              setText(null)
              setGuests(n)
            }}
          >
            <span className="font-mono text-[length:var(--fs-t2)]">{n}</span>
          </GuestButton>
        ))}
        <GuestButton
          label="Số khác"
          on={other}
          onClick={() => {
            setOther(true)
            if (guests === null || guests <= quick.length) setGuests(quick.length + 1)
          }}
        >
          <span className="text-[length:var(--fs-b2)]">Khác</span>
        </GuestButton>
      </div>

      {other && guests !== null ? (
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor="so-khach" className="text-[length:var(--fs-b2)] text-ink-body">
            Nhập số khách
          </label>
          <div className="flex h-11 items-center rounded-sm border border-accent/60 bg-surface-4">
            <button
              type="button"
              aria-label="Bớt một khách"
              onClick={() => setTyped(guests - 1)}
              className="grid h-full w-11 place-items-center text-gold-300"
            >
              <IconMinus size={16} stroke={1.8} />
            </button>
            <input
              id="so-khach"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={text ?? String(guests)}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setText(e.target.value)
                if (n >= 1) setGuests(Math.min(50, n))
              }}
              onBlur={() => setText(null)}
              className="h-full w-15 border-x border-line-3 bg-transparent text-center font-mono text-[length:var(--fs-t2)] text-ink-hi outline-none"
            />
            <button
              type="button"
              aria-label="Thêm một khách"
              onClick={() => setTyped(guests + 1)}
              className="grid h-full w-11 place-items-center text-gold-300"
            >
              <IconPlus size={16} stroke={1.8} />
            </button>
          </div>
          <span className="text-[length:var(--fs-b2)] text-ink-mute">người</span>
        </div>
      ) : null}

      {over ? (
        <p className="mt-3 rounded-md border border-info/60 bg-info/8 px-3 py-2.5 text-[length:var(--fs-c1)] leading-normal text-ink-body">
          Bàn {table.code} có {seatMax} chỗ. Nhóm {guests} người: nhân viên sẽ tới ghép thêm bàn bên
          cạnh khi bạn bấm Bắt đầu gọi món.
        </p>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        block
        className="mt-5"
        disabled={pending || guests === null}
        onClick={() => {
          if (guests !== null) onStart(guests)
        }}
      >
        Bắt đầu gọi món
      </Button>
    </div>
  )
}

function GuestButton({
  label,
  on,
  onClick,
  children,
}: {
  label: string
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-label={label}
      aria-checked={on}
      onClick={onClick}
      className={[
        'grid h-13 place-items-center rounded-sm border',
        on ? 'border-accent bg-surface-4 text-gold-200' : 'border-line-3 text-ink-body',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** Đã trả đủ, chờ nhân viên dọn và đóng bàn ở POS */
function Paid() {
  const session = useTableSession()
  const navigate = useNavigate()
  const call = useIpadCall()
  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
  })

  return (
    <div className="relative flex flex-col items-center text-center">
      <span className="grid h-18 w-18 place-items-center rounded-pill border-[1.5px] border-ok text-ok">
        <IconCheck size={34} />
      </span>
      <h1 className="mt-6 font-display text-[length:var(--fs-d2)] leading-[1.1] font-light text-ink-hi">
        Đã thanh toán đủ
      </h1>
      <p className="mt-3 text-[length:var(--fs-b1)] text-ink-body">
        Cảm ơn quý khách. Nhân viên sẽ dọn bàn trong ít phút.
      </p>
      <p className="mt-1.5 font-mono text-[length:var(--fs-b2)] text-ink-mute">
        Bàn {session.table.code} · {session.guestCount} khách
        {bill.data ? (
          <>
            {' · '}
            <Money amount={bill.data.total} />
          </>
        ) : null}
      </p>
      <div className="mt-7 flex gap-2.5">
        <Button onClick={() => void navigate('/hoa-don')}>Xem hoá đơn</Button>
        <Button variant="ghost" onClick={() => void navigate('/thuc-don')}>
          Gọi thêm món
        </Button>
        <Button variant="ghost" onClick={call.open}>
          Gọi nhân viên
        </Button>
      </div>
    </div>
  )
}
