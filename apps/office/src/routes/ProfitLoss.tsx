import { formatVnd } from '@sora/contracts'
import { ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PeriodChoice, type PnlBasis, type PnlRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PeriodComparator, formatPercent } from '../components/report'
import { useSession } from '../session-context'

/**
 * F7 — Báo cáo Lãi/Lỗ.
 *
 * Bản thiết kế đòi bảng này "tự động, không nhập tay dòng nào". Hôm nay chỉ nửa
 * trên tự động được: doanh thu, giảm giá, hoàn, phí phục vụ và phí giao đều suy
 * ra từ đơn đã có. Nửa dưới — giá vốn, nhân sự, mặt bằng, khấu hao — chưa có
 * nguồn vì kho (S), chi phí (C) và nhân sự (H) chưa dựng.
 *
 * Quyết định thiết kế của màn: **các dòng chưa có nguồn vẫn hiện, nhưng để trống
 * kèm tên màn còn thiếu**. Ẩn chúng đi thì bảng trông như một P&L đã hoàn chỉnh
 * với lãi gộp bằng doanh thu — sai lệch nguy hiểm hơn nhiều so với một bảng có
 * chỗ trống thành thật.
 */

const KIND_STYLE: Record<PnlRow['kind'], string> = {
  revenue: 'text-ink-body',
  deduction: 'text-ink-body',
  cost: 'text-ink-body',
  subtotal: 'text-ink-hi font-semibold',
  memo: 'text-ink-mute',
}

const BASIS_LABELS: Record<PnlBasis, { label: string; hint: string }> = {
  'don-tich': {
    label: 'Dồn tích',
    hint: 'Chi phí theo kỳ phân bổ — đúng cho câu hỏi tháng này lãi hay lỗ',
  },
  'dong-tien': {
    label: 'Dòng tiền',
    hint: 'Theo tiền ra thực — đối chiếu sổ quỹ F1, khấu hao không tính',
  },
}

