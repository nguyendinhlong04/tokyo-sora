import {
  formatKpiScore,
  KPI_OBSERVATION_KINDS,
  KPI_OBSERVATION_LABELS,
  type KpiObservationKind,
  type KpiObservationView,
} from '@sora/contracts'
import { safeHref } from '@sora/core'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { ReasonPrompt } from '../components/approval'
import { DataTable, type Column } from '../components/DataTable'
import { Drawer } from '../components/Drawer'
import {
  DateInput,
  Field,
  FilterBar,
  NumberInput,
  SegmentedControl,
  Select,
  TextArea,
  TextInput,
} from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { formatDay } from '../components/report'
import { formatDateTime } from '../components/tasks/task-ui'
import { useSession } from '../session-context'

/**
 * N11 — Phiếu kiểm tra: điểm kiểm tra vệ sinh ATTP và khách bí mật của chi nhánh.
 *
 * Là nguồn của hai chỉ số `nt.ve-sinh` và `nt.khach-bi-mat`. Mỗi phiếu bắt buộc có
 * đường dẫn bằng chứng (ảnh, biên bản) — điểm không bằng chứng là điểm cảm tính.
 * Sai thì huỷ kèm lý do, không xoá; phiếu do chính người được chấm ghi không tính
 * cho người đó.
 */

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

