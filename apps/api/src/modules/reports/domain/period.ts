/**
 * PeriodComparator — quy tắc xuyên suốt của nhóm báo cáo (§25 Kinh doanh).
 *
 * "Đầu mỗi màn báo cáo có PeriodComparator — chọn kỳ (ngày/tuần/tháng/quý/tuỳ
 * chọn) và mốc so sánh (kỳ liền trước / cùng kỳ tuần trước / cùng kỳ năm trước)."
 *
 * Đặt ở đây dưới dạng hàm thuần vì cả B3 và F7 dùng chung, và vì một con số so
 * sai kỳ thì tệ hơn không có con số nào: cả hai màn phải cắt kỳ theo ĐÚNG một
 * cách. Không đọc đồng hồ ngầm — mốc neo do nơi gọi truyền vào.
 *
 * Mọi phép tính chạy trên chuỗi `YYYY-MM-DD` của NGÀY LÀM VIỆC (đã quy về múi giờ
 * chi nhánh ở `common/business-date.ts`), nên ở đây chỉ còn số học lịch thuần —
 * dùng UTC để không có múi giờ nào chen vào lần thứ hai.
 */

export const PERIOD_KINDS = ['ngay', 'tuan', 'thang', 'quy', 'tuy-chon'] as const
export type PeriodKind = (typeof PERIOD_KINDS)[number]

export const COMPARE_KINDS = ['ky-truoc', 'tuan-truoc', 'nam-truoc'] as const
export type CompareKind = (typeof COMPARE_KINDS)[number]

export interface DateRange {
  from: string
  to: string
}

export interface ResolvedPeriod {
  kind: PeriodKind
  compare: CompareKind
  current: DateRange
  baseline: DateRange
  /** Số ngày của kỳ — hai kỳ luôn cùng độ dài, nếu không thì so là so bậy */
  days: number
}

export interface PeriodInput {
  kind: PeriodKind
  compare: CompareKind
  /** Ngày neo — kỳ nào chứa ngày này thì lấy kỳ đó. Bắt buộc trừ khi `tuy-chon` */
  anchor: string
  /** Chỉ dùng với `tuy-chon` */
  from?: string
  to?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function assertBusinessDate(value: string, label = 'ngày'): string {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new RangeError(`${label} phải có dạng YYYY-MM-DD, nhận "${value}"`)
  }
  return value
}

export function addDays(date: string, days: number): string {
  const at = new Date(`${assertBusinessDate(date)}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Số ngày của khoảng, tính CẢ hai đầu: 01→01 là 1 ngày */
export function daysInRange(range: DateRange): number {
  const from = Date.parse(`${assertBusinessDate(range.from, 'từ ngày')}T00:00:00Z`)
  const to = Date.parse(`${assertBusinessDate(range.to, 'đến ngày')}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000) + 1
}

/** Mọi ngày trong khoảng — dùng để hỏi CSDL bằng một lần `IN (...)` */
export function listDays(range: DateRange): string[] {
  const out: string[] = []
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Thứ trong tuần kiểu Việt Nam: thứ Hai = 0 … Chủ nhật = 6 */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
}

function currentRange(input: PeriodInput): DateRange {
  const anchor = assertBusinessDate(input.anchor, 'ngày neo')

  switch (input.kind) {
    case 'ngay':
      return { from: anchor, to: anchor }

    case 'tuan': {
      const from = addDays(anchor, -weekdayIndex(anchor))
      return { from, to: addDays(from, 6) }
    }

    case 'thang': {
      const from = `${anchor.slice(0, 7)}-01`
      // Ngày 0 của tháng sau = ngày cuối của tháng này, khỏi phải nhớ tháng nào 30/31
      const at = new Date(`${from}T00:00:00Z`)
      const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0))
      return { from, to: end.toISOString().slice(0, 10) }
    }

    case 'quy': {
      const year = Number(anchor.slice(0, 4))
      const firstMonth = Math.floor((Number(anchor.slice(5, 7)) - 1) / 3) * 3
      const from = new Date(Date.UTC(year, firstMonth, 1))
      const to = new Date(Date.UTC(year, firstMonth + 3, 0))
      return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
    }

    case 'tuy-chon': {
      if (!input.from || !input.to) throw new RangeError('Kỳ tuỳ chọn phải có từ ngày và đến ngày')
      const from = assertBusinessDate(input.from, 'từ ngày')
      const to = assertBusinessDate(input.to, 'đến ngày')
      if (from > to) throw new RangeError('Từ ngày phải trước đến ngày')
      return { from, to }
    }
  }
}

/**
 * Kỳ đối chiếu.
 *
 * `ky-truoc` lùi đúng độ dài kỳ — kỳ 30 ngày so với 30 ngày liền trước, không so
 * với "tháng trước" theo lịch, vì hai tháng lệch nhau tới 3 ngày là đủ làm mọi
 * chênh lệch % thành vô nghĩa.
 *
 * `nam-truoc` lùi 364 ngày chứ không lùi đúng số năm dương lịch: báo cáo quán ăn
 * so theo THỨ trong tuần (thứ Bảy năm nay với thứ Bảy năm ngoái), lùi 365 ngày sẽ
 * đem thứ Bảy so với thứ Sáu.
 */
function baselineRange(current: DateRange, compare: CompareKind): DateRange {
  const shift =
    compare === 'ky-truoc' ? daysInRange(current) : compare === 'tuan-truoc' ? 7 : 364
  return { from: addDays(current.from, -shift), to: addDays(current.to, -shift) }
}

export function resolvePeriod(input: PeriodInput): ResolvedPeriod {
  const current = currentRange(input)
  return {
    kind: input.kind,
    compare: input.compare,
    current,
    baseline: baselineRange(current, input.compare),
    days: daysInRange(current),
  }
}

export interface Delta {
  value: number
  previous: number
  diff: number
  /** null khi kỳ trước bằng 0 — "tăng vô hạn" không phải một con số để in ra */
  percent: number | null
}

export function delta(value: number, previous: number): Delta {
  return {
    value,
    previous,
    diff: value - previous,
    percent: previous === 0 ? null : (value - previous) / previous,
  }
}
