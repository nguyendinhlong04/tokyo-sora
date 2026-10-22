import {
  formatKpiValue,
  KPI_METRICS,
  KPI_SUBJECT_LABELS,
  type KpiMetricCode,
  type KpiTemplateView,
  type OrgPositionView,
} from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { Field, FilterBar, SegmentedControl, Select } from '../components/form'
import { KpiTemplateDrawer } from '../components/kpi/KpiTemplateDrawer'
import { metricGroup, SOURCE_LABELS } from '../components/kpi/kpi-ui'
import { branchOf, buildForest, flatten } from '../components/org/model'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

/**
 * N9 — Bộ KPI.
 *
 * Hai câu hỏi, hai tab. "Bộ KPI theo chức danh": mỗi ghế trên sơ đồ được chấm bằng
 * gì, trọng số bao nhiêu — ghế chưa có bộ thì người ngồi ghế đó được miễn đánh
 * giá khi mở kỳ. "Danh mục chỉ số": mỗi chỉ số đo cái gì, lấy số ở đâu, khi nào
 * thì "không có dữ liệu" — để người được chấm đọc được mình bị đo bằng gì.
 */

type Tab = 'bo-kpi' | 'danh-muc'

type SeatRow = { position: OrgPositionView; unitName: string; template: KpiTemplateView | null }

const SAMPLE_LABELS = {
  tickets: 'vé bếp',
  ratings: 'lượt khách chấm',
  events: 'sự kiện',
  tasks: 'việc',
} as const