export function Observations() {
  const { branchId: sessionBranch } = useSession()
  const [branch, setBranch] = useState(sessionBranch ?? '')
  const [creating, setCreating] = useState(false)
  const [openRow, setOpenRow] = useState<KpiObservationView | null>(null)

  const chart = useQuery({ queryKey: ['org', 'chart'], queryFn: () => api.orgChart() })
  const branchUnits = (chart.data?.units ?? []).filter((u) => u.kind === 'chi-nhanh' && u.branchId)
  const branchName = (id: string) => branchUnits.find((u) => u.branchId === id)?.name ?? id
  const list = useQuery({
    queryKey: ['kpi-observations', branch],
    queryFn: () => api.kpiObservations(branch || undefined),
  })

  const columns: Column<KpiObservationView>[] = [
    {
      key: 'date',
      header: 'Ngày kiểm',
      width: '120px',
      cell: (o) => <span className="font-mono tabular-nums">{formatDay(o.observedOn)}</span>,
    },
    {
      key: 'kind',
      header: 'Loại',
      width: 'minmax(200px, 1fr)',
      cell: (o) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-ink-hi">{KPI_OBSERVATION_LABELS[o.kind]}</span>
          <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
            {branchName(o.branchId)}
          </span>
        </span>
      ),
    },
    {
      key: 'score',
      header: 'Điểm',
      width: '90px',
      numeric: true,
      cell: (o) => (
        <span className={o.voidedAt ? 'text-ink-mute line-through' : 'text-ink-hi'}>
          {formatKpiScore(o.scoreMilli)}
        </span>
      ),
    },
    { key: 'observer', header: 'Người kiểm', width: '170px', cell: (o) => o.observerName },
    {
      key: 'note',
      header: 'Ghi chú',
      width: 'minmax(220px, 2fr)',
      cell: (o) => <span className="line-clamp-2 text-ink-body">{o.note ?? '—'}</span>,
    },
    {
      key: 'state',
      header: 'Trạng thái',
      width: '130px',
      cell: (o) =>
        o.voidedAt ? <Badge tone="neutral">Đã huỷ</Badge> : <Badge tone="ok">Có hiệu lực</Badge>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Phiếu kiểm tra"
        subtitle="Điểm kiểm tra vệ sinh ATTP và khách bí mật, thang 0–100, kèm đường dẫn bằng chứng. Là nguồn của hai chỉ số KPI cùng tên."
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Ghi phiếu
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-5">
          <FilterBar>
            <Field label="Chi nhánh">
              <Select
                value={branch}
                width={240}
                placeholder="Mọi chi nhánh"
                options={branchUnits.map((u) => ({ value: u.branchId!, label: u.name }))}
                onChange={setBranch}
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
            rowKey={(o) => o.id}
            loading={list.isPending}
            resetKey={branch}
            empty="Chưa có phiếu kiểm tra nào."
            onRowClick={setOpenRow}
          />
        </div>
      </div>

      {creating ? (
        <ObservationForm
          branches={branchUnits.map((u) => ({ value: u.branchId!, label: u.name }))}
          initialBranch={branch}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {openRow ? <ObservationDetail row={openRow} onClose={() => setOpenRow(null)} /> : null}
    </>
  )
}

function ObservationForm({
  branches,
  initialBranch,
  onClose,
}: {
  branches: { value: string; label: string }[]
  initialBranch: string
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [branchId, setBranchId] = useState(initialBranch)
  const [kind, setKind] = useState<KpiObservationKind>('ve-sinh')
  const [observedOn, setObservedOn] = useState(todayVN)
  const [score, setScore] = useState<number | null>(null)
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [note, setNote] = useState('')

  const problems = [
    !branchId ? 'Chọn chi nhánh.' : '',
    !observedOn || observedOn > todayVN() ? 'Ngày kiểm không thể ở tương lai.' : '',
    score === null || score < 0 || score > 100 ? 'Điểm từ 0 đến 100.' : '',
    !safeHref(evidenceUrl) ? 'Bằng chứng là đường dẫn bắt đầu bằng https://' : '',
  ].filter(Boolean)

  const save = useMutation({
    mutationFn: () =>
      api.createKpiObservation({
        branchId,
        kind,
        observedOn,
        score: score!,
        evidenceUrl: evidenceUrl.trim(),
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast('Đã ghi phiếu kiểm tra', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['kpi-observations'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <Drawer
      open
      onClose={onClose}
      width={420}
      title="Ghi phiếu kiểm tra"
      subtitle="Phiếu bạn ghi không tính vào KPI của chính bạn."
      footer={
        <>
          <Button onClick={onClose}>Bỏ</Button>
          <Button
            variant="primary"
            disabled={problems.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            Ghi phiếu
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Loại">
          <SegmentedControl
            value={kind}
            onChange={setKind}
            options={KPI_OBSERVATION_KINDS.map((k) => ({
              value: k,
              label: KPI_OBSERVATION_LABELS[k],
            }))}
          />
        </Field>
        <Field label="Chi nhánh">
          <Select
            value={branchId}
            placeholder="Chọn chi nhánh"
            options={branches}
            onChange={setBranchId}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ngày kiểm">
            <DateInput value={observedOn} onChange={setObservedOn} />
          </Field>
          <Field label="Điểm (0–100)">
            <NumberInput value={score} onChange={setScore} min={0} max={100} />
          </Field>
        </div>
        <Field label="Bằng chứng" hint="Ảnh, biên bản kiểm tra trên Drive… — đường dẫn https://">
          <TextInput value={evidenceUrl} onChange={setEvidenceUrl} placeholder="https://…" />
        </Field>
        <Field label="Ghi chú">
          <TextArea
            value={note}
            onChange={setNote}
            rows={3}
            placeholder="Điểm trừ chính, việc cần khắc phục"
          />
        </Field>
        {problems.length > 0 && (score !== null || evidenceUrl) ? (
          <ul className="grid gap-1 text-[length:var(--fs-c1)] text-danger-line">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Drawer>
  )
}

function ObservationDetail({ row, onClose }: { row: KpiObservationView; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [voiding, setVoiding] = useState(false)
  const href = safeHref(row.evidenceUrl)
  const cancel = useMutation({
    mutationFn: (reason: string) => api.voidKpiObservation(row.id, reason),
    onSuccess: () => {
      toast('Đã huỷ phiếu', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['kpi-observations'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  return (
    <Drawer
      open
      onClose={onClose}
      width={420}
      title={KPI_OBSERVATION_LABELS[row.kind]}
      subtitle={`${formatDay(row.observedOn)} · ${row.observerName}`}
    >
      <div className="grid gap-4 text-[length:var(--fs-b2)]">
        <p className="text-[length:var(--fs-t1)] text-ink-hi">
          <span className="font-mono tabular-nums">{formatKpiScore(row.scoreMilli)}</span>
          <span className="text-[length:var(--fs-b2)] text-ink-mute"> / 100 điểm</span>
        </p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-accent-ink hover:underline"
          >
            {row.evidenceUrl}
          </a>
        ) : null}
        {row.note ? (
          <p className="leading-relaxed whitespace-pre-wrap text-ink-body">{row.note}</p>
        ) : null}
        {row.voidedAt ? (
          <p className="rounded-sm border border-line-1 bg-canvas px-4 py-3 text-ink-hi">
            Đã huỷ {formatDateTime(row.voidedAt)}: {row.voidReason}
          </p>
        ) : voiding ? (
          <ReasonPrompt
            label="Huỷ phiếu"
            placeholder="Ghi nhầm chi nhánh, nhầm ngày…"
            busy={cancel.isPending}
            onCancel={() => setVoiding(false)}
            onConfirm={(reason) => cancel.mutate(reason)}
          />
        ) : (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setVoiding(true)}>
              Huỷ phiếu…
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  )
}
