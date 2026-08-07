import { Fragment } from 'react'

/**
 * Dải thông báo trên cùng — giờ nhận đơn và số tổng đài, có ở mọi trang W1–W9.
 *
 * Giờ mở và số điện thoại đọc từ A10 qua `/api/site/branches`: quán đổi giờ ở
 * Office là dải này đổi theo trong vòng một phút, không phải sửa mã. Thiếu dữ
 * liệu thì bớt vế đó chứ không dựng dải rỗng.
 *
 * Dính lại khi cuộn, và thanh điều hướng dính ngay dưới nó — số tổng đài phải ở
 * trong tầm tay suốt trang chứ không chỉ ở đoạn đầu. `sticky` chứ không `fixed`:
 * dải vẫn chiếm chỗ trong dòng chảy, nên chiều cao hero (`100dvh - 200px`) và
 * mọi khoảng đệm bên dưới không phải tính lại.
 *
 * HAI BỐ CỤC, không phải một bố cục co giãn:
 * — điện thoại (dưới 640) chữ CHẠY ngang, dải chỉ cao 32. Đứng yên thì bề ngang
 *   đó chỉ đủ một vế, mà dải đã ghim suốt trang nên phải đáng 32 điểm ảnh đó;
 * — từ 640 trở lên đứng yên, căn giữa như cũ — lúc đó cả câu đã vừa một dòng,
 *   cho chạy chỉ tổ làm khó người đọc.
 *
 * CHIỀU CAO 32 · 40 · 44. Hai chỗ khác neo theo con số này: `SiteHeader` dính
 * ngay dưới, và dải chương của W2. Sửa ở đây thì phải sửa cả hai.
 */
export function SiteTopBar({
  openHours,
  phone,
}: {
  openHours: string | null
  phone: string | null
}) {
  if (!openHours && !phone) return null

  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null

  /** Các vế chữ chạy trên điện thoại — vế nào không có dữ liệu thì rụng khỏi vòng */
  const doan = ['Đặt món mang về hoặc giao tận nơi', openHours].filter(
    (x): x is string => Boolean(x),
  )

  return (
    <div className="sticky top-0 z-50 bg-[linear-gradient(90deg,var(--sora-gold-700)_0%,var(--sora-gold-500)_48%,var(--sora-gold-700)_100%)] text-surface-1">
      {/* --------------------------------------- Điện thoại: một dải chữ chạy */}
      {/* Máy tắt hiệu ứng chuyển động nhận bản đứng yên ngay dưới đây thay cho
          dải chạy — quy tắc đổi chỗ nằm trong globals.css. */}
      <div className="sora-ticker-khung flex h-8 items-center overflow-hidden sm:hidden">
        {/* Hai bản nội dung GIỐNG HỆT nhau nằm cạnh nhau; chạy hết -50% là bản
            thứ hai đứng đúng chỗ bản thứ nhất vừa rời đi, nên vòng lặp không có
            mối nối. Bản thứ hai `aria-hidden` để trình đọc màn hình không đọc
            mọi thứ hai lần. */}
        <div className="sora-ticker flex w-max hover:[animation-play-state:paused]">
          {[0, 1].map((ban) => (
            <span key={ban} aria-hidden={ban === 1} className="flex shrink-0 items-center">
              {doan.map((chu) => (
                <Fragment key={chu}>
                  <span className="text-[length:var(--fs-c2)] font-semibold tracking-[0.14em] whitespace-nowrap uppercase">
                    {chu}
                  </span>
                  <Cham />
                </Fragment>
              ))}
              {phone && telHref ? (
                <>
                  {/* Vẫn bấm gọi được: rê tay lên dải là chữ dừng, rồi bấm. Bản
                      thứ hai ra khỏi thứ tự tab để không có hai nút gọi. */}
                  <a
                    href={telHref}
                    tabIndex={ban === 1 ? -1 : undefined}
                    className="inline-flex items-center gap-2 text-[length:var(--fs-c1)] font-semibold whitespace-nowrap"
                  >
                    <PhoneIcon />
                    {phone}
                  </a>
                  <Cham />
                </>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {/* Bản đứng yên, chỉ hiện khi máy tắt hiệu ứng. Bỏ câu mời, giữ hai thứ
          khách cần: giờ mở và số gọi được — đủ ngắn để vừa khung 320. */}
      <div className="sora-ticker-tinh h-8 items-center justify-center gap-3 px-4 sm:!hidden">
        {openHours ? (
          <span className="truncate text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] uppercase">
            {openHours}
          </span>
        ) : null}
        {openHours && phone ? (
          <span aria-hidden className="h-3 w-px flex-none bg-surface-1/40" />
        ) : null}
        {phone && telHref ? (
          <a
            href={telHref}
            className="inline-flex flex-none items-center gap-1.5 text-[length:var(--fs-c1)] font-semibold whitespace-nowrap"
          >
            <PhoneIcon />
            {phone}
          </a>
        ) : null}
      </div>

      {/* ------------------------------------- Từ tablet: đứng yên, căn giữa */}
      <div className="mx-auto hidden h-10 max-w-[1280px] items-center justify-center gap-3.5 px-5 sm:flex lg:h-11 lg:gap-6 lg:px-10">
        <span className="text-[length:var(--fs-c2)] font-semibold tracking-[0.14em] uppercase lg:text-[length:var(--fs-c1)]">
          Đặt món mang về hoặc giao tận nơi{openHours ? ` · ${openHours}` : ''}
        </span>

        {openHours && phone ? (
          <span aria-hidden className="h-3.5 w-px bg-surface-1/35" />
        ) : null}

        {phone && telHref ? (
          <a
            href={telHref}
            className="inline-flex items-center gap-2 text-[length:var(--fs-c1)] font-semibold whitespace-nowrap underline-offset-4 hover:underline"
          >
            <PhoneIcon />
            {phone}
          </a>
        ) : null}
      </div>
    </div>
  )
}

/** Dấu chấm ngăn hai vế của dải chạy */
function Cham() {
  return <span aria-hidden className="mx-4 inline-block size-1 shrink-0 rounded-full bg-surface-1/50" />
}

function PhoneIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className="shrink-0"
    >
      <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.6 19.6 0 0 1-8.5-3 19.3 19.3 0 0 1-6-6 19.6 19.6 0 0 1-3-8.6A2 2 0 0 1 3.3 2H6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L7.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.8a2 2 0 0 1 1.7 2Z" />
    </svg>
  )
}
