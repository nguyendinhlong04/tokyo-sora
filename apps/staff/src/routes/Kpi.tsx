import {
  formatKpiScore,
  KPI_CYCLE_STATE_LABELS,
  type KpiCycleView,
  type KpiReviewRow,
} from '@sora/contracts'
import {
  Badge,
  EmberBar,
  EmptyState,
  ErrorState,
  GradeChip,
  KPI_GRADE_HEAT,
  SectionLabel,
  Skeleton,
} from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { KpiSheet } from './KpiSheet'

/**
 * N14 — KPI của tôi.
 *
 * Mỗi kỳ một thẻ: điểm (tạm tính khi kỳ còn chạy), hạng, và việc đang chờ mình —
 * tự đánh giá hoặc xem kết quả. Số tiền doanh thu, giá vốn không hiện trên điện
 * thoại (chỉ % đạt), và không bao giờ có số thưởng: thưởng là việc của kỳ lương.
 */

export function cycleTitle(c: Pick<KpiCycleView, 'kind' | 'periodStart' | 'periodEnd'>) {
  const [y, m] = c.periodStart.split('-')
  if (c.kind === 'thang') return `Tháng ${Number(m)}/${y}`
  return `Quý · tháng ${Number(m)}–${Number(c.periodEnd.split('-')[1])}/${y}`
}

const selfDue = (r: KpiReviewRow) =>
  (r.cycleState === 'open' || r.cycleState === 'review') &&
  !r.selfSubmittedAt &&
  !r.finalizedAt &&
  !r.exempt

export function Kpi() {
  const list = useQuery({ queryKey: ['kpi'], queryFn: api.myKpi })
  const [openId, setOpenId] = useState<number | null>(null)

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    )
  }
  if (list.isError) return <ErrorState message={(list.error as Error).message} />
  if (list.data.length === 0) {
    return <EmptyState title="Bạn chưa có phiếu KPI nào — phiếu có khi quản lý mở kỳ đánh giá." />
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>KPI của tôi</SectionLabel>
      {list.data.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => setOpenId(r.id)}
          className="flex min-h-[var(--hit-target)] flex-col gap-2 rounded-md border border-line-2 bg-surface-1 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[length:var(--fs-b1)] font-semibold text-ink-hi">
              {cycleTitle({
                kind: r.cycleKind,
                periodStart: r.periodStart,
                periodEnd: r.periodEnd,
              })}
            </span>
            {selfDue(r) ? (
              <Badge tone="warn">Cần tự đánh giá</Badge>
            ) : (
              <span className="text-[length:var(--fs-c1)] text-ink-mute">
                {KPI_CYCLE_STATE_LABELS[r.cycleState]}
              </span>
            )}
          </span>
          {r.exempt ? (
            <span className="text-[length:var(--fs-b2)] text-ink-mute">Miễn đánh giá kỳ này</span>
          ) : (
            <>
              <span className="flex items-center gap-3">
                <span className="text-[length:var(--fs-t2)] text-ink-hi">
                  {r.scoreMilli === null ? (
                    <span className="text-ink-mute">—</span>
                  ) : (
                    <span className="font-mono tabular-nums">{formatKpiScore(r.scoreMilli)}</span>
                  )}
                </span>
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  {r.cycleState === 'closed' ? 'điểm' : 'điểm tạm tính'}
                </span>
                <span className="ml-auto">
                  <GradeChip grade={r.grade} />
                </span>
              </span>
              {r.scoreMilli !== null && r.grade !== null ? (
                <EmberBar
                  fill={r.scoreMilli / 120_000}
                  heat={KPI_GRADE_HEAT[r.grade]}
                  label={`Điểm ${formatKpiScore(r.scoreMilli)}, hạng ${r.grade}`}
                />
              ) : null}
            </>
          )}
        </button>
      ))}
      <KpiSheet reviewId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
