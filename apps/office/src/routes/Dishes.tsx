import { formatVnd } from '@sora/contracts'
import { Button } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api'
import { DishEditor, BLANK_DISH } from './DishEditor'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

type Filter = 'all' | 'online' | 'signature' | 'off' | 'set'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'online', label: 'Bán online' },
  { id: 'signature', label: 'Món ký' },
  { id: 'set', label: 'Set' },
  { id: 'off', label: 'Ngừng bán' },
]

/** Gõ không dấu vẫn ra: "bo ba chi" tìm được "Ba chỉ bò" */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('đ', 'd')
    .toLowerCase()
}

/**
 * M1 — Món và set.
 *
 * Cửa ghi duy nhất của trung tâm sản phẩm: sửa ở đây là web, Table, POS, KDS và
 * kênh online đổi theo trong vòng một phút (§18.1). Nên mỗi dòng nói rõ món đang
 * bán ở kênh nào, chứ không chỉ tên và giá.
 *
 * Bản thiết kế còn hai cột Giá vốn và Food cost — hai con số đó đến từ công thức
 * (BOM) ở M4, mà kho và công thức chưa dựng. Hiện cột rỗng thì tệ hơn không hiện.
 */
export function Dishes() {
  const { branchId, can } = useSession()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const mayEdit = can('menu.edit-price')

  const dishes = useQuery({
    queryKey: ['dishes', branchId],
    queryFn: () => api.dishes(branchId!),
    enabled: Boolean(branchId),
  })

  const pickers = useQuery({ queryKey: ['dish-pickers'], queryFn: api.dishPickers })
  const categoryName = useMemo(
    () => new Map((pickers.data?.categories ?? []).map((c) => [c.id, c.nameVi])),
    [pickers.data],
  )

  const rows = (dishes.data ?? []).filter((dish) => {
    const matchQuery =
      query.trim() === '' ||
      fold(dish.nameVi).includes(fold(query)) ||
      fold(dish.code).includes(fold(query)) ||
      fold(dish.id).includes(fold(query))
    const matchFilter =
      filter === 'all'
        ? true
        : filter === 'online'
          ? dish.onlineVisible
          : filter === 'signature'
            ? dish.signature
            : filter === 'set'
              ? dish.kind === 'set'
              : !dish.effectiveActive
    return matchQuery && matchFilter
  })

  return (
    <>
      <PageHeader
        title="Món và set"
        subtitle={`${dishes.data?.length ?? 0} món trong danh mục · ${dishes.data?.filter((d) => d.onlineVisible).length ?? 0} món bán online. Sửa ở đây là thực đơn web, màn bàn và POS đổi theo.`}
        action={
          mayEdit ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              Thêm món
            </Button>
          ) : null
        }
      />

      <div className="flex flex-none items-center gap-3 px-8 pb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm mã hoặc tên món — gõ không dấu cũng ra"
          className="h-10 w-[300px] rounded-sm border border-line-1 bg-surface-1 px-3 text-[length:var(--fs-b2)] text-ink-hi"
        />
        <div className="flex gap-2">
          {FILTERS.map((option) => (
            <Button
              key={option.id}
              variant={filter === option.id ? 'primary' : 'secondary'}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-[length:var(--fs-c1)] text-ink-mute">
          {rows.length} món khớp
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-8 pb-8">
        <DataTable
          rows={rows}
          rowKey={(dish) => dish.id}
          loading={dishes.isPending}
          empty="Không có món nào khớp bộ lọc."
          onRowClick={(dish) => setEditing(dish.id)}
          columns={[
            {
              key: 'kana',
              header: '',
              width: '56px',
              cell: (dish) => (
                <span className="grid size-10 place-items-center rounded-md border border-line-1 bg-canvas font-jp text-[length:var(--fs-t2)] text-accent">
                  {dish.kana ?? dish.nameJa?.charAt(0) ?? dish.nameVi.charAt(0)}
                </span>
              ),
            },
            {
              key: 'code',
              header: 'Mã',
              width: '120px',
              cell: (dish) => (
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {dish.code}
                </span>
              ),
            },
            {
              key: 'name',
              header: 'Tên món',
              width: 'minmax(220px, 1fr)',
              cell: (dish) => (
                <span className={dish.effectiveActive ? '' : 'opacity-60'}>
                  <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                    {dish.nameVi}
                    {dish.signature ? (
                      <span className="ml-2 rounded-sm border border-accent px-1.5 py-0.5 text-[length:var(--fs-c2)] text-accent">
                        Món ký
                      </span>
                    ) : null}
                  </span>
                  {dish.nameJa ? (
                    <span className="mt-0.5 block font-jp text-[length:var(--fs-c1)] text-ink-mute">
                      {dish.nameJa}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'category',
              header: 'Nhóm',
              width: '140px',
              cell: (dish) => (
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  {dish.categoryId ? (categoryName.get(dish.categoryId) ?? dish.categoryId) : '—'}
                </span>
              ),
            },
            {
              key: 'station',
              header: 'Trạm',
              width: '130px',
              cell: (dish) => (
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {dish.kind === 'set'
                    ? 'set'
                    : `${dish.stationGrill ?? '—'}${
                        dish.stationNoGrill && dish.stationNoGrill !== dish.stationGrill
                          ? ` · ${dish.stationNoGrill}`
                          : ''
                      }`}
                </span>
              ),
            },
            {
              key: 'price',
              header: 'Giá bán',
              width: '130px',
              align: 'right',
              cell: (dish) => (
                <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                  {formatVnd(dish.effectivePrice)}
                  {dish.override?.price != null ? (
                    <span className="mt-0.5 block text-[length:var(--fs-c2)] text-accent">
                      giá riêng
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'state',
              header: 'Trạng thái',
              width: '170px',
              cell: (dish) => (
                <span className="flex flex-wrap gap-1.5">
                  <Chip
                    on={dish.effectiveActive}
                    label={dish.effectiveActive ? 'Đang bán' : 'Ngừng'}
                  />
                  {dish.onlineVisible ? <Chip on label="Online" /> : null}
                  {dish.tableOrderable ? <Chip on label="Tại bàn" /> : null}
                </span>
              ),
            },
          ]}
        />
      </div>

      {editing ? (
        <DishEditor
          dishId={editing === 'new' ? null : editing}
          blank={BLANK_DISH}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-sm px-2 text-[length:var(--fs-c2)] ${
        on ? 'bg-ok/12 text-ok' : 'bg-surface-3 text-ink-mute'
      }`}
    >
      {label}
    </span>
  )
}
