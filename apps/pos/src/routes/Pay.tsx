import { Button, Card, Money, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '../api'

/** Mệnh giá hay dùng — bấm nhanh thay vì gõ số */
const QUICK_CASH = [50_000, 100_000, 200_000, 500_000]

/**
 * P10 Tính tiền · P11 Hoàn tất.
 *
 * Trả đủ thì bàn chuyển "đã thanh toán, chờ dọn" chứ KHÔNG tự đóng — nhân viên dọn
 * xong mới đóng (§20). Nút đóng bàn vì thế nằm riêng, xuất hiện sau khi trả đủ.
 */
export function Pay() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const tableCode = searchParams.get('code') ?? ''
  const id = Number(sessionId)
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [tendered, setTendered] = useState(0)
  const [change, setChange] = useState<number | null>(null)

  const bill = useQuery({ queryKey: ['bill', id], queryFn: () => api.bill(id) })

  const pay = useMutation({
    mutationFn: (amount: number) => api.payCash(id, amount, tendered || null, tableCode),
    onSuccess: (result) => {
      if (!result) {
        toast('Đang chờ mạng — khoản thu sẽ gửi khi nối lại', 'warn')
        return
      }
      setChange(result.change)
      setTendered(0)
      toast(
        result.paymentState === 'paid' ? 'Đã thu đủ' : `Còn lại ${result.outstanding.toLocaleString('vi-VN')}₫`,
        'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['bill', id] })
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
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

  const outstanding = bill.data?.outstanding ?? 0
  const fullyPaid = bill.data ? bill.data.outstanding === 0 && bill.data.total > 0 : false

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
          Tính tiền · Bàn {tableCode}
        </h1>
        <Button variant="ghost" onClick={() => void navigate(`/table/${id}?code=${tableCode}`)}>
          Về đơn
        </Button>
      </header>

      <Card className="flex flex-col gap-3 p-5">
        <Row label="Tổng đơn" value={bill.data?.total ?? 0} strong />
        <Row label="Đã thu" value={bill.data?.paid ?? 0} />
        <div className="h-px bg-line-1" />
        <Row label="Còn phải trả" value={outstanding} strong />
      </Card>

      {change !== null && change > 0 ? (
        <Card className="border-ok p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[length:var(--fs-b1)] text-ink-body">Tiền thối khách</span>
            <Money amount={change} className="text-[length:var(--fs-d3)] text-ok" />
          </div>
        </Card>
      ) : null}

      {!fullyPaid ? (
        <Card className="flex flex-col gap-4 p-5">
          <SectionLabel>Tiền mặt</SectionLabel>
          <div className="flex items-baseline justify-between">
            <span className="text-ink-mute">Khách đưa</span>
            <Money amount={tendered} className="text-[length:var(--fs-t1)] text-ink-hi" />
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_CASH.map((amount) => (
              <Button key={amount} onClick={() => setTendered((t) => t + amount)}>
                +{amount.toLocaleString('vi-VN')}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setTendered(0)}>
              Xoá
            </Button>
          </div>
          <Button
            variant="primary"
            size="lg"
            block
            disabled={outstanding === 0 || pay.isPending}
            onClick={() => pay.mutate(outstanding)}
          >
            Thu đủ · <Money amount={outstanding} />
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 border-ok p-5">
          <p className="text-[length:var(--fs-b1)] text-ok">
            Đã thu đủ. Bàn đang ở trạng thái “chờ dọn” — dọn xong thì đóng bàn.
          </p>
          <Button variant="primary" size="lg" block disabled={close.isPending} onClick={() => close.mutate()}>
            Đóng bàn {tableCode}
          </Button>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={strong ? 'text-ink-hi' : 'text-ink-mute'}>{label}</span>
      <Money
        amount={value}
        className={strong ? 'text-[length:var(--fs-t1)] text-ink-hi' : 'text-ink-body'}
      />
    </div>
  )
}
