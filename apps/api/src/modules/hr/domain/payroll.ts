/**
 * Tính công và tính lương — hàm thuần, không CSDL.
 *
 * Đây là chỗ tiền của người lao động được quyết định, nên mọi quy tắc phải kiểm
 * được bằng test chứ không bằng cách nhìn bảng lương rồi đoán. Ba thứ nằm ở đây:
 * quy giờ công từ ca làm, phân loại giờ tăng ca theo loại ngày, và ráp một dòng
 * lương từ giờ + đơn giá + hệ số.
 *
 * TIỀN LÀ SỐ NGUYÊN ĐỒNG, GIỜ LÀ SỐ NGUYÊN PHÚT. Không có giá trị thập phân nào
 * sống sót ra khỏi file này: chia giờ ra số lẻ rồi cộng dồn là cách bảng lương
 * lệch vài nghìn đồng mỗi tháng mà không ai truy được vì sao.
 */

/** Ngày thường · ngày nghỉ tuần · ngày lễ — quyết định hệ số tăng ca (§26 H6) */
export type DayKind = 'thuong' | 'nghi' | 'le'

export interface ShiftInput {
  startMinute: number
  endMinute: number
  breakMinutes: number
  dayKind: DayKind
}

export interface PayrollRates {
  /** Giờ chuẩn mỗi ngày, phút. Quá mức này ở ngày thường là tăng ca */
  standardDailyMinutes: number
  /** Giờ chuẩn mỗi tháng, phút — quy lương tháng ra đơn giá giờ để tính tăng ca */
  standardMonthlyMinutes: number
  /** 150% ngày thường · 200% ngày nghỉ · 300% ngày lễ (§26 H6, theo luật lao động) */
  otNormal: number
  otRest: number
  otHoliday: number
  /** BHXH + BHYT + BHTN phần người lao động */
  insuranceEmployee: number
  /** TNCN tạm khấu trừ — 0 nghĩa là chưa cấu hình, KHÔNG phải miễn thuế */
  pitWithhold: number
}

export const DEFAULT_RATES: PayrollRates = {
  standardDailyMinutes: 8 * 60,
  standardMonthlyMinutes: 26 * 8 * 60,
  otNormal: 1.5,
  otRest: 2,
  otHoliday: 3,
  insuranceEmployee: 0.105,
  pitWithhold: 0,
}

/** Giờ công thực của một ca: trừ nghỉ giữa ca */
export function shiftMinutes(shift: ShiftInput): number {
  const span = shift.endMinute - shift.startMinute
  if (span <= 0) throw new RangeError('Ca làm phải kết thúc sau khi bắt đầu')
  if (shift.breakMinutes < 0 || shift.breakMinutes >= span) {
    throw new RangeError('Nghỉ giữa ca phải nhỏ hơn độ dài ca')
  }
  return span - shift.breakMinutes
}

export interface MinuteSplit {
  worked: number
  otNormal: number
  otRest: number
  otHoliday: number
}

/**
 * Chia giờ của một ca thành giờ thường và ba loại giờ tăng ca.
 *
 * Luật lao động Việt Nam tính theo LOẠI NGÀY chứ không chỉ theo số giờ:
 *   · Ngày thường — phần vượt giờ chuẩn mới là tăng ca 150%.
 *   · Ngày nghỉ tuần — TOÀN BỘ giờ hưởng 200%, kể cả giờ đầu tiên.
 *   · Ngày lễ — TOÀN BỘ giờ hưởng 300%.
 *
 * Nên một ca 6 tiếng vào Chủ nhật đắt hơn một ca 9 tiếng ngày thường, và bảng
 * lương phải ra đúng như vậy.
 */
export function splitMinutes(shift: ShiftInput, rates: PayrollRates): MinuteSplit {
  const minutes = shiftMinutes(shift)
  const empty = { worked: 0, otNormal: 0, otRest: 0, otHoliday: 0 }

  if (shift.dayKind === 'nghi') return { ...empty, otRest: minutes }
  if (shift.dayKind === 'le') return { ...empty, otHoliday: minutes }

  const standard = Math.min(minutes, rates.standardDailyMinutes)
  return { ...empty, worked: standard, otNormal: minutes - standard }
}

