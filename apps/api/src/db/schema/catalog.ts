import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { branches, staff } from './identity'

/**
 * Trạm bếp — seed ST-01…ST-06. Engine coi station là CHUỖI MỞ đọc từ bảng này,
 * không phải enum, để thêm trạm không cần migration kiểu dữ liệu.
 * `ticketPrefix`, `columns`, `kanji`, `color` lấy từ prototype KDS.
 */
export const stations = pgTable('stations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kanji: text('kanji'),
  color: text('color'),
  /** Tiền tố mã vé: ST-06 → 'A', ST-02 → 'B'… (vé A-0412 / B-0412 cùng đơn 0412) */
  ticketPrefix: text('ticket_prefix').notNull(),
  /** Số cột lưới vé trên màn KDS: ST-02 6 cột vé thấp · ST-06 4 cột vé cao */
  columns: integer('columns').notNull().default(5),
  sort: integer('sort').notNull().default(0),
})

/**
 * M10 — Cây danh mục. Không giới hạn cấp: `parentId` trỏ về chính bảng này.
 *
 * Danh mục là CÁCH SẮP THỰC ĐƠN, không phải thứ nghiệp vụ nào chạy theo. Đổi nhóm
 * của một món không đụng tới định tuyến bếp (trạm nằm trên `dishes`), không đụng
 * giá, không đụng công thức — nên kéo thả cả cây lúc đổi mùa là thao tác an toàn.
 *
 * Khoá ngoại tự trỏ giữ cho cây không mồ côi: xoá nhóm còn nhóm con là bị chặn ở
 * CSDL, không chỉ ở tầng dịch vụ. Vòng lặp (A là con của B, B là con của A) thì
 * khoá ngoại không chặn được — kiểm ở `CatalogAdminService.moveCategory`.
 */
export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id').references((): AnyPgColumn => categories.id),
    nameVi: text('name_vi').notNull(),
    nameEn: text('name_en'),
    nameJa: text('name_ja'),
    kanji: text('kanji'),
    /** Ảnh bìa nhóm — trang web và menu online dùng làm ảnh chặng thực đơn */
    imageUrl: text('image_url'),
    /**
     * Kênh hiển thị. Tắt một kênh là cả NHÓM biến mất khỏi kênh đó; món bên trong
     * vẫn giữ nguyên cờ của mình, nên bật lại nhóm là mọi thứ trở về như cũ.
     */
    onlineVisible: boolean('online_visible').notNull().default(true),
    tableVisible: boolean('table_visible').notNull().default(true),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check('categories_not_own_parent', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    index('categories_parent_idx').on(t.parentId, t.sort),
  ],
)

/**
 * Món — khai báo MỘT LẦN ở cấp chuỗi, mọi kênh chỉ đọc.
 *
 * Định tuyến: 4 nhánh trạm đúng như màn cấu hình M6. `routingMethod` chỉ là preset
 * điền 4 cột đó (xem modules/kitchen/domain/routing.ts).
 */
