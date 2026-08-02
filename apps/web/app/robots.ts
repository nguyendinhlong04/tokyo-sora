import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tokyosora.vn'

/**
 * "Trang nào index, trang nào không" (§23.1.3).
 *
 * `/dat-mon/{chi-nhánh}` được index vì nội dung khác hẳn thực đơn chung. Giỏ
 * hàng, thanh toán và trang theo dõi đơn thì không: chúng chứa trạng thái của
 * một người cụ thể và không phải thứ ai đó tìm thấy từ Google.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dat-mon/*/gio',
        '/dat-mon/*/nguoi-nhan',
        '/dat-mon/*/thanh-toan',
        '/dat-mon/don/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
