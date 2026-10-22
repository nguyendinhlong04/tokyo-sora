import { buyerLabelOf, invoiceNumberLabel, type InvoiceStatus } from '@sora/contracts'
import { Button, Money, QrCode } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useInvoiceStatus } from '../components/InvoiceBuyer'
import { PayHeader } from '../components/PayHeader'
import { RatingCard } from '../components/RatingCard'
import { useMenu } from '../menu'
import { clock } from '../order-status'
import { moneyOf, usePromos } from '../promotions'
import { useTableSession } from '../table-context'
import { VatRows } from './IpadOrders'
import { Frame } from './IpadPay'
import { useIpadCall } from './IpadShell'

/**
 * T15 Hoá đơn trên iPad — phiếu giấy kraft bên trái, trạng thái hoá đơn điện tử,
 * lời cảm ơn và chấm sao bên phải.
 *
 * Ký hiệu, số và QR tra cứu chỉ hiện khi hoá đơn ĐÃ phát hành — mã do nhà cung
 * cấp trả về, tra được trên hệ thống thuế (§9.7). Chưa phát hành thì không in một
 * mã chưa tồn tại. Điểm tích luỹ vẫn không có: cần danh tính khách mà máy ở bàn
 * không có.
 *
 * Món được khuyến mãi in GIÁ GỐC rồi một dòng giảm ngay dưới, như hoá đơn có
 * chiết khấu (§9.6): khách đối được từng món với thực đơn, và cộng tay vẫn ra tổng.
 */
