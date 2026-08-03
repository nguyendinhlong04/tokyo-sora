import { ApiError } from '@sora/core'
import { Badge, Button, Card, Modal, Money, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api, type TableRow } from '../api'
import { useSession } from '../session-context'

/** Các mức tách tiền hay dùng — gõ số lẻ giữa giờ đông là cách để bấm nhầm */
const PERCENTS = [25, 50, 60, 75]

type Mode = 'item' | 'percent'

/**
 * P9 Chuyển · ghép · tách bàn.
 *
 * Hai chế độ KHÔNG cùng bản chất, và màn này nói thẳng điều đó:
 *
 *  · **Tách theo món** chuyển món sang bill khác — món đi thì tiền đi theo, bếp
 *    nhận vé mới, sổ vẫn cộng đúng.
 *  · **Tách theo %** KHÔNG chuyển gì cả: hai nhóm khách cùng một mâm muốn trả
 *    riêng. Đơn hàng vẫn là một, chỉ có tiền thu làm nhiều lượt — nên nút của nó
 *    dẫn sang màn tính tiền với số tiền đã tính sẵn, chứ không dẫn sang bàn nào.
 *    Bịa một dòng "50% bàn 12" trên đơn bàn khác là bịa một món không có thật,
 *    và mọi báo cáo món (B3) sẽ ăn phải con số đó.
 */
