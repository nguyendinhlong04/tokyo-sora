import { describe, expect, it } from 'vitest'
import { ALL_DAYS, alwaysOnSale, describeSchedule, isOnSale, type SaleSchedule } from './sale-window'

/** 2026-08-03 là thứ Hai, 2026-08-09 là Chủ nhật */
const MONDAY = '2026-08-03'
const FRIDAY = '2026-08-07'
const SUNDAY = '2026-08-09'

const schedule = (patch: Partial<SaleSchedule> = {}): SaleSchedule => ({
  ...alwaysOnSale(),
  ...patch,
})

describe('isOnSale', () => {
  it('không khai gì thì bán mọi lúc', () => {
    expect(isOnSale(alwaysOnSale(), MONDAY, 0)).toBe(true)
    expect(isOnSale(alwaysOnSale(), SUNDAY, 23 * 60)).toBe(true)
  })

  it('giới hạn mùa chặn hai đầu và nhận đúng ngày biên', () => {
    const tetSet = schedule({ saleFrom: '2026-08-05', saleTo: '2026-08-07' })
    expect(isOnSale(tetSet, '2026-08-04', null)).toBe(false)
    expect(isOnSale(tetSet, '2026-08-05', null)).toBe(true)
    expect(isOnSale(tetSet, '2026-08-07', null)).toBe(true)
    expect(isOnSale(tetSet, '2026-08-08', null)).toBe(false)
  })

  it('bitmask thứ tính từ thứ Hai, không phải từ Chủ nhật', () => {
    const monOnly = schedule({ saleDays: 0b000_0001 })
    expect(isOnSale(monOnly, MONDAY, null)).toBe(true)
    expect(isOnSale(monOnly, SUNDAY, null)).toBe(false)

    const sunOnly = schedule({ saleDays: 0b100_0000 })
    expect(isOnSale(sunOnly, SUNDAY, null)).toBe(true)
    expect(isOnSale(sunOnly, MONDAY, null)).toBe(false)
  })

  it('khung giờ đóng ở đầu cuối: 11:00 vào được, 14:00 thì hết suất trưa', () => {
    const lunch = schedule({ saleStartMinute: 11 * 60, saleEndMinute: 14 * 60 })
    expect(isOnSale(lunch, MONDAY, 10 * 60 + 59)).toBe(false)
    expect(isOnSale(lunch, MONDAY, 11 * 60)).toBe(true)
    expect(isOnSale(lunch, MONDAY, 13 * 60 + 59)).toBe(true)
    expect(isOnSale(lunch, MONDAY, 14 * 60)).toBe(false)
  })

  it('người gọi không biết giờ thì chỉ kiểm tới mức ngày', () => {
    const lunch = schedule({ saleStartMinute: 11 * 60, saleEndMinute: 14 * 60 })
    expect(isOnSale(lunch, MONDAY, null)).toBe(true)
  })

  it('mọi điều kiện phải cùng đúng', () => {
    const weekendLunch = schedule({
      saleDays: 0b110_0000,
      saleStartMinute: 11 * 60,
      saleEndMinute: 14 * 60,
    })
    expect(isOnSale(weekendLunch, SUNDAY, 12 * 60)).toBe(true)
    // đúng giờ nhưng sai thứ
    expect(isOnSale(weekendLunch, FRIDAY, 12 * 60)).toBe(false)
    // đúng thứ nhưng sai giờ
    expect(isOnSale(weekendLunch, SUNDAY, 20 * 60)).toBe(false)
  })
})

describe('describeSchedule', () => {
  it('không giới hạn gì thì không nói gì', () => {
    expect(describeSchedule(alwaysOnSale())).toBeNull()
  })

  it('gộp thứ liền nhau thành dải, để lẻ khi chỉ hai ngày', () => {
    expect(describeSchedule(schedule({ saleDays: 0b001_1111 }))).toBe('T2–T6')
    expect(describeSchedule(schedule({ saleDays: 0b110_0000 }))).toBe('T7 · CN')
    expect(describeSchedule(schedule({ saleDays: 0b100_0001 }))).toBe('T2 · CN')
  })

  it('nói đủ ba vế: thứ, giờ, mùa', () => {
    expect(
      describeSchedule(
        schedule({
          saleDays: 0b001_1111,
          saleStartMinute: 11 * 60 + 30,
          saleEndMinute: 14 * 60,
          saleFrom: '2026-12-20',
          saleTo: '2027-02-05',
        }),
      ),
    ).toBe('T2–T6 · 11:30–14:00 · 20/12–05/02')
  })

  it('chỉ một đầu mùa thì nói một đầu', () => {
    expect(describeSchedule(schedule({ saleFrom: '2026-12-20' }))).toBe('từ 20/12')
    expect(describeSchedule(schedule({ saleTo: '2027-02-05' }))).toBe('đến 05/02')
  })

  it('ALL_DAYS là bảy bit, không phải tám', () => {
    expect(ALL_DAYS).toBe(127)
  })
})