/**
 * Một ngày công THỰC TẾ, quy từ hai mốc chấm.
 *
 * `dayKind` không đến từ bản ghi chấm công mà từ ca đã xếp (hoặc từ lịch nghỉ/lễ
 * của quán): loại ngày quyết định hệ số 150/200/300%, và để người chấm công tự
 * khai loại ngày là mở cửa cho việc bấm nhầm thành ngày lễ.
 */
export interface WorkedDay {
  clockIn: Date
  /** null = đang trong ca, chưa chấm ra — ngày đó chưa tính công được */
  clockOut: Date | null
  breakMinutes: number
  dayKind: DayKind
}

/** Số phút có mặt đã trừ nghỉ giữa ca; 0 khi chưa chấm ra */
export function workedMinutesOf(day: WorkedDay): number {
  if (day.clockOut === null) return 0
  const span = Math.round((day.clockOut.getTime() - day.clockIn.getTime()) / 60_000)
  if (span <= 0) throw new RangeError('Giờ ra phải sau giờ vào')
  return Math.max(0, span - day.breakMinutes)
}

/**
 * Chia công thực tế của một ngày thành giờ thường và giờ tăng ca.
 *
 * Dùng chung đúng quy tắc với `splitMinutes` để một ca ghi bằng lịch và cùng ca
 * đó ghi bằng máy chấm công ra cùng một cách phân loại — khác nhau chỉ ở SỐ PHÚT,
 * không ở cách hiểu luật.
 */
export function splitWorkedDay(day: WorkedDay, rates: PayrollRates): MinuteSplit {
  const minutes = workedMinutesOf(day)
  const empty = { worked: 0, otNormal: 0, otRest: 0, otHoliday: 0 }
  if (minutes === 0) return empty

  if (day.dayKind === 'nghi') return { ...empty, otRest: minutes }
  if (day.dayKind === 'le') return { ...empty, otHoliday: minutes }

  const standard = Math.min(minutes, rates.standardDailyMinutes)
  return { ...empty, worked: standard, otNormal: minutes - standard }
}

/** Chênh lệch giữa giờ chấm và giờ xếp, phút. Dương = muộn / về sớm. */
export interface Punctuality {
  /** Vào muộn so với ca; âm nghĩa là đến sớm */
  lateMinutes: number
  /** Về sớm so với ca; âm nghĩa là ở lại thêm */
  earlyLeaveMinutes: number
}

/**
 * So giờ chấm với ca đã xếp.
 *
 * `graceMinutes` là khoảng châm chước: chấm lúc 15:02 cho ca 15:00 không phải là
 * đi muộn, đó là người bình thường đi làm. Không có khoảng này thì H3 tô đỏ gần
 * như tất cả mọi người mỗi ngày, và một cảnh báo lúc nào cũng đỏ là cảnh báo
 * không ai đọc.
 *
 * **Đi muộn KHÔNG sinh khoản phạt.** Luật lao động Việt Nam không cho phạt tiền
 * người lao động (§26 H6); con số này chỉ để quản lý nhìn, còn tiền thì tự khớp
 * vì lương tính trên giờ có mặt thật.
 */
export function punctualityOf(
  actual: { clockIn: Date; clockOut: Date | null },
  shift: { startAt: Date; endAt: Date },
  graceMinutes = 5,
): Punctuality {
  const diff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60_000)
  const late = diff(actual.clockIn, shift.startAt)
  const early = actual.clockOut === null ? 0 : diff(shift.endAt, actual.clockOut)
  return {
    lateMinutes: late > graceMinutes ? late : 0,
    earlyLeaveMinutes: early > graceMinutes ? early : 0,
  }
}

export function sumSplits(splits: readonly MinuteSplit[]): MinuteSplit {
  return splits.reduce<MinuteSplit>(
    (acc, s) => ({
      worked: acc.worked + s.worked,
      otNormal: acc.otNormal + s.otNormal,
      otRest: acc.otRest + s.otRest,
      otHoliday: acc.otHoliday + s.otHoliday,
    }),
    { worked: 0, otNormal: 0, otRest: 0, otHoliday: 0 },
  )
}

export interface EmployeePay {
  payKind: 'hourly' | 'monthly'
  hourlyRateVnd: number
  monthlySalaryVnd: number
  fixedAllowanceVnd: number
}

export interface PayrollLineInput {
  employee: EmployeePay
  minutes: MinuteSplit
  rates: PayrollRates
  /** Thưởng nhập tay kèm lý do (§26 H6) */
  bonusVnd?: number
  /** Tạm ứng đã nhận trong kỳ — nguồn thật là phiếu chi C2, chưa dựng */
  advanceVnd?: number
}

