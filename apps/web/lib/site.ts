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

/**
 * Một phường website giao được tới — nguồn gợi ý cho ô địa chỉ ở hero W1.
 *
 * Gợi ý lấy từ chính bảng vùng giao chứ không từ dịch vụ bản đồ nào: phường nào
 * hiện ra trong danh sách là phường CHẮC CHẮN giao được. Phí và thời gian thì
 * KHÔNG mang về đây — hero không hiện chúng nữa, và màn giỏ tự tra lại từ
 * `/api/online/quote` theo đúng chi nhánh khách sẽ đặt.
 */
export interface SiteWard {
  name: string
  /** Chi nhánh của vùng giao chứa phường này — chọn phường là đã chọn xong chi nhánh */
  branchId: string
}

/** Một cột "độ cắt" trên W3 */
export interface SiteDishCut {
  name: string
  size: string
  desc: string
  /** Độ mềm 1–4, vẽ thành thanh đo bốn ô */
  soft: number
  imageUrl: string | null
}

export interface SiteDishCondiment {
  kanji: string
  name: string
  desc: string
}

/**
 * Phần biên tập của trang chi tiết món, nhập ở Office M1 · Món và set.
 *
 * Mọi trường rỗng được và W3 lùi dần theo đúng thứ tự đó: thiếu một khối thì bỏ
 * khối, thiếu cả bản ghi thì dựng bản gọn. Nhờ vậy thêm một món mới vào danh mục
 * không bao giờ làm trang web gãy — chỉ là trang gọn hơn cho tới khi bếp kể.
 */
export interface SiteDishStory {
  chapterNo: string | null
  portionLabel: string | null
  nameJaFull: string | null
  intro: string | null
  note: string | null
  craft: string | null
  footerImageUrl: string | null
  bannerJa: string | null
  bannerVi: string | null
  closing: string | null
  pairingDishIds: string[] | null
  origin: string | null
  originKanji: string | null
  originImageUrl: string | null
  flavours: string[] | null
  cutsLabel: string | null
  cuts: SiteDishCut[] | null
  fire: string | null
  fireImageUrl: string | null
  dip: string | null
  dipImageUrl: string | null
  condiments: SiteDishCondiment[] | null
  serves: string | null
  duration: string | null
  flow: string[] | null
  extraDishIds: string[] | null
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
  /** Ảnh món; null thì mọi chỗ vẽ ô chữ kana như trước khi có bộ ảnh */
  imageUrl: string | null
  story: SiteDishStory | null
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

/** W8 — bài viết do A8 soạn. Bài đầu danh sách là bài mới nhất. */
export interface SitePost {
  id: number
  title: string
  category: string
  excerpt: string | null
  /** YYYY-MM-DD như A8 lưu; trang tin tự định dạng lại */
  publishedOn: string
}

/**
 * W1 — một khung nền của hero trang chủ, xếp ở Office A8.
 *
 * Danh sách rỗng là trạng thái BÌNH THƯỜNG, không phải lỗi: trang chủ lùi về ảnh
 * của năm món ký như trước khi A8 có màn này.
 */
export interface SiteHeroImage {
  id: number
  imageUrl: string
  /** Video chiếu đè lên ảnh; null là khung ảnh tĩnh. Ảnh thành ảnh chờ của video. */
  videoUrl: string | null
  /** Chữ lớn của hero, chỗ trước đây in tên món. Bỏ trống thì trang chủ in tên quán. */
  caption: string | null
  captionJa: string | null
  /**
   * Điểm của tấm ảnh phải nằm giữa khung khi hero lên điện thoại, tính bằng %
   * bề ngang và bề cao của chính nó. Đặt ở A8, chỉ áp dưới 1024 — xem `HomeHero`.
   */
  mobileFocusX: number
  mobileFocusY: number
}

/** W9 — vị trí đang tuyển. `branchName` null nghĩa là tuyển cho cả ba chi nhánh. */
export interface SiteJob {
  id: number
  title: string
  branchName: string | null
  employment: string
  slots: number
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

export function getWards(): Promise<SiteWard[]> {
  return siteGet<SiteWard[]>('/api/site/wards', [])
}

export function getPosts(): Promise<SitePost[]> {
  return siteGet<SitePost[]>('/api/site/posts', [])
}

export function getJobs(): Promise<SiteJob[]> {
  return siteGet<SiteJob[]>('/api/site/jobs', [])
}

export function getHeroImages(): Promise<SiteHeroImage[]> {
  return siteGet<SiteHeroImage[]>('/api/site/hero', [])
}

// ------------------------------------------------------------------ tiện ích

/** '2026-07-12' → '12.07.2026' — cách trang tin vẫn hiển thị ngày */
export function formatPostDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

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
 * Món dùng kèm: ưu tiên bộ do bếp chọn tay ở Office M1, món nào không có thì bù
 * bằng đồ uống và món lạnh — vẫn ra đủ ba gợi ý thay vì để trống một khối.
 */
export function pairingsFor(menu: SiteMenu, dish: SiteDish, count = 3): SiteDish[] {
  const curated = (dish.story?.pairingDishIds ?? [])
    .map((id) => findDish(menu, id))
    .filter((d): d is SiteDish => d !== undefined)

  const fallback = menu.dishes.filter(
    (d) => d.id !== dish.id && (d.kind === 'drink' || d.categoryId === 'tuoi'),
  )

  return [...curated, ...fallback]
    .filter((d, i, all) => d.id !== dish.id && all.findIndex((x) => x.id === d.id) === i)
    .slice(0, count)
}
