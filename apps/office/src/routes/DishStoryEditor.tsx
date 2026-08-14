import { Button } from '@sora/ui'
import type { DishRow, DishStory, DishStoryCondiment, DishStoryCut } from '../api'
import { Field, LineList, ListHead, NumberInput, Select, TextArea, TextInput } from '../components/form'

/** Chưa kể gì cả — mọi ô trống, trang web dựng bản gọn từ tên, giá, mô tả */
export const BLANK_STORY: DishStory = {
  chapterNo: null,
  portionLabel: null,
  nameJaFull: null,
  intro: null,
  note: null,
  craft: null,
  footerImageUrl: null,
  bannerJa: null,
  bannerVi: null,
  closing: null,
  pairingDishIds: null,
  origin: null,
  originKanji: null,
  originImageUrl: null,
  flavours: null,
  cutsLabel: null,
  cuts: null,
  fire: null,
  fireImageUrl: null,
  dip: null,
  dipImageUrl: null,
  condiments: null,
  serves: null,
  duration: null,
  flow: null,
  extraDishIds: null,
}

/** Người nhập chọn nhãn thay vì gõ, để hai món hải sản không thành hai cách gọi */
const CUTS_LABELS = [
  { value: 'Lựa chọn độ cắt', label: 'Lựa chọn độ cắt — thịt thái lát' },
  { value: 'Cách sơ chế', label: 'Cách sơ chế — hải sản, rau, nấm' },
]

/**
 * Nội dung trang chi tiết món trên web (W3).
 *
 * Đây là những gì khách đọc ở /thuc-don/{mã}: chương mục, phần thịt, hương vị,
 * độ cắt, gia vị, lưu ý của bếp. Trước bản này chúng nằm cứng trong mã nguồn
 * web nên sửa một chữ phải deploy lại; giờ nhập ở đây và về trang trong ≤ 60
 * giây như mọi thay đổi thực đơn khác.
 *
 * BỎ TRỐNG LÀ HỢP LỆ ở mọi ô. Trang web lùi dần: không có khối nào thì không vẽ
 * khối đó, không có gì cả thì dựng bản gọn. Nhờ vậy không ai phải điền cho đủ
 * hai mươi ô mới lưu được một dòng lưu ý.
 */
