import Image, { getImageProps } from 'next/image'
import type { CSSProperties } from 'react'
import { isOptimizable } from '../lib/image-hosts'

/**
 * Mọi ảnh từ Office đi qua đây — không viết `<img>` trần cho ảnh món, ảnh hero.
 *
 * Ảnh ở kho đã khai (`lib/image-hosts.ts`) thì đi qua `next/image`: trình duyệt
 * nhận `srcset` WebP và tự chọn bề rộng theo `sizes`, nên ô 88px trên điện thoại
 * tải ảnh 160px chứ không phải tấm PNG gốc 8 MB. Đường dẫn ngoài kho thì vẫn hiện
 * bằng `<img>` thường — Office nhận URL tự do, một ảnh dán từ chỗ lạ không được
 * phép làm vỡ ô.
 *
 * `sizes` là BẮT BUỘC: nó là thứ quyết định tải tấm cỡ nào. Ghi đúng bề rộng ô
 * hiển thị ở từng khổ màn, theo cú pháp của thuộc tính `sizes`.
 *
 * `priority` chỉ cho ảnh LCP (khung hero đầu tiên): preload + `fetchpriority=high`.
 * Ảnh không `priority` là `loading="lazy"` — quan trọng hơn vẻ ngoài: React tự
 * chèn `<link rel=preload>` cho mọi `<img>` không lazy lúc render trên máy chủ, và
 * đó chính là cách năm ảnh hero 8 MB từng chen nhau tải trước cả CSS.
 *
 * `width`/`height` chỉ là tỉ lệ giữ chỗ trước khi ảnh về; khung thật do CSS của
 * ô quyết định (`size-full object-cover`), như với `<img>` trước đây.
 */
export function SiteImage({
  src,
  alt,
  sizes,
  priority = false,
  className,
  style,
}: {
  src: string
  alt: string
  sizes: string
  priority?: boolean
  className?: string
  style?: CSSProperties
}) {
  if (!isOptimizable(src)) {
    return (
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={className}
        style={style}
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={1600}
      height={1200}
      sizes={sizes}
      priority={priority}
      // Next 15 không tự suy `fetchPriority` từ `priority` — thiếu dòng này thì
      // ảnh LCP được preload nhưng vẫn xếp hàng cùng mức với ảnh khác
      fetchPriority={priority ? 'high' : undefined}
      className={className}
      style={style}
    />
  )
}

/**
 * Đường dẫn ảnh đã tối ưu cho những chỗ chỉ nhận một URL — `poster` của video.
 *
 * 960 → bộ tối ưu trả tấm 1920 (gấp đôi, cho màn mật độ cao). Ảnh chờ của video
 * hero chỉ hiện trong lúc phim tải, không cần nét hơn thế.
 */
export function optimizedUrl(src: string): string {
  if (!isOptimizable(src)) return src
  return getImageProps({ src, alt: '', width: 960, height: 540 }).props.src
}
