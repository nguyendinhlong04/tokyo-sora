import type { ReactNode } from 'react'

/**
 * Khối hình của website khi CHƯA có ảnh thật.
 *
 * Bản thiết kế đặt `<image-slot>` ở mọi vị trí ảnh và bàn giao kèm ghi chú "thay
 * bằng ảnh CDN khi dựng". Trong lúc chờ bộ ảnh, chỗ ảnh được dựng bằng đúng ngôn
 * ngữ đồ hoạ của thiết kế — nền than gradient, chữ kanji vàng đồng — thay vì ô
 * xám hay ảnh mượn. Bố cục giữ nguyên khung, nên thay ảnh thật sau này chỉ là đổi
 * ruột component.
 */
export function DishGlyph({
  glyph,
  size = 'md',
  className = '',
}: {
  glyph: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const text = {
    sm: 'text-[42px]',
    md: 'text-[88px]',
    lg: 'text-[120px]',
    xl: 'text-[200px]',
  }[size]

  return (
    <div
      aria-hidden
      className={`grid place-items-center bg-[radial-gradient(120%_100%_at_50%_20%,var(--sora-line-1)_0%,var(--sora-surface-4)_74%)] ${className}`}
    >
      <span
        className={`font-jp leading-none text-gold-900 drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)] ${text}`}
      >
        {glyph}
      </span>
    </div>
  )
}

/** Ô ảnh không phải món: không gian, chân dung, bản đồ, ảnh bài viết */
export function PhotoFrame({
  glyph,
  className = '',
  rounded = true,
}: {
  glyph?: string
  className?: string
  rounded?: boolean
}) {
  return (
    <div
      aria-hidden
      className={`grid place-items-center overflow-hidden border border-accent/16 bg-[radial-gradient(110%_100%_at_50%_18%,var(--sora-line-1)_0%,var(--sora-bg-base)_78%)] ${
        rounded ? 'rounded-md' : ''
      } ${className}`}
    >
      {glyph ? (
        <span className="font-jp text-[56px] leading-none text-gold-900 opacity-70">{glyph}</span>
      ) : null}
    </div>
  )
}

/** Ô kim cương vàng mang số chương — dấu nhận biết của thực đơn in */
export function Diamond({ children, size = 64 }: { children: ReactNode; size?: number }) {
  return (
    <div
      className="grid flex-none rotate-45 place-items-center bg-[linear-gradient(150deg,var(--sora-gold-500)_0%,var(--sora-gold-700)_100%)]"
      style={{ width: size, height: size }}
    >
      <span
        className="-rotate-45 font-display font-semibold text-surface-1"
        style={{ fontSize: size * 0.47 }}
      >
        {children}
      </span>
    </div>
  )
}

/** Nhãn nhỏ viết hoa, giãn chữ — dùng ở mọi đầu khối */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
      {children}
    </span>
  )
}

/** Huy hiệu 名物 của món ký */
export function SignatureBadge({ compact = false }: { compact?: boolean }) {
  return compact ? (
    <span className="grid size-7 place-items-center border border-danger-line bg-canvas/70 text-center font-jp text-[9px] leading-tight text-danger">
      名物
    </span>
  ) : (
    <span className="inline-flex h-7 items-center rounded-pill border border-accent px-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-accent-ink uppercase">
      Món ký
    </span>
  )
}

/** Đường kẻ mảnh chuyển sắc — ngăn khối trong trang */
export function GoldRule({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-px bg-[linear-gradient(90deg,rgba(201,168,92,0.5)_0%,rgba(201,168,92,0.08)_100%)] ${className}`}
    />
  )
}
