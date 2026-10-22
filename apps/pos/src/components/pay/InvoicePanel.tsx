import {
  invoiceNumberLabel,
  type InvoiceBuyer,
  type InvoiceStatus,
  type InvoiceView,
} from '@sora/contracts'
import { Badge, Button, Card, Modal, SectionLabel, Skeleton, useToast } from '@sora/ui'
import { InvoiceBuyerFields, useInvoiceBuyerForm } from '@sora/ui/InvoiceBuyer'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import {
  ApprovalFields,
  approvalOf,
  approvalReady,
  EMPTY_APPROVAL,
  needsApprovalError,
  type ApprovalDraft,
} from '../ApprovalFields'
import { BuyerDialog, BuyerSummary } from './BuyerCard'

/**
 * P11 "Hoá đơn điện tử". Bốn trạng thái: đang phát hành · đã phát hành · chưa phát
 * hành được (khách không phải chờ — quầy phát hành bù) · chi nhánh chưa bật.
 */
export function InvoicePanel({
  sessionId,
  orderId,
  status,
}: {
  sessionId: number
  orderId: number | undefined
  status: InvoiceStatus | undefined
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [replacing, setReplacing] = useState<InvoiceView | null>(null)

  const issue = useMutation({
    mutationFn: () => api.issueInvoice(orderId!),
    onSuccess: (view) => {
      toast(
        view.state === 'issued' ? 'Đã phát hành hoá đơn' : 'Chưa phát hành được — xem lỗi bên dưới',
        view.state === 'issued' ? 'ok' : 'warn',
      )
      void queryClient.invalidateQueries({ queryKey: ['invoice', sessionId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  if (!status) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <SectionLabel>Hoá đơn điện tử</SectionLabel>
        <Skeleton className="h-6 w-56" />
      </Card>
    )
  }

  if (!status.enabled && !status.invoice) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <SectionLabel>Hoá đơn điện tử</SectionLabel>
        <p className="text-[length:var(--fs-b2)] text-ink-mute">
          Chi nhánh chưa bật hoá đơn điện tử — bill in như phiếu thanh toán.
        </p>
      </Card>
    )
  }

  const invoice = status.invoice
  const state = invoice?.state ?? 'pending'

  return (
    <Card
      className={[
        'flex flex-col gap-3 p-4',
        state === 'issued' ? 'border-ok' : state === 'failed' ? 'border-warn' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Hoá đơn điện tử</SectionLabel>
        {invoice?.test ? <Badge tone="warn">Hoá đơn thử</Badge> : null}
      </div>

      {state === 'pending' ? (
        <p className="flex items-center gap-2 text-[length:var(--fs-b1)] text-ink-body">
          <span
            aria-hidden
            className="size-2 animate-[sora-pulse_1.4s_ease-in-out_infinite] rounded-pill bg-accent"
          />
          Đang phát hành hoá đơn điện tử…
        </p>
      ) : null}

      {state === 'issued' && invoice ? (
        <div className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-b1)] text-ok">Đã phát hành</span>
          <span className="font-mono text-[length:var(--fs-t2)] text-ink-hi">
            {invoiceNumberLabel(invoice)}
          </span>
          {invoice.authorityCode ? (
            <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
              Mã CQT {invoice.authorityCode}
            </span>
          ) : null}
          {invoice.lookupCode ? (
            <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
              Mã tra cứu {invoice.lookupCode}
            </span>
          ) : null}
        </div>
      ) : null}

      {state === 'failed' && invoice ? (
        <div className="flex flex-col gap-2">
          <p className="text-[length:var(--fs-b1)] text-warn">
            Hoá đơn chưa lên được — quầy phát hành bù trong hôm nay, khách không cần chờ.
          </p>
          {invoice.lastError ? (
            <p className="text-[length:var(--fs-c1)] text-ink-mute">{invoice.lastError}</p>
          ) : null}
          <Button
            disabled={orderId === undefined || issue.isPending}
            onClick={() => issue.mutate()}
          >
            Phát hành lại
          </Button>
        </div>
      ) : null}

      <div className="border-t border-line-1 pt-3">
        <BuyerSummary buyer={invoice?.document?.buyer ?? status.buyer} />
      </div>

      {status.editable ? (
        <Button onClick={() => setEditing(true)}>Sửa thông tin người mua</Button>
      ) : state === 'issued' && invoice ? (
        <Button onClick={() => setReplacing(invoice)}>Lập hoá đơn thay thế</Button>
      ) : null}

      {editing ? (
        <BuyerDialog
          sessionId={sessionId}
          initial={status.buyer}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {replacing ? (
        <ReplaceDialog
          sessionId={sessionId}
          invoice={replacing}
          buyer={replacing.document?.buyer ?? status.buyer}
          onClose={() => setReplacing(null)}
        />
      ) : null}
    </Card>
  )
}

/**
 * Lập hoá đơn THAY THẾ (TT 91/2026 Điều 10): hoá đơn máy tính tiền lập sai thì thay
 * thế, không huỷ. Bản cũ giữ số, sang "đã thay thế"; bản mới lấy số mới. Thu ngân
 * cần PIN quản lý ca; quản lý ca tự làm được.
 */
function ReplaceDialog({
  sessionId,
  invoice,
  buyer,
  onClose,
}: {
  sessionId: number
  invoice: InvoiceView
  buyer: InvoiceBuyer | null
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const form = useInvoiceBuyerForm({ initial: buyer, lookup: api.lookupTaxCode })
  const [reason, setReason] = useState('')
  const [needsApproval, setNeedsApproval] = useState(false)
  const [approval, setApproval] = useState<ApprovalDraft>(EMPTY_APPROVAL)

  const replace = useMutation({
    mutationFn: (next: InvoiceBuyer | null) =>
      api.replaceInvoice(invoice.id, {
        reason: reason.trim(),
        buyer: next,
        approval: needsApproval ? approvalOf(approval, reason.trim()) : null,
      }),
    onSuccess: ({ replacement }) => {
      toast(
        replacement.state === 'issued'
          ? `Đã lập hoá đơn thay thế ${invoiceNumberLabel(replacement)}`
          : 'Đã lập hoá đơn thay thế — đang chờ lên cơ quan thuế',
        'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['invoice', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['order', sessionId] })
      onClose()
    },
    onError: (err: Error) => {
      if (needsApprovalError(err)) {
        setNeedsApproval(true)
        toast('Lập hoá đơn thay thế cần quản lý ca duyệt', 'warn')
        return
      }
      toast(err.message, 'danger')
    },
  })

  return (
    <Modal
      open
      wide
      title={`Thay thế hoá đơn ${invoiceNumberLabel(invoice)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Đóng</Button>
          <Button
            variant="primary"
            disabled={
              !reason.trim() || replace.isPending || (needsApproval && !approvalReady(approval))
            }
            onClick={() => {
              const next = form.validate()
              if (next !== undefined) replace.mutate(next)
            }}
          >
            Lập hoá đơn thay thế
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[length:var(--fs-b2)] text-ink-body">
          Hoá đơn cũ giữ nguyên số và chuyển sang “đã thay thế”; hoá đơn mới lấy số kế tiếp và ghi
          thay thế cho hoá đơn cũ.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--fs-c1)] text-ink-mute">Lý do thay thế</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Khách bổ sung MST công ty"
            autoComplete="off"
            maxLength={300}
            className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
          />
        </label>
        <InvoiceBuyerFields form={form} />
        {needsApproval ? (
          <ApprovalFields
            value={approval}
            onChange={setApproval}
            note="Thay thế hoá đơn đã lên cơ quan thuế cần quản lý ca duyệt."
          />
        ) : null}
      </div>
    </Modal>
  )
}
