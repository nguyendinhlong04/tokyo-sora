import type { HTMLAttributes, ReactNode } from 'react'

export function Card({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={['rounded-md border border-line-1 bg-surface-1', className].join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
      {children}
    </div>
  )
}

/** Rỗng thì nói rõ CẦN LÀM GÌ và cho một nút — không bỏ người dùng ở màn trắng (§13) */
export function EmptyState({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
      <p className="max-w-sm text-[length:var(--fs-b1)] text-ink-mute">{title}</p>
      {action}
    </div>
  )
}

/** Skeleton đúng hình nội dung, không phải spinner toàn màn (§13) */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={['animate-[sora-pulse_1.4s_ease-in-out_infinite] rounded-sm bg-surface-3', className].join(' ')}
    />
  )
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-danger-line bg-surface-1 p-8 text-center">
      <p className="text-[length:var(--fs-b1)] text-ink-body">{message}</p>
      {action}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'
}) {
  const tones = {
    neutral: 'border-line-3 text-ink-mute',
    ok: 'border-ok text-ok',
    warn: 'border-warn text-warn',
    danger: 'border-danger text-danger',
    info: 'border-info text-info',
    accent: 'border-accent text-accent-ink',
  }
  return (
    <span
      className={[
        'inline-flex h-[22px] items-center rounded-pill border px-2 text-[length:var(--fs-c2)] font-semibold',
        tones[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}

/** Tiền luôn dùng mono để cột số thẳng hàng khi đọc nhanh */
export function Money({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span className={['font-mono tabular-nums', className].join(' ')}>
      {new Intl.NumberFormat('vi-VN').format(amount)}₫
    </span>
  )
}
