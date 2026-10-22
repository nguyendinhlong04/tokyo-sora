import { forgetCachedImage, optimizedSrc, pickWidth } from '@sora/ui/image'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from './api'
import { DISH_IMAGES } from './components/DishArt'
import { useServiceWorkerControlled } from './pwa'

/** Bản thực đơn đã tải sẵn ảnh trong lần mở app này — mỗi bản một lượt */
let warmedVersion: string | null = null

/** Ít luồng: iPad đang chiếu quảng cáo, đường mạng của quán còn cho máy khác dùng */
const LANES = 3

/**
 * Tải sẵn ảnh thực đơn của bundle đang phát hành vào bộ đệm service worker (§8 quy
 * tắc 5) — chạy ở màn chờ, lúc bàn trống, để khách mở nhóm nào cũng có ảnh ngay, kể
 * cả khi mạng quán chập chờn giữa bữa.
 *
 * Chỉ tải đúng tấm `srcset` của lưới, chi tiết món và "Bí quyết" sẽ đòi ở màn này
 * (`pickWidth`). Tải bằng `Image()` chứ không `fetch`: phản hồi khác gốc không đọc
 * được mã lỗi, phải giải mã mới biết tấm có hỏng — hỏng thì xoá khỏi bộ đệm.
 */
export function useWarmMenuImages(branchId: string | undefined) {
  const controlled = useServiceWorkerControlled()
  const config = useQuery({
    // Cùng khoá với thực đơn (`useMenu`): khách mở bàn là bundle đã nằm sẵn
    queryKey: ['config', branchId],
    queryFn: () => api.config(branchId!),
    enabled: Boolean(branchId),
    staleTime: 5 * 60_000,
    // Office phát hành ảnh mới giữa ngày thì lượt chờ sau tải tiếp
    refetchInterval: 10 * 60_000,
  })
  const bundle = config.data

  useEffect(() => {
    if (!controlled || !bundle || warmedVersion === bundle.version) return
    const urls = new Set<string>()
    for (const dish of bundle.dishes) {
      if (!dish.tableOrderable || !dish.imageUrl) continue
      for (const spec of Object.values(DISH_IMAGES)) {
        urls.add(optimizedSrc(dish.imageUrl, pickWidth(spec.widths, spec.px)))
      }
    }

    // Khách chạm vào giữa chừng thì dừng; lượt chờ sau đi tiếp, tấm đã có lấy từ bộ đệm
    let stopped = false
    const queue = [...urls]
    const lane = async () => {
      for (let url = queue.shift(); url && !stopped; url = queue.shift()) await warm(url)
    }
    void Promise.all(Array.from({ length: LANES }, lane)).then(() => {
      if (!stopped) warmedVersion = bundle.version
    })
    return () => {
      stopped = true
    }
  }, [controlled, bundle])
}

function warm(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => {
      resolve()
      void forgetCachedImage(url).catch(() => undefined)
    }
    img.src = url
  })
}
