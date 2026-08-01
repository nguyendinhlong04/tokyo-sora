import { Badge, Button, EmptyState, Modal, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, type ConfigDish } from '../api'

/**
 * K5 Báo hết món.
 *
 * Bấm một cái là khoá ngay trên Table, POS và menu online — điểm dễ sai §9.3: chậm
 * vài giây là khách vẫn đặt được món đã hết.
 *
 * Chỉ hiện món CỦA TRẠM NÀY. Bếp nướng không có lý do gì để tắt món của quầy bar,
 * và danh sách ngắn thì bấm nhanh hơn.
 */
export function SoldOut() {
  const toast = useToast()
  const qc = useQueryClient()
  const [limiting, setLimiting] = useState<ConfigDish | null>(null)
  const [remaining, setRemaining] = useState(5)

  // Chi nhánh và trạm lấy từ SERVER chứ không từ localStorage: bản lưu ở máy chỉ
  // là cache, và nó vắng mặt trong mọi trường hợp thiết bị được ghép ở nơi khác
  // hay bộ nhớ trình duyệt bị dọn. Thiếu nó thì màn treo ở "đang tải" vĩnh viễn.
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 10 * 60_000 })

  const config = useQuery({
    queryKey: ['config', me.data?.branchId],
    queryFn: () => api.config(me.data!.branchId),
    enabled: Boolean(me.data?.branchId),
    staleTime: 5 * 60_000,
  })

  const availability = useQuery({
    queryKey: ['availability'],
    queryFn: api.availability,
    refetchInterval: 15_000,
  })

  const statusOf = useMemo(
    () => new Map((availability.data ?? []).map((a) => [a.dishId, a])),
    [availability.data],
  )

  const mutate = useMutation({
    mutationFn: (input: {
      dish: ConfigDish
      status: 'sold_out' | 'limited' | 'available'
      remaining: number | null
    }) =>
      api.setAvailability(
        input.dish.id,
        input.status,
        input.remaining,
        `${input.status === 'available' ? 'Mở lại' : 'Báo hết'} ${input.dish.nameVi}`,
      ),
    onSuccess: (_result, input) => {
      const label = {
        sold_out: `Đã báo hết ${input.dish.nameVi}`,
        limited: `${input.dish.nameVi} còn ${input.remaining} phần`,
        available: `Đã mở lại ${input.dish.nameVi}`,
      }[input.status]
      toast(label, input.status === 'available' ? 'ok' : 'warn')
      setLimiting(null)
      void qc.invalidateQueries({ queryKey: ['availability'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  // Món thuộc trạm này: khớp bất kỳ nhánh trạm nào của nó
  const station = me.data?.stationId
  const dishes = (config.data?.dishes ?? []).filter((d) => {
    if (d.kind === 'set' || !d.routing) return false
    if (!station) return true
    return (
      d.routing.stationGrill === station ||
      d.routing.stationNoGrill === station ||
      d.routing.secondaryStation === station
    )
  })

  if (me.isPending || config.isPending) {
    return <p className="p-4 text-ink-mute">Đang tải thực đơn…</p>
  }
  if (me.isError || config.isError) {
    return (
      <EmptyState title="Không tải được thực đơn. Kiểm tra máy đã ghép với chi nhánh chưa." />
    )
  }
  if (dishes.length === 0) {
    return <EmptyState title="Trạm này chưa có món nào được khai trong thực đơn." />
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3 overflow-y-auto xl:grid-cols-4">
        {dishes.map((dish) => {
          const status = statusOf.get(dish.id)
          const out = status?.status === 'sold_out'
          const limited = status?.status === 'limited'

          return (
            <article
              key={dish.id}
              className={[
                'flex flex-col justify-between gap-3 rounded-md border-2 bg-surface-1 p-4',
                out ? 'border-danger' : limited ? 'border-warn' : 'border-line-2',
              ].join(' ')}
            >
              <div className="flex flex-col gap-2">
                <span
                  className={[
                    'text-[length:var(--fs-ticket-dish)] leading-tight font-semibold uppercase',
                    out ? 'text-ink-mute line-through decoration-danger' : 'text-ink-hi',
                  ].join(' ')}
                >
                  {dish.nameVi}
                </span>
                {out ? <Badge tone="danger">Hết đến cuối ca</Badge> : null}
                {limited ? <Badge tone="warn">Còn {status?.remaining} phần</Badge> : null}
              </div>

              <div className="flex gap-2">
                {out || limited ? (
                  <Button
                    block
                    onClick={() => mutate.mutate({ dish, status: 'available', remaining: null })}
                  >
                    Mở lại
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={() => mutate.mutate({ dish, status: 'sold_out', remaining: null })}
                    >
                      Hết
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        setRemaining(5)
                        setLimiting(dish)
                      }}
                    >
                      Còn N
                    </Button>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <Modal
        open={limiting !== null}
        title={`${limiting?.nameVi ?? ''} còn mấy phần?`}
        onClose={() => setLimiting(null)}
        footer={
          <>
            <Button onClick={() => setLimiting(null)}>Huỷ</Button>
            <Button
              variant="primary"
              onClick={() =>
                limiting && mutate.mutate({ dish: limiting, status: 'limited', remaining })
              }
            >
              Xác nhận
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRemaining(n)}
              className={[
                'h-16 w-16 rounded-md border font-mono text-[length:var(--fs-t1)]',
                n === remaining
                  ? 'border-accent bg-accent-strong text-on-accent'
                  : 'border-line-3 text-ink-body',
              ].join(' ')}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[length:var(--fs-b2)] text-ink-mute">
          Bán hết N phần thì món tự khoá. Số phần trừ ngay lúc gọi món, không đợi nấu xong.
        </p>
      </Modal>
    </>
  )
}
