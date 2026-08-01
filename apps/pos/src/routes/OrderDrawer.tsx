import { Badge, Button, Modal, Money, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type DispatchCard } from '../api'

const STATUS_LABEL: Record<DispatchCard['status'], string> = {
  new: 'Mới',
  confirmed: 'Đã xác nhận',
  cooking: 'Đang làm',
  ready: 'Đóng gói xong',
  delivering: 'Đang giao',
  done: 'Hoàn tất',
  cancelled: 'Đã huỷ',
}

/** Lý do huỷ hay dùng — nhân viên chạm một cái thay vì gõ giữa giờ cao điểm */
const REASONS = ['Khách đổi ý', 'Bếp báo hết', 'Sai đơn', 'Món lỗi']

/**
 * O9 Chi tiết đơn — ngăn kéo bên phải bảng điều phối.
 *
 * Nút bước tiếp theo lấy từ MÁY CHỦ (`nextStatuses`) chứ không dựng ở đây: luật
 * đi bước nào nằm ở máy trạng thái §3, và bếp với điều phối có quyền khác nhau.
 */
export function OrderDrawer({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: number
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [shipperName, setShipperName] = useState('')
  const [shipperPhone, setShipperPhone] = useState('')

  const detail = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: () => api.orderDetail(orderId),
    refetchInterval: 10_000,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['order-detail', orderId] })
    onChanged()
  }

  const setStatus = useMutation({
    mutationFn: (to: DispatchCard['status']) => api.setOrderStatus(orderId, to),
    onSuccess: (result) => {
      toast(
        result.tickets ? `Đã xuống bếp — ${result.tickets} vé` : `Đơn sang bước ${STATUS_LABEL[result.status as DispatchCard['status']]}`,
        'ok',
      )
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const cancel = useMutation({
    mutationFn: () => api.cancelOrder(orderId, reason),
    onSuccess: () => {
      toast('Đã huỷ đơn — vé đã rút khỏi bếp', 'ok')
      setCancelling(false)
      refresh()
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const assign = useMutation({
    mutationFn: () => api.assignShipper(orderId, shipperName, shipperPhone || null),
    onSuccess: (result) => {
      toast(`Đã gán ${result.shipper}`, 'ok')
      setShipperName('')
      setShipperPhone('')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const order = detail.data
  const customer = (order?.customer ?? {}) as Record<string, unknown>
  const lines = (order?.lines ?? []).filter((l) => l.parentLineId === null)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        className="flex h-full w-[480px] flex-col border-l border-line-1 bg-surface-4 animate-[sora-slide_var(--dur-panel)_var(--ease-sora)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex-none border-b border-line-1 px-6 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="font-mono text-[length:var(--fs-t2)] font-medium text-ink-hi">
                {order?.displayCode ?? '—'}
              </p>
              <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
                {order
                  ? [
                      order.channel === 'web' ? 'Web' : order.channel,
                      order.type === 'delivery' ? 'giao hàng' : 'mang về',
                      order.slotAt
                        ? new Date(order.slotAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : null,
                      order.customerName,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Đang tải…'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Đóng"
              onClick={onClose}
              className="h-11 w-11 text-[length:var(--fs-t1)] text-ink-mute"
            >
              ×
            </button>
          </div>
          {order ? (
            <div className="mt-3.5 flex items-center gap-2.5">
              <Badge tone={order.status === 'cancelled' ? 'danger' : 'accent'}>
                {STATUS_LABEL[order.status]}
              </Badge>
              <Badge tone={order.paymentState === 'paid' ? 'ok' : 'warn'}>
                {order.paymentState === 'paid' ? 'Đã trả' : 'Chưa trả'}
              </Badge>
              {order.externalCode ? <Badge tone="info">{order.externalCode}</Badge> : null}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <SectionLabel>Món</SectionLabel>
          <div className="mt-3">
            {lines.map((line) => (
              <div
                key={line.id}
                className="flex items-start gap-3 border-b border-line-1 py-2.5"
              >
                <span className="w-7 flex-none font-mono text-[length:var(--fs-b2)] text-ink-mute">
                  {line.qty}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--fs-b2)] text-ink-hi">{line.nameSnapshot}</p>
                  {line.modifiers && line.modifiers.length > 0 ? (
                    <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
                      {line.modifiers.map((m) => m.name).join(' · ')}
                    </p>
                  ) : null}
                  {line.note ? (
                    <p className="mt-1 text-[length:var(--fs-c1)] text-warn">▸ {line.note}</p>
                  ) : null}
                </div>
                <Money
                  amount={line.priceTotal}
                  className="flex-none text-[length:var(--fs-b2)] text-ink-hi"
                />
              </div>
            ))}
          </div>

          {order ? (
            <div className="mt-4">
              <MoneyRow label="Tạm tính" value={order.money.sub} />
              {order.money.ship > 0 ? <MoneyRow label="Phí giao" value={order.money.ship} /> : null}
              {order.money.vat > 0 ? <MoneyRow label="Thuế VAT" value={order.money.vat} /> : null}
              <div className="mt-2 flex items-baseline justify-between border-t border-line-1 pt-3">
                <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Tổng</span>
                <Money
                  amount={order.money.total}
                  className="text-[length:var(--fs-t2)] text-accent-ink"
                />
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <SectionLabel>Khách</SectionLabel>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-[length:var(--fs-b2)]">
              <dt className="text-ink-mute">Điện thoại</dt>
              <dd className="font-mono text-ink-hi">
                {order?.customerPhone ? (
                  <a href={`tel:${order.customerPhone}`} className="text-accent-ink">
                    {order.customerPhone}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              {order?.address ? (
                <>
                  <dt className="text-ink-mute">Địa chỉ</dt>
                  <dd className="text-ink-hi">
                    {order.address}
                    {typeof customer.ward === 'string' ? `, ${customer.ward}` : ''}
                  </dd>
                </>
              ) : null}
              {typeof customer.note === 'string' && customer.note ? (
                <>
                  <dt className="text-ink-mute">Ghi chú</dt>
                  <dd className="text-ink-hi">{customer.note}</dd>
                </>
              ) : null}
            </dl>
          </div>

          {order?.type === 'delivery' ? (
            <div className="mt-6">
              <SectionLabel>Shipper</SectionLabel>
              {order.shipper ? (
                <p className="mt-3 text-[length:var(--fs-b2)] text-ink-hi">
                  {order.shipper.name}
                  {order.shipper.phone ? ` · ${order.shipper.phone}` : ''}
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    value={shipperName}
                    onChange={(e) => setShipperName(e.target.value)}
                    placeholder="Tên shipper"
                    className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
                  />
                  <input
                    value={shipperPhone}
                    onChange={(e) => setShipperPhone(e.target.value)}
                    placeholder="Số điện thoại"
                    inputMode="tel"
                    className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 font-mono text-ink-hi"
                  />
                  <Button
                    disabled={shipperName.trim().length < 2 || assign.isPending}
                    onClick={() => assign.mutate()}
                  >
                    Gán shipper
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {order?.cancelReason ? (
            <p className="mt-6 rounded-md border border-danger-line p-4 text-[length:var(--fs-b2)] text-ink-body">
              Đã huỷ: {order.cancelReason}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-none flex-col gap-2 border-t border-line-1 px-6 py-4">
          {(order?.nextStatuses ?? [])
            .filter((next) => next !== 'cancelled')
            .map((next) => (
              <Button
                key={next}
                variant="primary"
                size="lg"
                block
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate(next)}
              >
                {next === 'confirmed' ? 'Xác nhận · xuống bếp' : `Chuyển sang ${STATUS_LABEL[next]}`}
              </Button>
            ))}

          {order && order.status !== 'cancelled' && order.status !== 'done' ? (
            <Button variant="ghost" block className="text-danger" onClick={() => setCancelling(true)}>
              Huỷ đơn
            </Button>
          ) : null}
        </footer>
      </aside>

      <Modal
        open={cancelling}
        title={`Huỷ đơn ${order?.displayCode ?? ''}?`}
        onClose={() => setCancelling(false)}
        footer={
          <>
            <Button onClick={() => setCancelling(false)}>Không huỷ</Button>
            <Button
              variant="danger"
              disabled={!reason.trim() || cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Huỷ đơn này
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[length:var(--fs-b2)] text-ink-body">
            Vé của đơn sẽ được rút khỏi màn bếp. Nếu khách đã chuyển khoản thì phải hoàn tiền tay.
          </p>
          <div className="grid gap-2">
            {REASONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                className={[
                  'h-[var(--hit-target)] rounded-sm border px-4 text-left text-[length:var(--fs-b2)]',
                  reason === option ? 'border-accent text-gold-200' : 'border-line-3 text-ink-body',
                ].join(' ')}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Hoặc gõ lý do khác"
            className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
          />
        </div>
      </Modal>
    </div>
  )
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-[length:var(--fs-b2)] text-ink-mute">{label}</span>
      <Money amount={value} className="text-[length:var(--fs-b2)] text-ink-body" />
    </div>
  )
}
