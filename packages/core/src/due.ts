/**
 * Nhãn hạn của một việc, theo giờ Việt Nam — "Quá hạn 2 giờ", "Hạn 14:30 hôm
 * nay", "Hạn 09:00 mai", "Hạn 25/10 16:00".
 *
 * Chữ luôn đi kèm màu: người nhìn màn điện thoại ngoài nắng hay người phân biệt
 * kém màu vẫn đọc được việc nào trễ. Nơi gọi chỉ dùng cho việc CÒN ĐANG LÀM —
 * việc đã nộp hay đã xong thì không "quá hạn" nữa.
 */
const TZ = 'Asia/Ho_Chi_Minh'

const dayOf = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)

const timeOf = (at: Date) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at)

/** `dd/MM` ghép tay: ICU của từng máy in ngày-tháng tiếng Việt bằng `/` hoặc `-` tuỳ phiên bản */
const dateOf = (at: Date) => {
  const [, month, day] = dayOf(at).split('-')
  return `${day}/${month}`
}

export function dueLabel(dueIso: string, now: Date = new Date()): string {
  const due = new Date(dueIso)
  const late = now.getTime() - due.getTime()
  if (late > 0) {
    const minutes = Math.floor(late / 60_000)
    if (minutes < 60) return `Quá hạn ${Math.max(minutes, 1)} phút`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Quá hạn ${hours} giờ`
    return `Quá hạn ${Math.floor(hours / 24)} ngày`
  }
  const today = dayOf(now)
  const tomorrow = dayOf(new Date(now.getTime() + 86_400_000))
  const day = dayOf(due)
  if (day === today) return `Hạn ${timeOf(due)} hôm nay`
  if (day === tomorrow) return `Hạn ${timeOf(due)} mai`
  return `Hạn ${dateOf(due)} ${timeOf(due)}`
}
