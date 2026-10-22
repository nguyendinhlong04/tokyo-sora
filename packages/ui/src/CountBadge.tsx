/**
 * Chấm đếm số — chuông "Việc cần xử lý" ở Office, thanh tab của Kênh nhân viên.
 *
 * Màu trung tính (nền chữ đậm, chữ màu nền) nên tự đảo đúng ở cả chủ đề sáng lẫn
 * tối, và không tranh "điểm vàng mạnh nhất" của màn. `urgent` (có việc quá hạn)
 * mới tô đỏ — nơi gọi vẫn phải nói bằng chữ việc gì quá hạn.
 */
export function CountBadge({
  count,
  label,
  urgent = false,
}: {
  count: number
  /** Đọc cho trình đọc màn hình: "3 văn bản chưa đọc" */
  label: string
  urgent?: boolean
}) {
  if (count <= 0) return null
  return (
    <span
      role="status"
      aria-label={label}
      className={[
        'inline-flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5 font-mono text-[length:var(--fs-c2)] leading-none tabular-nums',
        urgent ? 'bg-danger text-ink-cream' : 'bg-ink-hi text-canvas',
      ].join(' ')}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
