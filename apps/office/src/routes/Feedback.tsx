import { formatVnd } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type FeedbackItem } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * B13 — Phản hồi khách.
 *
 * §G.1 nói vì sao màn này tồn tại: "Vòng khách kết thúc ở thanh toán mà không có
 * tai nghe — món dở không ai biết cho tới khi vắng khách."
 *
 * Hàng đợi hiện NGUYÊN MÓN trong bill cạnh mỗi lời phàn nàn. Một câu "đồ ăn dở"
 * không hành động được; "đồ ăn dở + bill có nầm bò và lẩu kim chi" thì bếp trưởng
 * biết hỏi ai. Và điểm theo món là điểm của cả bill gán cho từng món — nói rõ ở
 * đầu bảng, vì hiểu nhầm chỗ này dẫn tới bỏ một món chỉ vì nó hay đi cùng món dở.
 */

const monthStart = () => {
  const at = new Date()
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

export function Feedback() {
  const { branchId } = useSession()
  const [showResolved, setShowResolved] = useState(false)
  const [range, setRange] = useState({ from: monthStart(), to: new Date().toISOString().slice(0, 10) })

  const queue = useQuery({
    queryKey: ['feedback', branchId, showResolved],
    queryFn: () => api.feedbackQueue(branchId!, showResolved),
    enabled: Boolean(branchId),
  })
  const summary = useQuery({
    queryKey: ['feedback-summary', branchId, range.from, range.to],
    queryFn: () => api.feedbackSummary(branchId!, range.from, range.to),
    enabled: Boolean(branchId),
  })

  const stars = queue.data?.rules['feedback.complaintStars'] ?? 3
  const items = queue.data?.items ?? []
  const open = items.filter((i) => i.state !== 'resolved')

  return (
    <>
      <PageHeader
        title="Phản hồi khách"
        subtitle={`Nguồn là khối đánh giá 1 chạm sau khi khách trả tiền. Từ ${stars} sao trở xuống thành khiếu nại phải có người xử lý — hai ngưỡng đó đặt ở Trung tâm tham số A6.`}
        action={
          <Button onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? 'Chỉ việc chưa xong' : 'Xem cả đã xử lý'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <section className="flex flex-wrap items-end gap-5 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
          <Field label="Thống kê từ ngày">
            <DateInput value={range.from} onChange={(from) => setRange({ ...range, from })} />
          </Field>
          <Field label="Đến ngày">
            <DateInput value={range.to} onChange={(to) => setRange({ ...range, to })} />
          </Field>

          {summary.data ? (
            <div className="ml-auto flex gap-6">
              <Stat
                label="Điểm trung bình"
                value={summary.data.overall.count === 0 ? '—' : summary.data.overall.average.toFixed(2)}
                note={`${summary.data.overall.count} lượt đánh giá`}
              />
              <Stat
                label="1 sao"
                value={String(summary.data.overall.oneStar)}
                note="lượt trong kỳ"
                danger={summary.data.overall.oneStar > 0}
              />
              <Stat
                label="Chưa xử lý xong"
                value={String(summary.data.overall.open)}
                note="khiếu nại"
                danger={summary.data.overall.open > 0}
              />
            </div>
          ) : null}
        </section>

        {queue.isError ? <ErrorState message={(queue.error as Error).message} /> : null}

        <p className="mt-5 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          Hàng đợi khiếu nại {open.length > 0 ? `· ${open.length} việc` : ''}
        </p>

        <div className="mt-2 flex flex-col gap-3">
          {queue.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : items.length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">
              Không có khiếu nại nào. Khối đánh giá 1 chạm nằm ở màn hoá đơn của khách (T15) và màn
              theo dõi đơn online (O7) — hai bề mặt đó chưa dựng thì hàng đợi này còn trống.
            </p>
          ) : (
            items.map((item) => <ComplaintCard key={item.id} item={item} branchId={branchId!} />)
          )}
        </div>

        {summary.data && summary.data.byDish.length > 0 ? (
          <section className="mt-6 rounded-md border border-line-1 bg-surface-1 p-5">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Món hay xuất hiện trong bill bị chấm thấp
            </p>
            <p className="mt-1.5 max-w-[760px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Đây là điểm của CẢ BILL gán cho từng món trong bill, không phải điểm khách chấm riêng
              cho món đó. Dùng để biết chỗ nào cần đi hỏi, không dùng để cắt món.
            </p>
            <div className="mt-3 flex flex-col">
              {summary.data.byDish.map((dish) => (
                <div
                  key={dish.dishId}
                  className="grid grid-cols-[1fr_120px_120px] items-baseline gap-3 border-b border-line-1 py-2 last:border-b-0"
                >
                  <span className="text-[length:var(--fs-c1)] text-ink-body">{dish.name}</span>
                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {dish.count} bill
                  </span>
                  <span
                    className={`text-right font-mono text-[length:var(--fs-c1)] ${
                      dish.billAverage < 3 ? 'text-danger' : 'text-ink-hi'
                    }`}
                  >
                    {dish.billAverage.toFixed(2)} sao
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}

function ComplaintCard({ item, branchId }: { item: FeedbackItem; branchId: string }) {
  const { can, staff } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [resolution, setResolution] = useState('')
  const [closing, setClosing] = useState(false)

  const mayRespond = can('feedback.respond')
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['feedback', branchId] })
    void queryClient.invalidateQueries({ queryKey: ['feedback-summary', branchId] })
  }

  return (
    <section
      className={`rounded-md border bg-surface-1 p-5 ${
        item.overdue ? 'border-danger-line' : 'border-line-1'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-[length:var(--fs-t1)] text-danger">
          {'★'.repeat(item.stars)}
          <span className="text-line-4">{'★'.repeat(5 - item.stars)}</span>
        </span>
        <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
          {item.displayCode} · {formatDay(item.businessDate)} · {formatVnd(item.moneyTotal)}
        </span>
        <Badge tone={item.source === 'table' ? 'neutral' : 'accent'}>
          {item.source === 'table' ? 'Tại bàn' : 'Online'}
        </Badge>
        {item.state === 'resolved' ? (
          <Badge tone="neutral">Đã xử lý</Badge>
        ) : item.overdue ? (
          <Badge tone="warn">Quá hạn phản hồi</Badge>
        ) : item.dueAt ? (
          <span className="text-[length:var(--fs-c1)] text-ink-mute">
            hạn {new Date(item.dueAt).toLocaleString('vi-VN')}
          </span>
        ) : null}
        {item.assignedName ? (
          <span className="text-[length:var(--fs-c1)] text-ink-body">→ {item.assignedName}</span>
        ) : null}
      </div>

      {item.comment ? (
        <p className="mt-3 border-l-2 border-line-3 pl-3 text-[length:var(--fs-b2)] leading-relaxed text-ink-hi">
          {item.comment}
        </p>
      ) : (
        <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
          Khách chấm sao nhưng không viết gì — món trong bill là manh mối duy nhất.
        </p>
      )}

      {item.dishes.length > 0 ? (
        <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
          Bill có:{' '}
          <span className="text-ink-body">
            {item.dishes.map((d) => `${d.name}${d.qty > 1 ? ` ×${d.qty}` : ''}`).join(' · ')}
          </span>
        </p>
      ) : null}

      {item.state === 'resolved' ? (
        <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ok">
          Đã xử lý: {item.resolution}
        </p>
      ) : mayRespond ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {item.state === 'new' && staff ? (
            <Button
              onClick={() =>
                api
                  .assignFeedback(item.id)
                  .then(() => {
                    toast('Đã nhận việc', 'ok')
                    refresh()
                  })
                  .catch((err: Error) => toast(err.message, 'danger'))
              }
            >
              Tôi nhận việc này
            </Button>
          ) : null}

          {closing ? (
            <>
              <Field label="Đã xử lý thế nào">
                <input
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="Đã gọi xin lỗi, tặng phiếu 100k"
                  className="h-9 w-[420px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
                />
              </Field>
              <Button onClick={() => setClosing(false)}>Bỏ</Button>
              <Button
                variant="primary"
                disabled={!resolution.trim()}
                onClick={() =>
                  api
                    .resolveFeedback(item.id, resolution.trim())
                    .then(() => {
                      toast('Đã đóng khiếu nại', 'ok')
                      setClosing(false)
                      refresh()
                    })
                    .catch((err: Error) => toast(err.message, 'danger'))
                }
              >
                Đóng khiếu nại
              </Button>
            </>
          ) : (
            <Button onClick={() => setClosing(true)}>Đóng khiếu nại</Button>
          )}
        </div>
      ) : null}
    </section>
  )
}

function Stat({
  label,
  value,
  note,
  danger,
}: {
  label: string
  value: string
  note: string
  danger?: boolean
}) {
  return (
    <div>
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-[length:var(--fs-t1)] leading-none ${
          danger ? 'text-danger' : 'text-ink-hi'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">{note}</p>
    </div>
  )
}
