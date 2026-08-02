/**
 * B14 — Tích điểm & hạng thành viên. Phần TÍNH, không chạm CSDL.
 *
 * Mọi con số ở đây đến từ Trung tâm tham số A6 (§29.1 nhóm "Tích điểm") và được
 * truyền vào dưới dạng `LoyaltyConfig` — file này cố ý không biết đọc tham số, để
 * cùng một phép tính chạy được cả trong test lẫn trong dịch vụ.
 *
 * Ba quy tắc của §25 B14 nằm trọn trong ba hàm dưới:
 *   · điểm tích từ **tiền thực trả** (đã trừ giảm giá), không từ giá niêm yết;
 *   · đổi điểm có **trần mỗi giao dịch**, và không đổi quá số tiền phải trả;
 *   · hạng theo **chi tiêu 12 tháng trượt**, không theo năm dương lịch.
 */

export interface LoyaltyConfig {
  /** Bao nhiêu đồng thực trả thì được 1 điểm */
  vndPerPoint: number
  /** 1 điểm đổi được bao nhiêu đồng giảm giá */
  vndPerPointRedeem: number
  /** Trần giảm giá bằng điểm cho MỘT giao dịch */
  redeemCapVndPerOrder: number
  /** Điểm hết hạn sau bao nhiêu tháng */
  expiryMonths: number
  tierSilverVnd: number
  tierGoldVnd: number
}

export type Tier = 'dong' | 'bac' | 'vang'

export const TIER_LABELS: Record<Tier, string> = {
  dong: 'Đồng',
  bac: 'Bạc',
  vang: 'Vàng',
}

/**
 * Điểm tích được từ một bill.
 *
 * Làm TRÒN XUỐNG: 95.000đ với tỷ lệ 10.000đ/điểm là 9 điểm, không phải 9,5. Điểm
 * lẻ không tồn tại nên phần dư rơi mất — và rơi về phía quán, đúng hướng an toàn.
 * Tỷ lệ ≤ 0 nghĩa là chương trình chưa cấu hình: không tích, chứ không chia cho 0.
 */
export function pointsEarned(paidVnd: number, config: LoyaltyConfig): number {
  if (config.vndPerPoint <= 0 || paidVnd <= 0) return 0
  return Math.floor(paidVnd / config.vndPerPoint)
}

export interface RedeemPlan {
  points: number
  discountVnd: number
  /** Vì sao không đổi được nhiều hơn; `null` = đổi đủ số khách xin */
  limitedBy: 'so-du' | 'tran-moi-giao-dich' | 'tien-phai-tra' | null
}

/**
 * Đổi điểm ra giảm giá tại quầy.
 *
 * Ba cái trần cùng lúc, lấy cái chặt nhất: số dư khách có · trần mỗi giao dịch
 * (tham số A6) · số tiền còn phải trả. Cái thứ ba dễ quên nhất và cũng tai hại
 * nhất: đổi quá số phải trả là quán nợ tiền khách.
 */
export function planRedemption(
  requestedPoints: number,
  balance: number,
  payableVnd: number,
  config: LoyaltyConfig,
): RedeemPlan {
  const none: RedeemPlan = { points: 0, discountVnd: 0, limitedBy: null }
  if (requestedPoints <= 0 || balance <= 0 || payableVnd <= 0) return none
  if (config.vndPerPointRedeem <= 0) return none

  const capByBalance = balance
  const capByRule = Math.floor(config.redeemCapVndPerOrder / config.vndPerPointRedeem)
  const capByBill = Math.floor(payableVnd / config.vndPerPointRedeem)

  const points = Math.min(requestedPoints, capByBalance, capByRule, capByBill)
  if (points <= 0) return none

  // Ghi lại thứ đã cắt xuống — khách xin đủ thì không có gì để giải thích
  const limitedBy: RedeemPlan['limitedBy'] =
    points === requestedPoints
      ? null
      : points === capByBalance
        ? 'so-du'
        : points === capByRule
          ? 'tran-moi-giao-dich'
          : 'tien-phai-tra'

  return { points, discountVnd: points * config.vndPerPointRedeem, limitedBy }
}

/**
 * Hạng theo chi tiêu 12 tháng TRƯỢT.
 *
 * Trượt nghĩa là cửa sổ luôn tính lùi 12 tháng từ hôm nay, nên khách rơi hạng khi
 * ngừng đến — chứ không giữ hạng Vàng suốt năm sau nhờ một tháng Tết.
 */
export function tierFor(spend12MonthsVnd: number, config: LoyaltyConfig): Tier {
  if (spend12MonthsVnd >= config.tierGoldVnd) return 'vang'
  if (spend12MonthsVnd >= config.tierSilverVnd) return 'bac'
  return 'dong'
}

/** Còn thiếu bao nhiêu tiền nữa thì lên hạng; `null` khi đã ở hạng cao nhất */
export function toNextTier(
  spend12MonthsVnd: number,
  config: LoyaltyConfig,
): { tier: Tier; remainingVnd: number } | null {
  if (spend12MonthsVnd < config.tierSilverVnd) {
    return { tier: 'bac', remainingVnd: config.tierSilverVnd - spend12MonthsVnd }
  }
  if (spend12MonthsVnd < config.tierGoldVnd) {
    return { tier: 'vang', remainingVnd: config.tierGoldVnd - spend12MonthsVnd }
  }
  return null
}

/**
 * Ngày hết hạn của điểm tích hôm nay. Trả về YYYY-MM-DD.
 *
 * Cộng tháng chứ không cộng 365 ngày, và kẹp lại ngày cuối tháng: 31/01 + 12 tháng
 * là 31/01 năm sau, nhưng 31/03 + 11 tháng phải là 28/02 chứ không phải 03/03.
 */
export function pointsExpireOn(earnedOn: string, config: LoyaltyConfig): string {
  const [y, m, d] = earnedOn.split('-').map(Number) as [number, number, number]
  const totalMonths = (m - 1) + config.expiryMonths
  const year = y + Math.floor(totalMonths / 12)
  const month = (totalMonths % 12) + 1
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Che ba số giữa của số điện thoại (§25 B12).
 *
 * Che GIỮA chứ không che đuôi: bốn số cuối là thứ nhân viên đọc để xác nhận đúng
 * người, còn đầu số cho biết nhà mạng. Che mất chúng thì cột SĐT thành vô dụng và
 * người ta sẽ đi tìm số ở chỗ khác.
 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone
  const head = phone.slice(0, phone.length - 7)
  const tail = phone.slice(-4)
  return `${head}***${tail}`
}
