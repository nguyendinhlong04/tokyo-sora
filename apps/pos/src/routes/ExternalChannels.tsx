import { Badge, Button, Card, EmptyState, Money, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type DispatchCard } from '../api'
import { useSession } from '../session-context'

const CHANNELS = [
  { id: 'grab' as const, label: 'GrabFood' },
  { id: 'shopee' as const, label: 'ShopeeFood' },
  { id: 'be' as const, label: 'Be' },
]

const EXTERNAL: DispatchCard['channel'][] = ['grab', 'shopee', 'be']

/**
 * O12 Kênh ngoài.
 *
 * Không đấu nối API với Grab/Shopee/Be theo quyết định trong kế hoạch — nhập tay
 * là luồng CHÍNH THỨC. Đơn nhập ở đây đi đúng đường của đơn web: cùng bảng điều
 * phối, cùng hàng đợi bếp. Bếp không cần biết đơn đến từ đâu.
 */
export function ExternalChannels() {
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [channel, setChannel] = useState<'grab' | 'shopee' | 'be'>('grab')
  const [code, setCode] = useState('')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ dishId: string; name: string; qty: number }[]>([])

  const board = useQuery({
    queryKey: ['dispatch', branchId],
    queryFn: () => api.dispatchBoard(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 15_000,
  })

  const config = useQuery({
    queryKey: ['config', branchId],
    queryFn: () => api.config(branchId!),
    enabled: Boolean(branchId),
    staleTime: 5 * 60_000,
  })

  const matches = useMemo(() => {
    const needle = fold(query)
    if (!needle) return []
    return (config.data?.dishes ?? []).filter((d) => fold(d.nameVi).includes(needle)).slice(0, 6)
  }, [config.data, query])

  const create = useMutation({
    mutationFn: () =>
      api.createExternalOrder({
        branchId: branchId!,
        channel,
        // Kênh ngoài luôn là giao hàng — shipper của họ tới lấy tận nơi
        type: 'delivery',
        externalCode: code.trim(),
        customer: {},
        lines: picked.map((p) => ({ dishId: p.dishId, qty: p.qty })),
      }),
    onSuccess: (result) => {
      toast(`Đã thêm ${result.displayCode} vào bảng điều phối`, 'ok')
      setCode('')
      setQuery('')
      setPicked([])
      void queryClient.invalidateQueries({ queryKey: ['dispatch', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = (board.data?.orders ?? []).filter((o) => EXTERNAL.includes(o.channel))
  const ready = code.trim().length >= 2 && picked.length > 0

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col">
      <header className="flex flex-none items-start gap-4 px-6 pt-5 pb-4">
        <div>
          <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Kênh ngoài</h1>
          <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
            Đơn Grab · Shopee · Be nhập tay sẽ hiện trên bảng điều phối kèm tên kênh.
          </p>
        </div>
        <Button variant="ghost" className="ml-auto" onClick={() => void navigate('/dieu-phoi')}>
          Bảng điều phối
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_420px] gap-8 overflow-y-auto px-6 pb-8">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[130px_100px_110px_80px_1fr] gap-3 border-b border-line-1 bg-surface-2 px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Mã đơn kênh</span>
            <span>Kênh</span>
            <span>Giờ lấy</span>
            <span className="text-right">Món</span>
            <span className="text-right">Tiền</span>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Chưa có đơn kênh ngoài nào hôm nay." />
          ) : (
            rows.map((order) => (
              <div
                key={order.id}
                className="grid grid-cols-[130px_100px_110px_80px_1fr] items-center gap-3 border-b border-line-1 px-5 py-3"
              >
                <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                  {order.externalCode ?? order.displayCode}
                </span>
                <span>
                  <Badge tone="info">{order.channel}</Badge>
                </span>
                <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                  {order.slotAt
                    ? new Date(order.slotAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </span>
                <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                  {order.itemCount}
                </span>
                <Money
                  amount={order.total}
                  className="text-right text-[length:var(--fs-b2)] text-accent-ink"
                />
              </div>
            ))
          )}
        </Card>

        <Card className="h-fit p-6">
          <SectionLabel>Nhập nhanh</SectionLabel>

          <div className="mt-4 flex gap-2">
            {CHANNELS.map((option) => (
              <Button
                key={option.id}
                variant={channel === option.id ? 'primary' : 'secondary'}
                onClick={() => setChannel(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="text-[length:var(--fs-c1)] text-ink-mute">Mã đơn kênh</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="GR-8815"
              className="mt-2 h-[var(--hit-target)] w-full rounded-sm border border-line-3 bg-surface-3 px-3 font-mono text-ink-hi"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[length:var(--fs-c1)] text-ink-mute">Tìm món</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ba chi bo"
              className="mt-2 h-[var(--hit-target)] w-full rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
            />
          </label>

          {matches.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1">
              {matches.map((dish) => (
                <button
                  key={dish.id}
                  type="button"
                  onClick={() => {
                    setPicked((current) => {
                      const at = current.findIndex((p) => p.dishId === dish.id)
                      if (at >= 0) {
                        return current.map((p, i) => (i === at ? { ...p, qty: p.qty + 1 } : p))
                      }
                      return [...current, { dishId: dish.id, name: dish.nameVi, qty: 1 }]
                    })
                    setQuery('')
                  }}
                  className="flex items-center justify-between rounded-sm border border-line-2 px-3 py-2 text-left text-[length:var(--fs-b2)] text-ink-body hover:bg-surface-3"
                >
                  <span>{dish.nameVi}</span>
                  <Money amount={dish.price} className="text-[length:var(--fs-c1)] text-accent-ink" />
                </button>
              ))}
            </div>
          ) : null}

          {picked.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {picked.map((line, index) => (
                <div key={line.dishId} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Bớt ${line.name}`}
                    onClick={() =>
                      setPicked((current) =>
                        current
                          .map((p, i) => (i === index ? { ...p, qty: p.qty - 1 } : p))
                          .filter((p) => p.qty > 0),
                      )
                    }
                    className="h-9 w-9 rounded-sm border border-line-3 text-ink-body"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-mono text-ink-hi">{line.qty}</span>
                  <span className="flex-1 text-[length:var(--fs-b2)] text-ink-body">
                    {line.name}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            block
            className="mt-5"
            disabled={!ready || create.isPending}
            onClick={() => create.mutate()}
          >
            Thêm vào bảng điều phối
          </Button>
        </Card>
      </div>
    </div>
  )
}

/** Bỏ dấu để "ba chi bo" tìm ra "Ba chỉ bò" — nhân viên gõ vội, không bỏ dấu */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('đ', 'd')
    .toLowerCase()
    .trim()
}
