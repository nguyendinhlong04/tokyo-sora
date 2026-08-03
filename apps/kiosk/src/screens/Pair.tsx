import { setDeviceInfo, setDeviceToken } from '@sora/core'
import { Card } from '@sora/ui'
import { useState } from 'react'
import { api } from '../api'

/**
 * Ghép kiosk với chi nhánh — làm một lần lúc lắp máy.
 *
 * Đây chính là bước cấp quyền: không có mã ghép thì cái tablet này không đọc được
 * tên của một ai. Và vì chi nhánh nằm trong thiết bị chứ không nằm trong màn hình
 * chọn, chấm công từ máy khác là chuyện không xảy ra được.
 */
export function Pair({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.pair(value, 'Kiosk chấm công')
      setDeviceToken(result.token)
      const me = await api.me()
      setDeviceInfo({
        deviceId: result.deviceId,
        branchId: me.branchId,
        kind: 'kiosk',
        stationId: null,
        name: 'Kiosk chấm công',
      })
      onPaired()
    } catch {
      setError('Mã không đúng hoặc đã hết hạn')
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
          <span className="font-jp text-[length:var(--fs-d3)] text-accent-ink">空</span>
          <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Ghép máy chấm công</h1>
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
