import { useState } from 'react'

interface PinPadProps {
  length?: number
  onComplete: (pin: string) => void
  disabled?: boolean
  error?: string | null
}

/**
 * Bàn phím PIN cho P1 và hộp duyệt của quản lý.
 *
 * Phím to hơn hẳn nút thường: nhân viên bấm vội, tay có thể ướt hoặc dính dầu.
 * Không hiện số đã nhập — chỉ hiện chấm, vì màn POS quay ra phía khách.
 */
export function PinPad({ length = 4, onComplete, disabled = false, error }: PinPadProps) {
  const [pin, setPin] = useState('')

  const press = (digit: string) => {
    if (disabled) return
    const next = pin + digit
    setPin(next)
    if (next.length >= length) {
      onComplete(next)
      setPin('')
    }
  }

  const clear = () => setPin('')
  const back = () => setPin((p) => p.slice(0, -1))

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-3" aria-label={`Đã nhập ${pin.length} trên ${length} số`}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={[
              'h-4 w-4 rounded-pill border transition-colors',
              i < pin.length ? 'border-accent bg-accent' : 'border-line-3',
            ].join(' ')}
            style={{ transitionDuration: 'var(--dur-micro)' }}
          />
        ))}
      </div>

      {error ? (
        <p className="text-[length:var(--fs-b2)] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <PinKey key={digit} onClick={() => press(digit)} disabled={disabled}>
            {digit}
          </PinKey>
        ))}
        <PinKey onClick={clear} disabled={disabled} muted>
          Xoá
        </PinKey>
        <PinKey onClick={() => press('0')} disabled={disabled}>
          0
        </PinKey>
        <PinKey onClick={back} disabled={disabled} muted>
          ←
        </PinKey>
      </div>
    </div>
  )
}

function PinKey({
  children,
  onClick,
  disabled,
  muted = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'h-20 w-20 rounded-md border border-line-2 bg-surface-3 font-mono',
        'active:bg-surface-4 disabled:opacity-40',
        muted ? 'text-[length:var(--fs-b1)] text-ink-mute' : 'text-[length:var(--fs-d3)] text-ink-hi',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
