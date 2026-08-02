import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
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

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  nameVi: text('name_vi').notNull(),
  nameEn: text('name_en'),
  nameJa: text('name_ja'),
  kanji: text('kanji'),
  sort: integer('sort').notNull().default(0),
})

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
