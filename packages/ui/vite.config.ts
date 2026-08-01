import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// UI-lab: app dev-only để QA thị giác component/token — không deploy
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5177 },
})
