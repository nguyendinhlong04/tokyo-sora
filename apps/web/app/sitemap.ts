import type { MetadataRoute } from 'next'
import { getBranches, getMenu } from '../lib/site'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokyosora.vn'

/**
 * Sitemap: trang thương hiệu, trang món, và trang đặt món của từng chi nhánh.
 *
 * Giỏ hàng, thanh toán, theo dõi đơn cố ý KHÔNG có mặt — chúng nằm trong danh
 * sách chặn ở robots.ts (§23.1.3).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [menu, branches] = await Promise.all([getMenu(), getBranches()])
  const now = new Date()

  const pages: { path: string; priority: number }[] = [
    { path: '/', priority: 1 },
    { path: '/thuc-don', priority: 0.9 },
    { path: '/dat-ban', priority: 0.9 },
    { path: '/uu-dai', priority: 0.7 },
    { path: '/khong-gian', priority: 0.7 },
    { path: '/ve-chung-toi', priority: 0.6 },
    { path: '/tin-tuc', priority: 0.5 },
    { path: '/lien-he', priority: 0.5 },
    { path: '/dat-mon', priority: 0.8 },
  ]

  return [
    ...pages.map((page) => ({
      url: `${SITE_URL}${page.path}`,
      lastModified: now,
      priority: page.priority,
    })),
    ...branches.map((branch) => ({
      url: `${SITE_URL}/dat-mon/${branch.id}`,
      lastModified: now,
      priority: 0.8,
    })),
    ...menu.dishes.map((dish) => ({
      url: `${SITE_URL}/thuc-don/${dish.id}`,
      lastModified: now,
      priority: dish.signature ? 0.7 : 0.5,
    })),
  ]
}
