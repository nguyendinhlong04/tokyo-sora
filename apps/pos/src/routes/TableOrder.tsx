import { Badge, Button, Card, MenuItemCard, Modal, Money, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api, type OrderLineRow } from '../api'
import { useSession } from '../session-context'

interface PadLine {
  dishId: string
  name: string
  price: number
  qty: number
}

/**
 * P4 Gọi món — ba cột: nhóm · lưới món · phiếu order.
 *
 * Phiếu order dựng ở CLIENT trước, chỉ gửi server khi bấm GỬI BẾP. Nhân viên bấm
 * rất nhanh và hay sửa; gọi API mỗi lần chạm sẽ vừa chậm vừa tạo rác trên đơn.
 */
export function TableOrder() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const tableCode = searchParams.get('code') ?? ''
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [category, setCategory] = useState<string | null>(null)
  const [pad, setPad] = useState<PadLine[]>([])
  const [voiding, setVoiding] = useState<OrderLineRow | null>(null)

  const id = Number(sessionId)

  const config = useQuery({
    queryKey: ['config', branchId],
    queryFn: () => api.config(branchId!),
    enabled: Boolean(branchId),
    staleTime: 5 * 60_000,
  })

  const availability = useQuery({
    queryKey: ['availability', branchId],
    queryFn: () => api.availability(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 15_000,
  })

  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.sessionOrder(id),
    refetchInterval: 10_000,
  })

  const soldOut = useMemo(
    () => new Map((availability.data ?? []).map((a) => [a.dishId, a])),
    [availability.data],
  )

  const categories = config.data?.categories ?? []
  const dishes = (config.data?.dishes ?? []).filter(
    (d) => !category || d.categoryId === category,
  )

  const padTotal = pad.reduce((sum, l) => sum + l.price * l.qty, 0)

  const addLines = useMutation({
    mutationFn: () =>
      api.addLines(
        id,
        pad.map((l) => ({ dishId: l.dishId, qty: l.qty })),
        `Thêm ${pad.length} món bàn ${tableCode}`,
      ),
    onSuccess: () => {
      setPad([])
      void queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const send = useMutation({
    mutationFn: () => api.send(id, tableCode),
    onSuccess: (result) => {
      toast(result ? `Đã gửi bếp — ${result.tickets} vé` : 'Đã xếp hàng, sẽ gửi khi có mạng', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const fire = useMutation({
    mutationFn: (batchNo: number) => api.fireBatch(order.data!.order.id, batchNo),
    onSuccess: () => {
      toast('Đã ra đợt', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const push = (dishId: string, name: string, price: number) => {
    setPad((current) => {
      const existing = current.find((l) => l.dishId === dishId)
      if (existing) {
        return current.map((l) => (l.dishId === dishId ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...current, { dishId, name, price, qty: 1 }]
    })
  }

  const sentLines = (order.data?.lines ?? []).filter(
    (l) => l.state !== 'voided' && l.state !== 'draft',
  )
  const draftLines = (order.data?.lines ?? []).filter((l) => l.state === 'draft')
  const heldBatches = (order.data?.batches ?? []).filter((b) => b.state === 'held')

  return (
    <div className="grid h-[calc(100dvh-56px)] grid-cols-[180px_1fr_360px]">
      {/* Cột trái: nhóm món */}
      <nav className="flex flex-col gap-1 overflow-y-auto border-r border-line-1 p-3">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={[
            'rounded-sm px-3 py-3 text-left text-[length:var(--fs-b2)]',
            category === null ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:bg-surface-2',
          ].join(' ')}
        >
          Tất cả
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={[
              'flex items-center gap-2 rounded-sm px-3 py-3 text-left text-[length:var(--fs-b2)]',
              category === c.id ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:bg-surface-2',
            ].join(' ')}
          >
            {c.kanji ? <span className="font-jp text-accent-ink">{c.kanji}</span> : null}
            {c.nameVi}
          </button>
        ))}
      </nav>

      {/* Cột giữa: lưới món */}
      <div className="overflow-y-auto p-4">
        {config.isPending ? (
          <p className="text-ink-mute">Đang tải thực đơn…</p>
        ) : config.isError ? (
          <Card className="border-warn p-4 text-ink-body">
            Chi nhánh chưa phát hành cấu hình. Vào Office bấm “Lưu &amp; phát hành”.
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
            {dishes.map((d) => {
              const avail = soldOut.get(d.id)
              return (
                <MenuItemCard
                  key={d.id}
                  name={d.nameVi}
                  price={d.price}
                  station={d.routing?.stationGrill ?? null}
                  soldOut={avail?.status === 'sold_out'}
                  remaining={avail?.status === 'limited' ? avail.remaining : null}
                  onClick={() => push(d.id, d.nameVi, d.price)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Cột phải: phiếu order */}
      <aside className="flex flex-col border-l border-line-1 bg-surface-1">
        <header className="flex items-center justify-between border-b border-line-1 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
              Bàn {tableCode}
            </span>
            {order.data ? (
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {order.data.order.displayCode}
              </span>
            ) : null}
          </div>
          <Button variant="ghost" onClick={() => void navigate('/floor')}>
            Sơ đồ
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {pad.length > 0 ? (
            <section className="mb-5 flex flex-col gap-2">
              <SectionLabel>Chưa gửi bếp</SectionLabel>
              {pad.map((line) => (
                <div key={line.dishId} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPad((c) =>
                        c
                          .map((l) => (l.dishId === line.dishId ? { ...l, qty: l.qty - 1 } : l))
                          .filter((l) => l.qty > 0),
                      )
                    }
                    className="h-9 w-9 rounded-sm border border-line-3 text-ink-body"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-mono text-ink-hi">{line.qty}</span>
                  <span className="flex-1 text-[length:var(--fs-b2)] text-ink-body">{line.name}</span>
                  <Money amount={line.price * line.qty} className="text-[length:var(--fs-b2)] text-ink-body" />
                </div>
              ))}
              <Button
                variant="secondary"
                block
                disabled={addLines.isPending}
                onClick={() => addLines.mutate()}
              >
                Thêm vào đơn · <Money amount={padTotal} />
              </Button>
            </section>
          ) : null}

          {draftLines.length > 0 ? (
            <section className="mb-5 flex flex-col gap-2">
              <SectionLabel>Trong đơn, chờ gửi bếp</SectionLabel>
              {draftLines.map((line) => (
                <LineRow key={line.id} line={line} onVoid={() => setVoiding(line)} />
              ))}
            </section>
          ) : null}

          {sentLines.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>Đã gửi bếp</SectionLabel>
              {sentLines.map((line) => (
                <LineRow key={line.id} line={line} onVoid={() => setVoiding(line)} />
              ))}
            </section>
          ) : null}

          {heldBatches.length > 0 ? (
            <section className="mt-5 flex flex-col gap-2">
              <SectionLabel>Đợt đang chờ</SectionLabel>
              {heldBatches.map((b) => (
                <Button key={b.batchNo} onClick={() => fire.mutate(b.batchNo)} block>
                  Ra đợt {b.batchNo}
                </Button>
              ))}
            </section>
          ) : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-line-1 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[length:var(--fs-b2)] text-ink-mute">Tạm tính</span>
            <Money
              amount={order.data?.order.moneyTotal ?? 0}
              className="text-[length:var(--fs-t1)] text-ink-hi"
            />
          </div>
          <Button
            variant="primary"
            size="lg"
            block
            disabled={draftLines.length === 0 || send.isPending}
            onClick={() => send.mutate()}
          >
            GỬI BẾP
          </Button>
          <Button block onClick={() => void navigate(`/table/${id}/pay?code=${tableCode}`)}>
            Tính tiền
          </Button>
        </footer>
      </aside>

      <VoidDialog
        line={voiding}
        onClose={() => setVoiding(null)}
        onDone={() => {
          setVoiding(null)
          void queryClient.invalidateQueries({ queryKey: ['order', id] })
        }}
      />
    </div>
  )
}

function LineRow({ line, onVoid }: { line: OrderLineRow; onVoid: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-center font-mono text-ink-hi">{line.qty}</span>
      <div className="flex flex-1 flex-col">
        <span className="text-[length:var(--fs-b2)] text-ink-body">{line.nameSnapshot}</span>
        {line.setLabel ? (
          <span className="text-[length:var(--fs-c2)] text-accent">[{line.setLabel}]</span>
        ) : null}
      </div>
      {line.state !== 'draft' ? <Badge tone="accent">Đợt {line.batchNo}</Badge> : null}
      <button
        type="button"
        onClick={onVoid}
        className="px-2 text-[length:var(--fs-b2)] text-ink-mute hover:text-danger"
      >
        Huỷ
      </button>
    </div>
  )
}

/**
 * P8 Huỷ món. Món đã gửi bếp cần PIN của NGƯỜI KHÁC đủ quyền — hộp này hiện thêm
 * ô PIN chỉ khi server trả về yêu cầu duyệt, chứ không đoán trước.
 */
function VoidDialog({
  line,
  onClose,
  onDone,
}: {
  line: OrderLineRow | null
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const { branchId } = useSession()
  const [reason, setReason] = useState('')
  const [needsApproval, setNeedsApproval] = useState(false)
  const [approverId, setApproverId] = useState<number | null>(null)
  const [pin, setPin] = useState('')

  const staffQuery = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api.staffList(branchId!),
    enabled: Boolean(branchId) && needsApproval,
  })

  const submit = async () => {
    if (!line) return
    try {
      await api.voidLine(
        line.id,
        {
          reason,
          approval:
            needsApproval && approverId
              ? { approverStaffId: approverId, approverPin: pin, reason }
              : null,
        },
        `Huỷ ${line.nameSnapshot}`,
      )
      toast('Đã huỷ món', 'ok')
      reset()
      onDone()
    } catch (err) {
      const apiError = err as { code?: string; message?: string; body?: { code?: string } }
      if (apiError.body?.code === 'requires_approval' || apiError.code === 'requires_approval') {
        setNeedsApproval(true)
        toast('Món đã lên bếp — cần quản lý duyệt', 'warn')
        return
      }
      toast(apiError.message ?? 'Không huỷ được', 'danger')
    }
  }

  const reset = () => {
    setReason('')
    setNeedsApproval(false)
    setApproverId(null)
    setPin('')
  }

  return (
    <Modal
      open={line !== null}
      title={`Huỷ ${line?.nameSnapshot ?? ''}`}
      onClose={() => {
        reset()
        onClose()
      }}
      footer={
        <>
          <Button
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Không huỷ
          </Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || (needsApproval && (!approverId || pin.length < 4))}
            onClick={submit}
          >
            Huỷ món
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <SectionLabel>Lý do</SectionLabel>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Khách đổi ý"
            className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
          />
        </label>

        {needsApproval ? (
          <div className="flex flex-col gap-3 rounded-md border border-warn p-3">
            <p className="text-[length:var(--fs-b2)] text-warn">
              Món đã gửi bếp — cần quản lý duyệt. Người duyệt phải khác người xin.
            </p>
            <select
              value={approverId ?? ''}
              onChange={(e) => setApproverId(Number(e.target.value))}
              className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
            >
              <option value="">Chọn người duyệt</option>
              {staffQuery.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.roles.join(' · ')})
                </option>
              ))}
            </select>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN người duyệt"
              className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 font-mono text-ink-hi"
            />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
