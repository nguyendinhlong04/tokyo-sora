import { formatVnd } from '@sora/contracts'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, type InvoiceRow, type InvoiceState } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Money, formatDay, formatPercent, formatTime } from '../components/report'
import { Toggle } from '../components/form'
import { useSession } from '../session-context'

/**
 * Kế toán — F2 nhật ký · F3 hoá đơn · F4 thuế · F5 công nợ · F6 khoá sổ.
 *
 * Bốn màn đọc và một màn ghi. Màn ghi (F6) có hệ quả lớn nhất trong cả Office:
 * sau khi bấm, bốn miền khác ngừng nhận sửa cho kỳ đó — và KHÔNG CÓ nút mở lại.
 * Nên nó là màn duy nhất trong dự án hiện danh sách việc còn dở trước khi cho bấm.
 */

const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`
const endOfMonth = (iso: string) => {
  const at = new Date(`${startOfMonth(iso)}T00:00:00Z`)
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}
const monthLabel = (iso: string) => `tháng ${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`

/** Khoảng ngày mặc định: tháng đang chạy */
function useMonthRange() {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(startOfMonth(today))
  const [to, setTo] = useState(endOfMonth(today))
  return { from, to, setFrom, setTo }
}

function RangePicker({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string
  to: string
  setFrom: (v: string) => void
  setTo: (v: string) => void
}) {
  return (
    <>
      <DateInput value={from} onChange={setFrom} />
      <DateInput value={to} onChange={setTo} />
    </>
  )
}

// ---------------------------------------------------------------- F2

const KIND_LABELS: Record<string, string> = {
  sale: 'Bán hàng',
  payment: 'Thu tiền',
  discount: 'Giảm giá',
  comp: 'Tặng món',
  void: 'Huỷ món đã gửi bếp',
  refund: 'Hoàn tiền',
  shift_adjust: 'Lệch quỹ đóng ca',
}

export function RevenueJournal() {
  const { branchId } = useSession()
  const range = useMonthRange()

  const journal = useQuery({
    queryKey: ['journal', branchId, range.from, range.to],
    queryFn: () => api.journal(branchId!, range.from, range.to),
    enabled: Boolean(branchId),
  })

  const data = journal.data

  return (
    <>
      <PageHeader
        title="Nhật ký doanh thu & điều chỉnh"
        subtitle="Sổ bất biến, chỉ đọc: bán, thu, huỷ, hoàn — kèm người thao tác, người duyệt và lý do."
        action={<RangePicker {...range} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {journal.isError ? (
          <ErrorState message={(journal.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-4">
              {data.totals.map((total) => (
                <div
                  key={total.kind}
                  className="rounded-md border border-line-1 bg-surface-1 px-5 py-4"
                >
                  <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                    {KIND_LABELS[total.kind] ?? total.kind}
                  </p>
                  <p
                    className={`mt-2 font-mono text-[length:var(--fs-t1)] leading-none ${
                      total.amount < 0 ? 'text-danger' : 'text-ink-hi'
                    }`}
                  >
                    {formatVnd(total.amount)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <DataTable
                rows={data.rows}
                rowKey={(row) => row.id}
                empty="Khoảng này chưa có bút toán nào."
                columns={[
                  {
                    key: 'day',
                    header: 'Ngày',
                    width: '110px',
                    cell: (row) => (
                      <span className="text-[length:var(--fs-c1)] text-ink-mute">
                        {formatDay(row.businessDate)}
                      </span>
                    ),
                  },
                  {
                    key: 'kind',
                    header: 'Loại',
                    width: '180px',
                    cell: (row) => (
                      <span
                        className={`text-[length:var(--fs-c1)] ${
                          row.amount < 0 ? 'text-danger' : 'text-ink-body'
                        }`}
                      >
                        {KIND_LABELS[row.kind] ?? row.kind}
                      </span>
                    ),
                  },
                  {
                    key: 'memo',
                    header: 'Nội dung',
                    width: 'minmax(220px, 1fr)',
                    cell: (row) => (
                      <span className="min-w-0">
                        <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                          {row.memo ?? '—'}
                        </span>
                        {row.approvalReason ? (
                          <span className="mt-0.5 block truncate text-[length:var(--fs-c1)] text-warn">
                            lý do duyệt: {row.approvalReason}
                          </span>
                        ) : null}
                        {row.orderCode ? (
                          <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                            {row.orderCode}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    key: 'actor',
                    header: 'Người thao tác',
                    width: '150px',
                    cell: (row) => (
                      <span className="text-[length:var(--fs-c1)] text-ink-mute">
                        {row.actorName ?? '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'approver',
                    header: 'Người duyệt',
                    width: '150px',
                    cell: (row) => (
                      <span className="text-[length:var(--fs-c1)] text-ink-mute">
                        {row.approverName ?? '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'amount',
                    header: 'Số tiền',
                    width: '150px',
                    align: 'right',
                    cell: (row) => (
                      <Money
                        amount={row.amount}
                        className={`text-[length:var(--fs-b2)] ${
                          row.amount < 0 ? 'text-danger' : 'text-ink-hi'
                        }`}
                      />
                    ),
                  },
                ]}
              />
            </div>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Sổ này KHÔNG sửa được, kể cả từ máy chủ — cưỡng chế bằng trigger CSDL. Sửa sai là ghi
              bút toán ngược ở luồng nghiệp vụ, không phải sửa dòng cũ. Hiện có hai nguồn ghi: thu
              tiền (P10) và huỷ món đã gửi bếp; giảm giá và tặng món sẽ vào đây khi luồng đó nối vào
              đơn.
            </p>
          </>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- F3

const INVOICE_STATES: Record<InvoiceState, { label: string; tone: string }> = {
  pending: { label: 'Chờ phát hành', tone: 'text-warn' },
  issued: { label: 'Đã phát hành', tone: 'text-ok' },
  failed: { label: 'Lỗi phát hành', tone: 'text-danger' },
  voided: { label: 'Đã huỷ', tone: 'text-ink-mute' },
  replaced: { label: 'Đã thay thế', tone: 'text-ink-mute' },
}

export function InvoiceBook() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const range = useMonthRange()
  const mayVoid = can('einvoice.void-replace-adjust')
  const [voiding, setVoiding] = useState<InvoiceRow | null>(null)

  const book = useQuery({
    queryKey: ['invoices', branchId, range.from, range.to],
    queryFn: () => api.invoiceBook(branchId!, range.from, range.to),
    enabled: Boolean(branchId),
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['invoices'] })
  const fail = (err: Error) => toast(err.message, 'danger')

  const issue = useMutation({
    mutationFn: (orderId: number) => api.issueInvoice(orderId),
    onSuccess: (row) =>
      row.state === 'issued'
        ? (toast(`Đã phát hành ${row.serial}-${row.invoiceNo}`, 'ok'), refresh())
        : (toast(`Phát hành thất bại: ${row.lastError}`, 'danger'), refresh()),
    onError: fail,
  })

  const data = book.data

  return (
    <>
      <PageHeader
        title="Sổ hoá đơn điện tử"
        subtitle={
          data?.serial
            ? `Ký hiệu ${data.serial}. Một đơn một hoá đơn — phát hành hai lần là sai phạm thuế.`
            : 'Chi nhánh chưa khai ký hiệu hoá đơn — chưa phát hành được.'
        }
        action={<RangePicker {...range} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {book.isError ? (
          <ErrorState message={(book.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <>
            {!data.serial ? (
              <p className="rounded-md border border-danger-line bg-surface-1 px-5 py-3.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
                Chưa khai ký hiệu hoá đơn cho chi nhánh này. Đặt tham số{' '}
                <span className="font-mono text-ink-hi">einvoice.serial</span> ở{' '}
                <Link to="/tham-so" className="text-accent-ink">
                  A6 · Trung tâm tham số
                </Link>{' '}
                — 6 ký tự và bắt buộc có chữ M.
              </p>
            ) : null}

            {voiding ? (
              <VoidForm invoice={voiding} onClose={() => setVoiding(null)} onDone={refresh} />
            ) : null}

            {data.missing.length > 0 ? (
              <section className="mt-4 rounded-md border border-warn bg-surface-1 p-5">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Bill đã trả mà chưa có hoá đơn — {data.missing.length}
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {data.missing.map((row) => (
                    <li
                      key={row.orderId}
                      className="flex items-baseline gap-3 border-b border-line-1 pb-2 text-[length:var(--fs-c1)] last:border-b-0"
                    >
                      <span className="w-24 text-ink-mute">{formatDay(row.businessDate)}</span>
                      <span className="font-mono text-ink-body">{row.displayCode}</span>
                      <Money amount={row.moneyTotal} className="ml-auto text-ink-hi" />
                      <Button
                        onClick={() => issue.mutate(row.orderId)}
                        disabled={!data.serial || issue.isPending}
                      >
                        Phát hành
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-5">
              <DataTable
                rows={data.rows}
                rowKey={(row) => row.id}
                empty="Khoảng này chưa phát hành hoá đơn nào."
                columns={[
                  {
                    key: 'day',
                    header: 'Ngày',
                    width: '110px',
                    cell: (row) => (
                      <span className="text-[length:var(--fs-c1)] text-ink-mute">
                        {formatDay(row.businessDate)}
                      </span>
                    ),
                  },
                  {
                    key: 'no',
                    header: 'Số hoá đơn',
                    width: '160px',
                    cell: (row) => (
                      <span
                        className={`font-mono text-[length:var(--fs-b2)] text-ink-hi ${
                          row.state === 'voided' || row.state === 'replaced' ? 'opacity-60' : ''
                        }`}
                      >
                        {row.invoiceNo ? `${row.serial}-${row.invoiceNo}` : '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'order',
                    header: 'Đơn',
                    width: '140px',
                    cell: (row) => (
                      <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {row.orderCode}
                      </span>
                    ),
                  },
                  {
                    key: 'taxCode',
                    header: 'Mã cơ quan thuế',
                    width: 'minmax(180px, 1fr)',
                    cell: (row) => (
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[length:var(--fs-c1)] text-ink-mute">
                          {row.taxCode ?? row.lastError ?? '—'}
                        </span>
                        {row.voidReason ? (
                          <span className="mt-0.5 block truncate text-[length:var(--fs-c1)] text-warn">
                            {row.voidReason}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    key: 'state',
                    header: 'Trạng thái',
                    width: '150px',
                    cell: (row) => (
                      <span
                        className={`text-[length:var(--fs-c1)] ${INVOICE_STATES[row.state].tone}`}
                      >
                        {INVOICE_STATES[row.state].label}
                        {row.replacesId ? (
                          <span className="block text-[length:var(--fs-c2)] text-ink-mute">
                            thay cho #{row.replacesId}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    key: 'amount',
                    header: 'Tổng tiền',
                    width: '150px',
                    align: 'right',
                    cell: (row) => <Money amount={row.amountTotal} className="text-ink-body" />,
                  },
                  {
                    key: 'actions',
                    header: '',
                    width: '140px',
                    cell: (row) => (
                      <span className="flex justify-end gap-1.5">
                        {row.state === 'pending' || row.state === 'failed' ? (
                          <Button onClick={() => issue.mutate(row.orderId)} size="sm">
                            Phát hành
                          </Button>
                        ) : null}
                        {row.state === 'issued' && mayVoid ? (
                          <Button onClick={() => setVoiding(row)} size="sm" variant="danger">
                            Huỷ
                          </Button>
                        ) : null}
                      </span>
                    ),
                  },
                ]}
              />
            </div>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              CHƯA đấu nối nhà cung cấp hoá đơn điện tử: toàn bộ luồng cấp số, hàng đợi lỗi và
              huỷ/thay thế có duyệt đều thật, chỉ lượt gọi ra cơ quan thuế là giả lập. Hoá đơn đã
              huỷ giữ nguyên số đã cấp — số đã lên thuế thì tồn tại vĩnh viễn.
            </p>
          </>
        )}
      </div>
    </>
  )
}

function VoidForm({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceRow
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [replace, setReplace] = useState(true)

  const submit = useMutation({
    mutationFn: () => api.voidInvoice(invoice.id, { reason, replace }),
    onSuccess: (result) => {
      toast(
        result.replacement ? 'Đã thay thế — bản mới đang chờ phát hành' : 'Đã huỷ hoá đơn',
        'ok',
      )
      onDone()
      onClose()
    },
    onError: (err: Error) =>
      toast(
        err.message.includes('duyệt bằng PIN')
          ? 'Vai trò của bạn cần người khác duyệt thao tác này — luồng duyệt bằng PIN chưa có trên Office'
          : err.message,
        'danger',
      ),
  })

  return (
    <section className="mt-4 rounded-md border border-danger-line bg-surface-1 p-5">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Huỷ hoá đơn {invoice.serial}-{invoice.invoiceNo}
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="block min-w-[320px] flex-1">
          <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">
            Lý do (bắt buộc)
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Sai tên người mua"
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </label>
        <Toggle onChange={() => setReplace(!replace)} on={replace}>
          {replace ? 'Huỷ và phát hành thay thế' : 'Chỉ huỷ'}
        </Toggle>
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>Bỏ</Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || submit.isPending}
            onClick={() => submit.mutate()}
          >
            Xác nhận
          </Button>
        </div>
      </div>
      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Bản gốc không mất và giữ nguyên số đã cấp; thao tác này sinh bản ghi duyệt trong sổ.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------- F4

export function TaxReport() {
  const { branchId } = useSession()
  const range = useMonthRange()

  const report = useQuery({
    queryKey: ['tax-report', branchId, range.from, range.to],
    queryFn: () => api.taxReport(branchId!, range.from, range.to),
    enabled: Boolean(branchId),
  })

  const data = report.data

  return (
    <>
      <PageHeader
        title="Báo cáo thuế"
        subtitle="VAT đầu ra trừ VAT đầu vào bằng VAT phải nộp, kèm đối chiếu hoá đơn với doanh thu hệ thống."
        action={<RangePicker {...range} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {report.isError ? (
          <ErrorState message={(report.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-4">
              <Stat label="VAT đầu ra" value={formatVnd(data.summary.vatOutVnd)} />
              <Stat label="VAT đầu vào" value={formatVnd(data.summary.vatInVnd)} />
              <Stat
                label={data.summary.vatPayableVnd >= 0 ? 'VAT phải nộp' : 'VAT được khấu trừ'}
                value={formatVnd(Math.abs(data.summary.vatPayableVnd))}
                tone={data.summary.vatPayableVnd >= 0 ? 'text-ink-hi' : 'text-ok'}
              />
              <Stat label="TNCN đã khấu trừ" value={formatVnd(data.summary.pitWithheldVnd)} />
            </div>

            <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-5">
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Doanh thu theo thuế suất
              </p>
              {data.buckets.length === 0 ? (
                <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
                  Khoảng này chưa có doanh thu.
                </p>
              ) : (
                <table className="mt-4 w-full">
                  <thead>
                    <tr className="border-b border-line-1 text-left text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                      <th className="pb-2">Thuế suất</th>
                      <th className="pb-2 text-right">Doanh thu trước thuế</th>
                      <th className="pb-2 text-right">Thuế</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.buckets.map((bucket) => (
                      <tr
                        key={bucket.rate}
                        className="border-b border-line-1 text-[length:var(--fs-b2)] text-ink-body last:border-b-0"
                      >
                        <td className="py-2 font-mono">
                          {formatPercent(bucket.rate).replace('+', '')}
                        </td>
                        <td className="py-2 text-right font-mono">{formatVnd(bucket.netVnd)}</td>
                        <td className="py-2 text-right font-mono text-ink-hi">
                          {formatVnd(bucket.vatVnd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section
              className={`mt-4 rounded-md border bg-surface-1 p-5 ${
                data.reconciliation.matched ? 'border-line-1' : 'border-danger-line'
              }`}
            >
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Đối chiếu hoá đơn với doanh thu
              </p>
              <div className="mt-4 flex flex-wrap gap-8">
                <span>
                  <span className="block text-[length:var(--fs-c1)] text-ink-mute">
                    Doanh thu hệ thống ({data.reconciliation.systemOrders} bill đã trả)
                  </span>
                  <span className="mt-1 block font-mono text-[length:var(--fs-t2)] text-ink-hi">
                    {formatVnd(data.reconciliation.systemVnd)}
                  </span>
                </span>
                <span>
                  <span className="block text-[length:var(--fs-c1)] text-ink-mute">
                    Đã xuất hoá đơn ({data.reconciliation.issuedInvoices} hoá đơn)
                  </span>
                  <span className="mt-1 block font-mono text-[length:var(--fs-t2)] text-ink-hi">
                    {formatVnd(data.reconciliation.invoicedVnd)}
                  </span>
                </span>
                <span>
                  <span className="block text-[length:var(--fs-c1)] text-ink-mute">Chênh lệch</span>
                  <span
                    className={`mt-1 block font-mono text-[length:var(--fs-t2)] ${
                      data.reconciliation.matched ? 'text-ok' : 'text-danger'
                    }`}
                  >
                    {formatVnd(data.reconciliation.diffVnd)}
                  </span>
                </span>
              </div>
              {!data.reconciliation.matched ? (
                <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-danger">
                  Lệch là đỏ. Gần như luôn có nghĩa: hoặc còn bill chưa phát hành được hoá đơn, hoặc
                  có hoá đơn phát hành cho thứ không phải bill.{' '}
                  <Link to="/hoa-don" className="text-accent-ink">
                    Mở sổ hoá đơn
                  </Link>
                </p>
              ) : null}
            </section>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              {data.vatInNote} {data.pitNote}
            </p>
          </>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- F5

export function Debts() {
  const { branchId } = useSession()
  const range = useMonthRange()

  const debts = useQuery({
    queryKey: ['debts', branchId, range.from, range.to],
    queryFn: () => api.debts(branchId!, range.from, range.to),
    enabled: Boolean(branchId),
  })

  const data = debts.data

  return (
    <>
      <PageHeader
        title="Công nợ"
        subtitle="Phải trả nhà cung cấp và phải thu khách doanh nghiệp."
        action={<RangePicker {...range} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {debts.isError ? (
          <ErrorState message={(debts.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-md border border-line-1 bg-surface-1 p-5">
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Phải trả nhà cung cấp
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <Row
                  label={`Giá trị hàng đã nhận kho (${data.payable.receiptCount} phiếu)`}
                  value={formatVnd(data.payable.receivedVnd)}
                />
                <Row
                  label="Phiếu chi đã duyệt trong kỳ"
                  value={formatVnd(data.payable.vouchersVnd)}
                  muted
                />
              </div>
              <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-warn">
                {data.payable.note}
              </p>
            </section>

            <section className="rounded-md border border-line-1 bg-surface-1 p-5">
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Phải thu khách doanh nghiệp
              </p>

              {data.receivable.companies.length === 0 ? (
                <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  Chưa công ty nào đang nợ. Hồ sơ và hạn mức khai ở B15; bill ghi nợ phát sinh khi
                  thu ngân chọn <em>Ghi nợ công ty</em> ở P10.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-4 gap-3">
                    <AgingCell label="Chưa tới hạn" value={data.receivable.totals.currentVnd} />
                    <AgingCell
                      label="Quá 1–30 ngày"
                      value={data.receivable.totals.d0to30Vnd}
                      warn
                    />
                    <AgingCell label="Quá 31–60" value={data.receivable.totals.d31to60Vnd} warn />
                    <AgingCell
                      label="Quá 60 ngày"
                      value={data.receivable.totals.over60Vnd}
                      danger
                    />
                  </div>

                  <div className="mt-4 flex flex-col">
                    {data.receivable.companies.map((company) => (
                      <div
                        key={company.id}
                        className="grid grid-cols-[1fr_130px_120px] items-center gap-3 border-b border-line-1 py-2 last:border-b-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[length:var(--fs-c1)] text-ink-body">
                            {company.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-[length:var(--fs-c2)] text-ink-mute">
                            {company.code} · NET {company.paymentTermDays}
                          </span>
                        </span>
                        <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
                          {formatVnd(company.aging.totalVnd)}
                        </span>
                        <span className="text-right text-[length:var(--fs-c1)]">
                          {company.aging.maxOverdueDays > 0 ? (
                            <span className="text-danger">
                              quá {company.aging.maxOverdueDays} ngày
                            </span>
                          ) : (
                            <span className="text-ink-mute">trong hạn</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                {data.receivable.note}
              </p>
            </section>
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- F6

export function PeriodClose() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()

  const lastMonth = (() => {
    const at = new Date()
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 10)
  })()
  const [month, setMonth] = useState(lastMonth)
  const [note, setNote] = useState('')

  const locks = useQuery({
    queryKey: ['period-locks', branchId],
    queryFn: () => api.periodLocks(branchId!),
    enabled: Boolean(branchId),
  })
  const readiness = useQuery({
    queryKey: ['period-readiness', branchId, month],
    queryFn: () => api.periodReadiness(branchId!, month),
    enabled: Boolean(branchId),
  })

  const lock = useMutation({
    mutationFn: () => api.lockPeriod(branchId!, month, note || null),
    onSuccess: () => {
      toast(`Đã khoá sổ ${monthLabel(month)} — không mở lại được`, 'ok')
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['period-locks'] })
      void queryClient.invalidateQueries({ queryKey: ['period-readiness'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const blockers = readiness.data?.blockers ?? []
  const alreadyLocked = (locks.data ?? []).some((l) => l.month === startOfMonth(month))

  return (
    <>
      <PageHeader
        title="Khoá sổ kỳ"
        subtitle="Sau khi khoá, doanh thu · phiếu chi · bảng công · kỳ lương của kỳ đó ngừng nhận sửa. Không có nút mở lại."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <section className="rounded-md border border-warn bg-surface-1 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Tháng
              </span>
              <DateInput value={month} onChange={(v) => setMonth(startOfMonth(v))} />
            </label>
            <label className="block min-w-[280px] flex-1">
              <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Ghi chú
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Chốt sổ tháng…"
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              />
            </label>
            <Button
              variant="danger"
              disabled={alreadyLocked || blockers.length > 0 || lock.isPending}
              onClick={() => lock.mutate()}
            >
              {alreadyLocked ? 'Đã khoá' : `Khoá sổ ${monthLabel(month)}`}
            </Button>
          </div>

          {readiness.isPending ? null : blockers.length > 0 ? (
            <div className="mt-4">
              <p className="text-[length:var(--fs-b2)] text-danger">
                Còn {blockers.length} việc chưa xong — khoá sổ bây giờ là chốt một kỳ thiếu số liệu:
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {blockers.map((blocker) => (
                  <li key={blocker} className="text-[length:var(--fs-c1)] text-ink-body">
                    · {blocker}
                  </li>
                ))}
              </ul>
            </div>
          ) : alreadyLocked ? null : (
            <p className="mt-4 text-[length:var(--fs-c1)] text-ok">
              Không còn việc dở — {monthLabel(month)} sẵn sàng khoá.
            </p>
          )}
        </section>

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[160px_200px_200px_1fr] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Kỳ</span>
            <span>Khoá lúc</span>
            <span>Người khoá</span>
            <span>Ghi chú</span>
          </div>

          {(locks.data ?? []).length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">Chưa khoá kỳ nào.</p>
          ) : (
            (locks.data ?? []).map((row) => (
              <div
                key={row.month}
                className="grid grid-cols-[160px_200px_200px_1fr] items-baseline gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0"
              >
                <span className="text-[length:var(--fs-b2)] text-ink-hi">
                  {monthLabel(row.month)}
                </span>
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  {formatDay(row.lockedAt.slice(0, 10))} {formatTime(row.lockedAt)}
                </span>
                <span className="text-[length:var(--fs-c1)] text-ink-body">
                  {row.lockedByName ?? '—'}
                </span>
                <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                  {row.note ?? '—'}
                </span>
              </div>
            ))
          )}
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Chỉ khoá được tháng ĐÃ KẾT THÚC: vì không có đường mở lại, một lần bấm nhầm vào tháng đang
          bán sẽ tự chặn chính mình. Sửa sai kỳ đã chốt là việc của bút toán điều chỉnh ở kỳ sau.
          Xuất chuẩn MISA/Excel chưa dựng.
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- phụ trợ

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p
        className={`mt-2 font-mono text-[length:var(--fs-t1)] leading-none ${tone ?? 'text-ink-hi'}`}
      >
        {value}
      </p>
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <span className="flex items-baseline gap-3">
      <span className="text-[length:var(--fs-c1)] text-ink-mute">{label}</span>
      <span
        className={`ml-auto font-mono text-[length:var(--fs-b2)] ${
          muted ? 'text-ink-mute' : 'text-ink-hi'
        }`}
      >
        {value}
      </span>
    </span>
  )
}

/** Một khoang tuổi nợ. Khoang "chưa tới hạn" cố ý KHÔNG tô cảnh báo — nó không phải nợ xấu */
function AgingCell({
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
    <div className="rounded-sm border border-line-1 bg-canvas px-3 py-2.5">
      <p className="text-[length:var(--fs-c2)] text-ink-mute">{label}</p>
      <p className={`mt-1 font-mono text-[length:var(--fs-b2)] ${tone}`}>{formatVnd(value)}</p>
    </div>
  )
}
