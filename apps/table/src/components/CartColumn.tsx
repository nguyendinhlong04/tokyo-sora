import { Button, Money, PromoTag, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { api } from '../api'
import { useCart, type CartItem } from '../cart-context'
import { IconCheck, IconMinus, IconPencil, IconPlus } from '../icons'
import { clock } from '../order-status'
import type { CartPricing } from '../promotions'
import { useTableSession } from '../table-context'

/** T7 hiện bấy lâu rồi cột trở lại giỏ (§9.1) */
const SENT_MS = 2000

interface Sent {
  no: number
  time: string
  qty: number
  queued: boolean
  lines: CartItem[]
}

/**
 * Cột "Món đang chọn" bên phải thực đơn iPad — T6 giỏ và T7 vừa gửi trong một.
 *
 * Giỏ luôn mở cạnh thực đơn chứ không phải một màn riêng như điện thoại: tổng
 * tiền và nút Gửi bếp lúc nào cũng nằm dưới tay, khách gọi thêm bia không phải
 * đi qua màn nào. Gửi xong cột tóm tắt đợt vừa gửi hai giây rồi trở lại giỏ
 * trống — đủ để đọc "đã gửi", không bắt ai bấm "Đóng".
 */
export function CartColumn({
  nextRound,
  pricing,
  target,
  landed,
  flash,
}: {
  /** Đợt sắp gửi là đợt thứ mấy của bữa — xem `sendRounds` */
  nextRound: number
  /**
   * Khuyến mãi ước tính cho từng dòng giỏ — cùng bộ chấm máy chủ dùng lúc gửi bếp,
   * nên số khách thấy ở đây là số in trên bill (§9.6)
   */
  pricing: CartPricing
  /** Đích bay của nhãn "+N" */
  target: RefObject<HTMLSpanElement | null>
  /** Đếm lên mỗi lần một món hạ cánh — số phần nảy lên một nhịp */
  landed: number
  /** Món vừa thêm (kèm mốc thời gian) — dòng của nó sáng lên một nhịp */
  flash: { dishId: string; at: number } | null
}) {
  const session = useTableSession()
  const cart = useCart()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [sent, setSent] = useState<Sent | null>(null)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [bumping, setBumping] = useState(false)
  const [lit, setLit] = useState<string | null>(null)

  useEffect(() => {
    if (landed === 0) return
    setBumping(true)
    const timer = setTimeout(() => setBumping(false), 220)
    return () => clearTimeout(timer)
  }, [landed])

  useEffect(() => {
    if (!flash) return
    setLit(flash.dishId)
    const timer = setTimeout(() => setLit(null), 900)
    return () => clearTimeout(timer)
  }, [flash])

  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => setSent(null), SENT_MS)
    return () => clearTimeout(timer)
  }, [sent])

  const send = useMutation({
    mutationFn: async (items: CartItem[]) => {
      // Thêm món rồi mới gửi bếp — hàng đợi offline gửi tuần tự nên thứ tự này
      // giữ nguyên cả khi đang mất mạng (y như giỏ của điện thoại)
      const added = await api.addLines(session.id, cart.toLines(note))
      const fired = await api.send(session.id)
      return { items, queued: added === null || fired === null }
    },
    onSuccess: ({ items, queued }) => {
      cart.clear()
      setNote('')
      setNoteOpen(false)
      setSent({
        no: nextRound,
        time: clock(new Date().toISOString()),
        qty: items.reduce((n, l) => n + l.qty, 0),
        queued,
        lines: items,
      })
      void queryClient.invalidateQueries({ queryKey: ['order', session.id] })
      void queryClient.invalidateQueries({ queryKey: ['bill', session.id] })
    },
    onError: (err: Error) => {
      toast(err.message, 'danger')
      // Lỗi hay gặp nhất là món vừa hết: hỏi lại ngay để T16 bỏ món đó khỏi giỏ
      void queryClient.invalidateQueries({ queryKey: ['availability', session.branchId] })
    },
  })

  // Khách thêm món mới trong lúc đang đọc "đã gửi" thì giỏ trở lại ngay
  if (sent && cart.count === 0) {
    return (
      <Aside>
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center p-6 text-center animate-[sora-fade_var(--dur-panel)_var(--ease-sora)]"
        >
          <span className="grid h-16 w-16 place-items-center rounded-pill border-[1.5px] border-ok text-ok">
            <IconCheck size={30} />
          </span>
          <p className="mt-4 text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            {sent.queued ? 'Sẽ gửi bếp' : 'Đã gửi bếp'} {sent.qty} phần
          </p>
          <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
            Đợt {sent.no} · {sent.time}
          </p>
          <div className="mt-4.5 grid w-full gap-1.5 text-left">
            {sent.lines.map((l, i) => (
              <div key={i} className="flex gap-2.5 text-[length:var(--fs-b2)] text-ink-body">
                <span className="min-w-7 flex-none font-mono text-gold-300">{l.qty} ×</span>
                <span>{[l.name, ...l.options.map((o) => o.name)].join(' · ')}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[length:var(--fs-c1)] leading-normal text-ink-mute">
            {sent.queued
              ? 'Mất mạng — đợt này tự gửi khi có mạng lại.'
              : 'Theo dõi từng món ở Đơn của bàn.'}
          </p>
        </div>
      </Aside>
    )
  }

  // Dòng mới thêm của món vừa bấm là dòng SAU CÙNG mang mã món đó
  const litIndex = lit ? cart.items.findLastIndex((l) => l.dishId === lit) : -1

  return (
    <Aside>
      <div className="flex-none border-b border-surface-4 px-5 pt-3.5 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Món đang chọn</h2>
          <span
            ref={target}
            className={[
              'inline-block origin-right font-mono text-[length:var(--fs-c1)] transition-[transform,color]',
              bumping ? 'scale-[1.35] text-ink-hi' : 'text-ink-mute',
            ].join(' ')}
            style={{ transitionDuration: '160ms' }}
          >
            {cart.count > 0 ? `${cart.count} phần` : ''}
          </span>
        </div>
        <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">
          Đợt {nextRound} · chưa gửi bếp
        </p>
      </div>

      {cart.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-7 py-6 text-center">
          <span aria-hidden className="font-jp text-[44px] leading-none text-gold-900">
            空
          </span>
          <p className="mt-3.5 text-[length:var(--fs-b2)] font-semibold text-ink-hi">
            Chưa chọn món nào
          </p>
          <p className="mt-1.5 text-[length:var(--fs-c1)] leading-[1.55] text-ink-mute">
            Chạm + trên món để thêm vào đây. Món chỉ xuống bếp khi bạn bấm Gửi bếp.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 [scrollbar-width:none]">
          {cart.items.map((line, index) => {
            const deal = pricing.lines[index]
            const off = deal?.discount ?? 0
            return (
              <div
                key={`${line.dishId}#${line.note}#${line.options.map((o) => o.id).join(',')}`}
                className={[
                  '-mx-2 rounded-sm border-b border-surface-4 px-2 pt-2.5 pb-1 transition-colors duration-500',
                  index === litIndex ? 'bg-accent/12' : '',
                ].join(' ')}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                    {line.name}
                  </span>
                  <span className="flex flex-none items-baseline gap-2">
                    {off > 0 ? (
                      <Money
                        amount={line.price * line.qty}
                        className="text-[length:var(--fs-c1)] text-ink-mute line-through"
                      />
                    ) : null}
                    <Money
                      amount={line.price * line.qty - off}
                      className={[
                        'text-[length:var(--fs-b2)]',
                        off > 0 ? 'font-medium text-ember-2' : 'text-gold-300',
                      ].join(' ')}
                    />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-[length:var(--fs-c1)] text-ink-mute">
                    {line.options.length > 0 ? (
                      line.options.map((o) => o.name).join(' · ')
                    ) : (
                      <>
                        <Money amount={line.price} /> / phần
                      </>
                    )}
                  </span>
                  <div className="-mr-1.5 flex flex-none items-center">
                    <StepButton
                      label={`Bớt một ${line.name}`}
                      onClick={() => cart.setQty(index, line.qty - 1)}
                    >
                      <IconMinus size={14} stroke={1.8} />
                    </StepButton>
                    <span className="min-w-[22px] text-center font-mono text-[length:var(--fs-b2)] text-ink-hi">
                      {line.qty}
                    </span>
                    <StepButton
                      label={`Thêm một ${line.name}`}
                      onClick={() => cart.setQty(index, line.qty + 1)}
                    >
                      <IconPlus size={14} stroke={1.8} />
                    </StepButton>
                  </div>
                </div>
                {/* Nhãn ở hàng riêng: chen vào hàng tuỳ chọn thì cột 304px vỡ thành ba dòng */}
                {deal?.badge ? (
                  <p className="pb-1.5">
                    <PromoTag label={deal.badge} size="sm" />
                  </p>
                ) : null}
                {line.note ? (
                  <p className="pb-1.5 text-[length:var(--fs-c1)] leading-normal text-warn">
                    ▸ {line.note}
                  </p>
                ) : null}
              </div>
            )
          })}

          {noteOpen ? (
            <div className="pt-3 pb-4">
              <label
                htmlFor="ghi-chu-chung"
                className="block text-[length:var(--fs-b2)] font-semibold text-ink-hi"
              >
                Ghi chú chung cho bếp
              </label>
              <textarea
                id="ghi-chu-chung"
                rows={2}
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="Ví dụ: ra món chậm thôi, nhà có trẻ nhỏ"
                className="mt-2 block w-full resize-none rounded-sm border border-line-3 bg-surface-4 px-3 py-2.5 text-[length:var(--fs-b2)] leading-normal text-ink-hi placeholder:text-ink-mute"
              />
              <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
                Gắn vào những món chưa có ghi chú riêng.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="mt-1 mb-2 flex h-11 w-full items-center gap-2 text-[length:var(--fs-b2)] font-medium text-gold-300"
            >
              <IconPencil size={16} />
              Ghi chú chung cho bếp
            </button>
          )}
        </div>
      )}

      <div className="flex-none border-t border-accent/16 px-5 pt-3 pb-4">
        {pricing.hint ? (
          <p className="mb-2 flex items-center gap-2 text-[length:var(--fs-c1)] leading-snug text-ink-body">
            <PromoTag label={pricing.hint.badge} size="sm" />
            <span>
              Gọi thêm <Money amount={pricing.hint.missingVnd} className="text-ink-hi" /> để được ưu
              đãi hoá đơn
            </span>
          </p>
        ) : null}
        {cart.count > 0 && pricing.discount > 0 ? (
          <div className="mb-1 flex items-baseline justify-between text-[length:var(--fs-c1)]">
            <span className="text-ink-mute">Khuyến mãi món</span>
            <span className="font-mono text-ember-2 tabular-nums">
              −<Money amount={pricing.discount} />
            </span>
          </div>
        ) : null}
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[length:var(--fs-c1)] text-ink-mute">Tạm tính đợt này</span>
          {cart.count > 0 ? (
            <Money
              amount={cart.total - pricing.discount}
              className="text-[length:var(--fs-t2)] text-ink-hi"
            />
          ) : (
            <span className="font-mono text-[length:var(--fs-t2)] text-ink-hi">—</span>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={cart.count === 0 || send.isPending}
          onClick={() => send.mutate(cart.items)}
        >
          {cart.count > 0 ? `Gửi bếp · ${cart.count} phần` : 'Gửi bếp'}
        </Button>
      </div>
    </Aside>
  )
}

function Aside({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="Món đang chọn"
      className="flex w-76 flex-none flex-col border-l border-accent/16 bg-surface-1"
    >
      {children}
    </aside>
  )
}

/** Nút ± của dòng giỏ: ô viền 30px vẽ ra trong vùng chạm 40×44 */
function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-11 w-10 place-items-center"
    >
      <span className="grid h-[30px] w-[30px] place-items-center rounded-sm border border-line-3 text-gold-300">
        {children}
      </span>
    </button>
  )
}
