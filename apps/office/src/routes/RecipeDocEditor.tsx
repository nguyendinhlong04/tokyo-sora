import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  api,
  type RecipeCcp,
  type RecipeDoc,
  type RecipeDocView,
  type RecipeInputSpec,
  type RecipeMethodKind,
  type RecipePitfall,
  type RecipeSpecItem,
  type RecipeStep,
  type RecipeStepPhase,
} from '../api'
import { formatDuration } from '../components/slices'
import {
  Field,
  LineList,
  ListHead,
  NumberInput,
  RecordList,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

/**
 * M4 — Quy trình chế biến, nửa còn lại của thẻ công thức.
 *
 * Bảng nguyên liệu trả lời "món này tốn bao nhiêu tiền". Màn này trả lời "làm
 * thế nào để ra đúng món đó" — câu hỏi của người đứng bếp, và cho tới bản này
 * nó chỉ được trả lời bằng trí nhớ của người làm lâu năm.
 *
 * Không có năm ô văn bản cố định. Quán nướng không có một quy trình nấu duy
 * nhất: misuji bếp không bật lửa lần nào, karaage cần chỗ ghi nhiệt độ dầu và
 * hai lượt chiên. Nên mô hình là BƯỚC theo ba giai đoạn, cộng biểu mẫu gợi ý
 * theo kiểu món — chọn kiểu là có sẵn khung để sửa, không phải trang trắng.
 */

const METHOD_OPTIONS: { value: RecipeMethodKind; label: string }[] = [
  { value: 'song', label: 'Sống — khách tự nướng tại bàn' },
  { value: 'nuong', label: 'Bếp nướng — ra chín' },
  { value: 'nau', label: 'Bếp nấu — chiên, xào, hầm, lẩu' },
  { value: 'lap_rap', label: 'Lắp ráp — lấy sẵn rồi xếp ra' },
]

const PHASES: { key: RecipeStepPhase; title: string; hint: string }[] = [
  {
    key: 'so_che',
    title: 'Quy trình sơ chế',
    hint: 'Làm TRƯỚC ca, theo mẻ — việc không có vé cũng phải làm.',
  },
  {
    key: 'che_bien',
    title: 'Quy trình chế biến · ra món',
    hint: 'Khi vé về thì làm gì, theo thứ tự nào, trong bao nhiêu giây.',
  },
  {
    key: 'hoan_thien',
    title: 'Hoàn thiện & trình bày',
    hint: 'Đĩa gì, xếp ra sao, kèm gì ra bàn.',
  },
]

/**
 * Khung bước theo kiểu món — thứ hiện ra khi bấm Soạn quy trình.
 *
 * Cố ý viết chung chung: đây là khung để bếp trưởng sửa thành số thật của quán,
 * không phải chuẩn đã duyệt. Điền sẵn thông số cụ thể (170°C, 5mm) sẽ có ngày
 * ai đó lưu nguyên và cả bếp làm theo một con số không ai chốt.
 */
const TEMPLATES: Record<RecipeMethodKind, { phase: RecipeStepPhase; text: string }[]> = {
  song: [
    { phase: 'so_che', text: 'Rã đông trong ngăn mát.' },
    { phase: 'so_che', text: 'Lóc màng và gân.' },
    { phase: 'so_che', text: 'Chia khối, hút chân không, dán nhãn lô và ngày.' },
    { phase: 'che_bien', text: 'Lấy khối theo hạn dùng gần nhất.' },
    { phase: 'che_bien', text: 'Thái ngang thớ theo độ cắt khách chọn.' },
    { phase: 'che_bien', text: 'Cân đúng định lượng một phần.' },
    { phase: 'hoan_thien', text: 'Xếp lát lên đĩa đã làm lạnh.' },
    { phase: 'hoan_thien', text: 'Đặt đồ chấm và kẹp gắp thịt sống riêng.' },
  ],
  nuong: [
    { phase: 'so_che', text: 'Ướp theo công thức, ghi giờ bắt đầu ướp.' },
    { phase: 'so_che', text: 'Cất lạnh tới khi có vé.' },
    { phase: 'che_bien', text: 'Làm nóng vỉ.' },
    { phase: 'che_bien', text: 'Nướng mặt thứ nhất.' },
    { phase: 'che_bien', text: 'Trở mặt, nướng nốt và kiểm nhiệt độ tâm.' },
    { phase: 'che_bien', text: 'Để thịt nghỉ trước khi cắt.' },
    { phase: 'hoan_thien', text: 'Cắt miếng, xếp đĩa, rưới sốt.' },
  ],
  nau: [
    { phase: 'so_che', text: 'Sơ chế nguyên liệu, cân sẵn theo phần.' },
    { phase: 'che_bien', text: 'Làm nóng dầu hoặc nước dùng tới nhiệt độ chuẩn.' },
    { phase: 'che_bien', text: 'Nấu theo thời gian chuẩn.' },
    { phase: 'che_bien', text: 'Nêm và kiểm vị.' },
    { phase: 'che_bien', text: 'Kiểm nhiệt độ tâm trước khi ra.' },
    { phase: 'hoan_thien', text: 'Múc ra tô, trang trí, lau vành.' },
  ],
  lap_rap: [
    { phase: 'che_bien', text: 'Lấy bán thành phẩm đã chuẩn bị.' },
    { phase: 'che_bien', text: 'Định lượng một phần.' },
    { phase: 'hoan_thien', text: 'Xếp ra đĩa và trang trí.' },
  ],
}

/** Thẻ trắng — mọi mảng rỗng, mọi ô null. Bỏ trống là hợp lệ ở mọi khối. */
function blankDoc(method: RecipeMethodKind): Draft {
  return {
    methodKind: method,
    yieldLabel: null,
    plateLabel: null,
    prepMinutes: 0,
    equipment: [],
    inputSpec: [],
    specMeasured: [],
    specSensory: [],
    ccp: [],
    storage: null,
    tips: [],
    pitfalls: [],
    substituteIds: [],
    steps: TEMPLATES[method].map((t) => ({
      phase: t.phase,
      text: t.text,
      seconds: null,
      paramLabel: null,
      ingredientIds: [],
      isCcp: false,
    })),
  }
}

type Draft = RecipeDoc & { steps: RecipeStep[] }

export function RecipeDocEditor({ dishId, tabs }: { dishId: string; tabs: ReactNode }) {
  const { branchId, can } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('recipe.edit')

  const view = useQuery({
    queryKey: ['recipe-doc', 'dish', dishId],
    queryFn: () => api.recipeDoc('dish', dishId),
    enabled: Boolean(dishId),
    // Màn SỬA: tải lại khi cửa sổ lấy lại tiêu điểm sẽ xoá mất thứ đang gõ dở
    refetchOnWindowFocus: false,
  })
  // Bảng nguyên liệu để bước trỏ vào — cùng khoá cache với tab bên cạnh
  const recipe = useQuery({
    queryKey: ['recipe', dishId],
    queryFn: () => api.recipe(dishId),
    enabled: Boolean(dishId),
    refetchOnWindowFocus: false,
  })
  const dishes = useQuery({
    queryKey: ['dishes', branchId],
    queryFn: () => api.dishes(branchId!),
    enabled: Boolean(branchId),
  })

  const [draft, setDraft] = useState<Draft | null>(null)

  /**
   * Bản nháp bám theo DỮ LIỆU ĐÃ LƯU, không phải chỉ lần tải đầu — cùng lý do
   * và cùng cách với bảng nguyên liệu ở tab bên cạnh.
   */
  useEffect(() => {
    if (!view.data) return
    setDraft(draftOf(view.data))
  }, [view.data])

  const save = useMutation({
    mutationFn: (next: Draft) => api.setRecipeDoc('dish', dishId, next),
    onSuccess: (result) => {
      toast(`Đã lưu quy trình · ${result.steps} bước`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['recipe-doc', 'dish', dishId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  if (view.isError) {
    return (
      <div className="p-8">
        <ErrorState message={(view.error as Error).message} />
      </div>
    )
  }
  if (!view.data) return <p className="p-8 text-ink-mute">Đang tải…</p>

  const saved = view.data
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(draftOf(saved))
  const problem = draft ? firstProblem(draft) : null

  return (
    <>
      <PageHeader
        title={saved.subject.name}
        subtitle="Quy trình chế biến — tài liệu người trong bếp làm theo. Bỏ trống khối nào thì bản in bỏ qua khối đó."
        action={
          <>
            {tabs}
            <Button onClick={() => navigate('/cong-thuc')}>Về danh sách</Button>
            {mayEdit && draft ? (
              <Button
                variant="primary"
                disabled={!dirty || problem !== null || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                Lưu quy trình
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {draft === null ? (
          <Blank
            method={saved.suggestedMethod}
            mayEdit={mayEdit}
            onStart={() => setDraft(blankDoc(saved.suggestedMethod))}
          />
        ) : (
          <div className="mt-5 grid max-w-[1080px] gap-7">
            {problem ? (
              <p className="rounded-md border border-warn bg-surface-1 px-5 py-3 text-[length:var(--fs-b2)] text-ink-hi">
                {problem}
                <span className="ml-2 text-ink-mute">Điền nốt hoặc bỏ dòng đó rồi mới lưu được.</span>
              </p>
            ) : null}

            <Identity
              draft={draft}
              disabled={!mayEdit}
              prepSeconds={saved.subject.prepSeconds}
              onChange={setDraft}
            />

            {PHASES.map((phase) => (
              <StepList
                key={phase.key}
                phase={phase}
                draft={draft}
                disabled={!mayEdit}
                lines={recipe.data?.lines ?? []}
                onChange={setDraft}
              />
            ))}

            <Acceptance draft={draft} disabled={!mayEdit} onChange={setDraft} />
            <Safety draft={draft} disabled={!mayEdit} onChange={setDraft} />
            <Craft
              draft={draft}
              disabled={!mayEdit}
              dishes={(dishes.data ?? []).filter((d) => d.id !== dishId && d.kind !== 'set')}
              onChange={setDraft}
            />

            <p className="max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              {saved.doc
                ? `Sửa lần cuối ${new Date(saved.doc.updatedAt).toLocaleString('vi-VN')}. `
                : 'Chưa lưu lần nào. '}
              Mỗi lần lưu thay CẢ THẺ, không cộng dồn bước cũ — đây là tài liệu người ta làm
              theo, không phải bản nháp ghép từng mảnh.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Bản nháp dựng từ dữ liệu đã lưu — vừa là giá trị khởi tạo, vừa là mốc để biết
 * có gì đổi chưa. Một hàm cho cả hai việc để hai bên không bao giờ lệch hình:
 * so sánh bằng JSON thì thừa một khoá cũng thành "đã sửa" ngay khi vừa tải xong.
 *
 * `updatedAt` bị bỏ ra vì nó là dấu vết của máy chủ, không phải nội dung thẻ.
 */
/**
 * Lý do chưa lưu được, nói ngay tại chỗ sửa thay vì để máy chủ trả lỗi.
 *
 * Cùng bộ luật với `setRecipeDoc` ở máy chủ — máy chủ vẫn là nơi cưỡng chế, đây
 * chỉ là để người soạn không bấm Lưu rồi mới biết mình bỏ sót một ô ở khối đã
 * cuộn qua từ lâu. Trả về LỖI ĐẦU TIÊN: liệt kê cả tám thứ cùng lúc thì không ai
 * đọc, mà sửa một cái là danh sách đổi hết.
 */
function firstProblem(draft: Draft): string | null {
  if (draft.steps.some((s) => s.text.trim() === '')) return 'Có bước chưa ghi nội dung.'
  if (draft.ccp.some((c) => !c.point.trim() || !c.limit.trim() || !c.action.trim())) {
    return 'Điểm kiểm soát phải khai đủ điểm, ngưỡng và cách xử lý khi lệch.'
  }
  if (draft.inputSpec.some((s) => !s.item.trim() || !s.requirement.trim())) {
    return 'Yêu cầu nguyên liệu đầu vào còn ô trống.'
  }
  if (draft.specMeasured.some((s) => !s.name.trim() || !s.target.trim())) {
    return 'Tiêu chí đo được còn ô trống.'
  }
  if (draft.pitfalls.some((p) => !p.mistake.trim() || !p.effect.trim() || !p.fix.trim())) {
    return 'Bảng lỗi thường gặp còn ô trống.'
  }
  if ([...draft.equipment, ...draft.specSensory, ...draft.tips].some((line) => !line.trim())) {
    return 'Có dòng để trống ở khối dụng cụ, cảm quan hoặc mẹo.'
  }
  return null
}

function draftOf(view: RecipeDocView): Draft | null {
  if (!view.doc) return null
  const { updatedAt: _updatedAt, ...doc } = view.doc
  return { ...doc, steps: view.steps.map((step) => ({ ...step })) }
}

function Blank({
  method,
  mayEdit,
  onStart,
}: {
  method: RecipeMethodKind
  mayEdit: boolean
  onStart: () => void
}) {
  const label = METHOD_OPTIONS.find((o) => o.value === method)!.label

  return (
    <section className="mt-5 max-w-[720px] rounded-md border border-line-1 bg-surface-1 px-6 py-6">
      <h2 className="text-[length:var(--fs-t2)] text-ink-hi">Món này chưa có quy trình</h2>
      <p className="mt-2 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
        Người mới vào ca đang phải hỏi người cũ. Soạn một lần ở đây thì mọi chi nhánh làm
        giống nhau, và đoàn kiểm tra hỏi thì có cái để đưa ra.
      </p>
      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Định tuyến của món cho biết đây là kiểu <span className="text-accent-ink">{label}</span> —
        bấm Soạn để mở khung bước tương ứng rồi sửa thành cách làm của quán. Chọn nhầm kiểu thì
        đổi lại được ngay ở khối đầu tiên.
      </p>
      {mayEdit ? (
        <div className="mt-5">
          <Button variant="primary" onClick={onStart}>
            Soạn quy trình
          </Button>
        </div>
      ) : (
        <p className="mt-5 text-[length:var(--fs-c1)] text-ink-mute">
          Bạn không có quyền sửa công thức — nhờ bếp trưởng soạn.
        </p>
      )}
    </section>
  )
}

// ------------------------------------------------------------ các khối

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-accent uppercase">
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 max-w-[720px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          {hint}
        </p>
      ) : null}
      <div className="mt-3 grid gap-4">{children}</div>
    </section>
  )
}

function Identity({
  draft,
  disabled,
  prepSeconds,
  onChange,
}: {
  draft: Draft
  disabled: boolean
  prepSeconds: number | null
  onChange: (next: Draft) => void
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })

  return (
    <Block title="Nhận diện & quy cách">
      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Kiểu công thức"
          hint="Quyết định khung bước. Đổi kiểu không xoá bước đã soạn."
        >
          <Select
            value={draft.methodKind}
            onChange={(methodKind) => set({ methodKind })}
            options={METHOD_OPTIONS}
            disabled={disabled}
          />
        </Field>
        <Field label="Quy cách một phần" hint="Viết cho người đọc: 100g · 7–9 lát">
          <TextInput
            value={draft.yieldLabel ?? ''}
            onChange={(v) => set({ yieldLabel: v || null })}
            placeholder="100g · 7–9 lát"
            disabled={disabled}
          />
        </Field>
        <Field label="Dụng cụ đựng chuẩn" className="lg:col-span-2">
          <TextInput
            value={draft.plateLabel ?? ''}
            onChange={(v) => set({ plateLabel: v || null })}
            placeholder="Đĩa gỗ số 3, lót lá tía tô"
            disabled={disabled}
          />
        </Field>
        <Field
          label="Sơ chế trước ca (phút)"
          hint={
            prepSeconds === null
              ? 'Thời gian làm theo mẻ, trước giờ mở cửa.'
              : `Thời gian làm theo mẻ. Thời gian RA MÓN đã khai ở M6: ${formatDuration(prepSeconds)}.`
          }
        >
          <NumberInput
            value={draft.prepMinutes}
            onChange={(v) => set({ prepMinutes: v ?? 0 })}
            min={0}
            width={120}
            disabled={disabled}
          />
        </Field>
      </div>

      <LineList
        label="Dụng cụ & chuẩn bị chỗ làm"
        hint="Cần sẵn gì trước khi bắt đầu: dao, thớt theo màu, cân, khay, đĩa giữ lạnh."
        placeholder="Thớt đỏ — quy ước thịt sống"
        value={draft.equipment}
        disabled={disabled}
        max={20}
        empty="Chưa khai dụng cụ nào — bản in bỏ qua khối này."
        onChange={(equipment) => set({ equipment })}
      />

      <RecordList<RecipeInputSpec>
        label="Yêu cầu nguyên liệu đầu vào"
        hint="Điều kiện NHẬN HÀNG, khác với yêu cầu thành phẩm ở dưới: nhiệt độ khi nhận, cảm quan, dấu nhận dạng đúng phần."
        columns={[
          { key: 'item', label: 'Hạng mục', placeholder: 'Nhiệt độ khi nhận', grow: 1 },
          {
            key: 'requirement',
            label: 'Yêu cầu',
            placeholder: 'Mát ≤ 4°C hoặc đông ≤ −18°C, lệch thì từ chối lô',
            grow: 2,
          },
        ]}
        blank={{ item: '', requirement: '' }}
        value={draft.inputSpec}
        disabled={disabled}
        max={15}
        onChange={(inputSpec) => set({ inputSpec })}
      />
    </Block>
  )
}

/**
 * Một giai đoạn bước.
 *
 * Bước trỏ về DÒNG NGUYÊN LIỆU chứ không chép lại định lượng vào câu chữ: chép
 * tay thì sửa định lượng ở bảng bên cạnh là câu trong bước sai ngay, và không ai
 * phát hiện cho tới lúc người mới làm theo.
 */
function StepList({
  phase,
  draft,
  disabled,
  lines,
  onChange,
}: {
  phase: { key: RecipeStepPhase; title: string; hint: string }
  draft: Draft
  disabled: boolean
  lines: { ingredientId: string; name: string }[]
  onChange: (next: Draft) => void
}) {
  const mine = useMemo(
    () =>
      draft.steps
        .map((step, index) => ({ step, index }))
        .filter(({ step }) => step.phase === phase.key),
    [draft.steps, phase.key],
  )

  const total = mine.reduce((sum, { step }) => sum + (step.seconds ?? 0), 0)

  const patch = (index: number, next: Partial<RecipeStep>) =>
    onChange({
      ...draft,
      steps: draft.steps.map((s, i) => (i === index ? { ...s, ...next } : s)),
    })

  const add = () =>
    onChange({
      ...draft,
      steps: [
        ...draft.steps,
        {
          phase: phase.key,
          text: '',
          seconds: null,
          paramLabel: null,
          ingredientIds: [],
          isCcp: false,
        },
      ],
    })

  const move = (index: number, delta: number) => {
    const position = mine.findIndex((m) => m.index === index)
    const target = mine[position + delta]
    if (!target) return
    const steps = draft.steps.slice()
    const [a, b] = [steps[index]!, steps[target.index]!]
    steps[index] = b
    steps[target.index] = a
    onChange({ ...draft, steps })
  }

  return (
    <Block title={phase.title} hint={phase.hint}>
      <div>
        <ListHead
          label={`${mine.length} bước${total > 0 ? ` · tổng ${formatDuration(total)}` : ''}`}
        >
          <Button size="sm" disabled={disabled || draft.steps.length >= 60} onClick={add}>
            + Thêm bước
          </Button>
        </ListHead>

        <div className="grid gap-2">
          {mine.map(({ step, index }, position) => (
            <div
              key={index}
              className="rounded-sm border border-line-1 bg-surface-1 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 flex-none text-center font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {position + 1}
                </span>
                <TextArea
                  value={step.text}
                  rows={1}
                  disabled={disabled}
                  placeholder="Một hành động, mở đầu bằng động từ: Thái ngang thớ dày 5mm."
                  onChange={(text) => patch(index, { text })}
                />
                <span className="flex flex-none gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled || position === 0}
                    onClick={() => move(index, -1)}
                    title="Lên trên"
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled || position === mine.length - 1}
                    onClick={() => move(index, 1)}
                    title="Xuống dưới"
                  >
                    ↓
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      onChange({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })
                    }
                  >
                    Bỏ
                  </Button>
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                <NumberInput
                  value={step.seconds}
                  onChange={(seconds) => patch(index, { seconds: seconds || null })}
                  min={1}
                  width={90}
                  placeholder="giây"
                  disabled={disabled}
                />
                <TextInput
                  value={step.paramLabel ?? ''}
                  onChange={(v) => patch(index, { paramLabel: v || null })}
                  placeholder="thông số: 170°C · 5mm · 0–2°C"
                  width={230}
                  disabled={disabled}
                />
                <Toggle
                  on={step.isCcp}
                  onChange={(isCcp) => patch(index, { isCcp })}
                  disabled={disabled}
                  tone="accent"
                >
                  Điểm kiểm soát
                </Toggle>
                {lines.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {lines.map((line) => (
                      <Toggle
                        key={line.ingredientId}
                        on={step.ingredientIds.includes(line.ingredientId)}
                        disabled={disabled}
                        tone="ok"
                        onChange={(on) =>
                          patch(index, {
                            ingredientIds: on
                              ? [...step.ingredientIds, line.ingredientId]
                              : step.ingredientIds.filter((id) => id !== line.ingredientId),
                          })
                        }
                      >
                        {line.name}
                      </Toggle>
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          ))}

          {mine.length === 0 ? (
            <p className="text-[length:var(--fs-c1)] text-ink-mute">
              Chưa có bước nào ở giai đoạn này — bản in bỏ qua khối này.
            </p>
          ) : null}
        </div>
      </div>
    </Block>
  )
}

function Acceptance({
  draft,
  disabled,
  onChange,
}: {
  draft: Draft
  disabled: boolean
  onChange: (next: Draft) => void
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })

  return (
    <Block
      title="Yêu cầu thành phẩm"
      hint="Đĩa thế nào thì được ra bàn. Ca trưởng cầm khối này đi soi đĩa — nên mọi dòng ở bảng trên phải ĐO ĐƯỢC, còn thứ chỉ nhìn và ngửi thì để ở dưới."
    >
      <RecordList<RecipeSpecItem>
        label="Đo được"
        columns={[
          { key: 'name', label: 'Tiêu chí', placeholder: 'Khối lượng', grow: 1 },
          { key: 'target', label: 'Ngưỡng', placeholder: '100g ± 3g', grow: 1 },
        ]}
        blank={{ name: '', target: '' }}
        value={draft.specMeasured}
        disabled={disabled}
        max={15}
        onChange={(specMeasured) => set({ specMeasured })}
      />

      <LineList
        label="Cảm quan"
        placeholder="Mặt cắt đỏ tươi và bóng, vân mỡ nổi rõ"
        value={draft.specSensory}
        disabled={disabled}
        max={10}
        onChange={(specSensory) => set({ specSensory })}
      />
    </Block>
  )
}

function Safety({
  draft,
  disabled,
  onChange,
}: {
  draft: Draft
  disabled: boolean
  onChange: (next: Draft) => void
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })

  return (
    <Block
      title="An toàn & bảo quản"
      hint="Thịt sống dọn lên bàn cho khách tự nướng là nhóm rủi ro cao nhất của quán. Mỗi ngưỡng bắt buộc nói rõ lệch thì làm gì — ngưỡng không kèm cách xử lý chỉ là chữ đỏ trang trí."
    >
      <RecordList<RecipeCcp>
        label="Điểm kiểm soát"
        columns={[
          { key: 'point', label: 'Điểm', placeholder: 'Thời gian ngoài lạnh', grow: 1 },
          { key: 'limit', label: 'Ngưỡng', placeholder: '≤ 20 phút', grow: 1 },
          { key: 'action', label: 'Lệch thì làm gì', placeholder: 'Thu về, huỷ, làm đĩa mới', grow: 2 },
        ]}
        blank={{ point: '', limit: '', action: '' }}
        value={draft.ccp}
        disabled={disabled}
        max={10}
        onChange={(ccp) => set({ ccp })}
      />

      <Field label="Bảo quản & phần dư" hint="Giữ được bao lâu, ở đâu, và phần thừa cuối ca đi đâu.">
        <TextArea
          value={draft.storage ?? ''}
          onChange={(v) => set({ storage: v || null })}
          rows={3}
          placeholder="Lát đã thái không lưu qua ca. Khối đã lóc: 3 ngày ở 0–2°C, xuất theo FEFO."
          disabled={disabled}
        />
      </Field>
    </Block>
  )
}

function Craft({
  draft,
  disabled,
  dishes,
  onChange,
}: {
  draft: Draft
  disabled: boolean
  dishes: { id: string; nameVi: string }[]
  onChange: (next: Draft) => void
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })

  return (
    <Block title="Mẹo, lỗi thường gặp & món thay thế">
      <LineList
        label="Mẹo của bếp trưởng"
        placeholder="Dao lạnh cắt ngọt hơn — ngâm khay đá, lau khô trước mỗi khối"
        value={draft.tips}
        disabled={disabled}
        max={12}
        onChange={(tips) => set({ tips })}
      />

      <RecordList<RecipePitfall>
        label="Lỗi thường gặp"
        hint="Khối có giá trị nhất lúc đào tạo người mới — viết lỗi thật đã xảy ra, không viết lỗi giả định."
        columns={[
          { key: 'mistake', label: 'Lỗi', placeholder: 'Thái dọc thớ', grow: 1 },
          { key: 'effect', label: 'Hậu quả', placeholder: 'Dai, mất cảm giác tan', grow: 1 },
          { key: 'fix', label: 'Cách sửa', placeholder: 'Xoay khối, dao vuông góc sợi thịt', grow: 1 },
        ]}
        blank={{ mistake: '', effect: '', fix: '' }}
        value={draft.pitfalls}
        disabled={disabled}
        max={12}
        onChange={(pitfalls) => set({ pitfalls })}
      />

      {/* Chọn bằng ô thả xuống chứ không đổ cả thực đơn ra thành chip: 78 món
          bày hết ra màn hình thì việc tìm một món khó hơn là tự nhớ tên nó */}
      <div>
        <ListHead
          label="Món mời thay khi hết hàng"
          hint="Phục vụ báo bàn TRƯỚC khi đổi, không tự thay. Tối đa 6 món."
        />
        <div className="flex flex-wrap items-center gap-2">
          {draft.substituteIds.map((id) => (
            <Toggle
              key={id}
              on
              disabled={disabled}
              onChange={() =>
                set({ substituteIds: draft.substituteIds.filter((other) => other !== id) })
              }
            >
              {dishes.find((d) => d.id === id)?.nameVi ?? id} ✕
            </Toggle>
          ))}
          {draft.substituteIds.length === 0 ? (
            <span className="text-[length:var(--fs-c1)] text-ink-mute">Chưa chọn món nào.</span>
          ) : null}
        </div>
        {!disabled && draft.substituteIds.length < 6 ? (
          <div className="mt-2">
            <Select
              value=""
              onChange={(id) => id && set({ substituteIds: [...draft.substituteIds, id] })}
              options={dishes
                .filter((d) => !draft.substituteIds.includes(d.id))
                .map((d) => ({ value: d.id, label: d.nameVi }))}
              placeholder="Thêm món thay thế…"
              width={280}
            />
          </div>
        ) : null}
      </div>
    </Block>
  )
}
