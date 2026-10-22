import {
  buyerLabelOf,
  formatVnd,
  invoiceNumberLabel,
  type InvoiceDocument,
  type InvoiceView,
} from '@sora/contracts'
import { ApiError } from '@sora/core'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { InvoiceBuyerFields, useInvoiceBuyerForm } from '@sora/ui/InvoiceBuyer'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, type InvoiceDetail } from '../api'
import { Field, TextInput } from '../components/form'
import { INVOICE_STATE_LABELS } from '../components/invoice-state'
import { formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * F3 ngăn chi tiết — một tờ hoá đơn điện tử, các tờ cùng đơn, và việc làm được với nó.
 *
 * Tờ đã phát hành không sửa, không huỷ: sai thì lập hoá đơn thay thế (TT 91 Điều 10)
 * — tờ cũ giữ nguyên số, tờ mới lấy số kế tiếp và trỏ về tờ cũ. Huỷ chỉ còn cho tờ
 * chưa lên cơ quan thuế và chưa cấp số. R7 · R8 · R10 làm thẳng nên Office không có
 * ô duyệt PIN; thu ngân (△) làm ở POS P11 với PIN quản lý ca.
 */

const rateLabel = (rateBp: number | null) =>
  rateBp === null ? 'KCT' : `${(rateBp / 100).toLocaleString('vi-VN')}%`

/** Người có quyền △ gặp `requires_approval` — Office không có ô PIN, chỉ đường cho họ */
const messageOf = (err: Error) =>
  err instanceof ApiError && err.code === 'requires_approval'
    ? 'Vai trò của bạn cần quản lý ca duyệt bằng PIN — làm ở POS P11'
    : err.message

export function InvoiceDrawer({
  invoiceId,
  onClose,
  onChanged,
}: {
  invoiceId: number
  onClose: () => void
  /** Sổ F3 phải đọc lại sau mỗi việc làm ở đây */
  onChanged: () => void
}) {
  const { can } = useSession()
  const toast = useToast()
  const [currentId, setCurrentId] = useState(invoiceId)
  const [mode, setMode] = useState<'view' | 'replace' | 'void'>('view')

  const detail = useQuery({
    queryKey: ['invoice', currentId],
    queryFn: () => api.invoiceDetail(currentId),
  })
  const invoice = detail.data?.invoice
  const mayChange = can('einvoice.void-replace-adjust')

  const done = (next?: number) => {
    onChanged()
    void detail.refetch()
    setMode('view')
    if (next !== undefined) setCurrentId(next)
  }

  const issue = useMutation({
    mutationFn: (orderId: number) => api.issueInvoice(orderId),
    onSuccess: (view) => {
      done(view.id)
      if (view.state === 'issued') toast(`Đã phát hành ${invoiceNumberLabel(view)}`, 'ok')
      else toast(`Chưa phát hành được: ${view.lastError ?? 'không rõ lỗi'}`, 'danger')
    },
    onError: (err: Error) => toast(messageOf(err), 'danger'),
  })

  const open = invoice?.state === 'pending' || invoice?.state === 'failed'

  return (
    <div className="fixed inset-0 z-100 flex justify-end bg-canvas/60" onClick={onClose}>
      <aside
        className="flex h-full w-[640px] flex-col border-l border-line-1 bg-surface-1"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-none items-start gap-3 border-b border-line-1 p-5">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[length:var(--fs-t2)] text-ink-hi">
              {invoice ? invoiceNumberLabel(invoice) : '…'}
              {invoice && !invoice.invoiceNo ? (
                <span className="ml-2 font-sans text-[length:var(--fs-c1)] text-ink-mute">
                  chưa cấp số
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
              Đơn <span className="font-mono">{detail.data?.orderCode ?? '…'}</span>
              {invoice?.invoiceDate ? ` · lập ngày ${formatDay(invoice.invoiceDate)}` : ''}
            </p>
          </div>
          {invoice ? (
            <span className="flex flex-none gap-1.5">
              {invoice.test ? <Badge tone="info">Hoá đơn thử</Badge> : null}
              <Badge tone={INVOICE_STATE_LABELS[invoice.state].tone}>
                {INVOICE_STATE_LABELS[invoice.state].label}
              </Badge>
            </span>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {detail.isError ? (
            <ErrorState message={(detail.error as Error).message} />
          ) : !detail.data || !invoice ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : mode === 'replace' ? (
            <ReplaceForm
              invoice={invoice}
              onCancel={() => setMode('view')}
              onDone={(replacement) => {
                done(replacement.id)
                if (replacement.state === 'issued') {
                  toast(`Đã lập hoá đơn thay thế ${invoiceNumberLabel(replacement)}`, 'ok')
                } else {
                  toast(
                    `Đã thay thế — tờ mới chưa lên được: ${replacement.lastError ?? 'không rõ lỗi'}`,
                    'warn',
                  )
                }
              }}
            />
          ) : mode === 'void' ? (
            <VoidForm
              invoice={invoice}
              onCancel={() => setMode('view')}
              onDone={() => {
                done()
                toast('Đã huỷ tờ hoá đơn chưa cấp số', 'ok')
              }}
            />
          ) : (
            <>
              {invoice.lastError && open ? (
                <p className="mb-4 rounded-md border border-warn bg-surface-2 px-4 py-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
                  Lần gửi gần nhất: {invoice.lastError}
                </p>
              ) : null}
              {invoice.document ? (
                <DocumentView invoice={invoice} document={invoice.document} />
              ) : (
                <p className="text-[length:var(--fs-b2)] leading-relaxed text-ink-mute">
                  Tờ này chưa lên cơ quan thuế lần nào nên chưa có nội dung đóng băng — nội dung
                  dựng từ đơn lúc phát hành.
                </p>
              )}
              <History detail={detail.data} currentId={currentId} onPick={setCurrentId} />
            </>
          )}
        </div>

        {mode === 'view' && invoice ? (
          <footer className="flex flex-none flex-wrap gap-2 border-t border-line-1 p-4">
            {open ? (
              <Button
                variant="primary"
                disabled={issue.isPending}
                onClick={() => issue.mutate(invoice.orderId)}
              >
                Phát hành lại
              </Button>
            ) : null}
            {invoice.state === 'issued' && mayChange ? (
              <Button variant="primary" onClick={() => setMode('replace')}>
                Lập hoá đơn thay thế
              </Button>
            ) : null}
            {open && !invoice.invoiceNo && mayChange ? (
              <Button variant="danger" onClick={() => setMode('void')}>
                Huỷ tờ chưa cấp số
              </Button>
            ) : null}
            <Button className="ml-auto" onClick={onClose}>
              Đóng
            </Button>
          </footer>
        ) : null}
      </aside>
    </div>
  )
}

function DocumentView({ invoice, document }: { invoice: InvoiceView; document: InvoiceDocument }) {
  const { seller, buyer, amounts } = document
  // Địa chỉ do nhà cung cấp trả — chỉ nhận https; bản giả lập không có trang tra cứu
  const lookupUrl =
    !invoice.test && invoice.lookupUrl && /^https:\/\//.test(invoice.lookupUrl)
      ? invoice.lookupUrl
      : null

  return (
    <>
      <div className="grid grid-cols-2 gap-5">
        <Block label="Người bán">
          <p className="text-[length:var(--fs-b2)] text-ink-hi">{seller.name}</p>
          <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-ink-body">
            MST {seller.taxCode}
          </p>
          <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">{seller.address}</p>
          <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
            {seller.branchName}
            {seller.branchAddress ? ` · ${seller.branchAddress}` : ''}
          </p>
        </Block>
        <Block label="Người mua">
          <p className="text-[length:var(--fs-b2)] text-ink-hi">{buyerLabelOf(buyer)}</p>
          {buyer?.taxCode ? (
            <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-ink-body">
              MST {buyer.taxCode}
            </p>
          ) : null}
          {buyer?.address ? (
            <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">{buyer.address}</p>
          ) : null}
          {buyer?.email ? (
            <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">{buyer.email}</p>
          ) : null}
        </Block>
      </div>

      <table className="mt-5 w-full">
        <thead>
          <tr className="border-b border-line-1 text-left text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <th className="pb-2">Hàng hoá, dịch vụ</th>
            <th className="pb-2 text-right">SL</th>
            <th className="pb-2 text-right">Đơn giá</th>
            <th className="pb-2 text-right">Thành tiền</th>
            <th className="pb-2 text-right">Thuế</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((line) => (
            <tr
              key={line.no}
              className="border-b border-line-1 align-top text-[length:var(--fs-c1)] text-ink-body last:border-b-0"
            >
              <td className="py-1.5 pr-3">
                <span className={line.kind === 'discount' ? 'text-ink-mute' : 'text-ink-hi'}>
                  {line.name}
                </span>
                {line.note ? (
                  <span className="block text-[length:var(--fs-c2)] text-ink-mute">
                    {line.note}
                  </span>
                ) : null}
                {line.discount > 0 ? (
                  <span className="block text-[length:var(--fs-c2)] text-ink-mute">
                    Giảm {formatVnd(line.discount)}
                  </span>
                ) : null}
              </td>
              <td className="py-1.5 text-right font-mono">
                {line.kind === 'discount' ? '' : line.qty}
              </td>
              <td className="py-1.5 text-right font-mono">
                {line.kind === 'discount' ? '' : formatVnd(line.unitPrice)}
              </td>
              <td className="py-1.5 text-right font-mono text-ink-hi">{formatVnd(line.amount)}</td>
              <td className="py-1.5 text-right font-mono text-ink-mute">
                {rateLabel(line.vatRateBp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto grid w-[320px] gap-1">
        <Amount label="Tiền hàng" value={amounts.goods} />
        {amounts.discount > 0 ? <Amount label="Giảm giá" value={-amounts.discount} /> : null}
        {amounts.service > 0 ? <Amount label="Phí phục vụ" value={amounts.service} /> : null}
        {amounts.ship > 0 ? <Amount label="Phí giao" value={amounts.ship} /> : null}
        {document.vatBreakdown
          .filter((part) => part.vat > 0 || part.net > 0)
          .map((part) => (
            <Amount
              key={part.rateBp}
              label={`Thuế GTGT ${rateLabel(part.rateBp)} trên ${formatVnd(part.net)}`}
              value={part.vat}
            />
          ))}
        <Amount label="Tổng thanh toán" value={amounts.total} strong />
        {amounts.round !== 0 ? (
          <Amount label="Làm tròn của bill (ngoài hoá đơn)" value={amounts.round} muted />
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-5">
        <Block label="Thanh toán">
          <p className="text-[length:var(--fs-b2)] text-ink-hi">{document.paymentMethod}</p>
        </Block>
        <Block label="Cơ quan thuế">
          <p className="font-mono text-[length:var(--fs-c1)] break-all text-ink-body">
            {invoice.authorityCode ?? '—'}
          </p>
          {invoice.lookupCode ? (
            <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
              Mã tra cứu {invoice.lookupCode}
            </p>
          ) : null}
          {lookupUrl ? (
            <a
              href={lookupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-[length:var(--fs-c1)] text-accent-ink underline underline-offset-4"
            >
              Mở trang tra cứu
            </a>
          ) : null}
        </Block>
      </div>
    </>
  )
}

/** Mọi tờ của cùng đơn — chuỗi thay thế đọc từ trên xuống */
function History({
  detail,
  currentId,
  onPick,
}: {
  detail: InvoiceDetail
  currentId: number
  onPick: (id: number) => void
}) {
  if (detail.history.length < 2) return null
  return (
    <section className="mt-6 border-t border-line-1 pt-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Các tờ của đơn này
      </p>
      <ol className="mt-3 grid gap-2">
        {detail.history.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onPick(row.id)}
              className={[
                'flex w-full items-baseline gap-3 rounded-sm border px-3 py-2 text-left',
                row.id === currentId ? 'border-accent bg-surface-2' : 'border-line-1',
              ].join(' ')}
            >
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-hi">
                {row.serial} · {row.invoiceNo ?? 'chưa cấp số'}
              </span>
              <span className="text-[length:var(--fs-c1)] text-ink-mute">
                {INVOICE_STATE_LABELS[row.state].label}
                {row.replacesId ? ` · thay cho tờ #${row.replacesId}` : ''}
              </span>
              {row.voidReason ? (
                <span className="ml-auto truncate text-[length:var(--fs-c1)] text-ink-mute">
                  {row.voidReason}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ReplaceForm({
  invoice,
  onCancel,
  onDone,
}: {
  invoice: InvoiceView
  onCancel: () => void
  onDone: (replacement: InvoiceView) => void
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const form = useInvoiceBuyerForm({
    initial: invoice.document?.buyer ?? null,
    lookup: api.lookupTaxCode,
  })

  const submit = useMutation({
    mutationFn: (buyer: Parameters<typeof api.replaceInvoice>[1]['buyer']) =>
      api.replaceInvoice(invoice.id, { reason: reason.trim(), buyer }),
    onSuccess: (result) => onDone(result.replacement),
    onError: (err: Error) => toast(messageOf(err), 'danger'),
  })

  const send = () => {
    const buyer = form.validate()
    if (buyer !== undefined) submit.mutate(buyer)
  }

  return (
    <section>
      <p className="text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
        Tờ <span className="font-mono">{invoiceNumberLabel(invoice)}</span> chuyển sang “Đã thay
        thế” và giữ nguyên số; tờ mới lấy số kế tiếp, nội dung dựng lại từ đơn với người mua dưới
        đây.
      </p>
      <Field label="Lý do (bắt buộc)" className="mt-4">
        <TextInput value={reason} onChange={setReason} placeholder="Sai tên công ty người mua" />
      </Field>
      <p className="mt-5 mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Người mua trên tờ mới
      </p>
      <InvoiceBuyerFields form={form} size="sm" />
      <div className="mt-5 flex gap-2">
        <Button variant="primary" disabled={!reason.trim() || submit.isPending} onClick={send}>
          Lập hoá đơn thay thế
        </Button>
        <Button onClick={onCancel}>Bỏ</Button>
      </div>
    </section>
  )
}

function VoidForm({
  invoice,
  onCancel,
  onDone,
}: {
  invoice: InvoiceView
  onCancel: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const submit = useMutation({
    mutationFn: () => api.voidInvoice(invoice.id, reason.trim()),
    onSuccess: onDone,
    onError: (err: Error) => toast(messageOf(err), 'danger'),
  })

  return (
    <section>
      <p className="text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
        Tờ này chưa lên cơ quan thuế và chưa cấp số nên huỷ được — ví dụ đơn đã huỷ trước khi phát
        hành. Đơn vẫn trả đủ thì sẽ hiện lại ở mục “Bill đã trả mà chưa có hoá đơn”.
      </p>
      <Field label="Lý do (bắt buộc)" className="mt-4">
        <TextInput value={reason} onChange={setReason} placeholder="Đơn huỷ, đã hoàn tiền" />
      </Field>
      <div className="mt-5 flex gap-2">
        <Button
          variant="danger"
          disabled={!reason.trim() || submit.isPending}
          onClick={() => submit.mutate()}
        >
          Huỷ tờ chưa cấp số
        </Button>
        <Button onClick={onCancel}>Bỏ</Button>
      </div>
    </section>
  )
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      {children}
    </div>
  )
}

function Amount({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string
  value: number
  strong?: boolean
  muted?: boolean
}) {
  return (
    <p
      className={[
        'flex items-baseline justify-between gap-4',
        strong ? 'mt-1 border-t border-line-1 pt-1.5' : '',
      ].join(' ')}
    >
      <span
        className={`text-[length:var(--fs-c1)] ${strong ? 'font-semibold text-ink-hi' : 'text-ink-mute'}`}
      >
        {label}
      </span>
      <span
        className={`font-mono text-[length:var(--fs-b2)] ${
          strong ? 'text-ink-hi' : muted ? 'text-ink-mute' : 'text-ink-body'
        }`}
      >
        {formatVnd(value)}
      </span>
    </p>
  )
}
