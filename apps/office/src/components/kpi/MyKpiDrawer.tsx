import { KPI_CYCLE_STATE_LABELS, type KpiReviewDetail } from '@sora/contracts'
import { Badge, Button, ErrorState, GradeChip, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import { Drawer } from '../Drawer'
import { ListHead, SegmentedControl, TextArea } from '../form'
import { formatDateTime } from '../tasks/task-ui'
import { Achievement, cycleLabel, ItemActual, ItemTarget, Score } from './kpi-ui'

/**
 * N1 — Phiếu KPI của chính tôi: số đang được tính, tự đánh giá, xem kết quả.
 *
 * Cùng dữ liệu với N14 trên Kênh nhân viên, cho người làm ở văn phòng không cầm
 * điện thoại (kế toán, nhân sự, marketing). Tự đánh giá chỉ để đối chiếu — điểm
 * tính từ số thật và phần cấp trên chấm. Không có số thưởng ở đây.
 */
export function MyKpiDrawer({
  reviewId,
  onClose,
}: {
  reviewId: number | null
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['kpi', 'mine', reviewId],
    queryFn: () => api.myKpiReview(reviewId!),
    enabled: reviewId !== null,
  })
  const review = detail.data
  return (
    <Drawer
      open={reviewId !== null}
      onClose={onClose}
      width={720}
      title={review ? `KPI ${cycleLabel(review.cycle)}` : 'KPI của tôi'}
      subtitle={
        review ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={review.cycle.state === 'closed' ? 'ok' : 'neutral'}>
              {KPI_CYCLE_STATE_LABELS[review.cycle.state]}
            </Badge>
            <span>
              {review.positionTitle ?? 'Chưa có chức danh'} · Người đánh giá:{' '}
              {review.reviewerName ?? 'chưa có'}
            </span>
          </span>
        ) : undefined
      }
    >
      {detail.isError ? <ErrorState message={(detail.error as Error).message} /> : null}
      {detail.isPending && reviewId !== null ? <Skeleton className="h-64" /> : null}
      {review ? <Mine key={review.id} review={review} /> : null}
    </Drawer>
  )
}

const SCORES = ['1', '2', '3', '4', '5'] as const
type ScoreKey = (typeof SCORES)[number]

function Mine({ review }: { review: KpiReviewDetail }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const rules = review.cycle.rules
  const [scores, setScores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(review.items.map((i) => [i.metricCode, i.selfScore])),
  )
  const [comment, setComment] = useState(review.selfComment ?? '')
  const [feedback, setFeedback] = useState('')

  const refresh = () => {
    for (const key of ['kpi', 'org-inbox']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
  const submit = useMutation({
    mutationFn: () =>
      api.selfReviewKpi(review.id, {
        comment: comment.trim() || null,
        items: review.items.map((i) => ({
          metricCode: i.metricCode,
          selfScore: scores[i.metricCode] ?? null,
        })),
      }),
    onSuccess: () => {
      toast('Đã gửi tự đánh giá', 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  const ack = useMutation({
    mutationFn: () => api.ackKpi(review.id, feedback.trim() || null),
    onSuccess: () => {
      toast('Đã ghi nhận bạn đã xem kết quả', 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end gap-8 rounded-md border border-line-1 bg-canvas px-5 py-4">
        <div>
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            {review.cycle.state === 'closed' ? 'Điểm' : 'Điểm tạm tính'}
          </p>
          <p className="mt-1 text-[length:var(--fs-t1)] text-ink-hi">
            <Score milli={review.scoreMilli} />
          </p>
        </div>
        <div className="pb-1">
          {review.exempt ? (
            <Badge tone="neutral">Miễn đánh giá</Badge>
          ) : (
            <GradeChip grade={review.grade} />
          )}
        </div>
        <p className="ml-auto pb-1 text-[length:var(--fs-c1)] text-ink-mute">
          {review.selfSubmittedAt
            ? `Đã tự đánh giá ${formatDateTime(review.selfSubmittedAt)}`
            : 'Chưa tự đánh giá'}
        </p>
      </section>

      <section>
        <ListHead
          label={`Chỉ số · ${review.items.length}`}
          hint="Tự chấm 1–5 cho từng chỉ số để cấp trên đối chiếu — không cộng vào điểm."
        />
        <div className="grid gap-2">
          {review.items.map((item) => (
            <div
              key={item.metricCode}
              className="rounded-md border border-line-1 bg-surface-2 px-4 py-3"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_120px_150px_140px] items-start gap-4 text-[length:var(--fs-b2)]">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink-hi">{item.label}</span>
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    Trọng số {item.weightPct}%
                    {item.managerScore !== null ? ` · cấp trên chấm ${item.managerScore}/5` : ''}
                  </span>
                </span>
                <ItemTarget item={item} />
                <ItemActual item={item} rules={rules} />
                <Achievement item={item} rules={rules} />
              </div>
              {review.canSelfReview ? (
                <div className="mt-3 flex items-center gap-3 border-t border-line-1 pt-3">
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">Tôi tự chấm</span>
                  <SegmentedControl
                    value={
                      (scores[item.metricCode] == null
                        ? ''
                        : String(scores[item.metricCode])) as ScoreKey
                    }
                    onChange={(next) =>
                      setScores((s) => ({ ...s, [item.metricCode]: Number(next) }))
                    }
                    options={SCORES.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              ) : item.selfScore !== null ? (
                <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                  Bạn tự chấm {item.selfScore}/5
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section>
        <ListHead label="Tự nhận xét" />
        {review.canSelfReview ? (
          <>
            <TextArea
              value={comment}
              onChange={setComment}
              rows={3}
              placeholder="Việc làm tốt, khó khăn trong kỳ, cần hỗ trợ gì"
            />
            <div className="mt-3 flex justify-end">
              <Button variant="primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
                {review.selfSubmittedAt ? 'Gửi lại tự đánh giá' : 'Gửi tự đánh giá'}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[length:var(--fs-b2)] leading-relaxed whitespace-pre-wrap text-ink-body">
            {review.selfComment ?? 'Không có.'}
          </p>
        )}
      </section>

      {review.cycle.state === 'closed' ? (
        <section>
          <ListHead label="Nhận xét của cấp trên" />
          <p className="text-[length:var(--fs-b2)] leading-relaxed whitespace-pre-wrap text-ink-body">
            {review.managerComment ?? 'Không có nhận xét.'}
          </p>
          {review.canAck ? (
            <div className="mt-4 grid gap-3">
              <TextArea
                value={feedback}
                onChange={setFeedback}
                rows={2}
                placeholder="Ý kiến của bạn về kết quả (không bắt buộc)"
              />
              <div className="flex justify-end">
                <Button variant="primary" disabled={ack.isPending} onClick={() => ack.mutate()}>
                  Tôi đã xem kết quả
                </Button>
              </div>
            </div>
          ) : review.employeeAckAt ? (
            <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
              Bạn đã xem kết quả {formatDateTime(review.employeeAckAt)}
              {review.employeeFeedback ? `: “${review.employeeFeedback}”` : '.'}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
