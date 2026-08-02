/**
 * Chi phí & tài sản — phần tính toán của nhóm C.
 *
 * Ba việc, và cả ba đều là chỗ tiền dễ bốc hơi vì làm tròn:
 *   · Chia một phiếu chi trả trước ra nhiều tháng.
 *   · Chia nguyên giá tài sản ra số tháng khấu hao.
 *   · Xếp một phiếu chi vào đúng bậc duyệt theo hạn mức.
 *
 * Quy tắc chung cho hai việc đầu: **tổng các phần LUÔN bằng đúng số gốc**. Chia
 * 10.000.000₫ cho 3 tháng mà mỗi tháng 3.333.333₫ thì mất 1₫, và một đồng lệch ở
 * sổ chi phí là một đồng không đối chiếu được với sổ quỹ.
 */

/** Một tháng chịu chi phí: `month` dạng YYYY-MM-01 */
export interface MonthlySlice {
  month: string
  amountVnd: number
}

export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function addMonths(monthIso: string, count: number): string {
  const year = Number(monthIso.slice(0, 4))
  const month = Number(monthIso.slice(5, 7)) - 1 + count
  const at = new Date(Date.UTC(year, month, 1))
  return at.toISOString().slice(0, 10)
}

/**
 * Chia đều một khoản sang `months` tháng liên tiếp.
 *
 * Phần dư dồn vào tháng CUỐI chứ không rải đều: kế toán đối chiếu phiếu chi với
 * bảng phân bổ theo từng dòng, và một bảng có 5 tháng 1.666.667₫ rồi 1 tháng
 * 1.666.665₫ dễ đọc hơn hẳn một bảng mà mỗi tháng lệch nhau vài đồng không theo
 * quy luật nào.
 */
export function amortize(amountVnd: number, months: number, fromMonth: string): MonthlySlice[] {
  if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
    throw new RangeError(`Số tiền phân bổ phải là số nguyên dương, nhận ${amountVnd}`)
  }
  if (!Number.isSafeInteger(months) || months <= 0) {
    throw new RangeError(`Số tháng phân bổ phải là số nguyên dương, nhận ${months}`)
  }

  const base = Math.floor(amountVnd / months)
  return Array.from({ length: months }, (_, i) => ({
    month: addMonths(firstOfMonth(fromMonth), i),
    // Tháng cuối gánh phần dư — tổng khớp tuyệt đối với số gốc
    amountVnd: i === months - 1 ? amountVnd - base * (months - 1) : base,
  }))
}

/**
 * Khấu hao đường thẳng của một tài sản cho MỘT tháng cụ thể.
 *
 * Trả 0 khi tháng đó nằm ngoài đời khấu hao hoặc tài sản đã thanh lý — nơi gọi
 * dùng số 0 để biết là không ghi bút toán nào, thay vì phải tự tính lại điều kiện.
 */
export function depreciationFor(
  asset: {
    costVnd: number
    inServiceFrom: string
    depreciationMonths: number
    retiredOn?: string | null
  },
  month: string,
): number {
  const target = firstOfMonth(month)
  const start = firstOfMonth(asset.inServiceFrom)
  const index = monthsBetween(start, target)

  if (index < 0 || index >= asset.depreciationMonths) return 0
  if (asset.retiredOn && target >= firstOfMonth(asset.retiredOn)) return 0

  const slices = amortize(asset.costVnd, asset.depreciationMonths, start)
  return slices[index]!.amountVnd
}

export function monthsBetween(from: string, to: string): number {
  const years = Number(to.slice(0, 4)) - Number(from.slice(0, 4))
  return years * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)))
}

/**
 * Bậc duyệt của một phiếu chi (§27, cấu hình ở A6).
 *
 *   ≤ hạn mức chi vặt        → thu ngân / quản lý ca tự ghi, kế toán hậu kiểm
 *   trên hạn mức             → kế toán duyệt
 *   ≥ ngưỡng chủ, hoặc tài sản → chủ duyệt
 */
export type ApprovalTier = 'tu-ghi' | 'ke-toan-duyet' | 'chu-duyet'

export interface ApprovalThresholds {
  /** Hạn mức chi vặt — dưới mức này không cần ai duyệt trước */
  pettyCashVnd: number
  /** Từ mức này trở lên chủ phải duyệt */
  ownerApprovalVnd: number
  /** Mua sắm từ mức này phải ghi thành tài sản, không vào chi phí ngay */
  assetVnd: number
}

export const DEFAULT_THRESHOLDS: ApprovalThresholds = {
  pettyCashVnd: 2_000_000,
  ownerApprovalVnd: 20_000_000,
  assetVnd: 5_000_000,
}

export function approvalTierOf(
  amountVnd: number,
  thresholds: ApprovalThresholds,
  isAsset = false,
): ApprovalTier {
  if (isAsset || amountVnd >= thresholds.ownerApprovalVnd) return 'chu-duyet'
  if (amountVnd <= thresholds.pettyCashVnd) return 'tu-ghi'
  return 'ke-toan-duyet'
}

/**
 * Mua sắm này có phải ghi thành TÀI SẢN không?
 *
 * "Sửa chữa nhỏ dưới ngưỡng vào chi phí ngay ở C2" (§27 C4) — nên câu hỏi chỉ đặt
 * ra với khoản mục thiết bị, không đặt với mọi phiếu chi lớn: trả trước sáu tháng
 * tiền nhà là 60 triệu nhưng không ai khấu hao tiền nhà.
 */
export function needsAssetRecord(
  amountVnd: number,
  pnlLine: string,
  thresholds: ApprovalThresholds,
): boolean {
  return pnlLine === 'depreciation' && amountVnd >= thresholds.assetVnd
}
