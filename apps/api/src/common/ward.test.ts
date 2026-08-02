import { describe, expect, it } from 'vitest'
import { foldWard, wardMatches } from './ward'

describe('Chuẩn hoá tên phường', () => {
  it('bỏ dấu và hạ chữ', () => {
    expect(foldWard('Phường Dịch Vọng')).toBe('phuong dich vong')
    expect(foldWard('  Mai   Dịch ')).toBe('mai dich')
  })

  it('KHÔNG cắt chữ nào khỏi tên', () => {
    // "Quan Hoa" là tên phường thật — cắt chữ "quan" là biến nó thành "hoa"
    expect(foldWard('Quan Hoa')).toBe('quan hoa')
  })
})

describe('Khớp phường khách gõ với phường đã khai', () => {
  it('khớp khi gõ đúng tên', () => {
    expect(wardMatches('Dịch Vọng', 'dich vong')).toBe(true)
    expect(wardMatches('Quan Hoa', 'Quan Hoa')).toBe(true)
  })

  it('bỏ qua tiền tố hành chính khách quen viết', () => {
    expect(wardMatches('Dịch Vọng', 'Phường Dịch Vọng')).toBe(true)
    expect(wardMatches('Đông Ngạc', 'Xã Đông Ngạc')).toBe(true)
  })

  it('không nhầm hai phường khác nhau', () => {
    expect(wardMatches('Quan Hoa', 'Nghĩa Hoà')).toBe(false)
    expect(wardMatches('Dịch Vọng', 'Dịch Vọng Hậu')).toBe(false)
    // Tiền tố chỉ bỏ ở vế khách gõ, không bỏ ở vế đã khai
    expect(wardMatches('Quan Hoa', 'hoa')).toBe(false)
  })
})
