import { formatVnd } from '@sora/contracts'
import { ApiError } from '@sora/core'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type DishRow, type SetCourse } from '../api'
import { useSession } from '../session-context'

/** Bản ghi món thuần, bỏ các trường dẫn xuất theo chi nhánh */
type DishDraft = Omit<
  DishRow,
  'override' | 'effectivePrice' | 'effectiveActive' | 'effectiveOnlineVisible' | 'effectiveOnlinePrice'
>

export const BLANK_DISH: DishDraft = {
  id: '',
  code: '',
  kind: 'dish',
  categoryId: null,
  subCategory: null,
  nameVi: '',
  nameEn: null,
  nameJa: null,
  kana: null,
  shortDesc: null,
  longDesc: null,
  allergens: null,
  tags: null,
  routingMethod: 'fixed',
  stationGrill: null,
  stationNoGrill: null,
  stationTakeaway: null,
  stationDelivery: null,
  secondaryStation: null,
  primaryLabel: null,
  secondaryLabel: null,
  prepSeconds: 300,
  basePrice: 0,
  onlinePrice: null,
  vatCode: 'standard',
  onlineVisible: false,
  tableOrderable: true,
  signature: false,
  active: true,
  sort: 0,
}

const ROUTING_LABEL: Record<string, string> = {
  fixed: 'Trạm cố định',
  song: 'SỐNG — bàn có bếp thì ra quầy sống',
  nuong: 'NƯỚNG — luôn qua bếp nướng',
  linh_hoat: 'LINH HOẠT — theo tải của bếp',
}

/**
 * Trình sửa món — mô hình dữ liệu §18 dựng thành form.
 *
 * Bộ thiết kế không có màn M2 (chi tiết món) nên bố cục ở đây là dựng mới theo
 * đúng thứ tự các khối trong §18: định danh → phân loại → giá → định tuyến bếp →
 * kênh bán → trình bày → trạng thái. Thứ tự đó cũng là thứ tự người nhập nghĩ.
 */
