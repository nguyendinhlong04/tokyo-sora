import { PAIRINGS } from '../content/site'
import { apiUrl } from './api'

/**
 * Nguồn dữ liệu của website thương hiệu (W1–W9).
 *
 * Web là NGƯỜI ĐỌC của trung tâm sản phẩm — không có bảng món riêng (§18.1).
 * Cache 60 giây đúng bằng cam kết lan truyền của hệ thống: "sự kiện `mon.cap-nhat`
 * làm mới cache mọi kênh trong ≤ 60 giây". Nhờ vậy trang marketing được phục vụ
 * tĩnh (LCP < 2.5s) mà sửa giá ở Office vẫn hiện ra trong vòng một phút.
 */
const REVALIDATE_SECONDS = 60

export interface SiteBranch {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  /** Chuỗi giờ mở như nhân viên gõ ở A10: '11:00–14:00 · 17:00–23:00' */
  openHours: string | null
  areas: string[]
  seats: { total: number; grill: number; standard: number; private: number }
}

export interface SiteDish {
  id: string
  kind: 'dish' | 'set' | 'drink'
  categoryId: string | null
  subCategory: string | null
  nameVi: string
  nameJa: string | null
  kana: string | null
  shortDesc: string | null
  longDesc: string | null
  allergens: string[]
  tags: string[]
  price: number
  signature: boolean
  onlineVisible: boolean
}

export interface SiteCategory {
  id: string
  nameVi: string
  nameEn: string | null
  kanji: string | null
}

export interface SiteSet {
  setDishId: string
  courses: {
    label: string
    kanji: string | null
    items: { dishId: string; qty: number; portionLabel: string | null }[]
  }[]
}

export interface SiteMenu {
  categories: SiteCategory[]
  dishes: SiteDish[]
  sets: SiteSet[]
}

async function siteGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), { next: { revalidate: REVALIDATE_SECONDS } })
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    // Trang marketing không được trắng vì API chậm: dựng phần chữ, bỏ phần dữ liệu
    return fallback
  }
}

export function getMenu(): Promise<SiteMenu> {
  return siteGet<SiteMenu>('/api/site/menu', { categories: [], dishes: [], sets: [] })
}

export function getBranches(): Promise<SiteBranch[]> {
  return siteGet<SiteBranch[]>('/api/site/branches', [])
}

// ------------------------------------------------------------------ tiện ích

/** Nhóm món theo chương thực đơn, giữ đúng thứ tự nhóm và bỏ nhóm rỗng */
export function groupByCategory(menu: SiteMenu) {
  return menu.categories
    .map((category) => ({
      ...category,
      dishes: menu.dishes.filter((d) => d.categoryId === category.id),
    }))
    .filter((group) => group.dishes.length > 0)
}

/**
 * Chia nhóm dài thành chặng nhỏ (Bò · Heo · Hải sản · Rau).
 *
 * "Nhóm > 12 món chia nhóm con" — nhóm Nướng dài tới mức không chia thì khách
 * không lướt nổi.
 */
const SUB_LABELS: Record<string, { name: string; kanji: string }> = {
  beef: { name: 'Bò', kanji: '牛' },
  pork: { name: 'Heo', kanji: '豚' },
  sea: { name: 'Hải sản', kanji: '海' },
  veg: { name: 'Rau · nấm', kanji: '野' },
}

export function splitSubGroups(dishes: SiteDish[]) {
  const keys = [...new Set(dishes.map((d) => d.subCategory ?? ''))]
  return keys.map((key) => ({
    key,
    label: SUB_LABELS[key] ?? null,
    dishes: dishes.filter((d) => (d.subCategory ?? '') === key),
  }))
}

/** Chữ đại diện khi chưa có ảnh thật: kana của món, hoặc chữ đầu tên tiếng Nhật */
export function dishGlyph(dish: Pick<SiteDish, 'kana' | 'nameJa' | 'nameVi'>): string {
  return dish.kana?.trim() || dish.nameJa?.trim().charAt(0) || dish.nameVi.charAt(0)
}

export function findDish(menu: SiteMenu, id: string): SiteDish | undefined {
  return menu.dishes.find((d) => d.id === id)
}

/**
 * Món dùng kèm: ưu tiên bộ do bếp chọn tay, món nào không có thì bù bằng đồ uống
 * và món lạnh — vẫn ra đủ ba gợi ý thay vì để trống một khối.
 */
export function pairingsFor(menu: SiteMenu, dish: SiteDish, count = 3): SiteDish[] {
  const curated = (PAIRINGS[dish.id] ?? [])
    .map((id) => findDish(menu, id))
    .filter((d): d is SiteDish => d !== undefined)

  const fallback = menu.dishes.filter(
    (d) => d.id !== dish.id && (d.kind === 'drink' || d.categoryId === 'tuoi'),
  )

  return [...curated, ...fallback]
    .filter((d, i, all) => d.id !== dish.id && all.findIndex((x) => x.id === d.id) === i)
    .slice(0, count)
}
