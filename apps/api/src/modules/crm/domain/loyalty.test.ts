import { describe, expect, it } from 'vitest'
import {
  maskPhone,
  planRedemption,
  pointsEarned,
  pointsExpireOn,
  tierFor,
  toNextTier,
  type LoyaltyConfig,
} from './loyalty'

const config: LoyaltyConfig = {
  vndPerPoint: 10_000,
  vndPerPointRedeem: 1_000,
  redeemCapVndPerOrder: 100_000,
  expiryMonths: 12,
  tierSilverVnd: 5_000_000,
  tierGoldVnd: 20_000_000,
}

describe('Tích điểm từ TIỀN THỰC TRẢ', () => {
  it('làm tròn xuống — điểm lẻ không tồn tại', () => {
    expect(pointsEarned(950_000, config)).toBe(95)
    expect(pointsEarned(95_000, config)).toBe(9)
    expect(pointsEarned(9_999, config)).toBe(0)
  })

  it('tỷ lệ chưa cấu hình thì không tích, không chia cho 0', () => {
    expect(pointsEarned(500_000, { ...config, vndPerPoint: 0 })).toBe(0)
  })

  it('bill 0đ hoặc bill hoàn âm không sinh điểm', () => {
    expect(pointsEarned(0, config)).toBe(0)
    expect(pointsEarned(-100_000, config)).toBe(0)
  })
})

describe('Đổi điểm — ba cái trần, lấy cái chặt nhất', () => {
  it('đủ điều kiện thì đổi đúng số khách xin', () => {
    expect(planRedemption(50, 200, 500_000, config)).toEqual({
      points: 50,
      discountVnd: 50_000,
      limitedBy: null,
    })
  })

  it('trần mỗi giao dịch chặn trước cả khi khách còn thừa điểm', () => {
    // Trần 100.000đ ÷ 1.000đ/điểm = 100 điểm, dù khách có 500 điểm
    expect(planRedemption(500, 500, 5_000_000, config)).toEqual({
      points: 100,
      discountVnd: 100_000,
      limitedBy: 'tran-moi-giao-dich',
    })
  })

  it('không đổi quá số tiền phải trả — quán không nợ tiền khách', () => {
    expect(planRedemption(100, 500, 30_000, config)).toEqual({
      points: 30,
      discountVnd: 30_000,
      limitedBy: 'tien-phai-tra',
    })
  })

  it('số dư ít hơn cả hai trần thì số dư là mức chặn', () => {
    expect(planRedemption(80, 12, 500_000, config)).toEqual({
      points: 12,
      discountVnd: 12_000,
      limitedBy: 'so-du',
    })
  })

  it('không có điểm, không xin điểm, hoặc bill đã trả xong thì không sinh gì', () => {
    expect(planRedemption(0, 500, 500_000, config).points).toBe(0)
    expect(planRedemption(50, 0, 500_000, config).points).toBe(0)
    expect(planRedemption(50, 500, 0, config).points).toBe(0)
  })
})

describe('Hạng theo chi tiêu 12 THÁNG TRƯỢT', () => {
  it('ba mốc', () => {
    expect(tierFor(0, config)).toBe('dong')
    expect(tierFor(4_999_999, config)).toBe('dong')
    expect(tierFor(5_000_000, config)).toBe('bac')
    expect(tierFor(19_999_999, config)).toBe('bac')
    expect(tierFor(20_000_000, config)).toBe('vang')
  })

  it('nói được còn thiếu bao nhiêu nữa thì lên hạng', () => {
    expect(toNextTier(1_000_000, config)).toEqual({ tier: 'bac', remainingVnd: 4_000_000 })
    expect(toNextTier(6_000_000, config)).toEqual({ tier: 'vang', remainingVnd: 14_000_000 })
    expect(toNextTier(30_000_000, config)).toBeNull()
  })
})

describe('Hạn điểm — cộng THÁNG, không cộng 365 ngày', () => {
  it('12 tháng sau là cùng ngày năm sau', () => {
    expect(pointsExpireOn('2026-08-02', config)).toBe('2027-08-02')
  })

  it('kẹp về ngày cuối tháng khi tháng đích ngắn hơn', () => {
    expect(pointsExpireOn('2026-03-31', { ...config, expiryMonths: 11 })).toBe('2027-02-28')
    expect(pointsExpireOn('2027-03-31', { ...config, expiryMonths: 11 })).toBe('2028-02-29')
  })

  it('vắt qua năm đúng cả khi số tháng không chia hết cho 12', () => {
    expect(pointsExpireOn('2026-11-15', { ...config, expiryMonths: 3 })).toBe('2027-02-15')
  })
})

describe('Che số điện thoại — che GIỮA, giữ đầu số và bốn số cuối', () => {
  it('số di động 10 chữ số', () => {
    expect(maskPhone('0912345678')).toBe('091***5678')
  })

  it('số ngắn bất thường thì trả nguyên — che nửa vời còn tệ hơn không che', () => {
    expect(maskPhone('12345')).toBe('12345')
  })
})
