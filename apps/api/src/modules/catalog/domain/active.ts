/**
 * Món có đang bán ở một chi nhánh không (M1: "Đang bán trên toàn chuỗi" và "Tắt ở
 * chi nhánh này"; §5 kiến trúc đa chi nhánh — "có bán không" ghi đè được theo chi
 * nhánh).
 *
 * Chỗ DUY NHẤT nói thứ tự ưu tiên của cờ `active`. Cửa gọi món chung
 * (`OrderingService.addOneLine` — tại bàn, POS, web, đơn sàn nhập tay) chặn bằng
 * hàm này; thực đơn O2, bundle cấu hình và Office (M1 · M11) đọc cờ từ đây. Trước
 * đây thực đơn và bundle ẩn món còn cửa gọi món không soi cờ nào: giỏ cũ hay lệnh
 * gọi thẳng vẫn tạo dòng đơn và vé bếp cho món chi nhánh không bán.
 */

/** Cờ `active` của `dishes` — "Đang bán trên toàn chuỗi" */
export interface DishActiveFlag {
  active: boolean
}

/** Cờ `active` của `dish_branch_overrides` — NULL là theo cấp chuỗi */
export interface BranchActiveFlag {
  active: boolean | null
}

/**
 * Chuỗi ngừng bán là ngừng ở MỌI chi nhánh; ghi đè chi nhánh chỉ tắt thêm được,
 * không bán lại. Ngược với cờ bán online (`onlineVisibleOf`), nơi chi nhánh được bật
 * riêng: đó là chọn món cho thực đơn web, còn đây là có bán món này hay không.
 *
 * - M1 chỉ ghi `false` hoặc NULL vào ghi đè ("Tắt ở chi nhánh này" ↔ bỏ tắt). Ghi
 *   đè `true` chỉ đến từ lệnh gọi thẳng hay dữ liệu cũ, không màn nào hiện nó — nó
 *   không được lặng lẽ giữ một món chuỗi đã ngừng trên thực đơn của một chi nhánh.
 * - Trang thương hiệu (W2 · W3) không có chi nhánh nên chỉ đọc cờ chuỗi; quy tắc
 *   này giữ nó cùng kết luận với thực đơn từng chi nhánh.
 */
export function activeOf(
  dish: DishActiveFlag,
  branch: BranchActiveFlag | null | undefined,
): boolean {
  return dish.active && branch?.active !== false
}
