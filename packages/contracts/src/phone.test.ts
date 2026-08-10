import { describe, expect, it } from 'vitest'
import { isPhone, normalizePhone } from './phone'

describe('normalizePhone — một người chỉ ra một chuỗi', () => {
  it.each([
    ['0912345678', '0912345678'],
    ['0912 345 678', '0912345678'],
    ['0912.345.678', '0912345678'],
    ['(091) 234-5678', '0912345678'],
    [' 0912345678 ', '0912345678'],
    // Mọi cách gõ mã nước đều về cùng một dạng với bản gõ số 0 đầu
    ['+84912345678', '0912345678'],
    ['+84 91 234 5678', '0912345678'],
    ['84912345678', '0912345678'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected)
  })

  it('84 ở đầu số nội địa không bị cắt nhầm thành mã nước', () => {
    // 0847123456 bỏ dấu còn 0847123456 — không mở đầu bằng 84 nên yên
    expect(normalizePhone('0847123456')).toBe('0847123456')
    // 8471234567 đúng 10 số, thiếu một số so với số nội địa bỏ 0 đầu → để nguyên
    expect(normalizePhone('8471234567')).toBe('8471234567')
  })

  it('giữ dấu + của số ngoài Việt Nam', () => {
    expect(normalizePhone('+81 90 1234 5678')).toBe('+819012345678')
    expect(normalizePhone('+1 (415) 555-0132')).toBe('+14155550132')
  })
})

describe('isPhone — nhận số Việt Nam 10 chữ số', () => {
  it.each([
    '0912345678', // Vina 091
    '0987654321', // Viettel 098
    '0345678901', // Viettel 034
    '0523456789', // Vietnamobile 052
    '0703456789', // Mobi 070
    '0812345678', // Vina 081
    '0999888777', // Gmobile 099
    '02437824400', // cố định Hà Nội — số thật của chi nhánh Cầu Giấy
    '024 3782 4400', // cùng số, gõ có khoảng trắng
    '02838991120', // cố định TP.HCM — chi nhánh Thảo Điền
    '02363822111', // mã vùng ba số (Đà Nẵng)
    '+84912345678', // cùng số, gõ kiểu mã nước
    '0912 345 678', // có khoảng trắng
  ])('nhận %s', (raw) => {
    expect(isPhone(raw)).toBe(true)
  })

  it.each([
    ['091234567', 'thiếu một số'],
    ['09123456789', 'thừa một số'],
    ['0123456789', '01xx đã bị thu hồi từ 2018'],
    ['0000000000', 'toàn số 0 — không đầu số nào như vậy'],
    ['0212345678', 'cố định phải 11 số, đây mới 10'],
    ['024378244000', 'cố định thừa một số'],
    ['1912345678', 'không mở đầu bằng số 0'],
    ['0512345678', '051 không phải đầu số đang phát hành'],
    ['0712345678', '071 không phải đầu số đang phát hành'],
    ['0802345678', '080 không phải đầu số đang phát hành'],
    ['+84 90 123 456', 'mã nước nhưng thiếu số'],
    ['((((((((', 'toàn dấu ngăn cách'],
    ['', 'để trống'],
    ['   ', 'toàn khoảng trắng'],
    ['+123', 'quá ngắn cho một số quốc tế'],
    ['+1234567890123456', 'quá dài cho một số quốc tế'],
  ])('từ chối %s — %s', (raw) => {
    expect(isPhone(raw)).toBe(false)
  })

  it('vẫn để cửa cho khách nước ngoài', () => {
    expect(isPhone('+81 90 1234 5678')).toBe(true)
    expect(isPhone('+14155550132')).toBe(true)
  })

  it('số đẹp toàn một chữ số vẫn là số thật, không chặn', () => {
    expect(isPhone('0999999999')).toBe(true)
    expect(isPhone('0888888888')).toBe(true)
  })
})
