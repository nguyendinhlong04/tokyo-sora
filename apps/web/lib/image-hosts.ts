/**
 * Các kho ảnh mà bộ tối ưu ảnh của Next (`/_next/image`) được phép kéo về.
 *
 * Ảnh món và ảnh hero là đường dẫn người nhập ở Office (M1, A8), hiện nằm ở hai
 * kho: Google Cloud Storage và Supabase Storage. Ảnh gốc là PNG 2–9 MB, rộng tới
 * 2800 điểm ảnh — đo ngày 21/10/2026, trang chủ phát thẳng chúng là kéo 98 MB.
 * Qua bộ tối ưu, mỗi ô chỉ nhận đúng bề rộng nó hiển thị, dạng WebP, vài chục tới
 * vài trăm KB.
 *
 * Danh sách hẹp có chủ ý: mở cả `*.supabase.co` là cho người ngoài mượn hạn mức
 * đổi cỡ ảnh của quán để đổi cỡ ảnh của họ. Thêm kho mới thì thêm một dòng ở đây
 * — `next.config.ts` và `SiteImage` cùng đọc mảng này nên hai bên không lệch nhau.
 * Đường dẫn ngoài danh sách vẫn hiện, chỉ là hiện ảnh gốc như trước.
 */
export const IMAGE_HOSTS = [
  { hostname: 'storage.googleapis.com', pathname: '/tokyo-sora/**' },
  { hostname: 'mstnjrtiievvzxavbokt.supabase.co', pathname: '/storage/v1/object/**' },
] as const

/** Ảnh này có đi qua bộ tối ưu được không — cùng luật với `images.remotePatterns` */
export function isOptimizable(src: string): boolean {
  let url: URL
  try {
    url = new URL(src)
  } catch {
    // Đường dẫn tương đối hoặc gõ sai: không đoán, để trình duyệt tải thẳng
    return false
  }
  return (
    url.protocol === 'https:' &&
    IMAGE_HOSTS.some(
      (host) =>
        url.hostname === host.hostname && url.pathname.startsWith(host.pathname.slice(0, -2)),
    )
  )
}
