import {
  formatKpiScore,
  formatKpiValue,
  KPI_CYCLE_STATE_LABELS,
  type KpiItemView,
  type KpiReviewDetail,
  type KpiRules,
} from '@sora/contracts'
import {
  Button,
  EmberBar,
  ErrorState,
  GradeChip,
  KPI_GRADE_HEAT,
  kpiHeat,
  Sheet,
  Skeleton,
  useToast,
} from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { cycleTitle } from './Kpi'

/**
 * N14 — Một phiếu KPI, mở từ đáy màn.
 *
 * Mỗi chỉ số: đạt bao nhiêu % (thanh than hồng + số), chỉ tiêu và số thật khi
 * không phải số tiền. Tự chấm 1–5 từng chỉ số bằng năm nút to — chỉ để cấp trên
 * đối chiếu, không cộng vào điểm. Kỳ chốt rồi thì đọc nhận xét và bấm "Tôi đã xem
 * kết quả", kèm ý kiến nếu muốn — ghi được đúng một lần.
 */
export function KpiSheet({ reviewId, onClose }: { reviewId: number | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['kpi', reviewId],
    queryFn: () => api.myKpiReview(reviewId!),
    enabled: reviewId !== null,
  })
  return (
    <Sheet open={reviewId !== null} onClose={onClose} full>
      <div className="flex min-h-0 flex-1 flex-col">
        {detail.isPending ? (
          <div className="flex flex-col gap-3 px-5 pt-4">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : null}
        {detail.isError ? (
          <div className="px-5 pt-4">
            <ErrorState message={(detail.error as Error).message} />
          </div>
        ) : null}
        {detail.data ? <Body key={detail.data.id} review={detail.data} /> : null}
      </div>
    </Sheet>
  )
}

const SCORES = [1, 2, 3, 4, 5] as const