export interface PayrollLine {
  /** Đơn giá giờ dùng để tính tăng ca; với lương tháng là số quy đổi */
  hourlyRateVnd: number
  basePayVnd: number
  overtimePayVnd: number
  allowanceVnd: number
  bonusVnd: number
  /** Chi phí của quán TRƯỚC khấu trừ — con số dòng Nhân sự của F7 đọc */
  grossPayVnd: number
  insuranceVnd: number
  taxVnd: number
  advanceVnd: number
  /** Có thể ÂM khi tạm ứng vượt lương kỳ này — không kẹp về 0, xem chú thích */
  netPayVnd: number
}

/**
 * Đơn giá giờ dùng cho tăng ca.
 *
 * Người ăn lương tháng vẫn phải được trả tăng ca, mà tăng ca thì tính theo giờ —
 * nên lương tháng quy về đơn giá giờ bằng số giờ chuẩn tháng. Đây là cách kế toán
 * Việt Nam vẫn làm, và số giờ chuẩn là tham số vì mỗi nơi chốt một con số khác.
 */
export function hourlyRateOf(employee: EmployeePay, rates: PayrollRates): number {
  if (employee.payKind === 'hourly') return employee.hourlyRateVnd
  if (rates.standardMonthlyMinutes <= 0) throw new RangeError('Giờ chuẩn tháng phải lớn hơn 0')
  return Math.round((employee.monthlySalaryVnd * 60) / rates.standardMonthlyMinutes)
}

const payFor = (minutes: number, hourlyRateVnd: number, multiplier = 1) =>
  Math.round((minutes * hourlyRateVnd * multiplier) / 60)

/**
 * Ráp một dòng lương.
 *
 * Thứ tự phép tính CỐ ĐỊNH, và mỗi khoản làm tròn RIÊNG rồi mới cộng — để phiếu
 * lương in ra có các dòng cộng lại đúng bằng dòng tổng. Một phiếu lương mà tổng
 * lệch một đồng so với các dòng của nó là phiếu lương không ai ký.
 *
 * Bảo hiểm tính trên LƯƠNG CƠ BẢN, không trên tổng thu nhập: tiền tăng ca không
 * nằm trong nền đóng bảo hiểm. Nền chính xác còn phụ thuộc hợp đồng nên kế toán
 * phải xác nhận lại — chỗ này cố tình để một tham số duy nhất thay vì đoán thêm.
 */
export function computePayrollLine(input: PayrollLineInput): PayrollLine {
  const { employee, minutes, rates } = input
  const hourlyRateVnd = hourlyRateOf(employee, rates)

  const basePayVnd =
    employee.payKind === 'monthly'
      ? employee.monthlySalaryVnd
      : payFor(minutes.worked, hourlyRateVnd)

  const overtimePayVnd =
    payFor(minutes.otNormal, hourlyRateVnd, rates.otNormal) +
    payFor(minutes.otRest, hourlyRateVnd, rates.otRest) +
    payFor(minutes.otHoliday, hourlyRateVnd, rates.otHoliday)

  const allowanceVnd = employee.fixedAllowanceVnd
  const bonusVnd = input.bonusVnd ?? 0
  const advanceVnd = input.advanceVnd ?? 0

  const grossPayVnd = basePayVnd + overtimePayVnd + allowanceVnd + bonusVnd
  const insuranceVnd = Math.round(basePayVnd * rates.insuranceEmployee)
  const taxVnd = Math.round(Math.max(0, grossPayVnd - insuranceVnd) * rates.pitWithhold)

  return {
    hourlyRateVnd,
    basePayVnd,
    overtimePayVnd,
    allowanceVnd,
    bonusVnd,
    grossPayVnd,
    insuranceVnd,
    taxVnd,
    advanceVnd,
    // KHÔNG kẹp về 0: tạm ứng vượt lương là chuyện có thật, và giấu nó bằng số 0
    // nghĩa là khoản còn nợ biến mất khỏi kỳ sau
    netPayVnd: grossPayVnd - insuranceVnd - taxVnd - advanceVnd,
  }
}

/** Quy phút ra chuỗi "8g30" để in trên bảng công — không in số thập phân */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}g` : `${hours}g${String(rest).padStart(2, '0')}`
}
