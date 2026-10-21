import type { NextConfig } from 'next'
import { IMAGE_HOSTS } from './lib/image-hosts'

/**
 * API đi qua chính tên miền web.
 *
 * Trình duyệt luôn gọi `/api/...` cùng origin nên cookie và CSP không phải nới
 * ra cho tên miền thứ hai — cùng cách làm với bốn SPA kia (DEPLOY §Bước 2).
 * Máy chủ Next gọi thẳng API qua `SORA_API_URL` vì nó không đi qua trình duyệt.
 */
const apiOrigin = process.env.SORA_API_URL ?? 'http://localhost:3000'

const nextConfig: NextConfig = {
  transpilePackages: ['@sora/tokens', '@sora/contracts', '@sora/ui'],
  /**
   * Bộ tối ưu ảnh cho ảnh nhập ở Office — xem `lib/image-hosts.ts` vì sao cần.
   *
   * Danh sách bề rộng NGẮN có chủ ý: trên Vercel mỗi tổ hợp (ảnh, bề rộng) chưa có
   * trong bộ đệm là một lượt đổi cỡ tính vào hạn mức tháng (gói Hobby: 5.000, quá
   * là ảnh MỚI trả lỗi 402). Mười bề rộng × chừng trăm ảnh vẫn dư xa.
   *
   * Giữ bộ đệm 31 ngày thay vì theo `max-age=3600` của kho: hết hạn là một lượt
   * đổi cỡ mới cho cùng một tấm ảnh. Hệ quả cần biết: GHI ĐÈ ảnh cùng tên ở kho thì
   * web có thể hiện ảnh cũ tới 31 ngày — thay ảnh thì tải lên tên MỚI rồi sửa
   * đường dẫn ở Office.
   */
  images: {
    remotePatterns: IMAGE_HOSTS.map((host) => ({
      protocol: 'https' as const,
      hostname: host.hostname,
      pathname: host.pathname,
    })),
    deviceSizes: [640, 828, 1080, 1280, 1920, 2560],
    imageSizes: [96, 160, 256, 384],
    minimumCacheTTL: 2_678_400,
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }]
  },
  /**
   * `@sora/contracts` là ESM thuần nên nội bộ nó import kèm đuôi `.js` —
   * bắt buộc để bản build của API chạy được trên Node. Ở chế độ dev, Next lấy
   * mã NGUỒN của package (điều kiện export `development`), lúc đó `./money.js`
   * trỏ vào file `.ts` chưa biên dịch. Dòng dưới dạy webpack thử đuôi `.ts`
   * trước khi bỏ cuộc; Vite của bốn app kia tự làm việc này.
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default nextConfig
