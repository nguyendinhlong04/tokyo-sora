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

/**
 * Giờ treo tường của chi nhánh, tính bằng phút kể từ 00:00.
 *
 * Lịch bán (M11) khai bằng phút trong ngày, nên nó cần đúng con số này chứ không
 * phải giờ máy chủ: quán Hà Nội bán suất trưa 11:00–14:00, còn máy chủ chạy UTC
 * thì lúc đó mới 4 giờ sáng và sẽ từ chối mọi suất trưa.
 */
export function minuteOfDayIn(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  // Giờ 24 của Intl là 00 của ngày hôm sau
  return (get('hour') % 24) * 60 + get('minute')
}

/**
 * Mốc tuyệt đối của 00:00 ngày làm việc, theo múi giờ chi nhánh.
 *
 * Khung giờ nhận đơn online đếm bằng phút kể từ mốc này, nên nó phải đúng dù máy
 * chủ chạy ở UTC. Cách làm: coi giờ treo tường là UTC rồi trừ đi độ lệch múi giờ
 * tại chính thời điểm đó. Việt Nam không đổi giờ theo mùa nên một lần trừ là đủ;
 * múi giờ có DST cần lặp thêm một vòng — thêm khi nào thật sự mở ở nơi đó.
 */
export function startOfBusinessDay(businessDate: string, timezone: string): Date {
  const asUtc = new Date(`${businessDate}T00:00:00Z`)
  return new Date(asUtc.getTime() - offsetMinutes(asUtc, timezone) * 60_000)
}

/** Độ lệch múi giờ so với UTC tại một thời điểm, tính bằng phút (dương = phía đông) */
function offsetMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  // Giờ 24 của Intl là 00 của ngày hôm sau — quy về 0 để Date.UTC không nhảy ngày
  const hour = get('hour') % 24
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return Math.round((wall - at.getTime()) / 60_000)
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
