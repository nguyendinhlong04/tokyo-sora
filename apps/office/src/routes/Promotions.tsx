import {
  badgeOf,
  formatVnd,
  KINDS_BY_SCOPE,
  LEGAL_MAX_DISCOUNT_RATE,
  percentLabel,
  priceBill,
  unitDiscountOf,
  type PromotionRule,
} from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import {
  api,
  type Approval,
  type DishRow,
  type PromotionInput,
  type PromotionKind,
  type PromotionRow,
  type PromotionScope,
  type PromotionState,
} from '../api'
import { PageHeader } from '../components/PageHeader'
import {
  DateInput,
  Field,
  NumberInput,
  SegmentedControl,
  Select,
  TextInput as Input,
  Toggle,
} from '../components/form'
import { formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * B11 — Khuyến mãi & voucher, áp CHUNG cho mọi kênh (§9.6).
 *
 * Một chương trình soạn ở đây chạy y hệt trên iPad tại bàn, ở quầy và trên web:
 * máy chủ ghi tiền giảm thẳng vào đơn, app chỉ in lại. Màn hình phải nói rõ bốn
 * điều, vì người soạn sẽ không đọc tài liệu:
 *   · **Áp cho món hay cho hoá đơn.** Chương trình món (giảm %, giảm tiền, đồng
 *     giá, mua N tặng M) hiện giá giảm trên thẻ món và chốt lúc gọi; chương trình
 *     hoá đơn (giảm %, giảm tiền, tặng món) tính lại mỗi lần đơn đổi.
 *   · **Không cộng dồn.** Mỗi món tối đa một chương trình món, hoá đơn tối đa một
 *     chương trình hoá đơn và chỉ trên món chưa giảm — hệ thống tự chọn mức lợi nhất.
 *   · **Trần theo luật.** Giảm quá 50% chỉ được khi là khuyến mại tập trung —
 *     báo ngay lúc gõ, không đợi máy chủ từ chối.
 *   · **Soạn không phải là bật.** Bật là đụng giá bán nên cần R11/R10 duyệt bằng PIN.
 *
 * Mẫu chương trình ở đầu khung soạn là các kiểu nhà hàng hay chạy (giờ vàng đồ
 * uống, mua N tặng M, đồng giá set trưa, giảm theo hoá đơn, tặng món, voucher
 * khách quen) — điền sẵn hình dạng, người soạn chỉ chọn món và con số.
 */

const SCOPE_LABELS: Record<PromotionScope, string> = {
  item: 'Món · set · nhóm món',
  bill: 'Cả hoá đơn',
}

const KIND_LABELS: Record<PromotionScope, Partial<Record<PromotionKind, string>>> = {
  item: {
    percent: 'Giảm %',
    amount: 'Giảm tiền mỗi phần',
    set_price: 'Đồng giá',
    buy_x_get_y: 'Mua N tặng M',
  },
  bill: {
    percent: 'Giảm % hoá đơn',
    amount: 'Giảm tiền hoá đơn',
    free_dish: 'Tặng món',
  },
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
const WORKDAYS = [1, 2, 3, 4, 5]

const LEGAL_PERCENT = Math.round(LEGAL_MAX_DISCOUNT_RATE * 100)

const today = () => new Date().toISOString().slice(0, 10)
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

const blank = (): PromotionInput => ({
  code: '',
  name: '',
  scope: 'item',
  kind: 'percent',
  badge: null,
  percentBp: 1000,
  amountVnd: null,
  setPriceVnd: null,
  buyQty: null,
  getQty: null,
  getPercent: null,
  giftDishId: null,
  targetDishIds: [],
  targetCategoryIds: [],
  maxDiscountVnd: null,
  channels: [],
  branchIds: [],
  weekdays: [],
  fromMinute: null,
  toMinute: null,
  minOrderVnd: 0,
  requiresVoucher: false,
  concentrated: false,
  legalNotice: null,
  startsOn: today(),
  endsOn: inDays(30),
})

interface Template {
  id: string
  label: string
  hint: string
  build: (menu: Menu) => Partial<PromotionInput>
}

/**
 * Các kiểu chương trình nhà hàng hay chạy. Chỉ là hình dạng điền sẵn — con số
 * và món là việc của người soạn, và trần luật vẫn được kiểm như mọi chương trình.
 */
const TEMPLATES: Template[] = [
  {
    id: 'gio-vang',
    label: 'Giờ vàng đồ uống',
    hint: 'Giảm 30% đồ uống 17:00–19:00, thứ Hai–Sáu — kéo khách vào khung giờ vắng',
    build: (menu) => ({
      code: 'KM-GIO-VANG',
      name: 'Giờ vàng đồ uống −30%',
      scope: 'item',
      kind: 'percent',
      percentBp: 3000,
      badge: 'Giờ vàng',
      targetCategoryIds: menu.drinkCategoryIds,
      weekdays: WORKDAYS,
      fromMinute: 17 * 60,
      toMinute: 19 * 60,
    }),
  },
  {
    id: 'mua-2-tang-1',
    label: 'Mua 2 tặng 1',
    hint: 'Phần thứ ba miễn phí — vừa đúng trần 50% giá trị phần mua',
    build: () => ({
      code: 'KM-MUA2-TANG1',
      name: 'Mua 2 tặng 1',
      scope: 'item',
      kind: 'buy_x_get_y',
      percentBp: null,
      buyQty: 2,
      getQty: 1,
      getPercent: 100,
    }),
  },
  {
    id: 'phan-sau',
    label: 'Phần thứ hai −50%',
    hint: 'Gọi hai phần, phần sau nửa giá — hay dùng cho món mới cần người thử',
    build: () => ({
      code: 'KM-PHAN-SAU',
      name: 'Phần thứ hai giảm 50%',
      scope: 'item',
      kind: 'buy_x_get_y',
      percentBp: null,
      buyQty: 1,
      getQty: 1,
      getPercent: 50,
    }),
  },
  {
    id: 'set-trua',
    label: 'Đồng giá set trưa',
    hint: 'Một giá cho các set đã chọn, 11:00–14:00 ngày thường',
    build: () => ({
      code: 'KM-SET-TRUA',
      name: 'Set trưa đồng giá',
      scope: 'item',
      kind: 'set_price',
      percentBp: null,
      setPriceVnd: null,
      badge: 'Set trưa',
      weekdays: WORKDAYS,
      fromMinute: 11 * 60,
      toMinute: 14 * 60,
    }),
  },
  {
    id: 'hoa-don',
    label: 'Giảm % hoá đơn',
    hint: 'Hoá đơn từ 1.000.000₫ giảm 10%, tối đa 200.000₫ mỗi đơn',
    build: () => ({
      code: 'KM-HOA-DON-10',
      name: 'Hoá đơn từ 1 triệu giảm 10%',
      scope: 'bill',
      kind: 'percent',
      percentBp: 1000,
      minOrderVnd: 1_000_000,
      maxDiscountVnd: 200_000,
    }),
  },
  {
    id: 'tang-mon',
    label: 'Tặng món theo hoá đơn',
    hint: 'Đơn từ 800.000₫ được tặng một phần món chọn sẵn',
    build: () => ({
      code: 'KM-TANG-MON',
      name: 'Đơn từ 800k tặng món',
      scope: 'bill',
      kind: 'free_dish',
      percentBp: null,
      minOrderVnd: 800_000,
    }),
  },
  {
    id: 'voucher',
    label: 'Voucher khách quen',
    hint: 'Giảm 100.000₫ cho đơn từ 500.000₫, chỉ khi có mã — sinh nhật, khách đặt lại',
    build: () => ({
      code: 'KM-KHACH-QUEN',
      name: 'Voucher khách quen 100k',
      scope: 'bill',
      kind: 'amount',
      percentBp: null,
      amountVnd: 100_000,
      minOrderVnd: 500_000,
      requiresVoucher: true,
    }),
  },
]

/** Thực đơn để chọn món áp dụng và để đọc tên món trong danh sách chương trình */
interface Menu {
  dishes: DishRow[]
  categories: { id: string; nameVi: string }[]
  dishName: (id: string) => string
  categoryName: (id: string) => string
  drinkCategoryIds: string[]
}

function useMenu(): Menu {
  const { branchId } = useSession()
  const dishes = useQuery({
    queryKey: ['promo-dishes', branchId],
    queryFn: () => api.dishes(branchId!),
    enabled: branchId !== null,
    staleTime: 60_000,
  })
  const pickers = useQuery({
    queryKey: ['dish-pickers'],
    queryFn: api.dishPickers,
    staleTime: 60_000,
  })
  return useMemo(() => {
    const list = (dishes.data ?? []).filter((d) => d.active)
    const categories = pickers.data?.categories ?? []
    const byDish = new Map((dishes.data ?? []).map((d) => [d.id, d.nameVi]))
    const byCategory = new Map(categories.map((c) => [c.id, c.nameVi]))
    return {
      dishes: list,
      categories,
      dishName: (id) => byDish.get(id) ?? id,
      categoryName: (id) => byCategory.get(id) ?? id,
      drinkCategoryIds: [
        ...new Set(
          list.filter((d) => d.kind === 'drink' && d.categoryId).map((d) => d.categoryId!),
        ),
      ],
    }
  }, [dishes.data, pickers.data])
}

export function Promotions() {
  const { can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const menu = useMenu()
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
        subtitle="Áp chung cho iPad tại bàn, quầy và web. Mỗi món hưởng tối đa một chương trình món; hoá đơn hưởng tối đa một chương trình hoá đơn, chỉ trên món chưa giảm — hệ thống tự chọn mức lợi nhất cho khách."
        action={
          draft || !mayCompose ? null : (
            <Button variant="primary" onClick={() => setDraft({ input: blank() })}>
              Soạn chương trình
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {promotions.isError ? <ErrorState message={(promotions.error as Error).message} /> : null}

        {draft ? (
          <PromotionForm
            draft={draft.input}
            isNew={draft.id === undefined}
            menu={menu}
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
              Chưa có chương trình nào. Bấm <strong>Soạn chương trình</strong> và bắt đầu từ một
              mẫu.
            </p>
          ) : (
            rows.map((promo) => (
              <PromotionCard
                key={promo.id}
                promo={promo}
                menu={menu}
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
  const base = blank()
  const picked = {} as Record<string, unknown>
  for (const key of Object.keys(base) as (keyof PromotionInput)[]) picked[key] = row[key]
  return picked as unknown as PromotionInput
}

/** Bản nháp quy về hình dạng của bộ chấm chung — để xem trước đúng như máy chủ sẽ tính */
function ruleOf(input: PromotionInput, id = 0): PromotionRule {
  return { id, ...input }
}

/** Món, set hay nhóm món mà chương trình nhắm tới, nói bằng chữ */
function targetsOf(promo: PromotionInput, menu: Menu): string {
  if (promo.scope === 'bill' && promo.kind !== 'free_dish') return 'Cả hoá đơn'
  const names = [
    ...promo.targetCategoryIds.map((c) => `nhóm ${menu.categoryName(c)}`),
    ...promo.targetDishIds.map((d) => menu.dishName(d)),
  ]
  if (promo.kind === 'free_dish') {
    const gift = promo.giftDishId ? menu.dishName(promo.giftDishId) : '—'
    return names.length > 0 ? `Tặng ${gift} khi gọi ${names.join(', ')}` : `Tặng ${gift}`
  }
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

function PromotionCard({
  promo,
  menu,
  mayCompose,
  open,
  onToggle,
  onEdit,
  onChanged,
}: {
  promo: PromotionRow
  menu: Menu
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
      <div className="grid grid-cols-[1fr_220px_160px_120px_130px_190px] items-center gap-3 px-5 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
            {promo.name}
          </span>
          <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {promo.code} · {formatDay(promo.startsOn)} – {formatDay(promo.endsOn)}
          </span>
        </span>

        <span className="min-w-0 text-[length:var(--fs-c1)] text-ink-body">
          <span className="block truncate">{targetsOf(promo, menu)}</span>
          <span className="mt-0.5 block text-ink-mute">{SCOPE_LABELS[promo.scope]}</span>
        </span>

        <span className="text-[length:var(--fs-c1)] text-ink-body">
          {badgeOf(ruleOf(promo, promo.id))}
          <span className="mt-0.5 block text-ink-mute">
            {KIND_LABELS[promo.scope][promo.kind] ?? promo.kind}
          </span>
        </span>

        <span className="text-[length:var(--fs-c1)] text-ink-mute">
          {promo.uses} đơn
          {promo.uses > 0 ? (
            <span className="mt-0.5 block font-mono text-ink-body tabular-nums">
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
          ) : promo.concentrated ? (
            <span className="mt-1 block text-[length:var(--fs-c2)] text-ink-mute">
              Khuyến mại tập trung
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
        <PromotionDetail promo={promo} menu={menu} mayCompose={mayCompose} onChanged={onChanged} />
      ) : null}
    </section>
  )
}

function conditionsOf(promo: PromotionInput): string[] {
  return [
    promo.channels.length > 0
      ? `Kênh: ${promo.channels.map((c) => CHANNELS.find((x) => x.id === c)?.label ?? c).join(' · ')}`
      : 'Mọi kênh',
    promo.branchIds.length > 0 ? `Chi nhánh: ${promo.branchIds.join(' · ')}` : 'Mọi chi nhánh',
    promo.weekdays.length > 0
      ? `Thứ: ${[...promo.weekdays]
          .sort()
          .map((d) => WEEKDAYS[d])
          .join(' · ')}`
      : 'Mọi ngày trong tuần',
    promo.fromMinute !== null && promo.toMinute !== null
      ? `Khung giờ ${hhmm(promo.fromMinute)}–${hhmm(promo.toMinute)} (${
          promo.scope === 'item' ? 'theo lúc gọi món' : 'theo lúc mở đơn'
        })`
      : 'Cả ngày',
    promo.minOrderVnd > 0
      ? `Đơn tối thiểu ${formatVnd(promo.minOrderVnd)}`
      : 'Không có đơn tối thiểu',
    promo.maxDiscountVnd
      ? `Trần giảm ${formatVnd(promo.maxDiscountVnd)} mỗi đơn`
      : 'Không có trần giảm mỗi đơn',
  ]
}

function PromotionDetail({
  promo,
  menu,
  mayCompose,
  onChanged,
}: {
  promo: PromotionRow
  menu: Menu
  mayCompose: boolean
  onChanged: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [batch, setBatch] = useState({ prefix: promo.code, count: 20, maxUses: 1 })

  const vouchers = useQuery({
    queryKey: ['promo-vouchers', promo.id],
    queryFn: () => api.promoVouchers(promo.id),
    enabled: promo.requiresVoucher,
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['promo-vouchers', promo.id] })
    onChanged()
  }

  const targets = [
    ...promo.targetCategoryIds.map((c) => `Nhóm ${menu.categoryName(c)}`),
    ...promo.targetDishIds.map((d) => menu.dishName(d)),
  ]

  return (
    <div className="border-t border-line-1 bg-canvas px-5 py-4">
      {targets.length > 0 ? (
        <>
          <SectionTitle>
            {promo.kind === 'free_dish' ? 'Món phải gọi kèm' : 'Món áp dụng'}
          </SectionTitle>
          <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
            {targets.join(' · ')}
          </p>
        </>
      ) : null}

      <SectionTitle className={targets.length > 0 ? 'mt-4' : ''}>Điều kiện áp dụng</SectionTitle>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {conditionsOf(promo).map((line) => (
          <li key={line} className="text-[length:var(--fs-c1)] text-ink-body">
            {line}
          </li>
        ))}
      </ul>

      {promo.concentrated || promo.legalNotice ? (
        <p className="mt-3 text-[length:var(--fs-c1)] text-ink-body">
          {promo.concentrated ? 'Khuyến mại tập trung — được giảm quá trần 50%. ' : ''}
          {promo.legalNotice ? `Thông báo: ${promo.legalNotice}` : ''}
        </p>
      ) : null}

      {promo.activatedAt ? (
        <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
          Bật lúc {new Date(promo.activatedAt).toLocaleString('vi-VN')}
          {promo.activatedBy ? ` · ${promo.activatedBy}` : ''}
        </p>
      ) : null}

      {promo.scope === 'bill' ? (
        <>
          <SectionTitle className="mt-5">Lô mã voucher</SectionTitle>
          {!promo.requiresVoucher ? (
            <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
              Chương trình này áp tự động, không cần mã. Bật ô <em>bắt buộc có mã voucher</em> ở
              phần soạn nếu muốn phát mã.
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
                    className={[
                      'inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[length:var(--fs-c1)]',
                      code.state === 'void'
                        ? 'border-line-3 text-line-4 line-through'
                        : spent
                          ? 'border-line-3 text-ink-mute'
                          : 'border-accent text-accent-ink',
                    ].join(' ')}
                  >
                    {code.code}
                    <span className="text-ink-mute">
                      {code.usedCount}/{code.maxUses}
                    </span>
                    {mayCompose && code.state === 'live' ? (
                      <Button
                        onClick={() =>
                          api
                            .voidVoucher(code.id)
                            .then(() => {
                              toast('Đã huỷ mã', 'ok')
                              refresh()
                            })
                            .catch((err: Error) => toast(err.message, 'danger'))
                        }
                        size="sm"
                        variant="danger"
                      >
                        ×
                      </Button>
                    ) : null}
                  </span>
                )
              })}
            </div>
          )}

          {mayCompose && promo.requiresVoucher ? (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line-1 pt-4">
              <Field label="Tiền tố mã">
                <Input
                  value={batch.prefix}
                  onChange={(v) => setBatch({ ...batch, prefix: v.toUpperCase() })}
                  width={160}
                  mono
                />
              </Field>
              <Field label="Số mã">
                <NumberInput
                  value={batch.count}
                  onChange={(v) => setBatch({ ...batch, count: v ?? 1 })}
                  min={1}
                  max={500}
                  width={100}
                />
              </Field>
              <Field label="Lượt mỗi mã">
                <NumberInput
                  value={batch.maxUses}
                  onChange={(v) => setBatch({ ...batch, maxUses: v ?? 1 })}
                  min={1}
                  width={110}
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
                Mã đánh số theo thứ tự để khách đọc được qua điện thoại — đổi lại là mã đoán được,
                nên chương trình nào sợ bị đoán thì đặt lượt mỗi mã thấp.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/** Vượt trần luật ở đâu — cùng phép thử với máy chủ (`validateShape`) */
function legalProblem(draft: PromotionInput): string | null {
  if (draft.concentrated) return null
  if (draft.kind === 'percent' && (draft.percentBp ?? 0) > LEGAL_PERCENT * 100) {
    return `Giảm ${percentLabel(draft.percentBp ?? 0)} vượt trần ${LEGAL_PERCENT}%`
  }
  if (
    draft.kind === 'buy_x_get_y' &&
    (draft.getQty ?? 0) * (draft.getPercent ?? 0) > LEGAL_PERCENT * (draft.buyQty ?? 0)
  ) {
    return `Phần tặng vượt ${LEGAL_PERCENT}% giá trị phần phải mua`
  }
  return null
}

/** Đủ để lưu chưa — thiếu gì thì nói thiếu gì, nút Lưu không im lặng xám đi */
function missingOf(draft: PromotionInput): string | null {
  if (!draft.code.trim() || !draft.name.trim()) return 'Điền mã và tên chương trình'
  switch (draft.kind) {
    case 'percent':
      if (!draft.percentBp) return 'Điền mức giảm'
      break
    case 'amount':
      if (!draft.amountVnd) return 'Điền số tiền giảm'
      break
    case 'set_price':
      if (draft.setPriceVnd === null) return 'Điền giá đồng giá'
      break
    case 'buy_x_get_y':
      if (!draft.buyQty || !draft.getQty || !draft.getPercent)
        return 'Điền số phần mua, tặng và mức giảm'
      break
    case 'free_dish':
      if (!draft.giftDishId) return 'Chọn món được tặng'
      break
  }
  if (draft.scope === 'item' && draft.targetDishIds.length + draft.targetCategoryIds.length === 0) {
    return 'Chọn ít nhất một món, set hoặc nhóm món'
  }
  if (draft.endsOn < draft.startsOn) return 'Ngày kết thúc phải sau ngày bắt đầu'
  return null
}

function PromotionForm({
  draft,
  isNew,
  menu,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: PromotionInput
  isNew: boolean
  menu: Menu
  onChange: (next: PromotionInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const [template, setTemplate] = useState<string | null>(null)
  const set = <K extends keyof PromotionInput>(key: K, value: PromotionInput[K]) =>
    onChange({ ...draft, [key]: value })

  const toggleIn = (key: 'channels' | 'targetDishIds' | 'targetCategoryIds', id: string) =>
    set(key, draft[key].includes(id) ? draft[key].filter((x) => x !== id) : [...draft[key], id])

  const hasWindow = draft.fromMinute !== null
  const legal = legalProblem(draft)
  // Vượt trần luật thì máy chủ cũng từ chối — chặn ở đây, nói luôn vì sao
  const blocked =
    missingOf(draft) ?? (legal ? `${legal} — giảm mức hoặc bật Khuyến mại tập trung` : null)
  const pickTargets = draft.scope === 'item' || draft.kind === 'free_dish'

  return (
    <section className="rounded-md border border-accent bg-surface-1">
      {isNew ? (
        <div className="border-b border-line-1 px-5 py-4">
          <SectionTitle>Bắt đầu từ mẫu</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <Toggle
                key={t.id}
                on={template === t.id}
                onChange={() => {
                  setTemplate(t.id)
                  onChange({ ...blank(), ...t.build(menu) })
                }}
              >
                {t.label}
              </Toggle>
            ))}
          </div>
          <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
            {TEMPLATES.find((t) => t.id === template)?.hint ??
              'Các kiểu nhà hàng hay chạy — điền sẵn hình dạng, bạn chỉ chọn món và con số.'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 p-5 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* 1 · Loại */}
          <Step n={1} title="Loại">
            <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
              <Field label="Mã chương trình">
                <Input
                  value={draft.code}
                  onChange={(v) => set('code', v.toUpperCase())}
                  placeholder="KM-GIO-VANG"
                  mono
                />
              </Field>
              <Field label="Tên">
                <Input
                  value={draft.name}
                  onChange={(v) => set('name', v)}
                  placeholder="Giờ vàng đồ uống −30%"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <Group label="Áp dụng cho">
                <SegmentedControl
                  value={draft.scope}
                  onChange={(scope) => onChange(switchScope(draft, scope))}
                  options={(['item', 'bill'] as const).map((s) => ({
                    value: s,
                    label: SCOPE_LABELS[s],
                  }))}
                />
              </Group>
              <Group label="Kiểu giảm">
                <SegmentedControl
                  value={draft.kind}
                  onChange={(kind) => onChange(switchKind(draft, kind))}
                  options={KINDS_BY_SCOPE[draft.scope].map((k) => ({
                    value: k,
                    label: KIND_LABELS[draft.scope][k] ?? k,
                  }))}
                />
              </Group>
            </div>
            <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              {draft.scope === 'item'
                ? 'Giá giảm hiện ngay trên thẻ món và chốt lúc khách GỌI: hết giờ vàng giữa bữa thì món đã gọi vẫn giữ giá.'
                : 'Tính lại mỗi lần đơn đổi, chỉ trên các món chưa được giảm món — một đồng không bị giảm hai lần.'}
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <ValueFields draft={draft} menu={menu} set={set} />
            </div>
            {legal ? (
              <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-danger-line">
                {legal} — chỉ được khi là chương trình khuyến mại tập trung (NĐ 81/2018, sửa bởi NĐ
                128/2024). Đúng là vậy thì bật ô <strong>Khuyến mại tập trung</strong> ở mục Mã,
                nhãn &amp; pháp lý.
              </p>
            ) : null}
          </Step>

          {/* 2 · Món áp dụng */}
          {pickTargets ? (
            <Step
              n={2}
              title={draft.kind === 'free_dish' ? 'Món phải gọi kèm' : 'Món áp dụng'}
              hint={
                draft.kind === 'free_dish'
                  ? 'Không chọn = chỉ cần đạt đơn tối thiểu là được tặng.'
                  : 'Chọn cả nhóm để món mới thêm vào nhóm cũng được áp; chọn lẻ cho món hoặc set.'
              }
            >
              <TargetPicker
                menu={menu}
                dishIds={draft.targetDishIds}
                categoryIds={draft.targetCategoryIds}
                onDish={(id) => toggleIn('targetDishIds', id)}
                onCategory={(id) => toggleIn('targetCategoryIds', id)}
              />
            </Step>
          ) : null}

          {/* 3 · Điều kiện */}
          <Step n={pickTargets ? 3 : 2} title="Điều kiện">
            <div className="grid gap-4 lg:grid-cols-2">
              <Group label="Kênh (không chọn = mọi kênh)">
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((channel) => (
                    <Toggle
                      key={channel.id}
                      on={draft.channels.includes(channel.id)}
                      onChange={() => toggleIn('channels', channel.id)}
                    >
                      {channel.label}
                    </Toggle>
                  ))}
                </div>
              </Group>
              <Group label="Thứ trong tuần (không chọn = mọi ngày)">
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((label, index) => (
                    <Toggle
                      key={label}
                      on={draft.weekdays.includes(index)}
                      onChange={() =>
                        set(
                          'weekdays',
                          draft.weekdays.includes(index)
                            ? draft.weekdays.filter((d) => d !== index)
                            : [...draft.weekdays, index],
                        )
                      }
                    >
                      {label}
                    </Toggle>
                  ))}
                </div>
              </Group>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <Toggle
                on={hasWindow}
                onChange={() =>
                  hasWindow
                    ? onChange({ ...draft, fromMinute: null, toMinute: null })
                    : onChange({ ...draft, fromMinute: 17 * 60, toMinute: 19 * 60 })
                }
              >
                Chỉ trong khung giờ
              </Toggle>
              {hasWindow ? (
                <>
                  <Field label="Từ">
                    <Input
                      type="time"
                      value={hhmm(draft.fromMinute ?? 0)}
                      onChange={(v) => set('fromMinute', toMinutes(v))}
                      width={120}
                      mono
                    />
                  </Field>
                  <Field label="Đến">
                    <Input
                      type="time"
                      value={hhmm(draft.toMinute ?? 0)}
                      onChange={(v) => set('toMinute', toMinutes(v))}
                      width={120}
                      mono
                    />
                  </Field>
                </>
              ) : null}
              <Field label="Đơn tối thiểu (₫)">
                <NumberInput
                  value={draft.minOrderVnd || null}
                  onChange={(v) => set('minOrderVnd', v ?? 0)}
                  placeholder="Không"
                  min={0}
                  width={150}
                />
              </Field>
              <Field label="Trần giảm mỗi đơn (₫)">
                <NumberInput
                  value={draft.maxDiscountVnd}
                  onChange={(v) => set('maxDiscountVnd', v && v > 0 ? v : null)}
                  placeholder="Không"
                  min={0}
                  width={150}
                />
              </Field>
            </div>
            <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              {draft.scope === 'item'
                ? 'Khung giờ tính theo lúc gọi món. Đơn tối thiểu tính trên tiền món sau giảm, trước phí và thuế — chương trình có đơn tối thiểu không in giá giảm lên thẻ món.'
                : 'Khung giờ tính theo lúc MỞ đơn: khách ngồi xuống trong khung giờ thì được, dù tính tiền lúc nào.'}
            </p>
          </Step>

          {/* 4 · Mã & pháp lý */}
          <Step n={pickTargets ? 4 : 3} title="Mã, nhãn & pháp lý">
            <div className="flex flex-wrap items-end gap-4">
              {draft.scope === 'item' ? (
                <Field label="Nhãn trên thẻ món">
                  <Input
                    value={draft.badge ?? ''}
                    onChange={(v) => set('badge', v.slice(0, 24) || null)}
                    placeholder={badgeOf(ruleOf({ ...draft, badge: null }))}
                    width={220}
                  />
                </Field>
              ) : (
                <Toggle
                  on={draft.requiresVoucher}
                  onChange={() => set('requiresVoucher', !draft.requiresVoucher)}
                >
                  Bắt buộc có mã voucher
                </Toggle>
              )}
              <Toggle
                on={draft.concentrated}
                onChange={() => set('concentrated', !draft.concentrated)}
              >
                Khuyến mại tập trung
              </Toggle>
              <Field label="Số thông báo gửi Sở Công Thương" className="min-w-[260px] flex-1">
                <Input
                  value={draft.legalNotice ?? ''}
                  onChange={(v) => set('legalNotice', v || null)}
                  placeholder="TB 12/2026 ngày 20/10/2026"
                />
              </Field>
            </div>
            <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              {draft.scope === 'item'
                ? 'Mã voucher chỉ mở được chương trình hoá đơn: mã gắn vào đơn lúc tính tiền, khi giá món đã chốt.'
                : 'Chương trình cần mã không hiện cho khách trên thực đơn — chỉ ăn khi thu ngân hoặc khách nhập mã.'}{' '}
              Khuyến mại tập trung (theo đợt Nhà nước công bố) được giảm quá trần {LEGAL_PERCENT}%;
              ghi số thông báo để tra khi bị hỏi.
            </p>
          </Step>

          {/* 5 · Lịch chạy */}
          <Step n={pickTargets ? 5 : 4} title="Lịch chạy">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Từ ngày">
                <DateInput value={draft.startsOn} onChange={(v) => set('startsOn', v)} />
              </Field>
              <Field label="Đến ngày">
                <DateInput value={draft.endsOn} onChange={(v) => set('endsOn', v)} />
              </Field>
            </div>
          </Step>
        </div>

        <Preview draft={draft} menu={menu} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line-1 px-5 py-4">
        <p className="mr-auto text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          {blocked ??
            'Lưu xong chương trình ở trạng thái Nháp — chưa ảnh hưởng đồng nào. Bật lên cần quản lý chuỗi hoặc chủ quán duyệt.'}
        </p>
        <Button onClick={onCancel}>Bỏ</Button>
        <Button variant="primary" disabled={blocked !== null || saving} onClick={onSave}>
          Lưu bản nháp
        </Button>
      </div>
    </section>
  )
}

function ValueFields({
  draft,
  menu,
  set,
}: {
  draft: PromotionInput
  menu: Menu
  set: <K extends keyof PromotionInput>(key: K, value: PromotionInput[K]) => void
}) {
  switch (draft.kind) {
    case 'percent':
      return (
        <Field label="Giảm (%)">
          <NumberInput
            value={draft.percentBp === null ? null : draft.percentBp / 100}
            onChange={(v) => set('percentBp', v === null ? null : Math.round(v * 100))}
            min={0.01}
            max={100}
            step={0.5}
            width={120}
          />
        </Field>
      )
    case 'amount':
      return (
        <Field label={draft.scope === 'item' ? 'Giảm mỗi phần (₫)' : 'Giảm trên hoá đơn (₫)'}>
          <NumberInput
            value={draft.amountVnd}
            onChange={(v) => set('amountVnd', v && v > 0 ? v : null)}
            min={1000}
            step={1000}
            width={160}
          />
        </Field>
      )
    case 'set_price':
      return (
        <Field
          label="Giá đồng giá mỗi phần (₫)"
          hint="Món đang bán rẻ hơn mức này thì giữ giá cũ — đồng giá không bao giờ làm món đắt lên."
        >
          <NumberInput
            value={draft.setPriceVnd}
            onChange={(v) => set('setPriceVnd', v)}
            min={0}
            step={1000}
            width={180}
          />
        </Field>
      )
    case 'buy_x_get_y':
      return (
        <>
          <Field label="Mua (phần)">
            <NumberInput
              value={draft.buyQty}
              onChange={(v) => set('buyQty', v)}
              min={1}
              max={20}
              width={110}
            />
          </Field>
          <Field label="Tặng (phần)">
            <NumberInput
              value={draft.getQty}
              onChange={(v) => set('getQty', v)}
              min={1}
              max={20}
              width={110}
            />
          </Field>
          <Field
            label="Phần tặng giảm (%)"
            hint="100 = miễn phí. Tặng phần rẻ nhất trong lượt gọi."
          >
            <NumberInput
              value={draft.getPercent}
              onChange={(v) => set('getPercent', v)}
              min={1}
              max={100}
              width={140}
            />
          </Field>
        </>
      )
    case 'free_dish':
      return (
        <Field label="Món được tặng" className="min-w-[280px]">
          <Select
            value={draft.giftDishId ?? ''}
            onChange={(v) => set('giftDishId', v || null)}
            placeholder="Chọn món…"
            options={menu.dishes
              .filter((d) => d.kind !== 'set')
              .map((d) => ({ value: d.id, label: `${d.nameVi} · ${formatVnd(d.basePrice)}` }))}
          />
        </Field>
      )
  }
}

function TargetPicker({
  menu,
  dishIds,
  categoryIds,
  onDish,
  onCategory,
}: {
  menu: Menu
  dishIds: string[]
  categoryIds: string[]
  onDish: (id: string) => void
  onCategory: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const shown = menu.dishes.filter(
    (d) =>
      needle === '' ||
      d.nameVi.toLowerCase().includes(needle) ||
      d.code.toLowerCase().includes(needle),
  )

  return (
    <div>
      <Group label="Cả nhóm món">
        <div className="flex flex-wrap gap-2">
          {menu.categories.map((c) => (
            <Toggle key={c.id} on={categoryIds.includes(c.id)} onChange={() => onCategory(c.id)}>
              {c.nameVi}
            </Toggle>
          ))}
        </div>
      </Group>

      <div className="mt-4 flex items-end justify-between gap-4">
        <Field label="Món hoặc set lẻ">
          <Input
            value={search}
            onChange={setSearch}
            placeholder="Tìm theo tên hoặc mã món"
            width={280}
          />
        </Field>
        <p className="pb-2 text-[length:var(--fs-c1)] text-ink-mute">
          Đã chọn {dishIds.length} món · {categoryIds.length} nhóm
        </p>
      </div>

      <ul className="mt-2 max-h-[280px] overflow-y-auto rounded-sm border border-line-1 bg-canvas">
        {shown.length === 0 ? (
          <li className="px-3 py-3 text-[length:var(--fs-c1)] text-ink-mute">Không có món khớp.</li>
        ) : (
          shown.map((d) => {
            const viaCategory = d.categoryId !== null && categoryIds.includes(d.categoryId)
            return (
              <li key={d.id} className="border-b border-line-1 last:border-b-0">
                <label className="flex h-9 cursor-pointer items-center gap-3 px-3 hover:bg-surface-3">
                  <input
                    type="checkbox"
                    checked={dishIds.includes(d.id) || viaCategory}
                    disabled={viaCategory}
                    onChange={() => onDish(d.id)}
                    className="size-4 accent-[var(--color-accent-strong)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[length:var(--fs-b2)] text-ink-hi">
                    {d.nameVi}
                    {d.kind === 'set' ? (
                      <span className="ml-2 text-[length:var(--fs-c2)] text-ink-mute">SET</span>
                    ) : null}
                  </span>
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {viaCategory
                      ? 'theo nhóm'
                      : d.categoryId
                        ? menu.categoryName(d.categoryId)
                        : ''}
                  </span>
                  <span className="w-[110px] text-right font-mono text-[length:var(--fs-c1)] text-ink-body tabular-nums">
                    {formatVnd(d.basePrice)}
                  </span>
                </label>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

/**
 * Xem trước bằng CHÍNH bộ chấm của máy chủ (`@sora/contracts`) — con số ở đây là
 * con số khách sẽ thấy trên thẻ món và trên bill, kể cả phần bị cắt ở trần luật.
 */
function Preview({ draft, menu }: { draft: PromotionInput; menu: Menu }) {
  const rule = ruleOf(draft)
  const rate = LEGAL_MAX_DISCOUNT_RATE

  const samples =
    draft.scope === 'item'
      ? menu.dishes
          .filter(
            (d) =>
              draft.targetDishIds.includes(d.id) ||
              (d.categoryId !== null && draft.targetCategoryIds.includes(d.categoryId)),
          )
          .slice(0, 3)
      : []

  return (
    <aside className="self-start rounded-md border border-line-1 bg-canvas p-4 xl:sticky xl:top-0">
      <SectionTitle>
        {draft.scope === 'item' ? 'Xem trước trên thực đơn khách' : 'Xem trước trên tạm tính'}
      </SectionTitle>

      {draft.scope === 'item' ? (
        samples.length === 0 ? (
          <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">Chọn món để xem giá giảm.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {samples.map((dish) => {
              const price = dish.basePrice
              const raw =
                draft.kind === 'buy_x_get_y'
                  ? 0
                  : unitDiscountOf({ ...rule, concentrated: true }, price, price, 1)
              const off =
                draft.kind === 'buy_x_get_y' ? 0 : unitDiscountOf(rule, price, price, rate)
              return (
                <li
                  key={dish.id}
                  className="rounded-md border border-ember-2/60 bg-surface-1 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[length:var(--fs-b2)] text-ink-hi">
                      {dish.nameVi}
                    </span>
                    <span className="shrink-0 rounded-sm bg-ember-2/12 px-1.5 py-0.5 text-[length:var(--fs-c2)] font-semibold text-ember-3">
                      {badgeOf(rule)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
                    {off > 0 ? (
                      <>
                        <span className="text-[length:var(--fs-b2)] text-ink-hi">
                          {formatVnd(price - off)}
                        </span>
                        <span className="text-[length:var(--fs-c1)] text-ink-mute line-through">
                          {formatVnd(price)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[length:var(--fs-b2)] text-ink-hi">
                        {formatVnd(price)}
                      </span>
                    )}
                  </div>
                  {draft.kind === 'buy_x_get_y' && draft.buyQty && draft.getQty ? (
                    <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
                      Gọi {draft.buyQty + draft.getQty} phần, trả{' '}
                      {formatVnd(
                        price * draft.buyQty +
                          (price - Math.floor((price * (draft.getPercent ?? 100)) / 100)) *
                            draft.getQty,
                      )}
                    </p>
                  ) : null}
                  {raw > off ? (
                    <p className="mt-1 text-[length:var(--fs-c1)] text-danger-line">
                      Bị cắt ở trần {LEGAL_PERCENT}%: giảm {formatVnd(off)} thay vì {formatVnd(raw)}
                    </p>
                  ) : null}
                  {draft.minOrderVnd > 0 ? (
                    <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
                      Có đơn tối thiểu — thẻ món hiện giá gốc, giảm khi đơn đủ.
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )
      ) : (
        <BillPreview draft={draft} menu={menu} />
      )}

      <SectionTitle className="mt-5">Quy tắc chồng</SectionTitle>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
        <li>Mỗi món tối đa một chương trình món — lấy cái giảm nhiều nhất.</li>
        <li>Giảm theo phần (giờ vàng, đồng giá) đi trước mua N tặng M.</li>
        <li>Hoá đơn tối đa một chương trình hoá đơn, chỉ trên món chưa giảm.</li>
        <li>Bằng nhau thì chương trình soạn trước thắng.</li>
      </ul>
    </aside>
  )
}

function BillPreview({ draft, menu }: { draft: PromotionInput; menu: Menu }) {
  const gift = draft.giftDishId ? menu.dishes.find((d) => d.id === draft.giftDishId) : undefined
  const subtotal = Math.max(draft.minOrderVnd, 1_000_000)
  const at = {
    businessDate: draft.startsOn,
    weekday: draft.weekdays[0] ?? 0,
    minuteOfDay: draft.fromMinute ?? 0,
  }
  const line = (key: string, dishId: string, categoryId: string | null, unitPrice: number) => ({
    key,
    dishId,
    categoryId,
    qty: 1,
    unitPrice,
    at,
    promotionId: null,
    discountVnd: 0,
    promoQty: 0,
  })
  // Món mua ví dụ là món đầu tiên trong danh sách phải gọi kèm, để "tặng khi gọi X" cũng ăn
  const bought = line(
    'mua',
    draft.targetDishIds[0] ?? 'mon-mua',
    draft.targetDishIds.length === 0 ? (draft.targetCategoryIds[0] ?? null) : null,
    subtotal,
  )
  const lines = gift ? [bought, line('tang', gift.id, gift.categoryId, gift.basePrice)] : [bought]
  const bill = priceBill(
    [ruleOf({ ...draft, startsOn: at.businessDate, endsOn: at.businessDate }, 1)],
    {
      branchId: draft.branchIds[0] ?? '',
      channel: draft.channels[0] ?? 'table',
      voucherPromotionIds: [1],
      maxDiscountRate: LEGAL_MAX_DISCOUNT_RATE,
    },
    at,
    lines,
  )

  if (draft.kind === 'free_dish' && !gift) {
    return (
      <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">Chọn món được tặng để xem.</p>
    )
  }

  return (
    <div className="mt-3 rounded-md border border-line-1 bg-surface-1 px-3 py-2.5 font-mono text-[length:var(--fs-c1)] tabular-nums">
      <Row label="Tiền món ví dụ" value={formatVnd(subtotal)} />
      {gift ? <Row label={`${gift.nameVi} (tặng)`} value={formatVnd(gift.basePrice)} /> : null}
      <Row
        label={draft.name.trim() || 'Khuyến mãi'}
        value={bill ? `−${formatVnd(bill.discountVnd)}` : 'không áp'}
        strong
      />
      <p className="mt-2 font-sans text-ink-mute">
        {bill
          ? draft.requiresVoucher
            ? 'Chỉ khi nhập đúng mã voucher.'
            : 'Tự áp khi đơn đủ điều kiện — khách thấy dòng này trên tạm tính.'
          : gift &&
              !draft.concentrated &&
              gift.basePrice > Math.floor(subtotal * LEGAL_MAX_DISCOUNT_RATE)
            ? `Món tặng quá ${LEGAL_PERCENT}% giá trị phần mua — luật không cho tặng.`
            : 'Đơn ví dụ chưa đủ điều kiện.'}
      </p>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span
        className={['min-w-0 truncate font-sans', strong ? 'text-ink-hi' : 'text-ink-body'].join(
          ' ',
        )}
      >
        {label}
      </span>
      <span className={strong ? 'text-ember-3' : 'text-ink-body'}>{value}</span>
    </div>
  )
}

/** Đổi phạm vi thì về kiểu đầu tiên của phạm vi đó, và bỏ những gì phạm vi mới không có */
function switchScope(draft: PromotionInput, scope: PromotionScope): PromotionInput {
  const kind = KINDS_BY_SCOPE[scope].includes(draft.kind) ? draft.kind : 'percent'
  return {
    ...switchKind({ ...draft, scope }, kind),
    badge: scope === 'item' ? draft.badge : null,
    requiresVoucher: scope === 'bill' ? draft.requiresVoucher : false,
  }
}

/** Đổi kiểu thì XOÁ con số của kiểu cũ — không gửi lên hai con số cho một chương trình */
function switchKind(draft: PromotionInput, kind: PromotionKind): PromotionInput {
  const keepTargets = draft.scope === 'item' || kind === 'free_dish'
  return {
    ...draft,
    kind,
    percentBp: kind === 'percent' ? (draft.percentBp ?? 1000) : null,
    amountVnd: kind === 'amount' ? (draft.amountVnd ?? 50_000) : null,
    setPriceVnd: kind === 'set_price' ? draft.setPriceVnd : null,
    buyQty: kind === 'buy_x_get_y' ? (draft.buyQty ?? 2) : null,
    getQty: kind === 'buy_x_get_y' ? (draft.getQty ?? 1) : null,
    getPercent: kind === 'buy_x_get_y' ? (draft.getPercent ?? 100) : null,
    giftDishId: kind === 'free_dish' ? draft.giftDishId : null,
    targetDishIds: keepTargets ? draft.targetDishIds : [],
    targetCategoryIds: keepTargets ? draft.targetCategoryIds : [],
  }
}

const toMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3 border-b border-line-1 pb-2">
        <span className="font-mono text-[length:var(--fs-c1)] text-accent-ink">{n}</span>
        <span className="text-[length:var(--fs-b1)] text-ink-hi">{title}</span>
        {hint ? <span className="text-[length:var(--fs-c1)] text-ink-mute">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

/**
 * Nhãn cho một NHÓM nút. `div` chứ không `label` như `Field`: label chuyển cú bấm
 * vào nút đầu tiên bên trong, bấm vào chữ "Kênh" là bật nhầm "Tại bàn".
 */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={[
        'text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase',
        className,
      ].join(' ')}
    >
      {children}
    </p>
  )
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

function SmallButton({
  onClick,
  accent,
  children,
}: {
  onClick: () => void
  accent?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-8 rounded-sm border px-2 text-[length:var(--fs-c1)] hover:bg-surface-3',
        accent ? 'border-accent text-accent-ink' : 'border-line-3 text-ink-body',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
