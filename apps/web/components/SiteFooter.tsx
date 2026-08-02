import Link from 'next/link'
import { SITE } from '../content/site'
import { getBranches } from '../lib/site'

/**
 * Chân trang — địa chỉ và giờ mở của cả ba chi nhánh.
 *
 * Lấy từ API chứ không gõ tay: "thông tin liên hệ đầy đủ… tự đổ ra W5, W9,
 * footer website và chân hoá đơn, sửa một chỗ mọi nơi đổi" (§A10).
 */
export async function SiteFooter() {
  const branches = await getBranches()

  return (
    <footer className="border-t border-accent/16 bg-canvas">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 pt-16 pb-10 lg:grid-cols-[280px_1fr_1fr_1fr] lg:gap-14 lg:px-10 lg:pt-20">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] text-ink-hi">
              TOKYO SORA
            </span>
            <span className="font-jp text-[length:var(--fs-c1)] text-accent">{SITE.kanji}</span>
          </div>
          <p className="mt-5 text-[length:var(--fs-b2)] leading-relaxed text-ink-mute">
            {SITE.blurb}
          </p>
        </div>

        {branches.map((branch) => (
          <div key={branch.id}>
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
              {branch.name}
            </p>
            <p className="mt-4 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
              {branch.address}
            </p>
            {branch.openHours ? (
              <p className="mt-3 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {branch.openHours}
              </p>
            ) : null}
            {branch.phone ? (
              <a
                href={`tel:${branch.phone.replace(/\s/g, '')}`}
                className="mt-1.5 block font-mono text-[length:var(--fs-c1)] text-accent-ink"
              >
                {branch.phone}
              </a>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 border-t border-surface-4 px-5 pt-6 pb-12 lg:px-10">
        <span className="text-[length:var(--fs-c1)] text-line-4">© 2026 Tokyo Sora</span>
        <div className="flex flex-wrap gap-6">
          <Link href="/lien-he" className="text-[length:var(--fs-c1)] text-ink-mute">
            Liên hệ
          </Link>
          <Link href="/lien-he#tuyen-dung" className="text-[length:var(--fs-c1)] text-ink-mute">
            Tuyển dụng
          </Link>
          <Link href="/dat-ban" className="text-[length:var(--fs-c1)] text-ink-mute">
            Đặt bàn
          </Link>
          <Link href="/dat-mon" className="text-[length:var(--fs-c1)] text-ink-mute">
            Đặt món mang về
          </Link>
        </div>
      </div>
    </footer>
  )
}
