import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// Nạp sớm để service worker đăng ký ngay, kể cả khi máy chưa ghép
import './pwa'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
