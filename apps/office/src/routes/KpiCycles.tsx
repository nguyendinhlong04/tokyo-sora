import {
  formatVnd,
  KPI_CYCLE_STATE_LABELS,
  type KpiCycleView,
  type KpiReviewRow,
} from '@sora/contracts'
import { safeHref } from '@sora/core'
import { Badge, Button, ErrorState, GradeChip, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { Drawer } from '../components/Drawer'
import { Field, FilterBar, SegmentedControl, Select, TextInput, Toggle } from '../components/form'
import { cycleLabel, Score } from '../components/kpi/kpi-ui'
import { KpiSheetDrawer } from '../components/kpi/KpiSheetDrawer'
import { PageHeader } from '../components/PageHeader'
import { formatDay } from '../components/report'
import { formatDateTime } from '../components/tasks/task-ui'
import { useSession } from '../session-context'

/**
 * N10 — Kỳ đánh giá KPI.
 *
 * Một kỳ đi đúng một chiều: nháp (đặt chỉ tiêu) → công bố (chụp luật chấm và mức
 * thưởng từ A6 — Điều 104, quy chế thưởng phải công bố trước) → tính số → sau
 * ngày cuối kỳ vào bước đánh giá → chốt. Mỗi bước một nút, nút chỉ hiện cho người
 * có khoá của bước đó. Cột thưởng gợi ý chỉ có khi máy chủ trả — quản lý ca không
 * bao giờ thấy.
 */

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

const STATE_TONE = { draft: 'neutral', open: 'info', review: 'warn', closed: 'ok' } as const

export function KpiCycles() {
  const { branchId: sessionBranch, staff, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const selected = Number(params.get('ky')) || null
  const [branch, setBranch] = useState(sessionBranch ?? '')
  const [creating, setCreating] = useState(false)
  const [publishing, setPublishing] = useState<KpiCycleView | null>(null)
  const [closing, setClosing] = useState<KpiCycleView | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [reviewId, setReviewId] = useState<number | null>(null)

  const chart = useQuery({ queryKey: ['org', 'chart'], queryFn: () => api.orgChart() })
  const branchUnits = (chart.data?.units ?? []).filter((u) => u.kind === 'chi-nhanh' && u.branchId)
  const branchName = (id: string) => branchUnits.find((u) => u.branchId === id)?.name ?? id

  const cycles = useQuery({
    queryKey: ['kpi-cycles', branch],
    queryFn: () => api.kpiCycles(branch || undefined),
  })
  const current = cycles.data?.find((c) => c.id === selected) ?? null
  const policyHref = current?.policyUrl ? safeHref(current.policyUrl) : null
  const reviews = useQuery({
    queryKey: ['kpi-reviews', selected],
    queryFn: () => api.kpiReviews(selected!),
    enabled: selected !== null,
  })

  const refresh = () => {
    for (const key of ['kpi-cycles', 'kpi-reviews', 'kpi-review', 'org-inbox']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const compute = useMutation({
    mutationFn: (id: number) => api.computeKpiCycle(id),
    onSuccess: (r) => {
      toast(`Đã tính lại số cho ${r.reviews} phiếu`, 'ok')
      refresh()
    },
    onError: fail,
  })
  const step = useMutation({
    mutationFn: ({ id, to }: { id: number; to: 'start-review' | 'close' }) =>
      api.kpiCycleStep(id, to),
    onSuccess: (_, { to }) => {
      toast(
        to === 'close'
          ? 'Đã chốt kỳ — thưởng gợi ý đã sang H7'
          : 'Kỳ đã vào bước đánh giá — số được tính lại lần cuối',
        'ok',
      )
      setClosing(null)
      refresh()
    },
    onError: fail,
  })

  const rows = useMemo(() => {
    const list = (reviews.data ?? []).filter((r) => !mineOnly || r.reviewerId === staff?.staffId)
    const rank = (r: KpiReviewRow) => (r.exempt ? 2 : r.finalizedAt ? 1 : 0)
    return [...list].sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName, 'vi'))
  }, [reviews.data, mineOnly, staff?.staffId])
  const withBonus = (reviews.data ?? []).some((r) => 'suggestedBonusVnd' in r)

  const cycleColumns: Column<KpiCycleView>[] = [
    {
      key: 'period',
      header: 'Kỳ',
      width: 'minmax(200px, 1fr)',
      cell: (c) => (
        <span className="flex flex-col">
          <span className="font-medium text-ink-hi">{cycleLabel(c)}</span>
          <span className="text-[length:var(--fs-c1)] text-ink-mute">
            {formatDay(c.periodStart)} – {formatDay(c.periodEnd)}
            {branch ? '' : ` · ${branchName(c.branchId)}`}
          </span>
        </span>
      ),
    },
    {
      key: 'state',
      header: 'Trạng thái',
      width: '170px',
      cell: (c) => <Badge tone={STATE_TONE[c.state]}>{KPI_CYCLE_STATE_LABELS[c.state]}</Badge>,
    },
    {
      key: 'progress',
      header: 'Đã kết thúc',
      width: '120px',
      numeric: true,
      cell: (c) => `${c.finalized}/${c.reviews}`,
    },
    {
      key: 'computed',
      header: 'Tính số lần cuối',
      width: '160px',
      cell: (c) =>
        c.lastComputedAt ? (
          formatDateTime(c.lastComputedAt)
        ) : (
          <span className="text-ink-mute">Chưa tính</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: 'minmax(280px, 1fr)',
      cell: (c) => {
        const ended = c.periodEnd < todayVN()
        return (
          // Cả dòng bắt onClick để xem phiếu — nút ở đây phải chặn lại
          <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {c.state === 'draft' && can('kpi.cycle-manage') ? (
              <Button size="sm" variant="primary" onClick={() => setPublishing(c)}>
                Công bố…
              </Button>
            ) : null}
            {(c.state === 'open' || c.state === 'review') && can('kpi.review-team') ? (
              <Button size="sm" disabled={compute.isPending} onClick={() => compute.mutate(c.id)}>
                Tính lại
              </Button>
            ) : null}
            {c.state === 'open' && can('kpi.cycle-manage') ? (
              <Button
                size="sm"
                variant="primary"
                disabled={!ended || step.isPending}
                title={ended ? undefined : 'Đánh giá sau ngày cuối kỳ'}
                onClick={() => step.mutate({ id: c.id, to: 'start-review' })}
              >
                Bắt đầu đánh giá
              </Button>
            ) : null}
            {c.state === 'review' && can('kpi.close') ? (
              <Button size="sm" variant="primary" onClick={() => setClosing(c)}>
                Chốt kỳ…
              </Button>
            ) : null}
          </span>
        )
      },
    },
  ]

  const reviewColumns: Column<KpiReviewRow>[] = [
    {
      key: 'name',
      header: 'Nhân viên',
      width: 'minmax(200px, 1fr)',
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink-hi">{r.fullName}</span>
          <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
            {r.positionTitle ?? 'Chưa có chức danh'}
          </span>
        </span>
      ),
    },
    {
      key: 'reviewer',
      header: 'Người đánh giá',
      width: '170px',
      cell: (r) => r.reviewerName ?? <span className="text-danger-line">Chưa có</span>,
    },
    {
      key: 'self',
      header: 'Tự đánh giá',
      width: '120px',
      cell: (r) =>
        r.selfSubmittedAt ? (
          <span className="text-ink-body">Đã gửi</span>
        ) : (
          <span className="text-ink-mute">Chưa</span>
        ),
    },
    {
      key: 'score',
      header: 'Điểm',
      width: '90px',
      numeric: true,
      cell: (r) => <Score milli={r.scoreMilli} />,
    },
    {
      key: 'grade',
      header: 'Hạng',
      width: '140px',
      cell: (r) =>
        r.exempt ? <span className="text-ink-mute">Miễn</span> : <GradeChip grade={r.grade} />,
    },
    ...(withBonus
      ? [
          {
            key: 'bonus',
            header: 'Thưởng gợi ý',
            width: '140px',
            numeric: true,
            cell: (r: KpiReviewRow) =>
              r.exempt || r.suggestedBonusVnd == null ? '—' : formatVnd(r.suggestedBonusVnd),
          },
        ]
      : []),
    {
      key: 'state',
      header: 'Phiếu',
      width: '140px',
      cell: (r) =>
        r.exempt ? (
          <Badge tone="neutral">Miễn đánh giá</Badge>
        ) : r.finalizedAt ? (
          <Badge tone="ok">Đã kết thúc</Badge>
        ) : (
          <Badge tone="warn">Đang chấm</Badge>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Kỳ đánh giá KPI"
        subtitle="Mở kỳ → đặt chỉ tiêu → công bố → tính số → đánh giá sau ngày cuối kỳ → chốt. Luật chấm và mức thưởng đóng băng lúc công bố. KPI chỉ quyết định thưởng — không phạt, không khấu trừ."
        action={
          can('kpi.cycle-manage') ? (
            <Button onClick={() => setCreating(true)}>Mở kỳ mới</Button>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {creating ? (
          <CreateCycleForm
            branches={branchUnits.map((u) => ({ value: u.branchId!, label: u.name }))}
            initialBranch={branch}
            onClose={() => setCreating(false)}
            onDone={(id) => {
              setParams({ ky: String(id) })
              refresh()
            }}
          />
        ) : null}

        <div className="mt-5">
          <FilterBar>
            <Field label="Chi nhánh">
              <Select
                value={branch}
                width={240}
                placeholder="Mọi chi nhánh trong phạm vi"
                options={branchUnits.map((u) => ({ value: u.branchId!, label: u.name }))}
                onChange={setBranch}
              />
            </Field>
          </FilterBar>
        </div>

        {cycles.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(cycles.error as Error).message}
              action={<Button onClick={() => void cycles.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        <div className="mt-5">
          <DataTable
            columns={cycleColumns}
            rows={cycles.data ?? []}
            rowKey={(c) => c.id}
            loading={cycles.isPending}
            resetKey={branch}
            empty="Chưa có kỳ KPI nào. Dựng bộ KPI ở N9, rồi mở kỳ đầu tiên."
            onRowClick={(c) => setParams({ ky: String(c.id) })}
          />
        </div>

        {closing ? (
          <section className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-accent bg-surface-1 px-5 py-4">
            <p className="min-w-0 flex-1 text-[length:var(--fs-b2)] text-ink-hi">
              Chốt {cycleLabel(closing)}: mọi phiếu đóng băng, thưởng gợi ý chuyển sang H7. Người có
              phiếu trong kỳ này không tự chốt được.
            </p>
            <Button size="sm" onClick={() => setClosing(null)}>
              Thôi
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={step.isPending}
              onClick={() => step.mutate({ id: closing.id, to: 'close' })}
            >
              Chốt kỳ
            </Button>
          </section>
        ) : null}

        {current ? (
          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                  Phiếu · {cycleLabel(current)} · {branchName(current.branchId)}
                </h2>
                <p className="mt-1 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  {current.rules
                    ? `Luật đã chụp lúc công bố: A ≥ ${current.rules.gradeA} · B ≥ ${current.rules.gradeB} · C ≥ ${current.rules.gradeC} · độ phủ tối thiểu ${current.rules.minCoveragePct}% · thưởng A ${formatVnd(current.rules.bonusVnd.A)}, B ${formatVnd(current.rules.bonusVnd.B)}, C ${formatVnd(current.rules.bonusVnd.C)}, D ${formatVnd(current.rules.bonusVnd.D)}.`
                    : 'Kỳ còn nháp — luật chấm và mức thưởng chụp từ A6 lúc công bố.'}
                  {policyHref ? (
                    <>
                      {' '}
                      <a
                        href={policyHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-ink hover:underline"
                      >
                        Quy chế thưởng
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <Toggle on={mineOnly} onChange={setMineOnly}>
                Chỉ phiếu tôi chấm
              </Toggle>
            </div>
            {reviews.isError ? (
              <div className="mt-4">
                <ErrorState message={(reviews.error as Error).message} />
              </div>
            ) : null}
            <div className="mt-4">
              <DataTable
                columns={reviewColumns}
                rows={rows}
                rowKey={(r) => r.id}
                loading={reviews.isPending}
                resetKey={`${selected}|${mineOnly}`}
                pageSize={50}
                empty={
                  mineOnly
                    ? 'Kỳ này không có phiếu nào bạn là người đánh giá.'
                    : 'Kỳ này không có phiếu — chi nhánh chưa có nhân viên đang làm.'
                }
                onRowClick={(r) => setReviewId(r.id)}
              />
            </div>
          </section>
        ) : null}
      </div>

      <KpiSheetDrawer reviewId={reviewId} onClose={() => setReviewId(null)} />
      {publishing ? (
        <PublishDrawer
          cycle={publishing}
          onClose={() => setPublishing(null)}
          onDone={() => {
            setPublishing(null)
            refresh()
          }}
        />
      ) : null}
    </>
  )
}

function CreateCycleForm({
  branches,
  initialBranch,
  onClose,
  onDone,
}: {
  branches: { value: string; label: string }[]
  initialBranch: string
  onClose: () => void
  onDone: (id: number) => void
}) {
  const toast = useToast()
  const [branchId, setBranchId] = useState(initialBranch)
  const [kind, setKind] = useState<'thang' | 'quy'>('thang')
  const [month, setMonth] = useState(todayVN().slice(0, 7))
  const create = useMutation({
    mutationFn: () => api.createKpiCycle({ branchId, kind, periodStart: `${month}-01` }),
    onSuccess: (r) => {
      toast('Đã mở kỳ nháp — đặt chỉ tiêu rồi công bố', 'ok')
      onDone(r.id)
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  return (
    <section className="mt-5 rounded-md border border-accent bg-surface-1 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Chi nhánh">
          <Select
            value={branchId}
            width={220}
            placeholder="Chọn chi nhánh"
            options={branches}
            onChange={setBranchId}
          />
        </Field>
        <Field label="Loại kỳ">
          <SegmentedControl
            value={kind}
            onChange={setKind}
            options={[
              { value: 'thang', label: 'Tháng' },
              { value: 'quy', label: 'Quý (3 tháng)' },
            ]}
          />
        </Field>
        <Field label="Từ tháng">
          <TextInput type="month" value={month} onChange={setMonth} width={170} />
        </Field>
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>Bỏ</Button>
          <Button
            variant="primary"
            disabled={!branchId || !month || create.isPending}
            onClick={() => create.mutate()}
          >
            Mở kỳ
          </Button>
        </div>
      </div>
      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Kỳ nháp dựng phiếu cho mọi nhân viên đang làm của chi nhánh (hồ sơ H1), chụp chức danh, bộ
        KPI và người đánh giá — cấp trên trực tiếp theo sơ đồ lúc này. Ghế chưa có bộ KPI thì người
        ngồi ghế đó được miễn đánh giá.
      </p>
    </section>
  )
}

/** Công bố = chụp luật chấm và mức thưởng từ A6, kèm đường dẫn quy chế nếu có */
function PublishDrawer({
  cycle,
  onClose,
  onDone,
}: {
  cycle: KpiCycleView
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [policyUrl, setPolicyUrl] = useState('')
  const valid = policyUrl.trim() === '' || /^https:\/\/\S+$/.test(policyUrl.trim())
  const open = useMutation({
    mutationFn: () => api.openKpiCycle(cycle.id, policyUrl.trim() || null),
    onSuccess: () => {
      toast(`Đã công bố ${cycleLabel(cycle)}`, 'ok')
      onDone()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  return (
    <Drawer
      open
      onClose={onClose}
      width={420}
      title={`Công bố ${cycleLabel(cycle)}`}
      footer={
        <>
          <Button onClick={onClose}>Bỏ</Button>
          <Button
            variant="primary"
            disabled={!valid || open.isPending}
            onClick={() => open.mutate()}
          >
            Công bố kỳ
          </Button>
        </>
      }
    >
      <div className="grid gap-4 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
        <p>
          Ngưỡng hạng, độ phủ tối thiểu, mức thưởng theo hạng lấy từ A6 (nhóm “KPI & thưởng”) ngay
          lúc bấm và <span className="text-ink-hi">đóng băng cho kỳ này</span> — đổi A6 sau đó không
          đổi điểm hay thưởng của kỳ đang chạy.
        </p>
        <p>
          Quy chế thưởng phải được công bố trước kỳ (Bộ luật Lao động, Điều 104). Dán đường dẫn văn
          bản quy chế (N4 hoặc kho tài liệu) để nhân viên đọc được trên Kênh nhân viên.
        </p>
        <Field label="Đường dẫn quy chế thưởng (tuỳ chọn)">
          <TextInput value={policyUrl} onChange={setPolicyUrl} placeholder="https://…" />
        </Field>
        {!valid ? (
          <p className="text-[length:var(--fs-c1)] text-danger-line">
            Đường dẫn phải bắt đầu bằng https://
          </p>
        ) : null}
      </div>
    </Drawer>
  )
}
