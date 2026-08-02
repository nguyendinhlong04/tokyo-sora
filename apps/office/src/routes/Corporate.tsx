import { formatVnd } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type CorporateInput, type CorporateRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * B15 — Khách doanh nghiệp.
 *
 * Ranh giới của màn này là ranh giới DỒN TÍCH / DÒNG TIỀN: ghi nợ là doanh thu
 * ghi nhận ngay nhưng không đồng nào vào sổ quỹ; tiền về mới là dòng tiền, và
 * lúc đó mới gạch nợ. Cột "Còn nợ" ở đây và ô Phải thu của F5 đọc CÙNG một nguồn.
 *
 * Thứ đáng nhìn nhất trên mỗi hàng là cột cuối: hồ sơ nào đang bị POS từ chối ghi
 * nợ, và vì sao. Đó là câu hỏi mà thu ngân sẽ gọi điện hỏi kế toán lúc 8 giờ tối.
 */

const monthStart = () => {
  const at = new Date()
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString().slice(0, 10)
}
const today = () => new Date().toISOString().slice(0, 10)

const blank = (): CorporateInput => ({
  code: '',
  name: '',
  taxCode: '',
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  address: null,
  creditLimitVnd: 20_000_000,
  paymentTermDays: 30,
  reconcileDay: 1,
  blockAfterOverdueDays: null,
  einvoiceMode: null,
  active: true,
})

