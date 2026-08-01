import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg' | 'xl'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  children: ReactNode
}

/**
 * Nút chính = nền vàng, chữ sumi — CẤM chữ trắng trên vàng (quy tắc §8.4).
 * Chiều cao mặc định bám biến `--hit-target`: 44px khách · 52px POS · 64px KDS.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-strong text-on-accent font-semibold hover:brightness-110',
  secondary: 'border border-line-3 text-ink-body hover:bg-surface-3',
  ghost: 'text-ink-body hover:bg-surface-3',
  danger: 'bg-danger text-ink-hi font-semibold hover:brightness-110',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'h-[var(--hit-target)] px-4 text-[length:var(--fs-b2)]',
  lg: 'h-[calc(var(--hit-target)*1.25)] px-6 text-[length:var(--fs-b1)]',
  xl: 'h-[calc(var(--hit-target)*1.5)] px-8 text-[length:var(--fs-t2)]',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center gap-2 rounded-sm transition-[filter,background-color]',
        'disabled:cursor-not-allowed disabled:border-line-4 disabled:bg-transparent disabled:text-ink-mute disabled:brightness-100',
        VARIANTS[variant],
        SIZES[size],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      style={{ transitionDuration: 'var(--dur-micro)' }}
      {...rest}
    >
      {children}
    </button>
  )
}
