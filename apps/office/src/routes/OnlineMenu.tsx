import { Toggle } from '../components/form'
import { formatVnd } from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type DishRow, type ParameterRow } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

const CAPACITY_KEYS = [
  { key: 'online.slotCapacity', label: 'Trần đơn mỗi khung 15 phút' },
  { key: 'online.leadMinutes', label: 'Bếp cần trước (phút)' },
  { key: 'online.openMinute', label: 'Bắt đầu nhận đơn (phút từ 00:00)' },
]

/**
 * O11 — Menu online.
 *
 * Ba cột quyết định thứ khách thấy ở /dat-mon: bán hay không, giá bao nhiêu, và
 * trần đơn mỗi khung. Cột "bán" và "giá" đều có hai tầng — cấp chuỗi và riêng
 * chi nhánh — nên bảng nói rõ con số đang có hiệu lực đến từ tầng nào.
 *
 * Bản thiết kế còn hai cột nữa: giới hạn/ngày và giờ bán của từng món. Giới hạn
 * theo ngày hiện là trạng thái sống do bếp gạt ở K5 (86 · còn N phần), không
 * phải cấu hình; còn lịch bán theo giờ thì danh mục chưa có cột nào để lưu.
 */
export function OnlineMenu() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('menu.edit-price')
  const [onlyOnline, setOnlyOnline] = useState(true)

  const dishes = useQuery({
    queryKey: ['dishes', branchId],
    queryFn: () => api.dishes(branchId!),
    enabled: Boolean(branchId),
  })

  const params = useQuery({
    queryKey: ['parameters', branchId],
    queryFn: () => api.parameters(branchId!),
    enabled: Boolean(branchId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['dishes'] })
    void queryClient.invalidateQueries({ queryKey: ['parameters'] })
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const setOverride = useMutation({
    mutationFn: (input: {
      dish: DishRow
      onlineVisible?: boolean | null
      onlinePrice?: number | null
    }) =>
      api.setDishOverride(input.dish.id, branchId!, {
        price: input.dish.override?.price ?? null,
        active: input.dish.override?.active ?? null,
        onlineVisible:
          input.onlineVisible !== undefined
            ? input.onlineVisible
            : (input.dish.override?.onlineVisible ?? null),
        onlinePrice:
          input.onlinePrice !== undefined
            ? input.onlinePrice
            : (input.dish.override?.onlinePrice ?? null),
      }),
    onSuccess: () => {
      toast('Đã lưu cho chi nhánh này', 'ok')
      refresh()
    },
    onError: fail,
  })

  const setParam = useMutation({
    mutationFn: (input: { key: string; value: number }) =>
      api.setParameter(input.key, input.value, branchId!),
    onSuccess: () => {
      toast('Đã lưu', 'ok')
      refresh()
    },
    onError: fail,
  })

  const rows = (dishes.data ?? []).filter((d) =>
    onlyOnline ? d.effectiveOnlineVisible : d.effectiveActive,
  )
  const byKey = new Map((params.data ?? []).map((p) => [p.key, p]))

  return (
    <>
      <PageHeader
        title="Menu online"
        subtitle={`${rows.length} món đang bán online ở chi nhánh này. Bật tắt và giá ở đây chỉ đổi kênh mang về · giao hàng — thực đơn tại quán giữ nguyên.`}
        action={
          <Button onClick={() => setOnlyOnline((v) => !v)}>
            {onlyOnline ? 'Xem cả món chưa bán online' : 'Chỉ xem món đang bán online'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <section className="rounded-md border border-line-1 bg-surface-1 p-5">
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Trần công suất
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {CAPACITY_KEYS.map((field) => (
              <NumberField
                key={field.key}
                row={byKey.get(field.key)}
                label={field.label}
                disabled={!mayEdit}
                onSave={(value) => setParam.mutate({ key: field.key, value })}
              />
            ))}
          </div>
          <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Trần đơn là thứ che bếp khỏi giờ cao điểm: khung đủ đơn thì tự xám đi ở màn khách. Giờ
            ngừng nhận nằm ở{' '}
            <Link to="/vung-giao" className="text-accent-ink">
              O10 · Vùng giao &amp; phí
            </Link>
            .
          </p>
        </section>

        <div className="mt-5">
          <DataTable
            rows={rows}
            rowKey={(dish) => dish.id}
            loading={dishes.isPending}
            empty="Không có món nào khớp bộ lọc."
            columns={[
              {
                key: 'dish',
                header: 'Món',
                width: 'minmax(220px, 1fr)',
                cell: (dish) => (
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {dish.nameVi}
                    </span>
                    <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {dish.code}
                    </span>
                  </span>
                ),
              },
              {
                key: 'visible',
                header: 'Bán online',
                width: '140px',
                align: 'center',
                cell: (dish) => (
                  <span className="flex justify-center">
                    <Toggle
                      disabled={!mayEdit || setOverride.isPending}
                      onChange={() =>
                        setOverride.mutate({ dish, onlineVisible: !dish.effectiveOnlineVisible })
                      }
                      on={dish.effectiveOnlineVisible}
                      tone="ok"
                    >
                      {dish.effectiveOnlineVisible ? 'Đang bán' : 'Đang tắt'}
                    </Toggle>
                  </span>
                ),
              },
              {
                key: 'price',
                header: 'Giá tại quán',
                width: '150px',
                numeric: true,
                cell: (dish) => (
                  <span className="text-[length:var(--fs-b2)] text-ink-mute">
                    {formatVnd(dish.effectivePrice)}
                  </span>
                ),
              },
              {
                key: 'onlinePrice',
                header: 'Giá online',
                width: '160px',
                align: 'right',
                cell: (dish) => (
                  <span className="flex justify-end">
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      disabled={!mayEdit}
                      defaultValue={dish.override?.onlinePrice ?? dish.onlinePrice ?? ''}
                      placeholder={String(dish.effectivePrice)}
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        const next = raw === '' ? null : Number(raw)
                        if (next !== (dish.override?.onlinePrice ?? dish.onlinePrice ?? null)) {
                          setOverride.mutate({ dish, onlinePrice: next })
                        }
                      }}
                      className="h-9 w-[130px] rounded-sm border border-line-1 bg-canvas px-2.5 text-right font-mono text-[length:var(--fs-b2)] text-ink-hi"
                    />
                  </span>
                ),
              },
              {
                key: 'source',
                header: 'Nguồn',
                width: '140px',
                align: 'right',
                cell: (dish) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {dish.override?.onlinePrice != null || dish.override?.onlineVisible != null
                      ? 'Riêng chi nhánh'
                      : 'Toàn chuỗi'}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[720px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Bỏ trống ô giá online là bán bằng giá tại quán. Tắt món ở đây khác với 86: 86 là bếp báo
          hết trong ca và tự hết hạn cuối ngày, còn tắt ở đây là chi nhánh không bán món đó qua kênh
          online cho tới khi bật lại.
        </p>
      </div>
    </>
  )
}

function NumberField({
  row,
  label,
  disabled,
  onSave,
}: {
  row: ParameterRow | undefined
  label: string
  disabled: boolean
  onSave: (value: number) => void
}) {
  const current = typeof row?.effectiveValue === 'number' ? row.effectiveValue : 0
  const [draft, setDraft] = useState(String(current))

  // Tham số về sau lần dựng đầu — không đồng bộ lại thì ô hiện 0 kèm nút Lưu
  useEffect(() => {
    if (row) setDraft(String(current))
  }, [row, current])

  if (!row) {
    return (
      <div>
        <p className="text-[length:var(--fs-b2)] text-ink-hi">{label}</p>
        <p className="mt-1 text-[length:var(--fs-c1)] text-warn">Chưa có tham số này.</p>
      </div>
    )
  }

  const dirty = draft !== String(current)

  return (
    <label className="block">
      <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
        />
        {dirty ? (
          <Button variant="primary" onClick={() => onSave(Number(draft))}>
            Lưu
          </Button>
        ) : null}
      </div>
      {row.scope === 'branch' ? (
        <span className="mt-1 block text-[length:var(--fs-c1)] text-accent">
          đang dùng số riêng của chi nhánh
        </span>
      ) : null}
    </label>
  )
}
