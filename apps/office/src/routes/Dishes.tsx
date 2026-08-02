import { formatVnd } from '@sora/contracts'
import { Button } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api'
import { DishEditor, BLANK_DISH } from './DishEditor'
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
        <div className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="sticky top-0 z-5 grid grid-cols-[56px_120px_1fr_140px_130px_120px_150px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span />
            <span>Mã</span>
            <span>Tên món</span>
            <span>Nhóm</span>
            <span>Trạm</span>
            <span className="text-right">Giá bán</span>
            <span>Trạng thái</span>
          </div>

          {dishes.isPending ? (
            <p className="px-5 py-4 text-ink-mute">Đang tải danh mục…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
              Không có món nào khớp bộ lọc.
            </p>
          ) : (
            rows.map((dish) => (
              <button
                key={dish.id}
                type="button"
                onClick={() => setEditing(dish.id)}
                className={`grid w-full grid-cols-[56px_120px_1fr_140px_130px_120px_150px] items-center gap-3 border-b border-line-1 px-5 py-2.5 text-left hover:bg-surface-3 ${
                  dish.effectiveActive ? '' : 'opacity-60'
                }`}
              >
                <span className="grid size-10 place-items-center rounded-md border border-line-1 bg-canvas font-jp text-[length:var(--fs-t2)] text-accent">
                  {dish.kana ?? dish.nameJa?.charAt(0) ?? dish.nameVi.charAt(0)}
                </span>
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {dish.code}
                </span>
                <span className="min-w-0">
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
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  {dish.categoryId ? (categoryName.get(dish.categoryId) ?? dish.categoryId) : '—'}
                </span>
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {dish.kind === 'set'
                    ? 'set'
                    : `${dish.stationGrill ?? '—'}${
                        dish.stationNoGrill && dish.stationNoGrill !== dish.stationGrill
                          ? ` · ${dish.stationNoGrill}`
                          : ''
                      }`}
                </span>
                <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                  {formatVnd(dish.effectivePrice)}
                  {dish.override?.price != null ? (
                    <span className="mt-0.5 block text-[length:var(--fs-c2)] text-accent">
                      giá riêng
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Chip on={dish.effectiveActive} label={dish.effectiveActive ? 'Đang bán' : 'Ngừng'} />
                  {dish.onlineVisible ? <Chip on label="Online" /> : null}
                  {dish.tableOrderable ? <Chip on label="Tại bàn" /> : null}
                </span>
              </button>
            ))
          )}
        </div>
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
