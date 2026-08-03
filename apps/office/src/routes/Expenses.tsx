import { formatVnd } from '@sora/contracts'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  api,
  type ApprovalTier,
  type ExpenseCategory,
  type PayMethod,
  type VoucherInput,
  type VoucherKind,
} from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay } from '../components/report'
import { TextInput as Input, Toggle } from '../components/form'
import { useSession } from '../session-context'

/**
 * C2 — Sổ phiếu chi.
 *
 * Cửa ghi chính của nhóm chi phí, và là chỗ duy nhất trong hệ thống mà **quyền phụ
 * thuộc số tiền**: dưới hạn mức chi vặt thì quản lý ca tự ghi và phiếu duyệt luôn;
 * trên hạn mức thì chính thao tác đó cần người khác duyệt. Màn hiện bậc duyệt
 * NGAY khi gõ số tiền, để người ghi biết trước phiếu sẽ đi đường nào.
 *
 * Hai loại phiếu, và khác nhau ở chỗ không nhìn thấy được: phiếu chi thường sinh
 * dòng chi phí theo kỳ phân bổ, còn phiếu TẠM ỨNG thì không sinh dòng nào — nó là
 * tiền ra chưa phải chi phí, và sẽ tự khấu trừ vào kỳ lương.
 */

const TIER_LABELS: Record<ApprovalTier, { label: string; tone: string }> = {
  'tu-ghi': { label: 'Tự ghi — kế toán hậu kiểm', tone: 'text-ok' },
  'ke-toan-duyet': { label: 'Cần kế toán duyệt', tone: 'text-warn' },
  'chu-duyet': { label: 'Cần chủ duyệt', tone: 'text-danger' },
}

const STATE_LABELS: Record<string, string> = {
  draft: 'Chờ duyệt',
  approved: 'Đã duyệt',
  void: 'Đã huỷ',
}

