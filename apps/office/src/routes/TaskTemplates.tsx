import {
  TASK_RECURRENCE_LABELS,
  WEEKDAY_LABELS,
  type TaskRow,
  type TaskTemplateView,
} from '@sora/contracts'
import { Badge, Button, EmptyState, ErrorState, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { DateInput, Field, FilterBar, SegmentedControl, Select } from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { ChecklistProgress, DueText, TaskStateBadge } from '../components/tasks/task-ui'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TemplateDrawer } from '../components/tasks/TemplateDrawer'
import { useSession } from '../session-context'

/**
 * N6 — Việc định kỳ & SOP.
 *
 * "Hôm nay" là câu hỏi của quản lý ca lúc giao ca: checklist mở ca, đóng ca, vệ
 * sinh đã ai làm, ai nghiệm thu, còn gì trễ — gom theo ca. "Mẫu" là nơi dựng SOP:
 * giao cho CHỨC DANH, lặp theo ca / ngày / tuần / tháng.
 */

type Tab = 'hom-nay' | 'mau'

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

const scheduleOf = (t: TaskTemplateView) => {
  switch (t.recurrence) {
    case 'theo-ca':
      return t.shiftLabel ?? 'Theo ca'
    case 'hang-tuan':
      return `${TASK_RECURRENCE_LABELS[t.recurrence]} · ${WEEKDAY_LABELS[t.weekday ?? 1]}`
    case 'hang-thang':
      return `${TASK_RECURRENCE_LABELS[t.recurrence]} · ngày ${t.monthDay}`
    default:
      return TASK_RECURRENCE_LABELS[t.recurrence]
  }
}

