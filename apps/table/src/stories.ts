import type { DishStory, SiteMenuDish, SiteMenuSet } from '@sora/contracts'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, type Dish } from './api'
import { needsChoice, type SetExtra, type useMenu } from './menu'

export interface Stories {
  storyOf: (dishId: string) => DishStory | null
  siteDish: (dishId: string) => SiteMenuDish | undefined
  setOf: (dishId: string) => SiteMenuSet | undefined
}

/**
 * Phần kể chuyện của món cho nút "Bí quyết thưởng thức".
 *
 * Cùng luật với trang thực đơn của web: món CÓ bản ghi giới thiệu (Office M1)
 * mới có trang kể — món Nướng chủ lực và các set; món còn lại web chỉ dựng bản
 * gọn từ tên và giá. Ở bàn cũng vậy: không có bản ghi thì không có nút, thay vì
 * mở ra một hộp gần như trống.
 *
 * Giữ nửa tiếng: bài viết đổi theo tuần chứ không theo ca. Đọc lỗi thì chỉ là
 * không có nút — gọi món không phụ thuộc vào đây.
 */
export function useStories(): Stories {
  const site = useQuery({
    queryKey: ['site-menu'],
    queryFn: () => api.siteMenu(),
    staleTime: 30 * 60_000,
  })

  return useMemo(() => {
    const dishes = new Map((site.data?.dishes ?? []).map((d) => [d.id, d]))
    const sets = new Map((site.data?.sets ?? []).map((s) => [s.setDishId, s]))
    return {
      storyOf: (dishId) => dishes.get(dishId)?.story ?? null,
      siteDish: (dishId) => dishes.get(dishId),
      setOf: (dishId) => sets.get(dishId),
    }
  }, [site.data])
}

/**
 * Món mời gọi kèm ở cuối "Bí quyết": set thì là món gọi thêm cho vừa miệng,
 * món lẻ thì là món dùng kèm bếp chọn tay. Chỉ giữ món GỌI ĐƯỢC ngay tại bàn —
 * mời rồi chặn ở nút là hứa suông.
 */
export function storyMore(
  dish: Dish,
  story: DishStory,
  menu: ReturnType<typeof useMenu>,
): SetExtra[] {
  if (dish.kind === 'set') return menu.extrasOf(dish)
  const byId = new Map(menu.dishes.map((d) => [d.id, d]))
  return (story.pairingDishIds ?? [])
    .map((id) => byId.get(id))
    .filter((d): d is Dish => d !== undefined && d.id !== dish.id && !menu.soldOut.has(d.id))
    .map((d) => ({ dish: d, needsChoice: needsChoice(menu.groupsOf(d)) }))
}
