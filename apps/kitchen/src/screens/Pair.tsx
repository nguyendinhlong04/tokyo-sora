import { ApiError, setDeviceInfo, setDeviceToken } from '@sora/core'
import { Card } from '@sora/ui'
import { useState } from 'react'
import { api } from '../api'

/**
 * K1 Ghép thiết bị.
 *
 * Màn bếp treo trên tường, không có bàn phím — nhập mã 6 số bằng lưới phím to.
 * Ghép xong thì màn này không hiện lại nữa, kể cả sau khi mất điện bật lại.
 */
export function Pair({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (value: string) => {
    setBusy(true)
    setError(null)
    /**
     * Tách làm hai chặng vì chúng hỏng theo hai kiểu khác hẳn nhau.
     *
     * Trước đây cả khối nằm trong một `catch` trả về đúng một câu "mã không
     * đúng hoặc đã hết hạn". Nếu ghép THÀNH CÔNG rồi lượt hỏi danh tính mới rớt
     * mạng, thì token đã nằm trong máy, mã ghép đã bị đánh dấu dùng rồi, mà màn
     * hình lại bảo mã sai — người ở quán nhập lại mã đó và lần này hỏng thật.
     * Bí một cách khó hiểu, ngay ở bước đầu tiên của một cái màn treo tường.
     */
    let token: string
    let deviceId: number
    try {
      const result = await api.pair(value, 'Màn bếp')
      token = result.token
      deviceId = result.deviceId
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mã không đúng hoặc đã hết hạn')
      setCode('')
      setBusy(false)
      return
    }

    // Ghép xong rồi — từ đây mọi lỗi đều KHÔNG phải lỗi mã ghép
    setDeviceToken(token)
    try {
      const me = await api.me()
      setDeviceInfo({
        deviceId,
        branchId: me.branchId,
        kind: 'kds',
        stationId: me.stationId,
        name: 'Màn bếp',
      })
      onPaired()
    } catch {
      setError('Đã ghép được máy nhưng chưa đọc được trạm — kiểm tra mạng rồi tải lại trang, KHÔNG cần xin mã mới.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const press = (digit: string) => {
    const next = code + digit
    setCode(next)
    if (next.length === 6) void submit(next)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-10">
      <Card className="flex flex-col items-center gap-8 p-10">
        <div className="flex flex-col items-center gap-1">
          <span className="font-jp text-[length:var(--fs-d3)] text-accent-ink">焼</span>
          <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Ghép màn bếp</h1>
          <p className="text-[length:var(--fs-b2)] text-ink-mute">Nhập mã 6 số do quản lý cấp</p>
        </div>

        <div className="flex gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className="flex h-16 w-12 items-center justify-center rounded-md border border-line-3 bg-surface-3 font-mono text-[length:var(--fs-d3)] text-ink-hi"
            >
              {code[i] ?? ''}
            </span>
          ))}
        </div>

        {error ? <p className="text-danger">{error}</p> : null}

        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <PadKey key={d} disabled={busy} onClick={() => press(d)}>
              {d}
            </PadKey>
          ))}
          <PadKey muted onClick={() => setCode('')}>
            Xoá
          </PadKey>
          <PadKey disabled={busy} onClick={() => press('0')}>
            0
          </PadKey>
          <PadKey muted onClick={() => setCode((c) => c.slice(0, -1))}>
            ←
          </PadKey>
        </div>
      </Card>
    </main>
  )
}

function PadKey({
  children,
  onClick,
  disabled = false,
  muted = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'h-24 w-24 rounded-md border border-line-2',
        muted
          ? 'text-[length:var(--fs-b1)] text-ink-mute'
          : 'bg-surface-3 font-mono text-[length:var(--fs-d3)] text-ink-hi active:bg-surface-4',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
