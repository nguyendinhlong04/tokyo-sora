import { formatVnd } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type InputInvoiceInput, type MissingInvoiceVoucher } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * C5 — Hoá đơn đầu vào.
 *
 * Phiếu chi là **tiền đã ra**; hoá đơn là **chứng từ chứng minh khoản đó được
 * khấu trừ VAT**. Chi 5 triệu tiền chợ có phiếu chi mà không có hoá đơn thì tiền
 * vẫn ra, còn VAT thì không đòi lại được — mất tiền thật, mà chỗ mất không hiện
 * ra ở bất kỳ báo cáo nào khác.
 *
 * Nên nửa dưới màn này quan trọng hơn nửa trên: danh sách phiếu chi lớn CHƯA có
 * hoá đơn. Ngưỡng lấy từ hạn mức chi vặt A6 — dưới mức đó là chi vặt, không ai
 * đòi hoá đơn.
 *
 * F4 cộng VAT đầu vào từ chính sổ này, chỉ những tờ đánh dấu được khấu trừ.
 */

const monthStart = () => new Date().toISOString().slice(0, 8) + '01'
const today = () => new Date().toISOString().slice(0, 10)

const blank = (branchId: string, voucher?: MissingInvoiceVoucher): InputInvoiceInput => ({
  branchId,
  voucherId: voucher?.id ?? null,
  sellerName: voucher?.supplier ?? '',
  sellerTaxCode: '',
  invoiceNo: '',
  serial: null,
  issuedOn: voucher?.paidOn ?? today(),
  netVnd: voucher ? voucher.amountVnd - voucher.vatVnd : 0,
  vatVnd: voucher?.vatVnd ?? 0,
  deductible: true,
  note: null,
})

