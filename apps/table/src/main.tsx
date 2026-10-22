import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
// Service worker đăng ký ngay khi nạp, kể cả iPad chưa ghép — xem `pwa.ts`
import './pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
