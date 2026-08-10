import { Button } from '@sora/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, banDangCho } from '../api'

/** Chờ quá lâu thì thôi trông vào chủ bàn — họ đang gắp thịt hoặc úp máy xuống bàn */
const NHO_NHAN_VIEN_SAU_GIAY = 45

/**
 * Màn chờ duyệt — máy chưa chứng minh được đang ngồi trong quán.
 *
 * Hỏi lại máy chủ vài giây một lần thay vì mở kênh nghe thời gian thực: việc này
 * chỉ kéo dài vài chục giây, và với vài chục giây thì khách không cảm nhận được
 * khác biệt. Đổi lại, không phải dựng cả một tầng hạ tầng chưa app nào dùng.
 */
export function Waiting() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [giayDaCho, setGiayDaCho] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setGiayDaCho((s) => s + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  const state = useQuery({
    queryKey: ['device-state'],
    queryFn: () => api.deviceState(),
    /**
     * Một giây — đây là màn DUY NHẤT có người đang đứng nhìn nó chờ, nên nhịp
     * hỏi ở đây quyết định cảm giác "bấm xong thì máy kia vào ngay" hay "một lúc
     * sau mới thấy". Câu hỏi rất nhẹ (một dòng CSDL) và chỉ sống vài chục giây.
     */
    refetchInterval: 1_000,
    retry: false,
  })

  const admitted = state.data?.state === 'admitted'
  const rejected = state.data?.state === 'rejected'

  async function kiemTraLai() {
    const ban = banDangCho()
    if (ban) {
      // Lỗi ở đây không đáng làm hỏng nút: rơi xuống hỏi trạng thái như thường
      await api.join(ban.branchId, ban.tableCode).catch(() => null)
    }
    await state.refetch()
  }

  useEffect(() => {
    if (!admitted) return
    void queryClient.invalidateQueries().then(() => navigate('/', { replace: true }))
  }, [admitted, navigate, queryClient])

  if (rejected) {
    return (
      <Frame>
        <span className="font-jp text-[56px] leading-none text-gold-900">空</span>
        <p className="text-[length:var(--fs-t2)] font-medium text-ink-hi">
          Yêu cầu chưa được chấp nhận
        </p>
        <p className="text-[length:var(--fs-b1)] text-ink-body">
          Nếu bạn đang ngồi tại bàn, nhờ nhân viên mở giúp.
        </p>
      </Frame>
    )
  }

  return (
    <Frame>
      <span className="font-jp text-[48px] leading-none text-gold-900">待</span>
      <p className="text-[length:var(--fs-t2)] font-medium text-ink-hi">
        Đang chờ người mở bàn đồng ý…
      </p>
      <p className="text-[length:var(--fs-b1)] text-ink-body">
        Nhờ người đã mở bàn bấm <b>Đồng ý</b> trên điện thoại của họ.
      </p>

      {/* Lối thoát nhanh: bắt Wi-Fi quán là vào ngay, không phải chờ ai */}
      <div className="mt-2 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
        <p className="text-[length:var(--fs-b2)] text-ink-hi">
          Hoặc kết nối <b>Wi-Fi của quán</b> rồi quét lại mã — bạn sẽ vào được ngay, không cần chờ
          ai duyệt.
        </p>
      </div>

      {giayDaCho >= NHO_NHAN_VIEN_SAU_GIAY ? (
        <p className="text-[length:var(--fs-b2)] text-ink-mute">
          Chờ hơi lâu rồi — người mở bàn có thể đang bận. Nhờ nhân viên mở giúp bạn.
        </p>
      ) : null}

      {/* Hỏi lại CẢ đường mạng chứ không chỉ hỏi "đã ai duyệt chưa": người vừa
          bấm nút này thường vừa đổi xong sang Wi-Fi quán, và `join` là chỗ duy
          nhất xét lại chỗ ngồi. Không nhớ được bàn nào thì đành hỏi mỗi trạng
          thái, đúng như trước. */}
      <Button size="lg" onClick={() => void kiemTraLai()}>
        Kiểm tra lại
      </Button>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-8 text-center font-sans">
      {children}
    </main>
  )
}
