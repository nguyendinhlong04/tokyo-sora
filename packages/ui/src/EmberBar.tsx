import { emberColor } from '@sora/core'

/**
 * Thanh than hồng — một tỉ lệ hiện bằng ĐỘ DÀI, độ "nóng" hiện bằng MÀU tro →
 * đồng → than → lửa (§8.3). Dùng chung cho mọi chỗ đo "cần can thiệp tới đâu":
 * chức danh thiếu người, việc sắp hết hạn, KPI hụt chỉ tiêu.
 *
 * Hai số tách nhau vì chúng không phải một: chức danh đủ 6/8 người thì thanh dài
 * 75% nhưng độ nóng là phần THIẾU (25%). Màu không bao giờ là thông tin duy nhất
 * — nơi gọi luôn in chữ đi kèm ("thiếu 2"), `label` là cho trình đọc màn hình.
 */
export function EmberBar({
  fill,
  heat,
  label,
  className = '',
}: {
  /** Độ dài thanh, 0–1 (vượt 1 thì vẫn vẽ đầy) */
  fill: number
  /** Tỉ lệ đưa vào thang than hồng — xem `emberLevel` */
  heat: number
  label: string
  className?: string
}) {
  const percent = Math.round(Math.max(0, Math.min(1, fill)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={['h-1.5 w-full overflow-hidden rounded-pill bg-surface-3', className].join(' ')}
    >
      <div
        className="h-full rounded-pill transition-[width] duration-[var(--dur-panel)]"
        style={{ width: `${percent}%`, backgroundColor: emberColor(heat) }}
      />
    </div>
  )
}
