import { Badge, Button, EmptyState, useToast } from '@sora/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type ExpoOrder } from '../api'

/**
 * K6 Expo.
 *
 * Gom theo ĐƠN và ĐỢT chứ không theo trạm: người ra món cần biết bàn 12 đợt 2 đã
 * đủ chưa, chứ không quan tâm trạm nào đang bận.
 *
 * Cảnh báo quan trọng nhất là **vé đa trạm chờ nhau**: lẩu Sukiyaki có nồi ở ST-04
 * và khay thịt ở ST-02; ra nồi trước thì khách ngồi nhìn nồi sôi mà không có thịt.
 * Các món cùng `linkGroup` được gom lại và chỉ tính là xong khi cả nhóm xong.
 */
export function Expo() {
  const expo = useQuery({
    queryKey: ['expo'],
    queryFn: api.expo,
    refetchInterval: 5_000,
  })

  const orders = expo.data?.orders ?? []
  const ready = orders.filter((o) => o.ready)
  const waiting = orders.filter((o) => !o.ready)

  if (expo.isPending) return <p className="p-4 text-ink-mute">Đang tải…</p>
  if (orders.length === 0) {
    return <EmptyState title="Chưa có đơn nào đang chạy." />
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto">
      {ready.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-c1)] tracking-[0.14em] text-ok uppercase">
            Ra được — {ready.length} đơn
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {ready.map((order) => (
              <ExpoCard key={order.key} order={order} />
            ))}
          </div>
        </section>
      ) : null}

      {waiting.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
            Còn chờ — {waiting.length} đơn
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {waiting.map((order) => (
              <ExpoCard key={order.key} order={order} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ExpoCard({ order }: { order: ExpoOrder }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  // Món đa trạm: gom theo linkGroup để thấy rõ hai nửa của cùng một món
  const linked = new Map<string, typeof order.items>()
  const single: typeof order.items = []
  for (const item of order.items) {
    if (!item.linkGroup) {
      single.push(item)
      continue
    }
    linked.set(item.linkGroup, [...(linked.get(item.linkGroup) ?? []), item])
  }

  return (
    <article
      className={[
        'flex flex-col gap-3 rounded-md border-2 bg-surface-1 p-4',
        order.ready ? 'border-ok' : 'border-line-2',
      ].join(' ')}
    >
      <header className="flex items-baseline justify-between">
        <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
          {order.tableCode ? `Bàn ${order.tableCode}` : 'Mang về'} · Đợt {order.batchNo}
        </span>
        {order.ready ? <Badge tone="ok">Đủ món</Badge> : null}
      </header>

      {!order.ready ? (
        <p className="text-[length:var(--fs-b1)] text-warn">
          Chờ {order.waitingFor.join(' · ')}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {single.map((item, i) => (
          <ItemRow key={`s-${i}`} name={item.name} qty={item.qty} state={item.state} />
        ))}

        {[...linked.entries()].map(([group, items]) => {
          const allDone = items.every((i) => i.state === 'done')
          return (
            <li
              key={group}
              className={[
                'rounded-sm border-l-2 pl-3',
                allDone ? 'border-ok' : 'border-warn',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="text-[length:var(--fs-b1)] text-ink-hi uppercase">
                  {items[0]!.name}
                </span>
                {!allDone ? <Badge tone="warn">Chờ đủ bộ</Badge> : null}
              </div>
              <div className="flex flex-col">
                {items.map((item, i) => (
                  <span
                    key={i}
                    className={[
                      'text-[length:var(--fs-b2)]',
                      item.state === 'done' ? 'text-ok' : 'text-ink-mute',
                    ].join(' ')}
                  >
                    {item.componentLabel ?? 'phần chính'} · {item.state === 'done' ? 'xong' : 'đang làm'}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      {/*
        Chỉ hiện khi cả đợt đã xong ở MỌI trạm. Đợt còn chờ mà vẫn cho bấm là mời
        người chạy bê nửa món ra bàn — đúng cái mà màn này sinh ra để ngăn.
      */}
      {order.ready ? (
        <Button
          size="lg"
          variant="primary"
          block
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void api
              .markServed(
                order.orderId,
                order.batchNo,
                `Mang ra ${order.tableCode ?? 'mang về'} đợt ${order.batchNo}`,
              )
              .then(() => queryClient.invalidateQueries({ queryKey: ['expo'] }))
              /*
                Máy chủ từ chối là chuyện có thật, không phải trường hợp hiếm:
                "Đợt này chưa xong ở trạm ST-04" khi bảng vừa kịp đổi giữa lúc
                người chạy đưa tay bấm. Không bắt lỗi thì nút cứ sáng lại như
                chưa có gì, người chạy tưởng đã báo xong và bê món đi.
              */
              .catch((err: Error) => toast(err.message, 'danger'))
              .finally(() => setBusy(false))
          }}
        >
          Đã mang ra
        </Button>
      ) : null}
    </article>
  )
}

function ItemRow({ name, qty, state }: { name: string; qty: number; state: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="font-mono text-accent-ink">{qty}×</span>
      <span
        className={[
          'flex-1 text-[length:var(--fs-b1)] uppercase',
          state === 'done' ? 'text-ok' : 'text-ink-body',
        ].join(' ')}
      >
        {name}
      </span>
      {state === 'done' ? <span className="text-ok">✓</span> : null}
    </li>
  )
}
