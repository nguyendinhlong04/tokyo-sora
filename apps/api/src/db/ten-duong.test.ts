import { describe, expect, it } from 'vitest'
import { donTenDuong, gopDuong } from './ten-duong'

describe('Chuẩn hoá tên đường lấy từ OSM', () => {
  it('viết hoa chữ đang thường hoàn toàn', () => {
    // Ba tên có thật trong dữ liệu OSM của TP Hà Tĩnh, đo ngày 11-08-2026
    expect(donTenDuong('ngõ 10 xuân diệu')).toBe('Ngõ 10 Xuân Diệu')
    expect(donTenDuong('Trân thị hường')).toBe('Trân Thị Hường')
  })

  it('không đụng vào tên đã viết đúng', () => {
    expect(donTenDuong('Hàm Nghi')).toBe('Hàm Nghi')
    expect(donTenDuong('26 Tháng 3')).toBe('26 Tháng 3')
  })

  it('giữ nguyên mã tuyến viết hoa', () => {
    // Hạ cả chuỗi rồi viết hoa lại sẽ ra "Ql1a"
    expect(donTenDuong('QL1A')).toBe('QL1A')
    expect(donTenDuong('ĐT550')).toBe('ĐT550')
  })

  it('cắt tiền tố chỉ loại đường để hai cách khai gộp làm một', () => {
    expect(donTenDuong('Đường Đào Tấn')).toBe('Đào Tấn')
    expect(donTenDuong('đường Nguyễn Biên')).toBe('Nguyễn Biên')
    expect(donTenDuong('Phố Hàm Nghi')).toBe('Hàm Nghi')
  })

  it('KHÔNG cắt "Ngõ" — nó nằm trong tên thật', () => {
    expect(donTenDuong('Ngõ 42 Trần Phú')).toBe('Ngõ 42 Trần Phú')
  })

  it('gộp khoảng trắng thừa', () => {
    expect(donTenDuong('  Hàm   Nghi ')).toBe('Hàm Nghi')
  })

  it('bỏ tên không còn gì đáng lưu', () => {
    expect(donTenDuong('')).toBeNull()
    expect(donTenDuong('   ')).toBeNull()
    expect(donTenDuong('Đường ')).toBeNull()
  })
})

describe('Gộp các đoạn của cùng một con đường', () => {
  const doan = (name: string, lat: number, lon: number) => ({ tags: { name }, center: { lat, lon } })

  it('nhiều đoạn cùng tên về một dòng, toạ độ lấy điểm giữa', () => {
    const rows = gopDuong([doan('Hàm Nghi', 18.34, 105.89), doan('Hàm Nghi', 18.36, 105.91)])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('Hàm Nghi')
    expect(rows[0]?.lat).toBeCloseTo(18.35, 6)
    expect(rows[0]?.lng).toBeCloseTo(105.9, 6)
  })

  it('gộp cả khi OSM khai một phố bằng hai cách viết', () => {
    // Cùng con đường: một đoạn khai chữ thường, một đoạn thừa tiền tố "Đường"
    const rows = gopDuong([
      doan('Hàm Nghi', 18.34, 105.89),
      doan('hàm nghi', 18.34, 105.89),
      doan('Đường Hàm Nghi', 18.34, 105.89),
    ])
    expect(rows).toHaveLength(1)
  })

  it('giữ hai con đường khác tên tách nhau', () => {
    const rows = gopDuong([doan('Hàm Nghi', 18.34, 105.89), doan('Trần Phú', 18.35, 105.9)])
    expect(rows.map((r) => r.name).sort()).toEqual(['Hàm Nghi', 'Trần Phú'])
  })

  it('bỏ đoạn thiếu tên hoặc thiếu toạ độ', () => {
    const rows = gopDuong([
      { tags: { name: 'Hàm Nghi' } }, // out center không trả về tâm
      { center: { lat: 18.34, lon: 105.89 } }, // đoạn không tên
      doan('Trần Phú', 18.35, 105.9),
    ])
    expect(rows.map((r) => r.name)).toEqual(['Trần Phú'])
  })
})
