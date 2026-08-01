import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' chứ không phải 'autoUpdate': tải lại giữa lúc thu ngân đang nhập
      // đơn là mất phiếu order đang dựng. Người dùng tự chọn lúc áp dụng.
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'Sora POS',
        short_name: 'Sora POS',
        description: 'Máy bán hàng Tokyo Sora — phục vụ, thu ngân',
        lang: 'vi',
        // Máy POS chạy toàn màn hình, không thanh địa chỉ, xoay ngang cố định
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#07080A',
        theme_color: '#07080A',
        start_url: '/floor',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache VỎ APP để máy POS khởi động được khi mất mạng.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html',
        /**
         * KHÔNG cache request tới /api.
         *
         * Dữ liệu vận hành mà phục vụ từ cache thì tệ hơn là không có: thực đơn cũ
         * cho gọi món vừa hết, sơ đồ bàn cũ cho mở bàn đang có khách. Chuyện offline
         * do IndexedDB lo — hàng đợi ghi và cache truy vấn — chứ không do HTTP cache.
         */
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5174,
    // Dev: API chạy riêng ở :3000. Proxy để trình duyệt vẫn thấy same-origin,
    // nhờ vậy cookie phiên SameSite=Strict hoạt động đúng như khi triển khai.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