export const dishes = pgTable(
  'dishes',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    kind: text('kind').notNull().default('dish'),
    categoryId: text('category_id').references(() => categories.id),
    /**
     * Chặng nhỏ trong nhóm — nhóm Nướng dài tới mức phải chia Bò / Heo / Hải sản
     * / Rau thì khách mới lướt được. Chuỗi tự do vì đây là cách sắp xếp thực đơn,
     * không phải thứ nghiệp vụ nào tra cứu.
     */
    subCategory: text('sub_category'),
    nameVi: text('name_vi').notNull(),
    nameEn: text('name_en'),
    nameJa: text('name_ja'),
    kana: text('kana'),
    shortDesc: text('short_desc'),
    longDesc: text('long_desc'),
    /**
     * Ảnh món — MỘT ảnh dùng chung cho mọi kênh (web, thực đơn online, thẻ món
     * Table). Cùng lối với `categories.imageUrl`: lưu đường dẫn, không lưu tệp.
     * Bỏ trống thì các kênh vẽ ô chữ kana như trước.
     */
    imageUrl: text('image_url'),
    allergens: text('allergens').array(),
    tags: text('tags').array(),

    routingMethod: text('routing_method'),
    stationGrill: text('station_grill').references(() => stations.id),
    stationNoGrill: text('station_no_grill').references(() => stations.id),
    stationTakeaway: text('station_takeaway').references(() => stations.id),
    stationDelivery: text('station_delivery').references(() => stations.id),
    secondaryStation: text('secondary_station').references(() => stations.id),
    primaryLabel: text('primary_label'),
    secondaryLabel: text('secondary_label'),
    prepSeconds: integer('prep_seconds').notNull().default(300),

    /** Giá bán, VND nguyên */
    basePrice: bigint('base_price', { mode: 'number' }).notNull(),
    /**
     * Giá kênh online (§18 "giá riêng kênh online"). NULL = bán bằng giá tại quán.
     * Tách khỏi `basePrice` vì đơn mang về gánh thêm hộp, túi và công đóng gói,
     * còn đơn giao thì gánh cả phí sàn nếu bán qua kênh ngoài.
     */
    onlinePrice: bigint('online_price', { mode: 'number' }),
    vatCode: text('vat_code').notNull().default('standard'),

    onlineVisible: boolean('online_visible').notNull().default(false),
    tableOrderable: boolean('table_orderable').notNull().default(true),
    /** Món ký của bếp — huy hiệu 名物 trên web (W1/W2/W3) và thẻ món của Table */
    signature: boolean('signature').notNull().default(false),
    active: boolean('active').notNull().default(true),

    /**
     * LỊCH BÁN (§18 "giới hạn ngày · lịch bán"; khai ở M11 nhưng dùng cho mọi món).
     *
     * Khác `active` ở chỗ nó có thời hạn: set Tất niên bật từ 20/12 đến 05/02 rồi
     * tự tắt, còn `active = false` là ngừng bán cho tới khi có người bật lại tay.
     * Khác 86 ở chỗ 86 là chuyện của một ca; lịch bán là quy tắc lặp lại.
     */
    saleFrom: date('sale_from'),
    saleTo: date('sale_to'),
    /** Bitmask thứ trong tuần: bit 0 = thứ Hai … bit 6 = Chủ nhật. 127 = cả tuần */
    saleDays: integer('sale_days').notNull().default(127),
    /** Phút kể từ 00:00 GIỜ CHI NHÁNH; cả hai NULL = bán suốt giờ mở cửa */
    saleStartMinute: integer('sale_start_minute'),
    saleEndMinute: integer('sale_end_minute'),

    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check('dishes_kind_check', sql`${t.kind} IN ('dish','set','drink')`),
    check(
      'dishes_routing_method_check',
      sql`${t.routingMethod} IS NULL OR ${t.routingMethod} IN ('fixed','song','nuong','linh_hoat')`,
    ),
    check('dishes_base_price_check', sql`${t.basePrice} >= 0`),
    // Món đi bếp phải khai đủ hai nhánh trạm cơ bản; set là vỏ chứa giá nên miễn
    check(
      'dishes_routing_required',
      sql`${t.kind} = 'set' OR (${t.stationGrill} IS NOT NULL AND ${t.stationNoGrill} IS NOT NULL)`,
    ),
    // 0 nghĩa là không bán ngày nào — thứ đó đã có tên là `active = false`
    check('dishes_sale_days_check', sql`${t.saleDays} BETWEEN 1 AND 127`),
    check(
      'dishes_sale_range_check',
      sql`${t.saleFrom} IS NULL OR ${t.saleTo} IS NULL OR ${t.saleTo} >= ${t.saleFrom}`,
    ),
    /**
     * Khung giờ khai cả cặp hoặc không khai, và không vắt qua nửa đêm: quán đóng
     * 23:00 (§ ngày làm việc) nên khung 22:00–02:00 chắc chắn là gõ nhầm, và cho
     * nó qua thì mọi phép so sánh giờ ở dưới phải mọc thêm một nhánh.
     */
    check(
      'dishes_sale_window_check',
      sql`(${t.saleStartMinute} IS NULL) = (${t.saleEndMinute} IS NULL)
       AND (${t.saleStartMinute} IS NULL
            OR (${t.saleStartMinute} BETWEEN 0 AND 1439 AND ${t.saleEndMinute} BETWEEN 1 AND 1440
                AND ${t.saleEndMinute} > ${t.saleStartMinute}))`,
    ),
    index('dishes_category_idx').on(t.categoryId, t.sort),
  ],
)

