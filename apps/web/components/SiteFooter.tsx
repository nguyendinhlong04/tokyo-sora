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
              /* Nới vùng chạm lên 44 mà KHÔNG đội bố cục lên: đệm dọc thêm 24,
                 lề âm trừ lại đúng 24 (trên -6 vì đệm 12 đã thay cho `mt-1.5` cũ,
                 dưới -12 để triệt tiêu hẳn). Số tổng đài là thứ khách bấm thật,
                 không thể để nó là một dòng chữ cao 20. */
              <a
                href={`tel:${branch.phone.replace(/\s/g, '')}`}
                className="-mt-1.5 -mb-3 inline-flex items-center py-3 font-mono text-[length:var(--fs-c1)] text-accent-ink"
              >
                {branch.phone}
              </a>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 border-t border-surface-4 px-5 pt-6 pb-12 lg:px-10">
        <span className="text-[length:var(--fs-c1)] text-line-4">© 2026 Tokyo Sora</span>
        {/* Cùng lối với số tổng đài bên trên: đệm dọc 12 nâng vùng chạm lên 44,
            lề âm 12 trả lại chỗ nên hàng chân trang không cao thêm điểm nào.
            GIỮ NGUYÊN `gap-6`: bốn mục này xuống dòng trên điện thoại, mà mỗi mục
            đang ăn lấn 12 ra ngoài hộp của nó cả trên lẫn dưới — khoảng cách 24
            là vừa đúng để hai hàng chạm nhau chứ không chồng vùng chạm. Rút gap
            xuống là hai hàng đè lên nhau và bấm nhầm mục. */}
        <div className="flex flex-wrap gap-6">
          {[
            { href: '/lien-he', label: 'Liên hệ' },
            { href: '/lien-he#tuyen-dung', label: 'Tuyển dụng' },
            { href: '/dat-ban', label: 'Đặt bàn' },
            { href: '/dat-mon', label: 'Đặt món mang về' },
          ].map((muc) => (
            <Link
              key={muc.href}
              href={muc.href}
              className="-my-3 inline-flex items-center py-3 text-[length:var(--fs-c1)] text-ink-mute"
            >
              {muc.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  )
}
