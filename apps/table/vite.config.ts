import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Bản mới chỉ áp ở màn chờ quảng cáo, không bao giờ giữa bữa — xem `src/pwa.ts`
      registerType: 'prompt',
      injectRegister: null,
      // Cài ra màn hình chính (manifest standalone) là việc riêng của §9.1, chưa làm
      manifest: false,
      workbox: {
        // Vỏ app: iPad bật lại lúc mất mạng vẫn lên giao diện và tự hỏi lại máy chủ
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html',
        // KHÔNG cache /api — như POS: thực đơn cũ cho gọi món vừa hết, bàn cũ cho mở
        // bàn đang có khách. Đọc offline là việc của bộ nhớ truy vấn, ghi là của outbox.
        navigateFallbackDenylist: [/^\/api\//],
        // Lần cài đầu nhận trang ngay, khỏi đợi lần tải lại sau mới tải sẵn được ảnh
        clientsClaim: true,
        runtimeCaching: [
          {
            /**
             * Ảnh qua bộ tối ưu của web (§8.1, §8 quy tắc 5): địa chỉ đã gồm ảnh gốc
             * và bề rộng nên nội dung không đổi — lấy bộ đệm trước, lần cuộn thứ hai
             * không chạm mạng. Phản hồi khác gốc là "opaque", không đọc được mã lỗi:
             * tấm nào giải mã hỏng thì trang xoá khỏi bộ đệm (`OptimizedImage`).
             */
            urlPattern: ({ url }) =>
              url.origin === 'https://tokyo-sora.vn' && url.pathname === '/_next/image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'sora-anh',
              expiration: {
                maxEntries: 400,
                // Bằng thời gian bộ tối ưu của web giữ ảnh đã đổi cỡ
                maxAgeSeconds: 31 * 24 * 3600,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    // API cùng gốc với app: trên Vercel do rewrite trong vercel.json lo; máy dev thì
    // proxy. `vite preview` dùng lại đúng proxy này.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
