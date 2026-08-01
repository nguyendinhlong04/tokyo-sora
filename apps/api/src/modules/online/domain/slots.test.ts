import { describe, expect, it } from 'vitest'
import { startOfBusinessDay } from '../../../common/business-date'
import { buildSlots, checkSlot, earliestOpenSlot, slotStart, type SlotOptions } from './slots'

const HANOI = 'Asia/Ho_Chi_Minh'
const DAY_START = startOfBusinessDay('2026-08-02', HANOI)

/** 10:00 → 21:00, bếp cần 30 phút, mỗi khung 4 đơn */
const OPTIONS: SlotOptions = {
  openMinute: 10 * 60,
  lastOrderMinute: 21 * 60,
  leadMinutes: 30,
  capacity: 4,
}

/** Mốc tuyệt đối của một giờ treo tường Hà Nội trong ngày làm việc đó */
const at = (hour: number, minute = 0) =>
  new Date(DAY_START.getTime() + (hour * 60 + minute) * 60_000)

describe('Chia khung 15 phút', () => {
  it('gom mọi mốc trong khung về đầu khung', () => {
    expect(slotStart(at(11, 7), DAY_START).toISOString()).toBe(at(11, 0).toISOString())
    expect(slotStart(at(11, 15), DAY_START).toISOString()).toBe(at(11, 15).toISOString())
    expect(slotStart(at(11, 29), DAY_START).toISOString()).toBe(at(11, 15).toISOString())
  })
})

describe('Bảng khung giờ của một ngày', () => {
  it('trải đủ từ giờ mở tới giờ ngừng nhận', () => {
    const slots = buildSlots({
      now: at(9),
      dayStart: DAY_START,
      takenBySlot: new Map(),
      options: OPTIONS,
    })
    expect(slots).toHaveLength((21 * 60 - 10 * 60) / 15 + 1)
    expect(slots[0]!.at.toISOString()).toBe(at(10).toISOString())
    expect(slots.at(-1)!.at.toISOString()).toBe(at(21).toISOString())
  })

  it('khung quá gần bây giờ bị đóng vì bếp không kịp', () => {
    const slots = buildSlots({
      now: at(12, 0),
      dayStart: DAY_START,
      takenBySlot: new Map(),
      options: OPTIONS,
    })
    const soon = slots.find((s) => s.at.getTime() === at(12, 15).getTime())!
    const ok = slots.find((s) => s.at.getTime() === at(12, 30).getTime())!
    expect(soon.open).toBe(false)
    expect(soon.closedReason).toBe('too-soon')
    expect(ok.open).toBe(true)
  })

  it('khung đã kín trần thì đóng, và nói rõ là kín chứ không phải hết giờ', () => {
    const slots = buildSlots({
      now: at(10),
      dayStart: DAY_START,
      takenBySlot: new Map([[at(19, 0).toISOString(), 4]]),
      options: OPTIONS,
    })
    const full = slots.find((s) => s.at.getTime() === at(19, 0).getTime())!
    expect(full.open).toBe(false)
    expect(full.closedReason).toBe('full')
    expect(full.taken).toBe(4)
  })

  it('đơn nhận ngay lấy khung mở sớm nhất', () => {
    const slots = buildSlots({
      now: at(12, 0),
      dayStart: DAY_START,
      takenBySlot: new Map([[at(12, 30).toISOString(), 4]]),
      options: OPTIONS,
    })
    expect(earliestOpenSlot(slots)!.at.toISOString()).toBe(at(12, 45).toISOString())
  })

  it('kín cả ngày thì không có khung nào để nhận', () => {
    const takenBySlot = new Map(
      buildSlots({ now: at(9), dayStart: DAY_START, takenBySlot: new Map(), options: OPTIONS }).map(
        (s) => [s.at.toISOString(), 4] as const,
      ),
    )
    const slots = buildSlots({ now: at(9), dayStart: DAY_START, takenBySlot, options: OPTIONS })
    expect(earliestOpenSlot(slots)).toBeNull()
  })
})

describe('Kiểm mốc hẹn giờ khách gửi lên', () => {
  const base = { now: at(12, 0), dayStart: DAY_START, taken: 0, options: OPTIONS }

  it('nhận mốc hợp lệ', () => {
    expect(checkSlot({ ...base, slotAt: at(13, 30) })).toEqual({ ok: true })
  })

  it('từ chối mốc lệch khung — 13:07 không phải khung 15 phút', () => {
    const res = checkSlot({ ...base, slotAt: at(13, 7) })
    expect(res).toMatchObject({ ok: false, code: 'not-a-slot' })
  })

  it('từ chối mốc ngoài giờ nhận đơn', () => {
    expect(checkSlot({ ...base, slotAt: at(22, 0) })).toMatchObject({
      ok: false,
      code: 'outside-hours',
    })
    expect(checkSlot({ ...base, slotAt: at(9, 0) })).toMatchObject({
      ok: false,
      code: 'outside-hours',
    })
  })

  it('từ chối mốc bếp không kịp chuẩn bị', () => {
    expect(checkSlot({ ...base, slotAt: at(12, 15) })).toMatchObject({
      ok: false,
      code: 'too-soon',
    })
  })

  /**
   * Chốt chặn thật nằm ở đây chứ không ở màn hình: giữa lúc khách chọn khung và
   * lúc bấm đặt, người khác có thể đã lấp đầy khung đó.
   */
  it('từ chối khi khung vừa kín trong lúc khách còn đang chọn', () => {
    expect(checkSlot({ ...base, slotAt: at(13, 30), taken: 4 })).toMatchObject({
      ok: false,
      code: 'full',
    })
  })
})
