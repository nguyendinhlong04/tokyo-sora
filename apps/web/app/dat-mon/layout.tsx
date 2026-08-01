import Link from 'next/link'
import type { ReactNode } from 'react'
import { OrderProvider } from './order-context'

/**
 * Khung của luồng đặt món.
 *
 * Tách khỏi trang marketing để bundle JS của luồng này chỉ tải khi khách vào
 * `/dat-mon` — trang chủ phải giữ LCP dưới 2.5s (§23.1.6).
 */
export default function OrderLayout({ children }: { children: ReactNode }) {
  return (
    <OrderProvider>
      <div className="min-h-dvh bg-canvas">
        <header className="sticky top-0 z-50 border-b border-accent/16 bg-surface-2/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.3em] text-accent">
                東京空
              </span>
              <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] text-ink-hi">
                TOKYO SORA
              </span>
            </Link>
            <Link
              href="/dat-mon"
              className="text-[length:var(--fs-b2)] text-ink-mute hover:text-ink-hi"
            >
              Đổi chi nhánh
            </Link>
          </div>
        </header>
        {children}
      </div>
    </OrderProvider>
  )
}
