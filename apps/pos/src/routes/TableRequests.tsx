import { calibrate, elapsedSeconds } from '@sora/core'
import { Badge, Button, Card, EmptyState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { api, type TableRequest } from '../api'
import { useSession } from '../session-context'

/** Quá ba phút là khách đã ngồi chờ đủ lâu để thấy khó chịu */
const LATE_SECONDS = 180

/**
 * P12 Yêu cầu từ bàn.
 *
 * Thứ tự do máy chủ quyết: cũ nhất lên trước, riêng "Xin tính tiền" ghim lên đầu.
 * Máy trạm KHÔNG sắp lại — hai máy POS cùng nhìn một hàng đợi thì phải thấy cùng
 * một thứ tự, nếu không hai người sẽ cùng chạy tới một bàn và bỏ quên bàn khác.
 */
export function TableRequests() {
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const queue = useQuery({
    queryKey: ['table-requests', branchId],
    queryFn: () => api.tableRequests(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (queue.data?.serverTime) calibrate(queue.data.serverTime)
  }, [queue.data?.serverTime])

  const done = useMutation({
    mutationFn: (request: TableRequest) => api.markRequestDone(request.id),
    onSuccess: (_result, request) => {
      toast(`Đã xử lý: ${request.label} · bàn ${request.tableCode}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['table-requests', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const requests = queue.data?.requests ?? []

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Yêu cầu từ bàn</h1>
        <Button variant="ghost" onClick={() => void navigate('/floor')}>
          Sơ đồ bàn
        </Button>
      </header>

      {queue.isPending ? (
        <p className="text-ink-mute">Đang tải hàng đợi…</p>
      ) : requests.length === 0 ? (
        <EmptyState title="Không có yêu cầu nào đang chờ. Khách bấm gọi trên điện thoại thì hiện ở đây." />
      ) : (
        requests.map((request) => {
          const waited = elapsedSeconds(request.createdAt)
          const late = waited >= LATE_SECONDS

          return (
            <Card
              key={request.id}
              className={[
                'flex items-center gap-4 p-4',
                request.urgent ? 'border-accent' : late ? 'border-warn' : '',
              ].join(' ')}
            >
              <div className="flex w-24 flex-none flex-col">
                <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
                  {request.tableCode}
                </span>
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {formatWait(waited)}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[length:var(--fs-b1)] text-ink-hi">{request.label}</span>
                  {request.urgent ? <Badge tone="accent">Ưu tiên</Badge> : null}
                  {late ? <Badge tone="warn">Chờ lâu</Badge> : null}
                </div>
                {request.note ? (
                  <span className="text-[length:var(--fs-b2)] text-ink-body">{request.note}</span>
                ) : null}
              </div>

              <Button
                onClick={() => void navigate(`/table/${request.sessionId}?code=${request.tableCode}`)}
              >
                Mở bàn
              </Button>
              <Button
                variant="primary"
                disabled={done.isPending}
                onClick={() => done.mutate(request)}
              >
                Đã xử lý
              </Button>
            </Card>
          )
        })
      )}
    </div>
  )
}

function formatWait(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return minutes < 1 ? `${seconds}s` : `${minutes}p${String(seconds % 60).padStart(2, '0')}`
}
