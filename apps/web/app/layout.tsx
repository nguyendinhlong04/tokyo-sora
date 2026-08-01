import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tokyo Sora — Nhà hàng nướng than hoa',
  description: 'Bầu trời Tokyo, trên bếp than. Đặt bàn và đặt món mang về.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-canvas font-sans text-ink-body">{children}</body>
    </html>
  )
}
