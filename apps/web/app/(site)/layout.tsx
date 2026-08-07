import type { ReactNode } from 'react'
import { SiteFooter } from '../../components/SiteFooter'
import { SiteHeader } from '../../components/SiteHeader'
import { SiteTopBar } from '../../components/SiteTopBar'
import { getBranches } from '../../lib/site'

/**
 * Khung của website thương hiệu (W1–W9).
 *
 * Tách khỏi `/dat-mon`: luồng đặt món có khung riêng để bundle JS của nó chỉ tải
 * khi khách vào đặt món — trang marketing phải giữ LCP dưới 2.5s (§23.1.6).
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  // Chi nhánh đầu là chi nhánh gốc — giờ mở và số tổng đài của nó là thứ dải trên
  // cùng nói. Cùng lời gọi đã cache 60 giây với các trang, nên không tốn thêm vòng.
  const [branch] = await getBranches()

  return (
    <div className="relative min-h-dvh bg-canvas">
      {/* Hạt nhiễu rất nhẹ phủ toàn trang — giữ chất giấy của bản thiết kế */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-1 opacity-[0.03]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNDAnIGhlaWdodD0nMTQwJz48ZmlsdGVyIGlkPSduJz48ZmVUdXJidWxlbmNlIHR5cGU9J2ZyYWN0YWxOb2lzZScgYmFzZUZyZXF1ZW5jeT0nMC45JyBudW1PY3RhdmVzPSczJy8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9JzE0MCcgaGVpZ2h0PScxNDAnIGZpbHRlcj0ndXJsKCNuKScvPjwvc3ZnPg==\")",
        }}
      />
      <SiteTopBar openHours={branch?.openHours ?? null} phone={branch?.phone ?? null} />
      <SiteHeader />
      <main className="relative z-2">{children}</main>
      <SiteFooter />
    </div>
  )
}
