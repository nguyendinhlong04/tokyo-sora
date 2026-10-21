import type { ReactNode } from 'react'
import { SiteImage } from './SiteImage'

/**
 * Bề rộng hiển thị mặc định theo cỡ ô — dùng khi chỗ gọi không khai `sizes`.
 *
 * `sm` là ô vuông nhỏ trong danh sách; `md` là ô lưới (4 cột ở laptop, 2 cột ở
 * điện thoại); `lg`/`xl` là ảnh lớn chiếm nửa trang ở laptop, trọn bề ngang ở
 * điện thoại. Chỗ nào lệch hẳn mấy mức này thì khai `sizes` riêng ở chỗ gọi.
 */
const GLYPH_SIZES = {
  sm: '160px',
  md: '(min-width: 1024px) 320px, 50vw',
  lg: '(min-width: 1024px) 50vw, 100vw',
  xl: '(min-width: 1024px) 50vw, 100vw',
} as const

/**
 * Ô ảnh món.
 *
 * Có ảnh thì hiện ảnh; CHƯA có thì dựng bằng đúng ngôn ngữ đồ hoạ của thiết kế —
 * nền than gradient, chữ kanji vàng đồng — thay vì ô xám hay ảnh mượn. Đường dẫn
 * ảnh nhập ở Office M1, nên một món được bổ sung ảnh là mọi trang đang vẽ ô chữ
 * đổi sang ảnh thật, không phải sửa chỗ nào trong mã.
 *
 * Khung giữ nguyên trong cả hai trường hợp: `object-cover` để ảnh tỉ lệ nào cũng
 * lấp đầy ô mà không kéo méo, và bố cục quanh nó không nhảy.
 */
export function DishGlyph({
  glyph,
  src,
  alt,
  size = 'md',
  sizes,
  className = '',
}: {
  glyph: string
  src?: string | null
  /** Chỉ cần khi có ảnh thật — ô chữ là trang trí nên vẫn `aria-hidden` */
  alt?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Bề rộng ô hiển thị, cú pháp thuộc tính `sizes` — bỏ trống thì suy từ `size` */
  sizes?: string
  className?: string
}) {
  const text = {
    sm: 'text-[42px]',
    md: 'text-[88px]',
    lg: 'text-[120px]',
    xl: 'text-[200px]',
  }[size]

  if (src) {
    return (
      <div className={`overflow-hidden bg-surface-4 ${className}`}>
        <SiteImage
          src={src}
          alt={alt ?? ''}
          sizes={sizes ?? GLYPH_SIZES[size]}
          className="size-full object-cover"
        />
      </div>
    )
  }

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
  src,
  alt,
  sizes = '(min-width: 1024px) 50vw, 100vw',
  className = '',
  rounded = true,
  bordered = true,
}: {
  glyph?: string
  src?: string | null
  alt?: string
  /** Bề rộng ô hiển thị, cú pháp thuộc tính `sizes` — mặc định là ảnh nửa trang */
  sizes?: string
  className?: string
  rounded?: boolean
  /**
   * Tắt khi khung nằm `absolute` lấp đúng một ô đã có viền: bốn cạnh của nó rơi
   * chồng lên bốn đường sẵn có, thành đường 2px đậm hơn phần còn lại của khung.
   */
  bordered?: boolean
}) {
  // 12 chứ không 8: cùng một mức với ô món và mọi khung block khác trên trang —
  // ảnh và ô nội dung đứng cạnh nhau ở W2, W5, W6 nên lệch mức là thấy ngay.
  const frame = `overflow-hidden ${bordered ? 'border border-accent/16' : ''} ${rounded ? 'rounded-lg' : ''} ${className}`

  if (src) {
    return (
      <div className={frame}>
        <SiteImage src={src} alt={alt ?? ''} sizes={sizes} className="size-full object-cover" />
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className={`grid place-items-center bg-[radial-gradient(110%_100%_at_50%_18%,var(--sora-line-1)_0%,var(--sora-bg-base)_78%)] ${frame}`}
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
