import { Button } from '@sora/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api'

/**
 * Cửa vào từ mã QR dán bàn: `/t/<chi-nhánh>/<mã-bàn>`.
 *
 * Mã QR dán cố định và KHÔNG phải bí mật — ai chụp cũng được, nó chỉ nói "đây là
 * bàn nào". Việc quyết định máy này có gọi món được hay không nằm ở máy chủ, qua
 * ba lớp của LUONG-QR-BAN.md.
 */
export function Enter() {
  const { branchId, tableCode } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!branchId || !tableCode) return
    let cancelled = false

    api
      .join(branchId, tableCode)
      .then(async (result) => {
        if (cancelled) return
        await queryClient.invalidateQueries()
        // `replace` để nút Quay lại không ném khách về màn trắng này
        void navigate(result.state === 'admitted' ? '/' : '/cho-duyet', { replace: true })
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [branchId, tableCode, navigate, queryClient])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-8 text-center font-sans">
      {error ? (
        <>
          <span className="font-jp text-[56px] leading-none text-gold-900">空</span>
          <p className="text-[length:var(--fs-t2)] font-medium text-ink-hi">{error}</p>
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
