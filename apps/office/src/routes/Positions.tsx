import type { OrgPositionView } from '@sora/contracts'
import { Badge, Button, EmberBar, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { Field, FilterBar, SearchField, Select, Toggle } from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { PositionDrawer } from '../components/org/drawers'
import {
  ancestorsOf,
  branchOf,
  buildForest,
  staffing,
  staffingHeat,
  staffingLabel,
  totals,
} from '../components/org/model'
import { MetricTile } from '../components/slices'

/**
 * N3 — Chức danh & định biên.
 *
 * Cùng dữ liệu với sơ đồ N2 nhưng dạng bảng: câu hỏi của nhân sự khi lập kế
 * hoạch tuyển là "ghế nào còn trống, ở đâu, bao nhiêu" — đọc trên bảng lọc được
 * nhanh hơn dò từng thẻ trên cây.
 */
export function Positions() {
  const chart = useQuery({ queryKey: ['org', 'chart'], queryFn: () => api.orgChart() })
  const [params, setParams] = useSearchParams()
  const [branch, setBranch] = useState('')
  const [vacantOnly, setVacantOnly] = useState(false)
  const [query, setQuery] = useState('')

  const data = chart.data
  const forest = useMemo(() => buildForest(data?.units ?? []), [data])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (data?.positions ?? []).filter((p) => {
      if (branch && branchOf(p.unitId, forest) !== branch) return false
      if (vacantOnly && (staffingHeat(p) ?? 0) === 0) return false
      if (!needle) return true
      const unit = forest.byId.get(p.unitId)
      return (
        p.title.toLowerCase().includes(needle) ||
        (unit?.name.toLowerCase().includes(needle) ?? false) ||
        p.holders.some((h) => h.fullName.toLowerCase().includes(needle))
      )
    })
  }, [data, forest, branch, vacantOnly, query])

  const sum = totals(rows)
  const openPosition = data?.positions.find((p) => p.id === Number(params.get('chuc-danh'))) ?? null

  const pathOf = (p: OrgPositionView) =>
    [...ancestorsOf(p.unitId, forest).reverse().slice(1), forest.byId.get(p.unitId)]
      .filter(Boolean)
      .map((u) => u!.name)
      .join(' › ')

  const columns: Column<OrgPositionView>[] = [
    {
      key: 'title',
      header: 'Chức danh',
      width: 'minmax(200px, 1.2fr)',
      cell: (p) => (
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-ink-hi">{p.title}</span>
          {p.isHead ? <Badge tone="accent">Trưởng</Badge> : null}
        </span>
      ),
    },
    {
      key: 'unit',
      header: 'Đơn vị',
      width: 'minmax(220px, 1.4fr)',
      cell: (p) => <span className="truncate text-ink-body">{pathOf(p)}</span>,
    },
    {
      key: 'headcount',
      header: 'Định biên',
      width: '96px',
      numeric: true,
      cell: (p) => p.headcount,
    },
    {
      key: 'filled',
      header: 'Thực có',
      width: '110px',
      numeric: true,
      cell: (p) => {
        const s = staffing(p)
        return (
          <span>
            {s.filled}
            {s.concurrent > 0 ? <span className="text-ink-mute"> +{s.concurrent} kiêm</span> : null}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Tình trạng',
      width: '170px',
      cell: (p) => {
        const heat = staffingHeat(p)
        const label = staffingLabel(p)
        return (
          <span className="grid gap-1">
            <span className="text-[length:var(--fs-c1)] text-ink-body">{label}</span>
            {heat !== null ? (
              <EmberBar
                fill={p.headcount > 0 ? staffing(p).filled / p.headcount : 0}
                heat={heat}
                label={`${p.title}: ${label}`}
              />
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'holders',
      header: 'Người giữ',
      width: 'minmax(200px, 1.4fr)',
      cell: (p) => (
        <span className="truncate text-ink-body">
          {p.holders.length > 0
            ? p.holders
                .map((h) => (h.upcoming ? `${h.fullName} (sắp nhận)` : h.fullName))
                .join(', ')
            : '—'}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Vai trò gợi ý',
      width: '140px',
      cell: (p) => {
        const mismatch = p.holders.filter((h) => h.roleMismatch).length
        return (
          <span className="flex items-center gap-2">
            <span className="font-mono text-ink-body">{p.suggestedRole ?? '—'}</span>
            {mismatch > 0 ? <Badge tone="warn">{mismatch} chưa có quyền</Badge> : null}
          </span>
        )
      },
    },
  ]

  const branchOptions = (data?.units ?? [])
    .filter((u) => u.kind === 'chi-nhanh')
    .map((u) => ({ value: u.branchId!, label: u.name }))

  return (
    <>
      <PageHeader
        title="Chức danh & định biên"
        subtitle="Mỗi ghế, định biên bao nhiêu người, đang có ai. Thực có chỉ đếm chức danh chính — kiêm nhiệm hiện riêng, vì một người không lấp được hai chỗ trống cùng lúc."
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {chart.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(chart.error as Error).message}
              action={<Button onClick={() => void chart.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-4 gap-4">
          <MetricTile label="Định biên" value={String(sum.headcount)} />
          <MetricTile label="Thực có" value={String(sum.filled)} />
          <MetricTile
            label="Còn trống"
            value={String(sum.vacant)}
            hint="Ghế cần tuyển hoặc điều chuyển"
          />
          <MetricTile label="Vượt định biên" value={String(sum.over)} />
        </div>

        <div className="mt-5">
          <FilterBar>
            {branchOptions.length > 1 ? (
              <Field label="Chi nhánh">
                <Select
                  value={branch}
                  width={200}
                  placeholder="Cả chuỗi"
                  options={branchOptions}
                  onChange={setBranch}
                />
              </Field>
            ) : null}
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Tìm chức danh, đơn vị, người"
            />
            <Toggle on={vacantOnly} onChange={setVacantOnly}>
              Chỉ ghế còn trống
            </Toggle>
          </FilterBar>
        </div>

        <div className="mt-5">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            loading={chart.isPending}
            resetKey={`${branch}|${vacantOnly}|${query}`}
            empty={
              vacantOnly || query || branch
                ? 'Không có chức danh khớp bộ lọc.'
                : 'Chưa có chức danh nào — dựng sơ đồ ở N2 trước.'
            }
            onRowClick={(p) => setParams({ 'chuc-danh': String(p.id) })}
          />
        </div>
      </div>

      {data && openPosition ? (
        <PositionDrawer
          key={openPosition.id}
          position={openPosition}
          chart={data}
          forest={forest}
          onClose={() => setParams({}, { replace: true })}
        />
      ) : null}
    </>
  )
}
