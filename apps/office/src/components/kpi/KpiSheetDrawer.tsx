import {
  formatKpiScore,
  formatVnd,
  KPI_CYCLE_STATE_LABELS,
  KPI_METRICS,
  KPI_UNIT_LABELS,
  type KpiItemView,
  type KpiReviewDetail,
} from '@sora/contracts'
import { Badge, Button, ErrorState, GradeChip, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import { useSession } from '../../session-context'
import { ReasonPrompt } from '../approval'
import { Drawer } from '../Drawer'
import {
  Field,
  ListHead,
  NumberInput,
  SegmentedControl,
  TextArea,
  TextInput,
  Toggle,
} from '../form'
import { formatDateTime } from '../tasks/task-ui'
import { Achievement, cycleLabel, ItemActual, ItemTarget, Score, SOURCE_LABELS } from './kpi-ui'

/**
 * N10 — Một phiếu KPI: chỉ tiêu, số thật, % đạt, phần quản lý chấm.
 *
 * Người đánh giá (cấp trên chụp lúc mở kỳ) chấm phần nhập tay 1–5, loại chỉ số có
 * dữ liệu sai kèm lý do, nhận xét, rồi kết thúc phiếu. Người quản lý kỳ đổi chỉ
 * tiêu riêng (kèm lý do) khi kỳ còn nháp hoặc đang chạy, hoặc miễn đánh giá người
 * nghỉ dài. Thưởng gợi ý chỉ có trong dữ liệu khi người xem được xem lương người
 * khác — màn này không tự suy ra.
 */
export function KpiSheetDrawer({
  reviewId,
  onClose,
}: {
  reviewId: number | null
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['kpi-review', reviewId],
    queryFn: () => api.kpiReview(reviewId!),
    enabled: reviewId !== null,
  })
  const review = detail.data
  return (
    <Drawer
      open={reviewId !== null}
      onClose={onClose}
      width={720}
      title={review ? review.fullName : 'Phiếu KPI'}
      subtitle={
        review ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={review.cycle.state === 'closed' ? 'ok' : 'neutral'}>
              {KPI_CYCLE_STATE_LABELS[review.cycle.state]}
            </Badge>
            <span>
              {review.positionTitle ?? 'Chưa có chức danh'} · {cycleLabel(review.cycle)} · Người
              đánh giá: {review.reviewerName ?? 'chưa có'}
            </span>
          </span>
        ) : undefined
      }
    >
      {detail.isError ? <ErrorState message={(detail.error as Error).message} /> : null}
      {detail.isPending && reviewId !== null ? <Skeleton className="h-64" /> : null}
      {review ? (
        <Sheet key={`${review.id}|${review.cycle.lastComputedAt}`} review={review} />
      ) : null}
    </Drawer>
  )
}

type Draft = { score: number | null; excluded: boolean; reason: string }

