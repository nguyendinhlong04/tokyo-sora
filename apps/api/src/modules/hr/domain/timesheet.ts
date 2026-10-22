/**
 * Bảng công — hàm thuần, không đụng Nest hay Drizzle.
 */

/**
 * Ngày CÓ CA mà không có công và không có phép — vắng thật.
 *
 * Chỉ xét ngày ĐÃ QUA: ca hôm nay còn chưa xong, ca tuần sau chưa tới. Gọi chúng
 * là "thiếu công" thì bảng công giữa tháng nào cũng đỏ, và tỉ lệ chuyên cần (KPI)
 * tính trên đó sẽ phạt người vì những ca họ chưa tới lượt làm.
 */
export function missingShiftDays(
  shifts: readonly { workDate: string }[],
  worked: readonly { workDate: string }[],
  leaves: readonly { fromDate: string; toDate: string }[],
  today: string,
): string[] {
  return shifts
    .filter(
      (s) =>
        s.workDate < today &&
        !worked.some((e) => e.workDate === s.workDate) &&
        !leaves.some((l) => l.fromDate <= s.workDate && l.toDate >= s.workDate),
    )
    .map((s) => s.workDate)
}
