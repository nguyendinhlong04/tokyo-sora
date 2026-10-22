import { ROLE_LABELS, type OrgChart as OrgChartData } from '@sora/contracts'
import { Badge, Button, EmptyState, ErrorState, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api'
import { Field, FilterBar, SegmentedControl, Select } from '../components/form'
import { IconPrint, IconSearch } from '../components/icons'
import { PageHeader } from '../components/PageHeader'
import { PositionDrawer, UnitDrawer } from '../components/org/drawers'
import {
  ancestorsOf,
  buildForest,
  descendantIds,
  flatten,
  positionsByUnit,
  totals,
  type Forest,
} from '../components/org/model'
import { OrgTree, type TreeLayout } from '../components/org/OrgTree'

/**
 * N2 — Sơ đồ tổ chức.
 *
 * Cây đơn vị → chức danh → người giữ. "Cấp trên trực tiếp" của mọi người trong
 * hệ thống (ai giao việc cho ai, văn bản tới tay ai, ai chấm KPI ai) suy ra từ
 * chính cây này, nên màn hình phải trả lời nhanh hai câu: ai đang ngồi ghế nào,
 * và ghế nào đang trống.
 *
 * Máy chủ chỉ trả cây con trong phạm vi người xem: quản lý ca thấy chi nhánh của
 * mình, R10 · R11 · R13 thấy cả chuỗi và sửa được.
 */

const EXPANDED_KEY = 'sora.office.org-expanded'
const LAYOUT_KEY = 'sora.office.org-layout'

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Trình duyệt chặn bộ nhớ phiên — sơ đồ vẫn chạy, chỉ không nhớ nhánh đã mở
  }
}

type Zoom = '100' | '75' | '50'

