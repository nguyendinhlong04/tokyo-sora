import { formatVnd } from '@sora/contracts'
import { SegmentedControl } from '../components/form'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PurchaseOrderRow, type ReceiveResult, type ReorderRow } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * S4 — Đơn đặt hàng, và S5 — Nhập kho theo lô.
 *
 * Hai màn ở một file vì chúng là hai đầu của cùng một việc: đặt rồi nhận. Nhận
 * hàng KHÔNG đóng đơn bằng tay — phiếu nhập gắn vào dòng đơn, và đơn tự sang
 * "đã nhận" khi mọi dòng đã đủ. Nhận thiếu thì đơn ở lại "đã gửi", và đó chính
 * là danh sách còn nợ hàng mà người mua cần thấy.
 */

const STATE_LABELS: Record<
  PurchaseOrderRow['state'],
  { label: string; tone: 'neutral' | 'accent' | 'ok' | 'danger' }
> = {
  draft: { label: 'Nháp', tone: 'neutral' },
  sent: { label: 'Đã gửi', tone: 'accent' },
  received: { label: 'Đã nhận đủ', tone: 'ok' },
  cancelled: { label: 'Đã huỷ', tone: 'danger' },
}

// ===================================================================== S4

export function PurchaseOrders() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'orders' | 'suggest'>('suggest')
  const [cart, setCart] = useState<Record<string, number>>({})

  const mayEdit = can('stock.receive')

  const orders = useQuery({
    queryKey: ['purchase-orders', branchId],
    queryFn: () => api.purchaseOrders(branchId!),
    enabled: Boolean(branchId),
  })
  const suggestions = useQuery({
    queryKey: ['reorder', branchId],
    queryFn: () => api.reorderSuggestions(branchId!),
    enabled: Boolean(branchId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    void queryClient.invalidateQueries({ queryKey: ['reorder'] })
  }

  const create = useMutation({
    mutationFn: (input: {
      supplierId: number
      lines: { ingredientId: string; qtyPurchase: number; priceVnd: number }[]
    }) =>
      api.createPurchaseOrder({
        branchId: branchId!,
        supplierId: input.supplierId,
        expectedOn: null,
        note: 'Lập từ gợi ý tốc độ tiêu thụ',
        lines: input.lines,
      }),
    onSuccess: (res) => {
      toast(`Đã lập đơn ${res.displayCode}`, 'ok')
      setCart({})
      setTab('orders')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'send' | 'cancel' }) =>
      action === 'send' ? api.sendPurchaseOrder(id) : api.cancelPurchaseOrder(id, 'Không cần nữa'),
    onSuccess: () => {
      toast('Đã cập nhật đơn', 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = suggestions.data ?? []
  /** Gom theo mối chính: một đơn cho một nhà cung cấp, không phải một đơn mỗi món */
  const bySupplier = new Map<number, { name: string; lines: ReorderRow[] }>()
  for (const row of rows) {
    if (row.supplierId === null || (cart[row.ingredientId] ?? row.suggestPurchase) <= 0) continue
    const entry = bySupplier.get(row.supplierId) ?? { name: row.supplierName ?? '?', lines: [] }
    entry.lines.push(row)
    bySupplier.set(row.supplierId, entry)
  }

  return (
    <>
      <PageHeader
        title="Đơn đặt hàng"
        subtitle="Gợi ý theo tốc độ tiêu thụ 14 ngày, đã trừ phần đã đặt chưa về. Nhận hàng ở màn Nhập kho sẽ tự đóng đơn khi đủ."
        action={
          <SegmentedControl
            size="md"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'suggest', label: 'Gợi ý đặt hàng' },
              { value: 'orders', label: `Đơn (${(orders.data ?? []).length})` },
            ]}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {tab === 'suggest' ? (
          <>
            {suggestions.isError ? (
              <ErrorState message={(suggestions.error as Error).message} />
            ) : null}

            <DataTable
              rows={rows}
              rowKey={(row) => row.ingredientId}
              loading={suggestions.isPending}
              empty="Không có nguyên liệu nào cần đặt thêm."
              columns={[
                {
                  key: 'name',
                  header: 'Nguyên liệu',
                  width: 'minmax(200px, 1fr)',
                  cell: (row) => (
                    <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.ingredientName}
                    </span>
                  ),
                },
                {
                  key: 'onHand',
                  header: 'Tồn',
                  width: '130px',
                  numeric: true,
                  cell: (row) => (
                    <span
                      className={
                        row.onHandBase < row.minLevelBase ? 'text-danger' : 'text-ink-body'
                      }
                    >
                      {row.onHandBase} {row.baseUnit}
                    </span>
                  ),
                },
                {
                  key: 'perDay',
                  header: 'Dùng / ngày',
                  width: '120px',
                  numeric: true,
                  cell: (row) => <span className="text-ink-mute">{row.perDayBase}</span>,
                },
                {
                  key: 'cover',
                  header: 'Đủ mấy ngày',
                  width: '120px',
                  numeric: true,
                  cell: (row) => (
                    <span
                      className={
                        row.daysOfCover !== null && row.daysOfCover <= 2
                          ? 'text-warn'
                          : 'text-ink-mute'
                      }
                    >
                      {row.daysOfCover === null ? '—' : `${row.daysOfCover}`}
                    </span>
                  ),
                },
                {
                  key: 'pending',
                  header: 'Đang về',
                  width: '110px',
                  numeric: true,
                  cell: (row) => (
                    <span className="text-ink-mute">{row.pendingPurchase || '—'}</span>
                  ),
                },
                {
                  key: 'supplier',
                  header: 'Mối chính',
                  width: '150px',
                  cell: (row) => (
                    <span className="truncate text-[length:var(--fs-c1)] text-ink-body">
                      {row.supplierName ?? <span className="text-warn">Chưa có mối</span>}
                    </span>
                  ),
                },
                {
                  key: 'order',
                  header: 'Đặt',
                  width: '130px',
                  align: 'right',
                  cell: (row) => (
                    <span className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        value={cart[row.ingredientId] ?? row.suggestPurchase}
                        onChange={(e) =>
                          setCart({ ...cart, [row.ingredientId]: Number(e.target.value) || 0 })
                        }
                        className="h-8 w-[70px] rounded-sm border border-line-1 bg-canvas px-2 text-right font-mono text-[length:var(--fs-c1)] text-ink-hi"
                      />
                      <span className="text-[length:var(--fs-c2)] text-ink-mute">
                        {row.purchaseUnit}
                      </span>
                    </span>
                  ),
                },
              ]}
            />

            {mayEdit && bySupplier.size > 0 ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {[...bySupplier.entries()].map(([supplierId, entry]) => (
                  <Button
                    key={supplierId}
                    variant="primary"
                    disabled={create.isPending}
                    onClick={() =>
                      create.mutate({
                        supplierId,
                        lines: entry.lines.map((l) => ({
                          ingredientId: l.ingredientId,
                          qtyPurchase: cart[l.ingredientId] ?? l.suggestPurchase,
                          priceVnd: l.priceVnd ?? 0,
                        })),
                      })
                    }
                  >
                    Lập đơn cho {entry.name} ({entry.lines.length} dòng)
                  </Button>
                ))}
              </div>
            ) : null}

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Lượng gợi ý = tốc độ ngày × (thời gian giao + số ngày muốn đủ hàng) − tồn − phần đã
              đặt chưa về. Trừ phần đang về là chỗ hay quên, và quên nó nghĩa là mỗi lần mở màn lại
              đặt thêm một đơn cho cùng một thiếu hụt. Hai con số ngày đặt ở Trung tâm tham số.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.isPending ? (
              <p className="text-ink-mute">Đang tải…</p>
            ) : (orders.data ?? []).length === 0 ? (
              <p className="text-[length:var(--fs-b2)] text-ink-mute">Chưa có đơn nào.</p>
            ) : (
              orders.data!.map((po) => (
                <OrderCard
                  key={po.id}
                  order={po}
                  mayEdit={mayEdit}
                  busy={act.isPending}
                  onAct={(action) => act.mutate({ id: po.id, action })}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  )
}

function OrderCard({
  order,
  mayEdit,
  busy,
  onAct,
}: {
  order: PurchaseOrderRow
  mayEdit: boolean
  busy: boolean
  onAct: (action: 'send' | 'cancel') => void
}) {
  const state = STATE_LABELS[order.state]
  return (
    <section className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
      <div className="flex flex-wrap items-center gap-4 px-5 py-3">
        <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
          {order.displayCode}
        </span>
        <span className="text-[length:var(--fs-b2)] text-ink-body">{order.supplierName}</span>
        <Badge tone={state.tone}>{state.label}</Badge>
        {order.expectedOn ? (
          <span className="text-[length:var(--fs-c1)] text-ink-mute">
            hẹn {formatDay(order.expectedOn)}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[length:var(--fs-b2)] text-ink-hi">
          {formatVnd(order.totalVnd)}
        </span>
        {mayEdit && order.state === 'draft' ? (
          <Button disabled={busy} onClick={() => onAct('send')}>
            Gửi đơn
          </Button>
        ) : null}
        {mayEdit && order.state !== 'received' && order.state !== 'cancelled' ? (
          <Button disabled={busy} onClick={() => onAct('cancel')} size="sm" variant="danger">
            Huỷ
          </Button>
        ) : null}
      </div>

      <div className="border-t border-line-1 bg-canvas">
        {order.lines.map((line) => (
          <div
            key={line.id}
            className="grid grid-cols-[1fr_120px_120px_130px_130px] items-center gap-3 border-b border-line-1 px-5 py-2 last:border-b-0"
          >
            <span className="truncate text-[length:var(--fs-c1)] text-ink-body">
              {line.ingredientName}
            </span>
            <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
              {line.qtyPurchase} {line.purchaseUnit}
            </span>
            <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
              {formatVnd(line.priceVnd)}
            </span>
            <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
              nhận {line.receivedPurchase}
            </span>
            <span className="text-right font-mono text-[length:var(--fs-c1)]">
              {line.outstandingPurchase > 0 ? (
                <span className="text-warn">còn {line.outstandingPurchase}</span>
              ) : (
                <span className="text-ok">đủ</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ===================================================================== S5

export function Receiving() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [result, setResult] = useState<ReceiveResult | null>(null)
  const [form, setForm] = useState({
    ingredientId: '',
    qtyPurchase: 0,
    totalVnd: 0,
    supplierId: 0,
    purchaseOrderId: 0,
    lotCode: '',
    expiresOn: '',
    receiveTempDeciC: '',
    note: '',
  })

  const mayEdit = can('stock.receive')
  const ingredients = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: api.suppliers })
  const orders = useQuery({
    queryKey: ['purchase-orders', branchId, 'sent'],
    queryFn: () => api.purchaseOrders(branchId!, 'sent'),
    enabled: Boolean(branchId),
  })

  const receive = useMutation({
    mutationFn: () =>
      api.receiveLot({
        branchId: branchId!,
        ingredientId: form.ingredientId,
        qtyPurchase: form.qtyPurchase,
        totalVnd: form.totalVnd,
        supplierId: form.supplierId || null,
        purchaseOrderId: form.purchaseOrderId || null,
        lotCode: form.lotCode.trim() || null,
        expiresOn: form.expiresOn || null,
        receiveTempDeciC:
          form.receiveTempDeciC === '' ? null : Math.round(Number(form.receiveTempDeciC) * 10),
        note: form.note.trim() || null,
      }),
    onSuccess: (res) => {
      setResult(res)
      toast('Đã nhập kho', 'ok')
      setForm({ ...form, qtyPurchase: 0, totalVnd: 0, lotCode: '', expiresOn: '', note: '' })
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      void queryClient.invalidateQueries({ queryKey: ['lots'] })
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const selected = (ingredients.data ?? []).find((i) => i.id === form.ingredientId)
  const ready = form.ingredientId !== '' && form.qtyPurchase > 0 && form.totalVnd >= 0

  return (
    <>
      <PageHeader
        title="Nhập kho"
        subtitle="Cửa duy nhất làm đổi giá bình quân. Hải sản sống, thịt bò và keg bắt buộc khai số lô và hạn dùng."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <section className="rounded-md border border-line-1 bg-surface-1 p-6">
          <div className="grid gap-4 lg:grid-cols-4">
            <Field label="Nguyên liệu">
              <select
                value={form.ingredientId}
                onChange={(e) => setForm({ ...form, ingredientId: e.target.value })}
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              >
                <option value="">Chọn…</option>
                {(ingredients.data ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.purchaseUnit})
                  </option>
                ))}
              </select>
            </Field>

            <Field label={`Lượng nhập${selected ? ` (${selected.purchaseUnit})` : ''}`}>
              <NumberInput
                value={form.qtyPurchase}
                onChange={(v) => setForm({ ...form, qtyPurchase: v })}
                step="0.001"
              />
            </Field>

            <Field label="Tiền hàng (₫)">
              <NumberInput
                value={form.totalVnd}
                onChange={(v) => setForm({ ...form, totalVnd: Math.round(v) })}
              />
            </Field>

            <Field label="Nhà cung cấp">
              <select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: Number(e.target.value) })}
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              >
                <option value={0}>Không khai</option>
                {(suppliers.data ?? [])
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label={`Số lô${selected?.lotRequired ? ' (bắt buộc)' : ''}`}>
              <TextInput
                value={form.lotCode}
                onChange={(v) => setForm({ ...form, lotCode: v })}
                placeholder="LO-0812"
                mono
              />
            </Field>
            <Field label={`Hạn dùng${selected?.lotRequired ? ' (bắt buộc)' : ''}`}>
              <DateInput
                value={form.expiresOn}
                onChange={(v) => setForm({ ...form, expiresOn: v })}
              />
            </Field>
            <Field label="Nhiệt độ nhận (°C)">
              <TextInput
                value={form.receiveTempDeciC}
                onChange={(v) => setForm({ ...form, receiveTempDeciC: v })}
                placeholder="-18"
                mono
              />
            </Field>
            <Field label="Ghi vào đơn đặt hàng">
              <select
                value={form.purchaseOrderId}
                onChange={(e) => setForm({ ...form, purchaseOrderId: Number(e.target.value) })}
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
              >
                <option value={0}>Không qua đơn</option>
                {(orders.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayCode} · {o.supplierName}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Field label="Ghi chú">
              <TextInput
                value={form.note}
                onChange={(v) => setForm({ ...form, note: v })}
                placeholder="Hàng về sớm 1 tiếng"
              />
            </Field>
            <Button
              className="mt-6 ml-auto"
              variant="primary"
              disabled={!ready || !mayEdit || receive.isPending}
              onClick={() => receive.mutate()}
            >
              Nhập kho
            </Button>
          </div>
        </section>

        {result ? (
          <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">Vừa nhập</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <Stat label="Vào kho" value={`${result.qtyBase}`} />
              <Stat
                label="Giá bình quân mới"
                value={`${(result.costPerBaseMilli / 1_000).toLocaleString('vi-VN')}₫`}
                hint={`trước: ${(result.costPerBaseMilliBefore / 1_000).toLocaleString('vi-VN')}₫`}
              />
              <Stat label="Đơn giá trả" value={formatVnd(result.unitPaidVnd)} />
              {result.priceVarianceBp !== null ? (
                <Stat
                  label="Lệch giá thoả thuận"
                  value={`${result.priceVarianceBp > 0 ? '+' : ''}${(result.priceVarianceBp / 100).toFixed(1)}%`}
                  tone={Math.abs(result.priceVarianceBp) >= 500 ? 'warn' : undefined}
                  hint={
                    result.agreedPriceVnd === null
                      ? undefined
                      : `thoả thuận ${formatVnd(result.agreedPriceVnd)}`
                  }
                />
              ) : null}
            </div>
            <p className="mt-4 max-w-[760px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Lệch giá KHÔNG chặn nhập hàng: giá chợ lên xuống là chuyện thường, và chặn nghĩa là
              hàng đứng ngoài cửa trong khi người ta đi tìm quản lý. Con số ở đây để người mua biết
              mà hỏi lại nhà cung cấp.
            </p>
          </section>
        ) : null}
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'warn'
}) {
  return (
    <div className="rounded-sm border border-line-1 bg-canvas px-4 py-3">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
        {label}
      </p>
      <p
        className={`mt-1.5 font-mono text-[length:var(--fs-t2)] ${
          tone === 'warn' ? 'text-warn' : 'text-ink-hi'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">{hint}</p> : null}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}

function NumberInput({
  value,
  onChange,
  step,
}: {
  value: number
  onChange: (next: number) => void
  step?: string
}) {
  return (
    <input
      type="number"
      step={step}
      value={value || ''}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
    />
  )
}
