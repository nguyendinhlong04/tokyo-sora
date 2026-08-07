import { calibrate, serverNow } from '@sora/core'
import { Badge, Button, Card, EmptyState, Money, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type DispatchCard } from '../api'
import { useSession } from '../session-context'
import { OrderDrawer } from './OrderDrawer'

/** Cột của bảng — đúng năm bước đơn online đi qua, "Hoàn tất" xem ở nơi khác */
const COLUMNS: { status: DispatchCard['status']; label: string }[] = [
  { status: 'new', label: 'Mới' },
  { status: 'confirmed', label: 'Đã xác nhận' },
  { status: 'cooking', label: 'Đang làm' },
  { status: 'ready', label: 'Đóng gói xong' },
  { status: 'delivering', label: 'Đang giao' },
]

const CHANNELS: { id: 'all' | DispatchCard['channel']; label: string }[] = [
  { id: 'all', label: 'Tất cả kênh' },
  { id: 'web', label: 'Web' },
  { id: 'grab', label: 'Grab' },
  { id: 'shopee', label: 'Shopee' },
  { id: 'be', label: 'Be' },
]

const CHANNEL_LABEL: Record<string, string> = {
  web: 'Web',
  grab: 'Grab',
  shopee: 'Shopee',
  be: 'Be',
  pos: 'POS',
  table: 'Bàn',
}

/**
 * O8 Bảng điều phối.
 *
 * Đây là CHẾ ĐỘ ĐÀO SÂU (§23.3): vận hành thường trực nằm ở dải điều phối của
 * trạm thu ngân. Màn này để nhìn cả sàn khi đơn dồn.
 *
 * Thẻ sắp theo GIỜ HẸN, và đơn quá giờ nhảy lên đầu cột — thứ tự do máy chủ trả
 * về, không sắp lại ở máy trạm: hai máy POS cùng nhìn một bảng phải thấy cùng
 * một thứ tự.
 */
