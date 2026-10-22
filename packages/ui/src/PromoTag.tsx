/**
 * Nhãn khuyến mãi — nền cam than, chữ tối, ngọn lửa đặc (§9.6).
 *
 * Một hình cho mọi chỗ khách gặp chương trình: thẻ món trên iPad và trên web, chi
 * tiết món, dòng giỏ, dòng đơn. Cam than là nấc "than" của thang than hồng — nổi
 * trên nền mực mà không tranh điểm vàng của nút chính. Màu không đứng một mình:
 * luôn có chữ.
 *
 * Entry riêng `@sora/ui/PromoTag` như `QrCode`: web lấy được nhãn mà không kéo theo
 * Dexie của `@sora/core`.
 */

type PromoTagSize = 'md' | 'sm'

const SIZE: Record<PromoTagSize, string> = {
  md: 'h-6',
  sm: 'h-5',
}

const FLAME: Record<PromoTagSize, number> = {
  md: 12,
  sm: 10,
}

export function PromoTag({ label, size = 'md' }: { label: string; size?: PromoTagSize }) {
  return (
    <span
      className={[
        'inline-flex flex-none items-center gap-[5px] rounded-sm bg-ember-2 px-2 text-[length:var(--fs-c1)] font-bold whitespace-nowrap text-on-accent',
        SIZE[size],
      ].join(' ')}
    >
      {/* Tô ĐẶC chứ không vẽ nét như icon thường: 10–12px trên nền cam, nét 1.5 chỉ
          còn là một vệt */}
      <svg
        width={FLAME[size]}
        height={FLAME[size]}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5.2.3 1.8 1.2 2.8 2.2 3.2-.6-3.4.3-6.4.3-9Z" />
      </svg>
      {label}
    </span>
  )
}
