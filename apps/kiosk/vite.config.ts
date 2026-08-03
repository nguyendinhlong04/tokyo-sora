import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Kiosk KHÔNG có service worker, khác POS và màn bếp.
 *
 * Hai màn kia cần chạy tiếp khi mạng chập chờn vì việc của chúng nằm trong máy
 * (đơn đang dựng, vé đang nấu). Chấm công thì không: một lượt chấm không tới được
 * máy chủ không phải là một lượt chấm. Cache vỏ app chỉ đủ để hiện ra một cái bàn
 * phím bấm vào không có tác dụng, và người bấm sẽ tưởng mình đã chấm rồi.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5179,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
