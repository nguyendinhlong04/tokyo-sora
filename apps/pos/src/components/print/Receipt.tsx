import {
  buyerLabelOf,
  invoiceNumberLabel,
  type InvoiceBuyer,
  type InvoiceView,
} from '@sora/contracts'
import { QrCode } from '@sora/ui'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Bill, OrderLineRow, SessionOrder } from '../../api'
import { PAYMENT_LABELS, rateLabel } from '../pay/BillStatement'

export interface ReceiptData {
  tableCode: string
  order: SessionOrder['order'] | null
  lines: OrderLineRow[]
  bill: Bill
  /** Hoá đơn đã phát hành thì bill in thành hoá đơn; chưa có thì là phiếu thanh toán */
  invoice: InvoiceView | null
  /** P10 "In tạm tính" — khách chưa trả */
  provisional?: boolean
}

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n)

/**
 * Bill 80 mm — giấy in nhiệt, chỉ đen trắng, không kanji (đầu in nhiệt và người đọc
 * hoá đơn đều không cần). Hoá đơn đã phát hành thì in đúng nội dung tờ hoá đơn
 * (`document`) và QR tra cứu; chưa có thì ghi rõ "chưa phải hoá đơn".
 */
export function Receipt({
  tableCode,
  order,
  lines,
  bill,
  invoice,
  provisional = false,
}: ReceiptData) {
  const issued = invoice?.state === 'issued' && invoice.document ? invoice : null
  const doc = issued?.document ?? null
  const buyer: InvoiceBuyer | null = doc ? doc.buyer : (order?.invoiceBuyer ?? null)
  const mixed = doc
    ? new Set(
        doc.lines.filter((l) => l.kind === 'item' && l.vatRateBp !== null).map((l) => l.vatRateBp),
      ).size > 1
    : false
  const printedAt = new Date().toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-2 px-[4mm] py-[3mm] text-[length:var(--fs-c1)] leading-snug">
      {doc ? (
        <Center>
          <strong className="text-[length:var(--fs-b2)]">{doc.seller.name}</strong>
          <span>MST {doc.seller.taxCode}</span>
          <span>{doc.seller.address}</span>
          {doc.seller.branchAddress && doc.seller.branchAddress !== doc.seller.address ? (
            <span>
              {doc.seller.branchName} · {doc.seller.branchAddress}
            </span>
          ) : null}
        </Center>
      ) : (
        <Center>
          <strong className="text-[length:var(--fs-b2)] tracking-[0.12em]">TOKYO SORA</strong>
        </Center>
      )}

      <Rule />
      {issued ? (
        <Center>
          {issued.test ? <strong>HOÁ ĐƠN THỬ — KHÔNG CÓ GIÁ TRỊ</strong> : null}
          <strong className="text-[length:var(--fs-b2)]">HOÁ ĐƠN GIÁ TRỊ GIA TĂNG</strong>
          <span>(Khởi tạo từ máy tính tiền)</span>
          <span className="font-mono">{invoiceNumberLabel(issued)}</span>
          {issued.invoiceDate ? (
            <span>Ngày {issued.invoiceDate.split('-').reverse().join('/')}</span>
          ) : null}
          {issued.authorityCode ? (
            <span className="font-mono">Mã CQT {issued.authorityCode}</span>
          ) : null}
        </Center>
      ) : (
        <Center>
          <strong className="text-[length:var(--fs-b2)]">
            {provisional ? 'PHIẾU TẠM TÍNH' : 'PHIẾU THANH TOÁN'}
          </strong>
          <span>Chưa phải hoá đơn{provisional ? '' : ' — hoá đơn điện tử gửi sau'}</span>
        </Center>
      )}

      <span>
        Bàn {tableCode} · <span className="font-mono">{order?.displayCode ?? ''}</span> ·{' '}
        {printedAt}
      </span>
      <span>
        Người mua: <strong>{buyerLabelOf(buyer)}</strong>
      </span>
      {buyer?.taxCode ? <span className="font-mono">MST {buyer.taxCode}</span> : null}
      {buyer?.address ? <span>{buyer.address}</span> : null}

      <Rule />
      {doc
        ? doc.lines.map((line) => (
            <div key={line.no} className="flex flex-col">
              <span>
                {line.name}
                {mixed && line.vatRateBp !== null ? ` (VAT ${rateLabel(line.vatRateBp)})` : ''}
              </span>
              {line.kind === 'item' ? (
                <Amounts
                  left={`${line.qty} × ${fmt(line.unitPrice)}${line.discount > 0 ? ` − ${fmt(line.discount)}` : ''}`}
                  right={fmt(line.amount)}
                />
              ) : (
                <Amounts left={line.note ?? ''} right={fmt(line.amount)} />
              )}
            </div>
          ))
        : lines
            .filter((l) => l.parentLineId === null && l.state !== 'voided')
            .map((l) => (
              <div key={l.id} className="flex flex-col">
                <span>{l.nameSnapshot}</span>
                <Amounts
                  left={`${l.qty} × ${fmt(l.unitPrice)}${l.discountVnd > 0 ? ` − ${fmt(l.discountVnd)}` : ''}`}
                  right={fmt(l.priceTotal)}
                />
              </div>
            ))}

      <Rule />
      {doc ? (
        <>
          <Amounts
            left="Tiền hàng"
            right={fmt(doc.amounts.goods - doc.amounts.discount + doc.amounts.service)}
          />
          {doc.vatBreakdown
            .filter((r) => r.rateBp > 0)
            .map((r) => (
              <Amounts
                key={r.rateBp}
                left={`Thuế GTGT ${rateLabel(r.rateBp)}`}
                right={fmt(r.vat)}
              />
            ))}
          {doc.amounts.ship > 0 ? <Amounts left="Phí giao" right={fmt(doc.amounts.ship)} /> : null}
          <Amounts
            left={<strong>Tổng thanh toán</strong>}
            right={<strong>{fmt(doc.amounts.total)}</strong>}
          />
          {doc.amounts.round !== 0 ? (
            <Amounts left="Làm tròn (ngoài hoá đơn)" right={fmt(doc.amounts.round)} />
          ) : null}
        </>
      ) : order ? (
        <>
          <Amounts left="Tiền món" right={fmt(order.moneySub)} />
          {order.moneyDiscount > 0 ? (
            <Amounts left="Giảm giá" right={`−${fmt(order.moneyDiscount)}`} />
          ) : null}
          {order.moneyService > 0 ? (
            <Amounts left="Phí phục vụ" right={fmt(order.moneyService)} />
          ) : null}
          {order.vatBreakdown
            .filter((r) => r.rateBp > 0)
            .map((r) => (
              <Amounts key={r.rateBp} left={`Thuế VAT ${rateLabel(r.rateBp)}`} right={fmt(r.vat)} />
            ))}
          {order.moneyRound !== 0 ? (
            <Amounts left="Làm tròn" right={fmt(order.moneyRound)} />
          ) : null}
        </>
      ) : null}
      <Amounts
        left={<strong>{provisional ? 'Tạm tính' : 'Khách trả'}</strong>}
        right={<strong>{fmt(bill.total)}</strong>}
      />
      {(bill.payments ?? []).map((p) => (
        <Amounts key={p.id} left={PAYMENT_LABELS[p.kind] ?? p.kind} right={fmt(p.amount)} />
      ))}
      {bill.corporateCharge ? (
        <Amounts
          left={`Ghi nợ ${bill.corporateCharge.company}`}
          right={fmt(bill.corporateCharge.amount)}
        />
      ) : null}
      {bill.outstanding > 0 ? <Amounts left="Còn phải trả" right={fmt(bill.outstanding)} /> : null}

      {issued?.lookupUrl ? (
        <>
          <Rule />
          <Center>
            <QrCode value={issued.lookupUrl} size={120} label="Mã QR tra cứu hoá đơn" />
            <span>Quét để tra cứu hoá đơn</span>
            {issued.lookupCode ? (
              <span className="font-mono">Mã tra cứu {issued.lookupCode}</span>
            ) : null}
            <span className="break-all text-[length:var(--fs-c2)]">{issued.lookupUrl}</span>
          </Center>
        </>
      ) : null}
      <Center>
        <span className="pt-1">Cảm ơn quý khách</span>
      </Center>
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-0.5 text-center">{children}</div>
}

function Rule() {
  return <div className="border-t border-dashed border-current" />
}

function Amounts({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0">{left}</span>
      <span className="shrink-0 font-mono tabular-nums">{right}</span>
    </div>
  )
}

/**
 * In một tờ 80 mm qua hộp in của trình duyệt (máy quầy chạy Edge/Chrome
 * `--kiosk-printing` thì in thẳng, không hỏi). Tờ dựng ngoài cây React của app,
 * đo chiều dài thật rồi đặt `@page` đúng chiều dài đó — cuộn giấy nhiệt cắt theo
 * trang, trang dài hơn bill là tốn giấy trắng.
 */
export function printReceipt(data: ReceiptData) {
  const host = document.createElement('div')
  host.id = 'sora-print'
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(<Receipt {...data} />))

  const lengthMm = Math.ceil((host.scrollHeight * 25.4) / 96) + 4
  const page = document.createElement('style')
  page.textContent = `@page { size: 80mm ${lengthMm}mm; margin: 0 }`
  document.head.appendChild(page)

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup)
    root.unmount()
    host.remove()
    page.remove()
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}
