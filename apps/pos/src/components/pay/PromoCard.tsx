import { Button, Card, Money, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PromoQuote } from '../../api'

/**
 * Khuyến mãi & voucher (§9.6).
 *
 * Chương trình tự áp đã nằm sẵn trong tiền đơn — khối này cho thu ngân THẤY đơn
 * đang được giảm gì, và là chỗ gắn mã voucher khách đưa. "Kiểm mã" chỉ đọc: thu
 * ngân nói được với khách mã giảm bao nhiêu TRƯỚC khi trừ lượt của mã, và thấy
 * ngay khi chương trình đang áp đã lợi hơn mã — gắn vào chỉ tốn một lượt.
 */
export function PromoCard({
  orderId,
  locked,
  onChanged,
}: {
  orderId: number
  /** Đã có tiền vào đơn — máy chủ không cho đổi mã nữa (`payment_started`) */
  locked: boolean
  onChanged: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [tried, setTried] = useState<PromoQuote | null>(null)

  const quote = useQuery({
    queryKey: ['promo-quote', orderId],
    queryFn: () => api.promoQuote(orderId),
  })
  const refresh = () => {
    setTried(null)
    void queryClient.invalidateQueries({ queryKey: ['promo-quote', orderId] })
    onChanged()
  }

  const check = useMutation({
    mutationFn: () => api.promoQuote(orderId, code.trim()),
    onSuccess: setTried,
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  const apply = useMutation({
    mutationFn: () => api.applyVoucher(orderId, code.trim()),
    onSuccess: () => {
      toast(`Đã áp mã ${code.trim().toUpperCase()}`, 'ok')
      setCode('')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  const remove = useMutation({
    mutationFn: () => api.removeVoucher(orderId),
    onSuccess: () => {
      toast('Đã bỏ mã — lượt dùng trả lại cho mã', 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const now = quote.data
  // Mã hợp lệ mà chương trình thắng vẫn là cái đang áp → gắn mã không đổi đồng nào
  const noGain =
    tried?.voucher?.accepted === true && tried.bill?.promotionId === now?.bill?.promotionId

  return (
    <Card className="flex flex-col gap-3 p-5">
      <SectionLabel>Khuyến mãi & voucher</SectionLabel>

      {now && now.lineDiscountVnd > 0 ? (
        <Row label="Khuyến mãi món · đã trừ trong giá món" value={-now.lineDiscountVnd} />
      ) : null}
      {now?.bill ? <Row label={now.bill.name} value={-now.bill.discountVnd} /> : null}
      {now && now.lineDiscountVnd === 0 && !now.bill ? (
        <p className="text-[length:var(--fs-b2)] text-ink-mute">Đơn chưa được giảm gì.</p>
      ) : null}
      {now?.hint ? (
        <p className="text-[length:var(--fs-b2)] text-ink-body">
          Gọi thêm <Money amount={now.hint.missingVnd} className="text-ink-hi" /> để được{' '}
          {now.hint.name}
        </p>
      ) : null}

      {now?.attachedVoucher ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[length:var(--fs-b2)] text-ink-body">
            Mã đang dùng{' '}
            <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">
              {now.attachedVoucher}
            </span>
          </span>
          <Button disabled={locked || remove.isPending} onClick={() => remove.mutate()}>
            Bỏ mã
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setTried(null)
              }}
              placeholder="Mã voucher"
              aria-label="Mã voucher"
              autoCapitalize="characters"
              autoComplete="off"
              disabled={locked}
              className="h-[var(--hit-target)] min-w-0 flex-1 rounded-sm border border-line-3 bg-surface-3 px-3 font-mono text-ink-hi disabled:text-ink-mute"
            />
            <Button
              disabled={locked || code.trim() === '' || check.isPending}
              onClick={() => check.mutate()}
            >
              Kiểm mã
            </Button>
            <Button
              variant="primary"
              disabled={locked || code.trim() === '' || apply.isPending}
              onClick={() => apply.mutate()}
            >
              Áp mã
            </Button>
          </div>
          {tried?.voucher ? (
            tried.voucher.accepted ? (
              <p className="text-[length:var(--fs-b2)] text-ink-body">
                {noGain ? (
                  'Mã dùng được, nhưng chương trình đang áp đã lợi hơn — gắn mã chỉ tốn một lượt.'
                ) : (
                  <>
                    Mã dùng được: {tried.bill?.name} giảm{' '}
                    <Money amount={tried.bill?.discountVnd ?? 0} className="text-ok" />
                  </>
                )}
              </p>
            ) : (
              <p className="text-[length:var(--fs-b2)] text-warn">{tried.voucher.reason}</p>
            )
          ) : null}
        </>
      )}

      {locked ? (
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          Bàn đã có lượt trả — gắn hay bỏ mã phải làm trước khi thu tiền.
        </p>
      ) : null}
    </Card>
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