export function Dispatch() {
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [channel, setChannel] = useState<'all' | DispatchCard['channel']>('all')
  const [openId, setOpenId] = useState<number | null>(null)

  const board = useQuery({
    queryKey: ['dispatch', branchId],
    queryFn: () => api.dispatchBoard(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (board.data?.serverTime) calibrate(board.data.serverTime)
  }, [board.data?.serverTime])

  const confirm = useMutation({
    mutationFn: (order: DispatchCard) => api.setOrderStatus(order.id, 'confirmed'),
    onSuccess: (result, order) => {
      toast(
        result.tickets
          ? `${order.displayCode} đã xuống bếp — ${result.tickets} vé`
          : `${order.displayCode} đã xác nhận`,
        'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['dispatch', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const orders = (board.data?.orders ?? []).filter(
    (o) => channel === 'all' || o.channel === channel,
  )

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col">
      <header className="flex flex-none items-start gap-4 px-6 pt-5 pb-4">
        <div>
          <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Bảng điều phối</h1>
          <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
            {orders.length} đơn đang chạy · xác nhận đơn là đẩy vé xuống bếp theo trạm của từng món.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {CHANNELS.map((option) => (
            <Button
              key={option.id}
              variant={channel === option.id ? 'primary' : 'secondary'}
              onClick={() => setChannel(option.id)}
            >
              {option.label}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => void navigate('/kenh-ngoai')}>
            Kênh ngoài
          </Button>
        </div>
      </header>

      {board.isPending ? (
        <p className="px-6 text-ink-mute">Đang tải bảng điều phối…</p>
      ) : orders.length === 0 ? (
        <EmptyState title="Chưa có đơn online nào đang chạy. Đơn mới từ web và kênh ngoài sẽ hiện ở đây." />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 pb-6">
          {COLUMNS.map((column) => {
            const list = orders.filter((o) => o.status === column.status)
            return (
              <section key={column.status} className="flex w-72 flex-none flex-col">
                <header className="flex flex-none items-center gap-2.5 pb-3">
                  <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                    {column.label}
                  </span>
                  <Badge tone={column.status === 'new' ? 'info' : 'neutral'}>{list.length}</Badge>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
                  {list.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onOpen={() => setOpenId(order.id)}
                      onConfirm={() => confirm.mutate(order)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {openId !== null ? (
        <OrderDrawer
          orderId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['dispatch', branchId] })}
        />
      ) : null}
    </div>
  )
}

function OrderCard({
  order,
  onOpen,
  onConfirm,
}: {
  order: DispatchCard
  onOpen: () => void
  onConfirm: () => void
}) {
  /**
   * Đếm ngược tới giờ hẹn, tính theo giờ MÁY CHỦ — máy POS có thể sai giờ.
   * Âm là đã quá hẹn; viền cam để thẻ đó đập vào mắt trước mọi thẻ khác.
   *
   * Không dùng `elapsedSeconds` được: hàm đó kẹp về 0 cho mốc ở tương lai, vì nó
   * sinh ra để đo vé bếp đã vào hàng chứ không phải đếm ngược tới giờ hẹn.
   */
  const dueSeconds = order.slotAt
    ? Math.round((new Date(order.slotAt).getTime() - serverNow()) / 1000)
    : null
  const late = dueSeconds !== null && dueSeconds < 0
  const soon = dueSeconds !== null && dueSeconds >= 0 && dueSeconds < 5 * 60

  return (
    <Card className={['p-3.5', late ? 'border-warn' : ''].join(' ')}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
            {order.displayCode}
          </span>
          <Badge tone={order.channel === 'web' ? 'accent' : 'info'}>
            {CHANNEL_LABEL[order.channel] ?? order.channel}
          </Badge>
        </span>

        <span className="mt-2.5 flex items-baseline justify-between gap-2">
          <span className="text-[length:var(--fs-c1)] text-ink-mute">
            {order.slotAt
              ? `Hẹn ${new Date(order.slotAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
              : 'Không hẹn giờ'}
          </span>
          {dueSeconds !== null ? (
            <span
              className={[
                'font-mono text-[length:var(--fs-b1)]',
                late ? 'text-danger' : soon ? 'text-ember-2' : 'text-ink-body',
              ].join(' ')}
            >
              {formatCountdown(dueSeconds)}
            </span>
          ) : null}
        </span>

        <span className="my-2.5 block h-px bg-line-1" />

        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[length:var(--fs-c1)] text-ink-hi">{order.itemCount} món</span>
          <Money amount={order.total} className="text-[length:var(--fs-b2)] text-accent-ink" />
        </span>

        <span className="mt-2 block text-[length:var(--fs-c1)] text-ink-mute">
          {order.type === 'delivery' ? 'Giao · ' : 'Mang về · '}
          {order.customerName ?? '—'}
        </span>

        {order.paymentState !== 'paid' ? (
          <span className="mt-2 block text-[length:var(--fs-c2)] text-warn">Chưa trả tiền</span>
        ) : null}
      </button>

      {/*
        Hỏi máy chủ chứ không xét `status === 'new'`: xác nhận đơn online là việc
        của thu ngân · quản lý ca · điều phối · chủ. Phục vụ (R1) mở được bảng này
        nhưng không được xác nhận, nên xét theo trạng thái là bày ra một cái nút
        bấm vào chỉ nhận về "vai trò hiện tại không được phép".
      */}
      {order.nextStatuses.includes('confirmed') ? (
        <Button variant="primary" block className="mt-3" onClick={onConfirm}>
          Xác nhận · xuống bếp
        </Button>
      ) : null}
    </Card>
  )
}

function formatCountdown(seconds: number): string {
  const sign = seconds < 0 ? '−' : ''
  const abs = Math.abs(seconds)
  const minutes = Math.floor(abs / 60)
  return `${sign}${minutes}:${String(Math.floor(abs % 60)).padStart(2, '0')}`
}
