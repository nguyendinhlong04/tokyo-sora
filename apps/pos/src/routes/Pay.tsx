import { Button, Card, ErrorState, Money, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '../api'
import { BillStatement } from '../components/pay/BillStatement'
import { BuyerCard } from '../components/pay/BuyerCard'
import { InvoicePanel } from '../components/pay/InvoicePanel'
import { PaymentPanel } from '../components/pay/PaymentPanel'
import { PromoCard } from '../components/pay/PromoCard'
import { printReceipt } from '../components/print/Receipt'

/**
 * P10 Tính tiền · P11 Hoàn tất & in.
 *
 * Hai cột khi đủ chỗ (máy 1280, iPad ngang): bảng kê bên trái, cột việc 420px bên
 * phải; hẹp hơn (bật dải thu ngân, iPad dọc) thì xếp một cột — container query, vì
 * độ rộng phụ thuộc dải P16 chứ không chỉ màn hình.
 *
 * Trả đủ thì bàn chuyển "đã thanh toán, chờ dọn" chứ KHÔNG tự đóng — nhân viên dọn
 * xong mới đóng (§20). Cột phải lúc đó thành P11: hoá đơn điện tử, in bill, đóng bàn.
 */
export function Pay() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const tableCode = searchParams.get('code') ?? ''
  const id = Number(sessionId)
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [change, setChange] = useState<number | null>(null)

  const bill = useQuery({ queryKey: ['bill', id], queryFn: () => api.bill(id) })
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api.sessionOrder(id) })
  const invoice = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.sessionInvoice(id),
    // Hoá đơn đang chờ thì hỏi dày: mỗi lượt hỏi cũng là lượt đẩy phát hành (§9.7)
    refetchInterval: (q) => {
      const state = q.state.data?.invoice?.state
      return state === 'pending' ? 4_000 : state === 'failed' ? 20_000 : false
    },
  })

  const close = useMutation({
    mutationFn: () => api.closeSession(id, tableCode),
    onSuccess: () => {
      toast(`Đã đóng bàn ${tableCode}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      void navigate('/floor')
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const onCollected = useCallback((amount: number) => setChange(amount), [])

  if (bill.isError) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState
          message="Không lấy được bảng kê từ máy chủ. Số tiền hiện tại có thể chưa gồm đợt cuối — thử lại trước khi thu tiền."
          action={
            <Button variant="primary" onClick={() => void bill.refetch()}>
              Thử lại
            </Button>
          }
        />
      </div>
    )
  }

  const outstanding = bill.data?.outstanding ?? 0
  /**
   * Bàn KHÔNG CÒN NỢ GÌ thì đóng được — không đòi phải có tiền.
   *
   * Điều kiện cũ đòi thêm `total > 0`. Hệ quả: bàn mở nhầm, hoặc khách ngồi
   * xuống rồi bỏ đi trước khi gọi món (tổng 0đ), không hiện nút đóng ở đâu cả —
   * mà đây là chỗ DUY NHẤT trong toàn hệ thống gọi được lệnh đóng bàn. Ô bàn
   * đứng "Có khách" vĩnh viễn, không xếp được khách mới, và iPad của bàn vẫn mở
   * đơn của khách cũ vì iPad chỉ về màn bàn chưa mở khi bàn đóng.
   *
   * Máy chủ vốn đã cho đóng bàn 0đ — nó chỉ chặn khi CÒN NỢ (floorplan.service
   * `closeSession`). Nên đây là giao diện khớp lại với quy tắc sẵn có, không
   * phải nới quy tắc ra.
   */
  const settled = bill.data ? bill.data.outstanding === 0 : false
  /** Chưa gọi món nào — báo "đã thu đủ" ở đây là nói sai, chẳng thu gì cả */
  const nothingOrdered = (bill.data?.total ?? 0) === 0
  /**
   * Số tiền một lượt thu riêng, do P9 "tách theo %" tính sẵn rồi đưa sang.
   * Kẹp theo số còn phải trả: bill có thể đã thu bớt trong lúc nhân viên chọn.
   */
  const preset = Math.min(Math.max(Number(searchParams.get('thu') ?? 0) || 0, 0), outstanding)

  const print = (provisional: boolean) => {
    if (!bill.data) return
    printReceipt({
      tableCode,
      order: order.data?.order ?? null,
      lines: order.data?.lines ?? [],
      bill: bill.data,
      invoice: provisional ? null : (invoice.data?.invoice ?? null),
      provisional,
    })
  }

  return (
    <div className="@container mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
          {settled && !nothingOrdered ? 'Hoàn tất & in' : 'Tính tiền'} · Bàn {tableCode}
        </h1>
        <div className="flex gap-2">
          {!settled ? (
            <Button disabled={!bill.data || nothingOrdered} onClick={() => print(true)}>
              In tạm tính
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => void navigate(`/table/${id}?code=${tableCode}`)}>
            Về đơn
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 @min-[880px]:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="p-5">
          <BillStatement order={order.data} bill={bill.data} tableCode={tableCode} />
        </Card>

        <aside className="flex flex-col gap-4">
          {change !== null && change > 0 ? (
            <Card className="border-ok p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[length:var(--fs-b1)] text-ink-body">Tiền thối khách</span>
                <Money amount={change} className="text-[length:var(--fs-d3)] text-ok" />
              </div>
            </Card>
          ) : null}

          {!bill.data ? (
            // Chưa biết bàn đã trả hay chưa thì chưa hiện nút thu — tránh "Thu đủ · 0₫" chớp qua
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-64 w-full" />
            </>
          ) : !settled ? (
            <>
              <BuyerCard sessionId={id} status={invoice.data} />
              {bill.data?.orderId !== undefined ? (
                <PromoCard
                  orderId={bill.data.orderId}
                  locked={bill.data.paid > 0}
                  onChanged={() => {
                    void queryClient.invalidateQueries({ queryKey: ['bill', id] })
                    void queryClient.invalidateQueries({ queryKey: ['order', id] })
                  }}
                />
              ) : null}
              <PaymentPanel
                sessionId={id}
                orderId={bill.data?.orderId}
                tableCode={tableCode}
                outstanding={outstanding}
                preset={preset}
                einvoiceEnabled={invoice.data?.enabled ?? false}
                onCollected={onCollected}
              />
            </>
          ) : (
            <>
              {nothingOrdered ? null : (
                <>
                  <InvoicePanel sessionId={id} orderId={bill.data?.orderId} status={invoice.data} />
                  <Button variant="primary" size="lg" block onClick={() => print(false)}>
                    {invoice.data?.invoice?.state === 'issued'
                      ? 'In bill kèm QR tra cứu'
                      : 'In phiếu thanh toán'}
                  </Button>
                </>
              )}
              <Card
                className={`flex flex-col gap-3 p-4 ${nothingOrdered ? 'border-line-3' : 'border-ok'}`}
              >
                <p
                  className={`text-[length:var(--fs-b1)] ${nothingOrdered ? 'text-ink-body' : 'text-ok'}`}
                >
                  {nothingOrdered
                    ? 'Bàn này chưa gọi món nào. Đóng lại để trả bàn về trống.'
                    : 'Đã thu đủ. Bàn đang ở trạng thái “chờ dọn” — dọn xong thì đóng bàn.'}
                </p>
                <Button
                  variant={nothingOrdered ? 'primary' : 'secondary'}
                  size="lg"
                  block
                  disabled={close.isPending}
                  onClick={() => close.mutate()}
                >
                  Đóng bàn {tableCode}
                </Button>
              </Card>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
