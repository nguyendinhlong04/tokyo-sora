import { Badge, EmptyState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api'
import { RecipeSheet } from './RecipeSheet'

/**
 * K7 Công thức.
 *
 * Vì sao có màn riêng chứ không chỉ bấm từ vé: phần SƠ CHẾ là việc làm TRƯỚC CA,
 * lúc chưa có vé nào trên màn. Nếu đường vào công thức duy nhất là qua vé thì
 * đúng lúc cần nó nhất — sáng ra, một mình, chưa nhớ lóc misuji thế nào — lại
 * không có cách nào mở.
 *
 * Chỉ hiện món CỦA TRẠM NÀY, cùng lý do với K5: bếp nướng không có việc gì với
 * quy trình pha đồ uống, và danh sách ngắn thì tìm nhanh hơn.
 */
export function Recipes() {
  const [open, setOpen] = useState<string | null>(null)

  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 10 * 60_000 })

  const config = useQuery({
    queryKey: ['config', me.data?.branchId],
    queryFn: () => api.config(me.data!.branchId),
    enabled: Boolean(me.data?.branchId),
    staleTime: 5 * 60_000,
  })

  const index = useQuery({
    queryKey: ['recipe-index'],
    queryFn: api.recipeIndex,
    staleTime: 10 * 60_000,
  })

  const written = useMemo(() => new Set(index.data ?? []), [index.data])

  const station = me.data?.stationId
  const dishes = (config.data?.dishes ?? [])
    .filter((d) => {
      if (d.kind === 'set' || !d.routing) return false
      if (!station) return true
      return (
        d.routing.stationGrill === station ||
        d.routing.stationNoGrill === station ||
        d.routing.secondaryStation === station
      )
    })
    // Món đã có quy trình lên trước: ô bấm được thì phải nằm trong tầm mắt trước
    .sort((a, b) => Number(written.has(b.id)) - Number(written.has(a.id)))

  if (me.isPending || config.isPending) {
    return <p className="p-4 text-ink-mute">Đang tải thực đơn…</p>
  }
  if (me.isError || config.isError) {
    return <EmptyState title="Không tải được thực đơn. Kiểm tra máy đã ghép với chi nhánh chưa." />
  }
  if (dishes.length === 0) {
    return <EmptyState title="Trạm này chưa có món nào được khai trong thực đơn." />
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3 overflow-y-auto xl:grid-cols-4">
        {dishes.map((dish) => {
          const has = written.has(dish.id)
          return (
            <button
              key={dish.id}
              type="button"
              onClick={() => setOpen(dish.id)}
              className={[
                'flex min-h-[120px] flex-col justify-between gap-3 rounded-md border-2 bg-surface-1 p-4 text-left',
                has ? 'border-line-2 active:bg-surface-3' : 'border-line-1',
              ].join(' ')}
            >
              <span
                className={[
                  'text-[length:var(--fs-ticket-dish)] leading-tight font-semibold uppercase',
                  has ? 'text-ink-hi' : 'text-ink-mute',
                ].join(' ')}
              >
                {dish.nameVi}
              </span>
              {has ? null : <Badge>Chưa soạn</Badge>}
            </button>
          )
        })}
      </div>

      <RecipeSheet dishId={open} onClose={() => setOpen(null)} />
    </>
  )
}
