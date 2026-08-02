/** Ngày và giờ cho màn điện thoại — chữ ngắn, đọc được bằng một mắt liếc */

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

/** '2026-08-03' → '03/08' */
export function dayShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** '2026-08-03' → 'T2 03/08' */
export function dayLabel(iso: string): string {
  return `${WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${dayShort(iso)}`
}

/** Phút kể từ 00:00 → '15:00'. Ca qua nửa đêm giữ số giờ thật: 25:30 → '01:30' */
export function hhmm(minute: number): string {
  const h = Math.floor(minute / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/** Mốc tuyệt đối → giờ treo tường trên máy đang cầm */
export function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

/** 450 → '7g30'. Giờ công luôn hiện cả phút — làm tròn là chỗ mất tiền của người ta */
export function hours(minutes: number): string {
  return `${Math.floor(minutes / 60)}g${String(minutes % 60).padStart(2, '0')}`
}

export function addDays(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Thứ Hai của tuần chứa ngày này — cùng quy ước với lưới xếp lịch H2 */
export function mondayOf(iso: string): string {
  const at = new Date(`${iso}T00:00:00Z`)
  const shift = (at.getUTCDay() + 6) % 7
  return addDays(iso, -shift)
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Đầu và cuối tháng chứa ngày này */
export function monthRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from, to: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` }
}

export function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number)
  const at = new Date(Date.UTC(y!, m! - 1 + delta, 1))
  return at.toISOString().slice(0, 10)
}

/** '2026-08-01' → 'Tháng 8/2026' */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `Tháng ${Number(m)}/${y}`
}
