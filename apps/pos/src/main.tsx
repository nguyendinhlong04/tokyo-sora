import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// Nạp sớm để service worker đăng ký ngay, không phụ thuộc màn nào được render
import './pwa'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