export function ProfitLoss() {
  const { branchId } = useSession()
  const [period, setPeriod] = useState<PeriodChoice>({ kind: 'thang', compare: 'ky-truoc' })
  const [basis, setBasis] = useState<PnlBasis>('don-tich')

  const report = useQuery({
    queryKey: ['report-pnl', branchId, period, basis],
    queryFn: () => api.profitLoss(branchId!, period, basis),
    enabled: Boolean(branchId) && (period.kind !== 'tuy-chon' || Boolean(period.from && period.to)),
  })

  const data = report.data
  const net = data?.rows.find((r) => r.key === 'net-revenue')?.amount ?? 0

  return (
    <>
      <PageHeader
        title="Lãi / Lỗ"
        subtitle="Bảng tài chính hợp nhất — không dòng nào nhập tay. Dòng để trống là dòng chưa có nguồn, không phải dòng bằng không."
        action={
          <div className="flex overflow-hidden rounded-sm border border-line-1">
            {(Object.keys(BASIS_LABELS) as PnlBasis[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBasis(mode)}
                title={BASIS_LABELS[mode].hint}
                className={`h-[var(--hit-target)] border-r border-line-1 px-4 text-[length:var(--fs-b2)] last:border-r-0 ${
                  basis === mode ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:text-ink-hi'
                }`}
              >
                {BASIS_LABELS[mode].label}
              </button>
            ))}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period} />

        <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          {BASIS_LABELS[basis].hint}.
          {data?.detailLevel === 'summary' ? (
            <span className="text-warn">
              {' '}
              Vai trò của bạn xem bản GỘP — dòng nhân sự dừng ở mức tổng, không xuống từng người.
            </span>
          ) : null}
        </p>

        {report.isError ? (
          <ErrorState message={(report.error as Error).message} />
        ) : !data ? (
          <p className="mt-5 text-ink-mute">Đang tải…</p>
        ) : (
          <>
            <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
              <div className="grid grid-cols-[1fr_180px_180px_120px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                <span>Khoản mục</span>
                <span className="text-right">Kỳ này</span>
                <span className="text-right">Kỳ đối chiếu</span>
                <span className="text-right">% doanh thu</span>
              </div>

              {data.rows.map((row) => (
                <div
                  key={row.key}
                  className={`grid grid-cols-[1fr_180px_180px_120px] items-baseline gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0 ${
                    row.kind === 'subtotal' ? 'bg-surface-2' : ''
                  } ${row.kind === 'memo' ? 'bg-canvas' : ''}`}
                >
                  <div className="min-w-0">
                    <p className={`text-[length:var(--fs-b2)] ${KIND_STYLE[row.kind]}`}>
                      {row.label}
                    </p>
                    {row.blockedBy ? (
                      <p className="mt-0.5 text-[length:var(--fs-c1)] text-warn">
                        Chưa có nguồn · {row.blockedBy}
                      </p>
                    ) : row.note ? (
                      <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">{row.note}</p>
                    ) : null}
                  </div>

                  <span className={`text-right font-mono text-[length:var(--fs-b2)] ${KIND_STYLE[row.kind]}`}>
                    {row.amount === null ? (
                      <span className="text-line-4">—</span>
                    ) : (
                      formatVnd(row.amount)
                    )}
                  </span>

                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {row.baseline === null ? '—' : formatVnd(row.baseline)}
                  </span>

                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {row.amount === null || net === 0 || row.kind === 'memo'
                      ? '—'
                      : formatPercent(row.amount / net).replace('+', '')}
                  </span>
                </div>
              ))}
            </div>

            <section className="mt-5 grid gap-4 lg:grid-cols-2">
              {data.primeCost.value === null ? (
                <div className="rounded-md border border-dashed border-line-3 bg-surface-1 p-5">
                  <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                    Prime cost
                  </p>
                  <p className="mt-2 font-mono text-[length:var(--fs-d3)] leading-none text-line-4">
                    —
                  </p>
                  <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                    {data.primeCost.blockedBy}. Đây là chỉ số sống còn của quán ăn: giá vốn cộng
                    nhân sự vượt 60% doanh thu là báo động.
                  </p>
                </div>
              ) : (
                <div
                  className={`rounded-md border bg-surface-1 p-5 ${
                    data.primeCost.overThreshold ? 'border-danger-line' : 'border-line-1'
                  }`}
                >
                  <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                    Prime cost
                  </p>
                  <p
                    className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${
                      data.primeCost.overThreshold ? 'text-danger' : 'text-ok'
                    }`}
                  >
                    {formatPercent(data.primeCost.value).replace('+', '')}
                  </p>
                  <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                    {formatVnd(data.primeCost.cogsVnd)} giá vốn +{' '}
                    {formatVnd(data.primeCost.labourVnd)} nhân sự ={' '}
                    {formatVnd(data.primeCost.amountVnd)}.{' '}
                    {data.primeCost.overThreshold ? (
                      <span className="text-danger">
                        Vượt ngưỡng 60% — đây là mức mà quán ăn bắt đầu lỗ dù doanh thu vẫn đẹp.
                      </span>
                    ) : (
                      'Dưới ngưỡng báo động 60% của ngành.'
                    )}
                  </p>
                </div>
              )}

              <div className="rounded-md border border-line-1 bg-surface-1 p-5">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Đọc bảng này thế nào
                </p>
                <ul className="mt-3 flex flex-col gap-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  <li>
                    Doanh thu ghi nhận theo <span className="text-ink-body">đơn</span>, không theo
                    tiền về — dòng “Tiền đã thực thu” ở cuối bảng là mặt dòng tiền, đối chiếu với
                    sổ quỹ F1.
                  </li>
                  <li>
                    VAT đầu ra là tiền thu hộ nhà nước, đứng ngoài doanh thu thuần.
                  </li>
                  <li>
                    Kỳ này gồm {data.orderCount} đơn đã bán (đơn huỷ không tính).
                  </li>
                </ul>
              </div>
            </section>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Bản thiết kế còn đòi hai thứ nữa ở màn này mà bản dựng hiện chưa có: bấm xuống chứng
              từ gốc từng dòng (chưa có màn đích để bấm tới — cần B2 và C2), và hai chế độ xem dồn
              tích / dòng tiền (cần kỳ phân bổ chi phí ở C2). Xuất Excel nằm ở B10.
            </p>
          </>
        )}
      </div>
    </>
  )
}