export function TaskTemplates() {
  const { branchId: sessionBranch } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'hom-nay'
  const [branch, setBranch] = useState(sessionBranch ?? '')
  const [date, setDate] = useState(todayVN)
  const [openTask, setOpenTask] = useState<number | null>(null)
  const [editing, setEditing] = useState<TaskTemplateView | 'new' | null>(null)

  const chart = useQuery({ queryKey: ['org', 'chart'], queryFn: () => api.orgChart() })
  const branchUnits = useMemo(
    () => (chart.data?.units ?? []).filter((u) => u.kind === 'chi-nhanh' && u.branchId),
    [chart.data],
  )
  const today = useQuery({
    queryKey: ['tasks', 'sop', branch, date],
    queryFn: () => api.tasks({ view: 'sop', branch, date }),
    enabled: tab === 'hom-nay' && Boolean(branch),
  })
  const templates = useQuery({
    queryKey: ['task-templates', branch],
    queryFn: () => api.taskTemplates(branch),
    enabled: tab === 'mau' && Boolean(branch),
  })
  const shifts = useQuery({
    queryKey: ['task-shifts', branch],
    queryFn: () => api.taskShifts(branch),
    enabled: Boolean(branch),
  })

  const standard = useMutation({
    mutationFn: () => api.applyStandardSops(branch),
    onSuccess: (r) => {
      const parts = [
        r.created > 0 ? `Đã tạo ${r.created} mẫu` : 'Bộ SOP chuẩn đã có đủ',
        r.withoutShifts ? 'chi nhánh chưa có ca mẫu nên SOP mở/đóng ca chạy theo giờ cố định' : '',
        r.skipped.length > 0
          ? `bỏ qua ${r.skipped.length}: ${r.skipped.map((s) => s.reason).join('; ')}`
          : '',
      ].filter(Boolean)
      toast(parts.join(' — '), r.skipped.length > 0 ? 'warn' : 'ok')
      void queryClient.invalidateQueries({ queryKey: ['task-templates'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  // Hôm nay gom theo ca: ca mở cửa trước, việc không theo ca để cuối
  const groups = useMemo(() => {
    const map = new Map<string, TaskRow[]>()
    for (const t of today.data ?? []) {
      const key = t.shiftLabel ?? 'Trong ngày'
      map.set(key, [...(map.get(key) ?? []), t])
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === 'Trong ngày' ? 1 : b === 'Trong ngày' ? -1 : 0,
    )
  }, [today.data])

  const templateColumns: Column<TaskTemplateView>[] = [
    {
      key: 'title',
      header: 'Việc',
      width: 'minmax(220px, 2fr)',
      cell: (t) => (
        <span className="flex min-w-0 items-center gap-2">
          {t.priority === 'gap' ? <Badge tone="danger">Gấp</Badge> : null}
          <span className="truncate font-medium text-ink-hi">{t.title}</span>
        </span>
      ),
    },
    {
      key: 'seat',
      header: 'Ghế làm',
      width: 'minmax(170px, 1fr)',
      cell: (t) => (
        <span className="truncate text-ink-body">
          {t.assigneePositionTitle} · {t.assigneeUnitName}
        </span>
      ),
    },
    {
      key: 'review',
      header: 'Nghiệm thu',
      width: '150px',
      cell: (t) => t.reviewerPositionTitle ?? <span className="text-ink-mute">Không cần</span>,
    },
    { key: 'when', header: 'Lặp lại', width: 'minmax(180px, 1fr)', cell: (t) => scheduleOf(t) },
    {
      key: 'due',
      header: 'Hạn',
      width: '100px',
      cell: (t) => (
        <span className="font-mono tabular-nums">
          {t.dueMinute === null ? 'Kết ca' : hhmm(t.dueMinute)}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Mục',
      width: '70px',
      numeric: true,
      cell: (t) => t.checklist.length,
    },
    {
      key: 'active',
      header: 'Trạng thái',
      width: '120px',
      cell: (t) =>
        t.active ? <Badge tone="ok">Đang dùng</Badge> : <Badge tone="neutral">Đã tắt</Badge>,
    },
  ]

  const failed = tab === 'hom-nay' ? today : templates

  return (
    <>
      <PageHeader
        title="Việc định kỳ & SOP"
        subtitle="Checklist mở ca, đóng ca, vệ sinh ATTP giao cho chức danh. Chỉ người đứng ca đã công bố mới thấy việc của ca đó."
        action={
          tab === 'mau' ? (
            <>
              <Button disabled={!branch || standard.isPending} onClick={() => standard.mutate()}>
                Dùng bộ SOP chuẩn
              </Button>
              <Button variant="primary" disabled={!branch} onClick={() => setEditing('new')}>
                Thêm mẫu
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <SegmentedControl
            size="md"
            value={tab}
            onChange={(next) => setParams({ tab: next })}
            options={[
              { value: 'hom-nay', label: 'Hôm nay' },
              { value: 'mau', label: 'Mẫu việc' },
            ]}
          />
        </div>

        <div className="mt-5">
          <FilterBar>
            <Field label="Chi nhánh">
              <Select
                value={branch}
                width={220}
                placeholder="Chọn chi nhánh"
                options={branchUnits.map((u) => ({ value: u.branchId!, label: u.name }))}
                onChange={setBranch}
              />
            </Field>
            {tab === 'hom-nay' ? (
              <Field label="Ngày">
                <DateInput value={date} onChange={setDate} />
              </Field>
            ) : null}
          </FilterBar>
        </div>

        {failed.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(failed.error as Error).message}
              action={<Button onClick={() => void failed.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        {tab === 'hom-nay' ? (
          <div className="mt-5 grid gap-6">
            {today.isPending && branch ? <Skeleton className="h-40" /> : null}
            {today.data && today.data.length === 0 ? (
              <EmptyState
                title="Ngày này chưa có việc định kỳ nào."
                action={<Button onClick={() => setParams({ tab: 'mau' })}>Xem mẫu việc</Button>}
              />
            ) : null}
            {groups.map(([label, rows]) => (
              <section key={label}>
                <p className="mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  {label} · {rows.filter((r) => r.state === 'done').length}/{rows.length} xong
                </p>
                <div className="grid gap-2">
                  {rows.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setOpenTask(t.id)}
                      className={[
                        'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_200px_80px_150px] items-center gap-4 rounded-md border bg-surface-1 px-5 py-3 text-left text-[length:var(--fs-b2)]',
                        'transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent',
                        t.overdue ? 'border-danger-line' : 'border-line-1',
                      ].join(' ')}
                    >
                      <span className="truncate font-medium text-ink-hi">{t.title}</span>
                      <span className="truncate text-ink-body">
                        {t.submittedByName ?? t.assigneePositionTitle}
                      </span>
                      <DueText task={t} />
                      <ChecklistProgress checklist={t.checklist} />
                      <TaskStateBadge state={t.state} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <DataTable
              columns={templateColumns}
              rows={templates.data ?? []}
              rowKey={(t) => t.id}
              loading={templates.isPending && Boolean(branch)}
              empty="Chi nhánh chưa có mẫu việc định kỳ — bấm “Dùng bộ SOP chuẩn” để bắt đầu."
              onRowClick={(t) => setEditing(t)}
            />
          </div>
        )}
      </div>

      <TaskDrawer taskId={openTask} mode="manager" onClose={() => setOpenTask(null)} />
      {editing ? (
        <TemplateDrawer
          template={editing === 'new' ? null : editing}
          branchId={branch}
          chart={chart.data}
          shifts={shifts.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
