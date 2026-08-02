import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RATES,
  computePayrollLine,
  formatMinutes,
  hourlyRateOf,
  shiftMinutes,
  splitMinutes,
  sumSplits,
  type EmployeePay,
  type ShiftInput,
} from './payroll'

const shift = (over: Partial<ShiftInput> = {}): ShiftInput => ({
  startMinute: 8 * 60,
  endMinute: 16 * 60,
  breakMinutes: 0,
  dayKind: 'thuong',
  ...over,
})

const HOURLY: EmployeePay = {
  payKind: 'hourly',
  hourlyRateVnd: 30_000,
  monthlySalaryVnd: 0,
  fixedAllowanceVnd: 0,
}

describe('giờ công của một ca', () => {
  it('trừ nghỉ giữa ca', () => {
    expect(shiftMinutes(shift({ endMinute: 17 * 60, breakMinutes: 60 }))).toBe(8 * 60)
  })

  it('ca kết thúc trước khi bắt đầu bị chặn', () => {
    expect(() => shiftMinutes(shift({ endMinute: 7 * 60 }))).toThrow()
  })

  it('nghỉ dài bằng cả ca bị chặn — giờ công 0 là dữ liệu vô nghĩa', () => {
    expect(() => shiftMinutes(shift({ breakMinutes: 8 * 60 }))).toThrow()
  })
})

describe('phân loại giờ tăng ca theo LOẠI NGÀY', () => {
  it('ngày thường: trong giờ chuẩn là giờ thường', () => {
    expect(splitMinutes(shift(), DEFAULT_RATES)).toEqual({
      worked: 480,
      otNormal: 0,
      otRest: 0,
      otHoliday: 0,
    })
  })

  it('ngày thường: phần vượt giờ chuẩn mới là tăng ca', () => {
    expect(splitMinutes(shift({ endMinute: 18 * 60 }), DEFAULT_RATES)).toEqual({
      worked: 480,
      otNormal: 120,
      otRest: 0,
      otHoliday: 0,
    })
  })

  it('ngày nghỉ: TOÀN BỘ giờ hưởng 200%, kể cả giờ đầu tiên', () => {
    expect(splitMinutes(shift({ dayKind: 'nghi' }), DEFAULT_RATES)).toEqual({
      worked: 0,
      otNormal: 0,
      otRest: 480,
      otHoliday: 0,
    })
  })

  it('ngày lễ: TOÀN BỘ giờ hưởng 300%', () => {
    expect(splitMinutes(shift({ dayKind: 'le' }), DEFAULT_RATES)).toEqual({
      worked: 0,
      otNormal: 0,
      otRest: 0,
      otHoliday: 480,
    })
  })

  it('ca 6 tiếng Chủ nhật đắt hơn ca 9 tiếng ngày thường', () => {
    const sunday = splitMinutes(
      shift({ endMinute: 14 * 60, dayKind: 'nghi' }),
      DEFAULT_RATES,
    )
    const weekday = splitMinutes(shift({ endMinute: 17 * 60 }), DEFAULT_RATES)

    const pay = (m: ReturnType<typeof splitMinutes>) =>
      computePayrollLine({ employee: HOURLY, minutes: m, rates: DEFAULT_RATES }).grossPayVnd

    expect(pay(sunday)).toBeGreaterThan(pay(weekday))
  })

  it('cộng nhiều ca lại', () => {
    const week = sumSplits([
      splitMinutes(shift(), DEFAULT_RATES),
      splitMinutes(shift({ endMinute: 18 * 60 }), DEFAULT_RATES),
      splitMinutes(shift({ dayKind: 'nghi' }), DEFAULT_RATES),
    ])
    expect(week).toEqual({ worked: 960, otNormal: 120, otRest: 480, otHoliday: 0 })
  })
})

describe('đơn giá giờ', () => {
  it('trả theo giờ thì lấy thẳng đơn giá', () => {
    expect(hourlyRateOf(HOURLY, DEFAULT_RATES)).toBe(30_000)
  })

  it('trả theo tháng thì quy đổi qua giờ chuẩn tháng', () => {
    const monthly: EmployeePay = {
      payKind: 'monthly',
      hourlyRateVnd: 0,
      monthlySalaryVnd: 10_400_000,
      fixedAllowanceVnd: 0,
    }
    // 10.400.000 / 208 giờ = 50.000₫/giờ
    expect(hourlyRateOf(monthly, DEFAULT_RATES)).toBe(50_000)
  })
})

