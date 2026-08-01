import { describe, expect, it } from 'vitest'
import { businessDateOf, displayPeriodOf, startOfBusinessDay } from './business-date'

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

describe('Mốc 00:00 của ngày làm việc', () => {
  it('nửa đêm Hà Nội là 17:00 UTC hôm trước', () => {
    expect(startOfBusinessDay('2026-08-02', HANOI).toISOString()).toBe('2026-08-01T17:00:00.000Z')
  })

  it('cộng phút vào mốc này ra đúng giờ treo tường của chi nhánh', () => {
    // 11:30 giờ Hà Nội = 04:30 UTC
    const at = new Date(startOfBusinessDay('2026-08-02', HANOI).getTime() + (11 * 60 + 30) * 60_000)
    expect(at.toISOString()).toBe('2026-08-02T04:30:00.000Z')
  })

  it('múi giờ khác cho mốc khác — không dính giờ máy chủ', () => {
    expect(startOfBusinessDay('2026-08-02', 'UTC').toISOString()).toBe('2026-08-02T00:00:00.000Z')
    expect(startOfBusinessDay('2026-08-02', 'Asia/Tokyo').toISOString()).toBe(
      '2026-08-01T15:00:00.000Z',
    )
  })

  it('múi giờ có đổi giờ mùa hè vẫn ra đúng nửa đêm địa phương', () => {
    // New York mùa hè là UTC-4
    expect(startOfBusinessDay('2026-08-02', 'America/New_York').toISOString()).toBe(
      '2026-08-02T04:00:00.000Z',
    )
    // Mùa đông là UTC-5
    expect(startOfBusinessDay('2026-01-02', 'America/New_York').toISOString()).toBe(
      '2026-01-02T05:00:00.000Z',
    )
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
