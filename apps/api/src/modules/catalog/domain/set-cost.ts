/**
 * M11 — dải giá vốn min–max của một set.
 *
 * Set không có công thức của mình (M4 chặn lưu công thức cho set): giá vốn của nó
 * là giá vốn của những món khách THẬT SỰ chọn. Nên một set có nhóm "chọn 4 trong
 * 10" không có MỘT con số giá vốn — nó có một DẢI, và khoảng cách giữa hai đầu dải
 * chính là rủi ro của người định giá set.
 *
 * Ví dụ của §24: chặng "chọn 4 trong 10" mà 10 loại bò trải từ ba chỉ 18.000₫ tới
 * dẻ sườn 46.000₫ mỗi phần thì riêng chặng đó đã lệch 112.000₫ giữa khách gọi rẻ
 * nhất và khách gọi đắt nhất. Bán một giá cho cả hai là chuyện bình thường; không
 * biết mình đang bán cái gì mới là chuyện phải sửa.
 *
 * KHÁCH ĐƯỢC CHỌN TRÙNG. `explodeSet` cho phép chọn hai phần cùng một loại bò
 * trong nhóm "chọn 4 trong 10", nên đầu đắt nhất của dải là **4 lần món đắt nhất**
 * chứ không phải "4 món đắt nhất khác nhau". Tính theo cách sau sẽ cho một trần
 * thấp hơn thực tế, và trần sai thì cả dải vô nghĩa.
 */

import type { SetDefinition } from '../../kitchen/domain/explode'

export interface SetCourseCostRange {
  groupId: string
  label: string
  pickCount: number | null
  minVnd: number
  maxVnd: number
}

export interface SetCostRange {
  minVnd: number
  maxVnd: number
  /**
   * Món thành phần chưa khai công thức. Dải ở trên chỉ đọc được khi danh sách này
   * rỗng — coi món chưa có công thức là 0₫ sẽ kéo đáy dải xuống một cách giả tạo.
   */
  unknownDishIds: string[]
  courses: SetCourseCostRange[]
}

/**
 * `costOf` trả giá vốn một PHẦN của món thành phần, đồng nguyên; null = chưa khai
 * công thức. Truyền vào thay vì tra bảng ở đây để hàm này không cần biết CSDL.
 */
export function setCostRange(
  def: SetDefinition,
  costOf: (dishId: string) => number | null,
): SetCostRange {
  const unknown = new Set<string>()
  const courses: SetCourseCostRange[] = []

  for (const group of def.groups) {
    const priced = group.items.map((item) => {
      const cost = costOf(item.dishId)
      if (cost === null) unknown.add(item.dishId)
      return (cost ?? 0) * item.qty
    })

    if (priced.length === 0) {
      courses.push({ groupId: group.id, label: group.label, pickCount: group.pickCount, minVnd: 0, maxVnd: 0 })
      continue
    }

    // Nhóm cố định: lấy hết, không có dải — đáy bằng trần
    const fixed = group.pickCount === null
    const total = priced.reduce((sum, c) => sum + c, 0)

    courses.push({
      groupId: group.id,
      label: group.label,
      pickCount: group.pickCount,
      minVnd: fixed ? total : group.pickCount! * Math.min(...priced),
      maxVnd: fixed ? total : group.pickCount! * Math.max(...priced),
    })
  }

  return {
    minVnd: courses.reduce((sum, c) => sum + c.minVnd, 0),
    maxVnd: courses.reduce((sum, c) => sum + c.maxVnd, 0),
    unknownDishIds: [...unknown],
    courses,
  }
}
