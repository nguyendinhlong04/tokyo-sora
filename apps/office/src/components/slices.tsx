import { formatVnd } from '@sora/contracts'
import type { Delta, RateDelta, Slice } from '../api'
import { DeltaChip, formatPercent } from './report'

/**
 * Mảnh dùng chung của nhóm báo cáo kinh doanh B2 · B4 … B9.
 *
 * Ba thành phần, và cả ba đều xoay quanh một quy tắc của §25: **mọi con số đi
 * kèm con số của kỳ đối chiếu**. Một ô chỉ hiện "tháng này 400 triệu" không giúp
 * ai quyết định gì cho tới khi biết tháng trước bao nhiêu.
 */

/** Ô số lớn kèm chip chênh lệch — dùng ở đầu mọi màn báo cáo */
export function MetricTile({
  label,
  value,
  delta,
  hint,
  goodWhenUp = true,
}: {
  label: string
  value: string
  delta?: Delta
  hint?: string
  goodWhenUp?: boolean
}) {
  return (
    <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p className="mt-2 font-mono text-[length:var(--fs-d3)] leading-none text-ink-hi">{value}</p>
      {delta ? (
        <div className="mt-3">
          <DeltaChip delta={delta} label="kỳ trước" goodWhenUp={goodWhenUp} />
        </div>
      ) : null}
      {hint ? <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">{hint}</p> : null}
    </div>
  )
}

/**
 * Ô tỉ lệ.
 *
 * `null` hiện dấu gạch chứ không hiện 0%: mẫu số bằng 0 nghĩa là CHƯA ĐO ĐƯỢC, và
 * một số 0 ở ô "tỉ lệ trễ" trông y hệt "bếp không trễ lần nào" — đúng thứ làm
 * người đọc yên tâm sai chỗ.
 */
export function RateTile({
  label,
  rate,
  hint,
  goodWhenUp = false,
}: {
  label: string
  rate: RateDelta
  hint?: string
  goodWhenUp?: boolean
}) {
  const diff = rate.value !== null && rate.previous !== null ? rate.value - rate.previous : null
  const good = diff === null ? null : diff > 0 === goodWhenUp
  return (
    <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p className="mt-2 font-mono text-[length:var(--fs-d3)] leading-none text-ink-hi">
        {rate.value === null ? <span className="text-line-4">—</span> : formatPercent(rate.value)}
      </p>
      <p className="mt-3 text-[length:var(--fs-c1)]">
        {rate.previous === null ? (
          <span className="text-ink-mute">kỳ trước chưa đo được</span>
        ) : (
          <span className={good === null ? 'text-ink-mute' : good ? 'text-ok' : 'text-danger'}>
            kỳ trước {formatPercent(rate.previous)}
          </span>
        )}
      </p>
      {hint ? <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">{hint}</p> : null}
    </div>
  )
}

/**
 * Bảng lát cắt kèm thanh tỉ trọng.
 *
 * Thanh vẽ theo tỉ trọng của KỲ HIỆN TẠI, còn cột bên phải nói chênh lệch so với
 * kỳ đối chiếu — hai câu hỏi khác nhau ("phần này chiếm bao nhiêu" và "phần này
 * đang lên hay xuống") nên chúng không dùng chung một chỗ hiển thị.
 */
export function SliceTable({
  title,
  slices,
  format = formatVnd,
  emptyLabel = 'Chưa có dữ liệu trong kỳ này.',
}: {
  title: string
  slices: Slice[]
  format?: (value: number) => string
  emptyLabel?: string
}) {
  const max = Math.max(...slices.map((s) => s.value), 1)

  return (
    <section className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
      <h2 className="border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {title}
      </h2>
      {slices.length === 0 ? (
        <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">{emptyLabel}</p>
      ) : (
        slices.map((slice) => (
          <div
            key={slice.key}
            className="grid grid-cols-[150px_1fr_130px_110px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
          >
            <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">{slice.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-3">
                <span
                  className="block h-full rounded-pill bg-accent"
                  style={{ width: `${Math.max(2, (slice.value / max) * 100)}%` }}
                />
              </span>
              <span className="w-[52px] text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {formatPercent(slice.share)}
              </span>
            </span>
            <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
              {format(slice.value)}
            </span>
            <span className="text-right">
              <DeltaChip
                delta={{
                  value: slice.value,
                  previous: slice.previous,
                  diff: slice.diff,
                  percent: slice.percent,
                }}
                label=""
              />
            </span>
          </div>
        ))
      )}
    </section>
  )
}

/**
 * Cột theo ngày, chồng mờ đường của kỳ đối chiếu.
 *
 * Vẽ bằng div chứ không bằng thư viện biểu đồ: đây là một dãy cột đơn giản, và
 * kéo cả một thư viện vào bundle chỉ để vẽ nó là đổi 40KB lấy vài chục dòng CSS.
 */
export function DailyBars({
  rows,
  format = formatVnd,
}: {
  rows: { day: string; value: number; baseline: number }[]
  format?: (value: number) => string
}) {
  const max = Math.max(...rows.flatMap((r) => [r.value, r.baseline]), 1)

  return (
    <section className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <div className="flex items-end gap-1.5" style={{ height: 140 }}>
        {rows.map((row) => (
          <span key={row.day} className="group relative flex flex-1 flex-col justify-end gap-0.5">
            {/* Kỳ đối chiếu nằm dưới, mờ hơn — nhìn được mà không tranh chỗ */}
            <span
              className="w-full rounded-t-sm bg-line-3"
              style={{ height: `${(row.baseline / max) * 100}%`, minHeight: row.baseline > 0 ? 2 : 0 }}
            />
            <span
              className="w-full rounded-t-sm bg-accent"
              style={{ height: `${(row.value / max) * 100}%`, minHeight: row.value > 0 ? 2 : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-sm border border-line-1 bg-surface-3 px-2 py-1 text-[length:var(--fs-c2)] whitespace-nowrap text-ink-hi group-hover:block">
              {row.day.slice(8)}/{row.day.slice(5, 7)} · {format(row.value)}
              <span className="ml-1 text-ink-mute">(trước {format(row.baseline)})</span>
            </span>
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[length:var(--fs-c1)] text-ink-mute">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-accent" /> Kỳ này
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-line-3" /> Kỳ đối chiếu
        </span>
      </div>
    </section>
  )
}

/** Quy giây ra "8p30" — báo cáo bếp đọc bằng phút, không đọc bằng giây */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return s === 0 ? `${m}p` : `${m}p${String(s).padStart(2, '0')}`
}
