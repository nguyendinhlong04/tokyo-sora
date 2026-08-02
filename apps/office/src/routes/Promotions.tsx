import { formatVnd } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  api,
  type Approval,
  type PromotionInput,
  type PromotionKind,
  type PromotionRow,
  type PromotionState,
} from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * B11 — Khuyến mãi & voucher.
 *
 * Màn này là câu trả lời cho một tính năng chết: P10 có ô nhập voucher từ ngày
 * đầu mà cả hệ thống không có chỗ nào TẠO ra voucher (§G.1).
 *
 * Hai điều màn hình phải nói rõ, vì người dùng sẽ không đọc tài liệu:
 *   · **Soạn không phải là bật.** Marketing soạn xong thì chương trình nằm ở
 *     trạng thái *Nháp*; bật lên là đụng giá bán nên cần R11/R10 duyệt bằng PIN.
 *   · **Khuyến mãi không cộng dồn.** Một đơn hưởng đúng một chương trình — cái
 *     lợi nhất cho khách. Câu này in ngay dưới đầu trang chứ không giấu trong
 *     tài liệu, vì nó là thứ quyết định người soạn có xếp chồng chương trình hay không.
 */

const KIND_LABELS: Record<PromotionKind, string> = {
  percent: 'Giảm phần trăm',
  amount: 'Giảm số tiền',
  free_dish: 'Tặng món',
  set_price: 'Giá set khung giờ',
}

const STATE_LABELS: Record<PromotionState, string> = {
  draft: 'Nháp',
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  ended: 'Đã kết thúc',
}

const STATE_TONES: Record<PromotionState, 'neutral' | 'accent' | 'warn'> = {
  draft: 'neutral',
  active: 'accent',
  paused: 'warn',
  ended: 'neutral',
}

const CHANNELS = [
  { id: 'table', label: 'Tại bàn' },
  { id: 'pos', label: 'Quầy' },
  { id: 'web', label: 'Web' },
  { id: 'grab', label: 'Grab' },
  { id: 'shopee', label: 'ShopeeFood' },
  { id: 'be', label: 'Be' },
]

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const today = () => new Date().toISOString().slice(0, 10)

const blank = (): PromotionInput => ({
  code: '',
  name: '',
  kind: 'percent',
  percentBp: 1000,
  amountVnd: null,
  targetDishId: null,
  setPriceVnd: null,
  maxDiscountVnd: null,
  channels: [],
  branchIds: [],
  weekdays: [],
  fromMinute: null,
  toMinute: null,
  minOrderVnd: 0,
  requiresVoucher: false,
  startsOn: today(),
  endsOn: today(),
})

