import { describe, expect, it } from 'vitest'
import {
  addDays,
  bucketOf,
  canChangeDue,
  checkSubmit,
  datesBetween,
  dueMinuteOf,
  isOverdue,
  isoWeekday,
  nextState,
  occursOn,
  sortMine,
} from './tasks'

describe('Lịch của việc định kỳ', () => {
  it('thứ theo ISO — 22/10/2026 là thứ Năm, 25/10 là Chủ nhật', () => {
    expect(isoWeekday('2026-10-22')).toBe(4)
    expect(isoWeekday('2026-10-25')).toBe(7)
    expect(isoWeekday('2026-10-26')).toBe(1)
  })

  it('cộng ngày qua cuối tháng, cuối năm', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(datesBetween('2026-10-21', '2026-10-23')).toEqual([
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ])
    expect(datesBetween('2026-10-23', '2026-10-21')).toEqual([])
  })

  it('hằng tuần chỉ rơi đúng thứ; hằng tháng đúng ngày; chưa tới ngày bắt đầu thì không', () => {
    const weekly = {
      recurrence: 'hang-tuan' as const,
      weekday: 1,
      monthDay: null,
      startsOn: '2026-10-01',
    }
    expect(occursOn(weekly, '2026-10-26')).toBe(true)
    expect(occursOn(weekly, '2026-10-27')).toBe(false)

    const monthly = {
      recurrence: 'hang-thang' as const,
      weekday: null,
      monthDay: 1,
      startsOn: '2026-10-01',
    }
    expect(occursOn(monthly, '2026-11-01')).toBe(true)
    expect(occursOn(monthly, '2026-11-02')).toBe(false)

    const daily = {
      recurrence: 'hang-ngay' as const,
      weekday: null,
      monthDay: null,
      startsOn: '2026-10-22',
    }
    expect(occursOn(daily, '2026-10-21')).toBe(false)
    expect(occursOn(daily, '2026-10-22')).toBe(true)
  })

  it('theo ca để trống hạn = giờ kết ca; có hạn riêng thì theo hạn riêng', () => {
    const shift = { endMinute: 23 * 60 }
    expect(dueMinuteOf({ recurrence: 'theo-ca', dueMinute: null }, shift)).toBe(23 * 60)
    expect(dueMinuteOf({ recurrence: 'theo-ca', dueMinute: 10 * 60 }, shift)).toBe(10 * 60)
    expect(dueMinuteOf({ recurrence: 'hang-ngay', dueMinute: 11 * 60 }, null)).toBe(11 * 60)
    expect(dueMinuteOf({ recurrence: 'theo-ca', dueMinute: null }, null)).toBeNull()
  })
})

describe('Vòng đời một việc', () => {
  it('nộp: có người nghiệm thu thì chờ, không có thì xong luôn', () => {
    expect(nextState('open', 'submit', true)).toEqual({ ok: true, state: 'submitted' })
    expect(nextState('open', 'submit', false)).toEqual({ ok: true, state: 'done' })
    expect(nextState('submitted', 'submit', true)).toMatchObject({
      ok: false,
      code: 'task_not_open',
    })
  })

  it('nghiệm thu: đạt thì xong, trả lại thì về đang làm — chỉ từ "chờ nghiệm thu"', () => {
    expect(nextState('submitted', 'accept', true)).toEqual({ ok: true, state: 'done' })
    expect(nextState('submitted', 'return', true)).toEqual({ ok: true, state: 'open' })
    expect(nextState('open', 'accept', true)).toMatchObject({ code: 'task_not_submitted' })
    expect(nextState('done', 'return', true)).toMatchObject({ code: 'task_not_submitted' })
  })

  it('huỷ được việc đang làm hoặc chờ nghiệm thu; việc đã đóng thì không', () => {
    expect(nextState('open', 'cancel', false)).toEqual({ ok: true, state: 'cancelled' })
    expect(nextState('submitted', 'cancel', true)).toEqual({ ok: true, state: 'cancelled' })
    expect(nextState('done', 'cancel', true)).toMatchObject({ code: 'task_closed' })
    expect(nextState('cancelled', 'cancel', true)).toMatchObject({ code: 'task_closed' })
  })

  it('còn mục chưa tích thì phải ghi lý do', () => {
    expect(checkSubmit(0, null)).toEqual({ ok: true })
    expect(checkSubmit(2, null)).toMatchObject({ ok: false, code: 'checklist_incomplete' })
    expect(checkSubmit(2, '   ')).toMatchObject({ ok: false, code: 'checklist_incomplete' })
    expect(checkSubmit(2, 'Bình chữa cháy mang đi nạp')).toEqual({ ok: true })
  })
})

describe('Hạn và quá hạn', () => {
  const now = new Date('2026-10-22T10:00:00Z')

  it('quá hạn chỉ tính việc đang làm — đã nộp chờ nghiệm thu thì không', () => {
    const due = new Date('2026-10-22T09:00:00Z')
    expect(isOverdue({ state: 'open', dueAt: due }, now)).toBe(true)
    expect(isOverdue({ state: 'submitted', dueAt: due }, now)).toBe(false)
    expect(isOverdue({ state: 'done', dueAt: due }, now)).toBe(false)
  })

  it('việc đã quá hạn không dời hạn được; việc chưa quá hạn dời được về tương lai', () => {
    const overdue = { state: 'open' as const, dueAt: new Date('2026-10-22T09:00:00Z') }
    expect(canChangeDue(overdue, new Date('2026-10-23T09:00:00Z'), now)).toMatchObject({
      code: 'task_overdue_due_locked',
    })
    // Gửi lại đúng hạn cũ (form lưu các ô khác) thì không sao
    expect(canChangeDue(overdue, overdue.dueAt, now)).toEqual({ ok: true })

    const upcoming = { state: 'open' as const, dueAt: new Date('2026-10-22T12:00:00Z') }
    expect(canChangeDue(upcoming, new Date('2026-10-23T12:00:00Z'), now)).toEqual({ ok: true })
    expect(canChangeDue(upcoming, new Date('2026-10-22T08:00:00Z'), now)).toMatchObject({
      code: 'task_due_past',
    })
  })

  it('sắp việc: quá hạn → hôm nay → sắp tới; cùng nhóm thì gấp trước, hạn sớm trước', () => {
    const endOfToday = new Date('2026-10-22T17:00:00Z')
    const t = (id: number, due: string, priority = 'thuong') => ({
      id,
      state: 'open' as const,
      dueAt: new Date(due),
      priority,
    })
    const sorted = sortMine(
      [
        t(1, '2026-10-23T05:00:00Z'),
        t(2, '2026-10-22T15:00:00Z'),
        t(3, '2026-10-22T14:00:00Z', 'gap'),
        t(4, '2026-10-22T08:00:00Z'),
        t(5, '2026-10-22T12:00:00Z'),
      ],
      now,
      endOfToday,
    )
    expect(sorted.map((x) => x.id)).toEqual([4, 3, 5, 2, 1])
    expect(bucketOf(sorted[0]!, now, endOfToday)).toBe('qua-han')
    expect(bucketOf(sorted[4]!, now, endOfToday)).toBe('sap-toi')
  })
})
