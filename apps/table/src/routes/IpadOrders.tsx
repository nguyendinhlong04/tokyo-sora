import { Button, Money, Skeleton } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type Dish, type OrderLineRow } from '../api'
import { useCart } from '../cart-context'
import { BackLink } from '../components/PayHeader'
import { StoryDialog } from '../components/StoryDialog'
import { IconBook, IconPlus, IconWarning } from '../icons'
import { useMenu } from '../menu'
import { clock, LABELS, sendRounds, STEPS } from '../order-status'
import { storyMore, useStories } from '../stories'
import { useTableSession } from '../table-context'
import { useIpadCall } from './IpadShell'
import { useOutbox } from './Shell'

/** Thang than hồng của tiến độ món (§4.1): tro → đồng → than → đã ra */
const TONE: Record<OrderLineRow['state'], string> = {
  draft: 'bg-line-4',
  queued: 'bg-ember-0',
  cooking: 'bg-ember-1',
  ready: 'bg-ember-2',
  served: 'bg-ok',
  voided: 'bg-danger-line',
}

/**
 * T8 Đơn của bàn + T10 Tạm tính — một màn trên iPad.
 *
 * Điện thoại tách hai màn vì chật; màn ngang thì đặt cạnh nhau: bên trái từng
 * món đang tới đâu, bên phải bàn đang nợ bao nhiêu. Hai câu hỏi đó khách hỏi
 * cùng lúc ("món bò ra chưa, tới giờ hết bao nhiêu rồi"), nên không bắt họ
 * chuyển qua lại.
 */
