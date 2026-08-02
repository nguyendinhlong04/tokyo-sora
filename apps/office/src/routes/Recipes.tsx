import { formatVnd } from '@sora/contracts'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, type FoodCostBand, type IngredientRow, type RecipeView } from '../api'
import { PageHeader } from '../components/PageHeader'
import { formatPercent } from '../components/report'
import { useSession } from '../session-context'

/**
 * M4 — Công thức (BOM).
 *
 * Hai thứ làm nên giá trị của màn này, và cả hai đều nằm ở chỗ HIỆN SỐ TRƯỚC KHI
 * LƯU: bảng tính lại giá vốn ngay khi gõ định lượng, và dòng cảnh báo nói rõ "giá
 * vốn tăng 4.200₫, food cost lên 36,7%". Bếp trưởng sửa định lượng vì lý do của
 * bếp; con số food cost phải đập vào mắt ngay lúc đó chứ không phải một tháng sau
 * trên báo cáo.
 */

const BANDS: Record<FoodCostBand, { label: string; tone: string }> = {
  tot: { label: 'tốt', tone: 'text-ok' },
  'canh-bao': { label: 'cảnh báo', tone: 'text-warn' },
  'bao-dong': { label: 'báo động', tone: 'text-danger' },
  'chua-co': { label: 'chưa có công thức', tone: 'text-ink-mute' },
}

/** Ngưỡng §24 M4 — chép sang máy trạm để tính trước khi lưu */
const bandOf = (percent: number): FoodCostBand =>
  percent < 0.3 ? 'tot' : percent <= 0.38 ? 'canh-bao' : 'bao-dong'

interface DraftLine {
  ingredientId: string
  qtyBase: number
  wasteBp: number
}

// ---------------------------------------------------------------- danh sách

