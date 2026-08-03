import { formatVnd } from '@sora/contracts'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, type IngredientRow, type PrepRecipeView } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { formatPercent } from '../components/report'
import { useSession } from '../session-context'

/**
 * M8 — Bán thành phẩm: công thức sốt, nước dùng, kim chi, và **sản lượng đầu ra**.
 *
 * Cả màn xoay quanh một phép chia: tiền nguyên liệu một mẻ ÷ sản lượng mẻ = giá
 * mỗi ml. Thiếu mẫu số thì công thức món chèn sốt vào sẽ tính sốt bằng 0₫ và mọi
 * món có sốt đều báo lãi cao hơn thực tế — im lặng, cho tới lúc kiểm kê.
 *
 * Hai cột giá đứng cạnh nhau và cố ý không gộp: **giá chuẩn** là thứ công thức
 * nói, **giá đang dùng** là thứ những mẻ nấu thật để lại theo bình quân gia
 * quyền. Chênh nhau nhiều nghĩa là bếp đang nấu khác công thức, hoặc giá nguyên
 * liệu đã đi xa khỏi lần khai gần nhất.
 */

interface DraftLine {
  ingredientId: string
  qtyBase: number
  wasteBp: number
}

/** Ngưỡng nhắc: lệch quá 10% giữa giá chuẩn và giá thật thì đáng đi hỏi bếp */
const DRIFT_ALERT = 0.1

// ---------------------------------------------------------------- danh sách

