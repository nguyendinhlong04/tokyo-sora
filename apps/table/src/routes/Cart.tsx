import { Button, EmptyState, Money, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { BottomBar, BottomBarSpacer } from '../components/BottomBar'
import { useCart } from '../cart-context'
import { useTableSession } from '../table-context'

/** T6 Giỏ hàng → T7 Xác nhận gửi */
export function Cart() {
  const session = useTableSession()
  const cart = useCart()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [sent, setSent] = useState<{ count: number; queued: boolean } | null>(null)

  const send = useMutation({
    mutationFn: async () => {
      const lines = cart.toLines()
      // Hai lượt gọi, đúng thứ tự: thêm món vào đơn rồi mới gửi bếp. Hàng đợi
      // offline gửi tuần tự nên thứ tự này giữ nguyên cả khi đang mất mạng.
      const added = await api.addLines(session.id, lines)
      const fired = await api.send(session.id)
      return { count: lines.reduce((n, l) => n + l.qty, 0), queued: added === null || fired === null }
    },
    onSuccess: (result) => {
      cart.clear()
      setSent(result)
      void queryClient.invalidateQueries({ queryKey: ['order', session.id] })
      void queryClient.invalidateQueries({ queryKey: ['bill', session.id] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  // T7: báo xong thì tự về thực đơn — khách còn gọi tiếp, đứng lại ở màn xác nhận
  // là bắt họ bấm thêm một nút không cần thiết.
  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => void navigate('/thuc-don'), 2200)
    return () => clearTimeout(timer)
  }, [sent, navigate])

  if (sent) {
    return (
      <main className="flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center px-10 text-center animate-[sora-fade_var(--dur-reveal)_var(--ease-sora)]">
        <div className="grid h-24 w-24 place-items-center rounded-pill border border-accent">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent-ink">
            <path d="M4 12.5 9.5 18 20 7" />
          </svg>
        </div>
        <p className="mt-8 text-[length:var(--fs-t1)] font-semibold text-ink-hi">
          {sent.queued
            ? `Đã ghi ${sent.count} món — sẽ gửi bếp khi có mạng`
            : `Đã gửi bếp ${sent.count} món`}
        </p>
        <p className="mt-3 text-[length:var(--fs-b1)] text-ink-mute">Đang về thực đơn…</p>
      </main>
    )
  }

  if (cart.items.length === 0) {
    return (
      <main className="min-h-[calc(100dvh-3rem)]">
        <EmptyState
          title="Chưa có món nào. Chọn từ thực đơn để bắt đầu."
          action={
            <Button size="lg" onClick={() => void navigate('/thuc-don')}>
              Xem thực đơn
            </Button>
          }
        />
      </main>
    )
  }

  return (
    <main>
      <header className="px-4 pt-5 pb-2">
        <h1 className="font-display text-[length:var(--fs-d3)] font-light text-ink-hi">
          Giỏ của bàn {session.table.code}
        </h1>
        <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
          Bấm Gửi bếp là bếp bắt đầu làm ngay.
        </p>
      </header>

      <div className="py-2">
        {cart.items.map((line, index) => (
          <div key={`${line.dishId}#${line.note}`} className="border-b border-surface-4 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">{line.name}</p>
                {line.note ? (
                  <p className="mt-1.5 pl-3 text-[length:var(--fs-c1)] leading-normal text-warn">
                    ▸ {line.note}
                  </p>
                ) : null}
              </div>
              <Money
                amount={line.price * line.qty}
                className="flex-none text-[length:var(--fs-b1)] text-accent-ink"
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex h-[var(--hit-target)] items-center rounded-sm border border-line-3">
                <button
                  type="button"
                  aria-label={`Bớt ${line.name}`}
                  onClick={() => cart.setQty(index, line.qty - 1)}
                  className="h-full w-11 text-[length:var(--fs-t2)] text-accent-ink"
                >
                  −
                </button>
                <span className="min-w-8 text-center font-mono text-[length:var(--fs-b1)] text-ink-hi">
                  {line.qty}
                </span>
                <button
                  type="button"
                  aria-label={`Thêm ${line.name}`}
                  onClick={() => cart.setQty(index, line.qty + 1)}
                  className="h-full w-11 text-[length:var(--fs-t2)] text-accent-ink"
                >
                  +
                </button>
              </div>
              <Button variant="ghost" className="text-danger" onClick={() => cart.remove(index)}>
                Xoá
              </Button>
            </div>
          </div>
        ))}
      </div>

      <BottomBarSpacer />
      <BottomBar>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={send.isPending}
          onClick={() => send.mutate()}
        >
          Gửi bếp · <Money amount={cart.total} />
        </Button>
      </BottomBar>
    </main>
  )
}
