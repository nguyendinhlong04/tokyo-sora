import { CONSUMER_BUYER_LABEL, type InvoiceBuyer, type InvoiceStatus } from '@sora/contracts'
import { Badge, Button, Card, Modal, SectionLabel, Skeleton, useToast } from '@sora/ui'
import { InvoiceBuyerFields, useInvoiceBuyerForm } from '@sora/ui/InvoiceBuyer'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'

/** Một dòng tóm tắt người mua — dùng ở P10, P11 và hộp thay thế */
export function BuyerSummary({ buyer }: { buyer: InvoiceBuyer | null }) {
  if (!buyer) {
    return <p className="text-[length:var(--fs-b1)] text-ink-body">{CONSUMER_BUYER_LABEL}</p>
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-start gap-2">
        {/* Tên công ty dài là chuyện thường — nhãn không được bị bóp xuống dòng */}
        <span className="shrink-0">
          <Badge tone="accent">{buyer.kind === 'company' ? 'Công ty' : 'Cá nhân'}</Badge>
        </span>
        <span className="min-w-0 text-[length:var(--fs-b1)] break-words text-ink-hi">
          {buyer.name}
        </span>
      </div>
      {buyer.taxCode ? (
        <span className="font-mono text-[length:var(--fs-b2)] text-ink-body">
          MST {buyer.taxCode}
        </span>
      ) : null}
      {buyer.address ? (
        <span className="text-[length:var(--fs-c1)] text-ink-mute">{buyer.address}</span>
      ) : null}
    </div>
  )
}

/**
 * P10 "Hoá đơn điện tử" — đặt TRÊN phần hình thức trả: người mua phải nằm trên đơn
 * trước lượt thu đủ tiền, vì chính lượt đó phát hành hoá đơn.
 */
export function BuyerCard({
  sessionId,
  status,
}: {
  sessionId: number
  status: InvoiceStatus | undefined
}) {
  const [editing, setEditing] = useState(false)

  if (!status) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <SectionLabel>Hoá đơn điện tử</SectionLabel>
        <Skeleton className="h-6 w-48" />
      </Card>
    )
  }

  if (!status.enabled) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <SectionLabel>Hoá đơn điện tử</SectionLabel>
        <p className="text-[length:var(--fs-b2)] text-ink-mute">
          Chi nhánh chưa bật hoá đơn điện tử (Office A9) — bill in như thường.
        </p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <SectionLabel>Hoá đơn điện tử</SectionLabel>
      <BuyerSummary buyer={status.buyer} />
      {status.editable ? (
        <Button onClick={() => setEditing(true)}>
          {status.buyer ? 'Sửa thông tin xuất hoá đơn' : 'Nhập thông tin xuất hoá đơn'}
        </Button>
      ) : (
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          Hoá đơn đã gửi đi — đổi người mua là lập hoá đơn thay thế.
        </p>
      )}
      {editing ? (
        <BuyerDialog
          sessionId={sessionId}
          initial={status.buyer}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Card>
  )
}

/** Hộp nhập người mua — gõ MST là điền sẵn tên, địa chỉ theo tra cứu */
export function BuyerDialog({
  sessionId,
  initial,
  onClose,
}: {
  sessionId: number
  initial: InvoiceBuyer | null
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const form = useInvoiceBuyerForm({ initial, lookup: api.lookupTaxCode })

  const save = useMutation({
    mutationFn: (buyer: InvoiceBuyer | null) => api.setInvoiceBuyer(sessionId, buyer),
    onSuccess: (status) => {
      queryClient.setQueryData(['invoice', sessionId], status)
      void queryClient.invalidateQueries({ queryKey: ['order', sessionId] })
      toast('Đã lưu thông tin xuất hoá đơn', 'ok')
      onClose()
    },
    onError: (err: Error & { code?: string | null }) =>
      toast(
        err.code === 'offline'
          ? 'Cần mạng để lưu thông tin hoá đơn — thử lại khi có mạng'
          : err.message,
        'danger',
      ),
  })

  return (
    <Modal
      open
      wide
      title="Xuất hoá đơn"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Đóng</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() => {
              const buyer = form.validate()
              if (buyer !== undefined) save.mutate(buyer)
            }}
          >
            Lưu thông tin
          </Button>
        </>
      }
    >
      <InvoiceBuyerFields form={form} />
    </Modal>
  )
}
