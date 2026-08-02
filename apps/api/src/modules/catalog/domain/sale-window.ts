/**
 * Lịch bán của một món (§18 "giới hạn ngày · lịch bán", khai ở M11).
 *
 * Hàm thuần, không CSDL: câu hỏi "12h trưa thứ Ba có bán set này không" phải kiểm
 * được bằng test chứ không bằng cách đợi tới trưa thứ Ba.
 *
 * BA TẦNG TẮT MÓN, ĐỪNG LẪN:
 *   · `active = false`  — ngừng bán, tới khi có người bật lại tay.
 *   · lịch bán          — quy tắc lặp: mùa nào, thứ mấy, khung giờ nào. File này.
 *   · 86                — hết trong ca, hết hạn cuối ngày (`dish_availability`).
 */

export interface SaleSchedule {
  /** YYYY-MM-DD; null = không giới hạn đầu mùa */
  saleFrom: string | null
  saleTo: string | null
  /** Bitmask: bit 0 = thứ Hai … bit 6 = Chủ nhật */
  saleDays: number
  /** Phút kể từ 00:00 giờ chi nhánh; cả hai null = suốt ngày */
  saleStartMinute: number | null
  saleEndMinute: number | null
}

/** Bán mọi thứ trong tuần — giá trị mặc định của cột `sale_days` */
export const ALL_DAYS = 0b111_1111

export const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const

/** Lịch không giới hạn gì — món khai trước khi có cột lịch bán rơi vào đây */
export function alwaysOnSale(): SaleSchedule {
  return {
    saleFrom: null,
    saleTo: null,
    saleDays: ALL_DAYS,
    saleStartMinute: null,
    saleEndMinute: null,
  }
}

/** Rút đúng năm cột lịch bán ra khỏi một dòng `dishes` */
export function scheduleOf(row: SaleSchedule): SaleSchedule {
  return {
    saleFrom: row.saleFrom,
    saleTo: row.saleTo,
    saleDays: row.saleDays,
    saleStartMinute: row.saleStartMinute,
    saleEndMinute: row.saleEndMinute,
  }
}

export function hasSaleLimit(schedule: SaleSchedule): boolean {
  return (
    schedule.saleFrom !== null ||
    schedule.saleTo !== null ||
    schedule.saleDays !== ALL_DAYS ||
    schedule.saleStartMinute !== null
  )
}

/**
 * Bit thứ trong tuần của một ngày làm việc.
 *
 * Đọc `YYYY-MM-DD` như một mốc UTC rồi lấy `getUTCDay`: chuỗi ngày làm việc đã
 * được quy về múi giờ chi nhánh từ trước (`businessDateOf`), nên diễn giải nó theo
 * giờ máy chủ một lần nữa sẽ lệch một ngày với mọi máy chủ phía tây Hà Nội.
 */
export function dayBitOf(businessDate: string): number {
  const utcDay = new Date(`${businessDate}T00:00:00Z`).getUTCDay()
  // getUTCDay: 0 = Chủ nhật. Bảng của ta bắt đầu từ thứ Hai.
  return (utcDay + 6) % 7
}

/**
 * Món có bán vào ngày/giờ này không.
 *
 * `minuteOfDay = null` nghĩa là người gọi chỉ hỏi ở mức NGÀY (ví dụ menu web dựng
 * sẵn cho cả ngày): khung giờ được bỏ qua chứ không bị coi là ngoài giờ.
 */
export function isOnSale(
  schedule: SaleSchedule,
  businessDate: string,
  minuteOfDay: number | null,
): boolean {
  if (schedule.saleFrom !== null && businessDate < schedule.saleFrom) return false
  if (schedule.saleTo !== null && businessDate > schedule.saleTo) return false

  if ((schedule.saleDays & (1 << dayBitOf(businessDate))) === 0) return false

  if (minuteOfDay === null || schedule.saleStartMinute === null) return true
  return minuteOfDay >= schedule.saleStartMinute && minuteOfDay < schedule.saleEndMinute!
}

/**
 * Lịch bán nói bằng tiếng người — dùng cho thông báo lỗi ở POS và cột lịch của M11.
 *
 * Trả null khi không giới hạn gì: một dòng "bán cả tuần, cả ngày, quanh năm" dưới
 * mỗi món chỉ làm bảng dài thêm.
 */
export function describeSchedule(schedule: SaleSchedule): string | null {
  if (!hasSaleLimit(schedule)) return null

  const parts: string[] = []
  if (schedule.saleDays !== ALL_DAYS) parts.push(describeDays(schedule.saleDays))
  if (schedule.saleStartMinute !== null) {
    parts.push(`${clock(schedule.saleStartMinute)}–${clock(schedule.saleEndMinute!)}`)
  }
  if (schedule.saleFrom !== null || schedule.saleTo !== null) {
    parts.push(
      schedule.saleFrom !== null && schedule.saleTo !== null
        ? `${day(schedule.saleFrom)}–${day(schedule.saleTo)}`
        : schedule.saleFrom !== null
          ? `từ ${day(schedule.saleFrom)}`
          : `đến ${day(schedule.saleTo!)}`,
    )
  }
  return parts.join(' · ')
}

/** Gộp thứ liền nhau thành dải: 1111100 → 'T2–T6', 1000001 → 'T2 · CN' */
function describeDays(mask: number): string {
  const runs: string[] = []
  let start: number | null = null

  for (let bit = 0; bit <= 7; bit++) {
    const on = bit < 7 && (mask & (1 << bit)) !== 0
    if (on && start === null) start = bit
    if (!on && start !== null) {
      const end = bit - 1
      runs.push(
        end - start >= 2 ? `${DAY_LABELS[start]}–${DAY_LABELS[end]}` : range(start, end),
      )
      start = null
    }
  }
  return runs.join(' · ')
}

function range(start: number, end: number): string {
  const out: string[] = []
  for (let bit = start; bit <= end; bit++) out.push(DAY_LABELS[bit]!)
  return out.join(' · ')
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/** 2026-12-20 → 20/12 — năm bỏ đi vì lịch bán gần như luôn nằm trong năm đang chạy */
function day(businessDate: string): string {
  const [, month, date] = businessDate.split('-')
  return `${date}/${month}`
}
