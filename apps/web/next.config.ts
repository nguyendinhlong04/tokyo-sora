import type { NextConfig } from 'next'

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
