import { describe, expect, it } from 'vitest'
import { assertInvoiceSerial, formatInvoiceNo, retryDelayMs, serialForDate } from './serial'

describe('ký hiệu hoá đơn điện tử', () => {
  it('nhận ký hiệu đúng mẫu, chuẩn hoá chữ hoa', () => {
    expect(assertInvoiceSerial('C26MAA')).toBe('C26MAA')
    expect(assertInvoiceSerial(' c26maa ')).toBe('C26MAA')
    expect(assertInvoiceSerial('K27MYY')).toBe('K27MYY')
  })

  it('thiếu chữ M ở ký tự thứ 4 bị chặn — đó là dấu của hoá đơn từ máy tính tiền', () => {
    expect(() => assertInvoiceSerial('C26AAA')).toThrow(/chữ M/)
    expect(() => assertInvoiceSerial('M26AAA')).toThrow(/chữ M/)
  })

  it('sai độ dài, ký tự lạ bị chặn', () => {
    expect(() => assertInvoiceSerial('C26M')).toThrow()
    expect(() => assertInvoiceSerial('C26MAAA')).toThrow()
    expect(() => assertInvoiceSerial('C26-MA')).toThrow()
  })

  it('sai vị trí: không phải C/K, năm không phải số, hai ký tự cuối không phải chữ', () => {
    expect(() => assertInvoiceSerial('T26MAA')).toThrow(/C hoặc K/)
    expect(() => assertInvoiceSerial('C2XMAA')).toThrow(/C hoặc K/)
    expect(() => assertInvoiceSerial('C26M1A')).toThrow(/C hoặc K/)
  })

  it('năm trong ký hiệu đi theo ngày lập hoá đơn', () => {
    expect(serialForDate('C26MAA', '2026-12-31')).toBe('C26MAA')
    expect(serialForDate('C26MAA', '2027-01-01')).toBe('C27MAA')
    expect(serialForDate('k25mba', '2026-03-01')).toBe('K26MBA')
  })
})

describe('số hoá đơn', () => {
  it('8 chữ số, đếm từ 1', () => {
    expect(formatInvoiceNo(1)).toBe('00000001')
    expect(formatInvoiceNo(1000)).toBe('00001000')
    expect(formatInvoiceNo(99_999_999)).toBe('99999999')
  })

  it('ngoài khoảng 1–99.999.999 là lỗi', () => {
    expect(() => formatInvoiceNo(0)).toThrow(RangeError)
    expect(() => formatInvoiceNo(100_000_000)).toThrow(RangeError)
    expect(() => formatInvoiceNo(1.5)).toThrow(RangeError)
  })
})

describe('thử lại hoá đơn chưa lên được', () => {
  it('30 giây, gấp đôi mỗi lần, tối đa một giờ', () => {
    expect(retryDelayMs(0)).toBe(0)
    expect(retryDelayMs(1)).toBe(30_000)
    expect(retryDelayMs(2)).toBe(60_000)
    expect(retryDelayMs(20)).toBe(3_600_000)
  })
})
