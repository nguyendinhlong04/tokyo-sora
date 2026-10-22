import { Money, SectionLabel, Skeleton } from '@sora/ui'
import type { Bill, PaymentKind, SessionOrder } from '../../api'

export const PAYMENT_LABELS: Record<PaymentKind, string> = {
  cash: 'Tiền mặt',
  card: 'Thẻ',
  vietqr: 'Chuyển khoản',
  cod: 'Thu hộ',
}

/** 800 → "8%", 850 → "8,5%" */
export function rateLabel(rateBp: number): string {
  return `${(rateBp / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`
}

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''

/**
 * P10 bảng kê — cột trái. Thứ tự đúng như tờ hoá đơn sẽ in: món giá niêm yết, các
 * phần giảm, phí phục vụ, VAT từng thuế suất (món ăn 8%, bia rượu 10%), tổng; rồi
 * những gì đã thu và phần còn phải thu.
 */
export function BillStatement({
  order,
  bill,
  tableCode,
}: {
  order: SessionOrder | null | undefined
  bill: Bill | undefined
  tableCode: string
}) {
  if (order === undefined || !bill) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-56" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  const money = order?.order
  const lines = (order?.lines ?? []).filter((l) => l.parentLineId === null && l.state !== 'voided')
  const lineDiscount = lines.reduce((sum, l) => sum + l.discountVnd, 0)
  const breakdown = money?.vatBreakdown ?? []
  // Bill có cả món ăn lẫn bia rượu thì dòng bia rượu ghi thuế suất — đúng như hoá đơn in.
  // Bia rượu không bao giờ được giảm thuế, nên khi hai thuế suất khác nhau nó là mức cao hơn.
  const mixedRates = breakdown.filter((r) => r.goods > 0).length > 1
  const alcoholRate = Math.max(0, ...breakdown.map((r) => r.rateBp))

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
          Bảng kê · Bàn {tableCode}
        </h2>
        {money ? (
          <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {money.displayCode}
          </span>
        ) : null}
      </header>

      {lines.length === 0 ? (
        <p className="text-[length:var(--fs-b2)] text-ink-mute">Bàn này chưa gọi món nào.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-1">
          {lines.map((line) => {
            const options = (line.modifiers ?? []).map((m) => m.name).join(' · ')
            return (
              <li key={line.id} className="grid grid-cols-[40px_1fr_auto] gap-x-3 py-2.5">
                <span className="font-mono text-[length:var(--fs-b2)] text-ink-mute tabular-nums">
                  {line.qty}×
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[length:var(--fs-b1)] text-ink-hi">
                    {line.nameSnapshot}
                  </span>
                  {options ? (
                    <span className="text-[length:var(--fs-c1)] text-ink-mute">{options}</span>
                  ) : null}
                  {line.discountVnd > 0 ? (
                    <span className="text-[length:var(--fs-c1)] text-ok">
                      Khuyến mãi −<Money amount={line.discountVnd} />
                    </span>
                  ) : null}
                  {mixedRates && line.vatCode === 'alcohol' ? (
                    <span className="text-[length:var(--fs-c1)] text-ink-mute">
                      Bia, rượu · VAT {rateLabel(alcoholRate)}
                    </span>
                  ) : null}
                </div>
                <Money
                  amount={line.priceTotal}
                  className="text-right text-[length:var(--fs-b1)] text-ink-body"
                />
              </li>
            )
          })}
        </ul>
      )}

      {money ? (
        <div className="flex flex-col gap-2 border-t border-line-2 pt-3">
          <Row label="Tiền món (giá niêm yết)" amount={money.moneySub} />
          {lineDiscount > 0 ? (
            <Row label="Khuyến mãi món" amount={-lineDiscount} tone="ok" />
          ) : null}
          {money.moneyBillDiscount > 0 ? (
            <Row label="Giảm trên hoá đơn" amount={-money.moneyBillDiscount} tone="ok" />
          ) : null}
          {money.moneyService > 0 ? <Row label="Phí phục vụ" amount={money.moneyService} /> : null}
          {breakdown.length > 0 ? (
            breakdown
              .filter((r) => r.rateBp > 0)
              .map((r) => (
                <Row
                  key={r.rateBp}
                  label={`Thuế VAT ${rateLabel(r.rateBp)}${mixedRates ? ` · trên ${new Intl.NumberFormat('vi-VN').format(r.net)}₫` : ''}`}
                  amount={r.vat}
                />
              ))
          ) : money.moneyVat > 0 ? (
            <Row label="Thuế VAT" amount={money.moneyVat} />
          ) : null}
          {money.moneyRound !== 0 ? <Row label="Làm tròn" amount={money.moneyRound} /> : null}
          <div className="flex items-baseline justify-between border-t border-line-1 pt-2">
            <span className="text-ink-hi">Tổng hoá đơn</span>
            <Money amount={bill.total} className="text-[length:var(--fs-t2)] text-ink-hi" />
          </div>
        </div>
      ) : null}

      {(bill.payments ?? []).length > 0 || bill.corporateCharge ? (
        <div className="flex flex-col gap-2">
          <SectionLabel>Đã thu</SectionLabel>
          {(bill.payments ?? []).map((p) => (
            <Row
              key={p.id}
              label={`${PAYMENT_LABELS[p.kind] ?? p.kind} ${timeOf(p.paidAt)}`}
              amount={-p.amount}
              tone="ok"
            />
          ))}
          {bill.corporateCharge ? (
            <Row
              label={`Ghi nợ · ${bill.corporateCharge.company}`}
              amount={-bill.corporateCharge.amount}
              tone="ok"
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex items-baseline justify-between border-t border-accent/16 pt-3">
        <span className="text-[length:var(--fs-b1)] text-ink-hi">Còn phải thu</span>
        <Money amount={bill.outstanding} className="text-[length:var(--fs-d3)] text-accent-ink" />
      </div>
    </section>
  )
}

function Row({
  label,
  amount,
  tone = 'body',
}: {
  label: string
  amount: number
  tone?: 'body' | 'ok'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[length:var(--fs-b2)] text-ink-mute">{label}</span>
      <Money
        amount={amount}
        className={['text-[length:var(--fs-b1)]', tone === 'ok' ? 'text-ok' : 'text-ink-body'].join(
          ' ',
        )}
      />
    </div>
  )
}
