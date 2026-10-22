import { ApiError, clearDevice, setDeviceToken } from '@sora/core'
import { PinPad } from '@sora/ui'
import { useState } from 'react'
import { api } from '../api'

const REVOKED =
  'iPad này không còn ghép với bàn nào — đã bị ngắt ở Office. Nhờ quản lý sinh mã mới để ghép lại.'
const NOT_TABLE =
  'Mã vừa nhập là của loại máy khác, không phải iPad tại bàn. Nhờ quản lý ngắt máy vừa ghép ở Office → Thiết bị, rồi sinh mã loại “iPad tại bàn”.'

/**
 * Ghép iPad với một bàn — làm một lần lúc lắp máy (§9.1, THIET-BI.md).
 *
 * Mã 6 số quản lý sinh ở Office A4 đã mang sẵn bàn: người cầm iPad không chọn bàn
 * ở đây, nên không có cách nào ghép nhầm iPad bàn 12 vào bàn 11 bằng tay.
 */
export function IpadPair({ revoked, onPaired }: { revoked: boolean; onPaired: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (code: string) => {
    setBusy(true)
    setError(null)
    /**
     * Hai chặng, như màn bếp K1: ghép hỏng là lỗi của mã, còn ghép XONG mà chưa
     * hỏi được bàn thì mã đã bị dùng — báo "mã sai" lúc đó là đẩy người lắp máy đi
     * nhập lại một mã đã chết.
     */
    try {
      const paired = await api.pair(code, 'iPad tại bàn')
      setDeviceToken(paired.token)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mã không đúng hoặc đã hết hạn')
      setBusy(false)
      return
    }

    try {
      await api.terminal()
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        clearDevice()
        setError(NOT_TABLE)
        setBusy(false)
        return
      }
      // Mất mạng ngay sau khi ghép: token đã nằm trong máy, khung bàn tự hỏi lại
    }
    onPaired()
  }

  return (
    <main className="relative grid h-dvh place-items-center overflow-hidden bg-[radial-gradient(70%_90%_at_50%_42%,var(--sora-surface-4)_0%,var(--sora-surface-1)_55%,var(--sora-bg-base)_100%)] font-sans text-ink-body">
      <div className="flex w-[480px] flex-col items-center rounded-lg border border-accent/22 bg-surface-3 px-8 pt-8 pb-7">
        <span aria-hidden className="font-jp text-[length:var(--fs-d3)] leading-none text-gold-300">
          空
        </span>
        <h1 className="mt-3 text-[length:var(--fs-t1)] font-semibold text-ink-hi">
          Ghép iPad với bàn
        </h1>
        <p className="mt-1.5 text-center text-[length:var(--fs-b2)] leading-[1.55] text-ink-mute">
          Nhập mã 6 số quản lý sinh ở Office → Thiết bị, loại “iPad tại bàn”.
        </p>

        {revoked && !error ? (
          <p className="mt-4 rounded-md border border-warn/55 bg-warn/12 px-3 py-2.5 text-[length:var(--fs-c1)] leading-normal text-ink-hi">
            {REVOKED}
          </p>
        ) : null}

        <div className="mt-6">
          <PinPad
            length={6}
            reveal
            disabled={busy}
            error={error}
            onComplete={(code) => void submit(code)}
          />
        </div>

        {busy ? (
          <p className="mt-4 text-[length:var(--fs-b2)] text-ink-mute" role="status">
            Đang ghép…
          </p>
        ) : null}
      </div>
    </main>
  )
}