export function Promotions() {
  const { can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ input: PromotionInput; id?: number } | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const mayCompose = can('promo.compose')
  const promotions = useQuery({ queryKey: ['promotions'], queryFn: api.promotions })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['promotions'] })

  const save = useMutation({
    mutationFn: ({ input, id }: { input: PromotionInput; id?: number }) =>
      api.savePromotion(input, id),
    onSuccess: () => {
      toast('Đã lưu chương trình — vẫn ở trạng thái Nháp cho tới khi bật', 'ok')
      setDraft(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = promotions.data ?? []

  return (
    <>
      <PageHeader
        title="Khuyến mãi & voucher"
        subtitle="Nơi tạo chương trình cho ô voucher ở quầy. Một đơn chỉ hưởng MỘT chương trình — hệ thống tự áp mức lợi nhất cho khách, không cộng dồn."
        action={
          draft || !mayCompose ? null : (
            <Button variant="primary" onClick={() => setDraft({ input: blank() })}>
              Soạn chương trình
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {promotions.isError ? (
          <ErrorState message={(promotions.error as Error).message} />
        ) : null}

        {draft ? (
          <PromotionForm
            draft={draft.input}
            onChange={(input) => setDraft({ ...draft, input })}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        <div className="mt-5 flex flex-col gap-3">
          {promotions.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">
              Chưa có chương trình nào. Ô nhập voucher ở quầy sẽ từ chối mọi mã cho tới khi có ít
              nhất một chương trình đang chạy.
            </p>
          ) : (
            rows.map((promo) => (
              <PromotionCard
                key={promo.id}
                promo={promo}
                mayCompose={mayCompose}
                open={open === promo.id}
                onToggle={() => setOpen(open === promo.id ? null : promo.id)}
                onEdit={() => setDraft({ input: toInput(promo), id: promo.id })}
                onChanged={refresh}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function toInput(row: PromotionRow): PromotionInput {
  return {
    code: row.code,
    name: row.name,
    kind: row.kind,
    percentBp: row.percentBp,
    amountVnd: row.amountVnd,
    targetDishId: row.targetDishId,
    setPriceVnd: row.setPriceVnd,
    maxDiscountVnd: row.maxDiscountVnd,
    channels: row.channels,
    branchIds: row.branchIds,
    weekdays: row.weekdays,
    fromMinute: row.fromMinute,
    toMinute: row.toMinute,
    minOrderVnd: row.minOrderVnd,
    requiresVoucher: row.requiresVoucher,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
  }
}

function valueOf(promo: PromotionRow): string {
  switch (promo.kind) {
    case 'percent':
      return `${((promo.percentBp ?? 0) / 100).toLocaleString('vi-VN')}%`
    case 'amount':
      return formatVnd(promo.amountVnd ?? 0)
    case 'free_dish':
      return `Tặng ${promo.targetDishName ?? promo.targetDishId ?? '—'}`
    case 'set_price':
      return `${promo.targetDishName ?? promo.targetDishId ?? '—'} còn ${formatVnd(promo.setPriceVnd ?? 0)}`
  }
}

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

function PromotionCard({
  promo,
  mayCompose,
  open,
  onToggle,
  onEdit,
  onChanged,
}: {
  promo: PromotionRow
  mayCompose: boolean
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onChanged: () => void
}) {
  const { can } = useSession()
  const toast = useToast()
  const [pending, setPending] = useState<'active' | 'paused' | 'ended' | null>(null)

  /** R9 chỉ ở mức △ với `promo.activate` nên BẬT phải kèm PIN; dừng thì không */
  const needsPin = !can('promo.activate')

  const setState = async (state: 'active' | 'paused' | 'ended', approval?: Approval | null) => {
    try {
      await api.setPromotionState(promo.id, state, approval)
      toast(state === 'active' ? 'Chương trình đã chạy' : 'Đã đổi trạng thái', 'ok')
      setPending(null)
      onChanged()
    } catch (err) {
      toast((err as Error).message, 'danger')
    }
  }

  return (
    <section className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
      <div className="grid grid-cols-[1fr_170px_150px_130px_190px] items-center gap-3 px-5 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">{promo.name}</span>
          <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {promo.code} · {formatDay(promo.startsOn)} – {formatDay(promo.endsOn)}
          </span>
        </span>

        <span className="text-[length:var(--fs-c1)] text-ink-body">
          {valueOf(promo)}
          <span className="mt-0.5 block text-ink-mute">{KIND_LABELS[promo.kind]}</span>
        </span>

        <span className="text-[length:var(--fs-c1)] text-ink-mute">
          {promo.uses} lượt
          {promo.uses > 0 ? (
            <span className="mt-0.5 block font-mono text-ink-body">
              −{formatVnd(promo.discountVnd)}
            </span>
          ) : null}
        </span>

        <span>
          <Badge tone={STATE_TONES[promo.state]}>{STATE_LABELS[promo.state]}</Badge>
          {promo.requiresVoucher ? (
            <span className="mt-1 block text-[length:var(--fs-c2)] text-ink-mute">
              {promo.voucherLive}/{promo.voucherCount} mã còn lượt
            </span>
          ) : null}
        </span>

        <span className="flex justify-end gap-2">
          {mayCompose && promo.state !== 'active' && promo.state !== 'ended' ? (
            <SmallButton onClick={onEdit}>Sửa</SmallButton>
          ) : null}
          {mayCompose && promo.state !== 'ended' ? (
            promo.state === 'active' ? (
              <SmallButton onClick={() => void setState('paused')}>Tạm dừng</SmallButton>
            ) : (
              <SmallButton
                accent
                onClick={() => (needsPin ? setPending('active') : void setState('active'))}
              >
                Bật
              </SmallButton>
            )
          ) : null}
          <SmallButton onClick={onToggle}>{open ? 'Thu' : 'Chi tiết'}</SmallButton>
        </span>
      </div>

      {pending === 'active' ? (
        <ApprovalBar
          note="Bật chương trình là đụng giá bán — cần PIN của quản lý chuỗi hoặc chủ quán."
          onCancel={() => setPending(null)}
          onConfirm={(approval) => void setState('active', approval)}
        />
      ) : null}

      {open ? (
        <PromotionDetail promo={promo} mayCompose={mayCompose} onChanged={onChanged} />
      ) : null}
    </section>
  )
}

function PromotionDetail({
  promo,
  mayCompose,
  onChanged,
}: {
  promo: PromotionRow
  mayCompose: boolean
  onChanged: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [batch, setBatch] = useState({ prefix: promo.code, count: 20, maxUses: 1 })

  const vouchers = useQuery({
    queryKey: ['promo-vouchers', promo.id],
    queryFn: () => api.promoVouchers(promo.id),
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['promo-vouchers', promo.id] })
    onChanged()
  }

  const conditions = [
    promo.channels.length > 0
      ? `Kênh: ${promo.channels.map((c) => CHANNELS.find((x) => x.id === c)?.label ?? c).join(' · ')}`
      : 'Mọi kênh',
    promo.branchIds.length > 0 ? `Chi nhánh: ${promo.branchIds.join(' · ')}` : 'Mọi chi nhánh',
    promo.weekdays.length > 0
      ? `Thứ: ${promo.weekdays.map((d) => WEEKDAYS[d]).join(' · ')}`
      : 'Mọi ngày trong tuần',
    promo.fromMinute !== null && promo.toMinute !== null
      ? `Khung giờ ${hhmm(promo.fromMinute)}–${hhmm(promo.toMinute)}`
      : 'Cả ngày',
    promo.minOrderVnd > 0 ? `Đơn tối thiểu ${formatVnd(promo.minOrderVnd)}` : 'Không có đơn tối thiểu',
    promo.maxDiscountVnd ? `Trần giảm ${formatVnd(promo.maxDiscountVnd)}` : 'Không có trần giảm',
  ]

  return (
    <div className="border-t border-line-1 bg-canvas px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Điều kiện áp dụng
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {conditions.map((line) => (
          <li key={line} className="text-[length:var(--fs-c1)] text-ink-body">
            {line}
          </li>
        ))}
      </ul>

      {promo.activatedAt ? (
        <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
          Bật lúc {new Date(promo.activatedAt).toLocaleString('vi-VN')}
          {promo.activatedBy ? ` · ${promo.activatedBy}` : ''}
        </p>
      ) : null}

      <p className="mt-5 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Lô mã voucher
      </p>

      {!promo.requiresVoucher ? (
        <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
          Chương trình này áp tự động, không cần mã. Bật ô <em>bắt buộc có mã</em> ở phần soạn nếu
          muốn phát mã.
        </p>
      ) : vouchers.isPending ? (
        <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">Đang tải…</p>
      ) : (vouchers.data ?? []).length === 0 ? (
        <p className="mt-2 text-[length:var(--fs-c1)] text-warn">
          Chưa phát mã nào — chương trình cần mã mà không có mã thì khách gõ gì cũng trượt.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {(vouchers.data ?? []).map((code) => {
            const spent = code.usedCount >= code.maxUses
            return (
              <span
                key={code.id}
                className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[length:var(--fs-c1)] ${
                  code.state === 'void'
                    ? 'border-line-3 text-line-4 line-through'
                    : spent
                      ? 'border-line-3 text-ink-mute'
                      : 'border-accent text-accent-ink'
                }`}
              >
                {code.code}
                <span className="text-ink-mute">
                  {code.usedCount}/{code.maxUses}
                </span>
                {mayCompose && code.state === 'live' ? (
                  <button
                    type="button"
                    onClick={() =>
                      api
                        .voidVoucher(code.id)
                        .then(() => {
                          toast('Đã huỷ mã', 'ok')
                          refresh()
                        })
                        .catch((err: Error) => toast(err.message, 'danger'))
                    }
                    className="text-danger"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            )
          })}
        </div>
      )}

      {mayCompose && promo.requiresVoucher ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line-1 pt-4">
          <Field label="Tiền tố mã">
            <input
              value={batch.prefix}
              onChange={(e) => setBatch({ ...batch, prefix: e.target.value.toUpperCase() })}
              className="h-9 w-[160px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </Field>
          <Field label="Số mã">
            <input
              type="number"
              value={batch.count}
              onChange={(e) => setBatch({ ...batch, count: Number(e.target.value) || 1 })}
              className="h-9 w-[100px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </Field>
          <Field label="Lượt mỗi mã">
            <input
              type="number"
              value={batch.maxUses}
              onChange={(e) => setBatch({ ...batch, maxUses: Number(e.target.value) || 1 })}
              className="h-9 w-[110px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </Field>
          <Button
            onClick={() =>
              api
                .issueVouchers({ promotionId: promo.id, ...batch, expiresOn: null })
                .then(() => {
                  toast(`Đã phát ${batch.count} mã`, 'ok')
                  refresh()
                })
                .catch((err: Error) => toast(err.message, 'danger'))
            }
          >
            Phát lô
          </Button>
          <p className="w-full text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Mã đánh số theo thứ tự để khách đọc được qua điện thoại — đổi lại là mã đoán được, nên
            chương trình nào sợ bị đoán thì đặt lượt mỗi mã thấp.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function PromotionForm({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: PromotionInput
  onChange: (next: PromotionInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof PromotionInput>(key: K, value: PromotionInput[K]) =>
    onChange({ ...draft, [key]: value })

  const toggle = (key: 'channels' | 'branchIds', id: string) =>
    set(
      key,
      draft[key].includes(id) ? draft[key].filter((x) => x !== id) : [...draft[key], id],
    )

  const ready = draft.code.trim() !== '' && draft.name.trim() !== ''
  const hasWindow = draft.fromMinute !== null

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Mã chương trình">
          <Input value={draft.code} onChange={(v) => set('code', v.toUpperCase())} placeholder="KM-TRUA" mono />
        </Field>
        <Field label="Tên">
          <Input value={draft.name} onChange={(v) => set('name', v)} placeholder="Giảm 10% giờ trưa" />
        </Field>
        <Field label="Loại">
          <select
            value={draft.kind}
            onChange={(e) => onChange(switchKind(draft, e.target.value as PromotionKind))}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            {(Object.keys(KIND_LABELS) as PromotionKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>

        {draft.kind === 'percent' ? (
          <Field label="Giảm (%)">
            <Input
              type="number"
              value={String((draft.percentBp ?? 0) / 100)}
              onChange={(v) => set('percentBp', Math.round((Number(v) || 0) * 100))}
              mono
            />
          </Field>
        ) : null}
        {draft.kind === 'amount' ? (
          <Field label="Giảm (₫)">
            <Input
              type="number"
              value={String(draft.amountVnd ?? '')}
              onChange={(v) => set('amountVnd', Number(v) || null)}
              mono
            />
          </Field>
        ) : null}
        {draft.kind === 'free_dish' || draft.kind === 'set_price' ? (
          <Field label="Mã món áp dụng">
            <Input
              value={draft.targetDishId ?? ''}
              onChange={(v) => set('targetDishId', v || null)}
              placeholder="bachibo"
              mono
            />
          </Field>
        ) : null}
        {draft.kind === 'set_price' ? (
          <Field label="Giá trong khung giờ (₫)">
            <Input
              type="number"
              value={String(draft.setPriceVnd ?? '')}
              onChange={(v) => set('setPriceVnd', Number(v) || 0)}
              mono
            />
          </Field>
        ) : null}

        <Field label="Từ ngày">
          <Input type="date" value={draft.startsOn} onChange={(v) => set('startsOn', v)} mono />
        </Field>
        <Field label="Đến ngày">
          <Input type="date" value={draft.endsOn} onChange={(v) => set('endsOn', v)} mono />
        </Field>
        <Field label="Đơn tối thiểu (₫)">
          <Input
            type="number"
            value={String(draft.minOrderVnd)}
            onChange={(v) => set('minOrderVnd', Number(v) || 0)}
            mono
          />
        </Field>
        <Field label="Trần giảm (₫)">
          <Input
            type="number"
            value={String(draft.maxDiscountVnd ?? '')}
            onChange={(v) => set('maxDiscountVnd', Number(v) || null)}
            mono
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Field label="Kênh áp dụng (không chọn = mọi kênh)">
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((channel) => (
              <Chip
                key={channel.id}
                on={draft.channels.includes(channel.id)}
                onClick={() => toggle('channels', channel.id)}
              >
                {channel.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Thứ trong tuần (không chọn = mọi ngày)">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((label, index) => (
              <Chip
                key={label}
                on={draft.weekdays.includes(index)}
                onClick={() =>
                  set(
                    'weekdays',
                    draft.weekdays.includes(index)
                      ? draft.weekdays.filter((d) => d !== index)
                      : [...draft.weekdays, index],
                  )
                }
              >
                {label}
              </Chip>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <Chip
          on={hasWindow}
          onClick={() =>
            hasWindow
              ? onChange({ ...draft, fromMinute: null, toMinute: null })
              : onChange({ ...draft, fromMinute: 11 * 60, toMinute: 14 * 60 })
          }
        >
          Chỉ trong khung giờ
        </Chip>
        {hasWindow ? (
          <>
            <Field label="Từ">
              <Input
                type="time"
                value={hhmm(draft.fromMinute ?? 0)}
                onChange={(v) => set('fromMinute', toMinutes(v))}
                mono
              />
            </Field>
            <Field label="Đến">
              <Input
                type="time"
                value={hhmm(draft.toMinute ?? 0)}
                onChange={(v) => set('toMinute', toMinutes(v))}
                mono
              />
            </Field>
          </>
        ) : null}

        <Chip on={draft.requiresVoucher} onClick={() => set('requiresVoucher', !draft.requiresVoucher)}>
          Bắt buộc có mã voucher
        </Chip>

        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button variant="primary" disabled={!ready || saving} onClick={onSave}>
            Lưu bản nháp
          </Button>
        </div>
      </div>

      <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Lưu xong chương trình ở trạng thái <strong>Nháp</strong> — chưa ảnh hưởng đồng nào. Bật lên
        là việc riêng, và cần quản lý chuỗi hoặc chủ quán duyệt.
      </p>
    </section>
  )
}

/** Đổi loại thì XOÁ con số của loại cũ, tránh gửi lên hai con số cho một chương trình */
function switchKind(draft: PromotionInput, kind: PromotionKind): PromotionInput {
  return {
    ...draft,
    kind,
    percentBp: kind === 'percent' ? (draft.percentBp ?? 1000) : null,
    amountVnd: kind === 'amount' ? (draft.amountVnd ?? 50_000) : null,
    targetDishId: kind === 'free_dish' || kind === 'set_price' ? draft.targetDishId : null,
    setPriceVnd: kind === 'set_price' ? (draft.setPriceVnd ?? 0) : null,
  }
}

const toMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function ApprovalBar({
  note,
  onCancel,
  onConfirm,
}: {
  note: string
  onCancel: () => void
  onConfirm: (approval: Approval) => void
}) {
  const [form, setForm] = useState({ approverStaffId: '', approverPin: '', reason: '' })
  const ready = form.approverStaffId && form.approverPin.length >= 4 && form.reason.trim()

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-accent bg-canvas px-5 py-4">
      <p className="w-full text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">{note}</p>
      <Field label="Mã nhân viên duyệt">
        <Input
          type="number"
          value={form.approverStaffId}
          onChange={(v) => setForm({ ...form, approverStaffId: v })}
          mono
        />
      </Field>
      <Field label="PIN">
        <Input
          type="password"
          value={form.approverPin}
          onChange={(v) => setForm({ ...form, approverPin: v })}
          mono
        />
      </Field>
      <Field label="Lý do">
        <Input value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} />
      </Field>
      <Button onClick={onCancel}>Bỏ</Button>
      <Button
        variant="primary"
        disabled={!ready}
        onClick={() =>
          onConfirm({
            approverStaffId: Number(form.approverStaffId),
            approverPin: form.approverPin,
            reason: form.reason.trim(),
          })
        }
      >
        Duyệt & bật
      </Button>
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
        on ? 'border-accent text-accent-ink' : 'border-line-3 text-ink-mute hover:text-ink-hi'
      }`}
    >
      {children}
    </button>
  )
}

function SmallButton({
  onClick,
  accent,
  children,
}: {
  onClick: () => void
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-sm border px-2 text-[length:var(--fs-c1)] hover:bg-surface-3 ${
        accent ? 'border-accent text-accent-ink' : 'border-line-3 text-ink-body'
      }`}
    >
      {children}
    </button>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  mono = false,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  type?: string
  mono?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}
