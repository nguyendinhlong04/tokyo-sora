import { formatVnd } from '@sora/contracts'
import { EmptyState, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type FoodCostTile, type TodayReport } from '../api'
import { PageHeader } from '../components/PageHeader'
import {
  BlockedStat,
  BranchPicker,
  DateInput,
  DeltaChip,
  Field,
  StatTile,
  formatDay,
  formatPercent,
  useReportBranch,
} from '../components/report'

/**
 * B1 — Hôm nay.
 *
 * Màn mở đầu mỗi sáng của người quản lý, nên nó chỉ được trả lời bốn câu: bán
 * được bao nhiêu, bao nhiêu khách, mỗi khách bao nhiêu, và có gì đang cháy.
 *
 * Mỗi ô kèm HAI mốc so — hôm qua và cùng thứ tuần trước — đúng theo §25. Chỉ so
 * hôm qua là bẫy quen thuộc của quán ăn: thứ Hai bao giờ cũng thua Chủ nhật, nhìn
 * một mốc thì tuần nào cũng tưởng đang tụt.
 */
export function Today() {
  const { branchId } = useReportBranch()
  const [date, setDate] = useState<string | null>(null)

  const report = useQuery({
    queryKey: ['report-today', branchId, date],
    queryFn: () => api.today(branchId!, date),
    enabled: Boolean(branchId),
    refetchInterval: 60_000,
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Hôm nay"
        subtitle={
          data
            ? `Ngày làm việc ${formatDay(data.date)} · so với ${formatDay(data.yesterday)} và ${formatDay(data.lastWeek)}`
            : 'Doanh thu, khách và cảnh báo của ngày làm việc đang chạy.'
        }
        action={
          <div className="flex items-end gap-4">
            <BranchPicker />
            <Field label="Ngày">
              <DateInput value={date ?? data?.date ?? ''} onChange={setDate} />
            </Field>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {report.isError ? (
          <ErrorState message={(report.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-5">
              <StatTile
                label="Doanh thu"
                value={formatVnd(data.revenue.value)}
                vsYesterday={data.revenue.vsYesterday}
                vsLastWeek={data.revenue.vsLastWeek}
              />
              <StatTile
                label="Khách"
                value={String(data.guests.value)}
                vsYesterday={data.guests.vsYesterday}
                vsLastWeek={data.guests.vsLastWeek}
              />
              <StatTile
                label="Bình quân / khách"
                value={formatVnd(data.perGuest.value)}
                vsYesterday={data.perGuest.vsYesterday}
                vsLastWeek={data.perGuest.vsLastWeek}
              />
              <StatTile
                label="Số đơn"
                value={String(data.orderCount.value)}
                vsYesterday={data.orderCount.vsYesterday}
                vsLastWeek={data.orderCount.vsLastWeek}
              />
              {data.foodCost.value === null ? (
                <BlockedStat label="Food cost" tile={data.foodCost} />
              ) : (
                <FoodCostStat tile={data.foodCost} />
              )}
            </div>

            <HourlyChart data={data} />

            <section className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-line-1 bg-surface-1 p-5">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Bếp đang gạt món
                </p>
                {data.soldOut.length === 0 ? (
                  <EmptyState title="Không có món nào bị báo hết hôm nay." />
                ) : (
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {data.soldOut.map((dish) => (
                      <li key={dish.dishId} className="flex items-baseline gap-3">
                        <span
                          className={`h-2 w-2 flex-none rounded-pill ${
                            dish.status === 'sold_out' ? 'bg-danger' : 'bg-warn'
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-b2)] text-ink-hi">
                          {dish.name}
                        </span>
                        <span className="text-[length:var(--fs-c1)] text-ink-mute">
                          {dish.status === 'sold_out' ? 'hết hẳn' : `còn ${dish.remaining} phần`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  Đây là trạng thái bếp gạt trong ca (K5), tự hết hạn cuối ngày — không phải tồn
                  kho.
                </p>
              </div>

              <BlockedStat label="Cảnh báo kho" tile={data.stockAlert} />
            </section>
          </>
        )}
      </div>
    </>
  )
}

/**
 * Food cost của ngày.
 *
 * Khác ba ô kia ở chỗ TĂNG LÀ XẤU, nên mũi tên phải đảo màu: food cost lên là lãi
 * mỏng đi. Và nếu chưa phủ hết thực đơn thì phải nói ra ngay dưới con số — một
 * food cost 18% đẹp long lanh nhưng mới tính được nửa thực đơn là con số nguy
 * hiểm hơn cả không có số nào.
 */
function FoodCostStat({ tile }: { tile: FoodCostTile }) {
  const band = tile.value < 0.3 ? 'text-ok' : tile.value <= 0.38 ? 'text-warn' : 'text-danger'

  return (
    <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Food cost
      </p>
      <p className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${band}`}>
        {formatPercent(tile.value).replace('+', '')}
      </p>
      <div className="mt-3 flex flex-col gap-1">
        <DeltaChip delta={tile.vsYesterday} label="hôm qua" goodWhenUp={false} />
        <DeltaChip delta={tile.vsLastWeek} label="cùng thứ tuần trước" goodWhenUp={false} />
      </div>
      <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
        {formatVnd(tile.cogsVnd)} giá vốn
        {tile.coverage < 1 ? (
          <span className="text-warn"> · mới phủ {Math.round(tile.coverage * 100)}% doanh thu</span>
        ) : null}
      </p>
    </div>
  )
}

/**
 * Doanh thu theo giờ, chồng mờ đường cùng kỳ.
 *
 * Không dùng thư viện biểu đồ: đây là 10–13 cột với một mốc so, `div` làm được
 * mà không phải kéo thêm 40KB javascript vào một màn đọc.
 *
 * Khung ngoài KHÔNG được đặt `items-end`: nó sẽ co mỗi cột về đúng chiều cao nhãn
 * giờ, và phần trăm chiều cao của thanh không còn gì để bám vào. Cột kéo cao hết
 * khung, việc dóng đáy do `items-end` của chính rãnh bên trong lo.
 */
function HourlyChart({ data }: { data: TodayReport }) {
  const peak = Math.max(1, ...data.hourly.flatMap((h) => [h.revenue, h.baselineRevenue]))

  return (
    <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          Doanh thu theo giờ
        </p>
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          <span className="mr-1 inline-block h-2 w-3 rounded-xs bg-accent align-middle" /> hôm nay
          <span className="mx-1 ml-4 inline-block h-px w-3 bg-line-4 align-middle" /> cùng thứ tuần
          trước
        </p>
      </div>

      {data.hourly.length === 0 ? (
        <EmptyState title="Chưa có đơn nào trong ngày." />
      ) : (
        <div className="mt-5 flex h-52 gap-2">
          {data.hourly.map((hour) => (
            <div key={hour.hour} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-xs bg-accent"
                  style={{ height: `${(hour.revenue / peak) * 100}%` }}
                  title={`${hour.hour}:00 · ${formatVnd(hour.revenue)} · ${hour.orders} đơn`}
                />
                {hour.baselineRevenue > 0 ? (
                  <div
                    className="absolute inset-x-0 h-px bg-line-4"
                    style={{ bottom: `${(hour.baselineRevenue / peak) * 100}%` }}
                  />
                ) : null}
              </div>
              <span className="font-mono text-[length:var(--fs-c2)] text-ink-mute">
                {hour.hour}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
