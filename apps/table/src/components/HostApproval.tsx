import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

/**
 * Lời hỏi duyệt hiện trên máy CHỦ BÀN khi có người xin vào.
 *
 * Dòng bối cảnh — "bàn khai N khách, đã có M máy" — là phần quan trọng nhất của
 * màn này. Một nút Đồng ý trơ trọi sẽ bị bấm theo phản xạ: chủ bàn đang ngồi với
 * mấy người bạn cùng nghịch điện thoại, họ không có căn cứ nào để nghi ngờ. Số
 * khách thì lễ tân đã nhập sẵn lúc mở bàn, nên đưa nó ra đây không tốn của ai
 * một thao tác nào mà lại cho họ đúng thứ đang thiếu.
 *
 * Máy thứ hai của bàn bốn người là bình thường. Máy thứ năm thì đáng dừng lại.
 */
export function HostApproval() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const me = useQuery({
    queryKey: ['device-state'],
    queryFn: () => api.deviceState(),
    retry: false,
    staleTime: 30_000,
  })

  const isHost = me.data?.isHost === true

  const pending = useQuery({
    queryKey: ['pending-devices'],
    queryFn: () => api.pending(),
    enabled: isHost,
    // Hỏi lại vài giây một lần — người xin vào đang đứng chờ, không để họ đợi lâu
    refetchInterval: 4_000,
    retry: false,
  })

  const decide = useMutation({
    mutationFn: ({ deviceId, approve }: { deviceId: number; approve: boolean }) =>
      api.decide(deviceId, approve),
    onSuccess: (result) => {
      toast(result.state === 'admitted' ? 'Đã cho vào bàn' : 'Đã từ chối', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['pending-devices'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const cho = pending.data?.waiting ?? []
  if (!isHost || cho.length === 0) return null

  const { guestCount, admittedCount } = pending.data!
  // Máy vượt quá số khách đã khai là dấu hiệu đáng dừng lại — nói thẳng ra
  const vuotSoKhach = admittedCount >= guestCount

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line-1 bg-surface-1 p-5 shadow-lg">
      <p className="text-[length:var(--fs-t2)] font-medium text-ink-hi">
        Có người ở bàn bạn muốn cùng gọi món.
      </p>

      <p className={`mt-2 text-[length:var(--fs-b2)] ${vuotSoKhach ? 'text-danger' : 'text-ink-body'}`}>
        Bàn khai <b>{guestCount} khách</b>, hiện đã có <b>{admittedCount} máy</b> đang gọi món.
        {vuotSoKhach ? ' Nhiều hơn số khách đã khai — kiểm lại xem có đúng người trong bàn không.' : null}
      </p>

      {cho.length > 1 ? (
        <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
          Có {cho.length} máy đang chờ — trả lời lần lượt từng máy.
        </p>
      ) : null}

      <div className="mt-4 flex gap-3">
        <Button
          size="lg"
          variant="primary"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ deviceId: cho[0]!.deviceId, approve: true })}
        >
          Đồng ý
        </Button>
        <Button
          size="lg"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ deviceId: cho[0]!.deviceId, approve: false })}
        >
          Từ chối
        </Button>
      </div>
    </div>
  )
}
