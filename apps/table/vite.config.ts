import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // API cùng gốc với app: trên Vercel do rewrite trong vercel.json lo; máy dev thì
    // proxy. `vite preview` dùng lại đúng proxy này.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
