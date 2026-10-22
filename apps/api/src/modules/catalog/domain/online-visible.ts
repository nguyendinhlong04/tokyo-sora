/**
 * Món có trên thực đơn online của một chi nhánh không (§23.1 "~40 món bán online";
 * cờ cấp chuỗi khai ở M1, cờ chi nhánh ở O11).
 *
 * Chỗ DUY NHẤT nói thứ tự ưu tiên của cờ "bán online". Thực đơn O2 lọc bằng hàm
 * này và cửa nhận đơn web chặn bằng chính nó, nên web hiện món nào thì khách đặt
 * được món đó; Office (M1 · O11 · M11) và bundle cấu hình của chi nhánh cũng đọc
 * cờ từ đây. Trước đây thực đơn đọc ghi đè còn cửa nhận đơn chỉ đọc cờ chuỗi: món
 * chi nhánh bật riêng thì đặt bị từ chối, món chi nhánh tắt thì vẫn đặt được.
 */

/** Cờ `online_visible` của `dishes` */
export interface DishOnlineFlag {
  onlineVisible: boolean
}

/** Cờ `online_visible` của `dish_branch_overrides` — NULL là theo cấp chuỗi */
export interface BranchOnlineFlag {
  onlineVisible: boolean | null
}

/**
 * Cờ chi nhánh đè cờ chuỗi cả hai chiều: bật riêng một món chuỗi đang tắt, hoặc
 * tắt một món vì bếp chi nhánh không kịp đóng gói. Đây là thực đơn của web — đơn
 * kênh ngoài nhập tay (O12) theo thực đơn của sàn, xem `OnlineService.create`.
 */
export function onlineVisibleOf(
  dish: DishOnlineFlag,
  branch: BranchOnlineFlag | null | undefined,
): boolean {
  return branch?.onlineVisible ?? dish.onlineVisible
}
