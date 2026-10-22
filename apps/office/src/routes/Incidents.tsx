import {
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATE_LABELS,
  type IncidentRow,
} from '@sora/contracts'
import { Badge, Button, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { Field, FilterBar, Select } from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { IncidentDrawer } from '../components/reports/IncidentDrawer'
import { IncidentFormDrawer } from '../components/reports/IncidentFormDrawer'
import { formatDateTime } from '../components/tasks/task-ui'

/**
 * N8 — Sự cố. Không xếp hạng ai "nhiều sự cố" — chấm báo đúng hạn và khắc phục
 * đúng hạn, kẻo người ta giấu sự cố (D10). Sự cố phải khai báo ra ngoài mà chưa có
 * mốc khai báo hiện chữ đỏ ngay trên danh sách.
 */
export function Incidents() {
  const [state, setState] = useState('mo')
  const [severity, setSeverity] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [reporting, setReporting] = useState(false)
  const list = useQuery({
    queryKey: ['incidents', state, severity],
    queryFn: () => api.incidents({ state, severity }),
  })

  const columns: Column<IncidentRow>[] = [
    {
      key: 'code',
      header: 'Mã',
      width: '140px',
      cell: (i) => <span className="font-mono">{i.code}</span>,
    },
    {
      key: 'title',
      header: 'Sự cố',
      width: 'minmax(240px, 2fr)',
      cell: (i) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink-hi">{i.title}</span>
          <span className="text-[length:var(--fs-c1)] text-ink-mute">
            {INCIDENT_CATEGORY_LABELS[i.category]}
          </span>
        </span>
      ),
    },
    {
      key: 'severity',
      header: 'Mức',
      width: '150px',
      cell: (i) => (
        <Badge tone={i.severity === 'nhe' || i.severity === 'trung-binh' ? 'neutral' : 'danger'}>
          {INCIDENT_SEVERITY_LABELS[i.severity]}
        </Badge>
      ),
    },
    {
      key: 'external',
      header: 'Khai báo ngoài',
      width: '150px',
      cell: (i) =>
        !i.externalReportRequired ? (
          <span className="text-ink-mute">Không cần</span>
        ) : i.externalReportedAt ? (
          <span className="text-ink-body">Đã khai báo</span>
        ) : (
          <span className="font-semibold text-danger-line">Chưa khai báo</span>
        ),
    },
    {
      key: 'tasks',
      header: 'Việc mở',
      width: '90px',
      numeric: true,
      cell: (i) => (i.openTasks > 0 ? i.openTasks : '—'),
    },
    {
      key: 'reported',
      header: 'Báo lúc',
      width: '150px',
      cell: (i) => formatDateTime(i.reportedAt),
    },
    {
      key: 'state',
      header: 'Trạng thái',
      width: '130px',
      cell: (i) => (
        <Badge tone={i.state === 'closed' ? 'ok' : 'warn'}>{INCIDENT_STATE_LABELS[i.state]}</Badge>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Sự cố"
        subtitle="Tai nạn lao động, an toàn thực phẩm, khiếu nại nghiêm trọng, hỏng thiết bị, an ninh, cháy nổ. Đóng khi có nguyên nhân gốc, biện pháp và việc khắc phục đã xong."
        action={
          <Button variant="primary" onClick={() => setReporting(true)}>
            Báo sự cố
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-5">
          <FilterBar>
            <Field label="Trạng thái">
              <Select
                value={state}
                width={180}
                options={[
                  { value: 'mo', label: 'Đang mở' },
                  { value: 'closed', label: 'Đã đóng' },
                ]}
                placeholder="Tất cả"
                onChange={setState}
              />
            </Field>
            <Field label="Mức">
              <Select
                value={severity}
                width={180}
                placeholder="Mọi mức"
                options={INCIDENT_SEVERITIES.map((s) => ({
                  value: s,
                  label: INCIDENT_SEVERITY_LABELS[s],
                }))}
                onChange={setSeverity}
              />
            </Field>
          </FilterBar>
        </div>
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
            rowKey={(i) => i.id}
            loading={list.isPending}
            resetKey={`${state}|${severity}`}
            empty="Không có sự cố nào khớp bộ lọc."
            onRowClick={(i) => setOpenId(i.id)}
          />
        </div>
      </div>
      <IncidentDrawer incidentId={openId} onClose={() => setOpenId(null)} />
      {reporting ? <IncidentFormDrawer onClose={() => setReporting(false)} /> : null}
    </>
  )
}