export function OrgChart() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const chart = useQuery({ queryKey: ['org', 'chart'], queryFn: () => api.orgChart() })

  const [layout, setLayout] = useState<TreeLayout>(() => readSession<TreeLayout>(LAYOUT_KEY, 'doc'))
  const [zoom, setZoom] = useState<Zoom>('100')
  const [branch, setBranch] = useState('')
  const [expanded, setExpanded] = useState<Set<number> | null>(() => {
    const saved = readSession<number[] | null>(EXPANDED_KEY, null)
    return saved ? new Set(saved) : null
  })
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState<number | null>(null)

  const data = chart.data
  const fullForest = useMemo(() => buildForest(data?.units ?? []), [data])

  // Lọc chi nhánh = đặt lại gốc cây tại đơn vị của chi nhánh đó
  const forest: Forest = useMemo(() => {
    if (!branch) return fullForest
    const root = data?.units.find((u) => u.branchId === branch)
    if (!root) return fullForest
    const keep = descendantIds(root.id, fullForest)
    return buildForest((data?.units ?? []).filter((u) => keep.has(u.id)))
  }, [branch, data, fullForest])

  const visiblePositions = useMemo(() => {
    const ids = new Set(forest.byId.keys())
    return (data?.positions ?? []).filter((p) => ids.has(p.unitId))
  }, [data, forest])
  const byUnit = useMemo(() => positionsByUnit(visiblePositions), [visiblePositions])
  const sum = totals(visiblePositions)

  // Mặc định mở ba tầng đầu: công ty → khối → chi nhánh, đủ thấy toàn cảnh ở 1440
  const open =
    expanded ??
    new Set(
      flatten(fullForest)
        .filter(({ depth }) => depth < 3)
        .map(({ unit }) => unit.id),
    )

  const setOpen = (next: Set<number>) => {
    setExpanded(next)
    writeSession(EXPANDED_KEY, [...next])
  }

  const reveal = (unitId: number) => {
    const next = new Set(open)
    for (const a of ancestorsOf(unitId, fullForest)) next.add(a.id)
    setOpen(next)
    setHighlight(unitId)
  }

  // Tìm thấy → mở tổ tiên → đưa thẻ ra giữa khung, viền sáng 2,4 s rồi tắt
  useEffect(() => {
    if (highlight === null) return
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`org-unit-${highlight}`)
        ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }),
    )
    const timer = window.setTimeout(() => setHighlight(null), 2400)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [highlight])

  // Link sâu từ H1 và từ chỗ khác: ?chuc-danh=34 · ?don-vi=12
  const unitParam = Number(params.get('don-vi')) || null
  const positionParam = Number(params.get('chuc-danh')) || null
  const openUnit = unitParam ? (data?.units.find((u) => u.id === unitParam) ?? null) : null
  const openPosition = positionParam
    ? (data?.positions.find((p) => p.id === positionParam) ?? null)
    : null
  const closeDrawer = () => setParams({}, { replace: true })

  const apply = useMutation({
    mutationFn: (target: string) => api.applyOrgStandard(target),
    onSuccess: (result) => {
      toast(
        result.unitsCreated + result.positionsCreated === 0
          ? 'Đã đủ theo mẫu — không thêm gì'
          : `Đã dựng theo mẫu: ${result.unitsCreated} đơn vị, ${result.positionsCreated} chức danh`,
        'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['org'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const branchOptions = (data?.units ?? [])
    .filter((u) => u.kind === 'chi-nhanh')
    .map((u) => ({ value: u.branchId!, label: u.name }))

  return (
    <>
      <PageHeader
        title="Sơ đồ tổ chức"
        subtitle="Đơn vị, chức danh và người giữ. Cấp trên trực tiếp của một người là người ngồi ghế trưởng của đơn vị gần nhất phía trên — giao việc, văn bản và KPI đều đi theo cây này."
        action={
          <span className="flex items-center gap-2 print:hidden">
            {data?.canManage && data.chainWide ? (
              <Button disabled={apply.isPending} onClick={() => apply.mutate('chuoi')}>
                Dựng khung chuỗi theo mẫu
              </Button>
            ) : null}
            <Button onClick={() => window.print()}>
              <span className="flex items-center gap-1.5">
                <IconPrint /> In sơ đồ
              </span>
            </Button>
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 print:overflow-visible">
        {chart.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(chart.error as Error).message}
              action={<Button onClick={() => void chart.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        {chart.isPending ? <ChartSkeleton /> : null}

        {data ? (
          <>
            <div className="mt-5 print:hidden">
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
                <SegmentedControl
                  value={layout}
                  onChange={(next) => {
                    setLayout(next)
                    writeSession(LAYOUT_KEY, next)
                  }}
                  options={[
                    { value: 'doc', label: 'Dọc' },
                    { value: 'ngang', label: 'Ngang' },
                  ]}
                />
                <SegmentedControl
                  value={zoom}
                  onChange={setZoom}
                  options={[
                    { value: '100', label: '100%' },
                    { value: '75', label: '75%' },
                    { value: '50', label: '50%' },
                  ]}
                />
                <PeopleSearch
                  data={data}
                  forest={fullForest}
                  query={query}
                  onQuery={setQuery}
                  onPick={reveal}
                />
                <span className="ml-auto flex gap-2">
                  <Button size="sm" onClick={() => setOpen(new Set(fullForest.byId.keys()))}>
                    Mở hết
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setOpen(new Set(fullForest.roots.map((r) => r.id)))}
                  >
                    Thu hết
                  </Button>
                </span>
              </FilterBar>
            </div>

            <p className="mt-4 text-[length:var(--fs-c1)] text-ink-body">
              <span className="font-mono tabular-nums">
                Định biên {sum.headcount} · Thực có {sum.filled} · Trống {sum.vacant} · Vượt{' '}
                {sum.over}
              </span>
              <span className="ml-3 text-ink-mute">
                Thanh than hồng: càng nóng càng thiếu người — đỏ là ghế trưởng đang trống.
              </span>
            </p>

            {data.canManage && data.missingBranches.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-warn bg-surface-1 px-5 py-3 print:hidden">
                <span className="text-[length:var(--fs-b2)] text-ink-body">
                  Chi nhánh chưa có trên sơ đồ:
                </span>
                {data.missingBranches.map((b) => (
                  <Button
                    key={b.id}
                    size="sm"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate(b.id)}
                  >
                    Dựng {b.name} theo mẫu
                  </Button>
                ))}
              </div>
            ) : null}

            {data.units.length === 0 ? (
              <EmptyState
                title="Sơ đồ chưa có đơn vị nào trong phạm vi của bạn."
                action={
                  data.canManage ? (
                    <Button variant="primary" onClick={() => apply.mutate('chuoi')}>
                      Dựng khung chuỗi theo mẫu
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="page-org-chart mt-5 overflow-x-auto rounded-md border border-line-1 bg-canvas p-6 print:overflow-visible print:border-0 print:p-0">
                <div className="w-max min-w-full" style={{ zoom: Number(zoom) / 100 }}>
                  <OrgTree
                    forest={forest}
                    positions={byUnit}
                    layout={layout}
                    expanded={open}
                    highlight={highlight}
                    onToggle={(id) => {
                      const next = new Set(open)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      setOpen(next)
                    }}
                    onOpenUnit={(u) => setParams({ 'don-vi': String(u.id) })}
                    onOpenPosition={(p) => setParams({ 'chuc-danh': String(p.id) })}
                  />
                </div>
              </div>
            )}

            {data.unassigned.length > 0 ? <Unassigned data={data} /> : null}
          </>
        ) : null}
      </div>

      {data && openUnit ? (
        <UnitDrawer
          key={`u${openUnit.id}`}
          unit={openUnit}
          chart={data}
          forest={fullForest}
          onClose={closeDrawer}
          onOpenPosition={(p) => setParams({ 'chuc-danh': String(p.id) })}
        />
      ) : null}
      {data && openPosition ? (
        <PositionDrawer
          key={`p${openPosition.id}`}
          position={openPosition}
          chart={data}
          forest={fullForest}
          onClose={closeDrawer}
        />
      ) : null}
    </>
  )
}

/**
 * Tìm theo tên người, chức danh, đơn vị — lọc ngay trên dữ liệu đã tải. Chọn
 * một kết quả thì mở hết tổ tiên và đưa thẻ ra giữa khung.
 */
function PeopleSearch({
  data,
  forest,
  query,
  onQuery,
  onPick,
}: {
  data: OrgChartData
  forest: Forest
  query: string
  onQuery: (next: string) => void
  onPick: (unitId: number) => void
}) {
  const needle = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (needle.length < 2) return []
    const out: { key: string; label: string; detail: string; unitId: number }[] = []
    for (const p of data.positions) {
      const unit = forest.byId.get(p.unitId)
      if (!unit) continue
      for (const h of p.holders) {
        if (h.fullName.toLowerCase().includes(needle)) {
          out.push({
            key: `h${h.assignmentId}`,
            label: h.fullName,
            detail: `${p.title} · ${unit.name}`,
            unitId: unit.id,
          })
        }
      }
      if (p.title.toLowerCase().includes(needle)) {
        out.push({ key: `p${p.id}`, label: p.title, detail: unit.name, unitId: unit.id })
      }
    }
    for (const u of data.units) {
      if (u.name.toLowerCase().includes(needle)) {
        out.push({ key: `u${u.id}`, label: u.name, detail: 'Đơn vị', unitId: u.id })
      }
    }
    return out.slice(0, 8)
  }, [data, forest, needle])

  return (
    <div className="relative">
      <label className="flex h-9 w-[260px] items-center gap-2 rounded-sm border border-line-1 bg-canvas px-2.5 text-ink-mute focus-within:border-accent">
        <IconSearch />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Tìm người, chức danh, đơn vị"
          aria-label="Tìm người, chức danh, đơn vị"
          className="min-w-0 flex-1 bg-transparent text-[length:var(--fs-b2)] text-ink-hi outline-none placeholder:text-ink-mute"
        />
      </label>
      {results.length > 0 ? (
        <div className="absolute top-10 left-0 z-20 w-[320px] rounded-md border border-line-2 bg-surface-1 py-1">
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                onPick(r.unitId)
                onQuery('')
              }}
              className="block w-full px-3 py-2 text-left transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="block text-[length:var(--fs-b2)] text-ink-hi">{r.label}</span>
              <span className="block text-[length:var(--fs-c1)] text-ink-mute">{r.detail}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Người trong phạm vi chưa ngồi ghế nào — mở một chức danh để gán */
function Unassigned({ data }: { data: OrgChartData }) {
  return (
    <section className="mt-6 rounded-md border border-line-1 bg-surface-1 px-5 py-4 print:hidden">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Chưa xếp vào sơ đồ · {data.unassigned.length} người
      </p>
      <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
        {data.canManage
          ? 'Bấm một chức danh trên cây, mở tab Người giữ để gán. Người chưa có ghế vẫn có cấp trên: trưởng chi nhánh theo hồ sơ H1.'
          : 'Người chưa có ghế vẫn có cấp trên: trưởng chi nhánh theo hồ sơ H1.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.unassigned.map((p) => (
          <span
            key={p.staffId}
            className="inline-flex items-center gap-2 rounded-sm border border-line-1 px-2.5 py-1.5 text-[length:var(--fs-c1)] text-ink-body"
          >
            {p.fullName}
            <Badge>
              {p.roles
                .map((r) => ROLE_LABELS[r.role])
                .slice(0, 2)
                .join(' · ') || 'chưa có vai trò'}
            </Badge>
          </span>
        ))}
      </div>
    </section>
  )
}

function ChartSkeleton() {
  return (
    <div className="mt-5 grid gap-4">
      <Skeleton className="h-[68px]" />
      <div className="grid justify-items-center gap-6 rounded-md border border-line-1 p-6">
        <Skeleton className="h-[120px] w-[248px]" />
        <div className="flex gap-4">
          <Skeleton className="h-[160px] w-[248px]" />
          <Skeleton className="h-[160px] w-[248px]" />
          <Skeleton className="h-[160px] w-[248px]" />
        </div>
      </div>
    </div>
  )
}
