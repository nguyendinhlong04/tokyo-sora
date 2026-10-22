import { describe, expect, it } from 'vitest'
import { safeHref } from './links'

describe('safeHref — chỉ mở đường dẫn https', () => {
  it('https thì trả về đường dẫn chuẩn hoá', () => {
    expect(safeHref(' https://drive.example.com/qd-12.pdf ')).toBe(
      'https://drive.example.com/qd-12.pdf',
    )
  })

  it('javascript:, data:, http và chuỗi rác đều bị chặn', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JavaScript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<b>x</b>')).toBeNull()
    expect(safeHref('http://example.com/a.pdf')).toBeNull()
    expect(safeHref('khong-phai-link')).toBeNull()
  })
})