/** Ghi đè theo chi nhánh: giá bán · có bán không · trạm riêng (kiến trúc đa chi nhánh §5) */
export const dishBranchOverrides = pgTable(
  'dish_branch_overrides',
  {
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    price: bigint('price', { mode: 'number' }),
    active: boolean('active'),
    /**
     * Bán online hay không ở RIÊNG chi nhánh này (O11). Khác `active`: một món có
     * thể vẫn bán tại bàn nhưng tắt trên kênh online vì bếp chi nhánh đó không
     * kịp đóng gói giờ cao điểm. NULL = theo cờ cấp chuỗi.
     */
    onlineVisible: boolean('online_visible'),
    onlinePrice: bigint('online_price', { mode: 'number' }),
    stationGrill: text('station_grill').references(() => stations.id),
    stationNoGrill: text('station_no_grill').references(() => stations.id),
  },
  (t) => [primaryKey({ columns: [t.dishId, t.branchId] })],
)

/** Một cột "độ cắt" trên trang chi tiết món: tên · quy cách · mô tả · thanh đo độ mềm */
export interface DishStoryCut {
  name: string
  size: string
  desc: string
  /** Độ mềm 1–4, vẽ thành thanh đo bốn ô */
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
 * Phần biên tập của trang chi tiết món trên web (W3).
 *
 * Tách khỏi `dishes` chứ không nhồi thêm cột: bảng món đi theo mọi payload của
 * POS và màn bếp, không việc gì phải cõng mười lăm đoạn văn quảng cáo mỗi lần
 * dựng phiếu order. Ở đây chỉ món nào ĐƯỢC KỂ mới có bản ghi — món còn lại trang
 * web tự dựng bản gọn từ tên, giá, mô tả.
 *
 * Trước bản này chỗ đó nằm cứng trong `apps/web/content/stories.ts`: sửa một chữ
 * phải build lại web. Giờ nhập ở Office M1 và về web trong ≤ 60 giây, đúng cam
 * kết lan truyền của mọi thay đổi thực đơn.
 */
export const dishStories = pgTable('dish_stories', {
  dishId: text('dish_id')
    .primaryKey()
    .references(() => dishes.id, { onDelete: 'cascade' }),

  // ---- Dùng chung cho món lẻ và set ----
  /** Số chương in trong ô kim cương vàng: '01' cho món, 'I' cho set */
  chapterNo: text('chapter_no'),
  /** Quy cách một phần: '100g' · '3 con' · '8 món' */
  portionLabel: text('portion_label'),
  /** Tên tiếng Nhật ĐẦY ĐỦ, khác `dishes.nameJa` ngắn gọn: 牛バラ（三枚肉） */
  nameJaFull: text('name_ja_full'),
  /** Lời dẫn riêng của trang chi tiết; bỏ trống thì trang dùng mô tả dài của món */
  intro: text('intro'),
  note: text('note'),
  /** Dải chân trang: 'Sơ chế kỹ lưỡng · Thái máy chuyên dụng · Giữ lạnh 0–2°C' */
  craft: text('craft'),
  footerImageUrl: text('footer_image_url'),
  /** Khẩu hiệu chân trang, chữ Nhật rồi chữ Việt: 焼いてうまい！ */
  bannerJa: text('banner_ja'),
  bannerVi: text('banner_vi'),
  /** Câu kết in nghiêng cuối dải chân trang */
  closing: text('closing'),
  /** Món dùng kèm do bếp chọn tay — trống thì trang tự bù bằng đồ uống và món lạnh */
  pairingDishIds: text('pairing_dish_ids').array(),

  // ---- Món lẻ ----
  /** Vị trí phần thịt: 'Bụng dưới, giữa sườn và da' */
  origin: text('origin'),
  /** Chữ Nhật ngắn của phần thịt, viết dọc cạnh ảnh: 三枚肉 */
  originKanji: text('origin_kanji'),
  originImageUrl: text('origin_image_url'),
  flavours: text('flavours').array(),
  /** Nhãn khối độ cắt — thịt thì 'Lựa chọn độ cắt', hải sản và rau thì 'Cách sơ chế' */
  cutsLabel: text('cuts_label'),
  cuts: jsonb('cuts').$type<DishStoryCut[]>(),
  fire: text('fire'),
  fireImageUrl: text('fire_image_url'),
  dip: text('dip'),
  dipImageUrl: text('dip_image_url'),
  condiments: jsonb('condiments').$type<DishStoryCondiment[]>(),

  // ---- Set ----
  /** 'Dành cho 2 người' — chữ tự do vì set nào cũng có cách nói riêng */
  serves: text('serves'),
  duration: text('duration'),
  /** Bữa diễn ra theo thứ tự nào — set nấu theo nhịp, mang từng chặng */
  flow: text('flow').array(),
  /** Món gợi ý gọi thêm cho vừa miệng */
  extraDishIds: text('extra_dish_ids').array(),
})

export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    required: boolean('required').notNull().default(false),
    multi: boolean('multi').notNull().default(false),
    pickMin: integer('pick_min').notNull().default(0),
    pickMax: integer('pick_max'),
  },
  (t) => [
    // "modifier bắt buộc phải có ≥ 2 lựa chọn" được kiểm ở tầng nghiệp vụ khi lưu (M5)
    check('modifier_groups_pick_check', sql`${t.pickMax} IS NULL OR ${t.pickMax} >= ${t.pickMin}`),
  ],
)

