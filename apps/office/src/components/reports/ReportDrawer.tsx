import type { ReportValue, WorkReportDetail } from '@sora/contracts'
import { Button, ErrorState, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Drawer } from '../Drawer'
import { Field, ListHead, TextArea } from '../form'
import { formatDateTime } from '../tasks/task-ui'
import { AutoValueText, FieldInput, FieldValue, ReportStateBadge } from './report-ui'

/**
 * Một bản báo cáo — điền và nộp (N1, `mine`) hoặc xem và xác nhận (N7, `review`).
 *
 * Lúc còn nháp, số tự điền là XEM TRƯỚC (máy tính lại mỗi lần mở); bấm nộp thì
 * máy chụp lại và đóng băng. Đã nộp thì không sửa — viết bổ sung.
 */
export function ReportDrawer({
  reportId,
  mode,
  onClose,
}: {
  reportId: number | null
  mode: 'mine' | 'review'
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['work-report', mode, reportId],
    queryFn: () => (mode === 'mine' ? api.myReport(reportId!) : api.workReport(reportId!)),
    enabled: reportId !== null,
  })
  const report = detail.data
  return (
    <Drawer
      open={reportId !== null}
      onClose={onClose}
      width={720}
      title={report?.templateName ?? 'Báo cáo'}
      subtitle={
        report ? (
          <span className="flex flex-wrap items-center gap-2">
            <ReportStateBadge state={report.state} />
            <span>
              {[report.shiftLabel, report.businessDate.split('-').reverse().join('/')]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span>· hạn {formatDateTime(report.dueAt)}</span>
            {report.submittedAt ? (
              <span className={report.onTime ? '' : 'font-semibold text-danger-line'}>
                · nộp {formatDateTime(report.submittedAt)}
                {report.onTime ? '' : ' (trễ hạn)'}
              </span>
            ) : null}
          </span>
        ) : undefined
      }
    >
      {detail.isError ? <ErrorState message={(detail.error as Error).message} /> : null}
      {detail.isPending ? <Skeleton className="h-64" /> : null}
      {report ? <Body key={report.id} report={report} mode={mode} onDone={onClose} /> : null}
    </Drawer>
  )
}

function Body({
  report,
  mode,
  onDone,
}: {
  report: WorkReportDetail
  mode: 'mine' | 'review'
  onDone: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, ReportValue>>(report.values)
  const [dirty, setDirty] = useState(false)
  const [note, setNote] = useState('')
  const [addendum, setAddendum] = useState('')
  useEffect(() => setValues(report.values), [report.values])

  const refresh = () => {
    for (const key of ['work-report', 'work-reports', 'report-slots', 'org-inbox']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const save = useMutation({
    mutationFn: () => api.saveMyReport(report.id, values),
    onSuccess: () => {
      setDirty(false)
      toast('Đã lưu nháp', 'ok')
      refresh()
    },
    onError: fail,
  })
  const submit = useMutation({
    mutationFn: async () => {
      if (dirty) await api.saveMyReport(report.id, values)
      return api.submitMyReport(report.id)
    },
    onSuccess: (r) => {
      toast(r.onTime ? 'Đã nộp báo cáo' : 'Đã nộp báo cáo — trễ hạn', r.onTime ? 'ok' : 'warn')
      refresh()
      onDone()
    },
    onError: fail,
  })
  const review = useMutation({
    mutationFn: () => api.reviewWorkReport(report.id, note.trim() || null),
    onSuccess: () => {
      toast('Đã xác nhận báo cáo', 'ok')
      refresh()
      onDone()
    },
    onError: fail,
  })
  const addNote = useMutation({
    mutationFn: () => api.addWorkReportAddendum(report.id, addendum.trim(), mode === 'mine'),
    onSuccess: () => {
      setAddendum('')
      toast('Đã thêm bổ sung', 'ok')
      refresh()
    },
    onError: fail,
  })

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        {report.fields.map((f) => (
          <div key={f.key} className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-4">
            <span className="pt-2 text-[length:var(--fs-b2)] text-ink-body">
              {f.label}
              {f.required ? <span className="text-danger-line"> *</span> : null}
              {f.auto ? (
                <span className="block text-[length:var(--fs-c1)] text-ink-mute">
                  tự điền{report.state === 'draft' ? ' · xem trước' : ''}
                </span>
              ) : null}
            </span>
            <div className="min-w-0 pt-2 text-[length:var(--fs-b2)]">
              {f.auto ? (
                <AutoValueText field={f} value={report.autoValues[f.key]} />
              ) : report.canEdit ? (
                <div className="-mt-2">
                  <FieldInput
                    field={f}
                    value={values[f.key]}
                    disabled={false}
                    onChange={(v) => {
                      setValues((old) => ({ ...old, [f.key]: v }))
                      setDirty(true)
                    }}
                  />
                  {f.hint ? (
                    <span className="mt-1 block text-[length:var(--fs-c1)] text-ink-mute">
                      {f.hint}
                    </span>
                  ) : null}
                </div>
              ) : (
                <FieldValue field={f} value={report.values[f.key]} />
              )}
            </div>
          </div>
        ))}
      </div>

      {report.reviewNote || report.reviewedByName ? (
        <p className="rounded-sm border border-line-1 bg-canvas px-4 py-3 text-[length:var(--fs-b2)] text-ink-hi">
          {report.reviewedByName} đã xác nhận {formatDateTime(report.reviewedAt)}
          {report.reviewNote ? `: ${report.reviewNote}` : ''}
        </p>
      ) : null}

      {report.addenda.length > 0 ? (
        <div>
          <ListHead label="Bổ sung sau khi nộp" />
          <div className="grid gap-2">
            {report.addenda.map((a) => (
              <p key={a.id} className="text-[length:var(--fs-b2)] text-ink-hi">
                <span className="text-ink-mute">
                  {a.authorName} · {formatDateTime(a.createdAt)}:{' '}
                </span>
                {a.body}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {report.canAddendum ? (
        <Field label="Viết bổ sung" hint="Bản đã nộp không sửa — điều cần nói thêm ghi ở đây.">
          <div className="flex gap-2">
            <TextArea value={addendum} onChange={setAddendum} rows={2} />
            <Button
              disabled={!addendum.trim() || addNote.isPending}
              onClick={() => addNote.mutate()}
            >
              Thêm bổ sung
            </Button>
          </div>
        </Field>
      ) : null}

      {report.canReview ? (
        <div className="grid gap-2 border-t border-line-1 pt-4">
          <Field label="Nhận xét khi xác nhận (tuỳ chọn)">
            <TextArea value={note} onChange={setNote} rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" disabled={review.isPending} onClick={() => review.mutate()}>
              {report.reviewMode === 'ca-sau' ? 'Nhận ca' : 'Xác nhận đã xem'}
            </Button>
          </div>
        </div>
      ) : null}

      {report.canSubmit ? (
        <div className="flex justify-end gap-2 border-t border-line-1 pt-4">
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            Lưu nháp
          </Button>
          <Button variant="primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
            Nộp báo cáo
          </Button>
        </div>
      ) : null}
    </div>
  )
}