describe('dòng lương', () => {
  it('trả theo giờ: công × đơn giá, tăng ca theo hệ số', () => {
    const line = computePayrollLine({
      employee: { ...HOURLY, fixedAllowanceVnd: 500_000 },
      minutes: { worked: 20 * 60, otNormal: 4 * 60, otRest: 8 * 60, otHoliday: 0 },
      rates: DEFAULT_RATES,
    })

    expect(line.basePayVnd).toBe(600_000) // 20g × 30.000
    expect(line.overtimePayVnd).toBe(180_000 + 480_000) // 4g×45.000 + 8g×60.000
    expect(line.allowanceVnd).toBe(500_000)
    expect(line.grossPayVnd).toBe(600_000 + 660_000 + 500_000)
  })

  it('các dòng cộng lại đúng bằng tổng — phiếu lương phải khớp từng đồng', () => {
    const line = computePayrollLine({
      employee: { ...HOURLY, hourlyRateVnd: 33_333, fixedAllowanceVnd: 123_456 },
      minutes: { worked: 187, otNormal: 43, otRest: 17, otHoliday: 5 },
      rates: DEFAULT_RATES,
      bonusVnd: 77_777,
    })

    expect(line.grossPayVnd).toBe(
      line.basePayVnd + line.overtimePayVnd + line.allowanceVnd + line.bonusVnd,
    )
    expect(line.netPayVnd).toBe(
      line.grossPayVnd - line.insuranceVnd - line.taxVnd - line.advanceVnd,
    )
  })

  it('lương tháng trả đủ, tăng ca cộng thêm theo đơn giá quy đổi', () => {
    const line = computePayrollLine({
      employee: {
        payKind: 'monthly',
        hourlyRateVnd: 0,
        monthlySalaryVnd: 10_400_000,
        fixedAllowanceVnd: 0,
      },
      minutes: { worked: 200 * 60, otNormal: 10 * 60, otRest: 0, otHoliday: 0 },
      rates: DEFAULT_RATES,
    })
    expect(line.basePayVnd).toBe(10_400_000)
    expect(line.overtimePayVnd).toBe(10 * 50_000 * 1.5)
  })

  it('bảo hiểm tính trên LƯƠNG CƠ BẢN, không trên tiền tăng ca', () => {
    const withOt = computePayrollLine({
      employee: HOURLY,
      minutes: { worked: 20 * 60, otNormal: 10 * 60, otRest: 0, otHoliday: 0 },
      rates: DEFAULT_RATES,
    })
    const withoutOt = computePayrollLine({
      employee: HOURLY,
      minutes: { worked: 20 * 60, otNormal: 0, otRest: 0, otHoliday: 0 },
      rates: DEFAULT_RATES,
    })
    expect(withOt.insuranceVnd).toBe(withoutOt.insuranceVnd)
    expect(withOt.insuranceVnd).toBe(Math.round(600_000 * 0.105))
  })

  it('TNCN mặc định 0 vì chưa cấu hình biểu thuế — không phải miễn thuế', () => {
    const line = computePayrollLine({
      employee: HOURLY,
      minutes: { worked: 200 * 60, otNormal: 0, otRest: 0, otHoliday: 0 },
      rates: DEFAULT_RATES,
    })
    expect(line.taxVnd).toBe(0)
  })

  it('bật tỉ lệ tạm khấu trừ thì trừ trên thu nhập sau bảo hiểm', () => {
    const line = computePayrollLine({
      employee: HOURLY,
      minutes: { worked: 100 * 60, otNormal: 0, otRest: 0, otHoliday: 0 },
      rates: { ...DEFAULT_RATES, pitWithhold: 0.1 },
    })
    // gộp 3.000.000 − bảo hiểm 315.000 = 2.685.000 × 10%
    expect(line.taxVnd).toBe(268_500)
  })

  it('tạm ứng vượt lương ra thực lãnh ÂM, không bị kẹp về 0', () => {
    const line = computePayrollLine({
      employee: HOURLY,
      minutes: { worked: 10 * 60, otNormal: 0, otRest: 0, otHoliday: 0 },
      rates: DEFAULT_RATES,
      advanceVnd: 1_000_000,
    })
    expect(line.netPayVnd).toBeLessThan(0)
  })

  it('không đi làm ngày nào: lương giờ ra 0, lương tháng vẫn đủ', () => {
    const none = { worked: 0, otNormal: 0, otRest: 0, otHoliday: 0 }
    expect(computePayrollLine({ employee: HOURLY, minutes: none, rates: DEFAULT_RATES }).grossPayVnd)
      .toBe(0)
    expect(
      computePayrollLine({
        employee: {
          payKind: 'monthly',
          hourlyRateVnd: 0,
          monthlySalaryVnd: 10_400_000,
          fixedAllowanceVnd: 0,
        },
        minutes: none,
        rates: DEFAULT_RATES,
      }).grossPayVnd,
    ).toBe(10_400_000)
  })
})

describe('hiển thị giờ', () => {
  it('in ra giờ và phút, không in số thập phân', () => {
    expect(formatMinutes(480)).toBe('8g')
    expect(formatMinutes(510)).toBe('8g30')
    expect(formatMinutes(485)).toBe('8g05')
    expect(formatMinutes(0)).toBe('0g')
  })
})