export function StoryEditor({
  story,
  kind,
  dishId,
  dishes,
  disabled,
  onChange,
}: {
  story: DishStory
  kind: DishRow['kind']
  dishId: string
  dishes: DishRow[]
  disabled: boolean
  onChange: (next: DishStory) => void
}) {
  const set = (patch: Partial<DishStory>) => onChange({ ...story, ...patch })
  /** Ô rỗng lưu thành null chứ không thành chuỗi rỗng — CSDL chỉ có một cách nói "chưa có" */
  const text = (key: keyof DishStory) => ({
    value: (story[key] as string | null) ?? '',
    onChange: (v: string) => set({ [key]: v || null } as Partial<DishStory>),
    disabled,
  })
  const isSet = kind === 'set'

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Số chương" hint="In trong ô kim cương vàng: 01, 02… — set thì I, II, III">
          <TextInput {...text('chapterNo')} placeholder="01" />
        </Field>
        <Field label="Quy cách một phần" hint={isSet ? '8 món · 12 món' : '100g · 3 con · 1 phần'}>
          <TextInput {...text('portionLabel')} placeholder={isSet ? '8 món' : '100g'} />
        </Field>
        <Field
          label="Tên tiếng Nhật đầy đủ"
          hint="Dài hơn tên tiếng Nhật ở khối Định danh, có cả phần thịt trong ngoặc"
          className="lg:col-span-2"
        >
          <TextInput {...text('nameJaFull')} placeholder="牛バラ（三枚肉）" />
        </Field>
      </div>

      <Field
        label="Lời dẫn"
        hint="Đoạn mở đầu dưới tên món. Bỏ trống thì trang dùng Mô tả dài ở khối Trình bày."
      >
        <TextArea {...text('intro')} rows={3} />
      </Field>

      {isSet ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Dành cho">
              <TextInput {...text('serves')} placeholder="2 người" />
            </Field>
            <Field label="Thời lượng">
              <TextInput {...text('duration')} placeholder="90 phút" />
            </Field>
          </div>

          <LineList
            label="Bữa diễn ra theo thứ tự"
            hint="Set nấu theo nhịp — mỗi dòng là một chặng khách sẽ thấy dọn ra"
            placeholder="Dưa muối lên trước khi than đỏ"
            value={story.flow ?? []}
            disabled={disabled}
            max={8}
            empty="Chưa có dòng nào — trang web bỏ qua khối này."
            onChange={(flow) => set({ flow: flow.length > 0 ? flow : null })}
          />

          <DishPickList
            label="Gọi thêm cho vừa miệng"
            hint="Món gợi ý trên panel kraft cuối trang"
            value={story.extraDishIds}
            dishes={dishes}
            exclude={dishId}
            disabled={disabled}
            onChange={(extraDishIds) => set({ extraDishIds })}
          />
        </>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Vị trí phần thịt" className="lg:col-span-2">
              <TextInput {...text('origin')} placeholder="Bụng dưới, giữa sườn và da" />
            </Field>
            <Field label="Chữ Nhật viết dọc" hint="Nằm dọc cạnh ảnh lớn: 三枚肉">
              <TextInput {...text('originKanji')} placeholder="三枚肉" />
            </Field>
            <Field label="Ảnh vị trí phần thịt" hint="Bỏ trống thì vẽ ô chữ">
              <TextInput {...text('originImageUrl')} placeholder="/anh/bachi-vitri.jpg" />
            </Field>
          </div>

          <LineList
            label="Hương vị"
            hint="Bốn dòng là vừa khối — mỗi dòng được gắn một chữ Nhật 旨 · 甘 · 香 · 合"
            placeholder="Vân mỡ đan dày, tan ngay trên than"
            value={story.flavours ?? []}
            disabled={disabled}
            max={8}
            empty="Chưa có dòng nào — trang web bỏ qua khối này."
            onChange={(flavours) => set({ flavours: flavours.length > 0 ? flavours : null })}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Cách nướng">
              <TextInput {...text('fire')} placeholder="Nướng 20–30 giây mỗi mặt trên than hồng" />
            </Field>
            <Field label="Ảnh cách nướng">
              <TextInput {...text('fireImageUrl')} placeholder="/anh/than.jpg" />
            </Field>
            <Field label="Cách chấm">
              <TextInput {...text('dip')} placeholder="Chấm Tare hoặc muối tiêu chanh khi còn nóng" />
            </Field>
            <Field label="Ảnh cách chấm">
              <TextInput {...text('dipImageUrl')} placeholder="/anh/tare.jpg" />
            </Field>
          </div>

          <div>
            <Field label="Nhãn khối độ cắt">
              <Select
                value={(story.cutsLabel ?? '') as string}
                onChange={(v) => set({ cutsLabel: v || null })}
                options={CUTS_LABELS}
                placeholder="— chưa chọn —"
                disabled={disabled}
              />
            </Field>
            <CutList
              value={story.cuts}
              disabled={disabled}
              onChange={(cuts) => set({ cuts })}
            />
          </div>

          <CondimentList
            value={story.condiments}
            disabled={disabled}
            onChange={(condiments) => set({ condiments })}
          />
        </>
      )}

      <DishPickList
        label="Món dùng kèm"
        hint="Bếp chọn tay. Bỏ trống thì trang tự bù bằng đồ uống và món lạnh."
        value={story.pairingDishIds}
        dishes={dishes}
        exclude={dishId}
        disabled={disabled}
        onChange={(pairingDishIds) => set({ pairingDishIds })}
      />

      <Field label="Lưu ý của bếp" hint="Khối viền đỏ — điều khách dễ làm sai khi nướng">
        <TextArea {...text('note')} rows={2} />
      </Field>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Dải chân trang" className="lg:col-span-2">
          <TextInput {...text('craft')} placeholder="Sơ chế kỹ lưỡng · Thái máy chuyên dụng" />
        </Field>
        <Field label="Khẩu hiệu tiếng Nhật">
          <TextInput {...text('bannerJa')} placeholder="焼いてうまい！" />
        </Field>
        <Field label="Khẩu hiệu tiếng Việt">
          <TextInput {...text('bannerVi')} placeholder="NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý" />
        </Field>
        <Field label="Ảnh dải chân trang">
          <TextInput {...text('footerImageUrl')} placeholder="/anh/lua.jpg" />
        </Field>
        <Field label="Câu kết" hint="In nghiêng, khép lại trang">
          <TextInput {...text('closing')} placeholder="Thưởng thức từng lát…" />
        </Field>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ khối lặp

