import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Cookie phiên bàn là httpOnly + SameSite=Strict nên API buộc phải cùng gốc
    // với app. Trên Vercel việc này do rewrite trong vercel.json lo; máy dev thì proxy.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