export function PrepList() {
  const navigate = useNavigate()
  const preps = useQuery({ queryKey: ['preps'], queryFn: api.preps })
  const rows = preps.data ?? []
  const noRecipe = rows.filter((r) => r.lineCount === 0).length

  return (
    <>
      <PageHeader
        title="Bán thành phẩm"
        subtitle={`${rows.length - noRecipe}/${rows.length} bán thành phẩm đã khai công thức mẻ. Sản lượng mẻ là mẫu số của giá vốn mỗi đơn vị — thiếu nó thì công thức món chèn vào sẽ tính bằng 0₫.`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          loading={preps.isPending}
          onRowClick={(row) => navigate(`/ban-thanh-pham/${row.id}`)}
          empty={
            <>
              Chưa có bán thành phẩm nào. Bật cờ{' '}
              <span className="text-ink-body">bán thành phẩm</span> cho một nguyên liệu ở{' '}
              <Link to="/nguyen-lieu" className="text-accent-ink">
                M7 · Nguyên liệu
              </Link>{' '}
              rồi quay lại đây khai công thức mẻ.
            </>
          }
          columns={[
            {
              key: 'code',
              header: 'Mã',
              width: '110px',
              cell: (row) => (
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {row.code}
                </span>
              ),
            },
            {
              key: 'name',
              header: 'Bán thành phẩm',
              width: 'minmax(200px, 1fr)',
              // Vẫn là <Link> thật để ctrl+click mở tab mới — bấm cả dòng chỉ là lối tắt
              cell: (row) => (
                <Link to={`/ban-thanh-pham/${row.id}`} className="block min-w-0">
                  <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                    {row.name}
                  </span>
                  <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                    {row.lineCount === 0 ? 'chưa khai công thức' : `${row.lineCount} nguyên liệu`}
                  </span>
                </Link>
              ),
            },
            {
              key: 'yield',
              header: 'Sản lượng mẻ',
              width: '140px',
              numeric: true,
              cell: (row) =>
                row.yieldBase === 0 ? (
                  <span className="text-warn">chưa khai</span>
                ) : (
                  <span className="text-[length:var(--fs-b2)] text-ink-body">
                    {row.yieldBase.toLocaleString('vi-VN')} {row.baseUnit}
                  </span>
                ),
            },
            {
              key: 'batchCost',
              header: 'Tiền một mẻ',
              width: '140px',
              numeric: true,
              cell: (row) => (
                <span className="text-[length:var(--fs-b2)] text-ink-body">
                  {row.lineCount === 0 ? '—' : formatVnd(row.batchCostVnd)}
                </span>
              ),
            },
            {
              key: 'standard',
              header: 'Giá chuẩn',
              width: '140px',
              align: 'right',
              cell: (row) => <PerUnit milli={row.standardMilli} unit={row.baseUnit} />,
            },
            {
              key: 'actual',
              header: 'Giá đang dùng',
              width: '150px',
              align: 'right',
              cell: (row) => {
                const drift =
                  row.standardMilli !== null && row.costPerBaseMilli > 0
                    ? (row.costPerBaseMilli - row.standardMilli) / row.standardMilli
                    : null
                return (
                  <>
                    <PerUnit milli={row.costPerBaseMilli || null} unit={row.baseUnit} />
                    {drift !== null && Math.abs(drift) >= DRIFT_ALERT ? (
                      <span
                        className={`block text-[length:var(--fs-c2)] ${drift > 0 ? 'text-warn' : 'text-ok'}`}
                      >
                        {formatPercent(drift)} so công thức
                      </span>
                    ) : null}
                  </>
                )
              },
            },
            {
              key: 'used',
              header: 'Món dùng',
              width: '110px',
              numeric: true,
              cell: (row) => <span className="text-ink-mute">{row.usedByDishes}</span>,
            },
          ]}
        />

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          <span className="text-ink-body">Giá chuẩn</span> là thứ công thức nói;{' '}
          <span className="text-ink-body">giá đang dùng</span> là thứ những mẻ nấu thật ở{' '}
          <Link to="/san-xuat" className="text-accent-ink">
            S7 · Sản xuất nội bộ
          </Link>{' '}
          để lại theo bình quân gia quyền, và đó mới là con số đi vào giá vốn hàng bán. Công thức
          không đè lên giá thật — trừ đúng một lần: bán thành phẩm chưa từng có giá nào thì lần lưu
          công thức đầu tiên mồi giá cho nó, để món chèn vào không tính bằng 0₫.
        </p>
      </div>
    </>
  )
}

function PerUnit({ milli, unit }: { milli: number | null; unit: string }) {
  if (milli === null) return <span className="text-[length:var(--fs-c1)] text-line-4">—</span>
  return (
    <>
      <span className="block font-mono text-[length:var(--fs-b2)] text-ink-hi">
        {formatVnd(Math.round(milli / 1_000))}
      </span>
      <span className="block text-[length:var(--fs-c2)] text-ink-mute">mỗi {unit}</span>
    </>
  )
}

// ------------------------------------------------------------ bảng công thức

export function PrepEditor() {
  const { prepId = '' } = useParams()
  const { branchId, can } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('recipe.edit')

  const recipe = useQuery({
    queryKey: ['prep-recipe', prepId],
    queryFn: () => api.prepRecipe(prepId),
    enabled: Boolean(prepId),
    refetchOnWindowFocus: false,
  })
  const ingredients = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })

  const [draft, setDraft] = useState<DraftLine[] | null>(null)
  const [yieldBase, setYieldBase] = useState(0)

  useEffect(() => {
    if (recipe.data) {
      setDraft(recipe.data.lines.map((l) => ({ ...l })))
      setYieldBase(recipe.data.prep.yieldBase)
    }
  }, [recipe.data])

  const save = useMutation({
    mutationFn: (input: { yieldBase: number; lines: DraftLine[] }) =>
      api.setPrepRecipe(prepId, input),
    onSuccess: (result) => {
      toast(
        result.seededMilli !== null
          ? `Đã lưu · mồi giá ${formatVnd(Math.round(result.seededMilli / 1_000))} mỗi ${recipe.data!.prep.baseUnit} cho lần đầu`
          : result.standardMilli === null
            ? 'Đã lưu công thức mẻ'
            : `Đã lưu · giá chuẩn ${formatVnd(Math.round(result.standardMilli / 1_000))} mỗi ${recipe.data!.prep.baseUnit}`,
        'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['prep-recipe', prepId] })
      void queryClient.invalidateQueries({ queryKey: ['preps'] })
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const byId = useMemo(
    () => new Map((ingredients.data ?? []).map((i) => [i.id, i])),
    [ingredients.data],
  )

  if (recipe.isError) {
    return (
      <div className="p-8">
        <ErrorState message={(recipe.error as Error).message} />
      </div>
    )
  }
  if (!recipe.data || !draft) return <p className="p-8 text-ink-mute">Đang tải…</p>

  const saved = recipe.data
  const preview = previewOf(draft, byId, yieldBase)
  const dirty = !sameDraft(draft, saved.lines) || yieldBase !== saved.prep.yieldBase

  return (
    <>
      <PageHeader
        title={saved.prep.name}
        subtitle={`Công thức cho MỘT MẺ. Sản lượng mẻ tính bằng ${saved.prep.baseUnit} — đây là mẫu số của giá vốn mỗi ${saved.prep.baseUnit}.`}
        action={
          <>
            <Button onClick={() => navigate('/ban-thanh-pham')}>Về danh sách</Button>
            <Button onClick={() => navigate(`/lich-su-cong-thuc?kind=prep&id=${saved.prep.id}`)}>
              Lịch sử
            </Button>
            {mayEdit ? (
              <Button
                variant="primary"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate({ yieldBase, lines: draft })}
              >
                Lưu công thức mẻ
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <section className="flex flex-wrap items-end gap-6 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
          <label className="block">
            <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Một mẻ ra bao nhiêu {saved.prep.baseUnit}
            </span>
            <input
              type="number"
              min={0}
              value={yieldBase}
              disabled={!mayEdit}
              onChange={(e) => setYieldBase(Math.max(0, Number(e.target.value) || 0))}
              className="mt-2 h-10 w-[180px] rounded-sm border border-line-1 bg-canvas px-2.5 text-right font-mono text-[length:var(--fs-b1)] text-ink-hi"
            />
          </label>

          <div>
            <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Tiền một mẻ
            </span>
            <span className="mt-2 block font-mono text-[length:var(--fs-b1)] text-ink-hi">
              {formatVnd(preview.batchCostVnd)}
            </span>
          </div>

          <div>
            <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Giá chuẩn mỗi {saved.prep.baseUnit}
            </span>
            <span className="mt-2 block font-mono text-[length:var(--fs-b1)] text-accent-ink">
              {preview.standardMilli === null
                ? 'chưa đủ dữ kiện'
                : `${formatVnd(Math.round(preview.standardMilli / 1_000))}`}
            </span>
          </div>

          <div>
            <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Giá đang dùng
            </span>
            <span className="mt-2 block font-mono text-[length:var(--fs-b1)] text-ink-body">
              {saved.prep.costPerBaseMilli === 0
                ? 'chưa có giá'
                : formatVnd(Math.round(saved.prep.costPerBaseMilli / 1_000))}
            </span>
          </div>
        </section>

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[1fr_150px_130px_150px_110px_60px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Nguyên liệu</span>
            <span className="text-right">Định lượng mẻ</span>
            <span className="text-right">Hao hụt %</span>
            <span className="text-right">Giá vốn dòng</span>
            <span className="text-right">Đóng góp</span>
            <span />
          </div>

          {draft.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
              Chưa có nguyên liệu nào trong mẻ.
            </p>
          ) : (
            draft.map((line, index) => {
              const ing = byId.get(line.ingredientId)
              const cost = preview.lines[index]!
              return (
                <div
                  key={line.ingredientId}
                  className="grid grid-cols-[1fr_150px_130px_150px_110px_60px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {ing?.name ?? line.ingredientId}
                    </span>
                    <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {ing ? `${formatVnd(ing.costPerPurchaseVnd)} / ${ing.purchaseUnit}` : '—'}
                    </span>
                  </span>

                  <span className="flex items-center justify-end gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={line.qtyBase}
                      disabled={!mayEdit}
                      onChange={(e) =>
                        setDraft(
                          draft.map((l, i) =>
                            i === index ? { ...l, qtyBase: Number(e.target.value) || 0 } : l,
                          ),
                        )
                      }
                      className="h-9 w-[86px] rounded-sm border border-line-1 bg-canvas px-2 text-right font-mono text-[length:var(--fs-b2)] text-ink-hi"
                    />
                    <span className="w-8 text-[length:var(--fs-c1)] text-ink-mute">
                      {ing?.baseUnit ?? ''}
                    </span>
                  </span>

                  <span className="flex justify-end">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={line.wasteBp / 100}
                      disabled={!mayEdit}
                      onChange={(e) =>
                        setDraft(
                          draft.map((l, i) =>
                            i === index
                              ? { ...l, wasteBp: Math.round((Number(e.target.value) || 0) * 100) }
                              : l,
                          ),
                        )
                      }
                      className="h-9 w-[80px] rounded-sm border border-line-1 bg-canvas px-2 text-right font-mono text-[length:var(--fs-b2)] text-ink-hi"
                    />
                  </span>

                  <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-body">
                    {formatVnd(cost.costVnd)}
                  </span>

                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {preview.batchCostVnd === 0
                      ? '—'
                      : formatPercent(cost.costVnd / preview.batchCostVnd).replace('+', '')}
                  </span>

                  <span className="flex justify-end">
                    {mayEdit ? (
                      <Button
                        onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                        size="sm"
                        variant="danger"
                      >
                        Bỏ
                      </Button>
                    ) : null}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {mayEdit ? (
          <AddLine
            ingredients={ingredients.data ?? []}
            excluded={[saved.prep.id, ...draft.map((l) => l.ingredientId)]}
            onAdd={(ingredientId) =>
              setDraft([...draft, { ingredientId, qtyBase: 1_000, wasteBp: 0 }])
            }
          />
        ) : null}

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Chèn được cả bán thành phẩm khác vào đây (sốt nền trong sốt hoàn chỉnh) — giá của nó đã
          gói sẵn trong đơn giá, không cộng lại từng nguyên liệu. Công thức lồng vòng bị chặn khi
          lưu. Nấu một mẻ thật thì ghi ở{' '}
          <Link to="/san-xuat" className="text-accent-ink">
            S7 · Sản xuất nội bộ
          </Link>
          , và chính lượt đó mới đổi giá vốn thật.
        </p>
      </div>
    </>
  )
}

function AddLine({
  ingredients,
  excluded,
  onAdd,
}: {
  ingredients: IngredientRow[]
  excluded: string[]
  onAdd: (ingredientId: string) => void
}) {
  const available = ingredients.filter((i) => i.active && !excluded.includes(i.id))
  if (available.length === 0) {
    return (
      <p className="mt-4 text-[length:var(--fs-c1)] text-ink-mute">
        Đã dùng hết nguyên liệu đang khai.{' '}
        <Link to="/nguyen-lieu" className="text-accent-ink">
          Thêm nguyên liệu ở M7
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="mt-4">
      <select
        value=""
        onChange={(e) => e.target.value && onAdd(e.target.value)}
        className="h-10 rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
      >
        <option value="">Thêm nguyên liệu…</option>
        {available.map((ing) => (
          <option key={ing.id} value={ing.id}>
            {ing.name} ({ing.baseUnit}){ing.costPerBaseMilli === 0 ? ' — chưa có giá' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Tính trước bằng ĐÚNG công thức của máy chủ (`domain/costing.ts: prepCost`) */
function previewOf(lines: DraftLine[], byId: Map<string, IngredientRow>, yieldBase: number) {
  const priced = lines.map((line) => {
    const effectiveQty = Math.round((line.qtyBase * (10_000 + line.wasteBp)) / 10_000)
    return {
      costVnd: Math.round(
        (effectiveQty * (byId.get(line.ingredientId)?.costPerBaseMilli ?? 0)) / 1_000,
      ),
    }
  })
  const batchCostVnd = priced.reduce((sum, l) => sum + l.costVnd, 0)
  return {
    lines: priced,
    batchCostVnd,
    standardMilli: yieldBase > 0 ? Math.round((batchCostVnd * 1_000) / yieldBase) : null,
  }
}

function sameDraft(a: DraftLine[], b: PrepRecipeView['lines']) {
  if (a.length !== b.length) return false
  return a.every((line, i) => {
    const other = b[i]!
    return (
      line.ingredientId === other.ingredientId &&
      line.qtyBase === other.qtyBase &&
      line.wasteBp === other.wasteBp
    )
  })
}
