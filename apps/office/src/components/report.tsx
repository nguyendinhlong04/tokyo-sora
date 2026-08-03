import { formatVnd } from '@sora/contracts'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  api,
  type BlockedTile,
  type CompareKind,
  type Delta,
  type PeriodChoice,
  type PeriodKind,
  type ResolvedPeriod,
} from '../api'
import { useSession } from '../session-context'
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
  children,
}: {
  value: PeriodChoice
  onChange: (next: PeriodChoice) => void
  resolved?: ResolvedPeriod
  /** Bộ lọc đứng TRƯỚC "Kỳ" — chọn phạm vi rồi mới chọn thời gian. Nhóm B nhét ô chi nhánh vào đây. */
  children?: ReactNode
}) {
  return (
    <section className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      {children}
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

interface ReportBranchValue {
  branchId: string | null
  setBranchId: (next: string) => void
}

const ReportBranchCtx = createContext<ReportBranchValue | null>(null)

/**
 * Chi nhánh đang xem của nhóm báo cáo B1–B10.
 *
 * Khác các màn vận hành (nơi đổi chi nhánh nghĩa là đăng nhập lại đúng phạm vi —
 * xem session-context), màn báo cáo là màn ĐỌC để so sánh: người quản lý chuỗi
 * đảo giữa các chi nhánh nhiều lần trong một phiên. Lựa chọn nằm ở context nên
 * đổi một lần là cả nhóm B đổi theo, chuyển trang không phải chọn lại; mặc định
 * vẫn là chi nhánh của phiên đăng nhập, và đăng xuất là lựa chọn tự mất theo
 * provider. Quyền đọc báo cáo vẫn do guard máy chủ cưỡng chế theo từng route.
 */
export function ReportBranchProvider({ children }: { children: ReactNode }) {
  const { branchId: sessionBranch } = useSession()
  const [choice, setChoice] = useState<string | null>(null)

  const value = useMemo(
    () => ({ branchId: choice ?? sessionBranch, setBranchId: setChoice }),
    [choice, sessionBranch],
  )
  return <ReportBranchCtx.Provider value={value}>{children}</ReportBranchCtx.Provider>
}

export function useReportBranch(): ReportBranchValue {
  const value = useContext(ReportBranchCtx)
  if (!value) throw new Error('useReportBranch phải nằm trong <ReportBranchProvider>')
  return value
}

/**
 * Ô chọn chi nhánh của nhóm báo cáo — B1 đặt cạnh ô ngày trên đầu trang, các màn
 * còn lại nhét vào PeriodComparator. Nguồn là /api/site/branches (chỉ chi nhánh
 * đang hoạt động) — cùng danh sách màn đăng nhập dùng nên trúng cache sẵn.
 */
export function BranchPicker() {
  const { branchId, setBranchId } = useReportBranch()
  const branches = useQuery({ queryKey: ['public-branches'], queryFn: api.publicBranches })

  // Chưa tải xong thì tạm hiện mã chi nhánh — ô không nhảy bề rộng khi data về
  const options =
    branches.data?.map((b) => ({ value: b.id, label: b.name })) ??
    (branchId ? [{ value: branchId, label: branchId }] : [])

  return (
    <Field label="Chi nhánh">
      <Select
        value={branchId ?? ''}
        onChange={setBranchId}
        options={options}
        disabled={!branches.data}
        width={200}
      />
    </Field>
  )
}

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