function Body({ review }: { review: KpiReviewDetail }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [scores, setScores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(review.items.map((i) => [i.metricCode, i.selfScore])),
  )
  const [comment, setComment] = useState(review.selfComment ?? '')
  const [feedback, setFeedback] = useState('')
  const closed = review.cycle.state === 'closed'

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['kpi'] })
    void queryClient.invalidateQueries({ queryKey: ['inbox'] })
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
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          {KPI_CYCLE_STATE_LABELS[review.cycle.state]} ·{' '}
          {review.positionTitle ?? 'Chưa có chức danh'}
        </p>
        <h2 className="mt-1 text-[length:var(--fs-t1)] font-semibold text-ink-hi">
          KPI {cycleTitle(review.cycle)}
        </h2>
        <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
          Người đánh giá: {review.reviewerName ?? 'chưa có'}
        </p>

        {review.exempt ? (
          <p className="mt-4 rounded-sm border border-line-2 px-4 py-3 text-[length:var(--fs-b1)] text-ink-body">
            Bạn được miễn đánh giá kỳ này.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2 rounded-md border border-line-2 bg-surface-2 px-4 py-3">
            <div className="flex items-end gap-3">
              <span className="text-[length:var(--fs-d3)] leading-none text-ink-hi">
                {review.scoreMilli === null ? (
                  <span className="text-ink-mute">—</span>
                ) : (
                  <span className="font-mono tabular-nums">
                    {formatKpiScore(review.scoreMilli)}
                  </span>
                )}
              </span>
              <span className="pb-1 text-[length:var(--fs-c1)] text-ink-mute">
                {closed ? 'điểm' : 'điểm tạm tính'}
              </span>
              <span className="ml-auto pb-1">
                <GradeChip grade={review.grade} />
              </span>
            </div>
            {review.scoreMilli !== null && review.grade !== null ? (
              <EmberBar
                fill={review.scoreMilli / 1000 / (review.cycle.rules?.achievementCapPct ?? 120)}
                heat={KPI_GRADE_HEAT[review.grade]}
                label={`Điểm ${formatKpiScore(review.scoreMilli)}, hạng ${review.grade}`}
              />
            ) : null}
            {review.cycle.rules ? (
              <p className="text-[length:var(--fs-c1)] text-ink-mute">
                A từ {review.cycle.rules.gradeA} · B từ {review.cycle.rules.gradeB} · C từ{' '}
                {review.cycle.rules.gradeC} điểm. Chỉ số thiếu dữ liệu không kéo điểm xuống.
              </p>
            ) : null}
          </div>
        )}

        <ul className="mt-5 flex flex-col gap-3">
          {review.items.map((item) => (
            <li
              key={item.metricCode}
              className="rounded-md border border-line-2 bg-surface-1 px-4 py-3"
            >
              <ItemView item={item} rules={review.cycle.rules} />
              {review.canSelfReview ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[length:var(--fs-c1)] text-ink-mute">Bạn tự chấm</p>
                  <div
                    className="grid grid-cols-5 gap-2"
                    role="radiogroup"
                    aria-label={`Tự chấm ${item.label}`}
                  >
                    {SCORES.map((s) => {
                      const on = scores[item.metricCode] === s
                      return (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setScores((all) => ({ ...all, [item.metricCode]: s }))}
                          className={[
                            'h-[var(--hit-target)] rounded-sm border font-mono text-[length:var(--fs-b1)] tabular-nums',
                            'focus-visible:outline-2 focus-visible:outline-accent',
                            on
                              ? 'border-accent bg-accent/12 font-medium text-accent-ink'
                              : 'border-line-3 text-ink-body',
                          ].join(' ')}
                        >
                          {s}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : item.selfScore !== null ? (
                <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                  Bạn tự chấm {item.selfScore}/5
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {review.canSelfReview ? (
          <label className="mt-5 block">
            <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">
              Tự nhận xét
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Việc làm tốt, khó khăn trong kỳ, cần hỗ trợ gì"
              className="w-full rounded-sm border border-line-3 bg-canvas px-3 py-2 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute"
            />
          </label>
        ) : review.selfComment ? (
          <p className="mt-5 text-[length:var(--fs-b2)] whitespace-pre-wrap text-ink-body">
            Bạn tự nhận xét: {review.selfComment}
          </p>
        ) : null}

        {closed ? (
          <div className="mt-5 flex flex-col gap-2">
            <p className="text-[length:var(--fs-c1)] text-ink-mute">Nhận xét của cấp trên</p>
            <p className="text-[length:var(--fs-b1)] leading-relaxed whitespace-pre-wrap text-ink-hi">
              {review.managerComment ?? 'Không có nhận xét.'}
            </p>
            {review.employeeAckAt ? (
              <p className="text-[length:var(--fs-c1)] text-ink-mute">
                Bạn đã xem kết quả
                {review.employeeFeedback ? `: “${review.employeeFeedback}”` : '.'}
              </p>
            ) : null}
            {review.canAck ? (
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                placeholder="Ý kiến của bạn về kết quả (không bắt buộc)"
                className="w-full rounded-sm border border-line-3 bg-canvas px-3 py-2 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Phím chính ở đáy, trong tầm ngón cái */}
      {review.canSelfReview || review.canAck ? (
        <div className="border-t border-line-2 bg-surface-2 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {review.canSelfReview ? (
            <Button
              block
              variant="primary"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {review.selfSubmittedAt ? 'Gửi lại tự đánh giá' : 'Gửi tự đánh giá'}
            </Button>
          ) : (
            <Button block variant="primary" disabled={ack.isPending} onClick={() => ack.mutate()}>
              Tôi đã xem kết quả
            </Button>
          )}
        </div>
      ) : null}
    </>
  )
}

function ItemView({ item, rules }: { item: KpiItemView; rules: KpiRules | null }) {
  const pct = item.achievementMilli === null ? null : item.achievementMilli / 10
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-[length:var(--fs-b1)] text-ink-hi">{item.label}</span>
        <span className="flex-none text-[length:var(--fs-c1)] text-ink-mute">
          {item.weightPct}%
        </span>
      </div>
      {item.excludedReason ? (
        <p className="text-[length:var(--fs-b2)] text-ink-mute">
          Không tính: {item.excludedReason}
        </p>
      ) : pct === null ? (
        <p className="text-[length:var(--fs-b2)] text-ink-mute">
          {item.source === 'nhap-tay' ? 'Cấp trên chưa chấm' : 'Chưa đủ dữ liệu — không tính'}
        </p>
      ) : (
        <>
          <p className="text-[length:var(--fs-b2)] text-ink-body">
            Đạt{' '}
            <span className="font-mono text-ink-hi tabular-nums">
              {formatKpiScore(item.achievementMilli! * 100)}%
            </span>
          </p>
          <EmberBar
            fill={pct / (rules?.achievementCapPct ?? 120)}
            heat={kpiHeat(pct, rules)}
            label={`${item.label}: đạt ${formatKpiScore(item.achievementMilli! * 100)}%`}
          />
        </>
      )}
      {!item.masked && item.actualMilli !== null ? (
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          Thực tế {formatKpiValue(item.actualMilli, item.unit)} · chỉ tiêu{' '}
          {item.direction === 'thap' ? '≤' : '≥'} {formatKpiValue(item.targetMilli, item.unit)}
        </p>
      ) : item.masked ? (
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          Số tiền không hiện trên điện thoại — chỉ % đạt.
        </p>
      ) : null}
      {item.managerScore !== null && item.source === 'nhap-tay' ? (
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          Cấp trên chấm {item.managerScore}/5
        </p>
      ) : null}
    </div>
  )
}
