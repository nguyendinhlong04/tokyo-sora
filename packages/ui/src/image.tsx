import { useState, type CSSProperties } from 'react'

/**
 * Ảnh nhập ở Office, cho các app Vite — đi qua bộ tối ưu ảnh của Sora Web (§8.1).
 *
 * Ảnh gốc ở kho là PNG 2–9 MB, rộng tới 2800 điểm ảnh; iPad thế hệ 7 (A10, 3 GB)
 * giải mã vài tấm như thế là treo. `next/image` của web trên Vercel đã đổi cỡ ảnh
 * sang WebP cho trang chủ, nên dùng chung nó thay vì dựng bộ tối ưu thứ hai — đo
 * 22/10/2026: ảnh hero 1920 điểm ảnh còn 152 KB, có bộ đệm 31 ngày.
 *
 * Kho nào được đổi cỡ là việc của web (`apps/web/lib/image-hosts.ts`). Ảnh ngoài
 * danh sách thì bộ tối ưu trả lỗi và thẻ ảnh tự rơi về đường dẫn gốc — ở đây không
 * giữ bản sao danh sách kho để hai bên khỏi lệch nhau.
 */
const OPTIMIZER = 'https://tokyo-sora.vn/_next/image'

/**
 * Bề rộng bộ tối ưu nhận: đúng `deviceSizes` + `imageSizes` ở `apps/web/next.config.ts`.
 * Bề rộng khác bị trả 400 — đổi bên đó thì đổi cả đây.
 */
export type OptimizerWidth = 96 | 160 | 256 | 384 | 640 | 828 | 1080 | 1280 | 1920 | 2560

export function optimizedSrc(src: string, width: OptimizerWidth): string {
  return `${OPTIMIZER}?url=${encodeURIComponent(src)}&w=${width}&q=75`
}

/**
 * `<img>` qua bộ tối ưu. Bộ tối ưu từ chối (kho lạ, hết hạn mức đổi cỡ của tháng,
 * quá giờ) thì hiện ảnh gốc: Office nhận URL tự do, một ảnh lạ không được làm vỡ ô.
 *
 * `sizes` bắt buộc như `SiteImage` của web — nó quyết định trình duyệt tải tấm nào
 * trong `widths`. `eager` chỉ cho ảnh đang hoặc sắp hiện ngay; còn lại tải lười.
 * `width`/`height` là tỉ lệ giữ chỗ khi ô ảnh không tự có kích thước (§8).
 */
export function OptimizedImage({
  src,
  widths,
  sizes,
  alt,
  eager = false,
  width,
  height,
  className,
  style,
}: {
  src: string
  widths: OptimizerWidth[]
  sizes: string
  alt: string
  eager?: boolean
  width?: number
  height?: number
  className?: string
  style?: CSSProperties
}) {
  // Nhớ ĐƯỜNG DẪN đã hỏng chứ không một cờ: đổi sang ảnh khác thì thử tối ưu lại
  const [failed, setFailed] = useState<string | null>(null)
  const direct = failed === src || widths.length === 0

  return (
    <img
      src={direct ? src : optimizedSrc(src, widths[widths.length - 1]!)}
      srcSet={direct ? undefined : widths.map((w) => `${optimizedSrc(src, w)} ${w}w`).join(', ')}
      sizes={direct ? undefined : sizes}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      onError={() => {
        if (!direct) setFailed(src)
      }}
      className={className}
      style={style}
    />
  )
}
