import { buyerLabelOf, type InvoiceBuyer } from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { InvoiceBuyerFields, useInvoiceBuyerForm } from '@sora/ui/InvoiceBuyer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FocusEvent } from 'react'
import { api } from '../api'
import { IconClose } from '../icons'
import { useOutbox } from '../outbox'
import { useTableSession } from '../table-context'
import { useVisualViewport } from '../viewport'

/** Hoá đơn của bàn — T10, T11 và T15 hỏi chung một chỗ */
export function useInvoiceStatus(poll = 20_000) {
  const session = useTableSession()
  return useQuery({
    queryKey: ['invoice', session.id],
    queryFn: () => api.invoice(session.id),
    // Hoá đơn đang chờ thì hỏi dày: mỗi lượt hỏi cũng là lượt đẩy phát hành
    refetchInterval: (q) => (q.state.data?.invoice?.state === 'pending' ? 4_000 : poll),
  })
}

/**
 * Hàng "Hoá đơn" ở T10 · T11: người mua đang ghi trên hoá đơn của bàn, và lối vào
 * hộp nhập. Phải khai TRƯỚC khi trả đủ — lượt trả đủ là lượt phát hành. Chi nhánh
 * chưa bật hoá đơn điện tử thì không hiện gì.
 */
export function InvoiceBuyerRow() {
  const status = useInvoiceStatus()
  const outbox = useOutbox()
  const [open, setOpen] = useState(false)

  if (!status.data?.enabled) return null
  const { buyer, editable } = status.data

  return (
    <div className="rounded-md border border-line-1 bg-surface-3 px-3.5 py-3">
      <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Hoá đơn
      </p>
      <p className="mt-1 text-[length:var(--fs-b2)] leading-snug text-ink-hi">
        {buyerLabelOf(buyer)}
      </p>
      {buyer?.taxCode ? (
        <p className="font-mono text-[length:var(--fs-c1)] text-ink-mute">MST {buyer.taxCode}</p>
      ) : null}
      {!editable ? (
        <p className="mt-1.5 text-[length:var(--fs-c1)] leading-normal text-ink-mute">
          Hoá đơn đã gửi đi — muốn sửa thông tin, gọi thu ngân.
        </p>
      ) : outbox.online ? (
        <Button block className="mt-2.5" onClick={() => setOpen(true)}>
          {buyer ? 'Sửa thông tin xuất hoá đơn' : 'Xuất hoá đơn công ty'}
        </Button>
      ) : (
        <p className="mt-1.5 text-[length:var(--fs-c1)] leading-normal text-ink-mute">
          Cần mạng để khai thông tin hoá đơn — gọi thu ngân.
        </p>
      )}
      {open ? <InvoiceBuyerDialog buyer={buyer} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

/**
 * Hộp nhập người mua trên iPad — cùng khung hai cột với chi tiết món (T3).
 *
 * Bàn phím ảo che nửa dưới màn: hộp bám mép trên phần còn thấy, cột trái thu
 * thành một dòng, ô đang gõ cuộn vào giữa, nút Lưu luôn nằm trên bàn phím. iPad
 * dùng chung cho mọi bàn nên ô nhập không để trình duyệt nhớ chữ của khách trước.
 */
function InvoiceBuyerDialog({
  buyer,
  onClose,
}: {
  buyer: InvoiceBuyer | null
  onClose: () => void
}) {
  const session = useTableSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const viewport = useVisualViewport()
  const form = useInvoiceBuyerForm({
    initial: buyer,
    lookup: api.lookupTaxCode,
    defaultKind: 'company',
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = useMutation({
    mutationFn: (next: InvoiceBuyer | null) => api.setInvoiceBuyer(session.id, next),
    onSuccess: (status) => {
      queryClient.setQueryData(['invoice', session.id], status)
      toast(
        status.buyer
          ? `Đã lưu thông tin — hoá đơn xuất cho ${status.buyer.name}`
          : 'Đã bỏ thông tin — hoá đơn ghi người tiêu dùng',
        'ok',
      )
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  // Bàn phím vừa mở thì ô đang gõ có thể nằm sau nó — cuộn vào giữa phần còn thấy
  const keepInView = (e: FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName !== 'INPUT') return
    setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
  }

  const compact = viewport.keyboard
  return (
    <div
      className={[
        'fixed inset-x-0 z-[100] grid justify-items-center p-3',
        compact ? 'items-start' : 'items-center',
      ].join(' ')}
      style={{ top: viewport.offsetTop, height: viewport.height }}
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/74 animate-[sora-fade_var(--dur-panel)_var(--ease-sora)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Xuất hoá đơn"
        className={[
          'relative grid max-h-full w-[820px] max-w-full overflow-hidden rounded-lg border border-accent/22 bg-surface-3 animate-[sora-rise_var(--dur-sheet)_var(--ease-sora)]',
          compact ? 'grid-rows-[auto_minmax(0,1fr)]' : 'h-[620px] grid-cols-[300px_minmax(0,1fr)]',
        ].join(' ')}
      >
        <div
          className={
            compact
              ? 'flex items-baseline gap-3 border-b border-line-1 px-5 py-3 pr-14'
              : 'flex flex-col border-r border-line-1 p-6'
          }
        >
          <h2
            className={
              compact
                ? 'text-[length:var(--fs-t2)] font-semibold text-ink-hi'
                : 'font-display text-[length:var(--fs-d3)] leading-[1.15] font-light text-ink-hi'
            }
          >
            Xuất hoá đơn
          </h2>
          <p
            className={[
              'text-[length:var(--fs-c1)] leading-normal text-ink-mute',
              compact ? 'min-w-0 truncate' : 'mt-3',
            ].join(' ')}
          >
            Chỉ dùng cho hoá đơn của bàn {session.table.code} — máy không giữ lại cho khách sau.
          </p>
          {compact ? null : (
            <p className="mt-4 text-[length:var(--fs-b2)] leading-normal text-ink-body">
              Gõ mã số thuế công ty: tên và địa chỉ tự điền theo tra cứu, bạn kiểm lại rồi lưu. Hoá
              đơn lập lúc bàn trả đủ, gửi email nếu bạn để lại.
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          {/* Chừa chỗ cho nút đóng ở góc phải — không đè lên lựa chọn Công ty / Cá nhân */}
          <div
            onFocusCapture={keepInView}
            className={[
              'min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4 [scrollbar-width:none]',
              compact ? 'pt-4' : 'pt-14',
            ].join(' ')}
          >
            <InvoiceBuyerFields form={form} kinds={['company', 'person']} />
          </div>
          <div className="flex flex-none gap-2.5 border-t border-line-1 px-6 py-3.5">
            {buyer ? (
              <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
                Bỏ thông tin
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button
              variant="primary"
              disabled={save.isPending}
              onClick={() => {
                const next = form.validate()
                if (next !== undefined) save.mutate(next)
              }}
            >
              Lưu thông tin
            </Button>
          </div>
        </div>

        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="absolute top-2 right-2 grid h-11 w-11 place-items-center rounded-sm text-ink-body"
        >
          <IconClose size={20} />
        </button>
      </div>
    </div>
  )
}