export function InputInvoices() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [draft, setDraft] = useState<InputInvoiceInput | null>(null)

  const mayEdit = can('expense.approve')

  const book = useQuery({
    queryKey: ['input-invoices', branchId, from, to],
    queryFn: () => api.inputInvoices(branchId!, from, to),
    enabled: Boolean(branchId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['input-invoices'] })
    void queryClient.invalidateQueries({ queryKey: ['tax-report'] })
  }

  const create = useMutation({
    mutationFn: (input: InputInvoiceInput) => api.createInputInvoice(input),
    onSuccess: () => {
      toast('Đã ghi hoá đơn', 'ok')
      setDraft(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, deductible }: { id: number; deductible: boolean }) =>
      api.updateInputInvoice(id, { deductible }),
    onSuccess: () => {
      toast('Đã đổi trạng thái khấu trừ', 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteInputInvoice(id),
    onSuccess: () => {
      toast('Đã xoá hoá đơn', 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const data = book.data
  const rows = data?.rows ?? []
  const missing = data?.missingVouchers ?? []

  return (
    <>
      <PageHeader
        title="Hoá đơn đầu vào"
        subtitle="Chứng từ quyết định số VAT được khấu trừ trên tờ khai F4. Không có hoá đơn thì tiền vẫn ra, còn thuế thì không đòi lại được."
        action={
          <div className="flex items-end gap-3">
            <Field label="Từ ngày">
              <DateInput value={from} onChange={setFrom} />
            </Field>
            <Field label="Đến ngày">
              <DateInput value={to} onChange={setTo} />
            </Field>
            {draft || !mayEdit || !branchId ? null : (
              <Button variant="primary" onClick={() => setDraft(blank(branchId))}>
                Ghi hoá đơn
              </Button>
            )}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {book.isError ? <ErrorState message={(book.error as Error).message} /> : null}

        {data ? (
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                VAT được khấu trừ
              </p>
              <p className="mt-2 font-mono text-[length:var(--fs-d3)] leading-none text-ink-hi">
                {formatVnd(data.deductibleVnd)}
              </p>
              <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                {rows.filter((r) => r.deductible).length} tờ · đây là số F4 cộng vào thuế đầu vào
              </p>
            </div>

            <div
              className={`rounded-md border px-5 py-4 ${
                data.declaredButUndocumentedVnd > 0
                  ? 'border-danger bg-surface-1'
                  : 'border-line-1 bg-surface-1'
              }`}
            >
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                VAT khai trên phiếu mà chưa có hoá đơn
              </p>
              <p
                className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${
                  data.declaredButUndocumentedVnd > 0 ? 'text-danger' : 'text-ink-hi'
                }`}
              >
                {formatVnd(data.declaredButUndocumentedVnd)}
              </p>
              <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                Số này KHÔNG vào tờ khai — không có chứng từ thì không khấu trừ được
              </p>
            </div>

            <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Phiếu chi thiếu hoá đơn
              </p>
              <p
                className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${
                  missing.length > 0 ? 'text-warn' : 'text-ink-hi'
                }`}
              >
                {missing.length}
              </p>
              <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                Từ {formatVnd(data.thresholdVnd)} trở lên · ngưỡng đặt ở A6
              </p>
            </div>
          </div>
        ) : null}

        {draft ? (
          <InvoiceForm
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => create.mutate(draft)}
            saving={create.isPending}
          />
        ) : null}

        {missing.length > 0 ? (
          <section className="mt-5">
            <h2 className="mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-warn uppercase">
              Phiếu chi đã duyệt còn thiếu hoá đơn ({missing.length})
            </h2>
            <div className="overflow-hidden rounded-md border border-warn bg-surface-1">
              {missing.map((voucher) => (
                <div
                  key={voucher.id}
                  className="grid grid-cols-[110px_1fr_170px_140px_130px_130px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
                >
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(voucher.paidOn)}
                  </span>
                  <span className="min-w-0 truncate text-[length:var(--fs-b2)] text-ink-hi">
                    {voucher.memo ?? voucher.categoryName}
                  </span>
                  <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                    {voucher.supplier ?? '—'}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                    {formatVnd(voucher.amountVnd)}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-danger">
                    {voucher.vatVnd > 0 ? `VAT ${formatVnd(voucher.vatVnd)}` : '—'}
                  </span>
                  <span className="flex justify-end">
                    {mayEdit ? (
                      <button
                        type="button"
                        onClick={() => setDraft(blank(branchId!, voucher))}
                        className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                      >
                        Gắn hoá đơn
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <h2 className="mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Sổ hoá đơn ({rows.length})
          </h2>
          <div className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
            <div className="grid grid-cols-[110px_1fr_130px_150px_130px_120px_130px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              <span>Ngày HĐ</span>
              <span>Người bán</span>
              <span>Số HĐ</span>
              <span className="text-right">Trước thuế</span>
              <span className="text-right">VAT</span>
              <span>Khấu trừ</span>
              <span />
            </div>

            {book.isPending ? (
              <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
            ) : rows.length === 0 ? (
              <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                Chưa ghi hoá đơn đầu vào nào trong khoảng này.
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-[110px_1fr_130px_150px_130px_120px_130px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0 ${
                    row.deductible ? '' : 'opacity-60'
                  }`}
                >
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(row.issuedOn)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.sellerName}
                    </span>
                    <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {row.sellerTaxCode}
                      {row.voucherId ? ` · phiếu #${row.voucherId}` : ' · chưa gắn phiếu chi'}
                    </span>
                  </span>
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
                    {row.serial ? `${row.serial}/` : ''}
                    {row.invoiceNo}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-body">
                    {formatVnd(row.netVnd)}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                    {formatVnd(row.vatVnd)}
                  </span>
                  <span>
                    {row.deductible ? (
                      <Badge tone="ok">Được khấu trừ</Badge>
                    ) : (
                      <Badge>Không khấu trừ</Badge>
                    )}
                  </span>
                  <span className="flex justify-end gap-2">
                    {mayEdit ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggle.mutate({ id: row.id, deductible: !row.deductible })}
                          className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                        >
                          {row.deductible ? 'Loại' : 'Nhận'}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove.mutate(row.id)}
                          className="h-8 rounded-sm border border-danger-line px-2 text-[length:var(--fs-c1)] text-danger hover:bg-danger/8"
                        >
                          Xoá
                        </button>
                      </>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          "Loại" dùng cho tờ hoá đơn có thật nhưng không được khấu trừ — chi tiếp khách vượt mức,
          hoá đơn mang tên cá nhân, hàng dùng cho hoạt động không chịu thuế. Ghi nhận rồi loại vẫn
          tốt hơn là xoá đi rồi quên mất là đã có. Chưa có trong bản dựng này: ảnh chụp hoá đơn và
          đọc tự động từ hoá đơn điện tử của nhà cung cấp.
        </p>
      </div>
    </>
  )
}

function InvoiceForm({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: InputInvoiceInput
  onChange: (next: InputInvoiceInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof InputInvoiceInput>(key: K, value: InputInvoiceInput[K]) =>
    onChange({ ...draft, [key]: value })

  const ready =
    draft.sellerName.trim() !== '' &&
    /^\d{10}(-\d{3})?$/.test(draft.sellerTaxCode.trim()) &&
    draft.invoiceNo.trim() !== '' &&
    draft.netVnd > 0 &&
    draft.vatVnd <= draft.netVnd

  return (
    <section className="mt-4 rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Người bán">
          <Input
            value={draft.sellerName}
            onChange={(v) => set('sellerName', v)}
            placeholder="Công ty TNHH Thực phẩm ABC"
          />
        </Field>
        <Field label="Mã số thuế người bán">
          <Input
            value={draft.sellerTaxCode}
            onChange={(v) => set('sellerTaxCode', v)}
            placeholder="0101234567"
            mono
          />
        </Field>
        <Field label="Ký hiệu">
          <Input
            value={draft.serial ?? ''}
            onChange={(v) => set('serial', v || null)}
            placeholder="1C26TAA"
            mono
          />
        </Field>
        <Field label="Số hoá đơn">
          <Input value={draft.invoiceNo} onChange={(v) => set('invoiceNo', v)} placeholder="00012345" mono />
        </Field>

        <Field label="Ngày hoá đơn">
          <DateInput value={draft.issuedOn} onChange={(v) => set('issuedOn', v)} />
        </Field>
        <Field label="Tiền trước thuế (₫)">
          <Input
            type="number"
            value={String(draft.netVnd)}
            onChange={(v) => set('netVnd', Number(v) || 0)}
            mono
          />
        </Field>
        <Field label="VAT (₫)">
          <Input
            type="number"
            value={String(draft.vatVnd)}
            onChange={(v) => set('vatVnd', Number(v) || 0)}
            mono
          />
        </Field>
        <Field label="Phiếu chi (tuỳ chọn)">
          <Input
            type="number"
            value={draft.voucherId === null ? '' : String(draft.voucherId)}
            onChange={(v) => set('voucherId', Number(v) || null)}
            placeholder="mã phiếu"
            mono
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => set('deductible', !draft.deductible)}
          className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
            draft.deductible ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
          }`}
        >
          {draft.deductible ? 'Được khấu trừ' : 'Không khấu trừ'}
        </button>
        <p className="max-w-[480px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Gắn phiếu chi là tuỳ chọn — hoá đơn và tiền ra đến theo hai nhịp khác nhau. Gắn sau cũng
          được.
        </p>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button variant="primary" disabled={!ready || saving} onClick={onSave}>
            Lưu hoá đơn
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
