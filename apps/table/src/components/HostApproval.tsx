import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { Sheet } from './Sheet'

/**
 * Lời hỏi duyệt hiện trên máy CHỦ BÀN khi có người xin vào.
 *
 * Dùng `Sheet` chứ không tự dựng một khung ghim đáy: thanh giỏ hàng cũng ghim
 * đáy và nằm ở lớp trên, nên khung tự dựng bị nó che mất đúng hai cái nút. Ngoài
 * ra một quyết định "cho người lạ vào bàn mình" xứng đáng có nền mờ phía sau —
 * nó buộc người ta dừng lại nhìn, thay vì lướt qua.
 *
 * Dòng bối cảnh — "bàn khai N khách, đã có M máy" — là phần quan trọng nhất.
 * Một nút Đồng ý trơ trọi sẽ bị bấm theo phản xạ: chủ bàn đang ngồi với mấy
 * người bạn cùng nghịch điện thoại, họ không có căn cứ nào để nghi ngờ. Số khách
 * thì lễ tân đã nhập sẵn lúc mở bàn, nên đưa ra đây không tốn thêm thao tác nào
 * mà lại cho họ đúng thứ đang thiếu.
 */
export function HostApproval() {
  const toast = useToast()
  const queryClient = useQueryClient()
  /**
   * Máy đã bấm "Để sau".
   *
   * Không có danh sách này thì tấm vừa đóng lại bật lên ngay ở lượt hỏi kế tiếp,
   * bốn giây một lần, và chủ bàn không ăn nổi bữa cơm. Yêu cầu vẫn nằm chờ ở máy
   * chủ — nhân viên duyệt hộ được.
   */
  const [deSau, setDeSau] = useState<number[]>([])

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
    // Hỏi lại vài giây một lần — người xin vào đang đứng chờ, đừng bắt họ đợi lâu
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

  const cho = (pending.data?.waiting ?? []).filter((w) => !deSau.includes(w.deviceId))
  const hoi = cho[0]
  if (!isHost || !hoi || !pending.data) return null

  const { guestCount, admittedCount } = pending.data
  // Máy vượt quá số khách đã khai là dấu hiệu đáng dừng lại — nói thẳng ra
  const vuotSoKhach = admittedCount >= guestCount

  return (
    <Sheet open onClose={() => setDeSau((cu) => [...cu, hoi.deviceId])}>
      <div className="px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-[length:var(--fs-t2)] font-medium text-ink-hi">
          Có người ở bàn bạn muốn cùng gọi món.
        </p>

        <p
          className={`mt-2 text-[length:var(--fs-b2)] ${vuotSoKhach ? 'text-danger' : 'text-ink-body'}`}
        >
          Bàn khai <b>{guestCount} khách</b>, hiện đã có <b>{admittedCount} máy</b> đang gọi món.
          {vuotSoKhach
            ? ' Nhiều hơn số khách đã khai — kiểm lại xem có đúng người trong bàn không.'
            : null}
        </p>

        {cho.length > 1 ? (
          <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
            Còn {cho.length - 1} máy nữa đang chờ — trả lời xong máy này sẽ tới máy tiếp theo.
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Button
            size="lg"
            variant="primary"
            block
            disabled={decide.isPending}
            onClick={() => decide.mutate({ deviceId: hoi.deviceId, approve: true })}
          >
            Đồng ý
          </Button>
          <Button
            size="lg"
            block
            disabled={decide.isPending}
            onClick={() => decide.mutate({ deviceId: hoi.deviceId, approve: false })}
          >
            Từ chối
          </Button>
        </div>

        <button
          type="button"
          className="mt-3 w-full py-2 text-[length:var(--fs-b2)] text-ink-mute"
          onClick={() => setDeSau((cu) => [...cu, hoi.deviceId])}
        >
          Để sau
        </button>
      </div>
    </Sheet>
  )
}