export function KpiTemplates() {
  const { branchId: sessionBranch } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'bo-kpi'
  const [scope, setScope] = useState(sessionBranch ?? 'chuoi')
  const [editing, setEditing] = useState<SeatRow | null>(null)

  const chart = useQuery({ queryKey: ['org', 'chart'], queryFn: () => api.orgChart() })
  const templates = useQuery({ queryKey: ['kpi-templates'], queryFn: api.kpiTemplates })

  const forest = useMemo(() => buildForest(chart.data?.units ?? []), [chart.data])
  const branchUnits = (chart.data?.units ?? []).filter((u) => u.kind === 'chi-nhanh' && u.branchId)

  // Ghế theo thứ tự cây; "chuoi" là các ghế văn phòng không thuộc chi nhánh nào
  const seats = useMemo<SeatRow[]>(() => {
    const byUnit = new Map(flatten(forest).map(({ unit }, idx) => [unit.id, idx]))
    return (chart.data?.positions ?? [])
      .filter((p) => p.active)
      .filter((p) => (branchOf(p.unitId, forest) ?? 'chuoi') === scope)
      .sort((a, b) => (byUnit.get(a.unitId) ?? 0) - (byUnit.get(b.unitId) ?? 0) || a.sort - b.sort)
      .map((position) => ({
        position,
        unitName: forest.byId.get(position.unitId)?.name ?? '',
        template: templates.data?.find((t) => t.positionId === position.id) ?? null,
      }))
  }, [chart.data, forest, scope, templates.data])
  const missing = seats.filter((s) => !s.template).length

  const standard = useMutation({
    mutationFn: () => api.applyStandardKpi(scope),
    onSuccess: (r) => {
      toast(
        r.created > 0
          ? `Đã dựng ${r.created} bộ KPI theo mẫu`
          : 'Không còn ghế nào khớp bộ mẫu mà chưa có bộ KPI',
        r.created > 0 ? 'ok' : 'warn',
      )
      void queryClient.invalidateQueries({ queryKey: ['kpi-templates'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const seatColumns: Column<SeatRow>[] = [
    {
      key: 'seat',
      header: 'Chức danh',
      width: 'minmax(220px, 1fr)',
      cell: (s) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink-hi">{s.position.title}</span>
          <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">{s.unitName}</span>
        </span>
      ),
    },
    {
      key: 'holders',
      header: 'Người giữ',
      width: '100px',
      numeric: true,
      cell: (s) => s.position.holders.filter((h) => h.toDate === null).length,
    },
    {
      key: 'items',
      header: 'Bộ KPI',
      width: 'minmax(360px, 3fr)',
      cell: (s) =>
        s.template ? (
          <span className="line-clamp-2 text-ink-body">
            {s.template.items
              .map((i) => `${KPI_METRICS[i.metricCode].label} ${i.weightPct}%`)
              .join(' · ')}
          </span>
        ) : (
          <span className="text-warn">Chưa có — người ngồi ghế này được miễn đánh giá</span>
        ),
    },
    {
      key: 'version',
      header: 'Phiên bản',
      width: '100px',
      cell: (s) => (s.template ? <span className="font-mono">v{s.template.version}</span> : '—'),
    },
  ]

  const metricColumns: Column<KpiMetricCode>[] = [
    {
      key: 'label',
      header: 'Chỉ số',
      width: 'minmax(200px, 1fr)',
      cell: (code) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-ink-hi">{KPI_METRICS[code].label}</span>
          <span className="text-[length:var(--fs-c1)] text-ink-mute">
            {metricGroup(code)} · <span className="font-mono">{code}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'formula',
      header: 'Cách tính',
      width: 'minmax(280px, 2fr)',
      cell: (code) => <span className="text-ink-body">{KPI_METRICS[code].formula}</span>,
    },
    {
      key: 'source',
      header: 'Nguồn · đối tượng',
      width: '170px',
      cell: (code) => {
        const def = KPI_METRICS[code]
        return (
          <span className="flex flex-col">
            <span>{SOURCE_LABELS[def.source]}</span>
            <span className="text-[length:var(--fs-c1)] text-ink-mute">
              {KPI_SUBJECT_LABELS[def.subject]}
            </span>
          </span>
        )
      },
    },
    {
      key: 'target',
      header: 'Chỉ tiêu mặc định',
      width: '160px',
      cell: (code) => {
        const def = KPI_METRICS[code]
        return (
          <span className="flex flex-col">
            <span className="font-mono tabular-nums">
              {def.direction === 'thap' ? '≤ ' : '≥ '}
              {formatKpiValue(def.defaultTarget * 1000, def.unit)}
            </span>
            <span className="text-[length:var(--fs-c1)] text-ink-mute">
              {def.direction === 'cao' ? 'Cao là tốt' : 'Thấp là tốt'}
            </span>
          </span>
        )
      },
    },
    {
      key: 'trust',
      header: 'Khi nào không tính',
      width: '180px',
      cell: (code) => {
        const def = KPI_METRICS[code]
        return (
          <span className="flex flex-col items-start gap-1 text-[length:var(--fs-c1)] text-ink-mute">
            {'minSample' in def ? (
              <span>Dưới ngưỡng {SAMPLE_LABELS[def.minSample]} (A6)</span>
            ) : null}
            {def.source === 'nhap-tay' ? <span>Quản lý chưa chấm</span> : null}
            {def.source === 'phieu-kiem-tra' ? <span>Kỳ không có phiếu</span> : null}
            {'need' in def ? <Badge tone="neutral">Che số tiền</Badge> : null}
          </span>
        )
      },
    },
  ]

  const failed = chart.isError ? chart : templates

  return (
    <>
      <PageHeader
        title="Bộ KPI"
        subtitle="Mỗi chức danh 3–6 chỉ số, trọng số đúng 100%. Số tự động lấy từ dữ liệu thật theo đúng định nghĩa báo cáo; không đủ dữ liệu là “không tính”, không phải 0."
        action={
          tab === 'bo-kpi' ? (
            <Button disabled={standard.isPending} onClick={() => standard.mutate()}>
              Dùng bộ KPI mẫu
            </Button>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-5">
          <SegmentedControl
            size="md"
            value={tab}
            onChange={(next) => setParams({ tab: next })}
            options={[
              { value: 'bo-kpi', label: 'Bộ KPI theo chức danh' },
              { value: 'danh-muc', label: `Danh mục chỉ số · ${Object.keys(KPI_METRICS).length}` },
            ]}
          />
        </div>

        {failed.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(failed.error as Error).message}
              action={<Button onClick={() => void failed.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        {tab === 'bo-kpi' ? (
          <>
            <div className="mt-5">
              <FilterBar>
                <Field label="Phạm vi">
                  <Select
                    value={scope}
                    width={240}
                    options={[
                      { value: 'chuoi', label: 'Văn phòng chuỗi' },
                      ...branchUnits.map((u) => ({ value: u.branchId!, label: u.name })),
                    ]}
                    onChange={setScope}
                  />
                </Field>
                <p className="pb-2 text-[length:var(--fs-c1)] text-ink-mute">
                  {seats.length} ghế · {missing > 0 ? `${missing} ghế chưa có bộ KPI` : 'đủ bộ KPI'}
                </p>
              </FilterBar>
            </div>
            <div className="mt-5">
              <DataTable
                columns={seatColumns}
                rows={seats}
                rowKey={(s) => s.position.id}
                loading={chart.isPending || templates.isPending}
                resetKey={scope}
                pageSize={50}
                empty="Phạm vi này chưa có chức danh nào trên sơ đồ — dựng ở N2 trước."
                onRowClick={(s) => setEditing(s)}
              />
            </div>
          </>
        ) : (
          <div className="mt-5">
            <DataTable
              columns={metricColumns}
              rows={Object.keys(KPI_METRICS) as KpiMetricCode[]}
              rowKey={(code) => code}
              pageSize={50}
            />
            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Cố ý không có: doanh thu theo người phục vụ, upsell, giảm giá theo người, thời gian
              bếp theo đầu bếp, số sự cố, giờ làm thêm — đo những thứ đó là khuyến khích giành bàn,
              giấu sự cố, ép làm thêm. Số tiền (doanh thu, giá vốn) chỉ hiện với người có quyền xem;
              người khác và Kênh nhân viên chỉ thấy % đạt.
            </p>
          </div>
        )}
      </div>

      {editing ? (
        <KpiTemplateDrawer
          seat={{
            positionId: editing.position.id,
            title: editing.position.title,
            unitName: editing.unitName,
          }}
          template={editing.template}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
