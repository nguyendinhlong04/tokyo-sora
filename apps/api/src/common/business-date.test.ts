import { describe, expect, it } from 'vitest'
import { businessDateOf, displayPeriodOf } from './business-date'

const HANOI = 'Asia/Ho_Chi_Minh'

describe('Ngày làm việc tính theo múi giờ chi nhánh', () => {
  it('22:00 giờ Hà Nội vẫn là ngày hôm đó dù UTC đã sang hôm trước', () => {
    // 2026-08-01T22:00+07:00 = 2026-08-01T15:00Z
    expect(businessDateOf(new Date('2026-08-01T15:00:00Z'), HANOI)).toBe('2026-08-01')
  })

  it('sau nửa đêm giờ Hà Nội là ngày mới, dù UTC còn hôm trước', () => {
    // 2026-08-02T00:30+07:00 = 2026-08-01T17:30Z
    expect(businessDateOf(new Date('2026-08-01T17:30:00Z'), HANOI)).toBe('2026-08-02')
  })

  it('máy chủ ở múi giờ khác không làm lệch kết quả', () => {
    const at = new Date('2026-08-01T15:00:00Z')
    expect(businessDateOf(at, HANOI)).toBe('2026-08-01')
    expect(businessDateOf(at, 'UTC')).toBe('2026-08-01')
    expect(businessDateOf(at, 'America/New_York')).toBe('2026-08-01')
    // 2026-08-01T15:00Z ở Tokyo là 2026-08-02 00:00
    expect(businessDateOf(at, 'Asia/Tokyo')).toBe('2026-08-02')
  })
})

describe('Phần yyMM của mã hiển thị', () => {
  it('tháng 8 năm 2026 → 2608, khớp ví dụ ON-2608-0417 trong tài liệu', () => {
    expect(displayPeriodOf(new Date('2026-08-01T10:00:00Z'), HANOI)).toBe('2608')
  })

  it('đổi tháng theo giờ chi nhánh', () => {
    // 2026-08-31T18:00Z = 2026-09-01T01:00+07:00
    expect(displayPeriodOf(new Date('2026-08-31T18:00:00Z'), HANOI)).toBe('2609')
  })
})