export function Corporate() {
  const { can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ input: CorporateInput; id?: number } | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const mayEdit = can('corporate.edit-profile')
  const companies = useQuery({ queryKey: ['corporate'], queryFn: api.corporate })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['corporate'] })

  const save = useMutation({
    mutationFn: ({ input, id }: { input: CorporateInput; id?: number }) =>
      api.saveCorporate(input, id),
    onSuccess: () => {
      toast('Đã lưu hồ sơ', 'ok')
      setDraft(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = companies.data ?? []
  const outstanding = rows.reduce((sum, r) => sum + r.outstandingVnd, 0)

  return (
    <>
      <PageHeader
        title="Khách doanh nghiệp"
        subtitle="Hạn mức nợ và điều khoản thanh toán quyết định quầy có ghi nợ được hay không. Quá hạn quá số ngày cho phép là POS tự chặn — không cần ai nhớ."
        action={
          draft || !mayEdit ? null : (
            <Button variant="primary" onClick={() => setDraft({ input: blank() })}>
              Thêm công ty
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {companies.isError ? <ErrorState message={(companies.error as Error).message} /> : null}

        {draft ? (
          <CorporateForm
            draft={draft.input}
            onChange={(input) => setDraft({ ...draft, input })}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        {rows.length > 0 ? (
          <p className="mt-5 text-[length:var(--fs-c1)] text-ink-mute">
            Tổng đang nợ:{' '}
            <span className="font-mono text-ink-hi">{formatVnd(outstanding)}</span> trên{' '}
            {rows.length} hồ sơ
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-3">
          {companies.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">
              Chưa có công ty nào. Hình thức <em>Ghi nợ công ty</em> ở quầy chỉ hiện khi có ít nhất
              một hồ sơ đang hoạt động.
            </p>
          ) : (
            rows.map((company) => (
              <CorporateCard
                key={company.id}
                company={company}
                mayEdit={mayEdit}
                open={open === company.id}
                onToggle={() => setOpen(open === company.id ? null : company.id)}
                onEdit={() => setDraft({ input: toInput(company), id: company.id })}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function toInput(row: CorporateRow): CorporateInput {
  return {
    code: row.code,
    name: row.name,
    taxCode: row.taxCode,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    address: row.address,
    creditLimitVnd: row.creditLimitVnd,
    paymentTermDays: row.paymentTermDays,
    reconcileDay: row.reconcileDay,
    blockAfterOverdueDays: row.blockAfterOverdueDays,
    einvoiceMode: row.einvoiceMode,
    active: row.active,
  }
}

function CorporateCard({
  company,
  mayEdit,
  open,
  onToggle,
  onEdit,
}: {
  company: CorporateRow
  mayEdit: boolean
  open: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  return (
    <section
      className={`overflow-hidden rounded-md border bg-surface-1 ${
        company.blockedReason ? 'border-danger-line' : 'border-line-1'
      } ${company.active ? '' : 'opacity-60'}`}
    >
      <div className="grid grid-cols-[1fr_150px_150px_1fr_120px] items-center gap-3 px-5 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
            {company.name}
          </span>
          <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {company.code} · MST {company.taxCode} · NET {company.paymentTermDays}
          </span>
        </span>

        <span className="text-right">
          <span className="block font-mono text-[length:var(--fs-b2)] text-ink-hi">
            {formatVnd(company.outstandingVnd)}
          </span>
          <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">đang nợ</span>
        </span>

        <span className="text-right">
          <span className="block font-mono text-[length:var(--fs-c1)] text-ink-body">
            {formatVnd(company.availableVnd)}
          </span>
          <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
            còn ghi được
          </span>
        </span>

        <span className="min-w-0 text-[length:var(--fs-c1)]">
          {company.blockedReason ? (
            <span className="text-danger">{company.blockedReason}</span>
          ) : (
            <Badge tone="neutral">Quầy ghi nợ được</Badge>
          )}
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
            {open ? 'Thu' : 'Bảng kê'}
          </button>
        </span>
      </div>

      {open ? <Statement company={company} /> : null}
    </section>
  )
}

function Statement({ company }: { company: CorporateRow }) {
  const { can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [range, setRange] = useState({ from: monthStart(), to: today() })
  const [settling, setSettling] = useState<{ chargeId: number; amount: string; note: string } | null>(
    null,
  )

  const maySettle = can('corporate.settle-writeoff')
  const statement = useQuery({
    queryKey: ['corporate-statement', company.id, range.from, range.to],
    queryFn: () => api.corporateStatement(company.id, range.from, range.to),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['corporate-statement', company.id] })
    void queryClient.invalidateQueries({ queryKey: ['corporate'] })
  }

  const settle = (kind: 'payment' | 'write-off') => {
    if (!settling) return
    api
      .settleCorporate({
        chargeId: settling.chargeId,
        kind,
        amountVnd: Number(settling.amount),
        paidOn: today(),
        note: settling.note.trim() || null,
      })
      .then(() => {
        toast(kind === 'payment' ? 'Đã gạch nợ' : 'Đã xoá nợ', 'ok')
        setSettling(null)
        refresh()
      })
      .catch((err: Error) => toast(err.message, 'danger'))
  }

  const data = statement.data

  return (
    <div className="border-t border-line-1 bg-canvas px-5 py-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Kỳ đối soát từ">
          <DateInput value={range.from} onChange={(from) => setRange({ ...range, from })} />
        </Field>
        <Field label="Đến">
          <DateInput value={range.to} onChange={(to) => setRange({ ...range, to })} />
        </Field>
        <p className="ml-auto max-w-[420px] text-right text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Chốt kỳ ngày {company.reconcileDay} hằng tháng · hoá đơn điện tử chế độ{' '}
          {company.einvoiceModeEffective === 'aggregate' ? 'gộp cuối kỳ' : 'từng bill'} · chặn ghi
          nợ khi quá hạn {company.blockAfterOverdueDaysEffective} ngày
        </p>
      </div>

      {statement.isPending ? (
        <p className="mt-4 text-ink-mute">Đang tải…</p>
      ) : !data ? null : (
        <>
          <div className="mt-4 grid grid-cols-4 gap-3">
            <Cell label="Chưa tới hạn" value={data.aging.currentVnd} />
            <Cell label="Quá 1–30 ngày" value={data.aging.d0to30Vnd} warn />
            <Cell label="Quá 31–60 ngày" value={data.aging.d31to60Vnd} warn />
            <Cell label="Quá 60 ngày" value={data.aging.over60Vnd} danger />
          </div>

          <div className="mt-4 grid grid-cols-[110px_130px_1fr_130px_130px_130px_120px] gap-3 border-b border-line-1 pb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Ngày ăn</span>
            <span>Bill</span>
            <span>Người ký</span>
            <span className="text-right">Tiền</span>
            <span className="text-right">Đã trả</span>
            <span className="text-right">Còn nợ</span>
            <span />
          </div>

          {data.charges.length === 0 ? (
            <p className="py-3 text-[length:var(--fs-c1)] text-ink-mute">
              Kỳ này chưa có bill ghi nợ nào.
            </p>
          ) : (
            data.charges.map((charge) => (
              <div key={charge.id}>
                <div className="grid grid-cols-[110px_130px_1fr_130px_130px_130px_120px] items-center gap-3 border-b border-line-1 py-2">
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(charge.chargedOn)}
                  </span>
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
                    {charge.displayCode}
                  </span>
                  <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                    {charge.signer ?? '—'}
                    <span
                      className={`ml-2 ${charge.overdueDays > 0 ? 'text-danger' : 'text-ink-mute'}`}
                    >
                      {charge.remainingVnd === 0
                        ? 'đã tất toán'
                        : charge.overdueDays > 0
                          ? `quá hạn ${charge.overdueDays} ngày`
                          : `đến hạn ${formatDay(charge.dueOn)}`}
                    </span>
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
                    {formatVnd(charge.amountVnd)}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {formatVnd(charge.settledVnd)}
                  </span>
                  <span
                    className={`text-right font-mono text-[length:var(--fs-c1)] ${
                      charge.remainingVnd > 0 ? 'text-ink-hi' : 'text-ok'
                    }`}
                  >
                    {formatVnd(charge.remainingVnd)}
                  </span>
                  <span className="flex justify-end">
                    {maySettle && charge.remainingVnd > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSettling({
                            chargeId: charge.id,
                            amount: String(charge.remainingVnd),
                            note: '',
                          })
                        }
                        className="h-7 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                      >
                        Gạch nợ
                      </button>
                    ) : null}
                  </span>
                </div>

                {settling?.chargeId === charge.id ? (
                  <div className="flex flex-wrap items-end gap-3 border-b border-accent bg-surface-1 px-4 py-3">
                    <p className="w-full text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                      Gạch nợ khi tiền đã về tài khoản và đã khớp ở sổ quỹ F1. Xoá nợ là quyết định
                      không đòi nữa — bắt buộc ghi lý do.
                    </p>
                    <Field label="Số tiền">
                      <input
                        type="number"
                        value={settling.amount}
                        onChange={(e) => setSettling({ ...settling, amount: e.target.value })}
                        className="h-9 w-[160px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                      />
                    </Field>
                    <Field label="Ghi chú / lý do">
                      <input
                        value={settling.note}
                        onChange={(e) => setSettling({ ...settling, note: e.target.value })}
                        placeholder="Chuyển khoản VCB 02/08"
                        className="h-9 w-[300px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
                      />
                    </Field>
                    <Button onClick={() => setSettling(null)}>Bỏ</Button>
                    <Button
                      onClick={() => settle('write-off')}
                      disabled={!settling.note.trim() || !Number(settling.amount)}
                    >
                      Xoá nợ
                    </Button>
                    <Button
                      variant="primary"
                      disabled={!Number(settling.amount)}
                      onClick={() => settle('payment')}
                    >
                      Tiền đã về
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}

          <div className="mt-3 flex flex-wrap gap-6 text-[length:var(--fs-c1)]">
            <span className="text-ink-mute">
              Phát sinh trong kỳ:{' '}
              <span className="font-mono text-ink-hi">{formatVnd(data.totals.chargedVnd)}</span>
            </span>
            <span className="text-ink-mute">
              Đã thu:{' '}
              <span className="font-mono text-ink-hi">{formatVnd(data.totals.settledVnd)}</span>
            </span>
            <span className="text-ink-mute">
              Còn nợ toàn bộ:{' '}
              <span className="font-mono text-ink-hi">{formatVnd(data.totals.outstandingVnd)}</span>
            </span>
          </div>

          {data.settlements.length > 0 ? (
            <>
              <p className="mt-5 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Lịch sử gạch nợ
              </p>
              <div className="mt-2 flex flex-col">
                {data.settlements.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[110px_120px_1fr_130px] items-baseline gap-3 border-b border-line-1 py-1.5 last:border-b-0"
                  >
                    <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {formatDay(row.paidOn)}
                    </span>
                    <span
                      className={`text-[length:var(--fs-c1)] ${
                        row.kind === 'write-off' ? 'text-danger' : 'text-ink-body'
                      }`}
                    >
                      {row.kind === 'write-off' ? 'Xoá nợ' : 'Tiền về'}
                    </span>
                    <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                      {row.note ?? ''}
                      {row.byName ? ` · ${row.byName}` : ''}
                    </span>
                    <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
                      {formatVnd(row.amountVnd)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

function Cell({
  label,
  value,
  warn,
  danger,
}: {
  label: string
  value: number
  warn?: boolean
  danger?: boolean
}) {
  const tone =
    value === 0 ? 'text-ink-mute' : danger ? 'text-danger' : warn ? 'text-warn' : 'text-ink-hi'
  return (
    <div className="rounded-sm border border-line-1 bg-surface-1 px-3 py-2.5">
      <p className="text-[length:var(--fs-c2)] text-ink-mute">{label}</p>
      <p className={`mt-1 font-mono text-[length:var(--fs-b2)] ${tone}`}>{formatVnd(value)}</p>
    </div>
  )
}

function CorporateForm({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: CorporateInput
  onChange: (next: CorporateInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof CorporateInput>(key: K, value: CorporateInput[K]) =>
    onChange({ ...draft, [key]: value })

  const ready =
    draft.code.trim() !== '' && draft.name.trim() !== '' && /^\d{10}(-\d{3})?$/.test(draft.taxCode)

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Mã">
          <Input value={draft.code} onChange={(v) => set('code', v.toUpperCase())} placeholder="CT-FPT" mono />
        </Field>
        <Field label="Tên công ty">
          <Input value={draft.name} onChange={(v) => set('name', v)} />
        </Field>
        <Field label="Mã số thuế">
          <Input value={draft.taxCode} onChange={(v) => set('taxCode', v)} placeholder="0101234567" mono />
        </Field>
        <Field label="Người liên hệ">
          <Input value={draft.contactName ?? ''} onChange={(v) => set('contactName', v || null)} />
        </Field>

        <Field label="Điện thoại">
          <Input value={draft.contactPhone ?? ''} onChange={(v) => set('contactPhone', v || null)} mono />
        </Field>
        <Field label="Email nhận bảng kê">
          <Input value={draft.contactEmail ?? ''} onChange={(v) => set('contactEmail', v || null)} />
        </Field>
        <Field label="Hạn mức nợ (₫)">
          <Input
            type="number"
            value={String(draft.creditLimitVnd)}
            onChange={(v) => set('creditLimitVnd', Number(v) || 0)}
            mono
          />
        </Field>
        <Field label="Điều khoản (NET, ngày)">
          <Input
            type="number"
            value={String(draft.paymentTermDays)}
            onChange={(v) => set('paymentTermDays', Number(v) || 0)}
            mono
          />
        </Field>

        <Field label="Ngày chốt kỳ đối soát">
          <Input
            type="number"
            value={String(draft.reconcileDay)}
            onChange={(v) => set('reconcileDay', Number(v) || 1)}
            mono
          />
        </Field>
        <Field label="Chặn ghi nợ khi quá hạn (ngày)">
          <Input
            type="number"
            value={String(draft.blockAfterOverdueDays ?? '')}
            onChange={(v) => set('blockAfterOverdueDays', v === '' ? null : Number(v))}
            placeholder="theo tham số chung"
            mono
          />
        </Field>
        <Field label="Xuất hoá đơn điện tử">
          <select
            value={draft.einvoiceMode ?? ''}
            onChange={(e) =>
              set('einvoiceMode', e.target.value === '' ? null : (e.target.value as 'per-bill' | 'aggregate'))
            }
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            <option value="">Theo tham số chung</option>
            <option value="per-bill">Từng bill</option>
            <option value="aggregate">Gộp cuối kỳ</option>
          </select>
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
        <p className="max-w-[520px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Để trống hai ô "theo tham số chung" nghĩa là dùng số của cả chuỗi ở A6 — sửa một chỗ, mọi
          công ty chưa khai riêng đều đổi theo.
        </p>
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
