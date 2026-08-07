import { serverNow } from '@sora/core'
import { Badge, Button, Card, Money, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type CodBook, type DispatchCard } from '../api'
import { useSession } from '../session-context'

/**
 * P16 — dải điều phối của trạm thu ngân.
 *
 * Ba ngăn xếp theo ĐÚNG thứ tự ưu tiên chú ý của §21 P16: tiền lệch > đơn online
 * mới > yêu cầu bàn. Khách đứng trước mặt thì đã có vùng việc bên trái, nên dải
 * này không bao giờ chiếm chỗ của màn tính tiền.
 *
 * Dải chỉ hiện việc CẦN LÀM: khoản đã khớp tự động chỉ còn là một con số đếm.
 * Danh sách đầy đủ nằm ở P15, và đó là chỗ đúng cho nó.
 */
export function DispatchRail() {
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [shipFor, setShipFor] = useState<DispatchCard | null>(null)
  const [codFor, setCodFor] = useState<CodBook['shippers'][number] | null>(null)

  const dispatch = useQuery({
    queryKey: ['dispatch', branchId],
    queryFn: () => api.dispatchBoard(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 10_000,
  })

  const requests = useQuery({
    queryKey: ['table-requests', branchId],
    queryFn: () => api.tableRequests(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 15_000,
  })

  const recon = useQuery({
    queryKey: ['reconcile', branchId],
    queryFn: () => api.reconcile(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 20_000,
  })

  const cod = useQuery({
    queryKey: ['cod', branchId],
    queryFn: () => api.codBook(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 60_000,
  })

  const step = useMutation({
    mutationFn: (input: { order: DispatchCard; to: DispatchCard['status'] }) =>
      api.setOrderStatus(input.order.id, input.to),
    onSuccess: (result, { order, to }) => {
      toast(
        to === 'confirmed' && result.tickets
          ? `${order.displayCode} đã xuống bếp — ${result.tickets} vé`
          : `${order.displayCode} · ${to}`,
        'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['dispatch', branchId] })
      void queryClient.invalidateQueries({ queryKey: ['cod', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const accept = useMutation({
    mutationFn: (paymentId: number) => api.acceptMismatch(paymentId),
    onSuccess: () => {
      toast('Đã chấp nhận khoản lệch', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['reconcile', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const topUp = useMutation({
    mutationFn: (paymentId: number) => api.requestTopUp(paymentId),
    onSuccess: () => {
      toast('Đã ghi phần thực nhận — còn thiếu nằm ở bill', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['reconcile', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const doneRequest = useMutation({
    mutationFn: (requestId: number) => api.markRequestDone(requestId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['table-requests', branchId] }),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const online = (dispatch.data?.orders ?? []).filter(
    (o) => o.status !== 'done' && o.status !== 'cancelled',
  )
  const mismatch = recon.data?.mismatch ?? []
  const unassigned = recon.data?.unassigned ?? []
  const pending = requests.data?.requests ?? []

  return (
    <aside className="relative flex h-full min-h-0 w-[400px] flex-none flex-col border-l border-accent-line bg-surface-0 xl:w-[520px]">
      <header className="flex flex-none items-center gap-2 border-b border-line-1 px-4 py-2.5">
        <span className="text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-body uppercase">
          Dải điều phối
        </span>
        <Button variant="ghost" className="ml-auto" onClick={() => void navigate('/dieu-phoi')}>
          Bảng điều phối
        </Button>
      </header>

      {/* 1. Đơn online */}
      <section className="flex min-h-0 flex-[1.7] flex-col border-b border-line-1">
        <RailHead label="Đơn online" count={online.length} tone="info" />
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-3.5">
          {online.map((order) => (
            <Card key={order.id} className="p-3">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                  {order.displayCode}
                </span>
                <Badge tone={order.channel === 'web' ? 'accent' : 'info'}>{order.channel}</Badge>
                <span className="ml-auto text-[length:var(--fs-c1)] text-ink-mute">
                  {order.type === 'delivery' ? 'Giao' : 'Mang về'}
                </span>
                {order.slotAt ? <Countdown at={order.slotAt} /> : null}
              </div>

              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  {order.itemCount} món
                </span>
                <Money amount={order.total} className="text-accent-ink" />
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  · {order.customerName ?? '—'}
                </span>
                {order.paymentState !== 'paid' ? (
                  <span className="ml-auto text-[length:var(--fs-c2)] text-warn">Chưa trả</span>
                ) : null}
              </div>

              {/*
                Nút đổi bước hỏi MÁY CHỦ (`nextStatuses`), không tự suy từ `status`.

                Bản cũ tự suy và sai hai chỗ, cả hai đều là nút bấm vào chỉ để nhận
                thông báo lỗi:

                · "Đóng gói xong" hiện ở cả `confirmed` — máy trạng thái không có
                  đường đi thẳng sang `ready` — lẫn `cooking`, vốn là bước của bếp
                  nên thu ngân bấm là bị chặn quyền. Mà bước này bếp bấm Xong là
                  đơn tự sang, không cần ai bấm hộ.
                · "Đã giao" hiện cho đơn GIAO đang `ready`, bỏ qua bước `delivering`
                  mà nghiệp vụ bắt phải đi qua — có đi giao mới biết ai cầm đơn.
              */}
              <div className="mt-3 flex flex-wrap gap-2">
                {order.nextStatuses.includes('confirmed') ? (
                  <Button
                    variant="primary"
                    onClick={() => step.mutate({ order, to: 'confirmed' })}
                  >
                    Xác nhận
                  </Button>
                ) : null}
                {order.customerPhone ? (
                  <a
                    href={`tel:${order.customerPhone}`}
                    className="inline-flex h-[var(--hit-target)] items-center rounded-sm border border-line-3 px-4 text-[length:var(--fs-b2)] text-ink-body"
                  >
                    Gọi khách
                  </a>
                ) : null}
                {order.type === 'delivery' ? (
                  <Button onClick={() => setShipFor(order)}>Gán ship</Button>
                ) : null}
                {order.nextStatuses.includes('ready') ? (
                  <Button onClick={() => step.mutate({ order, to: 'ready' })}>Đóng gói xong</Button>
                ) : null}
                {order.nextStatuses.includes('delivering') ? (
                  <Button onClick={() => step.mutate({ order, to: 'delivering' })}>Đi giao</Button>
                ) : null}
                {order.nextStatuses.includes('done') ? (
                  <Button onClick={() => step.mutate({ order, to: 'done' })}>
                    {order.type === 'delivery' ? 'Đã giao' : 'Khách đã lấy'}
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
          {online.length === 0 ? <Quiet>Không có gì cần xử lý</Quiet> : null}
        </div>
      </section>

      {/* 2. Đối soát */}
      <section className="flex min-h-0 flex-1 flex-col border-b border-line-1">
        <RailHead label="Đối soát" count={mismatch.length + unassigned.length} tone="warn" />
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-3.5">
          <p className="text-[length:var(--fs-c1)] text-ink-mute">
            Đã khớp tự động hôm nay: {recon.data?.matched.length ?? 0}
          </p>
          {mismatch.map((row) => (
            <Card key={row.paymentId} className="border-warn p-3">
              <div className="flex items-baseline gap-2.5">
                <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                  {row.tableCode ?? '—'}
                </span>
                <Money amount={row.received} className="text-ink-body" />
                <Badge tone="danger">
                  {row.diff > 0 ? '+' : '−'}
                  {Math.abs(row.diff).toLocaleString('vi-VN')}₫
                </Badge>
                <span className="ml-auto font-mono text-[length:var(--fs-c2)] text-ink-mute">
                  {row.bankRef}
                </span>
              </div>
              <div className="mt-2.5 flex gap-2">
                <Button disabled={accept.isPending} onClick={() => accept.mutate(row.paymentId)}>
                  Chấp nhận
                </Button>
                <Button disabled={topUp.isPending} onClick={() => topUp.mutate(row.paymentId)}>
                  Yêu cầu bù
                </Button>
              </div>
            </Card>
          ))}
          {unassigned.length > 0 ? (
            <Button block onClick={() => void navigate('/doi-soat')}>
              {unassigned.length} giao dịch chưa gán — mở đối soát
            </Button>
          ) : null}
          {mismatch.length + unassigned.length === 0 ? <Quiet>Không có gì cần xử lý</Quiet> : null}
        </div>
      </section>

      {/* 3. Yêu cầu bàn */}
      <section className="flex min-h-0 flex-1 flex-col">
        <RailHead label="Yêu cầu bàn" count={pending.length} tone="accent" />
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-3.5">
          {pending.map((request) => (
            <div key={request.id} className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void navigate(`/table/${request.sessionId}?code=${request.tableCode}`)}
                className={[
                  'flex flex-1 items-center gap-2.5 rounded-sm border px-3 py-2.5 text-left',
                  request.urgent ? 'border-warn' : 'border-line-2',
                ].join(' ')}
              >
                <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                  Bàn {request.tableCode}
                </span>
                <span className="text-[length:var(--fs-b2)] text-ink-body">{request.label}</span>
                <Waited since={request.createdAt} />
              </button>
              <Button variant="ghost" onClick={() => doneRequest.mutate(request.id)}>
                Xong
              </Button>
            </div>
          ))}
          {pending.length === 0 ? <Quiet>Không có gì cần xử lý</Quiet> : null}
        </div>
      </section>

      {/* Chân dải: sổ COD theo shipper */}
      <footer className="flex flex-none flex-wrap items-center gap-2 border-t border-line-1 bg-surface-1 px-4 py-2.5">
        <span className="text-[length:var(--fs-c1)] tracking-[0.12em] text-ink-mute uppercase">
          COD
        </span>
        {(cod.data?.shippers ?? []).map((shipper) => (
          <Button key={shipper.name} onClick={() => setCodFor(shipper)}>
            {shipper.name} · {shipper.orders.length} đơn
          </Button>
        ))}
        {(cod.data?.shippers.length ?? 0) === 0 ? (
          <span className="text-[length:var(--fs-c1)] text-ink-mute">Không có đơn nào chờ nộp</span>
        ) : null}
        <Money amount={cod.data?.total ?? 0} className="ml-auto text-ink-body" />
      </footer>

      {shipFor ? (
        <ShipperDrawer
          order={shipFor}
          onClose={() => setShipFor(null)}
          onAssigned={() => {
            setShipFor(null)
            void queryClient.invalidateQueries({ queryKey: ['dispatch', branchId] })
          }}
        />
      ) : null}

      {codFor ? (
        <CodPopover
          shipper={codFor}
          branchId={branchId!}
          onClose={() => setCodFor(null)}
          onSettled={() => {
            setCodFor(null)
            void queryClient.invalidateQueries({ queryKey: ['cod', branchId] })
            void queryClient.invalidateQueries({ queryKey: ['shift-summary'] })
          }}
        />
      ) : null}
    </aside>
  )
}

function RailHead({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: 'info' | 'warn' | 'accent'
}) {
  return (
    <div className="flex flex-none items-center gap-2.5 px-4 pt-3.5 pb-2">
      <span className="text-[length:var(--fs-c1)] tracking-[0.12em] text-ink-body uppercase">
        {label}
      </span>
      <Badge tone={tone}>{count}</Badge>
    </div>
  )
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-[length:var(--fs-c1)] text-ink-mute">{children}</p>
}

/**
 * Đếm ngược tới giờ hẹn theo giờ MÁY CHỦ — máy POS có thể sai giờ.
 *
 * Quá hẹn lâu thì đổi sang giờ: "−1509′" là con số phải nhẩm mới hiểu, còn
 * "−25 tiếng" thì đọc một cái là biết đơn này đã hỏng từ hôm qua.
 */
function Countdown({ at }: { at: string }) {
  const seconds = Math.round((new Date(at).getTime() - serverNow()) / 1000)
  const late = seconds < 0
  const minutes = Math.floor(Math.abs(seconds) / 60)
  return (
    <span
      className={[
        'font-mono text-[length:var(--fs-c1)]',
        late ? 'text-danger' : minutes < 5 ? 'text-ember-2' : 'text-ink-mute',
      ].join(' ')}
    >
      {late ? '−' : ''}
      {minutes < 90 ? `${minutes}′` : `${Math.round(minutes / 60)} tiếng`}
    </span>
  )
}

function Waited({ since }: { since: string }) {
  const minutes = Math.max(0, Math.round((serverNow() - new Date(since).getTime()) / 60_000))
  return (
    <span
      className={[
        'ml-auto font-mono text-[length:var(--fs-c1)]',
        minutes >= 5 ? 'text-danger' : 'text-ink-mute',
      ].join(' ')}
    >
      {minutes}′
    </span>
  )
}

/**
 * Drawer gán ship: chọn từ sổ shipper quen hoặc gõ người mới.
 *
 * Sổ quen là những cái tên đã từng giao cho chi nhánh này — bấm một cái là xong,
 * khỏi gõ lại số điện thoại giữa giờ cao điểm.
 */
function ShipperDrawer({
  order,
  onClose,
  onAssigned,
}: {
  order: DispatchCard
  onClose: () => void
  onAssigned: () => void
}) {
  const { branchId } = useSession()
  const toast = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const book = useQuery({
    queryKey: ['shippers', branchId],
    queryFn: () => api.shipperBook(branchId!),
    enabled: Boolean(branchId),
  })

  const assign = useMutation({
    mutationFn: (input: { name: string; phone: string | null }) =>
      api.assignShipper(order.id, input.name, input.phone),
    onSuccess: (result) => {
      toast(`${order.displayCode} giao cho ${result.shipper}`, 'ok')
      onAssigned()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <div className="absolute inset-y-0 right-0 z-40 flex w-[400px] flex-col border-l border-line-2 bg-surface-0 xl:w-[520px]">
      <header className="flex items-start gap-3 border-b border-line-1 px-5 py-4">
        <div>
          <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">Gán shipper</h2>
          <p className="mt-1.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {order.displayCode}
          </p>
        </div>
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          ×
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          {(book.data ?? []).map((shipper) => (
            <Button
              key={shipper.name}
              block
              className="justify-between"
              disabled={assign.isPending}
              onClick={() => assign.mutate({ name: shipper.name, phone: shipper.phone })}
            >
              <span>{shipper.name}</span>
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {shipper.phone ?? '—'} · {shipper.trips} chuyến
              </span>
            </Button>
          ))}
          {(book.data?.length ?? 0) === 0 ? (
            <p className="text-ink-mute">Chưa có shipper quen nào — nhập người mới bên dưới.</p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên shipper mới"
            className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-1 px-3.5 text-ink-hi"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Số điện thoại"
            inputMode="tel"
            className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-1 px-3.5 font-mono text-ink-hi"
          />
          <Button
            variant="primary"
            block
            disabled={name.trim().length === 0 || assign.isPending}
            onClick={() => assign.mutate({ name: name.trim(), phone: phone.trim() || null })}
          >
            Gán cho người này
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Shipper về nộp tiền.
 *
 * Ô "số thực nhận" để trống là nộp đủ — chỉ điền khi lệch. Bắt gõ lại con số
 * đúng bằng số máy đã tính là mời người ta gõ nhầm.
 */
function CodPopover({
  shipper,
  branchId,
  onClose,
  onSettled,
}: {
  shipper: CodBook['shippers'][number]
  branchId: string
  onClose: () => void
  onSettled: () => void
}) {
  const toast = useToast()
  const [received, setReceived] = useState('')

  const settle = useMutation({
    mutationFn: () =>
      api.settleCod({
        branchId,
        shipper: shipper.name,
        orderIds: shipper.orders.map((o) => o.id),
        receivedAmount: received ? Number(received.replace(/\D/g, '')) : null,
      }),
    onSuccess: (result) => {
      toast(
        result.variance === 0
          ? `Đã nhận ${result.received.toLocaleString('vi-VN')}₫ từ ${shipper.name}`
          : `Nhận ${result.received.toLocaleString('vi-VN')}₫ — lệch ${result.variance.toLocaleString('vi-VN')}₫, đã ghi sổ`,
        result.variance === 0 ? 'ok' : 'warn',
      )
      onSettled()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <Card className="absolute right-5 bottom-16 z-40 w-[380px] border-line-2 bg-surface-2 p-4.5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">{shipper.name}</span>
        <span className="text-[length:var(--fs-c1)] text-ink-mute">
          {shipper.orders.length} đơn
        </span>
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          ×
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {shipper.orders.map((order) => (
          <div key={order.id} className="flex items-baseline gap-2.5 rounded-sm bg-surface-0 px-3 py-2">
            <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
              {order.displayCode}
            </span>
            <Money amount={order.due} className="ml-auto text-accent-ink" />
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex items-baseline justify-between">
        <span className="text-ink-body">Phải nhận</span>
        <Money amount={shipper.due} className="text-[length:var(--fs-t1)] text-ink-hi" />
      </div>

      <input
        value={received}
        onChange={(e) => setReceived(e.target.value)}
        placeholder="Số thực nhận nếu lệch"
        inputMode="numeric"
        className="mt-3 h-[var(--hit-target)] w-full rounded-sm border border-line-3 bg-surface-0 px-3 font-mono text-ink-hi"
      />
      <Button
        variant="primary"
        block
        className="mt-3"
        disabled={settle.isPending}
        onClick={() => settle.mutate()}
      >
        {received ? 'Nhận số đã nhập' : 'Đã nhận đủ'}
      </Button>
    </Card>
  )
}
