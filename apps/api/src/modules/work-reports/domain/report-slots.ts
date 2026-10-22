import type { ReportCadence } from '@sora/contracts'

/**
 * Suất báo cáo — hàm thuần. "Báo cáo còn thiếu" không lưu ở đâu: suất phải nộp
 * tính lúc đọc từ mẫu + lịch, bản nào chưa có là thiếu. Bốn chỗ cùng hỏi đây: tab
 * "Còn thiếu" của N7, mục "Cần nộp" của Kênh nhân viên, hộp việc và KPI.
 */

const DAY_MINUTES = 24 * 60

export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Thứ Hai của tuần chứa ngày */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((day + 6) % 7))
}

/** Tuần ISO: `2026-W43` — năm của tuần là năm của thứ Năm trong tuần */
export function isoWeekKey(date: string): string {
  const thursday = addDays(mondayOf(date), 3)
  const year = Number(thursday.slice(0, 4))
  const jan4 = `${year}-01-04`
  const week =
    Math.round((Date.parse(mondayOf(thursday)) - Date.parse(mondayOf(jan4))) / 604_800_000) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Ngày đầu kỳ chứa `date` */
export function periodStartOf(cadence: ReportCadence, date: string): string {
  switch (cadence) {
    case 'ca':
    case 'ngay':
      return date
    case 'tuan':
      return mondayOf(date)
    case 'thang':
      return `${date.slice(0, 7)}-01`
  }
}

export function periodKeyOf(cadence: ReportCadence, date: string): string {
  switch (cadence) {
    case 'ca':
    case 'ngay':
      return date
    case 'tuan':
      return isoWeekKey(date)
    case 'thang':
      return date.slice(0, 7)
  }
}

function daysInMonth(firstDay: string): number {
  const [y, m] = firstDay.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate()
}

/**
 * Hạn nộp, tính bằng phút kể từ 00:00 của ngày đầu kỳ:
 *   - theo ca: giờ kết ca + độ lệch
 *   - theo ngày: độ lệch (1980 = 09:00 sáng hôm sau)
 *   - tuần / tháng: 00:00 ngày đầu kỳ sau + độ lệch
 */
export function dueMinuteOf(
  cadence: ReportCadence,
  periodStart: string,
  dueOffsetMinutes: number,
  shiftEndMinute: number | null,
): number {
  switch (cadence) {
    case 'ca':
      return (shiftEndMinute ?? DAY_MINUTES) + dueOffsetMinutes
    case 'ngay':
      return dueOffsetMinutes
    case 'tuan':
      return 7 * DAY_MINUTES + dueOffsetMinutes
    case 'thang':
      return daysInMonth(periodStart) * DAY_MINUTES + dueOffsetMinutes
  }
}

/**
 * Các ngày đầu kỳ cần xét, từ `today` lùi về: ca/ngày 7 ngày, tuần 4 tuần, tháng
 * 2 tháng. Kỳ đang chạy cũng tính (nộp sớm được), kỳ chưa tới thì không.
 */
export function recentPeriodStarts(cadence: ReportCadence, today: string): string[] {
  const out: string[] = []
  switch (cadence) {
    case 'ca':
    case 'ngay':
      for (let i = 0; i < 7; i++) out.push(addDays(today, -i))
      break
    case 'tuan': {
      const monday = mondayOf(today)
      for (let i = 0; i < 4; i++) out.push(addDays(monday, -7 * i))
      break
    }
    case 'thang': {
      const first = `${today.slice(0, 7)}-01`
      out.push(first, `${addDays(first, -1).slice(0, 7)}-01`)
      break
    }
  }
  return out
}

/** Nộp đúng hạn: trước hạn cộng thời gian ân hạn (`workreport.graceMinutes`) */
export function onTimeOf(submittedAt: Date, dueAt: Date, graceMinutes: number): boolean {
  return submittedAt.getTime() <= dueAt.getTime() + graceMinutes * 60_000
}
