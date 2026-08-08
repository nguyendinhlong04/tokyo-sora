'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NAV, SITE } from '../content/site'

export interface HeaderBranch {
  id: string
  name: string
  phone: string | null
}

/**
 * Thanh điều hướng — có mặt ở mọi trang W1–W9.
 *
 * "Hai nút hành động ngang hàng: Đặt bàn · Đặt món mang về — đây là hai việc
 * website phải bán được, mọi trang đều có lối về hai nút này ở thanh điều hướng"
 * (§19). Nên hai nút đó không bao giờ nằm trong menu xổ: trên điện thoại nút Đặt
 * bàn vẫn hiện cạnh nút hamburger, đúng như bản thiết kế mobile.
 *
 * NÚT LIÊN HỆ nằm ở hai chỗ khác nhau theo khổ màn, và đó là chủ ý chứ không phải
 * làm dở: ở laptop nó đứng trong thanh, xổ ra số của từng chi nhánh. Trên điện
 * thoại thanh chỉ còn 10 điểm ảnh trống (chữ hiệu 161 + hai nút 140 + đệm và
 * khoảng cách 64 = 365 trên màn 375), mà một nút chạm được cần 56 kể cả khoảng
 * cách — nhét vào là tràn ra ngoài màn. Nên ở đó danh sách số nằm trong menu xổ,
 * và dải vàng trên cùng vẫn giữ một số bấm gọi được suốt trang.
 */
export function SiteHeader({ branches }: { branches: HeaderBranch[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)

  /** Chi nhánh chưa khai số thì không dựng dòng rỗng cho khách bấm hụt */
  const callable = branches.filter((b) => b.phone)

  // Bấm Esc là đóng bảng số — thói quen của mọi bảng xổ, và là lối thoát duy nhất
  // cho người dùng bàn phím vì nền bắt cú bấm bên dưới không nhận được tiêu điểm.
  useEffect(() => {
    if (!contactOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setContactOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [contactOpen])

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    /* Dính ngay DƯỚI dải vàng (`SiteTopBar`, cao 32 · 40 · 44) chứ không lên tận
       đỉnh: hai thanh cùng đòi `top-0` thì thanh này đè lên dải chữ chạy */
    <header className="sticky top-8 z-50 bg-canvas/94 backdrop-blur-md sm:top-10 lg:top-11">
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
          {/* ----------------------------------------- Liên hệ (từ laptop trở lên) */}
          {callable.length > 0 ? (
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setContactOpen((v) => !v)}
                aria-expanded={contactOpen}
                className="inline-flex h-11 items-center gap-2 rounded-sm border border-ink-hi/24 px-4 text-[length:var(--fs-b2)] font-medium text-ink-body transition-colors hover:border-ink-hi hover:text-ink-hi"
              >
                <PhoneIcon />
                Liên hệ
              </button>

              {contactOpen ? (
                <>
                  {/* Nền trong suốt hứng cú bấm ra ngoài — rẻ hơn và chắc hơn một
                      listener trên `document`, lại tự dọn khi bảng đóng */}
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setContactOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute right-0 z-20 mt-2 w-[272px] rounded-md border border-line-2 bg-canvas p-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
                    {callable.map((b) => (
                      <a
                        key={b.id}
                        href={telHref(b.phone!)}
                        onClick={() => setContactOpen(false)}
                        /* py-3 để mỗi dòng cao 45 — dưới 44 thì con trỏ dễ rơi
                           vào khe giữa hai chi nhánh và bấm hụt */
                        className="flex items-center justify-between gap-3 rounded-sm px-3 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="text-[length:var(--fs-b2)] text-ink-body">
                          {b.name}
                        </span>
                        <span className="font-mono text-[length:var(--fs-b2)] text-accent-ink">
                          {b.phone}
                        </span>
                      </a>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <Link
            href="/dat-mon"
            className="hidden h-11 items-center rounded-sm border border-accent px-5 text-[length:var(--fs-b2)] font-medium text-accent-ink transition-colors hover:border-gold-300 hover:text-gold-200 lg:inline-flex"
          >
            Đặt món mang về
          </Link>
          <Link
            href="/dat-ban"
            /* 40 trên điện thoại, 44 từ laptop. 40 là cỡ chung của mọi ô bấm trên
               thanh và trong hero (ô chi nhánh cũng 40), nên thanh đọc ra một khối
               thay vì một nút vàng nhô lên. Đừng hạ tiếp: dưới 36 thì nút bán hàng
               chính bắt đầu khó trúng bằng ngón cái. */
            className="inline-flex h-10 items-center rounded-sm bg-accent-strong px-3.5 text-[length:var(--fs-c1)] font-semibold text-on-accent transition-colors hover:bg-accent lg:h-11 lg:px-6 lg:text-[length:var(--fs-b2)]"
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

          {/* Danh sách số nằm ở đây thay vì trong thanh — xem lý do đo đạc ở đầu
              tệp. Mỗi dòng cao 52 nên bấm bằng ngón cái không trượt sang dòng bên. */}
          {callable.length > 0 ? (
            <div className="mt-5 border-t border-line-1 pt-4">
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.14em] text-ink-mute uppercase">
                Gọi cho chi nhánh
              </p>
              {callable.map((b) => (
                <a
                  key={b.id}
                  href={telHref(b.phone!)}
                  onClick={() => setOpen(false)}
                  className="flex h-13 items-center justify-between gap-3 border-b border-line-1"
                >
                  <span className="text-[length:var(--fs-b1)] text-ink-body">{b.name}</span>
                  <span className="inline-flex items-center gap-2 font-mono text-[length:var(--fs-b2)] text-accent-ink">
                    <PhoneIcon />
                    {b.phone}
                  </span>
                </a>
              ))}
            </div>
          ) : null}
        </nav>
      ) : null}
    </header>
  )
}

/** Bỏ mọi thứ không phải chữ số hoặc dấu cộng — máy gọi không hiểu khoảng trắng */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

function PhoneIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      aria-hidden
      className="flex-none"
    >
      <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.6 19.6 0 0 1-8.5-3 19.3 19.3 0 0 1-6-6 19.6 19.6 0 0 1-3-8.6A2 2 0 0 1 3.3 2H6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L7.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.8a2 2 0 0 1 1.7 2Z" />
    </svg>
  )
}
