import { formatVnd } from '@sora/contracts'
import { Badge, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PeriodChoice } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import {
  BranchPicker,
  PeriodComparator,
  formatDay,
  formatPercent,
  useReportBranch,
} from '../components/report'
import { DailyBars, MetricTile, SliceTable } from '../components/slices'

/**
 * B2 Doanh thu · B4 Giá vốn & lãi gộp · B8 Set & giảm giá.
 *
 * Ba màn TIỀN, gom một file vì chúng đọc cùng một nguồn và trả lời ba lát của
 * cùng một câu hỏi: bán được bao nhiêu, giữ lại được bao nhiêu, và món nào giữ
 * lại được nhiều nhất.
 */

const defaultPeriod: PeriodChoice = { kind: 'thang', compare: 'ky-truoc' }

const enabled = (branchId: string | null, period: PeriodChoice) =>
  Boolean(branchId) && (period.kind !== 'tuy-chon' || Boolean(period.from && period.to))

// ===================================================================== B2

export function Revenue() {
  const { branchId } = useReportBranch()
  const [period, setPeriod] = useState<PeriodChoice>(defaultPeriod)

  const report = useQuery({
    queryKey: ['report-revenue', branchId, period],
    queryFn: () => api.revenueReport(branchId!, period),
    enabled: enabled(branchId, period),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Doanh thu"
        subtitle="Năm lát cắt của cùng một con số. VAT và phí ship không nằm trong doanh thu — chúng là tiền thu hộ và trả hộ."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period}>
          <BranchPicker />
        </PeriodComparator>

        {report.isError ? (
          <div className="mt-5">
            <ErrorState message={(report.error as Error).message} />
          </div>
        ) : null}
        {report.isPending ? <p className="mt-5 text-ink-mute">Đang tải…</p> : null}

        {data ? (
          <>
            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <MetricTile
                label="Doanh thu"
                value={formatVnd(data.total.value)}
                delta={data.total}
              />
              <MetricTile label="Số đơn" value={String(data.orders.value)} delta={data.orders} />
              <MetricTile
                label="Lượt khách"
                value={String(data.guests.value)}
                delta={data.guests}
              />
              <MetricTile
                label="Bình quân mỗi khách"
                value={formatVnd(data.perGuest.value)}
                delta={data.perGuest}
              />
            </div>

            <div className="mt-5">
              <DailyBars rows={data.daily} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <SliceTable title="Theo khung giờ" slices={data.byHour} />
              <SliceTable title="Theo khu vực" slices={data.byArea} />
              <SliceTable title="Theo hình thức" slices={data.byType} />
              <SliceTable title="Theo kênh" slices={data.byChannel} />
              <SliceTable
                title="Theo cách trả tiền"
                slices={data.byPayment}
                emptyLabel="Chưa có lượt trả nào được ghi nhận trong kỳ."
              />
            </div>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Lát "cách trả tiền" cộng cả VAT và ship vì đó là số tiền thật đã chạy qua quỹ và tài
              khoản — nó dùng để đối soát với F1, không dùng để so với doanh thu ở ô trên.
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}

// ===================================================================== B4

export function CostMargin() {
  const { branchId } = useReportBranch()
  const [period, setPeriod] = useState<PeriodChoice>(defaultPeriod)

  const report = useQuery({
    queryKey: ['report-cost-margin', branchId, period],
    queryFn: () => api.costMargin(branchId!, period),
    enabled: enabled(branchId, period),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Giá vốn & lãi gộp"
        subtitle="Food cost lấy từ sổ kho — số thật đã xuất, không phải số công thức đòi. Chênh giữa hai con số đó là việc của báo cáo hao hụt S11."
        action={
          data ? (
            <Badge tone={data.foodCost.overTarget ? 'danger' : 'ok'}>
              Mục tiêu {formatPercent(data.target)}
            </Badge>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period}>
          <BranchPicker />
        </PeriodComparator>

        {report.isError ? (
          <div className="mt-5">
            <ErrorState message={(report.error as Error).message} />
          </div>
        ) : null}
        {report.isPending ? <p className="mt-5 text-ink-mute">Đang tải…</p> : null}

        {data ? (
          <>
            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <MetricTile
                label="Doanh thu"
                value={formatVnd(data.revenue.value)}
                delta={data.revenue}
              />
              <MetricTile
                label="Giá vốn hàng bán"
                value={formatVnd(data.cogs.value)}
                delta={data.cogs}
                goodWhenUp={false}
              />
              <MetricTile
                label="Lãi gộp"
                value={formatVnd(data.grossMargin.value)}
                delta={data.grossMargin}
              />
              <div
                className={`rounded-md border px-5 py-4 ${
                  data.foodCost.overTarget
                    ? 'border-danger bg-surface-1'
                    : 'border-line-1 bg-surface-1'
                }`}
              >
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Food cost
                </p>
                <p
                  className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${
                    data.foodCost.overTarget ? 'text-danger' : 'text-ink-hi'
                  }`}
                >
                  {data.foodCost.value === null ? (
                    <span className="text-line-4">—</span>
                  ) : (
                    formatPercent(data.foodCost.value)
                  )}
                </p>
                <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
                  {data.foodCost.previous === null
                    ? 'kỳ trước chưa đo được'
                    : `kỳ trước ${formatPercent(data.foodCost.previous)}`}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <DataTable
                rows={data.daily}
                rowKey={(day) => day.day}
                paginate={false}
                toolbar={
                  <h2 className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                    Food cost từng ngày so với mục tiêu
                  </h2>
                }
                columns={[
                  {
                    key: 'day',
                    header: 'Ngày',
                    width: '120px',
                    cell: (day) => (
                      <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {formatDay(day.day)}
                      </span>
                    ),
                  },
                  {
                    key: 'bar',
                    header: '',
                    width: 'minmax(160px, 1fr)',
                    cell: (day) => (
                      <span className="block h-2 overflow-hidden rounded-pill bg-surface-3">
                        {day.foodCost !== null ? (
                          <span
                            className={`block h-full rounded-pill ${day.overTarget ? 'bg-danger' : 'bg-ok'}`}
                            style={{ width: `${Math.min(100, day.foodCost * 100)}%` }}
                          />
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    key: 'revenue',
                    header: 'Doanh thu',
                    width: '150px',
                    numeric: true,
                    cell: (day) => (
                      <span className="text-ink-body">{formatVnd(day.revenueVnd)}</span>
                    ),
                  },
                  {
                    key: 'cogs',
                    header: 'Giá vốn',
                    width: '150px',
                    numeric: true,
                    cell: (day) => <span className="text-ink-mute">{formatVnd(day.cogsVnd)}</span>,
                  },
                  {
                    key: 'foodCost',
                    header: 'Food cost',
                    width: '120px',
                    numeric: true,
                    cell: (day) => (
                      <span
                        className={
                          day.foodCost === null
                            ? 'text-line-4'
                            : day.overTarget
                              ? 'text-danger'
                              : 'text-ok'
                        }
                      >
                        {day.foodCost === null ? '—' : formatPercent(day.foodCost)}
                      </span>
                    ),
                  },
                ]}
              />
            </div>

            <section className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
              <h2 className="border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Đóng góp lãi gộp theo nhóm món
              </h2>
              {data.byCategory.length === 0 ? (
                <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                  Chưa có món nào bán ra trong kỳ.
                </p>
              ) : (
                data.byCategory.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[1fr_140px_140px_150px_110px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
                  >
                    <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.label}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {formatVnd(row.revenueVnd)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {formatVnd(row.cogsVnd)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                      {formatVnd(row.grossVnd)}
                    </span>
                    <span
                      className={`text-right font-mono text-[length:var(--fs-c1)] ${
                        row.foodCost === null
                          ? 'text-line-4'
                          : row.foodCost > data.target
                            ? 'text-danger'
                            : 'text-ok'
                      }`}
                    >
                      {row.foodCost === null ? '—' : formatPercent(row.foodCost)}
                    </span>
                  </div>
                ))
              )}
            </section>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Bảng nhóm sắp theo TIỀN lãi gộp chứ không theo tỉ lệ: một nhóm food cost 20% bán được
              hai đĩa đóng góp ít hơn nhóm 40% bán cả trăm đĩa, và người quyết định thực đơn cần
              thấy điều đó trước.
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}

// ===================================================================== B8

export function SetsReport() {
  const { branchId } = useReportBranch()
  const [period, setPeriod] = useState<PeriodChoice>(defaultPeriod)

  const report = useQuery({
    queryKey: ['report-sets', branchId, period],
    queryFn: () => api.setsReport(branchId!, period),
    enabled: enabled(branchId, period),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Set & giảm giá"
        subtitle="Food cost của set tính trên lựa chọn THẬT của khách, không trên dải lý thuyết của công thức."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period}>
          <BranchPicker />
        </PeriodComparator>

        {report.isError ? (
          <div className="mt-5">
            <ErrorState message={(report.error as Error).message} />
          </div>
        ) : null}
        {report.isPending ? <p className="mt-5 text-ink-mute">Đang tải…</p> : null}

        {data ? (
          <>
            <section className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
              <h2 className="border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Set bán ra
              </h2>
              {data.sets.length === 0 ? (
                <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                  Chưa bán set nào trong kỳ này.
                </p>
              ) : (
                data.sets.map((row) => (
                  <div
                    key={row.dishId}
                    className="grid grid-cols-[1fr_110px_140px_140px_140px_110px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
                  >
                    <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.name}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {row.sold} suất
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {formatVnd(row.revenueVnd)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {formatVnd(row.cogsVnd)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                      {formatVnd(row.grossVnd)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {row.foodCost === null ? '—' : formatPercent(row.foodCost)}
                    </span>
                  </div>
                ))
              )}
            </section>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <MetricTile
                label="Đơn có giảm giá"
                value={`${data.discount.ordersWithDiscount}/${data.discount.ordersTotal}`}
                hint={
                  data.discount.rate === null
                    ? 'chưa có đơn nào'
                    : formatPercent(data.discount.rate)
                }
              />
              <MetricTile
                label="Tiền đã giảm"
                value={formatVnd(data.discount.amountVnd.value)}
                delta={data.discount.amountVnd}
                goodWhenUp={false}
              />
              <MetricTile
                label="BQ đơn CÓ giảm giá"
                value={formatVnd(data.discount.avgWithDiscountVnd)}
              />
              <MetricTile
                label="BQ đơn KHÔNG giảm"
                value={formatVnd(data.discount.avgWithoutDiscountVnd)}
              />
            </div>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Hai ô bình quân cuối là câu hỏi thật của màn này: giảm giá có kéo đơn to lên không,
              hay chỉ làm mỏng đơn vốn đã có. — {data.promotionsNote}
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}
