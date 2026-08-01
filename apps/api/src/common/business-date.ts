/**
 * Ngày làm việc của một chi nhánh.
 *
 * Mọi bảng vận hành mang cột `business_date` để gom theo ngày và sinh mã hiển thị.
 * Tính theo MÚI GIỜ CHI NHÁNH, không theo giờ máy chủ — Vercel chạy ở đâu cũng
 * phải ra cùng một ngày cho quán ở Hà Nội.
 *
 * Chuyển ngày lúc nửa đêm. Quán đóng cửa 23:00 nên không có ca vắt qua ngày; nếu
 * sau này mở khuya thì đổi thành mốc 4 giờ sáng ở đúng chỗ này.
 */
export function businessDateOf(at: Date, timezone: string): string {
  // en-CA cho ra đúng định dạng YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Phần `yyMM` của mã hiển thị: ON-2608-0417 */
export function displayPeriodOf(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: '2-digit',
    month: '2-digit',
  }).formatToParts(at)
  const year = parts.find((p) => p.type === 'year')!.value
  const month = parts.find((p) => p.type === 'month')!.value
  return `${year}${month}`
}
