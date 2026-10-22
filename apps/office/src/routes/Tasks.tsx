import type { TaskRow } from '@sora/contracts'
import { Badge, Button, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, type TaskView } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { DateInput, Field, FilterBar, SegmentedControl } from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { assigneeOf, ChecklistProgress, DueText, TaskStateBadge } from '../components/tasks/task-ui'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TaskFormDrawer } from '../components/tasks/TaskFormDrawer'

/**
 * N5 — Giao việc.
 *
 * Ba cửa: việc TÔI GIAO, việc của ĐƠN VỊ TÔI (người trong phạm vi theo sơ đồ —
 * kể cả việc người khác giao), và việc CHỜ TÔI NGHIỆM THU. Việc định kỳ (SOP) xem
 * ở N6; ở đây chỉ hiện ở tab nghiệm thu khi chúng chờ mình.
 */

type Tab = Extract<TaskView, 'assigned' | 'unit' | 'to-review'>

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

const shift = (date: string, days: number) => {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

export function Tasks() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'assigned'
  const [from, setFrom] = useState(() => shift(todayVN(), -7))
  const [to, setTo] = useState(() => shift(todayVN(), 30))
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const list = useQuery({
    queryKey: ['tasks', tab, from, to],
    queryFn: () => api.tasks({ view: tab, ...(tab === 'to-review' ? {} : { from, to }) }),
  })

  const columns: Column<TaskRow>[] = [
    {
      key: 'title',
      header: 'Việc',
      width: 'minmax(260px, 2fr)',
      cell: (t) => (
        <span className="flex min-w-0 items-center gap-2">
          {t.priority === 'gap' ? <Badge tone="danger">Gấp</Badge> : null}
          <span className="truncate font-medium text-ink-hi">{t.title}</span>
          {t.entity === 'feedback' ? <Badge tone="neutral">Khiếu nại</Badge> : null}
        </span>
      ),
    },
    {
      key: 'who',
      header: 'Người làm',
      width: 'minmax(160px, 1fr)',
      cell: (t) => <span className="truncate text-ink-body">{assigneeOf(t)}</span>,
    },
    { key: 'due', header: 'Hạn', width: '190px', cell: (t) => <DueText task={t} /> },
    {
      key: 'check',
      header: 'Checklist',
      width: '100px',
      numeric: true,
      cell: (t) => <ChecklistProgress checklist={t.checklist} />,
    },
    {
      key: 'accepted',
      header: 'Đã nhận',
      width: '100px',
      cell: (t) =>
        t.acceptedAt ? (
          <span className="text-ink-body">Đã nhận</span>
        ) : (
          <span className="text-ink-mute">—</span>
        ),
    },
    {
      key: 'state',
      header: 'Trạng thái',
      width: '150px',
      cell: (t) => <TaskStateBadge state={t.state} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Giao việc"
        subtitle="Giao cho người trong phạm vi bạn quản lý theo sơ đồ. Người nhận thấy việc trên Kênh nhân viên; quá hạn hiện đỏ kèm chữ."
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Giao việc
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-5">
          <SegmentedControl
            size="md"
            value={tab}
            onChange={(next) => setParams({ tab: next })}
            options={[
              { value: 'assigned', label: 'Tôi giao' },
              { value: 'unit', label: 'Đơn vị tôi' },
              { value: 'to-review', label: 'Chờ tôi nghiệm thu' },
            ]}
          />
        </div>

        {tab !== 'to-review' ? (
          <div className="mt-5">
            <FilterBar>
              <Field label="Hạn từ ngày">
                <DateInput value={from} onChange={setFrom} />
              </Field>
              <Field label="Đến ngày">
                <DateInput value={to} onChange={setTo} />
              </Field>
            </FilterBar>
          </div>
        ) : null}

        {list.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(list.error as Error).message}
              action={<Button onClick={() => void list.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        <div className="mt-5">
          <DataTable
            columns={columns}
            rows={list.data ?? []}
            rowKey={(t) => t.id}
            loading={list.isPending}
            resetKey={`${tab}|${from}|${to}`}
            empty={
              tab === 'assigned'
                ? 'Bạn chưa giao việc nào trong khoảng này.'
                : tab === 'unit'
                  ? 'Đơn vị của bạn chưa có việc nào trong khoảng này.'
                  : 'Không có việc nào chờ bạn nghiệm thu.'
            }
            onRowClick={(t) => setOpenId(t.id)}
          />
        </div>
      </div>

      <TaskDrawer taskId={openId} mode="manager" onClose={() => setOpenId(null)} />
      {creating ? <TaskFormDrawer open onClose={() => setCreating(false)} /> : null}
    </>
  )
}
