import { Button, Money } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { PayHeader } from '../components/PayHeader'
import { RatingCard } from '../components/RatingCard'
import { useMenu } from '../menu'
import { clock } from '../order-status'
import { moneyOf, usePromos } from '../promotions'
import { useTableSession } from '../table-context'
import { Frame } from './IpadPay'

/**
 * T15 Hoá đơn trên iPad — phiếu giấy kraft bên trái, lời cảm ơn và chấm sao
 * bên phải.
 *
 * Như bản điện thoại, KHÔNG in số hoá đơn điện tử, mã tra cứu hay điểm tích luỹ:
 * HĐĐT phải do nhà cung cấp cấp mã mới tra được trên hệ thống thuế, còn điểm cần
 * danh tính khách mà máy ở bàn không có. In ra một mã không tra được gì thì tệ
 * hơn là không in.
 *
 * Món được khuyến mãi in GIÁ GỐC rồi một dòng giảm ngay dưới, như hoá đơn có
 * chiết khấu (§9.6): khách đối được từng món với thực đơn, và cộng tay vẫn ra tổng.
 */
export function IpadInvoice() {
  const session = useTableSession()
  const navigate = useNavigate()
  const menu = useMenu(session.branchId)
  const promos = usePromos()

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
          <div className="my-3.5 border-t border-dashed border-kraft-ink/35" />
          <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] uppercase">
            {settled ? 'Hoá đơn' : 'Tạm tính'}
          </p>
          {money ? (
            <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-kraft-ink-2">
              {money.displayCode} · Bàn {session.table.code} · {session.guestCount} khách
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
          {money && money.moneyVat > 0 ? (
            <ReceiptRow label="Thuế VAT" amount={money.moneyVat} />
          ) : null}
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
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]">
          <h2 className="font-display text-[length:var(--fs-d3)] leading-[1.15] font-light text-ink-hi">
            Cảm ơn bạn đã đến Tokyo Sora.
          </h2>
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

function ReceiptRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between py-0.5 text-[length:var(--fs-c1)] text-kraft-ink-2">
      <span>{label}</span>
      <Money amount={amount} />
    </div>
  )
}
