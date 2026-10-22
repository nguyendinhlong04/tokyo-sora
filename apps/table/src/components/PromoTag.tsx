import { IconFlame } from '../icons'

/**
 * Nhãn khuyến mãi — nền cam than, chữ tối, ngọn lửa đặc (§9.6).
 *
 * Một hình cho mọi chỗ khách gặp chương trình: góc ảnh thẻ món, chi tiết món, dòng
 * giỏ, dòng đơn. Cam than là nấc "than" của thang than hồng — nổi trên nền mực mà
 * không tranh điểm vàng của nút Gửi bếp. Màu không đứng một mình: luôn có chữ.
 */
export function PromoTag({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <span
      className={[
        'inline-flex flex-none items-center gap-[5px] rounded-sm bg-ember-2 px-2 font-bold whitespace-nowrap text-on-accent',
        compact ? 'h-5 text-[length:var(--fs-c1)]' : 'h-6 text-[length:var(--fs-c1)]',
      ].join(' ')}
    >
      <IconFlame size={compact ? 10 : 12} />
      {label}
    </span>
  )
}
