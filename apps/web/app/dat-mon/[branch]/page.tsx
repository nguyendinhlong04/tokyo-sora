import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { apiGet, type OnlineMenu } from '../../../lib/api'
import { MenuBoard } from './MenuBoard'

interface PageProps {
  params: Promise<{ branch: string }>
}

async function loadMenu(branchId: string): Promise<OnlineMenu | null> {
  return apiGet<OnlineMenu>(`/api/online/menu?branch=${encodeURIComponent(branchId)}`).catch(
    () => null,
  )
}

/**
 * Title địa phương hoá theo đúng §23.1.3 — trang chi nhánh phải khác hẳn W2 để
 * không trùng lặp nội dung, và để nút đặt món hiện được trên kết quả tìm kiếm.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { branch } = await params
  const menu = await loadMenu(branch)
  if (!menu) return { title: 'Đặt món online — Tokyo Sora' }

  return {
    title: `Đặt món online Tokyo Sora ${menu.branch.name} — giao tận nơi`,
    description: `Thực đơn giao hàng và mang về của Tokyo Sora ${menu.branch.name}: bò nướng than hoa, hải sản, món ăn kèm. ${menu.branch.address ?? ''}`.trim(),
    alternates: { canonical: `/dat-mon/${branch}` },
  }
}

/** O2 — thực đơn online của chi nhánh. Trang này ĐƯỢC index */
export default async function BranchMenuPage({ params }: PageProps) {
  const { branch } = await params
  const menu = await loadMenu(branch)
  if (!menu) notFound()

  /**
   * Dữ liệu có cấu trúc cho Google: thực đơn + hành động đặt món. Điều kiện để
   * nút đặt hiện ngay trên kết quả tìm kiếm (§23.1.4).
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: `Tokyo Sora ${menu.branch.name}`,
    address: menu.branch.address ?? undefined,
    telephone: menu.branch.phone ?? undefined,
    servesCuisine: 'Nhật Bản · nướng than',
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: menu.categories
        .map((category) => ({
          '@type': 'MenuSection',
          name: category.nameVi,
          hasMenuItem: menu.dishes
            .filter((d) => d.categoryId === category.id)
            .map((d) => ({
              '@type': 'MenuItem',
              name: d.nameVi,
              description: d.shortDesc ?? undefined,
              offers: { '@type': 'Offer', price: d.price, priceCurrency: 'VND' },
            })),
        }))
        .filter((section) => section.hasMenuItem.length > 0),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD do chính máy chủ dựng từ danh mục, không có nội dung người dùng nhập
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MenuBoard menu={menu} />
    </>
  )
}
