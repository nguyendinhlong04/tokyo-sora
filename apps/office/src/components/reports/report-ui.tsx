import {
  WORK_REPORT_STATE_LABELS,
  formatVnd,
  type AutoValue,
  type ReportField,
  type ReportSlot,
  type ReportValue,
  type WorkReportState,
} from '@sora/contracts'
import { safeHref } from '@sora/core'
import { Badge } from '@sora/ui'
import { Checkbox, NumberInput, Select, TextArea, TextInput } from '../form'

const formatDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** "Báo cáo cuối ngày · 22/10" hoặc "Sổ giao ca · Ca sáng 07:00–15:00 · 22/10" */
export const slotTitle = (s: Pick<ReportSlot, 'templateName' | 'shiftLabel' | 'businessDate'>) =>
  [s.templateName, s.shiftLabel, formatDay(s.businessDate)].filter(Boolean).join(' · ')

const STATE_TONES: Record<WorkReportState, 'neutral' | 'info' | 'ok'> = {
  draft: 'neutral',
  submitted: 'info',
  reviewed: 'ok',
}

export function ReportStateBadge({ state }: { state: WorkReportState }) {
  return <Badge tone={STATE_TONES[state]}>{WORK_REPORT_STATE_LABELS[state]}</Badge>
}

/** Số tự điền: tiền định dạng VND, null ghi lý do (không bao giờ hiện 0 thay cho "chưa có") */
export function AutoValueText({
  field,
  value,
}: {
  field: ReportField
  value: AutoValue | undefined
}) {
  if (!value || value.value === null) {
    return <span className="text-ink-mute">{value?.note ?? 'Chưa có dữ liệu'}</span>
  }
  if (field.type === 'tien' && typeof value.value === 'number') {
    return <span className="font-mono text-ink-hi tabular-nums">{formatVnd(value.value)}</span>
  }
  return <span className="font-mono text-ink-hi tabular-nums">{String(value.value)}</span>
}

export function FieldValue({
  field,
  value,
}: {
  field: ReportField
  value: ReportValue | undefined
}) {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && !value.length)
  ) {
    return <span className="text-ink-mute">—</span>
  }
  if (field.type === 'co-khong')
    return <span className="text-ink-hi">{value ? 'Có' : 'Không'}</span>
  if (field.type === 'tien' && typeof value === 'number') {
    return <span className="font-mono text-ink-hi tabular-nums">{formatVnd(value)}</span>
  }
  if (field.type === 'url' && typeof value === 'string') {
    const href = safeHref(value)
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-ink hover:underline"
      >
        {value}
      </a>
    ) : (
      <span className="text-ink-mute">{value}</span>
    )
  }
  if (Array.isArray(value)) return <span className="text-ink-hi">{value.join(', ')}</span>
  return <span className="whitespace-pre-wrap text-ink-hi">{String(value)}</span>
}

/** Ô nhập theo kiểu trường — Office, chuột và bàn phím */
export function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ReportField
  value: ReportValue | undefined
  onChange: (next: ReportValue) => void
  disabled: boolean
}) {
  switch (field.type) {
    case 'so':
    case 'tien':
      return (
        <NumberInput
          value={typeof value === 'number' ? value : null}
          onChange={onChange}
          disabled={disabled}
          step={field.type === 'tien' ? 1000 : 1}
        />
      )
    case 'doan':
      return (
        <TextArea
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          rows={3}
          disabled={disabled}
        />
      )
    case 'co-khong':
      return (
        <Checkbox
          checked={value === true}
          onChange={onChange}
          disabled={disabled}
          label={field.required ? 'Xác nhận' : 'Có'}
        />
      )
    case 'chon':
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          placeholder="Chọn…"
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          onChange={onChange}
          disabled={disabled}
        />
      )
    case 'nhieu-chon': {
      const picked = Array.isArray(value) ? value : []
      return (
        <div className="flex flex-wrap gap-3">
          {(field.options ?? []).map((o) => (
            <Checkbox
              key={o}
              checked={picked.includes(o)}
              disabled={disabled}
              label={o}
              onChange={(on) => onChange(on ? [...picked, o] : picked.filter((x) => x !== o))}
            />
          ))}
        </div>
      )
    }
    case 'gio':
      return (
        <TextInput
          type="time"
          mono
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          disabled={disabled}
        />
      )
    default:
      return (
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          disabled={disabled}
          mono={field.type === 'url'}
          placeholder={field.type === 'url' ? 'https://…' : undefined}
        />
      )
  }
}
