import Link from 'next/link'
import { SITE } from '../content/site'
import { getBranches } from '../lib/site'

/**
 * Chân trang — địa chỉ, giờ mở và bản đồ của từng chi nhánh đang bật.
 *
 * Lấy từ API chứ không gõ tay: "thông tin liên hệ đầy đủ… tự đổ ra W5, W9,
 * footer website và chân hoá đơn, sửa một chỗ mọi nơi đổi" (§A10).
 */
export async function SiteFooter() {
  const branches = await getBranches()

  /** Chi nhánh chưa khai địa chỉ thì không dựng bản đồ trỏ vào chỗ trống */
  const mapped = branches.filter((b) => b.address)

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

      {/* ------------------------------------------------ Bản đồ tìm đường
          Một thẻ cho MỖI chi nhánh đang bật, nên mở thêm chi nhánh ở A10 là có
          thêm bản đồ, không phải sửa mã. `auto-fit` để một chi nhánh thì thẻ trải
          hết bề ngang, ba chi nhánh thì tự chia ba cột.

          Khung bản đồ để `pointer-events-none` và phủ một thẻ liên kết lên trên:
          chạm vào đâu trên bản đồ cũng mở thẳng Google Maps ở chế độ CHỈ ĐƯỜNG,
          thay vì kéo thu phóng ngay trong khung rồi vẫn không biết đi lối nào. */}
      {mapped.length > 0 ? (
        <div className="mx-auto max-w-[1280px] border-t border-surface-4 px-5 pt-10 pb-2 lg:px-10 lg:pt-14">
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
            Tìm đường tới quán
          </p>
          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
            {mapped.map((branch) => {
              const diaChi = branch.address!
              return (
                <div
                  key={branch.id}
                  className="relative overflow-hidden rounded-md border border-line-2 bg-surface-2"
                >
                  <iframe
                    title={`Bản đồ ${branch.name}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(diaChi)}&hl=vi&output=embed`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="pointer-events-none block h-[230px] w-full border-0 lg:h-[260px]"
                  />
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(diaChi)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 flex flex-col justify-end bg-[linear-gradient(180deg,rgba(7,8,10,0)_40%,rgba(7,8,10,0.88)_100%)] p-4 transition-colors hover:bg-[linear-gradient(180deg,rgba(7,8,10,0.15)_40%,rgba(7,8,10,0.94)_100%)]"
                  >
                    <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                      {branch.name}
                    </span>
                    <span className="mt-0.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
                      {diaChi}
                    </span>
                    <span className="mt-2.5 inline-flex items-center gap-1.5 text-[length:var(--fs-c1)] font-semibold text-accent-ink">
                      <MapPinIcon />
                      Chỉ đường trên Google Maps →
                    </span>
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 border-t border-surface-4 px-5 pt-6 pb-12 lg:mt-10 lg:px-10">
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

function MapPinIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      aria-hidden
      className="flex-none"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.8" />
    </svg>
  )
}
