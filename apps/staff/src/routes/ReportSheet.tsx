import type { ReportField, ReportValue, WorkReportDetail } from '@sora/contracts'
import { Button, ErrorState, Sheet, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api'

/** Nháp trên máy — mất sóng giữa chừng không mất chữ đã gõ */
const draftKey = (id: number) => `sora.staff.report-draft.${id}`

function loadDraft(id: number): Record<string, ReportValue> | null {
  try {
    const raw = localStorage.getItem(draftKey(id))
    return raw ? (JSON.parse(raw) as Record<string, ReportValue>) : null
  } catch {
    return null
  }
}

function keepDraft(id: number, values: Record<string, ReportValue>) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(values))
  } catch {
    // Trình duyệt chặn bộ nhớ (ẩn danh): vẫn lưu nháp lên máy chủ bằng nút "Lưu nháp"
  }
}

function dropDraft(id: number) {
  try {
    localStorage.removeItem(draftKey(id))
  } catch {
    // như trên
  }
}

/**
 * N15 — Điền và nộp báo cáo ca (chỉ mẫu không có tiền). Số tự điền là xem trước;
 * bấm nộp thì máy chủ tính lại và đóng băng. Chữ đã gõ giữ trong máy cho tới khi
 * nộp xong.
 */
export function ReportSheet({
  reportId,
  onClose,
}: {
  reportId: number | null
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => api.report(reportId!),
    enabled: reportId !== null,
  })
  return (
    <Sheet open={reportId !== null} onClose={onClose} full>
      <div className="flex min-h-0 flex-1 flex-col">
        {detail.isPending ? (
          <div className="flex flex-col gap-3 px-5 pt-4">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-24" />
          </div>
        ) : null}
        {detail.isError ? (
          <div className="px-5 pt-4">
            <ErrorState message={(detail.error as Error).message} />
          </div>
        ) : null}
        {detail.data ? <Body key={detail.data.id} report={detail.data} onClose={onClose} /> : null}
      </div>
    </Sheet>
  )
}

function Body({ report, onClose }: { report: WorkReportDetail; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, ReportValue>>(
    () => loadDraft(report.id) ?? report.values,
  )
  useEffect(() => {
    if (report.canEdit) keepDraft(report.id, values)
  }, [values, report.id, report.canEdit])

  const submit = useMutation({
    mutationFn: async () => {
      await api.saveReport(report.id, values)
      return api.submitReport(report.id)
    },
    onSuccess: (r) => {
      dropDraft(report.id)
      toast(r.onTime ? 'Đã nộp báo cáo' : 'Đã nộp báo cáo — trễ hạn', r.onTime ? 'ok' : 'warn')
      void queryClient.invalidateQueries({ queryKey: ['reports-due'] })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
        <h2 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
          {report.templateName}
        </h2>
        <p className="mt-1 text-[length:var(--fs-b2)] text-ink-body">
          {[report.shiftLabel, report.businessDate.split('-').reverse().join('/')]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-5 flex flex-col gap-5">
          {report.fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-2">
              <span className="text-[length:var(--fs-b2)] text-ink-body">
                {f.label}
                {f.required ? ' *' : ''}
              </span>
              {f.auto ? (
                <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">
                  {report.autoValues[f.key]?.value ?? report.autoValues[f.key]?.note ?? '—'}
                </span>
              ) : (
                <FieldControl
                  field={f}
                  value={values[f.key]}
                  disabled={!report.canEdit}
                  onChange={(v) => setValues((old) => ({ ...old, [f.key]: v }))}
                />
              )}
            </label>
          ))}
        </div>
      </div>
      {report.canSubmit ? (
        <div className="border-t border-line-2 bg-surface-2 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <Button
            block
            variant="primary"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Nộp báo cáo
          </Button>
        </div>
      ) : null}
    </>
  )
}

const CONTROL =
  'w-full rounded-sm border border-line-3 bg-canvas px-3 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute'

function FieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ReportField
  value: ReportValue | undefined
  disabled: boolean
  onChange: (v: ReportValue) => void
}) {
  if (field.type === 'co-khong') {
    const on = value === true
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={[
          'flex h-[var(--hit-target)] items-center justify-center rounded-sm border text-[length:var(--fs-b1)]',
          on ? 'border-ok bg-surface-2 text-ink-hi' : 'border-line-3 text-ink-mute',
        ].join(' ')}
      >
        {on ? 'Đã xác nhận' : 'Chạm để xác nhận'}
      </button>
    )
  }
  if (field.type === 'doan') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className={`${CONTROL} py-2`}
      />
    )
  }
  if (field.type === 'so') {
    return (
      <input
        type="number"
        inputMode="numeric"
        value={typeof value === 'number' ? value : ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`${CONTROL} h-[var(--hit-target)] font-mono`}
      />
    )
  }
  if (field.type === 'chon') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${CONTROL} h-[var(--hit-target)]`}
      >
        <option value="">Chọn…</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      type={field.type === 'gio' ? 'time' : 'text'}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      placeholder={field.type === 'url' ? 'https://…' : undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${CONTROL} h-[var(--hit-target)]`}
    />
  )
}