/** Danh sách món xếp theo food cost — "sắp theo food cost tìm món lãi thấp" (§24 M1) */
export function RecipeList() {
  const { branchId } = useSession()

  const dishes = useQuery({
    queryKey: ['dishes', branchId],
    queryFn: () => api.dishes(branchId!),
    enabled: Boolean(branchId),
  })
  const costs = useQuery({ queryKey: ['dish-costs'], queryFn: api.dishCosts })

  const costOf = useMemo(
    () => new Map((costs.data ?? []).map((c) => [c.dishId, c])),
    [costs.data],
  )

  const rows = (dishes.data ?? [])
    .filter((d) => d.kind !== 'set')
    .map((dish) => {
      const cost = costOf.get(dish.id)
      const percent = cost && dish.effectivePrice > 0 ? cost.costVnd / dish.effectivePrice : null
      return { dish, costVnd: cost?.costVnd ?? null, percent }
    })
    // Món chưa khai công thức xuống cuối: chúng chưa có gì để so
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1))

  const withRecipe = rows.filter((r) => r.percent !== null).length

  return (
    <>
      <PageHeader
        title="Công thức & giá vốn"
        subtitle={`${withRecipe}/${rows.length} món đã khai công thức. Xếp theo food cost giảm dần — món trên đầu là món lãi mỏng nhất.`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[120px_1fr_140px_140px_150px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Mã</span>
            <span>Món</span>
            <span className="text-right">Giá bán</span>
            <span className="text-right">Giá vốn</span>
            <span className="text-right">Food cost</span>
          </div>

          {dishes.isPending ? (
            <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
          ) : (
            rows.map(({ dish, costVnd, percent }) => (
              <Link
                key={dish.id}
                to={`/cong-thuc/${dish.id}`}
                className="grid grid-cols-[120px_1fr_140px_140px_150px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0 hover:bg-surface-3"
              >
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {dish.code}
                </span>
                <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">
                  {dish.nameVi}
                </span>
                <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-body">
                  {formatVnd(dish.effectivePrice)}
                </span>
                <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-body">
                  {costVnd === null ? <span className="text-line-4">—</span> : formatVnd(costVnd)}
                </span>
                <span className="text-right">
                  {percent === null ? (
                    <span className="text-[length:var(--fs-c1)] text-ink-mute">
                      chưa khai công thức
                    </span>
                  ) : (
                    <span
                      className={`font-mono text-[length:var(--fs-b2)] ${BANDS[bandOf(percent)].tone}`}
                    >
                      {formatPercent(percent).replace('+', '')}
                    </span>
                  )}
                </span>
              </Link>
            ))
          )}
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Set không có dòng riêng ở đây: set không có công thức của mình, giá vốn của set là tổng
          giá vốn các món thành phần khách chọn thật — dải min–max của nó nằm ở{' '}
          <Link to="/set-combo" className="text-accent-ink">
            M11 · Set &amp; Combo
          </Link>
          . Bán thành phẩm chèn được thẳng vào bảng công thức như một nguyên liệu; công thức mẻ của
          chúng khai ở{' '}
          <Link to="/ban-thanh-pham" className="text-accent-ink">
            M8
          </Link>
          .
        </p>
      </div>
    </>
  )
}

// ------------------------------------------------------------- bảng công thức

export function RecipeEditor() {
  const { dishId = '' } = useParams()
  const { branchId, can } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('recipe.edit')

  const recipe = useQuery({
    queryKey: ['recipe', dishId],
    queryFn: () => api.recipe(dishId),
    enabled: Boolean(dishId),
    // Đây là màn SỬA: tải lại khi cửa sổ lấy lại tiêu điểm sẽ xoá mất bảng đang gõ dở
    refetchOnWindowFocus: false,
  })
  const ingredients = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })

  const [draft, setDraft] = useState<DraftLine[] | null>(null)

  /**
   * Bản nháp bám theo DỮ LIỆU ĐÃ LƯU, không phải chỉ lần tải đầu.
   *
   * `recipe.data` giữ nguyên tham chiếu giữa các lần render nên gõ trong bảng
   * không bị hiệu ứng này xoá; nó chỉ chạy lại khi máy chủ trả về dữ liệu mới —
   * tức là sau khi lưu. Ràng buộc theo kiểu "chỉ khởi tạo khi draft null" thì lúc
   * lưu xong bảng sẽ dựng lại từ bản CŨ đang còn trong cache, và màn hình hiện
   * công thức rỗng trong khi máy chủ đã có công thức.
   */
  useEffect(() => {
    if (recipe.data) setDraft(recipe.data.lines.map((l) => ({ ...l })))
  }, [recipe.data])

  const save = useMutation({
    mutationFn: (lines: DraftLine[]) => api.setRecipe(dishId, lines),
    onSuccess: (result) => {
      const diff = result.costAfter - result.costBefore
      toast(
        diff === 0
          ? 'Đã lưu công thức'
          : `Đã lưu · giá vốn ${diff > 0 ? 'tăng' : 'giảm'} ${formatVnd(Math.abs(diff))}`,
        'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['recipe', dishId] })
      void queryClient.invalidateQueries({ queryKey: ['dish-costs'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  if (recipe.isError) {
    return (
      <div className="p-8">
        <ErrorState message={(recipe.error as Error).message} />
      </div>
    )
  }
  if (!recipe.data || !draft) {
    return <p className="p-8 text-ink-mute">Đang tải…</p>
  }

  const saved = recipe.data
  const byId = new Map((ingredients.data ?? []).map((i) => [i.id, i]))
  const preview = previewOf(draft, byId, saved.dish.basePrice)
  const dirty = !sameLines(draft, saved.lines)

  return (
    <>
      <PageHeader
        title={saved.dish.nameVi}
        subtitle={`Công thức cho MỘT phần · giá bán ${formatVnd(saved.dish.basePrice)}. Định lượng tính bằng đơn vị cơ sở của từng nguyên liệu.`}
        action={
          <>
            <Button onClick={() => navigate('/cong-thuc')}>Về danh sách</Button>
            <Button onClick={() => navigate(`/lich-su-cong-thuc?kind=dish&id=${dishId}`)}>
              Lịch sử
            </Button>
            {mayEdit ? (
              <Button
                variant="primary"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                Lưu công thức
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {dirty ? <CostWarning saved={saved} preview={preview} /> : null}

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[1fr_150px_130px_150px_110px_60px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Nguyên liệu</span>
            <span className="text-right">Định lượng</span>
            <span className="text-right">Hao hụt %</span>
            <span className="text-right">Giá vốn dòng</span>
            <span className="text-right">Đóng góp</span>
            <span />
          </div>

          {draft.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
              Chưa có nguyên liệu nào. Thêm dòng bên dưới để bắt đầu tính giá vốn.
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

                  <span className="text-right">
                    <span className="block font-mono text-[length:var(--fs-b2)] text-ink-body">
                      {formatVnd(cost.costVnd)}
                    </span>
                    {line.wasteBp > 0 ? (
                      <span className="block text-[length:var(--fs-c2)] text-ink-mute">
                        xuất {cost.effectiveQty} {ing?.baseUnit}
                      </span>
                    ) : null}
                  </span>

                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {preview.costVnd === 0
                      ? '—'
                      : formatPercent(cost.costVnd / preview.costVnd).replace('+', '')}
                  </span>

                  <span className="flex justify-end">
                    {mayEdit ? (
                      <button
                        type="button"
                        onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                        className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-mute hover:text-danger"
                      >
                        Bỏ
                      </button>
                    ) : null}
                  </span>
                </div>
              )
            })
          )}

          <div className="grid grid-cols-[1fr_150px_130px_150px_110px_60px] items-center gap-3 border-t border-line-2 bg-surface-2 px-5 py-3">
            <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
              Tổng giá vốn một phần
            </span>
            <span />
            <span />
            <span className="text-right font-mono text-[length:var(--fs-b2)] font-semibold text-ink-hi">
              {formatVnd(preview.costVnd)}
            </span>
            <span className="col-span-2 text-right text-[length:var(--fs-c1)] text-ink-mute">
              lãi gộp {formatVnd(saved.dish.basePrice - preview.costVnd)}
            </span>
          </div>
        </div>

        {mayEdit ? (
          <AddLine
            ingredients={ingredients.data ?? []}
            used={draft.map((l) => l.ingredientId)}
            onAdd={(ingredientId) =>
              setDraft([...draft, { ingredientId, qtyBase: 100, wasteBp: 0 }])
            }
          />
        ) : null}

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Hao hụt cộng THÊM vào lượng phải xuất: khai 500ml với hao hụt 6% thì kho trừ 530ml —
          đúng cách quầy bia mất bọt khi rót. Mỗi lần lưu mà công thức thật sự đổi đều để lại một
          bản chụp ở{' '}
          <Link to={`/lich-su-cong-thuc?kind=dish&id=${dishId}`} className="text-accent-ink">
            M9 · Lịch sử công thức
          </Link>
          , và chênh lệch giá vốn vẫn vào nhật ký thao tác A7.
        </p>
      </div>
    </>
  )
}

function CostWarning({
  saved,
  preview,
}: {
  saved: RecipeView
  preview: { costVnd: number; percent: number | null }
}) {
  const diff = preview.costVnd - saved.costVnd
  const band = preview.percent === null ? null : bandOf(preview.percent)

  return (
    <section className="rounded-md border border-warn bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-b2)] text-ink-hi">
        {diff === 0
          ? 'Định lượng đã đổi, giá vốn giữ nguyên'
          : `Giá vốn ${diff > 0 ? 'tăng' : 'giảm'} ${formatVnd(Math.abs(diff))}`}
        {preview.percent !== null ? (
          <>
            {' · food cost '}
            {saved.percent !== null ? `${formatPercent(saved.percent).replace('+', '')} → ` : ''}
            <span className={band ? BANDS[band].tone : ''}>
              {formatPercent(preview.percent).replace('+', '')}
            </span>
            {band ? <span className="text-ink-mute"> ({BANDS[band].label})</span> : null}
          </>
        ) : null}
      </p>
      <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
        Chưa lưu. Ngưỡng: dưới 30% tốt · 30–38% cảnh báo · trên 38% báo động.
      </p>
    </section>
  )
}

function AddLine({
  ingredients,
  used,
  onAdd,
}: {
  ingredients: IngredientRow[]
  used: string[]
  onAdd: (ingredientId: string) => void
}) {
  const available = ingredients.filter((i) => i.active && !used.includes(i.id))

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
    <div className="mt-4 flex items-center gap-3">
      <select
        value=""
        onChange={(e) => e.target.value && onAdd(e.target.value)}
        className="h-10 rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
      >
        <option value="">Thêm nguyên liệu…</option>
        {available.map((ing) => (
          <option key={ing.id} value={ing.id}>
            {ing.name} ({ing.baseUnit})
            {ing.costPerBaseMilli === 0 ? ' — chưa có giá' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

// ------------------------------------------------------------------ tính trước

/**
 * Tính lại giá vốn ngay trên máy trạm bằng ĐÚNG công thức của máy chủ
 * (`domain/costing.ts`): hao hụt cộng vào lượng, làm tròn từng dòng rồi mới cộng.
 * Lệch một đồng giữa số xem trước và số lưu xong là đủ để người dùng hết tin bảng.
 */
function previewOf(
  lines: DraftLine[],
  byId: Map<string, IngredientRow>,
  priceVnd: number,
): { costVnd: number; percent: number | null; lines: { costVnd: number; effectiveQty: number }[] } {
  const priced = lines.map((line) => {
    const ing = byId.get(line.ingredientId)
    const effectiveQty = Math.round((line.qtyBase * (10_000 + line.wasteBp)) / 10_000)
    return {
      effectiveQty,
      costVnd: Math.round((effectiveQty * (ing?.costPerBaseMilli ?? 0)) / 1_000),
    }
  })

  const costVnd = priced.reduce((sum, l) => sum + l.costVnd, 0)
  return {
    costVnd,
    percent: lines.length === 0 || priceVnd <= 0 ? null : costVnd / priceVnd,
    lines: priced,
  }
}

function sameLines(a: DraftLine[], b: { ingredientId: string; qtyBase: number; wasteBp: number }[]) {
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