export function TableMove() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const tableCode = searchParams.get('code') ?? ''
  const id = Number(sessionId)
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<Mode>('item')
  const [picked, setPicked] = useState<number[]>([])
  const [percent, setPercent] = useState(50)
  const [merging, setMerging] = useState(false)
  /** Câu hỏi "món sẽ đổi trạm, tiếp tục?" — máy chủ soạn, màn này chỉ hỏi lại */
  const [reroute, setReroute] = useState<{ message: string; run: () => void } | null>(null)

  const order = useQuery({ queryKey: ['order', id], queryFn: () => api.sessionOrder(id) })
  const tables = useQuery({
    queryKey: ['tables', branchId],
    queryFn: () => api.tables(branchId!),
    enabled: Boolean(branchId),
  })

  const lines = (order.data?.lines ?? []).filter(
    (l) => l.state !== 'voided' && l.parentLineId === null,
  )
  const sub = lines.reduce((sum, l) => sum + l.priceTotal, 0)
  const moveAmount = Math.round((sub * percent) / 100)

  const done = (message: string) => {
    toast(message, 'ok')
    setPicked([])
    void queryClient.invalidateQueries({ queryKey: ['order', id] })
    void queryClient.invalidateQueries({ queryKey: ['tables'] })
  }

  /**
   * Máy chủ chặn lần bấm đầu khi món phải đổi trạm. Bắt đúng mã lỗi đó rồi hỏi
   * lại bằng chính câu của máy chủ — màn này không tự đoán món nào đi đâu.
   */
  const withReroute = async <T,>(run: (confirm: boolean) => Promise<T>, onDone: (r: T) => void) => {
    try {
      onDone(await run(false))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'reroute_confirm') {
        setReroute({
          message: err.message,
          run: () => {
            setReroute(null)
            run(true).then(onDone).catch((e: Error) => toast(e.message, 'danger'))
          },
        })
        return
      }
      toast(err instanceof Error ? err.message : 'Không chuyển được', 'danger')
    }
  }

  const transfer = useMutation({
    mutationFn: async (target: TableRow) => {
      const all = picked.length === lines.length && lines.length > 0

      // Chọn HẾT món mà bàn đích đang trống thì đây là "chuyển bàn", không phải
      // tách: giữ nguyên phiên để giờ ngồi và số khách đi theo nhóm khách đó.
      if (!target.session && all) {
        await withReroute(
          (confirm) => api.moveSession(id, target.id, confirm),
          (r) => done(`Đã chuyển sang bàn ${r.tableCode}`),
        )
        return
      }

      await withReroute(
        (confirm) =>
          api.transferLines(id, {
            lineIds: picked,
            targetSessionId: target.session?.id ?? null,
            targetTableId: target.session ? null : target.id,
            guestCount: target.session ? null : 1,
            confirmReroute: confirm,
          }),
        (r) => done(`Đã chuyển ${r.movedLines} món sang bàn ${r.targetTableCode}`),
      )
    },
  })

  const merge = useMutation({
    mutationFn: (target: TableRow) => api.mergeSessions(id, target.session!.id),
    onSuccess: (result, target) => {
      toast(`Đã ghép ${result.movedLines} món vào bàn ${target.code}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      void navigate('/floor')
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const destinations = (tables.data ?? []).filter((t) => t.session?.id !== id)

  return (
    <div className="grid h-[calc(100dvh-56px)] grid-cols-[1fr_420px]">
      {/* Trái: bàn nguồn */}
      <section className="flex min-h-0 flex-col border-r border-line-1">
        <header className="flex flex-none items-start gap-4 border-b border-line-1 px-5 py-4">
          <div>
            <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
              Bàn nguồn · {tableCode}
            </h1>
            <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
              {mode === 'item'
                ? 'Chọn món cần chuyển, rồi chạm bàn đích bên phải.'
                : 'Chia tiền để thu làm nhiều lượt — món vẫn ở bàn này.'}
            </p>
          </div>
          <Button variant="ghost" className="ml-auto" onClick={() => void navigate(`/table/${id}?code=${tableCode}`)}>
            Về đơn
          </Button>
        </header>

        <div className="flex flex-none gap-2 px-5 pt-4">
          <Button
            className="flex-1"
            variant={mode === 'item' ? 'primary' : 'secondary'}
            onClick={() => setMode('item')}
          >
            Tách theo món
          </Button>
          <Button
            className="flex-1"
            variant={mode === 'percent' ? 'primary' : 'secondary'}
            onClick={() => setMode('percent')}
          >
            Tách theo %
          </Button>
        </div>

        {mode === 'item' ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {lines.length === 0 ? (
              <p className="text-ink-mute">Bàn chưa có món nào để chuyển.</p>
            ) : (
              <div className="flex flex-col">
                {lines.map((line) => {
                  const on = picked.includes(line.id)
                  return (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() =>
                        setPicked((c) => (on ? c.filter((x) => x !== line.id) : [...c, line.id]))
                      }
                      className="flex items-center gap-3.5 border-b border-line-1 px-3.5 py-3 text-left"
                    >
                      <span
                        className={[
                          'grid h-5 w-5 flex-none place-items-center rounded-xs border',
                          on ? 'border-accent bg-accent text-on-accent' : 'border-line-3',
                        ].join(' ')}
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className="w-7 flex-none font-mono text-[length:var(--fs-b2)] text-ink-mute">
                        {line.qty}×
                      </span>
                      <span className="flex-1 text-[length:var(--fs-b2)] text-ink-hi">
                        {line.nameSnapshot}
                      </span>
                      {line.state === 'draft' ? (
                        <Badge tone="neutral">chưa gửi bếp</Badge>
                      ) : null}
                      <Money amount={line.priceTotal} className="text-[length:var(--fs-b2)] text-ink-body" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <SectionLabel>Tách tiền theo phần trăm</SectionLabel>
            <div className="mt-3.5 flex gap-2.5">
              {PERCENTS.map((p) => (
                <Button
                  key={p}
                  className="flex-1"
                  size="lg"
                  variant={percent === p ? 'primary' : 'secondary'}
                  onClick={() => setPercent(p)}
                >
                  {p}%
                </Button>
              ))}
            </div>

            <Card className="mt-6 flex flex-col gap-2.5 p-4.5">
              <div className="flex items-baseline justify-between">
                <span className="text-ink-body">Bàn giữ lại</span>
                <Money amount={sub - moveAmount} className="text-ink-hi" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-ink-body">Thu riêng lượt này</span>
                <Money amount={moveAmount} className="text-[length:var(--fs-t1)] text-accent-ink" />
              </div>
            </Card>

            <p className="mt-4 text-[length:var(--fs-c1)] text-ink-mute">
              Đơn vẫn là một bill của bàn {tableCode}; phần còn lại nằm ở “còn phải thu” cho lượt
              tiếp theo.
            </p>
            <Button
              variant="primary"
              size="lg"
              block
              className="mt-4"
              disabled={moveAmount <= 0}
              onClick={() =>
                void navigate(`/table/${id}/pay?code=${tableCode}&thu=${moveAmount}`)
              }
            >
              Thu phần này · <Money amount={moveAmount} />
            </Button>
          </div>
        )}

        {mode === 'item' ? (
          <footer className="flex flex-none items-center gap-4 border-t border-line-1 px-5 py-3.5">
            <span className="text-[length:var(--fs-b2)] text-ink-mute">
              Đã chọn {picked.length} món
            </span>
            <Button
              className="ml-auto"
              variant={merging ? 'primary' : 'secondary'}
              onClick={() => setMerging((m) => !m)}
            >
              {merging ? 'Đang ghép — chọn bàn đích' : 'Ghép cả bàn'}
            </Button>
          </footer>
        ) : null}
      </section>

      {/* Phải: bàn đích */}
      <aside className="flex min-h-0 flex-col bg-surface-1">
        <header className="flex-none border-b border-line-1 px-5 py-4">
          <h2 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Bàn đích</h2>
          <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
            {merging
              ? 'Chạm bàn đang có khách để dồn cả bàn này vào đó.'
              : mode === 'percent'
                ? 'Tách theo % không chuyển món — không cần bàn đích.'
                : 'Chạm để chuyển ngay.'}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2.5">
            {destinations.map((t) => {
              const busy = Boolean(t.session)
              const disabled =
                mode === 'percent' ||
                (merging ? !busy : picked.length === 0) ||
                transfer.isPending ||
                merge.isPending
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => (merging ? merge.mutate(t) : transfer.mutate(t))}
                  className={[
                    'flex flex-col justify-center rounded-sm border p-2.5 text-left',
                    disabled
                      ? 'border-line-1 text-ink-mute opacity-50'
                      : 'border-line-2 bg-surface-2 text-ink-hi hover:border-accent',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[length:var(--fs-t2)] font-bold">{t.code}</span>
                    {t.hasGrill ? <span className="text-accent-ink">🔥</span> : null}
                  </span>
                  <span className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
                    {busy ? `Có khách · ${t.session!.guestCount} người` : 'Trống'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <Modal
        open={reroute !== null}
        title="Món phải đổi trạm bếp"
        onClose={() => setReroute(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReroute(null)}>
              Để nguyên
            </Button>
            <Button variant="primary" onClick={() => reroute?.run()}>
              Chuyển và định tuyến lại
            </Button>
          </>
        }
      >
        <p className="text-[length:var(--fs-b1)] text-ink-body">{reroute?.message}</p>
      </Modal>
    </div>
  )
}
