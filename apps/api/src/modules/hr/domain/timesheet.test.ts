import { describe, expect, it } from 'vitest'
import { missingShiftDays } from './timesheet'

describe('missingShiftDays — ngày có ca mà vắng', () => {
  const shifts = [
    { workDate: '2026-10-20' },
    { workDate: '2026-10-21' },
    { workDate: '2026-10-22' },
    { workDate: '2026-10-23' },
  ]

  it('ca đã qua không có công là vắng; ca hôm nay và ca tương lai thì chưa', () => {
    expect(missingShiftDays(shifts, [{ workDate: '2026-10-20' }], [], '2026-10-22')).toEqual([
      '2026-10-21',
    ])
  })

  it('ngày nghỉ phép đã duyệt không tính vắng', () => {
    expect(
      missingShiftDays(
        shifts,
        [],
        [{ fromDate: '2026-10-20', toDate: '2026-10-21' }],
        '2026-10-24',
      ),
    ).toEqual(['2026-10-22', '2026-10-23'])
  })
})
