import {
  formatKpiScore,
  formatKpiValue,
  KPI_METRICS,
  type KpiCycleView,
  type KpiItemView,
  type KpiMetricCode,
  type KpiRules,
  type KpiSource,
} from '@sora/contracts'
import { EmberBar, kpiHeat } from '@sora/ui'

/**
 * Mảnh giao diện KPI dùng chung cho N9 · N10 · N1 · H7.
 *
 * Thang than hồng ở đây nghĩa là "nóng = cần can thiệp": hạng A là tro, D là lửa.
 * Màu không bao giờ đứng một mình — luôn có chữ "Hạng B", "92%" đi kèm.
 */

export const SOURCE_LABELS: Record<KpiSource, string> = {
  'tu-dong': 'Tự động',
  'nhap-tay': 'Quản lý chấm 1–5',
  'phieu-kiem-tra': 'Phiếu kiểm tra (N11)',
}

/** Nhóm theo tiền tố mã — để ô chọn và danh mục 32 chỉ số đọc được */
const GROUPS: Record<string, string> = {
  cn: 'Bán hàng',
  kh: 'Khách',
  bep: 'Bếp',
  kho: 'Kho',
  san: 'Sàn',
  tn: 'Két',
  ol: 'Online',
  lt: 'Lễ tân',
  kt: 'Văn phòng',
  cc: 'Chuyên cần',
  tc: 'Tổ chức',
  nt: 'Chấm tay & kiểm tra',
}

export const metricGroup = (code: KpiMetricCode) => GROUPS[code.split('.')[0]!] ?? ''

export function cycleLabel(c: Pick<KpiCycleView, 'kind' | 'periodStart' | 'periodEnd'>) {
  const [y, m] = c.periodStart.split('-')
  if (c.kind === 'thang') return `Tháng ${Number(m)}/${y}`
  return `Quý · tháng ${Number(m)}–${Number(c.periodEnd.split('-')[1])}/${y}`
}

/** Điểm tổng: số mono, "—" khi chưa có chỉ số nào có dữ liệu */
export function Score({ milli }: { milli: number | null }) {
  return milli === null ? (
    <span className="text-ink-mute">—</span>
  ) : (
    <span className="font-mono tabular-nums">{formatKpiScore(milli)}</span>
  )
}

/** Thực tế của một chỉ số — bị che thì nói là bị che, không có dữ liệu thì nói vì sao */
export function ItemActual({ item, rules }: { item: KpiItemView; rules: KpiRules | null }) {
  if (item.masked) {
    return <span className="text-ink-mute">Che số — chỉ hiện % đạt</span>
  }
  if (item.actualMilli === null) {
    return (
      <span className="text-ink-mute">
        {item.source === 'nhap-tay' ? 'Chưa chấm' : 'Không có dữ liệu'}
      </span>
    )
  }
  const def = KPI_METRICS[item.metricCode]
  const min = 'minSample' in def && def.minSample && rules ? rules.minSample[def.minSample] : null
  const small = min !== null && item.sampleCount !== null && item.sampleCount < min
  return (
    <span className="flex flex-col">
      <span className="font-mono tabular-nums text-ink-hi">
        {formatKpiValue(item.actualMilli, item.unit)}
      </span>
      {item.sampleCount !== null && min !== null ? (
        <span
          className={`text-[length:var(--fs-c1)] ${small ? 'text-danger-line' : 'text-ink-mute'}`}
        >
          {small ? `Mẫu ${item.sampleCount} < ${min} — chưa tính` : `Mẫu ${item.sampleCount}`}
        </span>
      ) : null}
    </span>
  )
}

export function ItemTarget({ item }: { item: KpiItemView }) {
  if (item.masked) return <span className="text-ink-mute">—</span>
  return (
    <span className="flex flex-col">
      <span className="font-mono tabular-nums">
        {item.direction === 'thap' ? '≤ ' : '≥ '}
        {formatKpiValue(item.targetMilli, item.unit)}
      </span>
      {item.targetNote ? (
        <span className="text-[length:var(--fs-c1)] text-ink-mute" title={item.targetNote}>
          Chỉ tiêu riêng
        </span>
      ) : null}
    </span>
  )
}

/** % đạt bằng thanh than hồng + số; null là "không tính", không phải 0% */
export function Achievement({ item, rules }: { item: KpiItemView; rules: KpiRules | null }) {
  if (item.excludedReason) {
    return (
      <span className="text-[length:var(--fs-c1)] text-ink-mute" title={item.excludedReason}>
        Đã loại: {item.excludedReason}
      </span>
    )
  }
  if (item.achievementMilli === null) {
    return <span className="text-[length:var(--fs-c1)] text-ink-mute">Không tính</span>
  }
  // 1000 milli = đạt 100%
  const pct = item.achievementMilli / 10
  const text = `${formatKpiScore(item.achievementMilli * 100)}%`
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="font-mono tabular-nums text-ink-hi">{text}</span>
      <EmberBar
        fill={pct / (rules?.achievementCapPct ?? 120)}
        heat={kpiHeat(pct, rules)}
        label={`${item.label}: đạt ${text}`}
      />
    </span>
  )
}