/** Các độ cắt: mỗi cột trên trang là một thẻ có tên, quy cách, mô tả, thanh đo độ mềm */
function CutList({
  value,
  disabled,
  onChange,
}: {
  value: DishStoryCut[] | null
  disabled: boolean
  onChange: (next: DishStoryCut[] | null) => void
}) {
  const rows = value ?? []
  const put = (next: DishStoryCut[]) => onChange(next.length > 0 ? next : null)
  const patch = (index: number, next: Partial<DishStoryCut>) =>
    put(rows.map((r, i) => (i === index ? { ...r, ...next } : r)))

  return (
    <div className="mt-4">
      <ListHead label="Các độ cắt" hint="Trang xếp thành ba cột — quá ba thì cột hẹp lại">
        <Button
          size="sm"
          disabled={disabled || rows.length >= 6}
          onClick={() =>
            put([...rows, { name: '', size: '', desc: '', soft: 3, imageUrl: null }])
          }
        >
          + Thêm độ cắt
        </Button>
      </ListHead>
      <div className="grid gap-3">
        {rows.map((cut, index) => (
          <div key={index} className="rounded-sm border border-line-1 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                value={cut.name}
                disabled={disabled}
                placeholder="Lát mỏng"
                width={150}
                onChange={(v) => patch(index, { name: v })}
              />
              <TextInput
                value={cut.size}
                disabled={disabled}
                placeholder="15–18 lát"
                width={130}
                mono
                onChange={(v) => patch(index, { size: v })}
              />
              <label className="flex items-center gap-2 text-[length:var(--fs-c1)] text-ink-mute">
                Độ mềm
                <NumberInput
                  value={cut.soft}
                  disabled={disabled}
                  min={1}
                  max={4}
                  width={60}
                  onChange={(v) => patch(index, { soft: v ?? 1 })}
                />
              </label>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                className="ml-auto"
                onClick={() => put(rows.filter((_, i) => i !== index))}
              >
                Bỏ
              </Button>
            </div>
            <div className="mt-2 grid gap-2">
              <TextInput
                value={cut.desc}
                disabled={disabled}
                placeholder="Chín trong vài giây, mỡ tan hết, thơm nhẹ."
                onChange={(v) => patch(index, { desc: v })}
              />
              <TextInput
                value={cut.imageUrl ?? ''}
                disabled={disabled}
                placeholder="Ảnh riêng của độ cắt này — bỏ trống thì dùng ảnh món"
                onChange={(v) => patch(index, { imageUrl: v || null })}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-[length:var(--fs-c1)] text-ink-mute">
            Chưa có độ cắt nào — trang web bỏ qua khối này.
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Gợi ý thưởng thức: vòng tròn chữ Nhật, tên gia vị, một dòng giải thích */
function CondimentList({
  value,
  disabled,
  onChange,
}: {
  value: DishStoryCondiment[] | null
  disabled: boolean
  onChange: (next: DishStoryCondiment[] | null) => void
}) {
  const rows = value ?? []
  const put = (next: DishStoryCondiment[]) => onChange(next.length > 0 ? next : null)
  const patch = (index: number, next: Partial<DishStoryCondiment>) =>
    put(rows.map((r, i) => (i === index ? { ...r, ...next } : r)))

  return (
    <div>
      <ListHead label="Gợi ý thưởng thức" hint="Trang xếp bốn ô một hàng trên nền giấy kraft">
        <Button
          size="sm"
          disabled={disabled || rows.length >= 8}
          onClick={() => put([...rows, { kanji: '', name: '', desc: '' }])}
        >
          + Thêm gia vị
        </Button>
      </ListHead>
      <div className="grid gap-2">
        {rows.map((cond, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <TextInput
              value={cond.kanji}
              disabled={disabled}
              placeholder="塩"
              width={56}
              className="text-center font-jp"
              onChange={(v) => patch(index, { kanji: v })}
            />
            <TextInput
              value={cond.name}
              disabled={disabled}
              placeholder="Muối tiêu chanh"
              width={170}
              onChange={(v) => patch(index, { name: v })}
            />
            <TextInput
              value={cond.desc}
              disabled={disabled}
              placeholder="Thanh nhẹ, tôn vị ngọt của mỡ"
              onChange={(v) => patch(index, { desc: v })}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => put(rows.filter((_, i) => i !== index))}
            >
              Bỏ
            </Button>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-[length:var(--fs-c1)] text-ink-mute">
            Chưa có gia vị nào — trang web bỏ qua khối này.
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Chọn món theo mã.
 *
 * Chọn từ danh sách chứ không gõ mã: mã gõ sai ở đây thành một ô trống lặng lẽ
 * trên trang web, không ai nhận ra cho tới khi khách hỏi.
 */
function DishPickList({
  label,
  hint,
  value,
  dishes,
  exclude,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  value: string[] | null
  dishes: DishRow[]
  exclude: string
  disabled: boolean
  onChange: (next: string[] | null) => void
}) {
  const rows = value ?? []
  const put = (next: string[]) => onChange(next.length > 0 ? next : null)
  const options = dishes
    .filter((d) => d.id !== exclude)
    .map((d) => ({ value: d.id, label: `${d.nameVi} · ${d.id}` }))

  return (
    <div>
      <ListHead label={label} hint={hint}>
        <Button
          size="sm"
          disabled={disabled || options.length === 0 || rows.length >= 6}
          onClick={() => put([...rows, options.find((o) => !rows.includes(o.value))?.value ?? ''])}
        >
          + Thêm món
        </Button>
      </ListHead>
      <div className="grid gap-2">
        {rows.map((id, index) => (
          <div key={index} className="flex items-center gap-2">
            <Select
              value={id}
              disabled={disabled}
              options={options}
              placeholder="— chưa chọn —"
              onChange={(v) => put(rows.map((r, i) => (i === index ? v : r)))}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => put(rows.filter((_, i) => i !== index))}
            >
              Bỏ
            </Button>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-[length:var(--fs-c1)] text-ink-mute">Chưa chọn món nào.</p>
        ) : null}
      </div>
    </div>
  )
}
