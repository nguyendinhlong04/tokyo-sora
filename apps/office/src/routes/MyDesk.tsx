import {
  KPI_CYCLE_STATE_LABELS,
  type KpiReviewRow,
  type MyDocument,
  type ReportSlot,
  type TaskRow,
} from '@sora/contracts'
import { Badge, Button, ErrorState, GradeChip, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api'
import { cycleLabel, Score } from '../components/kpi/kpi-ui'
import { MyKpiDrawer } from '../components/kpi/MyKpiDrawer'
import { PageHeader } from '../components/PageHeader'
import { IncidentFormDrawer } from '../components/reports/IncidentFormDrawer'
import { ReportDrawer } from '../components/reports/ReportDrawer'
import { slotTitle } from '../components/reports/report-ui'
import { ChecklistProgress, DueText, assigneeOf, TaskStateBadge } from '../components/tasks/task-ui'
import { formatDateTime } from '../components/tasks/task-ui'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { useSession } from '../session-context'

/**
 * N1 — Bàn làm việc: trang mở đầu của Office.
 *
 * Trả lời một câu: "hôm nay tôi phải làm gì". Việc của tôi (quá hạn → hôm nay →
 * sắp tới, máy chủ đã sắp), việc chờ tôi nghiệm thu, văn bản cần đọc / cần ký,
 * phiếu KPI của tôi. Mỗi dòng mở thẳng chỗ xử lý — không có số liệu kinh doanh ở
 * đây, đó là việc của B1.
 */

/** Phiếu đang chờ chính người này tự đánh giá */
const selfDue = (r: KpiReviewRow) =>
  (r.cycleState === 'open' || r.cycleState === 'review') &&
  !r.selfSubmittedAt &&
  !r.finalizedAt &&
  !r.exempt

const endOfTodayVN = () => {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
  return new Date(`${day}T23:59:59+07:00`).getTime()
}

export function MyDesk() {
  const { staff } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [openId, setOpenId] = useState<number | null>(null)
  const [reportId, setReportId] = useState<number | null>(null)
  const [reporting, setReporting] = useState(false)
  const [kpiId, setKpiId] = useState<number | null>(null)
  const tasks = useQuery({ queryKey: ['my-tasks'], queryFn: api.myTasks, refetchInterval: 60_000 })
  const slots = useQuery({ queryKey: ['report-slots', 'mine'], queryFn: api.myReportsDue })
  // Mở suất: lần đầu tạo bản nháp, các lần sau lấy lại đúng bản đó
  const openSlot = useMutation({
    mutationFn: (slot: ReportSlot) => api.openMyReport(slot),
    onSuccess: (detail) => setReportId(detail.id),
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  const dueSlots = (slots.data ?? []).filter((s) => s.state === null || s.state === 'draft')
  const docs = useQuery({ queryKey: ['docs', 'mine'], queryFn: api.myDocuments })
  const inbox = useQuery({ queryKey: ['org-inbox'], queryFn: api.inbox, staleTime: 30_000 })
  const kpi = useQuery({ queryKey: ['kpi', 'mine'], queryFn: api.myKpi })
  const kpiToReview = inbox.data?.kpi.toReview ?? 0

  const buckets = useMemo(() => {
    const end = endOfTodayVN()
    const open = tasks.data?.open ?? []
    return {
      late: open.filter((t) => t.overdue),
      today: open.filter((t) => !t.overdue && new Date(t.dueAt).getTime() <= end),
      later: open.filter((t) => !t.overdue && new Date(t.dueAt).getTime() > end),
    }
  }, [tasks.data])

  const unreadDocs = (docs.data ?? []).filter((d) => !d.readAt || (d.requiresAck && !d.ackedAt))
  const toSign = inbox.data?.documents.toSign ?? 0
  const feedback = inbox.data?.feedback

  return (
    <>
      <PageHeader
        title="Bàn làm việc"
        subtitle={`Việc của ${staff?.fullName ?? 'bạn'}: việc được giao, checklist ca, báo cáo cần nộp, văn bản cần đọc, việc chờ bạn nghiệm thu.`}
        action={<Button onClick={() => setReporting(true)}>Báo sự cố</Button>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {tasks.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(tasks.error as Error).message}
              action={<Button onClick={() => void tasks.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_380px] gap-6">
          <div className="grid content-start gap-6">
            {tasks.isPending ? (
              <div className="grid gap-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : null}
            {tasks.data && tasks.data.open.length === 0 ? (
              <Panel title="Việc của tôi">
                <p className="text-[length:var(--fs-b2)] text-ink-mute">
                  Không có việc nào đang chờ bạn.
                  {tasks.data.shiftToday ? ` Ca hôm nay: ${tasks.data.shiftToday.label}.` : ''}
                </p>
              </Panel>
            ) : null}
            <TaskGroup title="Quá hạn" rows={buckets.late} onOpen={setOpenId} urgent />
            <TaskGroup title="Hôm nay" rows={buckets.today} onOpen={setOpenId} />
            <TaskGroup title="Sắp tới" rows={buckets.later} onOpen={setOpenId} />
            {tasks.data && tasks.data.recent.length > 0 ? (
              <TaskGroup title="Đã nộp gần đây" rows={tasks.data.recent} onOpen={setOpenId} muted />
            ) : null}
          </div>

          <aside className="grid content-start gap-4">
            {dueSlots.length > 0 ? (
              <Panel title={`Báo cáo cần nộp · ${dueSlots.length}`}>
                <div className="grid gap-1">
                  {dueSlots.map((s) => (
                    <button
                      key={`${s.templateId}|${s.periodKey}|${s.shiftTemplateId ?? 0}`}
                      type="button"
                      disabled={openSlot.isPending}
                      onClick={() => openSlot.mutate(s)}
                      className="flex flex-col items-start rounded-sm px-2 py-2 text-left text-[length:var(--fs-b2)] hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span className="text-ink-hi">{slotTitle(s)}</span>
                      <span
                        className={[
                          'text-[length:var(--fs-c1)]',
                          s.overdue ? 'font-semibold text-danger-line' : 'text-ink-mute',
                        ].join(' ')}
                      >
                        {s.overdue ? 'Quá hạn' : 'Hạn'} {formatDateTime(s.dueAt)}
                        {s.state === 'draft' ? ' · có nháp' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </Panel>
            ) : null}

            <Panel title={`Chờ tôi nghiệm thu · ${tasks.data?.toReview.length ?? 0}`}>
              {(tasks.data?.toReview ?? []).length === 0 ? (
                <p className="text-[length:var(--fs-c1)] text-ink-mute">
                  Không có việc nào chờ bạn.
                </p>
              ) : (
                <div className="grid gap-1">
                  {tasks.data!.toReview.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      className="flex items-center gap-3 rounded-sm px-2 py-2 text-left text-[length:var(--fs-b2)] hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink-hi">{t.title}</span>
                      <span className="flex-none text-[length:var(--fs-c1)] text-ink-mute">
                        {t.submittedByName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Văn bản">
              {toSign > 0 ? (
                <Link
                  to="/van-ban?tab=can-ky"
                  className="mb-2 flex items-center justify-between rounded-sm border border-accent px-3 py-2 text-[length:var(--fs-b2)] text-ink-hi hover:bg-surface-3"
                >
                  Chờ bạn ký <span className="font-mono tabular-nums">{toSign}</span>
                </Link>
              ) : null}
              {unreadDocs.length === 0 ? (
                <p className="text-[length:var(--fs-c1)] text-ink-mute">
                  Đã đọc hết văn bản gửi bạn.
                </p>
              ) : (
                <div className="grid gap-1">
                  {unreadDocs.slice(0, 8).map((d) => (
                    <DocLine key={d.id} doc={d} onOpen={() => navigate(`/van-ban/${d.id}`)} />
                  ))}
                </div>
              )}
            </Panel>

            {(kpi.data ?? []).length > 0 || kpiToReview > 0 ? (
              <Panel title="KPI">
                {kpiToReview > 0 ? (
                  <Link
                    to="/danh-gia-kpi"
                    className="mb-2 flex items-center justify-between rounded-sm border border-accent px-3 py-2 text-[length:var(--fs-b2)] text-ink-hi hover:bg-surface-3"
                  >
                    Phiếu chờ bạn chấm <span className="font-mono tabular-nums">{kpiToReview}</span>
                  </Link>
                ) : null}
                <div className="grid gap-1">
                  {(kpi.data ?? []).slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setKpiId(r.id)}
                      className="flex items-center gap-3 rounded-sm px-2 py-2 text-left text-[length:var(--fs-b2)] hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-ink-hi">
                          {cycleLabel({
                            kind: r.cycleKind,
                            periodStart: r.periodStart,
                            periodEnd: r.periodEnd,
                          })}
                        </span>
                        <span
                          className={[
                            'text-[length:var(--fs-c1)]',
                            selfDue(r) ? 'font-semibold text-ink-hi' : 'text-ink-mute',
                          ].join(' ')}
                        >
                          {selfDue(r)
                            ? 'Cần bạn tự đánh giá'
                            : KPI_CYCLE_STATE_LABELS[r.cycleState]}
                        </span>
                      </span>
                      {r.exempt ? (
                        <span className="text-[length:var(--fs-c1)] text-ink-mute">Miễn</span>
                      ) : (
                        <span className="flex flex-none flex-col items-end">
                          <Score milli={r.scoreMilli} />
                          <GradeChip grade={r.grade} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </Panel>
            ) : null}

            {feedback ? (
              <Panel title="Khiếu nại bạn đang xử lý">
                <Link
                  to="/phan-hoi"
                  className="flex items-center justify-between text-[length:var(--fs-b2)] text-ink-hi hover:underline"
                >
                  <span>
                    {feedback.assigned} khiếu nại
                    {feedback.overdue > 0 ? (
                      <span className="font-semibold text-danger-line">
                        {' '}
                        · {feedback.overdue} quá hạn phản hồi
                      </span>
                    ) : null}
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              </Panel>
            ) : null}
          </aside>
        </div>
      </div>

      <TaskDrawer taskId={openId} mode="mine" onClose={() => setOpenId(null)} />
      <ReportDrawer reportId={reportId} mode="mine" onClose={() => setReportId(null)} />
      {reporting ? <IncidentFormDrawer onClose={() => setReporting(false)} /> : null}
      <MyKpiDrawer reviewId={kpiId} onClose={() => setKpiId(null)} />
    </>
  )
}

function TaskGroup({
  title,
  rows,
  onOpen,
  urgent = false,
  muted = false,
}: {
  title: string
  rows: TaskRow[]
  onOpen: (id: number) => void
  urgent?: boolean
  muted?: boolean
}) {
  if (rows.length === 0) return null
  return (
    <section>
      <p
        className={[
          'mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] uppercase',
          urgent ? 'text-danger-line' : 'text-ink-mute',
        ].join(' ')}
      >
        {title} · {rows.length}
      </p>
      <div className="grid gap-2">
        {rows.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpen(t.id)}
            className={[
              'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_190px_70px_140px] items-center gap-4 rounded-md border bg-surface-1 px-5 py-3 text-left text-[length:var(--fs-b2)]',
              'transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent',
              urgent ? 'border-danger-line' : 'border-line-1',
              muted ? 'opacity-80' : '',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-2">
              {t.priority === 'gap' && t.state === 'open' ? <Badge tone="danger">Gấp</Badge> : null}
              <span className="truncate font-medium text-ink-hi">{t.title}</span>
            </span>
            <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
              {t.shiftLabel ?? (t.createdByName ? `Giao bởi ${t.createdByName}` : assigneeOf(t))}
            </span>
            <DueText task={t} />
            <ChecklistProgress checklist={t.checklist} />
            <TaskStateBadge state={t.state} />
          </button>
        ))}
      </div>
    </section>
  )
}

function DocLine({ doc, onOpen }: { doc: MyDocument; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2 rounded-sm px-2 py-2 text-left text-[length:var(--fs-b2)] hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span
        className={[
          'min-w-0 flex-1 truncate',
          doc.readAt ? 'text-ink-body' : 'font-semibold text-ink-hi',
        ].join(' ')}
      >
        {doc.title}
      </span>
      {doc.requiresAck && !doc.ackedAt ? <Badge tone="warn">Cần xác nhận</Badge> : null}
    </button>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line-1 bg-surface-1 p-4">
      <p className="mb-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {title}
      </p>
      {children}
    </section>
  )
}
