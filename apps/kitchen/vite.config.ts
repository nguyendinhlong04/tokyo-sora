import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Màn bếp không có ai bấm nút, nhưng tải lại giữa lúc đang có vé thì đầu bếp
      // mất chỗ đang nhìn. App tự áp dụng bản mới khi hàng vé RỖNG — xem App.tsx.
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'Sora Kitchen',
        short_name: 'Sora KDS',
        description: 'Màn hình bếp Tokyo Sora',
        lang: 'vi',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#07080A',
        theme_color: '#07080A',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache vỏ app: mất điện bật lại, mạng chưa lên, màn vẫn hiện được và
        // vé đã lưu trong IndexedDB vẫn còn.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html',
        // Không bao giờ phục vụ vé bếp từ cache HTTP — vé cũ nguy hiểm hơn màn trống
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5175,
    // Dev: same-origin qua proxy để giống hệt lúc triển khai
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
