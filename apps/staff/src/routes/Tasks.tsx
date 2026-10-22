import type { ReportSlot, TaskRow } from '@sora/contracts'
import { dueLabel } from '@sora/core'
import { Badge, Button, EmptyState, ErrorState, SectionLabel, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { IncidentSheet } from './IncidentSheet'
import { ReportSheet } from './ReportSheet'
import { TaskSheet } from './TaskSheet'

/**
 * N12 — Việc của tôi.
 *
 * Dòng đầu nói ca hôm nay; dưới là việc cần làm theo thứ tự máy chủ đã sắp: quá
 * hạn trước, rồi hôm nay, rồi sắp tới. Checklist mở ca/đóng ca chỉ hiện với
 * người đứng đúng ca đã công bố — xin nghỉ được duyệt là checklist tự đi.
 */
export function Tasks() {
  const toast = useToast()
  const [openId, setOpenId] = useState<number | null>(null)
  const [reportId, setReportId] = useState<number | null>(null)
  const [reporting, setReporting] = useState(false)
  const tasks = useQuery({ queryKey: ['my-tasks'], queryFn: api.myTasks, refetchInterval: 60_000 })
  const reports = useQuery({ queryKey: ['reports-due'], queryFn: api.reportsDue })
  const openSlot = useMutation({
    mutationFn: (slot: ReportSlot) => api.openReport(slot),
    onSuccess: (detail) => setReportId(detail.id),
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  const dueReports = (reports.data ?? []).filter((s) => s.state === null || s.state === 'draft')

  if (tasks.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }
  if (tasks.isError) return <ErrorState message={(tasks.error as Error).message} />

  const { open, recent, toReview, shiftToday } = tasks.data

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[length:var(--fs-b2)] text-ink-body">
        {shiftToday
          ? `Hôm nay · ${shiftToday.label} · ${shiftToday.branchName}`
          : 'Hôm nay bạn không có ca đã công bố.'}
      </p>

      {dueReports.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Báo cáo cần nộp</SectionLabel>
          {dueReports.map((s) => (
            <button
              key={`${s.templateId}|${s.periodKey}|${s.shiftTemplateId ?? 0}`}
              type="button"
              disabled={!s.kenhNv || openSlot.isPending}
              onClick={() => openSlot.mutate(s)}
              className={[
                'flex min-h-[var(--hit-target)] flex-col gap-1 rounded-md border bg-surface-1 px-4 py-3 text-left',
                'focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default',
                s.overdue ? 'border-danger' : 'border-line-2',
              ].join(' ')}
            >
              <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                {s.templateName}
              </span>
              <span className="text-[length:var(--fs-c1)]">
                <span className={s.overdue ? 'font-semibold text-danger' : 'text-ink-body'}>
                  {dueLabel(s.dueAt)}
                </span>
                <span className="text-ink-mute">
                  {s.shiftLabel ? ` · ${s.shiftLabel}` : ''}
                  {s.kenhNv ? '' : ' · có số tiền — nộp ở máy của quán'}
                </span>
              </span>
            </button>
          ))}
        </section>
      ) : null}

      {toReview.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Chờ bạn nghiệm thu</SectionLabel>
          {toReview.map((t) => (
            <TaskLine key={t.id} task={t} onOpen={() => setOpenId(t.id)} reviewing />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionLabel>Cần làm</SectionLabel>
        {open.length === 0 ? (
          <EmptyState title="Không có việc nào đang chờ bạn." />
        ) : (
          open.map((t) => <TaskLine key={t.id} task={t} onOpen={() => setOpenId(t.id)} />)
        )}
      </section>

      {recent.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Đã nộp gần đây</SectionLabel>
          {recent.slice(0, 6).map((t) => (
            <TaskLine key={t.id} task={t} onOpen={() => setOpenId(t.id)} />
          ))}
        </section>
      ) : null}

      <Button block variant="ghost" onClick={() => setReporting(true)}>
        Báo sự cố
      </Button>

      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
      <ReportSheet reportId={reportId} onClose={() => setReportId(null)} />
      <IncidentSheet open={reporting} onClose={() => setReporting(false)} />
    </div>
  )
}

function TaskLine({
  task,
  onOpen,
  reviewing = false,
}: {
  task: TaskRow
  onOpen: () => void
  reviewing?: boolean
}) {
  const late = task.state === 'open' && task.overdue
  const sub = reviewing
    ? `Nộp bởi ${task.submittedByName ?? '—'}`
    : (task.shiftLabel ?? (task.createdByName ? `Giao bởi ${task.createdByName}` : ''))
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        'flex min-h-[var(--hit-target)] flex-col gap-1 rounded-md border bg-surface-1 px-4 py-3 text-left',
        'focus-visible:outline-2 focus-visible:outline-accent',
        late ? 'border-danger' : 'border-line-2',
      ].join(' ')}
    >
      <span className="flex items-center gap-2">
        {task.priority === 'gap' && task.state === 'open' ? <Badge tone="danger">Gấp</Badge> : null}
        <span className="min-w-0 flex-1 text-[length:var(--fs-b1)] font-semibold text-ink-hi">
          {task.title}
        </span>
        {task.checklist.total > 0 ? (
          <span className="flex-none font-mono text-[length:var(--fs-b2)] text-ink-body tabular-nums">
            {task.checklist.checked}/{task.checklist.total}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 text-[length:var(--fs-c1)]">
        {task.state === 'open' ? (
          <span className={late ? 'font-semibold text-danger' : 'text-ink-body'}>
            {dueLabel(task.dueAt)}
          </span>
        ) : (
          <span className="text-ink-mute">
            {task.state === 'submitted'
              ? 'Chờ nghiệm thu'
              : task.state === 'done'
                ? 'Xong'
                : 'Đã huỷ'}
          </span>
        )}
        {sub ? <span className="text-ink-mute">· {sub}</span> : null}
      </span>
    </button>
  )
}
