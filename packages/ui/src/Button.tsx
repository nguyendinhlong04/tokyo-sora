import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  children: ReactNode
}

/**
 * Nút chính = nền vàng, chữ sumi — CẤM chữ trắng trên vàng (quy tắc §8.4).
 * Chiều cao mặc định bám biến `--hit-target`: 44px khách · 52px POS · 64px KDS.
 *
 * Biến thể là Ý ĐỊNH, không phải màu: cùng một việc thì cùng một biến thể ở mọi
 * màn. Nền đặc dành cho việc ghi vào sổ (primary/success/danger), viền dành cho
 * việc lùi lại được (secondary/ghost). Trang nào tự pha màu riêng cho nút "Xoá"
 * là trang đó dạy người dùng đọc lại giao diện từ đầu.
 *
 * Chữ trên nền trạng thái dùng `ink-cream` chứ không `ink-hi`: `--t-ink-hi` đổi
 * theo chủ đề, và ở chủ đề sáng của Office nó là màu gần đen — đen trên đỏ chỉ
 * đạt 2.6:1.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-strong text-on-accent font-semibold hover:brightness-110',
  secondary: 'border border-line-3 text-ink-body hover:bg-surface-3',
  ghost: 'text-ink-body hover:bg-surface-3',
  danger: 'bg-danger text-ink-cream font-semibold hover:brightness-110',
  success: 'bg-ok-strong text-ink-cream font-semibold hover:brightness-110',
}

/**
 * `sm` cố định 36px chứ không bám `--hit-target`: đây là cỡ cho nút NẰM TRONG
 * dòng bảng và thanh lọc của Office, phải khớp đúng chiều cao ô nhập (h-9) để
 * hai thứ đứng cạnh nhau thẳng hàng. Vùng chạm 44px là quy tắc cho màn cảm ứng
 * — Office dùng chuột.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[length:var(--fs-c1)]',
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
        'inline-flex items-center justify-center gap-2 rounded-sm whitespace-nowrap transition-[filter,background-color]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:border disabled:border-line-4 disabled:bg-transparent disabled:text-ink-mute disabled:brightness-100',
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
