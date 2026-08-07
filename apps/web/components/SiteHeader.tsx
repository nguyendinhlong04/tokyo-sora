'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { NAV, SITE } from '../content/site'

/**
 * Thanh điều hướng — có mặt ở mọi trang W1–W9.
 *
 * "Hai nút hành động ngang hàng: Đặt bàn · Đặt món mang về — đây là hai việc
 * website phải bán được, mọi trang đều có lối về hai nút này ở thanh điều hướng"
 * (§19). Nên hai nút đó không bao giờ nằm trong menu xổ: trên điện thoại nút Đặt
 * bàn vẫn hiện cạnh nút hamburger, đúng như bản thiết kế mobile.
 */
export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    /* Dính ngay DƯỚI dải vàng (`SiteTopBar`, cao 32 · 40 · 44) chứ không lên tận
       đỉnh: hai thanh cùng đòi `top-0` thì thanh này đè lên dải chữ chạy */
    <header className="sticky top-8 z-50 border-b border-accent/16 bg-canvas/94 backdrop-blur-md sm:top-10 lg:top-11">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-5 lg:h-20 lg:gap-10 lg:px-10">
        <Link href="/" className="flex flex-none items-baseline gap-2.5">
          <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.18em] text-ink-hi lg:tracking-[0.2em]">
            TOKYO SORA
          </span>
          {/* Máy dưới 360 điểm ảnh (iPhone SE đời đầu, màn ngoài máy gập) không đủ
              chỗ cho chữ hiệu + hai nút + hamburger: thiếu 26 điểm và nút hamburger
              lòi ra ngoài màn. Bỏ chữ Nhật ở đúng dải đó, giữ nguyên mọi khổ khác. */}
          <span className="font-jp text-[length:var(--fs-c1)] text-accent max-[359px]:hidden">
            {SITE.kanji}
          </span>
        </Link>

        <nav className="mx-auto hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-[length:var(--fs-b2)] font-medium transition-colors hover:text-ink-hi ${
                isActive(item.href) ? 'text-ink-hi' : 'text-ink-body'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex flex-none items-center gap-3 lg:ml-0">
          <Link
            href="/dat-mon"
            className="hidden h-11 items-center rounded-sm border border-accent px-5 text-[length:var(--fs-b2)] font-medium text-accent-ink transition-colors hover:border-gold-300 hover:text-gold-200 lg:inline-flex"
          >
            Đặt món mang về
          </Link>
          <Link
            href="/dat-ban"
            /* 44 chứ không 36 kể cả trên điện thoại: đây là nút bán hàng chính,
               mà 36 thì dưới ngưỡng ngón tay của cả Apple lẫn Google */
            className="inline-flex h-11 items-center rounded-sm bg-accent-strong px-4 text-[length:var(--fs-c1)] font-semibold text-on-accent transition-colors hover:bg-accent lg:px-6 lg:text-[length:var(--fs-b2)]"
          >
            Đặt bàn
          </Link>
          <button
            type="button"
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center text-ink-body lg:hidden"
          >
            <svg width="20" height="14" viewBox="0 0 20 14" stroke="currentColor" strokeWidth="1.5">
              {open ? (
                <path d="M2 2l16 10M18 2L2 12" />
              ) : (
                <path d="M0 1h20M0 7h20M0 13h14" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-line-1 bg-canvas px-5 pb-5 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex h-12 items-center border-b border-line-1 text-[length:var(--fs-b1)] ${
                isActive(item.href) ? 'text-ink-hi' : 'text-ink-body'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/dat-mon"
            onClick={() => setOpen(false)}
            className="mt-4 flex h-12 items-center justify-center rounded-sm border border-accent text-[length:var(--fs-b1)] font-medium text-accent-ink"
          >
            Đặt món mang về
          </Link>
        </nav>
      ) : null}
    </header>
  )
}
