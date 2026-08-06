import { describe, expect, it } from 'vitest'
import { clientIp, isInsideBranch } from './presence'

const QUAN = '203.0.113.10'
const NHA = '198.51.100.7'
const VERCEL = '76.76.21.1'

describe('Lấy địa chỉ thật của máy khách', () => {
  it('chưa đo số chặng thì không kết luận gì — đóng chặt', () => {
    expect(clientIp(`${QUAN}`, 0)).toBeNull()
  })

  it('không có thông tin chuyển tiếp thì không kết luận gì', () => {
    expect(clientIp(undefined, 1)).toBeNull()
  })

  it('một chặng: lấy phần tử cuối', () => {
    expect(clientIp(`${QUAN}`, 1)).toBe(QUAN)
  })

  it('hai chặng: lấy phần tử áp cuối', () => {
    expect(clientIp(`${QUAN}, ${VERCEL}`, 2)).toBe(QUAN)
  })

  /**
   * Đây là test quan trọng nhất của cả lớp 2.
   *
   * Kẻ ngồi ở nhà tự khai mình đang ở địa chỉ của quán. Phần khai đó nằm ở ĐẦU
   * danh sách. Nếu hàm này lấy phần tử đầu thì họ đi thẳng vào bàn của người
   * khác, và toàn bộ thiết kế sụp ở đúng chỗ nó dựa vào nhiều nhất.
   */
  it('bỏ qua phần địa chỉ do máy khách tự khai', () => {
    const giaMao = `${QUAN}, ${NHA}, ${VERCEL}`
    expect(clientIp(giaMao, 2)).toBe(NHA)
    expect(clientIp(giaMao, 2)).not.toBe(QUAN)
  })

  it('kẻ giả mạo khai thật nhiều địa chỉ cũng không đẩy được địa chỉ quán vào chỗ tin cậy', () => {
    const nhoi = `${QUAN}, ${QUAN}, ${QUAN}, ${NHA}, ${VERCEL}`
    expect(clientIp(nhoi, 2)).toBe(NHA)
  })

  it('chuỗi ngắn hơn số chặng đã khai thì không kết luận — có thể ai đó gọi thẳng vào API', () => {
    expect(clientIp(`${QUAN}`, 2)).toBeNull()
  })

  it('bỏ qua phần tử rỗng do khoảng trắng thừa', () => {
    expect(clientIp(`${NHA}, , ${VERCEL}`, 2)).toBe(NHA)
  })
})

/**
 * Ghi lại phép đo trên bản triển khai thật (06-08-2026) thành test chạy được.
 *
 * Vercel xoá phần `x-forwarded-for` do máy khách gửi lên rồi ghi lại bằng địa chỉ
 * nó nhìn thấy, nên chuỗi luôn đúng một phần tử. Nếu ngày nào đó hạ tầng đổi cách
 * làm, chính test này là chỗ nhắc phải đo lại.
 */
describe('Hình dạng thật của chuỗi chuyển tiếp trên Vercel', () => {
  const HOPS_DA_DO = 1

  it('chuỗi một phần tử → lấy đúng địa chỉ thật của khách', () => {
    expect(clientIp('14.167.9.225', HOPS_DA_DO)).toBe('14.167.9.225')
  })

  it('khách tự khai địa chỉ quán cũng vô ích vì Vercel đã ghi đè trước khi tới đây', () => {
    // Đây là chuỗi thực tế nhận được khi gửi kèm "X-Forwarded-For: 203.0.113.99"
    expect(clientIp('14.167.9.225', HOPS_DA_DO)).not.toBe('203.0.113.99')
  })

  it('nếu hạ tầng đổi sang NỐI THÊM thay vì ghi đè thì vẫn lấy đúng phần tử cuối', () => {
    expect(clientIp('203.0.113.99, 14.167.9.225', HOPS_DA_DO)).toBe('14.167.9.225')
  })
})

describe('Địa chỉ có thuộc đường mạng của quán không', () => {
  it('khớp đúng địa chỉ đã khai', () => {
    expect(isInsideBranch(QUAN, [QUAN])).toBe(true)
  })

  it('địa chỉ khác thì không', () => {
    expect(isInsideBranch(NHA, [QUAN])).toBe(false)
  })

  it('không biết địa chỉ thì không', () => {
    expect(isInsideBranch(null, [QUAN])).toBe(false)
  })

  it('chưa khai đường mạng nào thì không ai được coi là ở trong quán', () => {
    expect(isInsideBranch(QUAN, [])).toBe(false)
  })

  it('IPv4 bọc trong IPv6 vẫn khớp với chính nó', () => {
    expect(isInsideBranch(`::ffff:${QUAN}`, [QUAN])).toBe(true)
  })

  it('IPv6 viết hoa hay thường đều là một máy', () => {
    expect(isInsideBranch('2001:DB8::1', ['2001:db8::1'])).toBe(true)
  })
})
