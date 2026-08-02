import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5176,
    // Cùng lý do với POS: proxy để trình duyệt thấy same-origin, cookie phiên
    // SameSite=Strict mới đi kèm được.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
