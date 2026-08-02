import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5177,
    // Cookie phiên là httpOnly + SameSite=Strict nên API buộc phải cùng gốc với
    // app. Trên Vercel do rewrite trong vercel.json lo; máy dev thì proxy.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
