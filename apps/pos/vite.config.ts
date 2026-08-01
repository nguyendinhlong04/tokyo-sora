import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    // Dev: API chạy riêng ở :3000. Proxy để trình duyệt vẫn thấy same-origin,
    // nhờ vậy cookie phiên SameSite=Strict hoạt động đúng như khi triển khai.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
