import Link from 'next/link'
import { getBranches } from '../lib/site'

/**
 * Chân trang — địa chỉ, giờ mở và bản đồ của từng chi nhánh đang bật.
 *
 * Lấy từ API chứ không gõ tay: "thông tin liên hệ đầy đủ… tự đổ ra W5, W9,
 * footer website và chân hoá đơn, sửa một chỗ mọi nơi đổi" (§A10).
 */
export async function SiteFooter() {
  const branches = await getBranches()

  return (
    <footer className="border-t border-accent/16 bg-canvas">
      <div className="mx-auto max-w-[1280px] px-5 pt-16 pb-10 lg:px-10 lg:pt-20">
        {/* Danh sách chi nhánh. `auto-fit` chứ không chia cột cứng: một chi nhánh
            thì khối trải hết chỗ còn lại, thêm chi nhánh là tự xuống thành lưới —
            không phải sửa mã mỗi lần mở thêm cơ sở. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-8">
          {branches.map((branch) => (
            /* Chữ và bản đồ NẰM CẠNH nhau ngay từ 420 điểm ảnh. Bản đồ chỉ là ô
               phụ trợ cho địa chỉ, nên nó bám sát địa chỉ và giữ đúng cỡ một ô
               phụ trợ — tách thành khối riêng trải hết bề ngang thì nó to hơn cả
               phần chữ mà nó đang minh hoạ. */
            <div
              key={branch.id}
              /* `max-w` là phần quan trọng chứ không phải trang trí: một chi nhánh
                 thì ô lưới rộng gần 900, cột chữ giãn hết cỡ và đẩy bản đồ ra tận
                 mép phải — vẫn "cạnh" về mặt kỹ thuật nhưng mắt đọc ra là hai thứ
                 rời nhau. Bó ở 520 thì bản đồ bám sát địa chỉ. Nhiều chi nhánh thì
                 mỗi ô đã hẹp sẵn, mốc này không chạm tới. */
              className="grid max-w-[520px] gap-4 min-[420px]:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                  {branch.name}
                </p>
                <p className="mt-3 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
                  {branch.address}
                </p>
                {branch.openHours ? (
                  <p className="mt-2.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {branch.openHours}
                  </p>
                ) : null}
                {branch.phone ? (
                  /* Nới vùng chạm lên 44 mà KHÔNG đội bố cục lên: đệm dọc thêm 24,
                     lề âm trừ lại đúng 24 (trên -6 vì đệm 12 đã thay cho `mt-1.5` cũ,
                     dưới -12 để triệt tiêu hẳn). Số tổng đài là thứ khách bấm thật,
                     không thể để nó là một dòng chữ cao 20. */
                  <a
                    href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`}
                    className="-mt-1 -mb-3 inline-flex items-center py-3 font-mono text-[length:var(--fs-c1)] text-accent-ink"
                  >
                    {branch.phone}
                  </a>
                ) : null}
              </div>

              {branch.address ? <BranchMap name={branch.name} address={branch.address} /> : null}
            </div>
          ))}
        </div>
      </div>


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

/**
 * Ô bản đồ nhỏ nằm cạnh địa chỉ.
 *
 * Khung `pointer-events-none` và một thẻ liên kết phủ lên trên: chạm vào đâu
 * cũng mở Google Maps ở chế độ CHỈ ĐƯỜNG. Để khung tự nhận cú chạm thì khách
 * kéo thu phóng ngay trong ô 168 điểm ảnh — vừa khó vừa chẳng dẫn tới đâu.
 *
 * Cỡ bám theo khối chữ bên trái: 132 cao là xấp xỉ bốn dòng tên–địa chỉ–giờ–số,
 * nên hai bên ngang nhau. Dưới 420 điểm ảnh thì không đủ chỗ cho hai cột, ô tụt
 * xuống dưới và trải hết bề ngang nhưng vẫn thấp — nó là ô phụ trợ, không phải
 * một khối riêng.
 */
function BranchMap({ name, address }: { name: string; address: string }) {
  return (
    <a
      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Chỉ đường tới ${name} trên Google Maps`}
      className="group relative block h-[116px] w-full overflow-hidden rounded-md border border-line-2 bg-surface-2 transition-colors hover:border-accent/50 min-[420px]:h-[132px] min-[420px]:w-[188px]"
    >
      <iframe
        title=""
        aria-hidden
        tabIndex={-1}
        src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&hl=vi&z=16&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="pointer-events-none block size-full border-0"
      />
      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-[linear-gradient(180deg,rgba(7,8,10,0)_0%,rgba(7,8,10,0.92)_60%)] px-3 pt-6 pb-2.5 text-[length:var(--fs-c1)] font-semibold text-accent-ink">
        <MapPinIcon />
        Chỉ đường
      </span>
    </a>
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