const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`
const endOfMonth = (iso: string) => {
  const at = new Date(`${startOfMonth(iso)}T00:00:00Z`)
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}

export function Expenses() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayApprove = can('expense.approve')

  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(startOfMonth(today))
  const [to, setTo] = useState(endOfMonth(today))
  const [drafting, setDrafting] = useState(false)

  const rows = useQuery({
    queryKey: ['vouchers', branchId, from, to],
    queryFn: () => api.vouchers(branchId!, from, to),
    enabled: Boolean(branchId),
  })
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: api.expenseCategories })

  const approve = useMutation({
    mutationFn: (id: number) => api.approveVoucher(id),
    onSuccess: () => {
      toast('Đã duyệt phiếu chi — chi phí vào sổ ngay', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['vouchers'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const list = rows.data ?? []
  const totalApproved = list
    .filter((v) => v.state === 'approved')
    .reduce((sum, v) => sum + v.amountVnd, 0)
  const drafts = list.filter((v) => v.state === 'draft').length

  return (
    <>
      <PageHeader
        title="Sổ phiếu chi"
        subtitle={`Đã duyệt ${formatVnd(totalApproved)}${drafts > 0 ? ` · ${drafts} phiếu chờ duyệt` : ''}. Phiếu chưa duyệt chưa vào Lãi/Lỗ.`}
        action={
          <>
            <DateInput value={from} onChange={setFrom} />
            <DateInput value={to} onChange={setTo} />
            <Button variant="primary" onClick={() => setDrafting(true)}>
              Ghi phiếu chi
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {rows.isError ? <ErrorState message={(rows.error as Error).message} /> : null}

        {drafting ? (
          <VoucherForm
            branchId={branchId!}
            categories={categories.data ?? []}
            onClose={() => setDrafting(false)}
            onDone={() => void queryClient.invalidateQueries({ queryKey: ['vouchers'] })}
          />
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={list}
            rowKey={(row) => row.id}
            loading={rows.isPending}
            resetKey={`${from}|${to}`}
            empty="Chưa có phiếu chi nào trong khoảng này."
            columns={[
              {
                key: 'paidOn',
                header: 'Ngày',
                width: '110px',
                cell: (row) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(row.paidOn)}
                  </span>
                ),
              },
              {
                key: 'memo',
                header: 'Nội dung',
                width: 'minmax(220px, 1fr)',
                cell: (row) => (
                  <span className={row.state === 'void' ? 'opacity-50' : ''}>
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.supplier ?? row.categoryName}
                      {row.kind === 'advance' ? (
                        <span className="ml-2 rounded-sm border border-warn px-1.5 py-0.5 text-[length:var(--fs-c2)] text-warn">
                          tạm ứng
                        </span>
                      ) : null}
                      {row.amortizeMonths > 1 ? (
                        <span className="ml-2 rounded-sm border border-line-3 px-1.5 py-0.5 text-[length:var(--fs-c2)] text-ink-mute">
                          chia {row.amortizeMonths} tháng
                        </span>
                      ) : null}
                    </span>
                    {row.memo ? (
                      <span className="mt-0.5 block truncate text-[length:var(--fs-c1)] text-ink-mute">
                        {row.memo}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'category',
                header: 'Khoản mục',
                width: '160px',
                cell: (row) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-body">
                    {row.categoryName}
                  </span>
                ),
              },
              {
                key: 'method',
                header: 'Hình thức',
                width: '130px',
                cell: (row) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {row.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                  </span>
                ),
              },
              {
                key: 'amount',
                header: 'Số tiền',
                width: '150px',
                numeric: true,
                cell: (row) => (
                  <span className="text-[length:var(--fs-b2)] text-ink-hi">
                    {formatVnd(row.amountVnd)}
                  </span>
                ),
              },
              {
                key: 'state',
                header: 'Trạng thái',
                width: '130px',
                cell: (row) => (
                  <span
                    className={`text-[length:var(--fs-c1)] ${
                      row.state === 'approved' ? 'text-ok' : 'text-warn'
                    }`}
                  >
                    {STATE_LABELS[row.state] ?? row.state}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
                width: '110px',
                cell: (row) => (
                  <span className="flex justify-end">
                    {row.state === 'draft' && mayApprove ? (
                      <Button onClick={() => approve.mutate(row.id)} size="sm">
                        Duyệt
                      </Button>
                    ) : null}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Không ai tự duyệt phiếu chi của mình — kể cả chủ quán. Phiếu chi tiền mặt hiện luôn ở cột
          chi của{' '}
          <Link to="/so-quy" className="text-accent-ink">
            F1 · Sổ quỹ
          </Link>
          . Chưa có: ảnh chứng từ đính kèm, và hoá đơn đầu vào tách riêng (C5) — ô VAT ở đây là chỗ
          tạm giữ số cho báo cáo thuế F4.
        </p>
      </div>
    </>
  )
}

function VoucherForm({
  branchId,
  categories,
  onClose,
  onDone,
}: {
  branchId: string
  categories: ExpenseCategory[]
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const today = new Date().toISOString().slice(0, 10)

  const [kind, setKind] = useState<VoucherKind>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [memo, setMemo] = useState('')
  const [amount, setAmount] = useState('')
  const [vat, setVat] = useState('')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [months, setMonths] = useState(1)
  const [paidOn, setPaidOn] = useState(today)
  const [advanceEmployeeId, setAdvanceEmployeeId] = useState<number | null>(null)

  const targets = useQuery({
    queryKey: ['advance-targets', branchId],
    queryFn: () => api.advanceTargets(branchId),
    enabled: kind === 'advance',
  })
  const overview = useQuery({
    queryKey: ['expense-overview', branchId, startOfMonth(paidOn)],
    queryFn: () => api.expenseOverview(branchId, startOfMonth(paidOn)),
  })

  const create = useMutation({
    mutationFn: (input: VoucherInput) => api.createVoucher(input),
    onSuccess: (row) => {
      toast(
        row.state === 'approved'
          ? 'Đã ghi và duyệt luôn — dưới hạn mức chi vặt'
          : 'Đã ghi, phiếu đang chờ người khác duyệt',
        'ok',
      )
      onDone()
      onClose()
    },
    onError: (err: Error) =>
      toast(
        err.message.includes('duyệt bằng PIN')
          ? 'Số tiền này vượt hạn mức của vai trò bạn — cần người duyệt, mà luồng duyệt bằng PIN chưa có trên Office'
          : err.message,
        'danger',
      ),
  })

  const amountNumber = Number(amount) || 0
  const thresholds = overview.data?.thresholds
  const tier: ApprovalTier | null = !thresholds
    ? null
    : amountNumber >= thresholds.ownerApprovalVnd
      ? 'chu-duyet'
      : amountNumber <= thresholds.pettyCashVnd
        ? 'tu-ghi'
        : 'ke-toan-duyet'

  const selected = categories.find((c) => c.id === categoryId)
  const willNeedAsset =
    selected?.pnlLine === 'depreciation' &&
    thresholds !== undefined &&
    amountNumber >= thresholds.assetVnd

  const usable = categories.filter((c) => c.active && !c.automatic)

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="flex gap-2">
        {(['expense', 'advance'] as VoucherKind[]).map((k) => (
          <Toggle key={k} onChange={() => setKind(k)} on={kind === k}>
            {k === 'expense' ? 'Phiếu chi' : 'Tạm ứng nhân viên'}
          </Toggle>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Field label="Khoản mục">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            <option value="">Chọn khoản mục…</option>
            {usable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </Field>

        {kind === 'advance' ? (
          <Field label="Ứng cho ai">
            <select
              value={advanceEmployeeId ?? ''}
              onChange={(e) => setAdvanceEmployeeId(Number(e.target.value) || null)}
              className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Chọn nhân viên…</option>
              {(targets.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Nhà cung cấp">
            <Input value={supplier} onChange={setSupplier} placeholder="Điện lực Hà Nội" />
          </Field>
        )}

        <Field label="Số tiền (₫)">
          <Input type="number" value={amount} onChange={setAmount} placeholder="1500000" />
        </Field>
        <Field label="Ngày chi">
          <DateInput value={paidOn} onChange={setPaidOn} />
        </Field>

        <Field label="Hình thức">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PayMethod)}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            <option value="cash">Tiền mặt (trừ sổ quỹ)</option>
            <option value="transfer">Chuyển khoản</option>
          </select>
        </Field>

        {kind === 'expense' ? (
          <>
            <Field label="VAT đầu vào (₫)">
              <Input type="number" value={vat} onChange={setVat} placeholder="0" />
            </Field>
            <Field label="Chia chi phí mấy tháng">
              <Input
                type="number"
                value={String(months)}
                onChange={(v) => setMonths(Math.max(1, Number(v) || 1))}
              />
            </Field>
          </>
        ) : null}

        <Field label="Ghi chú">
          <Input value={memo} onChange={setMemo} placeholder="Hoá đơn số…" />
        </Field>
      </div>

      {tier && amountNumber > 0 ? (
        <p className={`mt-3 text-[length:var(--fs-c1)] ${TIER_LABELS[tier].tone}`}>
          {TIER_LABELS[tier].label}
          {months > 1 ? (
            <span className="text-ink-mute">
              {' '}
              · tiền ra một lần {formatVnd(amountNumber)}, chi phí{' '}
              {formatVnd(Math.floor(amountNumber / months))}
              /tháng trong {months} tháng
            </span>
          ) : null}
          {kind === 'advance' ? (
            <span className="text-ink-mute">
              {' '}
              · tạm ứng là tiền ra nhưng KHÔNG phải chi phí — nó tự khấu trừ vào kỳ lương
            </span>
          ) : null}
        </p>
      ) : null}

      {willNeedAsset ? (
        <p className="mt-2 text-[length:var(--fs-c1)] text-danger">
          Mua sắm từ {formatVnd(thresholds!.assetVnd)} phải ghi thành tài sản ở C4 rồi khấu hao dần,
          không vào chi phí một lần.
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Bỏ</Button>
        <Button
          variant="primary"
          disabled={!categoryId || amountNumber <= 0 || create.isPending}
          onClick={() =>
            create.mutate({
              branchId,
              categoryId,
              kind,
              supplier: supplier || null,
              memo: memo || null,
              amountVnd: amountNumber,
              vatVnd: Number(vat) || 0,
              method,
              amortizeMonths: kind === 'advance' ? 1 : months,
              amortizeFrom: startOfMonth(paidOn),
              advanceEmployeeId: kind === 'advance' ? advanceEmployeeId : null,
              paidOn,
            })
          }
        >
          Ghi phiếu
        </Button>
      </div>
    </section>
  )
}
