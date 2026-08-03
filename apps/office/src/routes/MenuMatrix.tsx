import { formatVnd } from '@sora/contracts'
import { EmptyState, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PeriodChoice, type Quadrant } from '../api'
import { PageHeader } from '../components/PageHeader'
import {
  BranchPicker,
  PeriodComparator,
  formatPercent,
  useReportBranch,
} from '../components/report'

/**
 * B3 — Phân tích món.
 *
 * Ma trận Kasavana–Smith: hai trục độc lập, bốn ô, mỗi ô một hành động khác nhau.
 * Giá trị của màn này nằm ở chỗ nó KHÔNG xếp hạng món theo doanh thu — bảng xếp
 * hạng doanh thu chỉ nói lại điều ai cũng biết (món đắt đứng đầu), còn ma trận
 * chỉ ra món nào bán chạy mà không kiếm được tiền, và món nào lãi tốt mà không ai
 * gọi.
 *
 * Cảnh báo phải đọc: trục đóng góp đang chạy trên GIÁ BÁN. Khi có công thức (M4)
 * và giá vốn bình quân từ kho (S2) thì trục này đổi sang lãi gộp và một số món
 * sẽ nhảy ô — nhất là món nướng, thứ có giá bán cao mà nguyên liệu cũng đắt.
 */

const QUADRANTS: Record<Quadrant, { label: string; kanji: string; action: string; ring: string }> =
  {
    'ngoi-sao': {
      label: 'Ngôi sao',
      kanji: '星',
      action: 'Bán chạy, đóng góp cao. Giữ nguyên giá và định lượng, đặt ở chỗ dễ thấy nhất.',
      ring: 'border-accent',
    },
    'bo-sua': {
      label: 'Bò sữa',
      kanji: '牛',
      action:
        'Bán chạy nhưng đóng góp thấp. Tăng giá từng bước nhỏ, hoặc hạ giá vốn — đừng bỏ, đây là món kéo khách.',
      ring: 'border-info',
    },
    'cau-do': {
      label: 'Câu đố',
      kanji: '謎',
      action: 'Đóng góp cao mà ít người gọi. Đổi tên và ảnh, gợi ý bán thêm, thử đưa vào set.',
      ring: 'border-warn',
    },
    'bo-di': {
      label: 'Bỏ đi',
      kanji: '去',
      action:
        'Ít người gọi, đóng góp thấp. Cân nhắc rút khỏi thực đơn; giữ lại thì phải vì lý do khác doanh thu.',
      ring: 'border-danger-line',
    },
  }

const ORDER: Quadrant[] = ['ngoi-sao', 'bo-sua', 'cau-do', 'bo-di']

export function MenuMatrix() {
  const { branchId } = useReportBranch()
  const [period, setPeriod] = useState<PeriodChoice>({ kind: 'thang', compare: 'ky-truoc' })

  const report = useQuery({
    queryKey: ['report-menu-matrix', branchId, period],
    queryFn: () => api.menuMatrix(branchId!, period),
    enabled: Boolean(branchId) && (period.kind !== 'tuy-chon' || Boolean(period.from && period.to)),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Phân tích món"
        subtitle="Bốn ô, bốn hành động khác nhau. Trục ngang là số phần bán ra, trục dọc là đóng góp mỗi phần."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period}>
          <BranchPicker />
        </PeriodComparator>

        {data?.costNote ? (
          <p className="mt-4 rounded-md border border-warn bg-surface-1 px-5 py-3.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
            {data.costNote}
          </p>
        ) : null}

        {report.isError ? (
          <ErrorState message={(report.error as Error).message} />
        ) : !data ? (
          <p className="mt-5 text-ink-mute">Đang tải…</p>
        ) : data.rows.length === 0 ? (
          <EmptyState title="Kỳ này chưa bán món nào." />
        ) : (
          <>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {ORDER.map((quadrant) => {
                const rows = data.rows.filter((r) => r.quadrant === quadrant)
                const spec = QUADRANTS[quadrant]
                return (
                  <section
                    key={quadrant}
                    className={`rounded-md border-l-2 border-y border-r border-line-1 bg-surface-1 p-5 ${spec.ring}`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-jp text-[length:var(--fs-t2)] text-accent">
                        {spec.kanji}
                      </span>
                      <h2 className="text-[length:var(--fs-t2)] text-ink-hi">{spec.label}</h2>
                      <span className="ml-auto font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {rows.length} món
                      </span>
                    </div>
                    <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                      {spec.action}
                    </p>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {rows.map((row) => (
                        <li
                          key={row.dishId}
                          className="rounded-pill border border-line-2 px-3 py-1 text-[length:var(--fs-c1)] text-ink-body"
                          title={`${row.qty} phần · ${formatVnd(row.unitContribution)}/phần`}
                        >
                          {row.name}
                          <span className="ml-2 font-mono text-ink-mute">{row.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>

            <p className="mt-5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Vạch bán chạy: tỉ trọng ≥ {formatPercent(data.popularityCut).replace('+', '')} số phần
              (quy tắc 70% chia đều {data.totals.dishes} món). Vạch đóng góp:{' '}
              {formatVnd(data.contributionCut)} mỗi phần — bình quân có trọng số của cả thực đơn.
              Tổng kỳ: {data.totals.qty} phần · {formatVnd(data.totals.revenue)}.
            </p>

            <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
              <div className="grid grid-cols-[1fr_90px_100px_140px_140px_140px_180px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                <span>Món</span>
                <span className="text-right">Số phần</span>
                <span className="text-right">Tỉ trọng</span>
                <span className="text-right">Doanh thu</span>
                <span className="text-right">Giá vốn/phần</span>
                <span className="text-right">Đóng góp/phần</span>
                <span>Ô · dịch chuyển</span>
              </div>

              {data.rows.map((row) => (
                <div
                  key={row.dishId}
                  className="grid grid-cols-[1fr_90px_100px_140px_140px_140px_180px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[length:var(--fs-b2)] text-ink-hi">{row.name}</p>
                    <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {row.code}
                    </p>
                  </div>
                  <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-body">
                    {row.qty}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {formatPercent(row.qtyShare).replace('+', '')}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-body">
                    {formatVnd(row.revenue)}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-b2)]">
                    {row.unitCostVnd === null ? (
                      <span className="text-[length:var(--fs-c1)] text-warn">chưa khai</span>
                    ) : (
                      <span className="text-ink-body">{formatVnd(row.unitCostVnd)}</span>
                    )}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-body">
                    {formatVnd(row.unitContribution)}
                  </span>
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {row.previousQuadrant === null ? (
                      <>
                        <span className="text-ink-body">{QUADRANTS[row.quadrant].label}</span>
                        <span className="ml-2 text-accent">mới trong kỳ</span>
                      </>
                    ) : row.previousQuadrant === row.quadrant ? (
                      <span className="text-ink-body">{QUADRANTS[row.quadrant].label}</span>
                    ) : (
                      <>
                        {QUADRANTS[row.previousQuadrant].label}
                        <span className="mx-1.5 text-accent">→</span>
                        <span className="text-ink-hi">{QUADRANTS[row.quadrant].label}</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Đơn vị của ma trận là thứ khách chọn và trả tiền, nên món nằm bên trong set không đứng
              riêng ở đây — set tính theo dòng set. Tiêu hao từng món thành phần là câu hỏi của kho,
              trả lời ở S11 khi có công thức.
            </p>
          </>
        )}
      </div>
    </>
  )
}