export const modifierOptions = pgTable('modifier_options', {
  id: text('id').primaryKey(),
  groupId: text('group_id')
    .notNull()
    .references(() => modifierGroups.id),
  name: text('name').notNull(),
  /** Chênh giá, VND — có thể âm */
  priceDelta: bigint('price_delta', { mode: 'number' }).notNull().default(0),
  affectsStock: boolean('affects_stock').notNull().default(false),
  sort: integer('sort').notNull().default(0),
})

export const dishModifierGroups = pgTable(
  'dish_modifier_groups',
  {
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id),
    groupId: text('group_id')
      .notNull()
      .references(() => modifierGroups.id),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.dishId, t.groupId] })],
)

/**
 * Chặng của set (courses). `pickCount` NULL = nhóm cố định lấy hết; số = "chọn N
 * trong danh sách". `batchOffset` = chặng này ra ở đợt thứ mấy tính từ đợt của
 * dòng set — "set nấu theo nhịp, mang từng chặng".
 */
export const setGroups = pgTable(
  'set_groups',
  {
    id: text('id').primaryKey(),
    setDishId: text('set_dish_id')
      .notNull()
      .references(() => dishes.id),
    label: text('label').notNull(),
    kanji: text('kanji'),
    pickCount: integer('pick_count'),
    batchOffset: integer('batch_offset').notNull().default(0),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check('set_groups_pick_count_check', sql`${t.pickCount} IS NULL OR ${t.pickCount} > 0`),
    check('set_groups_batch_offset_check', sql`${t.batchOffset} >= 0`),
  ],
)

export const setGroupItems = pgTable(
  'set_group_items',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => setGroups.id),
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id),
    qty: integer('qty').notNull().default(1),
    /** Định lượng in trên vé bếp: '100g' · '3 con' · '2 bát' */
    portionLabel: text('portion_label'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.dishId] }),
    check('set_group_items_qty_check', sql`${t.qty} > 0`),
  ],
)

/**
 * Hết món (86) — LIVE STATE, cố tình KHÔNG nằm trong config bundle: 86 đổi nhiều
 * lần mỗi ca, nhét vào bundle sẽ phá pattern cache 304. Bảng thưa: chỉ tồn tại
 * dòng khi món KHÔNG bán bình thường.
 */
export const dishAvailability = pgTable(
  'dish_availability',
  {
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id),
    businessDate: date('business_date').notNull(),
    status: text('status').notNull(),
    /** Còn N phần; NULL = hết hẳn đến cuối ca */
    remaining: integer('remaining'),
    updatedBy: bigint('updated_by', { mode: 'number' }).references(() => staff.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.branchId, t.dishId] }),
    check('dish_availability_status_check', sql`${t.status} IN ('sold_out','limited')`),
    check(
      'dish_availability_remaining_check',
      sql`(${t.status} = 'sold_out' AND ${t.remaining} IS NULL) OR (${t.status} = 'limited' AND ${t.remaining} >= 0)`,
    ),
  ],
)