function Sheet({ review }: { review: KpiReviewDetail }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const rules = review.cycle.rules
  const manageCycle = can('kpi.cycle-manage') && review.cycle.state !== 'closed'
  const targetsOpen = review.cycle.state === 'draft' || review.cycle.state === 'open'
  const [comment, setComment] = useState(review.managerComment ?? '')
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      review.items.map((i) => [
        i.metricCode,
        {
          score: i.managerScore,
          excluded: i.excludedReason !== null,
          reason: i.excludedReason ?? '',
        },
      ]),
    ),
  )
  const [confirming, setConfirming] = useState(false)
  const [exempting, setExempting] = useState(false)

  const refresh = () => {
    for (const key of ['kpi-review', 'kpi-reviews', 'kpi-cycles', 'org-inbox']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const missingReason = review.items.some((i) => {
    const d = drafts[i.metricCode]
    return d?.excluded && !d.reason.trim()
  })

  const saveScores = () =>
    api.scoreKpiReview(review.id, {
      comment: comment.trim() || null,
      items: review.items.map((i) => {
        const d = drafts[i.metricCode]!
        return i.source === 'nhap-tay'
          ? { metricCode: i.metricCode, managerScore: d.score }
          : { metricCode: i.metricCode, excludedReason: d.excluded ? d.reason.trim() : null }
      }),
    })

  const save = useMutation({
    mutationFn: saveScores,
    onSuccess: () => {
      toast('Đã lưu phần chấm', 'ok')
      refresh()
    },
    onError: fail,
  })
  const finalize = useMutation({
    mutationFn: async () => {
      if (review.canManagerReview) await saveScores()
      return api.finalizeKpiReview(review.id)
    },
    onSuccess: () => {
      toast('Đã kết thúc đánh giá phiếu này', 'ok')
      setConfirming(false)
      refresh()
    },
    onError: fail,
  })
  const exempt = useMutation({
    mutationFn: (reason: string | null) => api.setKpiExempt(review.id, reason),
    onSuccess: (_, reason) => {
      toast(reason ? 'Đã miễn đánh giá' : 'Đã bỏ miễn đánh giá', 'ok')
      setExempting(false)
      refresh()
    },
    onError: fail,
  })

  const coverage = review.coverageMilli
  const lowCoverage =
    coverage !== null && rules !== null && coverage / 10 < rules.minCoveragePct && !review.exempt

  return (
    <div className="grid gap-6">
      <section className="grid grid-cols-[auto_auto_1fr] items-end gap-x-8 gap-y-2 rounded-md border border-line-1 bg-canvas px-5 py-4">
        <div>
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Điểm
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
        <div className="grid justify-items-end gap-1 pb-1 text-[length:var(--fs-c1)]">
          {coverage !== null ? (
            <span className={lowCoverage ? 'text-danger-line' : 'text-ink-mute'}>
              Độ phủ dữ liệu {formatKpiScore(coverage * 100)}%
              {lowCoverage ? ` — dưới ${rules!.minCoveragePct}%, không xếp loại` : ''}
            </span>
          ) : null}
          {'suggestedBonusVnd' in review && review.suggestedBonusVnd != null ? (
            <span className="text-ink-body">
              Thưởng gợi ý{' '}
              <span className="font-mono tabular-nums text-ink-hi">
                {formatVnd(review.suggestedBonusVnd)}
              </span>
            </span>
          ) : null}
          <span className="text-ink-mute">
            {review.selfSubmittedAt
              ? `Đã tự đánh giá ${formatDateTime(review.selfSubmittedAt)}`
              : 'Chưa tự đánh giá'}
            {review.finalizedAt ? ` · kết thúc ${formatDateTime(review.finalizedAt)}` : ''}
          </span>
        </div>
      </section>

      {review.items.length === 0 ? (
        <p className="text-[length:var(--fs-b2)] text-ink-body">
          Phiếu không có chỉ số — chức danh lúc mở kỳ chưa có bộ KPI (N9).
        </p>
      ) : (
        <section>
          <ListHead
            label={`Chỉ số · ${review.items.length}`}
            hint="Thiếu dữ liệu là “không tính”, không phải 0 — chỉ số đó không kéo điểm xuống."
          />
          <div className="grid gap-2">
            {review.items.map((item) => (
              <ItemRow
                key={item.metricCode}
                reviewId={review.id}
                item={item}
                rules={rules}
                draft={drafts[item.metricCode]!}
                editable={review.canManagerReview}
                targetEditable={manageCycle && targetsOpen && !item.masked}
                onDraft={(next) => setDrafts((d) => ({ ...d, [item.metricCode]: next }))}
                onTargetSaved={refresh}
              />
            ))}
          </div>
        </section>
      )}

      {review.selfComment ? (
        <section>
          <ListHead label="Nhân viên tự nhận xét" />
          <p className="text-[length:var(--fs-b2)] leading-relaxed whitespace-pre-wrap text-ink-body">
            {review.selfComment}
          </p>
        </section>
      ) : null}

      <section>
        <ListHead label="Nhận xét của người đánh giá" />
        {review.canManagerReview ? (
          <TextArea
            value={comment}
            onChange={setComment}
            rows={3}
            placeholder="Điều làm tốt, điều cần sửa, mục tiêu kỳ sau"
          />
        ) : (
          <p className="text-[length:var(--fs-b2)] leading-relaxed whitespace-pre-wrap text-ink-body">
            {review.managerComment ?? 'Chưa có nhận xét.'}
          </p>
        )}
      </section>

      {review.employeeAckAt ? (
        <p className="rounded-sm border border-line-1 bg-canvas px-4 py-3 text-[length:var(--fs-b2)] text-ink-hi">
          Nhân viên đã xem kết quả {formatDateTime(review.employeeAckAt)}
          {review.employeeFeedback ? `: “${review.employeeFeedback}”` : '.'}
        </p>
      ) : null}

      {manageCycle ? (
        exempting ? (
          <ReasonPrompt
            label="Miễn đánh giá"
            placeholder="Nghỉ thai sản, nghỉ dài ngày, mới chuyển chức danh…"
            busy={exempt.isPending}
            onCancel={() => setExempting(false)}
            onConfirm={(reason) => exempt.mutate(reason)}
          />
        ) : review.exempt ? (
          review.items.length > 0 ? (
            <div>
              <Button size="sm" disabled={exempt.isPending} onClick={() => exempt.mutate(null)}>
                Bỏ miễn đánh giá
              </Button>
            </div>
          ) : null
        ) : (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setExempting(true)}>
              Miễn đánh giá…
            </Button>
          </div>
        )
      ) : null}

      {review.canManagerReview || review.canFinalize ? (
        <div className="grid gap-3 border-t border-line-1 pt-4">
          {missingReason ? (
            <p className="text-[length:var(--fs-c1)] text-danger-line">
              Chỉ số bị loại phải có lý do.
            </p>
          ) : null}
          {confirming ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-[length:var(--fs-b2)] text-ink-body">
                Kết thúc rồi thì phiếu này không sửa được nữa.
              </span>
              <Button size="sm" onClick={() => setConfirming(false)}>
                Thôi
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={finalize.isPending || missingReason}
                onClick={() => finalize.mutate()}
              >
                Kết thúc đánh giá
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              {review.canManagerReview ? (
                <Button disabled={save.isPending || missingReason} onClick={() => save.mutate()}>
                  Lưu phần chấm
                </Button>
              ) : null}
              {review.canFinalize ? (
                <Button variant="primary" onClick={() => setConfirming(true)}>
                  Kết thúc đánh giá…
                </Button>
              ) : null}
            </div>
          )}
          {review.canManagerReview && !review.canFinalize ? (
            <p className="text-right text-[length:var(--fs-c1)] text-ink-mute">
              Kết thúc phiếu được khi kỳ đã vào bước đánh giá.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const SCORES = ['1', '2', '3', '4', '5'] as const
type ScoreKey = (typeof SCORES)[number]

function ItemRow({
  reviewId,
  item,
  rules,
  draft,
  editable,
  targetEditable,
  onDraft,
  onTargetSaved,
}: {
  reviewId: number
  item: KpiItemView
  rules: KpiReviewDetail['cycle']['rules']
  draft: Draft
  editable: boolean
  targetEditable: boolean
  onDraft: (next: Draft) => void
  onTargetSaved: () => void
}) {
  const toast = useToast()
  const def = KPI_METRICS[item.metricCode]
  const [editingTarget, setEditingTarget] = useState(false)
  const [target, setTarget] = useState<number | null>(item.targetMilli / 1000)
  const [note, setNote] = useState('')
  const saveTarget = useMutation({
    mutationFn: () =>
      api.setKpiTarget(reviewId, {
        metricCode: item.metricCode,
        targetMilli: Math.round((target ?? 0) * 1000),
        note: note.trim(),
      }),
    onSuccess: () => {
      toast('Đã đặt chỉ tiêu riêng', 'ok')
      setEditingTarget(false)
      onTargetSaved()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <div className="rounded-md border border-line-1 bg-surface-2 px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_120px_150px_140px] items-start gap-4 text-[length:var(--fs-b2)]">
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-ink-hi" title={def.formula}>
            {item.label}
          </span>
          <span className="text-[length:var(--fs-c1)] text-ink-mute">
            Trọng số {item.weightPct}% · {SOURCE_LABELS[item.source]}
            {item.selfScore !== null ? ` · tự chấm ${item.selfScore}/5` : ''}
          </span>
        </span>
        <ItemTarget item={item} />
        <ItemActual item={item} rules={rules} />
        <Achievement item={item} rules={rules} />
      </div>

      {editable ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line-1 pt-3">
          {item.source === 'nhap-tay' ? (
            <>
              <span className="text-[length:var(--fs-c1)] text-ink-mute">Quản lý chấm</span>
              <SegmentedControl
                value={(draft.score === null ? '' : String(draft.score)) as ScoreKey}
                onChange={(next) => onDraft({ ...draft, score: Number(next) })}
                options={SCORES.map((s) => ({ value: s, label: s }))}
              />
              {draft.score !== null ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDraft({ ...draft, score: null })}
                >
                  Bỏ điểm
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Toggle on={draft.excluded} onChange={(on) => onDraft({ ...draft, excluded: on })}>
                Loại chỉ số này
              </Toggle>
              {draft.excluded ? (
                <TextInput
                  value={draft.reason}
                  onChange={(reason) => onDraft({ ...draft, reason })}
                  placeholder="Lý do: dữ liệu sai, sự kiện bất khả kháng…"
                  className="min-w-[260px] flex-1"
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {targetEditable ? (
        editingTarget ? (
          <div className="mt-3 grid grid-cols-[160px_minmax(0,1fr)_auto] items-end gap-3 border-t border-line-1 pt-3">
            <Field label={`Chỉ tiêu (${KPI_UNIT_LABELS[item.unit]})`}>
              <NumberInput value={target} onChange={setTarget} min={0} />
            </Field>
            <Field label="Lý do đặt riêng">
              <TextInput
                value={note}
                onChange={setNote}
                placeholder="Mới vào nghề, khu đang sửa…"
              />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setEditingTarget(false)}>
                Thôi
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={target === null || !note.trim() || saveTarget.isPending}
                onClick={() => saveTarget.mutate()}
              >
                Lưu chỉ tiêu
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setEditingTarget(true)}
              className="text-[length:var(--fs-c1)] text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Đặt chỉ tiêu riêng cho người này
            </button>
          </div>
        )
      ) : null}
    </div>
  )
}
