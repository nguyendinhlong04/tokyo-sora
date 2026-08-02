import { formatVnd } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type SupplierInput, type SupplierRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'
import { useSession } from '../session-context'

/**
 * S3 — Nhà cung cấp.
 *
 * Cấp CHUỖI như nguyên liệu: ba chi nhánh cùng thành phố mua chung một mối, và
 * khai ba lần là ba lần lệch số điện thoại.
 *
 * Bảng mặt hàng bên dưới mỗi nhà cung cấp không phải trang trí — đó là mốc để
 * S4 dựng đơn mà không bắt thủ kho nhớ giá, và để S5 cảnh báo khi giá nhập lệch
 * so với giá đã thoả thuận. Không có mốc thì không so được với gì cả.
 */

const blank = (): SupplierInput => ({
  code: '',
  name: '',
  taxCode: null,
  contactName: null,
  phone: null,
  email: null,
  address: null,
  paymentTermDays: 0,
  cutoffMinute: null,
  note: null,
  active: true,
})

export function Suppliers() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ input: SupplierInput; id?: number } | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const mayEdit = can('stock.receive')
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: api.suppliers })
  const ingredients = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['suppliers'] })

  const save = useMutation({
    mutationFn: ({ input, id }: { input: SupplierInput; id?: number }) => api.saveSupplier(input, id),
    onSuccess: () => {
      toast('Đã lưu nhà cung cấp', 'ok')
      setDraft(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = suppliers.data ?? []

  return (
    <>
      <PageHeader
        title="Nhà cung cấp"
        subtitle="Khai một lần cho cả chuỗi. Giá thoả thuận ở đây là mốc để đơn đặt hàng dựng sẵn và để phiếu nhập cảnh báo khi giá lệch."
        action={
          draft || !mayEdit ? null : (
            <Button variant="primary" onClick={() => setDraft({ input: blank() })}>
              Thêm nhà cung cấp
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {suppliers.isError ? <ErrorState message={(suppliers.error as Error).message} /> : null}

        {draft ? (
          <SupplierForm
            draft={draft.input}
            onChange={(input) => setDraft({ ...draft, input })}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        <div className="mt-5 flex flex-col gap-3">
          {suppliers.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">
              Chưa khai nhà cung cấp nào. Đơn đặt hàng S4 cần ít nhất một mối để lập được.
            </p>
          ) : (
            rows.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                mayEdit={mayEdit}
                open={open === supplier.id}
                ingredients={(ingredients.data ?? []).map((i) => ({
                  id: i.id,
                  name: i.name,
                  purchaseUnit: i.purchaseUnit,
                }))}
                onToggle={() => setOpen(open === supplier.id ? null : supplier.id)}
                onEdit={() => setDraft({ input: toInput(supplier), id: supplier.id })}
                onChanged={refresh}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function toInput(row: SupplierRow): SupplierInput {
  return {
    code: row.code,
    name: row.name,
    taxCode: row.taxCode,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    paymentTermDays: row.paymentTermDays,
    cutoffMinute: row.cutoffMinute,
    note: row.note,
    active: row.active,
  }
}

function SupplierCard({
  supplier,
  mayEdit,
  open,
  ingredients,
  onToggle,
  onEdit,
  onChanged,
}: {
  supplier: SupplierRow
  mayEdit: boolean
  open: boolean
  ingredients: { id: string; name: string; purchaseUnit: string }[]
  onToggle: () => void
  onEdit: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [item, setItem] = useState({ ingredientId: '', priceVnd: 0, minOrderPurchase: 1, leadTimeDays: 1, preferred: false })

  const run = <T,>(fn: () => Promise<T>, ok: string) =>
    fn()
      .then(() => {
        toast(ok, 'ok')
        onChanged()
      })
      .catch((err: Error) => toast(err.message, 'danger'))

  return (
    <section
      className={`overflow-hidden rounded-md border border-line-1 bg-surface-1 ${
        supplier.active ? '' : 'opacity-60'
      }`}
    >
      <div className="grid grid-cols-[1fr_170px_150px_120px_130px] items-center gap-3 px-5 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
            {supplier.name}
          </span>
          <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {supplier.code}
            {supplier.taxCode ? ` · MST ${supplier.taxCode}` : ''}
          </span>
        </span>
        <span className="text-[length:var(--fs-c1)] text-ink-body">
          {supplier.contactName ?? '—'}
          {supplier.phone ? (
            <span className="mt-0.5 block font-mono text-ink-mute">{supplier.phone}</span>
          ) : null}
        </span>
        <span className="text-[length:var(--fs-c1)] text-ink-mute">
          {supplier.paymentTermDays === 0 ? 'Trả ngay' : `NET ${supplier.paymentTermDays}`}
        </span>
        <span>
          <Badge tone={supplier.items.length > 0 ? 'neutral' : 'warn'}>
            {supplier.items.length} mặt hàng
          </Badge>
        </span>
        <span className="flex justify-end gap-2">
          {mayEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
            >
              Sửa
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
          >
            {open ? 'Thu' : 'Mặt hàng'}
          </button>
        </span>
      </div>

      {open ? (
        <div className="border-t border-line-1 bg-canvas px-5 py-4">
          <div className="grid grid-cols-[1fr_150px_110px_110px_110px_100px] gap-3 border-b border-line-1 pb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Mặt hàng</span>
            <span className="text-right">Giá thoả thuận</span>
            <span className="text-right">Đặt tối thiểu</span>
            <span className="text-right">Giao sau</span>
            <span>Mối chính</span>
            <span />
          </div>

          {supplier.items.length === 0 ? (
            <p className="py-3 text-[length:var(--fs-c1)] text-ink-mute">
              Chưa khai mặt hàng nào — đơn đặt hàng sẽ không gợi ý được giá.
            </p>
          ) : (
            supplier.items.map((row) => (
              <div
                key={row.ingredientId}
                className="grid grid-cols-[1fr_150px_110px_110px_110px_100px] items-center gap-3 border-b border-line-1 py-2 last:border-b-0"
              >
                <span className="truncate text-[length:var(--fs-c1)] text-ink-body">
                  {row.ingredientName}
                </span>
                <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
                  {formatVnd(row.priceVnd)}
                </span>
                <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {row.minOrderPurchase}
                </span>
                <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {row.leadTimeDays} ngày
                </span>
                <span>{row.preferred ? <Badge tone="accent">Mối chính</Badge> : null}</span>
                <span className="flex justify-end">
                  {mayEdit ? (
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () => api.removeSupplierItem(supplier.id, row.ingredientId),
                          'Đã bỏ mặt hàng',
                        )
                      }
                      className="h-7 rounded-sm border border-danger-line px-2 text-[length:var(--fs-c1)] text-danger hover:bg-danger/8"
                    >
                      Bỏ
                    </button>
                  ) : null}
                </span>
              </div>
            ))
          )}

          {mayEdit ? (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line-1 pt-4">
              <Field label="Thêm mặt hàng">
                <select
                  value={item.ingredientId}
                  onChange={(e) => setItem({ ...item, ingredientId: e.target.value })}
                  className="h-9 min-w-[220px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
                >
                  <option value="">Chọn nguyên liệu…</option>
                  {ingredients
                    .filter((i) => !supplier.items.some((s) => s.ingredientId === i.id))
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.purchaseUnit})
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Giá / đơn vị mua">
                <input
                  type="number"
                  value={item.priceVnd || ''}
                  onChange={(e) => setItem({ ...item, priceVnd: Number(e.target.value) || 0 })}
                  className="h-9 w-[140px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                />
              </Field>
              <Field label="Đặt tối thiểu">
                <input
                  type="number"
                  value={item.minOrderPurchase}
                  onChange={(e) =>
                    setItem({ ...item, minOrderPurchase: Number(e.target.value) || 1 })
                  }
                  className="h-9 w-[100px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                />
              </Field>
              <Field label="Giao sau (ngày)">
                <input
                  type="number"
                  value={item.leadTimeDays}
                  onChange={(e) => setItem({ ...item, leadTimeDays: Number(e.target.value) || 0 })}
                  className="h-9 w-[100px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                />
              </Field>
              <button
                type="button"
                onClick={() => setItem({ ...item, preferred: !item.preferred })}
                className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
                  item.preferred ? 'border-accent text-accent-ink' : 'border-line-3 text-ink-mute'
                }`}
              >
                {item.preferred ? 'Là mối chính' : 'Mối phụ'}
              </button>
              <Button
                disabled={!item.ingredientId || item.priceVnd <= 0}
                onClick={() =>
                  run(
                    () => api.setSupplierItem({ supplierId: supplier.id, ...item }),
                    'Đã lưu mặt hàng',
                  ).then(() =>
                    setItem({
                      ingredientId: '',
                      priceVnd: 0,
                      minOrderPurchase: 1,
                      leadTimeDays: 1,
                      preferred: false,
                    }),
                  )
                }
              >
                Thêm
              </Button>
            </div>
          ) : null}

          <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Một nguyên liệu chỉ có MỘT mối chính — đặt mối mới thì mối cũ tự nhường, vì hai mối
            chính nghĩa là không có mối nào.
          </p>
        </div>
      ) : null}
    </section>
  )
}

function SupplierForm({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: SupplierInput
  onChange: (next: SupplierInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) =>
    onChange({ ...draft, [key]: value })

  const ready = draft.code.trim() !== '' && draft.name.trim() !== ''

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Mã">
          <Input value={draft.code} onChange={(v) => set('code', v)} placeholder="NCC-BO" mono />
        </Field>
        <Field label="Tên nhà cung cấp">
          <Input value={draft.name} onChange={(v) => set('name', v)} placeholder="Lò mổ Vissan" />
        </Field>
        <Field label="Mã số thuế">
          <Input
            value={draft.taxCode ?? ''}
            onChange={(v) => set('taxCode', v || null)}
            placeholder="0301234567"
            mono
          />
        </Field>
        <Field label="Người liên hệ">
          <Input value={draft.contactName ?? ''} onChange={(v) => set('contactName', v || null)} />
        </Field>

        <Field label="Điện thoại">
          <Input value={draft.phone ?? ''} onChange={(v) => set('phone', v || null)} mono />
        </Field>
        <Field label="Email">
          <Input value={draft.email ?? ''} onChange={(v) => set('email', v || null)} />
        </Field>
        <Field label="Được nợ (ngày)">
          <Input
            type="number"
            value={String(draft.paymentTermDays)}
            onChange={(v) => set('paymentTermDays', Number(v) || 0)}
            mono
          />
        </Field>
        <Field label="Địa chỉ">
          <Input value={draft.address ?? ''} onChange={(v) => set('address', v || null)} />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => set('active', !draft.active)}
          className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
            draft.active ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
          }`}
        >
          {draft.active ? 'Đang hợp tác' : 'Ngừng hợp tác'}
        </button>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button variant="primary" disabled={!ready || saving} onClick={onSave}>
            Lưu
          </Button>
        </div>
      </div>
    </section>
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
