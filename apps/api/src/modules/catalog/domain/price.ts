/**
 * Giá bán một món theo kênh (§18 "giá riêng kênh online"; khai ở M1 và O11).
 *
 * Chỗ DUY NHẤT nói thứ tự ưu tiên giá. Thực đơn online (O2) in giá này, Office
 * hiện giá này, và `CatalogService.dishesByIds` đóng băng đúng giá này vào dòng
 * đơn. Trước đây thực đơn tự viết thứ tự của nó còn đơn web tính theo giá tại
 * quán: khách thấy một số, mã QR đòi một số khác.
 */

/** Hai cột giá của `dishes` */
export interface DishPrices {
  basePrice: number
  onlinePrice: number | null
}

/** Hai cột giá của `dish_branch_overrides` — NULL là theo cấp chuỗi */
export interface BranchPrices {
  price: number | null
  onlinePrice: number | null
}

/**
 * Chỉ đơn web bán theo giá online, vì web là nơi giá đó được in cho khách. Đơn
 * tại bàn, POS và đơn kênh ngoài nhân viên nhập tay (O12) giữ giá tại quán.
 */
export function priceOf(
  dish: DishPrices,
  branch: BranchPrices | null | undefined,
  channel: string,
): number {
  if (channel !== 'web') return branch?.price ?? dish.basePrice
  // Hẹp trước rộng sau: giá online của chi nhánh → giá chung của chi nhánh → giá
  // online cấp chuỗi → giá tại quán
  return branch?.onlinePrice ?? branch?.price ?? dish.onlinePrice ?? dish.basePrice
}
