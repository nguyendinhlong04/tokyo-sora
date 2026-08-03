import { formatVnd } from '@sora/contracts'
import type {
  BlockedTile,
  CompareKind,
  Delta,
  PeriodChoice,
  PeriodKind,
  ResolvedPeriod,
} from '../api'
import { DateInput, Field, SegmentedControl, Select } from './form'

/**
 * Mảnh dùng chung của nhóm báo cáo.
 *
 * PeriodComparator là quy tắc xuyên suốt §25: "đầu mỗi màn báo cáo có
 * PeriodComparator — chọn kỳ và mốc so sánh". Để ở một chỗ vì B3 và F7 phải cắt
 * kỳ giống hệt nhau; hai màn tự dựng bộ chọn riêng là hai màn sẽ trôi lệch.
 *
 * B1 không dùng bộ chọn này: màn "Hôm nay" có mốc so cố định (hôm qua **và** cùng
 * thứ tuần trước), nên nó chỉ cần ô chọn ngày.
 */

const PERIOD_LABELS: Record<PeriodKind, string> = {
  ngay: 'Ngày',
  tuan: 'Tuần',
  thang: 'Tháng',
  quy: 'Quý',
  'tuy-chon': 'Tuỳ chọn',
}

const COMPARE_LABELS: Record<CompareKind, string> = {
  'ky-truoc': 'Kỳ liền trước',
  'tuan-truoc': 'Cùng kỳ tuần trước',
  'nam-truoc': 'Cùng kỳ năm trước',
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function formatRange(range: { from: string; to: string }): string {
  return range.from === range.to
    ? formatDay(range.from)
    : `${formatDay(range.from)} – ${formatDay(range.to)}`
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------

export function PeriodComparator({
  value,
  onChange,
  resolved,
}: {
  value: PeriodChoice
  onChange: (next: PeriodChoice) => void
  resolved?: ResolvedPeriod
}) {
  return (
    <section className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <Field label="Kỳ">
        <SegmentedControl
          value={value.kind}
          onChange={(kind) => onChange({ ...value, kind })}
          options={(Object.keys(PERIOD_LABELS) as PeriodKind[]).map((kind) => ({
            value: kind,
            label: PERIOD_LABELS[kind],
          }))}
        />
      </Field>

      {value.kind === 'tuy-chon' ? (
        <>
          <Field label="Từ ngày">
            <DateInput value={value.from ?? ''} onChange={(from) => onChange({ ...value, from })} />
          </Field>
          <Field label="Đến ngày">
            <DateInput value={value.to ?? ''} onChange={(to) => onChange({ ...value, to })} />
          </Field>
        </>
      ) : (
        <Field label="Trong kỳ chứa ngày">
          <DateInput
            value={value.anchor ?? ''}
            onChange={(anchor) => onChange({ ...value, anchor })}
          />
        </Field>
      )}

      <Field label="So với">
        <Select
          value={value.compare}
          onChange={(compare) => onChange({ ...value, compare })}
          options={(Object.keys(COMPARE_LABELS) as CompareKind[]).map((kind) => ({
            value: kind,
            label: COMPARE_LABELS[kind],
          }))}
          width={200}
        />
      </Field>

      {resolved ? (
        <p className="ml-auto text-right text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          <span className="text-ink-body">{formatRange(resolved.current)}</span>
          <br />
          so với {formatRange(resolved.baseline)}
        </p>
      ) : null}
    </section>
  )
}

/**
 * `Field` và `DateInput` đã dọn về `components/form.tsx` cùng phần còn lại của
 * bộ ô nhập. Giữ lại đường xuất ở đây vì gần 40 màn đang import từ file này —
 * đổi hết import chỉ để dời một dòng là churn không đọc được trong diff.
 */
export { DateInput, Field } from './form'

// ---------------------------------------------------------------------------

/**
 * Chip chênh lệch ▲▼ (matcha/aka theo §25).
 *
 * Kỳ trước bằng 0 thì hiện "mới" chứ không hiện "+∞%": phần trăm của một mẫu số
 * bằng 0 là con số vô nghĩa, in ra chỉ làm người đọc mất niềm tin vào cả bảng.
 *
 * `goodWhenUp` vì không phải chỉ số nào tăng cũng mừng: doanh thu tăng là matcha,
 * còn food cost tăng là aka. Mũi tên vẫn chỉ đúng chiều, chỉ đổi màu.
 */
export function DeltaChip({
  delta,
  label,
  goodWhenUp = true,
}: {
  delta: Delta
  label: string
  goodWhenUp?: boolean
}) {
  const up = delta.diff > 0
  const flat = delta.diff === 0
  const good = up === goodWhenUp
  const tone = flat ? 'text-ink-mute' : good ? 'text-ok' : 'text-danger'

  return (
    <span className="inline-flex items-baseline gap-1.5 text-[length:var(--fs-c1)]">
      <span className="text-ink-mute">{label}</span>
      <span className={`font-mono ${tone}`}>
        {flat ? '=' : up ? '▲' : '▼'}
        {delta.percent === null
          ? delta.value === 0
            ? ' —'
            : ' mới'
          : ` ${formatPercent(delta.percent)}`}
      </span>
    </span>
  )
}

export function StatTile({
  label,
  value,
  vsYesterday,
  vsLastWeek,
}: {
  label: string
  value: string
  vsYesterday: Delta
  vsLastWeek: Delta
}) {
  return (
    <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p className="mt-2 font-mono text-[length:var(--fs-d3)] leading-none text-ink-hi">{value}</p>
      <div className="mt-3 flex flex-col gap-1">
        <DeltaChip delta={vsYesterday} label="hôm qua" />
        <DeltaChip delta={vsLastWeek} label="cùng thứ tuần trước" />
      </div>
    </div>
  )
}

/**
 * Ô chưa có nguồn.
 *
 * Cố ý KHÔNG hiện 0₫. Một số 0 ở ô food cost hay ở dòng giá vốn trông y hệt một
 * số đo thật, và người đọc sẽ tin nó — đó là cách một báo cáo lãi/lỗ biến quán
 * đang lỗ thành quán đang lãi.
 */
export function BlockedStat({ label, tile }: { label: string; tile: BlockedTile }) {
  return (
    <div className="rounded-md border border-dashed border-line-3 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p className="mt-2 font-mono text-[length:var(--fs-d3)] leading-none text-line-4">—</p>
      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        {tile.blockedBy}
      </p>
    </div>
  )
}

/** Tiền có thể âm (bút toán ngược, lệch quỹ) — `formatVnd` đã lo dấu trừ */
export function Money({ amount, className = '' }: { amount: number; className?: string }) {
  return <span className={`font-mono ${className}`}>{formatVnd(amount)}</span>
}