export function IpadInvoice() {
  const session = useTableSession()
  const navigate = useNavigate()
  const menu = useMenu(session.branchId)
  const promos = usePromos()
  const status = useInvoiceStatus()

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
  })
  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
  })

  const money = order.data?.order
  const split = money ? moneyOf(money) : null
  const lines = (order.data?.lines ?? []).filter(
    (l) => l.parentLineId === null && l.state !== 'voided',
  )
  const settled = bill.data ? bill.data.outstanding === 0 && bill.data.total > 0 : false
  const invoice = status.data?.invoice ?? null
  const issued = invoice?.state === 'issued' && invoice.document ? invoice : null
  const buyer = issued?.document?.buyer ?? status.data?.buyer ?? null

  return (
    <Frame
      header={
        <PayHeader
          step={settled ? 4 : undefined}
          title="Hoá đơn"
          sub={
            settled
              ? `Bàn ${session.table.code} · ${session.guestCount} khách · đã thanh toán đủ`
              : 'Bàn còn tiền chưa trả — đây vẫn là bản tạm tính'
          }
          back={
            settled ? undefined : { label: 'Đơn của bàn', onClick: () => void navigate('/don') }
          }
        />
      }
    >
      <div className="flex min-w-0 flex-1 gap-7 px-6 pt-4 pb-5">
        <div className="w-100 flex-none overflow-y-auto overscroll-contain rounded-md bg-kraft px-5.5 py-5 text-kraft-ink [scrollbar-width:none]">
          <div className="flex items-baseline gap-2.5">
            <span className="font-jp text-[length:var(--fs-t2)] leading-none">東京空</span>
            <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.2em]">
              TOKYO SORA
            </span>
          </div>
          {menu.branch ? (
            <p className="mt-1.5 text-[length:var(--fs-c1)] leading-normal text-kraft-ink-2">
              {[menu.branch.name, menu.branch.address].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          {issued?.document ? (
            <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-kraft-ink-2">
              MST {issued.document.seller.taxCode}
            </p>
          ) : null}
          <div className="my-3.5 border-t border-dashed border-kraft-ink/35" />
          <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] uppercase">
            {settled ? 'Hoá đơn' : 'Tạm tính'}
          </p>
          {money ? (
            <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-kraft-ink-2">
              {money.displayCode} · Bàn {session.table.code} · {session.guestCount} khách
            </p>
          ) : null}
          {status.data?.enabled ? (
            <p className="mt-1 text-[length:var(--fs-c1)] text-kraft-ink-2">
              Người mua: {buyerLabelOf(buyer)}
              {buyer?.taxCode ? ` · MST ${buyer.taxCode}` : ''}
            </p>
          ) : null}
          <div className="mt-3.5 mb-2 border-t border-dashed border-kraft-ink/35" />
          {lines.map((line) => (
            <div key={line.id} className="py-[3px] text-[length:var(--fs-c1)]">
              <div className="flex gap-2.5">
                <span className="w-6 flex-none font-mono">{line.qty}×</span>
                <span className="min-w-0 flex-1">{line.nameSnapshot}</span>
                <Money amount={line.qty * line.unitPrice} className="flex-none" />
              </div>
              {line.discountVnd > 0 ? (
                <div className="flex gap-2.5 text-kraft-ink-2">
                  <span className="w-6 flex-none" />
                  <span className="min-w-0 flex-1">
                    {promos.badgeOf(line.promotionId) ?? 'Khuyến mãi'}
                  </span>
                  <Money amount={-line.discountVnd} className="flex-none" />
                </div>
              ) : null}
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-kraft-ink/35" />
          {split && split.billDiscount > 0 ? (
            <ReceiptRow
              label={promos.nameOf(money?.billPromotionId ?? null) ?? 'Khuyến mãi hoá đơn'}
              amount={-split.billDiscount}
            />
          ) : null}
          {money && money.moneyService > 0 ? (
            <ReceiptRow label="Phí phục vụ" amount={money.moneyService} />
          ) : null}
          {money ? <VatRows money={money} Row={ReceiptRow} /> : null}
          {money && money.moneyRound !== 0 ? (
            <ReceiptRow label="Làm tròn" amount={money.moneyRound} />
          ) : null}
          <div className="mt-2 flex items-baseline justify-between border-t border-kraft-ink/50 pt-2">
            <span className="text-[length:var(--fs-b2)] font-bold">
              {settled ? 'Tổng đã trả' : 'Tổng'}
            </span>
            <Money
              amount={money?.moneyTotal ?? 0}
              className="text-[length:var(--fs-b1)] font-medium"
            />
          </div>
          {bill.data && bill.data.payments.length > 0 ? (
            <div className="mt-2">
              {bill.data.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between py-0.5 text-[length:var(--fs-c1)] text-kraft-ink-2"
                >
                  <span>
                    {p.kind === 'cash' ? 'Tiền mặt' : p.kind === 'card' ? 'Thẻ' : 'Chuyển khoản'}
                    {p.paidAt ? ` · ${clock(p.paidAt)}` : ''}
                  </span>
                  <Money amount={p.amount} />
                </div>
              ))}
            </div>
          ) : null}
          {issued?.lookupUrl ? (
            <div className="mt-4 flex items-center gap-3.5 border-t border-dashed border-kraft-ink/35 pt-4">
              <QrCode value={issued.lookupUrl} size={96} label="Mã QR tra cứu hoá đơn điện tử" />
              <p className="min-w-0 text-[length:var(--fs-c1)] leading-normal">
                Hoá đơn điện tử
                <span className="block font-mono">{invoiceNumberLabel(issued)}</span>
                {issued.lookupCode ? (
                  <span className="block font-mono text-kraft-ink-2">
                    Mã tra cứu {issued.lookupCode}
                  </span>
                ) : null}
                <span className="block text-kraft-ink-2">
                  {issued.test
                    ? 'Hoá đơn thử — không có giá trị'
                    : 'Quét để tra cứu trên hệ thống thuế'}
                </span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]">
          <h2 className="font-display text-[length:var(--fs-d3)] leading-[1.15] font-light text-ink-hi">
            Cảm ơn bạn đã đến Tokyo Sora.
          </h2>
          {settled && status.data?.enabled ? <InvoiceCard status={status.data} /> : null}
          <RatingCard sessionId={session.id} />
          <div className="min-h-4 flex-1" />
          <Button size="lg" block onClick={() => void navigate(settled ? '/' : '/don')}>
            {settled ? 'Xong' : 'Về đơn của bàn'}
          </Button>
        </div>
      </div>
    </Frame>
  )
}

/**
 * Trạng thái hoá đơn điện tử của bàn. Không bao giờ dùng màu đỏ: hoá đơn chưa lên
 * được là việc của quầy, khách đã trả xong và không phải chờ.
 */
function InvoiceCard({ status }: { status: InvoiceStatus }) {
  const call = useIpadCall()
  const invoice = status.invoice
  const label = invoice ? invoiceNumberLabel(invoice) : ''

  return (
    <div className="mt-4 rounded-md border border-line-1 bg-surface-3 px-4 py-3.5">
      <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Hoá đơn điện tử
      </p>
      {invoice?.state === 'issued' ? (
        <>
          <p className="mt-1 text-[length:var(--fs-b2)] text-ink-hi">
            Đã phát hành · <span className="font-mono">{label}</span>
          </p>
          {status.buyer?.email ? (
            <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">
              Bản hoá đơn gửi về {status.buyer.email}
            </p>
          ) : null}
          <button
            type="button"
            disabled={call.calling}
            onClick={() => call.call('khac', `Sửa hoá đơn ${label}`)}
            className="mt-1 -ml-1 h-11 px-1 text-left text-[length:var(--fs-b2)] text-ink-body underline decoration-line-3 underline-offset-4"
          >
            Thông tin hoá đơn sai? Gọi thu ngân sửa
          </button>
        </>
      ) : invoice?.state === 'failed' ? (
        <p className="mt-1 text-[length:var(--fs-b2)] leading-normal text-ink-body">
          Thu ngân sẽ gửi lại hoá đơn trong hôm nay — bạn không cần chờ.
        </p>
      ) : (
        <p className="mt-1 text-[length:var(--fs-b2)] text-ink-body">
          Đang phát hành hoá đơn điện tử…
        </p>
      )}
    </div>
  )
}

function ReceiptRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between py-0.5 text-[length:var(--fs-c1)] text-kraft-ink-2">
      <span>{label}</span>
      <Money amount={amount} />
    </div>
  )
}
