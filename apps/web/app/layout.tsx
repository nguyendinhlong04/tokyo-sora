import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

/**
 * `metadataBase` để mọi ảnh chia sẻ và thẻ canonical của W1–W9 ra đường dẫn
 * tuyệt đối. Trên Vercel, biến môi trường được đặt theo từng môi trường triển
 * khai nên bản xem trước không tự nhận mình là tên miền thật.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokyosora.vn'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Tokyo Sora — Nhà hàng nướng than hoa',
    template: '%s — Tokyo Sora',
  },
  description: 'Bầu trời Tokyo, trên bếp than. Đặt bàn và đặt món mang về.',
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName: 'Tokyo Sora',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-canvas font-sans text-ink-body">{children}</body>
    </html>
  )
}
