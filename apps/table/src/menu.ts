import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, type Dish, type ModifierGroup } from './api'

/** Bộ lọc T5 — đúng năm điều kiện của bản thiết kế */
export interface Filters {
  chay: boolean
  khongCay: boolean
  khongHaiSan: boolean
  duoi200: boolean
  conHang: boolean
}

export const NO_FILTERS: Filters = {
  chay: false,
  khongCay: false,
  khongHaiSan: false,
  duoi200: false,
  conHang: false,
}

export const FILTER_LABELS: { key: keyof Filters; label: string }[] = [
  { key: 'chay', label: 'Chay' },
  { key: 'khongCay', label: 'Không cay' },
  { key: 'khongHaiSan', label: 'Không hải sản' },
  { key: 'duoi200', label: 'Dưới 200k' },
  { key: 'conHang', label: 'Đang có sẵn' },
]

/** Nhãn chặng trong nhóm — dữ liệu là mã ngắn, chữ hiển thị nằm ở đây */
export const SUB_LABELS: Record<string, { name: string; kanji: string }> = {
  beef: { name: 'Bò', kanji: '牛' },
  pork: { name: 'Heo', kanji: '豚' },
  sea: { name: 'Hải sản', kanji: '海' },
  veg: { name: 'Rau · nấm', kanji: '野' },
}

/**
 * Thực đơn của bàn = bundle cấu hình + danh sách món hết.
 *
 * Hai nguồn tách nhau có chủ ý: bundle đổi vài lần một tuần và cache theo ETag,
 * còn 86 đổi vài lần một ca. Trộn chung thì mỗi lần bếp báo hết một món là mọi
 * máy tải lại cả thực đơn.
 */
export function useMenu(branchId: string) {
  const config = useQuery({
    queryKey: ['config', branchId],
    queryFn: () => api.config(branchId),
    staleTime: 5 * 60_000,
  })

  const availability = useQuery({
    queryKey: ['availability', branchId],
    queryFn: () => api.availability(branchId),
    refetchInterval: 20_000,
  })

  /**
   * Món coi như HẾT gồm cả "còn N phần" đã tụt về 0.
   *
   * Máy chủ vẫn để trạng thái `limited` khi phần cuối được gọi — nó chỉ đổi khi
   * bếp bấm. Chỉ lọc theo `sold_out` thì món hết sạch vẫn hiện bình thường,
   * khách chọn xong bấm gửi bếp mới nhận lỗi từ chối.
   */
  const soldOut = useMemo(
    () =>
      new Set(
        (availability.data ?? [])
          .filter((a) => a.status === 'sold_out' || (a.remaining ?? 0) <= 0)
          .map((a) => a.dishId),
      ),
    [availability.data],
  )

  /** Còn mấy phần — chỉ cho món đang ở chế độ "còn N" và vẫn còn hàng */
  const remainingOf = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of availability.data ?? []) {
      if (row.status === 'limited' && (row.remaining ?? 0) > 0) map.set(row.dishId, row.remaining!)
    }
    return map
  }, [availability.data])

  // Món tắt "cho gọi trên Sora Table" ở Office thì khách không thấy — có món chỉ
  // bán tại quầy hoặc chỉ phục vụ khi nhân viên tư vấn.
  const dishes = useMemo(
    () => (config.data?.dishes ?? []).filter((d) => d.tableOrderable),
    [config.data],
  )

  const modifiers = useMemo(
    () => new Map((config.data?.modifiers ?? []).map((g) => [g.id, g])),
    [config.data],
  )

  return {
    branch: config.data?.branch ?? null,
    categories: config.data?.categories ?? [],
    dishes,
    soldOut,
    remainingOf,
    /** Nhóm tuỳ chọn của một món, đúng thứ tự đã khai trong danh mục */
    groupsOf: (dish: Dish): ModifierGroup[] =>
      dish.modifierGroupIds
        .map((id) => modifiers.get(id))
        .filter((g): g is ModifierGroup => g !== undefined),
    isPending: config.isPending,
    isError: config.isError,
    refetch: () => void config.refetch(),
  }
}

/** Món có nhóm bắt buộc thì nút + phải mở chi tiết, không thêm thẳng vào giỏ */
export function needsChoice(groups: ModifierGroup[]): boolean {
  return groups.some((g) => g.required)
}

export function applyFilters(
  dishes: Dish[],
  filters: Filters,
  soldOut: Set<string>,
): Dish[] {
  return dishes.filter((d) => {
    const tags = d.tags ?? []
    if (filters.chay && !tags.includes('chay')) return false
    if (filters.khongCay && tags.includes('cay')) return false
    // Hải sản đọc từ CẢ tag lẫn bảng dị ứng: khách lọc vì dị ứng chứ không vì
    // sở thích, sót một món ở đây là chuyện sức khoẻ.
    if (
      filters.khongHaiSan &&
      (tags.includes('hai-san') || (d.allergens ?? []).some((a) => a.toLowerCase().includes('hải sản')))
    ) {
      return false
    }
    if (filters.duoi200 && d.price >= 200_000) return false
    if (filters.conHang && soldOut.has(d.id)) return false
    return true
  })
}

export function countActive(filters: Filters): number {
  return Object.values(filters).filter(Boolean).length
}

/**
 * Bỏ dấu để "bo ba chi" tìm ra "Bò ba chỉ" — gõ có dấu trên điện thoại giữa bữa
 * ăn là việc không ai muốn làm.
 */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toLowerCase()
    .trim()
}

export function matches(dish: Dish, query: string): boolean {
  const needle = fold(query)
  if (!needle) return false
  return [dish.nameVi, dish.nameJa, dish.kana, dish.shortDesc]
    .filter((v): v is string => Boolean(v))
    .some((v) => fold(v).includes(needle))
}