export function DishEditor({
  dishId,
  blank,
  onClose,
}: {
  dishId: string | null
  blank: DishDraft
  onClose: () => void
}) {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('menu.edit-price')
  const [draft, setDraft] = useState<DishDraft>(blank)
  const [courses, setCourses] = useState<SetCourse[]>([])

  const detail = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => api.dishDetail(dishId!),
    enabled: dishId !== null,
  })
  const pickers = useQuery({ queryKey: ['dish-pickers'], queryFn: api.dishPickers })
  const all = useQuery({
    queryKey: ['dishes', branchId],
    queryFn: () => api.dishes(branchId!),
    enabled: Boolean(branchId),
  })

  useEffect(() => {
    if (detail.data) {
      // Các trường dẫn xuất theo chi nhánh không thuộc bản ghi món — bỏ khỏi nháp
      const {
        override: _o,
        effectivePrice: _p,
        effectiveActive: _a,
        effectiveOnlineVisible: _ov,
        effectiveOnlinePrice: _op,
        ...rest
      } = detail.data.dish
      setDraft(rest)
      setCourses(detail.data.courses)
    }
  }, [detail.data])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['dishes'] })
    void queryClient.invalidateQueries({ queryKey: ['dish', dishId] })
  }

  const fail = (err: Error) => {
    const message = err instanceof ApiError && err.body && typeof err.body === 'object'
      ? ((err.body as { message?: string }).message ?? err.message)
      : err.message
    toast(message, 'danger')
  }

  const save = useMutation({
    mutationFn: () =>
      dishId
        ? api.updateDish(dishId, draft)
        : api.createDish({ ...draft, id: draft.id.trim(), code: draft.code.trim() }),
    onSuccess: () => {
      toast('Đã lưu món', 'ok')
      refresh()
      if (!dishId) onClose()
    },
    onError: fail,
  })

  const saveCourses = useMutation({
    mutationFn: () => api.setDishCourses(dishId!, courses),
    onSuccess: () => {
      toast('Đã lưu các chặng của set', 'ok')
      refresh()
    },
    onError: fail,
  })

  const setOverride = useMutation({
    mutationFn: (input: { price: number | null; active: boolean | null }) =>
      api.setDishOverride(dishId!, branchId!, input),
    onSuccess: () => {
      toast('Đã lưu giá riêng của chi nhánh', 'ok')
      refresh()
    },
    onError: fail,
  })

  const clearOverride = useMutation({
    mutationFn: () => api.clearDishOverride(dishId!, branchId!),
    onSuccess: () => {
      toast('Đã bỏ giá riêng — chi nhánh quay về giá chuỗi', 'ok')
      refresh()
    },
    onError: fail,
  })

  const set = (patch: Partial<DishDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const stations = pickers.data?.stations ?? []
  const override = detail.data?.overrides.find((o) => o.branchId === branchId)
  const isSet = draft.kind === 'set'

  return (
    <div className="fixed inset-0 z-100 flex justify-end bg-canvas/60" onClick={onClose}>
      <aside
        className="flex h-full w-[640px] flex-col border-l border-line-1 bg-surface-1"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-none items-start justify-between gap-3 border-b border-line-1 p-5">
          <div>
            <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
              {dishId ? draft.nameVi : 'Thêm món'}
            </h2>
            {dishId ? (
              <p className="mt-1 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {draft.code} · {draft.id}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="size-10 text-[22px] text-ink-mute">
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <Section title="Định danh">
            <div className="grid gap-4 lg:grid-cols-2">
              {!dishId ? (
                <Field label="Mã định danh" hint="Dùng thẳng trong đường dẫn /thuc-don/{mã}">
                  <input
                    value={draft.id}
                    onChange={(e) => set({ id: e.target.value })}
                    placeholder="ga-nuong-muoi"
                    className={inputClass}
                  />
                </Field>
              ) : null}
              <Field label="Mã món">
                <input
                  value={draft.code}
                  onChange={(e) => set({ code: e.target.value })}
                  placeholder="SORA-GA-001"
                  className={inputClass}
                />
              </Field>
              <Field label="Tên tiếng Việt">
                <input value={draft.nameVi} onChange={(e) => set({ nameVi: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Tên tiếng Nhật">
                <input
                  value={draft.nameJa ?? ''}
                  onChange={(e) => set({ nameJa: e.target.value || null })}
                  className={inputClass}
                />
              </Field>
              <Field label="Kana" hint="Một chữ, dùng làm ô ảnh tạm trên web và Office">
                <input
                  value={draft.kana ?? ''}
                  onChange={(e) => set({ kana: e.target.value || null })}
                  className={inputClass}
                />
              </Field>
            </div>
          </Section>

          <Section title="Phân loại">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Loại">
                <select
                  value={draft.kind}
                  onChange={(e) => set({ kind: e.target.value as DishDraft['kind'] })}
                  className={inputClass}
                >
                  <option value="dish">Món ăn</option>
                  <option value="drink">Đồ uống</option>
                  <option value="set">Set</option>
                </select>
              </Field>
              <Field label="Nhóm thực đơn">
                <select
                  value={draft.categoryId ?? ''}
                  onChange={(e) => set({ categoryId: e.target.value || null })}
                  className={inputClass}
                >
                  <option value="">— chưa xếp nhóm —</option>
                  {(pickers.data?.categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameVi}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Chặng nhỏ" hint="beef · pork · sea · veg — chia nhóm Nướng cho dễ lướt">
                <input
                  value={draft.subCategory ?? ''}
                  onChange={(e) => set({ subCategory: e.target.value || null })}
                  className={inputClass}
                />
              </Field>
              <Field label="Thẻ" hint="chay · cay · hai-san, ngăn nhau bằng dấu phẩy">
                <input
                  value={(draft.tags ?? []).join(', ')}
                  onChange={(e) =>
                    set({ tags: e.target.value.trim() ? e.target.value.split(',').map((t) => t.trim()) : null })
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <label className="mt-4 flex items-center gap-2.5 text-[length:var(--fs-b2)] text-ink-hi">
              <input
                type="checkbox"
                checked={draft.signature}
                onChange={(e) => set({ signature: e.target.checked })}
              />
              Món ký của bếp — hiện huy hiệu 名物 trên web và trang chủ
            </label>
          </Section>

          <Section title="Giá bán">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Giá cấp chuỗi (đồng)">
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={draft.basePrice}
                  onChange={(e) => set({ basePrice: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
              <Field label="Mã thuế">
                <input
                  value={draft.vatCode}
                  onChange={(e) => set({ vatCode: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>

            {dishId ? (
              <div className="mt-4 rounded-sm border border-line-1 p-3.5">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                  Giá riêng của chi nhánh {branchId}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    defaultValue={override?.price ?? ''}
                    placeholder={String(draft.basePrice)}
                    onBlur={(e) =>
                      e.target.value !== ''
                        ? setOverride.mutate({ price: Number(e.target.value), active: override?.active ?? null })
                        : undefined
                    }
                    className="h-10 w-[180px] rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                  />
                  <Button
                    disabled={!mayEdit}
                    onClick={() =>
                      setOverride.mutate({
                        price: override?.price ?? null,
                        active: override?.active === false ? null : false,
                      })
                    }
                  >
                    {override?.active === false ? 'Đang tắt ở chi nhánh này' : 'Tắt ở chi nhánh này'}
                  </Button>
                  {override ? (
                    <Button disabled={!mayEdit} onClick={() => clearOverride.mutate()}>
                      Bỏ ghi đè
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2.5 text-[length:var(--fs-c1)] text-ink-mute">
                  Bỏ trống là ăn theo giá chuỗi {formatVnd(draft.basePrice)}. Tắt ở đây khác với 86:
                  86 là hết trong ca và tự hết hạn cuối ngày.
                </p>
              </div>
            ) : null}
          </Section>

          {!isSet ? (
            <Section title="Định tuyến bếp">
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Phương thức">
                  <select
                    value={draft.routingMethod ?? 'fixed'}
                    onChange={(e) => set({ routingMethod: e.target.value as DishDraft['routingMethod'] })}
                    className={inputClass}
                  >
                    {Object.entries(ROUTING_LABEL).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Thời gian chuẩn (giây)">
                  <input
                    type="number"
                    min={0}
                    value={draft.prepSeconds}
                    onChange={(e) => set({ prepSeconds: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Trạm khi bàn CÓ bếp">
                  <StationPicker
                    value={draft.stationGrill}
                    stations={stations}
                    onChange={(v) => set({ stationGrill: v })}
                  />
                </Field>
                <Field label="Trạm khi bàn KHÔNG bếp">
                  <StationPicker
                    value={draft.stationNoGrill}
                    stations={stations}
                    onChange={(v) => set({ stationNoGrill: v })}
                  />
                </Field>
                <Field label="Trạm khi mang về">
                  <StationPicker
                    value={draft.stationTakeaway}
                    stations={stations}
                    onChange={(v) => set({ stationTakeaway: v })}
                  />
                </Field>
                <Field label="Trạm khi giao hàng">
                  <StationPicker
                    value={draft.stationDelivery}
                    stations={stations}
                    onChange={(v) => set({ stationDelivery: v })}
                  />
                </Field>
              </div>
              <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                Hai trạm đầu là bắt buộc: bàn có bếp thì khách tự nướng nên món sống ra quầy sống;
                bàn không bếp thì bếp nướng hộ và món cộng thêm thời gian.
              </p>
            </Section>
          ) : (
            <Section title="Chặng của set">
              <CourseEditor
                courses={courses}
                dishes={all.data ?? []}
                disabled={!mayEdit}
                onChange={setCourses}
              />
              <Button
                variant="primary"
                className="mt-4"
                disabled={!mayEdit || saveCourses.isPending}
                onClick={() => saveCourses.mutate()}
              >
                Lưu các chặng
              </Button>
            </Section>
          )}

          <Section title="Kênh bán">
            <label className="flex items-center gap-2.5 text-[length:var(--fs-b2)] text-ink-hi">
              <input
                type="checkbox"
                checked={draft.tableOrderable}
                onChange={(e) => set({ tableOrderable: e.target.checked })}
              />
              Cho gọi trên Sora Table (khách quét QR tại bàn)
            </label>
            <label className="mt-3 flex items-center gap-2.5 text-[length:var(--fs-b2)] text-ink-hi">
              <input
                type="checkbox"
                checked={draft.onlineVisible}
                onChange={(e) => set({ onlineVisible: e.target.checked })}
              />
              Bán online (mang về · giao hàng) — cần có mô tả ngắn
            </label>
          </Section>

          <Section title="Trình bày">
            <Field label="Mô tả ngắn" hint="Dòng dưới tên món trên thực đơn — dưới 80 ký tự là vừa">
              <input
                value={draft.shortDesc ?? ''}
                onChange={(e) => set({ shortDesc: e.target.value || null })}
                className={inputClass}
              />
            </Field>
            <Field label="Mô tả dài">
              <textarea
                rows={3}
                value={draft.longDesc ?? ''}
                onChange={(e) => set({ longDesc: e.target.value || null })}
                className="w-full resize-y rounded-sm border border-line-1 bg-canvas p-3 text-[length:var(--fs-b2)] leading-relaxed text-ink-hi"
              />
            </Field>
            <Field label="Dị ứng" hint="Đậu nành, Lúa mì… ngăn nhau bằng dấu phẩy">
              <input
                value={(draft.allergens ?? []).join(', ')}
                onChange={(e) =>
                  set({
                    allergens: e.target.value.trim()
                      ? e.target.value.split(',').map((a) => a.trim())
                      : null,
                  })
                }
                className={inputClass}
              />
            </Field>
          </Section>

          <Section title="Trạng thái">
            <label className="flex items-center gap-2.5 text-[length:var(--fs-b2)] text-ink-hi">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => set({ active: e.target.checked })}
              />
              Đang bán trên toàn chuỗi
            </label>
          </Section>
        </div>

        <footer className="flex flex-none justify-end gap-2 border-t border-line-1 p-4">
          <Button onClick={onClose}>Đóng</Button>
          <Button
            variant="primary"
            disabled={!mayEdit || save.isPending || draft.nameVi.trim() === ''}
            onClick={() => save.mutate()}
          >
            {dishId ? 'Lưu món' : 'Tạo món'}
          </Button>
        </footer>
      </aside>
    </div>
  )
}

const inputClass =
  'h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <p className="mb-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-accent uppercase">
        {title}
      </p>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[length:var(--fs-c2)] text-ink-mute">{hint}</span> : null}
    </label>
  )
}

function StationPicker({
  value,
  stations,
  onChange,
}: {
  value: string | null
  stations: { id: string; name: string }[]
  onChange: (value: string | null) => void
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={inputClass}>
      <option value="">— chưa chọn —</option>
      {stations.map((station) => (
        <option key={station.id} value={station.id}>
          {station.id} · {station.name}
        </option>
      ))}
    </select>
  )
}

/**
 * Soạn chặng của set.
 *
 * Set nấu theo nhịp: mỗi chặng có `batchOffset` là "ra ở đợt thứ mấy" tính từ đợt
 * của dòng set. Nhờ con số đó bếp không dọn cả mâm một lượt.
 */
function CourseEditor({
  courses,
  dishes,
  disabled,
  onChange,
}: {
  courses: SetCourse[]
  dishes: DishRow[]
  disabled: boolean
  onChange: (next: SetCourse[]) => void
}) {
  const patch = (index: number, next: Partial<SetCourse>) =>
    onChange(courses.map((c, i) => (i === index ? { ...c, ...next } : c)))

  return (
    <div className="grid gap-3">
      {courses.map((course, index) => (
        <div key={index} className="rounded-sm border border-line-1 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={course.label}
              disabled={disabled}
              onChange={(e) => patch(index, { label: e.target.value })}
              placeholder="Mở bữa"
              className="h-9 w-[180px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
            />
            <input
              value={course.kanji ?? ''}
              disabled={disabled}
              onChange={(e) => patch(index, { kanji: e.target.value || null })}
              placeholder="前"
              className="h-9 w-[60px] rounded-sm border border-line-1 bg-canvas px-2.5 text-center font-jp text-[length:var(--fs-b2)] text-ink-hi"
            />
            <label className="flex items-center gap-2 text-[length:var(--fs-c1)] text-ink-mute">
              Ra ở đợt
              <input
                type="number"
                min={0}
                max={10}
                value={course.batchOffset}
                disabled={disabled}
                onChange={(e) => patch(index, { batchOffset: Number(e.target.value) })}
                className="h-9 w-[64px] rounded-sm border border-line-1 bg-canvas px-2 text-center font-mono text-[length:var(--fs-b2)] text-ink-hi"
              />
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(courses.filter((_, i) => i !== index))}
              className="ml-auto text-[length:var(--fs-c1)] text-danger"
            >
              Xoá chặng
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {course.items.map((item, itemIndex) => (
              <div key={itemIndex} className="flex flex-wrap items-center gap-2">
                <select
                  value={item.dishId}
                  disabled={disabled}
                  onChange={(e) =>
                    patch(index, {
                      items: course.items.map((it, i) =>
                        i === itemIndex ? { ...it, dishId: e.target.value } : it,
                      ),
                    })
                  }
                  className="h-9 flex-1 rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
                >
                  {dishes
                    .filter((d) => d.kind !== 'set')
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nameVi}
                      </option>
                    ))}
                </select>
                <input
                  value={item.portionLabel ?? ''}
                  disabled={disabled}
                  onChange={(e) =>
                    patch(index, {
                      items: course.items.map((it, i) =>
                        i === itemIndex ? { ...it, portionLabel: e.target.value || null } : it,
                      ),
                    })
                  }
                  placeholder="100g"
                  className="h-9 w-[100px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    patch(index, { items: course.items.filter((_, i) => i !== itemIndex) })
                  }
                  className="text-[length:var(--fs-c1)] text-ink-mute"
                >
                  Bỏ
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={disabled || dishes.length === 0}
              onClick={() =>
                patch(index, {
                  items: [
                    ...course.items,
                    { dishId: dishes.find((d) => d.kind !== 'set')!.id, qty: 1, portionLabel: null },
                  ],
                })
              }
              className="justify-self-start text-[length:var(--fs-c1)] text-accent-ink"
            >
              + Thêm món vào chặng
            </button>
          </div>
        </div>
      ))}

      <Button
        disabled={disabled}
        onClick={() =>
          onChange([
            ...courses,
            { label: '', kanji: null, pickCount: null, batchOffset: courses.length, items: [] },
          ])
        }
      >
        Thêm chặng
      </Button>
    </div>
  )
}