export function IpadOrders() {
  const session = useTableSession()
  const navigate = useNavigate()
  const cart = useCart()
  const call = useIpadCall()
  const outbox = useOutbox()
  const menu = useMenu(session.branchId)
  const stories = useStories()
  const [storyDish, setStoryDish] = useState<Dish | null>(null)
  const dishById = useMemo(() => new Map(menu.dishes.map((d) => [d.id, d])), [menu.dishes])

  /** Món đã gọi có bài kể thì có nút "Bí quyết" ngay trên dòng — ăn tới đâu đọc tới đó */
  const storyFor = (line: OrderLineRow) => {
    const dish = dishById.get(line.dishId)
    return line.state !== 'voided' && dish && stories.storyOf(dish.id)
      ? () => setStoryDish(dish)
      : null
  }
  // Gọi thêm từ Bí quyết: về thực đơn với chi tiết món mở sẵn, chọn vị rồi thêm như thường
  const orderFromStory = (dish: Dish) => void navigate('/thuc-don', { state: { open: dish.id } })
  const story = storyDish ? stories.storyOf(storyDish.id) : null

  const order = useQuery({
    queryKey: ['order', session.id],
    queryFn: () => api.order(session.id),
    refetchInterval: 15_000,
  })
  const bill = useQuery({
    queryKey: ['bill', session.id],
    queryFn: () => api.bill(session.id),
    refetchInterval: 15_000,
  })

  const rounds = sendRounds(order.data).reverse()
  // Dòng đã lên đơn mà chưa gửi bếp — thường là lần gửi trước đứt giữa chừng
  const unsent = (order.data?.lines ?? []).filter(
    (l) => l.parentLineId === null && l.state === 'draft',
  )
  const sentLines = rounds.flatMap((r) => r.lines).filter((l) => l.state !== 'voided')
  const served = sentLines.filter((l) => l.state === 'served').length
  const money = order.data?.order
  const settled = bill.data ? bill.data.outstanding === 0 && bill.data.total > 0 : false

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-none items-end gap-4 border-b border-surface-4 px-6 pt-2.5 pb-3.5">
          <div className="min-w-0 flex-1">
            <BackLink onClick={() => void navigate('/thuc-don')}>Thực đơn</BackLink>
            <h1 className="font-display text-[length:var(--fs-d3)] leading-[1.15] font-light text-ink-hi">
              Đơn của bàn
            </h1>
            <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">
              {rounds.length > 0
                ? `${served}/${sentLines.length} món đã ra · ${rounds.length} đợt`
                : 'Chưa gửi bếp đợt nào'}
            </p>
          </div>
          <Button onClick={() => void navigate('/thuc-don')}>
            <IconPlus size={16} />
            Gọi thêm món
          </Button>
        </div>

        {cart.count > 0 ? (
          <div className="mx-6 mt-3 flex flex-none items-center gap-3 rounded-md border border-warn/55 bg-warn/8 py-1.5 pr-1.5 pl-3.5">
            <IconWarning className="flex-none text-warn" />
            <span className="flex-1 text-[length:var(--fs-b2)] text-ink-hi">
              Còn {cart.count} phần đang chọn, chưa gửi bếp.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-gold-200"
              onClick={() => void navigate('/thuc-don')}
            >
              Xem giỏ
            </Button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-6 [scrollbar-width:none]">
          {order.isPending ? (
            <div className="grid gap-3">
              <Skeleton className="h-40 rounded-md" />
              <Skeleton className="h-28 rounded-md" />
            </div>
          ) : rounds.length === 0 && unsent.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span aria-hidden className="font-jp text-[44px] leading-none text-gold-900">
                空
              </span>
              <p className="mt-3.5 text-[length:var(--fs-b2)] text-ink-body">
                Bàn chưa gọi món nào.
              </p>
              <Button className="mt-3" onClick={() => void navigate('/thuc-don')}>
                Xem thực đơn
              </Button>
            </div>
          ) : (
            <>
              {unsent.length > 0 ? (
                <Round
                  title="Chưa gửi bếp"
                  meta="Sẽ xuống bếp cùng lần gửi tới"
                  lines={unsent}
                  storyFor={storyFor}
                />
              ) : null}
              {rounds.map((round) => {
                const live = round.lines.filter((l) => l.state !== 'voided')
                const done = live.filter((l) => l.state === 'served').length
                return (
                  <Round
                    key={round.sentAt}
                    title={`Đợt ${round.no}`}
                    meta={`${clock(round.sentAt)} · ${done}/${live.length} món đã ra`}
                    lines={round.lines}
                    storyFor={storyFor}
                  />
                )
              })}
            </>
          )}
        </div>
      </section>

      <aside
        aria-label="Tạm tính"
        className="flex w-90 flex-none flex-col border-l border-accent/16 bg-surface-1 px-6 pt-5 pb-6"
      >
        <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          Tạm tính
        </p>
        <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">
          Bàn {session.table.code} · {session.guestCount} khách · chưa phải hoá đơn
        </p>
        <div className="mt-4 grid gap-2">
          <MoneyRow label="Tiền món" amount={money?.moneySub ?? 0} />
          {money && money.moneyService > 0 ? (
            <MoneyRow label="Phí phục vụ" amount={money.moneyService} />
          ) : null}
          {money && money.moneyVat > 0 ? (
            <MoneyRow label="Thuế VAT" amount={money.moneyVat} />
          ) : null}
          {money && money.moneyRound !== 0 ? (
            <MoneyRow label="Làm tròn" amount={money.moneyRound} />
          ) : null}
        </div>
        <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-line-1 pt-3.5">
          <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">Tổng</span>
          <Money
            amount={money?.moneyTotal ?? 0}
            className="text-[length:var(--fs-t1)] text-ink-hi"
          />
        </div>
        {bill.data && bill.data.paid > 0 && !settled ? (
          <p className="mt-1.5 text-right text-[length:var(--fs-c1)] text-ink-mute">
            Đã trả <Money amount={bill.data.paid} /> · còn <Money amount={bill.data.outstanding} />
          </p>
        ) : null}

        <div className="flex-1" />
        {!outbox.online && !settled ? (
          <p className="mb-3 text-[length:var(--fs-c1)] leading-normal text-ink-hi">
            Thanh toán cần mạng ổn định. Vui lòng gọi thu ngân.
          </p>
        ) : null}
        {settled ? (
          <Button variant="primary" size="lg" block onClick={() => void navigate('/hoa-don')}>
            Xem hoá đơn
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!outbox.online || !money || money.moneyTotal === 0}
            onClick={() => void navigate('/tra-tien')}
          >
            Thanh toán
          </Button>
        )}
        <Button
          block
          className="mt-2"
          disabled={call.calling}
          onClick={() => call.call('tinh-tien')}
        >
          Gọi thu ngân
        </Button>
      </aside>

      {storyDish && story ? (
        <StoryDialog
          dish={storyDish}
          story={story}
          stories={stories}
          soldOut={menu.soldOut.has(storyDish.id)}
          more={storyMore(storyDish, story, menu)}
          onOrder={() => orderFromStory(storyDish)}
          onOpenDish={orderFromStory}
          onQuickAdd={orderFromStory}
          onClose={() => setStoryDish(null)}
        />
      ) : null}
    </div>
  )
}

function MoneyRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between gap-3 text-[length:var(--fs-b2)]">
      <span className="text-ink-mute">{label}</span>
      <Money amount={amount} className="text-ink-body" />
    </div>
  )
}

function Round({
  title,
  meta,
  lines,
  storyFor,
}: {
  title: string
  meta: string
  lines: OrderLineRow[]
  storyFor: (line: OrderLineRow) => (() => void) | null
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-md border border-line-1 bg-surface-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-1 px-4 py-3">
        <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">{title}</span>
        <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">{meta}</span>
      </div>
      {lines.map((line) => (
        <LineRow key={line.id} line={line} onStory={storyFor(line)} />
      ))}
    </div>
  )
}

function LineRow({ line, onStory }: { line: OrderLineRow; onStory: (() => void) | null }) {
  const voided = line.state === 'voided'
  const step = STEPS.indexOf(line.state)
  const sub = [...(line.modifiers ?? []).map((m) => m.name), line.note ? `“${line.note}”` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_168px_104px] items-center gap-5 border-b border-surface-4 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p
          className={[
            'text-[length:var(--fs-b2)] leading-snug font-semibold',
            voided ? 'text-ink-mute line-through' : 'text-ink-hi',
          ].join(' ')}
        >
          {line.qty} × {line.nameSnapshot}
        </p>
        {sub ? <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">{sub}</p> : null}
        {onStory ? (
          <button
            type="button"
            onClick={onStory}
            className="-mt-0.5 -mb-2 -ml-1.5 h-11 px-1.5 py-1"
          >
            <span className="flex h-[30px] items-center gap-1.5 rounded-sm border border-accent/35 px-2.5 text-[length:var(--fs-b2)] font-medium whitespace-nowrap text-gold-200">
              <IconBook size={15} />
              Bí quyết thưởng thức
            </span>
          </button>
        ) : null}
      </div>
      <div>
        <p className="flex items-center gap-2 text-[length:var(--fs-c1)] text-ink-body">
          <span
            aria-hidden
            className={['h-2 w-2 flex-none rounded-pill', TONE[line.state]].join(' ')}
          />
          {voided && line.voidReason ? `${LABELS.voided} · ${line.voidReason}` : LABELS[line.state]}
        </p>
        {/* Bốn nấc in thành bốn vạch: nhìn lướt cả đơn biết món nào sắp ra */}
        <div aria-hidden className="mt-[7px] flex gap-[3px]">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={[
                'h-[3px] flex-1 rounded-[2px]',
                !voided && step >= 0 && i <= step ? TONE[line.state] : 'bg-line-1',
              ].join(' ')}
            />
          ))}
        </div>
      </div>
      <Money
        amount={line.priceTotal}
        className={[
          'text-right text-[length:var(--fs-b2)]',
          voided ? 'text-ink-mute line-through' : 'text-gold-300',
        ].join(' ')}
      />
    </div>
  )
}
