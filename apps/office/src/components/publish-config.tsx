import { ApiError } from '@sora/core'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

/**
 * Phát hành cấu hình xuống POS, màn bếp và máy khách.
 *
 * Đây là mắt xích mà người vận hành hay không biết là có: sửa giá, đổi tên món
 * hay bật tắt món ở Office **không tự xuống** các máy đó. Chúng đọc một bản cấu
 * hình đã đóng gói, không đọc thẳng CSDL — nên không bấm phát hành thì quán vẫn
 * bán theo giá cũ, và không ai báo lỗi gì cả.
 *
 * Vì thế nút này nằm ở thanh bên chứ không nằm trong một màn cụ thể: thay đổi
 * đáng phát hành nằm rải khắp M1, M5, M10, M11 và cả A6 tham số.
 */
export function PublishConfig({ branchId }: { branchId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const hienHanh = useQuery({
    queryKey: ['config-version', branchId],
    queryFn: () => api.configVersion(branchId),
    retry: false,
  })

  const phatHanh = useMutation({
    mutationFn: () => api.publishConfig(branchId),
    onSuccess: () => {
      toast('Đã phát hành — POS và màn bếp sẽ nhận bản mới', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['config-version', branchId] })
    },
    onError: (err: Error) =>
      toast(err instanceof ApiError ? err.message : 'Không phát hành được', 'danger'),
  })

  const mocGio = hienHanh.data?.publishedAt
  const chuaPhatHanh = hienHanh.isSuccess && !hienHanh.data.version

  return (
    <div className="flex-none border-t border-line-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Cấu hình chi nhánh
      </p>

      <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
        {hienHanh.isPending ? (
          'Đang xem…'
        ) : chuaPhatHanh ? (
          /* Chưa phát hành lần nào = POS và máy khách chưa có thực đơn để hiện */
          <span className="text-danger">Chưa phát hành lần nào</span>
        ) : mocGio ? (
          `Phát hành lúc ${new Date(mocGio).toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
          })}`
        ) : (
          'Không đọc được bản hiện hành'
        )}
      </p>

      <Button
        block
        className="mt-3"
        variant={chuaPhatHanh ? 'primary' : 'secondary'}
        disabled={phatHanh.isPending}
        onClick={() => phatHanh.mutate()}
      >
        {phatHanh.isPending ? 'Đang phát hành…' : 'Phát hành cấu hình'}
      </Button>

      <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Sửa món, giá hay tham số xong phải bấm đây thì POS và máy khách mới nhận.
      </p>
    </div>
  )
}
