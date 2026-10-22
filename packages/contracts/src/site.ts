/**
 * Thực đơn công khai `GET /api/site/menu` — Sora Web dựng trang món (W2 · W3 ·
 * W7) từ đây, Sora Table đọc lại phần kể chuyện cho nút "Bí quyết thưởng thức".
 *
 * Chỉ khai kiểu, không có zod schema: API trả thẳng hàng trong CSDL chứ không
 * đi qua bước kiểm nào, nên một schema ở đây là hứa một lần kiểm không ai chạy.
 */

/** Một độ cắt của món nướng: tên, quy cách, lời tả, độ mềm 1–4 */
export interface DishStoryCut {
  name: string
  size: string
  desc: string
  soft: number
  imageUrl: string | null
}

/** Một gợi ý gia vị: chữ Nhật trong vòng tròn, tên, một dòng giải thích */
export interface DishStoryCondiment {
  kanji: string
  name: string
  desc: string
}

/**
 * Phần biên tập của trang món, nhập ở Office M1. Mọi trường rỗng được — nơi đọc
 * thiếu khối nào thì bỏ khối đó. Món chưa được kể thì không có bản ghi nào.
 */
export interface DishStory {
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
  cuts: DishStoryCut[] | null
  fire: string | null
  fireImageUrl: string | null
  dip: string | null
  dipImageUrl: string | null
  condiments: DishStoryCondiment[] | null
  serves: string | null
  duration: string | null
  flow: string[] | null
  extraDishIds: string[] | null
}

export interface SiteMenuDish {
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
  /** Giá gốc của danh mục — chưa áp ghi đè chi nhánh, giá bán thật nằm ở bundle */
  price: number
  signature: boolean
  onlineVisible: boolean
  imageUrl: string | null
  story: DishStory | null
}

/** Chặng của set kèm chữ Nhật trang trí — bundle cấu hình không mang chữ này */
export interface SiteMenuSet {
  setDishId: string
  courses: {
    label: string
    kanji: string | null
    items: { dishId: string; qty: number; portionLabel: string | null }[]
  }[]
}

export interface SiteMenu {
  categories: { id: string; nameVi: string; nameEn: string | null; kanji: string | null }[]
  dishes: SiteMenuDish[]
  sets: SiteMenuSet[]
}

/**
 * Một khung hero xếp ở Office A8: `GET /api/site/hero` cho trang chủ, thêm
 * `?surface=table` cho màn chờ quảng cáo của iPad tại bàn (§9.1b) — hai mặt bật
 * bằng hai cờ riêng.
 */
export interface SiteHeroFrame {
  id: number
  /** Bắt buộc kể cả khung video: là ảnh chờ lúc phim tải và ảnh thay khi phim hỏng */
  imageUrl: string
  /** Null là khung ảnh tĩnh */
  videoUrl: string | null
  caption: string | null
  captionJa: string | null
  /** Điểm giữ lại giữa khung khi khung dựng đứng, tính bằng % của tấm ảnh */
  mobileFocusX: number
  mobileFocusY: number
}
