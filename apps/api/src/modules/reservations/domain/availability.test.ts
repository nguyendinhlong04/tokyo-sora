import { describe, expect, it } from 'vitest'
import {
  buildReservationSlots,
  checkReservationSlot,
  mealMinutesFor,
  parseOpenHours,
  type Booking,
  type SlotRules,
} from './availability'

/** 30 phút một khung · bữa 90/120 phút · dọn 15 phút · đặt trước tối thiểu 60 phút */
const RULES: SlotRules = {
  stepMinutes: 30,
  mealMinutesSmall: 90,
  mealMinutesLarge: 120,
  turnBufferMinutes: 15,
  leadMinutes: 60,
}

const hm = (hour: number, minute = 0) => hour * 60 + minute
const booking = (from: number, minutes: number): Booking => ({
  startMinute: from,
  endMinute: from + minutes,
})

describe('Đọc giờ mở cửa của chi nhánh', () => {
  it('tách hai ca trưa và tối', () => {
    expect(parseOpenHours('11:00–14:00 · 17:00–23:00')).toEqual([
      { openMinute: 660, closeMinute: 840 },
      { openMinute: 1020, closeMinute: 1380 },
    ])
  })

  it('chấp cả gạch ngang thường lẫn dấu phẩy', () => {
    expect(parseOpenHours('17:00-23:30')).toEqual([{ openMinute: 1020, closeMinute: 1410 }])
    expect(parseOpenHours('11:00–14:00, 17:00–22:00')).toHaveLength(2)
  })

  it('ca vắt qua nửa đêm được cộng sang ngày hôm sau', () => {
    expect(parseOpenHours('17:00–00:30')).toEqual([{ openMinute: 1020, closeMinute: 1470 }])
  })

  it('chuỗi rỗng hoặc không đọc được thì không có ca nào', () => {
    expect(parseOpenHours(null)).toEqual([])
    expect(parseOpenHours('mở cả ngày')).toEqual([])
  })
})

describe('Thời lượng bữa theo số khách', () => {
  it('nhóm tới ba người tính 90 phút, từ bốn người tính 120 phút', () => {
    expect(mealMinutesFor(2, RULES)).toBe(90)
    expect(mealMinutesFor(3, RULES)).toBe(90)
    expect(mealMinutesFor(4, RULES)).toBe(120)
    expect(mealMinutesFor(10, RULES)).toBe(120)
  })
})

describe('Lưới khung giờ đặt bàn', () => {
  const base = {
    windows: parseOpenHours('17:00–23:00'),
    nowMinute: null,
    guestCount: 2,
    capacity: 3,
    existing: [] as Booking[],
    rules: RULES,
  }

  it('suất cuối phải kết thúc trước giờ đóng cửa', () => {
    const small = buildReservationSlots(base)
    expect(small[0]!.label).toBe('17:00')
    // 23:00 − 90 phút → suất cuối 21:30
    expect(small.at(-1)!.label).toBe('21:30')

    const large = buildReservationSlots({ ...base, guestCount: 6 })
    // Nhóm 6 ăn 120 phút → suất cuối lùi về 21:00
    expect(large.at(-1)!.label).toBe('21:00')
  })

  it('mỗi ca mở cửa cho ra một dải khung riêng', () => {
    const slots = buildReservationSlots({
      ...base,
      windows: parseOpenHours('11:00–14:00 · 17:00–23:00'),
    })
    expect(slots.map((s) => s.label)).toContain('11:00')
    expect(slots.map((s) => s.label)).toContain('12:30')
    // 14:00 − 90 phút → ca trưa dừng ở 12:30, không có 13:00
    expect(slots.map((s) => s.label)).not.toContain('13:00')
    expect(slots.map((s) => s.label)).toContain('17:00')
  })

  it('khung kín khi số suất chồng lấn đạt sức chứa', () => {
    const slots = buildReservationSlots({
      ...base,
      capacity: 2,
      // Hai nhóm ngồi 19:00, chiếm tới 20:45 (90 + 15 phút dọn)
      existing: [booking(hm(19), 105), booking(hm(19), 105)],
    })

    const at1900 = slots.find((s) => s.label === '19:00')!
    expect(at1900.taken).toBe(2)
    expect(at1900.open).toBe(false)
    expect(at1900.closedReason).toBe('full')

    // 20:30 vẫn chồng lấn (suất cũ tới 20:45) nên cũng kín
    expect(slots.find((s) => s.label === '20:30')!.open).toBe(false)
    // 21:00 thì bàn đã dọn xong
    expect(slots.find((s) => s.label === '21:00')!.open).toBe(true)
  })

  it('suất chạm mép nhau không tính là chồng lấn', () => {
    const slots = buildReservationSlots({
      ...base,
      capacity: 1,
      existing: [booking(hm(17), 105)],
    })
    // Suất cũ hết đúng 18:45; khung 18:30 còn chồng, khung 19:00 thì không
    expect(slots.find((s) => s.label === '18:30')!.open).toBe(false)
    expect(slots.find((s) => s.label === '19:00')!.open).toBe(true)
  })

  it('không có chỗ nào đủ sức chứa thì mọi khung đều kín', () => {
    const slots = buildReservationSlots({ ...base, capacity: 0 })
    expect(slots.every((s) => !s.open)).toBe(true)
    expect(slots[0]!.closedReason).toBe('full')
  })

  it('hôm nay: khung đã qua và khung quá gần đều không chọn được', () => {
    const slots = buildReservationSlots({ ...base, nowMinute: hm(18, 10) })
    expect(slots.find((s) => s.label === '17:00')!.closedReason).toBe('past')
    // 18:30 chỉ cách 20 phút, dưới mức đặt trước tối thiểu 60 phút
    expect(slots.find((s) => s.label === '18:30')!.closedReason).toBe('too-soon')
    expect(slots.find((s) => s.label === '19:30')!.open).toBe(true)
  })
})

describe('Kiểm khung khách chọn trước khi ghi', () => {
  const slots = buildReservationSlots({
    windows: parseOpenHours('17:00–23:00'),
    nowMinute: null,
    guestCount: 2,
    capacity: 1,
    existing: [booking(hm(19), 105)],
    rules: RULES,
  })

  it('nhận khung còn trống', () => {
    expect(checkReservationSlot({ minute: hm(17), slots })).toEqual({ ok: true })
  })

  it('từ chối khung vừa bị lấy mất', () => {
    const result = checkReservationSlot({ minute: hm(19), slots })
    expect(result).toMatchObject({ ok: false, code: 'full' })
  })

  it('từ chối mốc giờ không nằm trong lưới', () => {
    const result = checkReservationSlot({ minute: hm(15, 17), slots })
    expect(result).toMatchObject({ ok: false, code: 'outside-hours' })
  })

  it('nói rõ khi chi nhánh không có chỗ đủ sức chứa', () => {
    const noSeat = buildReservationSlots({
      windows: parseOpenHours('17:00–23:00'),
      nowMinute: null,
      guestCount: 12,
      capacity: 0,
      existing: [],
      rules: RULES,
    })
    expect(checkReservationSlot({ minute: hm(17), slots: noSeat })).toMatchObject({
      ok: false,
      code: 'no-seat',
    })
  })
})
