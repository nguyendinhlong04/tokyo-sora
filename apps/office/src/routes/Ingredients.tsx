import { formatVnd } from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type IngredientInput, type IngredientRow } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'
import { TextInput as Input, Toggle } from '../components/form'
import { useSession } from '../session-context'

/**
 * M7 — Nguyên liệu, và cửa nhập kho.
 *
 * Cột quan trọng nhất không phải giá mà là **quy đổi**: "1 kg = 1000 g". Sai một
 * con số ở đó thì mọi công thức dùng nguyên liệu này sai giá vốn theo đúng bội số
 * đó, và không có màn nào khác lộ ra điều đó — food cost chỉ hiện một con số đẹp
 * hoặc xấu chứ không nói vì sao.
 *
 * Giá bình quân KHÔNG sửa tay được: nó chỉ đổi qua phiếu nhập, theo bình quân gia
 * quyền di động. Cho sửa tay thì giá vốn hàng bán mất đường truy về chứng từ.
 */

const EMPTY: IngredientInput = {
  id: '',
  code: '',
  name: '',
  groupName: null,
  baseUnit: 'g',
  purchaseUnit: 'kg',
  basePerPurchase: 1_000,
  minLevelBase: 0,
  lotRequired: false,
  isSemiFinished: false,
  active: true,
  sort: 0,
}

