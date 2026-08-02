import { formatVnd } from '@sora/contracts'
import { Badge, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PeriodChoice } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PeriodComparator, formatPercent } from '../components/report'
import { MetricTile, RateTile, SliceTable, formatDuration } from '../components/slices'
import { useSession } from '../session-context'

/**
 * B5 Hiệu suất bếp · B6 Vòng quay bàn · B7 Nhân sự · B9 Online & đặt bàn.
 *
 * Bốn màn VẬN HÀNH — không màn nào ở đây trả lời "bán được bao nhiêu tiền", tất
 * cả trả lời "chỗ nào đang nghẽn".
 */

const defaultPeriod: PeriodChoice = { kind: 'thang', compare: 'ky-truoc' }

const enabled = (branchId: string | null, period: PeriodChoice) =>
  Boolean(branchId) && (period.kind !== 'tuy-chon' || Boolean(period.from && period.to))

// ===================================================================== B5

export function KitchenReport() {
  const { branchId } = useSession()
  const [period, setPeriod] = useState<PeriodChoice>(defaultPeriod)

  const report = useQuery({
    queryKey: ['report-kitchen', branchId, period],
    queryFn: () => api.kitchenReport(branchId!, period),
    enabled: enabled(branchId, period),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Hiệu suất bếp"
        subtitle="Đo từ lúc vé vào hàng tới lúc bếp báo xong — không tính quãng đợt còn chờ bấm Ra đợt, vì đó là quyết định của phục vụ."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period} />

        {report.isError ? (
          <div className="mt-5">
            <ErrorState message={(report.error as Error).message} />
          </div>
        ) : null}
        {report.isPending ? <p className="mt-5 text-ink-mute">Đang tải…</p> : null}

        {data ? (
          <>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <MetricTile
                label="Thời gian trung bình"
                value={formatDuration(data.avgSeconds.value)}
                delta={data.avgSeconds}
                goodWhenUp={false}
              />
              <MetricTile label="Số vé đã xong" value={String(data.tickets.value)} delta={data.tickets} />
              <RateTile label="Tỉ lệ trễ SLA" rate={data.lateRate} hint="vé ra sau hạn của chính nó" />
            </div>

            <section className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
              <h2 className="border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Theo trạm — tách hai kênh tại bàn và online
              </h2>
              <div className="grid grid-cols-[130px_110px_120px_120px_130px_130px] gap-3 border-b border-line-1 px-5 py-2 text-[length:var(--fs-c2)] tracking-[0.1em] text-ink-mute uppercase">
                <span>Trạm</span>
                <span className="text-right">Vé</span>
                <span className="text-right">Trung bình</span>
                <span className="text-right">Chậm nhất 10%</span>
                <span className="text-right">Tại bàn / POS</span>
                <span className="text-right">Online</span>
              </div>
              {data.byStation.length === 0 ? (
                <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                  Chưa có vé nào xong trong kỳ này.
                </p>
              ) : (
                data.byStation.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[130px_110px_120px_120px_130px_130px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">{row.key}</span>
                      {row.lateRate !== null && row.lateRate > 0.2 ? (
                        <Badge tone="danger">{formatPercent(row.lateRate)}</Badge>
                      ) : null}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {row.total}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                      {formatDuration(row.avgSeconds)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {formatDuration(row.p90Seconds)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {row.bySource.pos !== undefined || row.bySource.table !== undefined
                        ? formatDuration(row.bySource.pos ?? row.bySource.table ?? 0)
                        : '—'}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {row.bySource.online !== undefined ? formatDuration(row.bySource.online) : '—'}
                    </span>
                  </div>
                ))
              )}
            </section>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <section className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
                <h2 className="border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Theo khung giờ
                </h2>
                {data.byHour.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[90px_1fr_110px_100px] items-center gap-3 border-b border-line-1 px-5 py-2 last:border-b-0"
                  >
                    <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {row.label}
                    </span>
                    <span className="h-2 overflow-hidden rounded-pill bg-surface-3">
                      <span
                        className="block h-full rounded-pill bg-accent"
                        style={{
                          width: `${Math.min(100, (row.avgSeconds / Math.max(...data.byHour.map((h) => h.avgSeconds), 1)) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
                      {formatDuration(row.avgSeconds)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {row.tickets} vé
                    </span>
                  </div>
                ))}
              </section>

              <section className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
                <h2 className="border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Món hay trễ
                </h2>
                {data.slowestDishes.length === 0 ? (
                  <p className="px-5 py-4 text-[length:var(--fs-c1)] text-ink-mute">
                    Chưa món nào ra đủ ba lần trong kỳ — dưới đó thì con số là ngẫu nhiên, không
                    phải xu hướng.
                  </p>
                ) : (
                  data.slowestDishes.map((row) => (
                    <div
                      key={row.dishId}
                      className="grid grid-cols-[1fr_100px_110px_110px] items-center gap-3 border-b border-line-1 px-5 py-2 last:border-b-0"
                    >
                      <span className="truncate text-[length:var(--fs-c1)] text-ink-hi">{row.name}</span>
                      <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {row.served} lần
                      </span>
                      <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                        {formatDuration(row.avgSeconds)}
                      </span>
                      <span
                        className={`text-right font-mono text-[length:var(--fs-c1)] ${
                          row.lateRate !== null && row.lateRate > 0.2 ? 'text-danger' : 'text-ink-mute'
                        }`}
                      >
                        {row.lateRate === null ? '—' : formatPercent(row.lateRate)}
                      </span>
                    </div>
                  ))
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}

// ===================================================================== B6

export function TableTurnover() {
  const { branchId } = useSession()
  const [period, setPeriod] = useState<PeriodChoice>(defaultPeriod)

  const report = useQuery({
    queryKey: ['report-turnover', branchId, period],
    queryFn: () => api.tableTurnover(branchId!, period),
    enabled: enabled(branchId, period),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Vòng quay bàn"
        subtitle="Chỉ tính phiên đã đóng — phiên đang mở chưa có thời gian ngồi, và lấy 'tới bây giờ' làm mốc sẽ kéo trung bình lên mỗi khi quán đang đông."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period} />

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
                label="Thời gian ngồi TB"
                value={`${data.avgMinutes.value} phút`}
                delta={data.avgMinutes}
                goodWhenUp={false}
              />
              <MetricTile label="Lượt bàn" value={String(data.sessions.value)} delta={data.sessions} />
              <MetricTile label="Lượt khách" value={String(data.guests.value)} delta={data.guests} />
              <MetricTile
                label="Lượt / bàn / ngày"
                value={data.turnsPerTableDay === null ? '—' : data.turnsPerTableDay.toFixed(2)}
                hint="con số §25 B6 gọi tên"
              />
            </div>

            <section className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
              <h2 className="border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Từng bàn
              </h2>
              <div className="grid grid-cols-[110px_130px_100px_120px_110px_120px_140px] gap-3 border-b border-line-1 px-5 py-2 text-[length:var(--fs-c2)] tracking-[0.1em] text-ink-mute uppercase">
                <span>Bàn</span>
                <span>Khu</span>
                <span className="text-right">Lượt</span>
                <span className="text-right">Lượt / ngày</span>
                <span className="text-right">Ngồi TB</span>
                <span className="text-right">Lấp đầy</span>
                <span className="text-right">Doanh thu</span>
              </div>
              {data.byTable.length === 0 ? (
                <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                  Chưa có phiên bàn nào đóng trong kỳ này.
                </p>
              ) : (
                data.byTable.map((row) => (
                  <div
                    key={row.tableId}
                    className="grid grid-cols-[110px_130px_100px_120px_110px_120px_140px] items-center gap-3 border-b border-line-1 px-5 py-2 last:border-b-0"
                  >
                    <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">{row.code}</span>
                    <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                      {row.areaName ?? '—'}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {row.sessions}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
                      {row.turnsPerDay.toFixed(2)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {row.avgMinutes}p
                    </span>
                    <span
                      className={`text-right font-mono text-[length:var(--fs-c1)] ${
                        row.occupancy !== null && row.occupancy < 0.5 ? 'text-warn' : 'text-ink-mute'
                      }`}
                    >
                      {row.occupancy === null ? '—' : formatPercent(row.occupancy)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {formatVnd(row.revenueVnd)}
                    </span>
                  </div>
                ))
              )}
            </section>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              "Lấp đầy" là số khách trung bình mỗi lượt so với sức chứa của bàn. Bàn sáu chỗ mà lúc
              nào cũng đón hai người thì không phải bàn ế — nó là bàn đặt sai kích cỡ.
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}

// ===================================================================== B7

export function StaffReport() {
  const { branchId } = useSession()
  const [period, setPeriod] = useState<PeriodChoice>(defaultPeriod)

  const report = useQuery({
    queryKey: ['report-staff', branchId, period],
    queryFn: () => api.staffReport(branchId!, period),
    enabled: enabled(branchId, period),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Nhân sự — bán hàng"
        subtitle="Doanh thu, số huỷ và số lần cần duyệt đứng cạnh nhau. Không có con số lương nào ở đây."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period} />

        {report.isError ? (
          <div className="mt-5">
            <ErrorState message={(report.error as Error).message} />
          </div>
        ) : null}
        {report.isPending ? <p className="mt-5 text-ink-mute">Đang tải…</p> : null}

        {data ? (
          <>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <MetricTile label="Doanh thu qua nhân viên" value={formatVnd(data.totals.revenueVnd)} />
              <MetricTile label="Đơn đã huỷ" value={String(data.totals.cancels)} />
              <MetricTile label="Lượt cần duyệt" value={String(data.totals.approvalRequests)} />
            </div>

            <section className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
              <div className="grid grid-cols-[1fr_150px_100px_140px_110px_120px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                <span>Nhân viên</span>
                <span className="text-right">Doanh thu</span>
                <span className="text-right">Đơn</span>
                <span className="text-right">BQ mỗi đơn</span>
                <span className="text-right">Huỷ</span>
                <span className="text-right">Cần duyệt</span>
              </div>
              {data.rows.length === 0 ? (
                <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                  Chưa có đơn nào do nhân viên tạo trong kỳ này.
                </p>
              ) : (
                data.rows.map((row) => (
                  <div
                    key={row.staffId}
                    className="grid grid-cols-[1fr_150px_100px_140px_110px_120px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
                  >
                    <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.fullName}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                      {formatVnd(row.revenue.value)}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {row.orders}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {formatVnd(row.perOrderVnd)}
                    </span>
                    <span
                      className={`text-right font-mono text-[length:var(--fs-c1)] ${
                        row.cancels > 0 ? 'text-warn' : 'text-ink-mute'
                      }`}
                    >
                      {row.cancels || '—'}
                    </span>
                    <span
                      className={`text-right font-mono text-[length:var(--fs-c1)] ${
                        row.approvalRequests > 3 ? 'text-danger' : 'text-ink-mute'
                      }`}
                    >
                      {row.approvalRequests || '—'}
                    </span>
                  </div>
                ))
              )}
            </section>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Ba cột cuối đứng cạnh nhau là có lý do: doanh thu cao mà số lần cần duyệt cũng cao thì
              đó không phải người bán giỏi, đó là người đang giảm giá để bán. Tách chúng ra hai màn
              là bỏ mất chính so sánh ấy.
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}

// ===================================================================== B9

export function OnlineReport() {
  const { branchId } = useSession()
  const [period, setPeriod] = useState<PeriodChoice>(defaultPeriod)

  const report = useQuery({
    queryKey: ['report-online', branchId, period],
    queryFn: () => api.onlineReport(branchId!, period),
    enabled: enabled(branchId, period),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Online & đặt bàn"
        subtitle="Hai luồng một màn vì cùng trả lời một câu: khách hẹn trước thì có đến không."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} resolved={data?.period} />

        {report.isError ? (
          <div className="mt-5">
            <ErrorState message={(report.error as Error).message} />
          </div>
        ) : null}
        {report.isPending ? <p className="mt-5 text-ink-mute">Đang tải…</p> : null}

        {data ? (
          <>
            <h2 className="mt-5 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Đơn online
            </h2>
            <div className="mt-2 grid gap-3 lg:grid-cols-4">
              <MetricTile label="Số đơn" value={String(data.online.orders.value)} delta={data.online.orders} />
              <MetricTile
                label="Doanh thu"
                value={formatVnd(data.online.revenue.value)}
                delta={data.online.revenue}
              />
              <RateTile label="Tỉ lệ huỷ" rate={data.online.cancelRate} />
              <MetricTile
                label="Thời gian giao TB"
                value={formatDuration(data.online.avgDeliverySeconds.value)}
                delta={data.online.avgDeliverySeconds}
                goodWhenUp={false}
                hint="từ lúc xác nhận tới lúc xong"
              />
            </div>

            <div className="mt-4">
              <SliceTable
                title="Đơn online theo khung giờ"
                slices={data.online.byHour.map((h) => ({
                  key: h.key,
                  label: h.label,
                  value: h.orders,
                  previous: 0,
                  diff: 0,
                  percent: null,
                  share:
                    data.online.orders.value > 0 ? h.orders / data.online.orders.value : 0,
                }))}
                format={(v) => `${v} đơn`}
                emptyLabel="Chưa có đơn online nào trong kỳ."
              />
            </div>

            <h2 className="mt-6 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Đặt bàn
            </h2>
            <div className="mt-2 grid gap-3 lg:grid-cols-4">
              <MetricTile
                label="Suất đã nhận"
                value={String(data.reservations.total.value)}
                delta={data.reservations.total}
              />
              <MetricTile
                label="Suất khách đến"
                value={String(data.reservations.seated.value)}
                delta={data.reservations.seated}
              />
              <RateTile label="Tỉ lệ no-show" rate={data.reservations.noShowRate} />
              <RateTile label="Tỉ lệ khách tự huỷ" rate={data.reservations.cancelRate} />
            </div>

            <section className="mt-4 overflow-hidden rounded-md border border-line-1 bg-surface-1">
              <h2 className="border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                No-show theo kiểu chỗ
              </h2>
              {data.reservations.bySeatKind.length === 0 ? (
                <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                  Chưa có suất đặt nào trong kỳ này.
                </p>
              ) : (
                data.reservations.bySeatKind.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
                  >
                    <span className="text-[length:var(--fs-b2)] text-ink-hi">{row.label}</span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                      {row.total} suất
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {row.noShow} vắng
                    </span>
                    <span
                      className={`text-right font-mono text-[length:var(--fs-c1)] ${
                        row.noShowRate !== null && row.noShowRate > 0.15 ? 'text-danger' : 'text-ink-mute'
                      }`}
                    >
                      {row.noShowRate === null ? '—' : formatPercent(row.noShowRate)}
                    </span>
                  </div>
                ))
              )}
            </section>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Đơn online huỷ và suất đặt bàn no-show là cùng một loại thiệt hại: bếp đã chuẩn bị,
              chỗ đã giữ, mà không ai tới. Phòng riêng no-show đắt hơn bàn thường vì chỗ giữ lâu hơn
              và khó lấp lại hơn.
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}
