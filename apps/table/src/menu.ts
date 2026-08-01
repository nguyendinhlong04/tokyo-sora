import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, type Dish } from './api'

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

  const soldOut = useMemo(
    () =>
      new Set(
        (availability.data ?? []).filter((a) => a.status === 'sold_out').map((a) => a.dishId),
      ),
    [availability.data],
  )

  // Món tắt "cho gọi trên Sora Table" ở Office thì khách không thấy — có món chỉ
  // bán tại quầy hoặc chỉ phục vụ khi nhân viên tư vấn.
  const dishes = useMemo(
    () => (config.data?.dishes ?? []).filter((d) => d.tableOrderable),
    [config.data],
  )

  return {
    branch: config.data?.branch ?? null,
    categories: config.data?.categories ?? [],
    dishes,
    soldOut,
    isPending: config.isPending,
    isError: config.isError,
    refetch: () => void config.refetch(),
  }
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
