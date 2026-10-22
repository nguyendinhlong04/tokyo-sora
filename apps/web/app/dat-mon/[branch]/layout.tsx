import type { ReactNode } from 'react'
import { apiGet, type LivePromotions, type OnlineMenu } from '../../../lib/api'
import { PromotionsProvider } from '../promotions'

/**
 * Khung của một chi nhánh trong luồng đặt món: O2 → O6 dùng chung một bộ khuyến
 * mãi (§9.6).
 *
 * Lấy sẵn chương trình đang chạy khi dựng trang trên máy chủ để lần vẽ đầu đã có
 * giá giảm — không để khách thấy giá gốc rồi giá nhảy xuống trước mắt. Thực đơn
 * cũng lấy ở đây vì giỏ ở O4 · O6 cần biết món thuộc nhóm nào (chương trình theo
 * nhóm món) và hai tham số tính tiền; trang O2 gọi đúng địa chỉ đó nên Next gộp
 * thành một lượt gọi trong cùng lần dựng.
 */
export default async function BranchLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ branch: string }>
}) {
  const { branch } = await params
  const [menu, live] = await Promise.all([
    apiGet<OnlineMenu>(`/api/online/menu?branch=${encodeURIComponent(branch)}`).catch(() => null),
    apiGet<LivePromotions>(`/api/crm/promotions/live?branch=${encodeURIComponent(branch)}`).catch(
      () => null,
    ),
  ])

  return (
    <PromotionsProvider
      branchId={branch}
      initial={live}
      dishes={(menu?.dishes ?? []).map((d) => ({
        id: d.id,
        categoryId: d.categoryId,
        price: d.price,
      }))}
      pricing={menu?.pricing ?? { vatRate: 0, roundingUnit: 1000 }}
    >
      {children}
    </PromotionsProvider>
  )
}
