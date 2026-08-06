import { ApiError } from '@sora/core'
import { Card, PinPad, SectionLabel } from '@sora/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useSession } from '../session-context'

/**
 * K1 · A4 — ghép máy này với một chi nhánh.
 *
 * Đây là cửa đầu tiên của một máy POS mới: chưa ghép thì nó chưa thuộc chi nhánh
 * nào, chưa có quyền gì, và màn đăng nhập ca không có gì để hiện. Quản lý sinh
 * mã 6 số ở màn A4 bên Office rồi ĐỌC cho người đứng ở máy — chính việc phải
 * đứng trong quán để nghe được mã là thứ chứng minh danh tính, vì lúc này máy
 * chưa có credential nào cả.
 *
 * Mã sống 10 phút và dùng đúng một lần. Token nhận về cũng chỉ hiện một lần rồi
 * nằm lại trong máy — máy chủ chỉ giữ bản băm, nên mất máy thì thu hồi ở A4 chứ
 * không có đường đọc lại.
 */
export function PairDevice() {
  const { pairDevice } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.pair(code, name.trim() || 'Máy POS')
      await pairDevice(result.token, result.deviceId)
      void navigate('/shift', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không ghép được máy')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-8">
      <Card className="w-full max-w-2xl p-8">
        <div className="mb-8 flex flex-col items-center gap-1">
          <span className="font-jp text-accent-ink">東京空</span>
          <h1 className="font-display text-[length:var(--fs-d3)] font-semibold text-ink-hi">
            Ghép máy với chi nhánh
          </h1>
          <p className="mt-2 max-w-md text-center text-[length:var(--fs-b2)] text-ink-body">
            Nhờ quản lý mở <b>Office → Thiết bị</b>, bấm tạo mã ghép rồi đọc 6 số cho bạn. Mã sống
            10 phút và chỉ dùng được một lần.
          </p>
        </div>

        <div className="mx-auto flex max-w-sm flex-col gap-5">
          <label className="flex flex-col gap-2">
            <SectionLabel>Đặt tên cho máy này</SectionLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Máy POS quầy"
              className="h-12 rounded-sm border border-line-2 bg-surface-3 px-3 text-[length:var(--fs-b1)] text-ink-hi"
            />
            <span className="text-[length:var(--fs-c1)] text-ink-mute">
              Tên này hiện ở màn A4 để quản lý biết máy nào mà thu hồi khi cần.
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <SectionLabel>Mã ghép 6 số</SectionLabel>
            {/* PinPad tự hiện lỗi ngay dưới bàn phím, không cần khối riêng */}
            <PinPad length={6} disabled={busy} onComplete={submit} error={error} />
          </div>
        </div>
      </Card>
    </main>
  )
}