export function Ingredients() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('recipe.edit')
  const mayReceive = can('stock.receive')

  const [draft, setDraft] = useState<IngredientInput | null>(null)
  const [receiving, setReceiving] = useState<IngredientRow | null>(null)

  const rows = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['ingredients'] })
  const fail = (err: Error) => toast(err.message, 'danger')

  const save = useMutation({
    mutationFn: (input: IngredientInput) =>
      rows.data?.some((r) => r.id === input.id)
        ? api.updateIngredient(input.id, input)
        : api.createIngredient(input),
    onSuccess: () => {
      toast('Đã lưu nguyên liệu', 'ok')
      setDraft(null)
      refresh()
    },
    onError: fail,
  })

  const list = rows.data ?? []

  return (
    <>
      <PageHeader
        title="Nguyên liệu"
        subtitle="Khai một lần cho cả chuỗi. Giá bình quân chỉ đổi qua phiếu nhập — không sửa tay được, để giá vốn luôn truy ngược được về chứng từ."
        action={
          mayEdit ? (
            <Button variant="primary" onClick={() => setDraft({ ...EMPTY })}>
              Thêm nguyên liệu
            </Button>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {draft ? (
          <IngredientForm
            draft={draft}
            existing={list.some((r) => r.id === draft.id)}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        {receiving ? (
          <ReceiveForm
            row={receiving}
            branchId={branchId!}
            onClose={() => setReceiving(null)}
            onDone={refresh}
          />
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={list}
            rowKey={(row) => row.id}
            loading={rows.isPending}
            empty="Chưa có nguyên liệu nào. Khai nguyên liệu trước, rồi mới khai được công thức món."
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
                header: 'Tên',
                width: 'minmax(200px, 1fr)',
                cell: (row) => (
                  <span className={row.active ? '' : 'opacity-60'}>
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.name}
                      {row.lotRequired ? (
                        <span className="ml-2 rounded-sm border border-line-3 px-1.5 py-0.5 text-[length:var(--fs-c2)] text-ink-mute">
                          theo lô
                        </span>
                      ) : null}
                    </span>
                    {row.groupName ? (
                      <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                        {row.groupName}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'convert',
                header: 'Quy đổi',
                width: '150px',
                cell: (row) => (
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    1 {row.purchaseUnit} = {row.basePerPurchase.toLocaleString('vi-VN')}{' '}
                    {row.baseUnit}
                  </span>
                ),
              },
              {
                key: 'cost',
                header: 'Giá bình quân',
                width: '140px',
                align: 'right',
                cell: (row) =>
                  row.costPerBaseMilli === 0 ? (
                    <span className="text-[length:var(--fs-c1)] text-warn">chưa có giá</span>
                  ) : (
                    <>
                      <span className="block font-mono text-[length:var(--fs-b2)] text-ink-hi">
                        {formatVnd(row.costPerPurchaseVnd)}
                      </span>
                      <span className="block text-[length:var(--fs-c2)] text-ink-mute">
                        mỗi {row.purchaseUnit}
                      </span>
                    </>
                  ),
              },
              {
                key: 'onhand',
                header: 'Tồn',
                width: '140px',
                align: 'right',
                cell: (row) => (
                  <>
                    <span
                      className={`block font-mono text-[length:var(--fs-b2)] ${
                        row.belowMin ? 'text-danger' : 'text-ink-body'
                      }`}
                    >
                      {row.qtyBase.toLocaleString('vi-VN')} {row.baseUnit}
                    </span>
                    <span className="block text-[length:var(--fs-c2)] text-ink-mute">
                      {formatVnd(row.valueVnd)}
                    </span>
                  </>
                ),
              },
              {
                key: 'used',
                header: 'Món dùng',
                width: '110px',
                numeric: true,
                cell: (row) => <span className="text-ink-mute">{row.usedByDishes}</span>,
              },
              {
                key: 'actions',
                header: '',
                width: '150px',
                cell: (row) => (
                  <span className="flex justify-end gap-1.5">
                    {mayReceive ? (
                      <Button onClick={() => setReceiving(row)} size="sm">
                        Nhập
                      </Button>
                    ) : null}
                    {mayEdit ? (
                      <Button onClick={() => setDraft({ ...row })} size="sm">
                        Sửa
                      </Button>
                    ) : null}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Cờ <span className="text-ink-body">theo lô</span> đã khai được nhưng chưa có tác dụng:
          bảng lô và hạn dùng FEFO (S9) chưa dựng, nên hiện chưa ai bắt buộc khai số lô lúc nhập hải
          sản, thịt bò hay keg. Nhà cung cấp (S3) và đơn đặt hàng (S4) cũng chưa có.
        </p>
      </div>
    </>
  )
}

function IngredientForm({
  draft,
  existing,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: IngredientInput
  existing: boolean
  onChange: (next: IngredientInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof IngredientInput>(key: K, value: IngredientInput[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {existing ? `Sửa ${draft.name}` : 'Nguyên liệu mới'}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Field label="Mã định danh">
          <Input
            value={draft.id}
            disabled={existing}
            onChange={(v) => set('id', v)}
            placeholder="ba-chi-bo"
          />
        </Field>
        <Field label="Mã kho">
          <Input value={draft.code} onChange={(v) => set('code', v)} placeholder="NL-BO-001" />
        </Field>
        <Field label="Tên">
          <Input value={draft.name} onChange={(v) => set('name', v)} placeholder="Ba chỉ bò" />
        </Field>
        <Field label="Nhóm">
          <Input
            value={draft.groupName ?? ''}
            onChange={(v) => set('groupName', v || null)}
            placeholder="Thịt bò"
          />
        </Field>

        <Field label="ĐVT cơ sở">
          <Input value={draft.baseUnit} onChange={(v) => set('baseUnit', v)} placeholder="g" />
        </Field>
        <Field label="ĐVT mua">
          <Input
            value={draft.purchaseUnit}
            onChange={(v) => set('purchaseUnit', v)}
            placeholder="kg"
          />
        </Field>
        <Field label={`1 ${draft.purchaseUnit || 'ĐVT mua'} = ? ${draft.baseUnit || 'ĐVT cơ sở'}`}>
          <Input
            type="number"
            value={String(draft.basePerPurchase)}
            onChange={(v) => set('basePerPurchase', Number(v) || 0)}
          />
        </Field>
        <Field label={`Định mức tối thiểu (${draft.baseUnit || 'ĐVT cơ sở'})`}>
          <Input
            type="number"
            value={String(draft.minLevelBase)}
            onChange={(v) => set('minLevelBase', Number(v) || 0)}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Toggle
          on={draft.lotRequired}
          onChange={() => set('lotRequired', !draft.lotRequired)}
          tone="ok"
        >
          Bắt buộc khai lô khi nhập
        </Toggle>
        <Toggle
          on={draft.isSemiFinished}
          onChange={() => set('isSemiFinished', !draft.isSemiFinished)}
          tone="ok"
        >
          Bán thành phẩm (pha ở bếp)
        </Toggle>
        <Toggle on={draft.active} onChange={() => set('active', !draft.active)} tone="ok">
          Đang dùng
        </Toggle>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            Lưu
          </Button>
        </div>
      </div>

      <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Chọn đơn vị cơ sở đủ nhỏ để định lượng công thức luôn là số nguyên: gam cho thịt rau, ml cho
        chất lỏng, cái cho đồ đếm được. Đơn vị mua là thứ ghi trên hoá đơn nhà cung cấp.{' '}
        <span className="text-ink-body">Bán thành phẩm</span> là thứ pha ở bếp chứ không mua ngoài
        (sốt, nước dùng, kim chi) — bật cờ đó rồi khai công thức mẻ ở M8.
      </p>
    </section>
  )
}

function ReceiveForm({
  row,
  branchId,
  onClose,
  onDone,
}: {
  row: IngredientRow
  branchId: string
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [qty, setQty] = useState('')
  const [total, setTotal] = useState('')
  const [note, setNote] = useState('')

  const receive = useMutation({
    mutationFn: () =>
      api.receiveStock({
        branchId,
        ingredientId: row.id,
        qtyPurchase: Number(qty),
        totalVnd: Number(total),
        note: note || null,
      }),
    onSuccess: (result) => {
      const before = row.costPerBaseMilli
      const after = result.costPerBaseMilli
      const perPurchase = (milli: number) => Math.round((row.basePerPurchase * milli) / 1_000)
      toast(
        before === 0 || before === after
          ? `Đã nhập kho. Giá bình quân: ${formatVnd(perPurchase(after))}/${row.purchaseUnit}`
          : `Đã nhập. Giá bình quân đổi ${formatVnd(perPurchase(before))} → ${formatVnd(perPurchase(after))} mỗi ${row.purchaseUnit}`,
        'ok',
      )
      onDone()
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const qtyNumber = Number(qty)
  const totalNumber = Number(total)
  const unitPreview = qtyNumber > 0 && totalNumber >= 0 ? Math.round(totalNumber / qtyNumber) : null

  return (
    <section className="mt-5 rounded-md border border-accent bg-surface-1 p-5">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Nhập kho · {row.name}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Field label={`Số lượng (${row.purchaseUnit})`}>
          <Input type="number" value={qty} onChange={setQty} placeholder="12" />
        </Field>
        <Field label="Tiền hàng (₫)">
          <Input type="number" value={total} onChange={setTotal} placeholder="3420000" />
        </Field>
        <Field label="Ghi chú">
          <Input value={note} onChange={setNote} placeholder="Hoá đơn số…" />
        </Field>
        <div className="flex items-end gap-2">
          <Button onClick={onClose}>Bỏ</Button>
          <Button
            variant="primary"
            disabled={!(qtyNumber > 0) || receive.isPending}
            onClick={() => receive.mutate()}
          >
            Ghi nhập
          </Button>
        </div>
      </div>

      {unitPreview !== null ? (
        <p className="mt-3 text-[length:var(--fs-c1)] text-ink-body">
          Lô này {formatVnd(unitPreview)} mỗi {row.purchaseUnit}
          {row.costPerBaseMilli > 0 ? (
            <>
              {' '}
              · giá bình quân hiện tại {formatVnd(row.costPerPurchaseVnd)} — nhập xong sẽ trộn hai
              con số theo trọng số của lượng, không lấy trung bình cộng.
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}
