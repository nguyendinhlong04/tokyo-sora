import { Button } from '@sora/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api'

/**
 * Cửa vào từ mã QR dán bàn: `/t/<token>`.
 *
 * Đổi token lấy cookie httpOnly rồi RỜI KHỎI địa chỉ này bằng `replace` — token
 * không được ở lại thanh địa chỉ hay trong lịch sử trình duyệt. URL bị chụp màn
 * hình, dán vào nhóm chat, hiện lại ở gợi ý gõ địa chỉ; cookie httpOnly thì không.
 */
export function Enter() {
  const { token } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    api
      .exchange(token)
      .then(async () => {
        if (cancelled) return
        await queryClient.invalidateQueries()
        void navigate('/', { replace: true })
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [token, navigate, queryClient])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-8 text-center font-sans">
      {error ? (
        <>
          <span className="font-jp text-[56px] leading-none text-gold-900">空</span>
          <p className="text-[length:var(--fs-t2)] font-medium text-ink-hi">{error}</p>
          <p className="text-[length:var(--fs-b1)] text-ink-body">
            Mã trên bàn có thể đã cũ sau khi bàn được dọn. Nhờ nhân viên in lại giúp bạn.
          </p>
          <Button size="lg" onClick={() => void navigate('/', { replace: true })}>
            Đóng
          </Button>
        </>
      ) : (
        <p className="text-ink-mute">Đang mở bàn…</p>
      )}
    </main>
  )
}
