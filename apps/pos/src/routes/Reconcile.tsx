import { Badge, Button, Card, Money, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type ReconcileBoard } from '../api'
import { useSession } from '../session-context'

/** Giờ cao điểm mà quá ngần này phút không có tín hiệu ngân hàng là có chuyện (§21 P15) */
const SILENCE_ALERT_MINUTES = 15

type Group = 'matched' | 'mismatch' | 'unassigned'

/**
 * P15 Đối soát thanh toán tại bàn.
 *
 * Ba nhóm, và thứ tự của chúng là thứ tự việc phải làm: nhóm cần xử lý mở sẵn,
 * nhóm đã khớp gập lại. Đây là màn MỞ THƯỜNG TRỰC trên máy thu ngân, nên nó
 * không được đòi ai bấm gì để thấy phần đang cháy.
 */
export function Reconcile() {
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Group>('mismatch')
  const [assigning, setAssigning] = useState<ReconcileBoard['unassigned'][number] | null>(null)

  const board = useQuery({
    queryKey: ['reconcile', branchId],
    queryFn: () => api.reconcile(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 20_000,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['reconcile', branchId] })
    void queryClient.invalidateQueries({ queryKey: ['tables'] })
  }

  const accept = useMutation({
    mutationFn: (paymentId: number) => api.acceptMismatch(paymentId),
    onSuccess: (r) => {
      toast(`Đã ghi ${r.credited.toLocaleString('vi-VN')}₫, bỏ qua ${r.gap.toLocaleString('vi-VN')}₫`, 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const topUp = useMutation({
    mutationFn: (paymentId: number) => api.requestTopUp(paymentId),
    onSuccess: (r) => {
      toast(`Đã ghi ${r.credited.toLocaleString('vi-VN')}₫ — còn thiếu nằm ở bill của bàn`, 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const assign = useMutation({
    mutationFn: (input: { bankEventId: number; sessionId: number }) =>
      api.assignBankEvent(input.bankEventId, input.sessionId),
    onSuccess: (r) => {
      toast(`Đã gán ${r.credited.toLocaleString('vi-VN')}₫ vào bill`, 'ok')
      setAssigning(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const data = board.data
  const silentMinutes = data?.lastEventAt
    ? Math.round((new Date(data.serverNow).getTime() - new Date(data.lastEventAt).getTime()) / 60_000)
    : null
  /**
   * Banner đỏ chỉ kêu khi CÓ khách đang chờ tiền về mà ngân hàng im lặng. Kêu
   * cả lúc không ai quét QR thì vài ngày sau không ai còn đọc nó nữa.
   */
  const silent =
    (data?.pending.count ?? 0) > 0 &&
    (silentMinutes === null || silentMinutes >= SILENCE_ALERT_MINUTES)

  return (
    <div className="relative flex h-[calc(100dvh-56px)] flex-col">
      <header className="flex flex-none items-start gap-4 border-b border-line-1 px-6 py-4">
        <div>
          <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
            Đối soát thanh toán tại bàn
          </h1>
          <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
            {data?.businessDate ?? '—'} · so khớp bill với giao dịch VietQR
          </p>
        </div>
        <Button variant="ghost" className="ml-auto" onClick={() => void navigate('/dong-ca')}>
          Về đóng ca
        </Button>
      </header>

      {silent ? (
        <div className="mx-6 mt-4 flex flex-none items-center gap-3 rounded-md border border-danger bg-danger/10 px-4.5 py-3.5">
          <span className="text-danger">●</span>
          <p className="text-[length:var(--fs-b1)] text-ink-hi">
            {data?.pending.count} lượt trả đang chờ mà {formatSilence(silentMinutes)} không nhận
            được tín hiệu ngân hàng — kiểm tra kết nối rồi đối soát lại.
          </p>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {board.isPending ? <p className="text-ink-mute">Đang tải…</p> : null}

        <GroupBlock
          label="Lệch số tiền"
          hint="Cần xử lý"
          tone="warn"
          count={data?.mismatch.length ?? 0}
          open={open === 'mismatch'}
          onToggle={() => setOpen('mismatch')}
        >
          {(data?.mismatch ?? []).map((row) => (
            <div
              key={row.paymentId}
              className="flex flex-wrap items-center gap-3 border-b border-line-1 px-5 py-3.5 last:border-0"
            >
              <span className="w-14 text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                {row.tableCode ?? '—'}
              </span>
              <span className="text-[length:var(--fs-b2)] text-ink-mute">
                Chờ <Money amount={row.expected} /> · nhận <Money amount={row.received} />
              </span>
              <Badge tone={row.diff < 0 ? 'danger' : 'warn'}>
                {row.diff > 0 ? '+' : '−'}
                {Math.abs(row.diff).toLocaleString('vi-VN')}₫
              </Badge>
              <span className="ml-auto font-mono text-[length:var(--fs-c1)] text-ink-mute">
                VA {row.vaNumber ?? '—'} · {row.bankRef}
              </span>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button disabled={accept.isPending} onClick={() => accept.mutate(row.paymentId)}>
                  Chấp nhận
                </Button>
                <Button disabled={topUp.isPending} onClick={() => topUp.mutate(row.paymentId)}>
                  Yêu cầu bù
                </Button>
              </div>
            </div>
          ))}
          {(data?.mismatch.length ?? 0) === 0 ? <Empty>Không có khoản nào lệch.</Empty> : null}
        </GroupBlock>

        <GroupBlock
          label="Chưa gán"
          hint="Tiền đã vào, chưa biết của bàn nào"
          tone="neutral"
          count={data?.unassigned.length ?? 0}
          open={open === 'unassigned'}
          onToggle={() => setOpen('unassigned')}
        >
          {(data?.unassigned ?? []).map((row) => (
            <div
              key={row.bankEventId}
              className="flex flex-wrap items-center gap-3 border-b border-line-1 px-5 py-3.5 last:border-0"
            >
              <Money amount={row.amount} className="text-[length:var(--fs-b1)] text-ink-hi" />
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                VA {row.vaNumber ?? '—'} · {row.bankRef} ·{' '}
                {new Date(row.receivedAt).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <Button className="ml-auto" onClick={() => setAssigning(row)}>
                Gán vào bill
              </Button>
            </div>
          ))}
          {(data?.unassigned.length ?? 0) === 0 ? (
            <Empty>Không còn giao dịch nào chờ gán.</Empty>
          ) : null}
        </GroupBlock>

        <GroupBlock
          label="Đã khớp"
          hint="Không cần làm gì"
          tone="ok"
          count={data?.matched.length ?? 0}
          open={open === 'matched'}
          onToggle={() => setOpen('matched')}
        >
          {(data?.matched ?? []).map((row) => (
            <div
              key={row.paymentId}
              className="flex flex-wrap items-center gap-3 border-b border-line-1 px-5 py-3.5 last:border-0"
            >
              <span className="w-14 text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                {row.tableCode ?? '—'}
              </span>
              <Money amount={row.amount} className="text-ink-body" />
              <span className="ml-auto font-mono text-[length:var(--fs-c1)] text-ink-mute">
                VA {row.vaNumber ?? '—'} · {row.bankRef ?? '—'} ·{' '}
                {row.paidAt
                  ? new Date(row.paidAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </span>
            </div>
          ))}
          {(data?.matched.length ?? 0) === 0 ? <Empty>Chưa có giao dịch nào trong ngày.</Empty> : null}
        </GroupBlock>
      </div>

      {assigning ? (
        <AssignPanel
          amount={assigning.amount}
          bankRef={assigning.bankRef}
          busy={assign.isPending}
          onClose={() => setAssigning(null)}
          onPick={(sessionId) => assign.mutate({ bankEventId: assigning.bankEventId, sessionId })}
        />
      ) : null}
    </div>
  )
}

/** "18 phút" · "3 tiếng" · "cả hôm nay" — đọc lướt là hiểu, không phải nhẩm */
function formatSilence(minutes: number | null): string {
  if (minutes === null) return 'cả hôm nay chưa'
  if (minutes < 90) return `đã ${minutes} phút`
  if (minutes < 24 * 60) return `đã ${Math.round(minutes / 60)} tiếng`
  return 'hơn một ngày'
}

function GroupBlock({
  label,
  hint,
  tone,
  count,
  open,
  onToggle,
  children,
}: {
  label: string
  hint: string
  tone: 'ok' | 'warn' | 'neutral'
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Card className="mb-4 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <Badge tone={tone === 'neutral' ? 'neutral' : tone}>{count}</Badge>
        <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">{label}</span>
        <span className="ml-auto text-[length:var(--fs-c1)] text-ink-mute">{hint}</span>
      </button>
      {open ? <div className="border-t border-line-1 bg-surface-0">{children}</div> : null}
    </Card>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">{children}</p>
}

/**
 * Chọn bàn để gán khoản tiền mồ côi.
 *
 * Chỉ hiện bàn CÒN NỢ TIỀN: gán vào bàn đã trả đủ thì máy chủ từ chối, và một
 * danh sách toàn nút bấm-là-lỗi thì không phải danh sách để chọn.
 */
function AssignPanel({
  amount,
  bankRef,
  busy,
  onClose,
  onPick,
}: {
  amount: number
  bankRef: string
  busy: boolean
  onClose: () => void
  onPick: (sessionId: number) => void
}) {
  const { branchId } = useSession()
  const tables = useQuery({
    queryKey: ['tables', branchId],
    queryFn: () => api.tables(branchId!),
    enabled: Boolean(branchId),
  })

  const candidates = (tables.data ?? []).filter(
    (t) => t.session && t.session.paymentState !== 'paid' && t.session.total > 0,
  )

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-[420px] flex-col border-l border-line-2 bg-surface-1">
      <header className="flex items-start gap-3 border-b border-line-1 px-5 py-4">
        <div>
          <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">Gán vào bill nào?</h2>
          <p className="mt-1.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {bankRef} · <Money amount={amount} />
          </p>
        </div>
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          ×
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {candidates.length === 0 ? (
          <p className="text-ink-mute">Không có bàn nào đang nợ tiền.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {candidates.map((t) => (
              <Button
                key={t.id}
                block
                disabled={busy}
                onClick={() => onPick(t.session!.id)}
                className="justify-between"
              >
                <span>Bàn {t.code}</span>
                <Money amount={t.session!.total} />
              </Button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
