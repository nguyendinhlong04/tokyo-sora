import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { dishes } from './catalog'
import { branches, staff } from './identity'
import { orderLines } from './ordering'

/**
 * ====== KHO & CÔNG THỨC ======
 *
 * Ba quyết định nghiệp vụ của §25 được cưỡng chế ở đây:
 *   1. Giá bình quân gia quyền di động — cập nhật mỗi lần nhập, không FIFO/LIFO.
 *   2. Trừ kho khi bếp bấm Xong — không trừ lúc gọi món, vì món huỷ trước khi nấu
 *      thì nguyên liệu vẫn còn nguyên trong tủ.
 *   3. Bắt buộc lô với hải sản sống, thịt bò, keg — `lotRequired` bật thì nhập
 *      phải khai lô, và mọi lượt xuất rút lô theo FEFO (S9).
 *
 * GIÁ VỐN VÀ LÔ LÀ HAI VIỆC KHÁC NHAU, và đây là chỗ dễ lẫn nhất của cả module:
 * giá vốn đi theo **bình quân gia quyền** (quyết định 1), còn lô đi theo **FEFO**.
 * Nghĩa là rút lô cũ nhất KHÔNG có nghĩa là ghi giá của lô cũ nhất — tiền vẫn tính
 * bằng bình quân. Lô tồn tại để trả lời "miếng thịt này vào kho ngày nào, hết hạn
 * ngày nào", không phải để định giá. Trộn hai thứ đó là biến hệ thành FIFO mà
 * không ai chủ ý quyết định như vậy.
 *
 * ĐƠN VỊ: mọi số lượng trong hệ thống tính bằng **ĐVT CƠ SỞ** (g, ml, cái) và là
 * SỐ NGUYÊN. Đơn vị mua (kg, keg 20L, thùng 24 lon) chỉ tồn tại ở màn nhập kho và
 * được quy đổi ngay tại cửa. Chọn đơn vị cơ sở đủ nhỏ thì không bao giờ phải lưu
 * số lượng thập phân — thứ sinh ra sai số cộng dồn mà không ai phát hiện.
 */

/**
 * M7 — Nguyên liệu. Khai MỘT LẦN cấp chuỗi, giống món ăn (§18.1).
 *
 * Giá bình quân để ở cấp chuỗi chứ không theo từng chi nhánh. Đây là một đơn giản
 * hoá CÓ CHỦ Ý: đúng sách vở thì mỗi kho một giá bình quân riêng, nhưng ba chi
 * nhánh cùng thành phố mua chung nhà cung cấp thì hai con số đó lệch nhau không
 * đáng kể, mà hai giá vốn cho cùng một món lại làm màn M4 phải hỏi "giá vốn ở chi
 * nhánh nào" — câu hỏi không ai muốn trả lời khi đang sửa công thức. Khi nào mở
 * chi nhánh khác vùng giá thì tách, và chỗ phải sửa là `InventoryService.receive`.
 */
export const ingredients = pgTable(
  'ingredients',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    /** Nhóm để gom trên S2 và M7: 'Thịt bò' · 'Hải sản' · 'Đồ khô' · 'Bia rượu' */
    groupName: text('group_name'),
    /** ĐVT cơ sở — công thức và tồn kho đều đếm bằng đơn vị này */
    baseUnit: text('base_unit').notNull(),
    /** ĐVT mua hiện trên phiếu nhập: 'kg' · 'keg 20L' · 'thùng 24 lon' */
    purchaseUnit: text('purchase_unit').notNull(),
    /** 1 ĐVT mua = bao nhiêu ĐVT cơ sở. 1 kg = 1000 g · 1 keg 20L = 20000 ml */
    basePerPurchase: bigint('base_per_purchase', { mode: 'number' }).notNull(),

    /**
     * Giá bình quân gia quyền di động, tính bằng **phần nghìn đồng mỗi ĐVT cơ sở**.
     *
     * Vì sao không lưu thẳng đồng: muối 5.000₫/kg là 5₫/g, còn đá lạnh 800₫/kg là
     * 0,8₫/g — làm tròn về đồng ở tầng nguyên liệu sẽ biến đá thành miễn phí và
     * mọi món có đá đều sai giá vốn. Phần nghìn đồng giữ đủ chính xác, và tiền chỉ
     * làm tròn về đồng nguyên ở mức MÓN và mức PHIẾU, nơi nó thật sự là tiền.
     */
    costPerBaseMilli: bigint('cost_per_base_milli', { mode: 'number' }).notNull().default(0),

    /** Định mức tồn tối thiểu (ĐVT cơ sở) — dưới mức này thì S1/S2 báo đỏ */
    minLevelBase: bigint('min_level_base', { mode: 'number' }).notNull().default(0),
    /** Bắt buộc khai lô khi nhập (hải sản sống, thịt bò, keg) — S9 cưỡng chế */
    lotRequired: boolean('lot_required').notNull().default(false),
    /**
     * Keg bia: đục ra là bắt đầu đồng hồ hỏng, không phụ thuộc hạn in trên vỏ.
     * 0 = không phải keg. 5–7 ngày theo §25 S9.
     */
    openShelfLifeDays: integer('open_shelf_life_days').notNull().default(0),
    /**
     * Bán thành phẩm (M8): sốt, nước dùng, thịt đã lóc. Không mua ngoài mà sinh ra
     * từ lượt sản xuất nội bộ S7, nên S4 không gợi ý đặt hàng cho nó.
     */
    isSemiFinished: boolean('is_semi_finished').notNull().default(false),
    /**
     * M8 — sản lượng của MỘT MẺ chuẩn, ĐVT cơ sở. Nồi nước dùng ra 8.000ml thì đây
     * là 8000, và giá vốn mỗi ml = tiền nguyên liệu một mẻ ÷ 8000.
     *
     * 0 = chưa khai công thức mẻ. Con số này KHÔNG phải tồn kho và cũng không phải
     * giá: nó chỉ là mẫu số của phép chia trên, thứ duy nhất biến "một mẻ hết bao
     * nhiêu tiền" thành "mỗi ml giá bao nhiêu" để công thức món chèn được.
     */
    prepYieldBase: bigint('prep_yield_base', { mode: 'number' }).notNull().default(0),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check('ingredients_base_per_purchase_check', sql`${t.basePerPurchase} > 0`),
    // Sản lượng mẻ chỉ có nghĩa với bán thành phẩm — thịt bò mua về không có "mẻ"
    check(
      'ingredients_prep_yield_check',
      sql`${t.prepYieldBase} >= 0 AND (${t.prepYieldBase} = 0 OR ${t.isSemiFinished})`,
    ),
    check('ingredients_cost_nonneg', sql`${t.costPerBaseMilli} >= 0`),
    check('ingredients_min_level_nonneg', sql`${t.minLevelBase} >= 0`),
    check('ingredients_open_shelf_check', sql`${t.openShelfLifeDays} BETWEEN 0 AND 90`),
    // Đục keg là thao tác trên LÔ, nên keg buộc phải khai lô
    check(
      'ingredients_open_shelf_needs_lot',
      sql`${t.openShelfLifeDays} = 0 OR ${t.lotRequired}`,
    ),
    index('ingredients_group_idx').on(t.groupName, t.sort),
  ],
)

/**
 * S3 — Nhà cung cấp.
 *
 * Cấp CHUỖI như nguyên liệu: ba chi nhánh cùng thành phố mua chung một mối, và
 * khai ba lần là ba lần lệch số điện thoại. Chi nhánh nào đặt hàng thì nằm trên
 * đơn (S4), không nằm trên hồ sơ nhà cung cấp.
 */
export const suppliers = pgTable(
  'suppliers',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    /** MST — để đối chiếu với hoá đơn đầu vào C5 */
    taxCode: text('tax_code'),
    contactName: text('contact_name'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    /** Số ngày được nợ: 0 = trả ngay, 15 = NET 15 */
    paymentTermDays: integer('payment_term_days').notNull().default(0),
    /** Giờ chốt đơn trong ngày, phút kể từ 00:00 — đặt sau giờ này là giao hôm sau */
    cutoffMinute: integer('cutoff_minute'),
    note: text('note'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    check('suppliers_term_check', sql`${t.paymentTermDays} BETWEEN 0 AND 180`),
    check(
      'suppliers_cutoff_check',
      sql`${t.cutoffMinute} IS NULL OR ${t.cutoffMinute} BETWEEN 0 AND 1439`,
    ),
    check(
      'suppliers_tax_code_check',
      sql`${t.taxCode} IS NULL OR ${t.taxCode} ~ '^[0-9]{10}(-[0-9]{3})?$'`,
    ),
    index('suppliers_active_idx').on(t.active, t.name),
  ],
)

/**
 * Nguyên liệu nào mua của ai, giá bao nhiêu.
 *
 * Có bảng này thì S4 dựng được đơn đặt hàng mà không bắt thủ kho nhớ giá, và S5
 * so được giá nhập với giá đã thoả thuận — "cảnh báo lệch giá" của §25 S5 cần một
 * mốc để so, và mốc đó là dòng này.
 */
export const supplierItems = pgTable(
  'supplier_items',
  {
    supplierId: bigint('supplier_id', { mode: 'number' })
      .notNull()
      .references(() => suppliers.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** Giá thoả thuận cho MỘT ĐVT MUA, đồng nguyên */
    priceVnd: bigint('price_vnd', { mode: 'number' }).notNull(),
    /** Đặt tối thiểu bao nhiêu ĐVT mua mỗi lần */
    minOrderPurchase: integer('min_order_purchase').notNull().default(1),
    leadTimeDays: integer('lead_time_days').notNull().default(1),
    /** Mối chính cho nguyên liệu này — S4 gợi ý đặt ở đây trước */
    preferred: boolean('preferred').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.supplierId, t.ingredientId] }),
    check('supplier_items_price_check', sql`${t.priceVnd} > 0`),
    check('supplier_items_min_check', sql`${t.minOrderPurchase} > 0`),
    check('supplier_items_lead_check', sql`${t.leadTimeDays} BETWEEN 0 AND 90`),
    /** Một nguyên liệu chỉ có MỘT mối chính — hai mối chính là không có mối nào */
    uniqueIndex('supplier_items_one_preferred')
      .on(t.ingredientId)
      .where(sql`preferred`),
  ],
)

/**
 * M4 — Công thức (BOM). Một dòng = một nguyên liệu trong một món.
 *
 * `wasteBp` là hao hụt tính bằng **điểm cơ bản** (1/100 của 1%): 6% = 600. Dùng
 * điểm cơ bản thay vì phần trăm nguyên vì hao hụt rót bia hay lóc thịt hiếm khi
 * tròn số — 2,5% phải khai được mà không cần cột thập phân.
 *
 * BOM LỒNG NHAU: một dòng ở đây trỏ được vào bán thành phẩm (M8) y như trỏ vào
 * nguyên liệu thô, vì sốt và nước dùng cũng nằm trong `ingredients`. Giá vốn vẫn
 * là tổng MỘT TẦNG và đó là chủ ý: giá của sốt đã gói sẵn trong
 * `costPerBaseMilli` của chính nó — cộng thêm giá các nguyên liệu pha ra sốt là
 * tính tiền hai lần.
 */
export const dishRecipes = pgTable(
  'dish_recipes',
  {
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** Định lượng cho MỘT phần món, tính bằng ĐVT cơ sở */
    qtyBase: bigint('qty_base', { mode: 'number' }).notNull(),
    wasteBp: integer('waste_bp').notNull().default(0),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.dishId, t.ingredientId] }),
    check('dish_recipes_qty_check', sql`${t.qtyBase} > 0`),
    // Hao hụt 100% nghĩa là dùng gấp đôi định lượng — trên mức đó gần như chắc
    // chắn là gõ nhầm đơn vị, chặn ngay còn hơn để giá vốn sai âm thầm
    check('dish_recipes_waste_check', sql`${t.wasteBp} >= 0 AND ${t.wasteBp} <= 10000`),
    index('dish_recipes_ingredient_idx').on(t.ingredientId),
  ],
)

/**
 * M8 — Công thức bán thành phẩm: một mẻ sốt, một nồi nước dùng, một hũ kim chi.
 *
 * Cùng hình dạng với `dish_recipes` nhưng đầu ra khác hẳn: công thức món tính cho
 * MỘT PHẦN, còn công thức mẻ tính cho MỘT MẺ rồi chia cho `ingredients.
 * prep_yield_base` để ra giá mỗi ml. Nhét chung một bảng thì mỗi lần đọc phải hỏi
 * "dòng này tính cho phần hay cho mẻ", và câu hỏi đó sẽ có người trả lời sai.
 *
 * BẢNG NÀY LÀ CÔNG THỨC CHUẨN, KHÔNG PHẢI GIÁ. Giá thật của bán thành phẩm vẫn đi
 * theo bình quân gia quyền của những lượt nấu thật (S7 `produce`) — nấu tay già
 * lửa hao hơn công thức thì con số đó phải hiện ra chứ không được công thức che
 * đi. M8 hiện cả hai cạnh nhau, và chênh lệch giữa chúng chính là thứ đáng nhìn.
 */
export const prepRecipeLines = pgTable(
  'prep_recipe_lines',
  {
    /** Bán thành phẩm được pha ra — phải là nguyên liệu có `isSemiFinished` */
    prepId: text('prep_id')
      .notNull()
      .references(() => ingredients.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** Định lượng cho MỘT MẺ, ĐVT cơ sở của nguyên liệu thành phần */
    qtyBase: bigint('qty_base', { mode: 'number' }).notNull(),
    wasteBp: integer('waste_bp').notNull().default(0),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.prepId, t.ingredientId] }),
    check('prep_recipe_lines_qty_check', sql`${t.qtyBase} > 0`),
    check('prep_recipe_lines_waste_check', sql`${t.wasteBp} >= 0 AND ${t.wasteBp} <= 10000`),
    // Sốt pha từ chính nó là vòng lặp ngắn nhất; vòng dài hơn kiểm ở tầng dịch vụ
    check('prep_recipe_lines_not_self', sql`${t.prepId} <> ${t.ingredientId}`),
    index('prep_recipe_lines_ingredient_idx').on(t.ingredientId),
  ],
)

/**
 * M9 — Lịch sử phiên bản công thức. Một dòng = một lần bấm Lưu.
 *
 * BẢN CHỤP, KHÔNG PHẢI KHOÁ NGOẠI. Dòng ở đây giữ luôn tên nguyên liệu và giá lúc
 * đó, vì câu hỏi mà M9 phải trả lời là "hồi tháng Sáu công thức này thế nào" —
 * dựng lại bằng cách join sang `ingredients` sẽ trả về tên và giá của HÔM NAY, tức
 * là một bản không bao giờ tồn tại. Cũng vì thế nguyên liệu bị đổi tên hay xoá
 * không làm hỏng lịch sử.
 *
 * Chỉ ghi khi thật sự có gì đổi: bấm Lưu mà bảng y nguyên thì không sinh phiên bản
 * — một danh sách toàn dòng giống hệt nhau là danh sách không ai đọc.
 */
export const recipeVersions = pgTable(
  'recipe_versions',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** 'dish' công thức món (M4) · 'prep' công thức mẻ bán thành phẩm (M8) */
    subjectKind: text('subject_kind').notNull().$type<'dish' | 'prep'>(),
    /** `dishes.id` hoặc `ingredients.id` tuỳ `subjectKind` */
    subjectId: text('subject_id').notNull(),
    /** Đếm từ 1, riêng cho từng công thức */
    version: integer('version').notNull(),
    /** Bản chụp các dòng: mã · tên · định lượng · hao hụt · đơn giá · thành tiền */
    lines: jsonb('lines').notNull().$type<RecipeVersionLine[]>(),
    /** Sản lượng mẻ lúc chụp (chỉ 'prep'); NULL với công thức món */
    yieldBase: bigint('yield_base', { mode: 'number' }),
    /** Giá vốn MỘT PHẦN với món, MỘT MẺ với bán thành phẩm — đồng nguyên */
    costVnd: bigint('cost_vnd', { mode: 'number' }).notNull(),
    actorId: bigint('actor_id', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('recipe_versions_kind_check', sql`${t.subjectKind} IN ('dish','prep')`),
    check('recipe_versions_version_check', sql`${t.version} > 0`),
    check(
      'recipe_versions_yield_check',
      sql`(${t.subjectKind} = 'prep') = (${t.yieldBase} IS NOT NULL)`,
    ),
    uniqueIndex('recipe_versions_one_per_version').on(t.subjectKind, t.subjectId, t.version),
    /** Dòng thời gian chung của mọi công thức — bảng chính của màn M9 */
    index('recipe_versions_recent_idx').on(t.createdAt),
  ],
)

/** Một dòng trong bản chụp `recipe_versions.lines` */
export interface RecipeVersionLine {
  ingredientId: string
  /** Tên lúc chụp — nguyên liệu đổi tên về sau không viết lại lịch sử */
  name: string
  qtyBase: number
  wasteBp: number
  costPerBaseMilli: number
  costVnd: number
}

/**
 * Kiểu công thức — thứ quyết định BIỂU MẪU nào mở ra khi soạn.
 *
 * Quán nướng không có một quy trình nấu duy nhất. Misuji không được nấu: bếp
 * không bật lửa lần nào, người nướng là khách tại bàn, và cái quyết định chất
 * lượng là thái ngang thớ mấy milimet chứ không phải nhiệt độ chảo. Karaage thì
 * ngược lại, cần chỗ ghi nhiệt độ dầu và hai lượt chiên. Một biểu mẫu cứng phục
 * vụ cả hai sẽ để trống ô này và thiếu ô kia.
 *
 * Suy được từ dữ liệu đã có (`dishes.routingMethod` và trạm) nên seed điền sẵn,
 * nhưng vẫn cho sửa: bảng suy luận đúng khoảng chín phần mười, và một phần mười
 * còn lại phải sửa được mà không cần đổi mã.
 */
export type RecipeMethodKind = 'song' | 'nuong' | 'nau' | 'lap_rap'

/** Ba giai đoạn của một quy trình. `so_che` làm trước ca, hai giai đoạn sau theo vé. */
export type RecipeStepPhase = 'so_che' | 'che_bien' | 'hoan_thien'

/** Yêu cầu nguyên liệu ĐẦU VÀO — điều kiện nhận hàng, khác hẳn yêu cầu thành phẩm */
export interface RecipeInputSpec {
  item: string
  requirement: string
}

/** Một tiêu chí nghiệm thu ĐO ĐƯỢC: 'Khối lượng' → '100g ± 3g' */
export interface RecipeSpecItem {
  name: string
  target: string
}

/**
 * Điểm kiểm soát tới hạn. `action` bắt buộc có nội dung: một ngưỡng không kèm
 * cách xử lý khi vượt chỉ là chữ đỏ trang trí, không ai làm gì với nó.
 */
export interface RecipeCcp {
  point: string
  limit: string
  action: string
}

/** Lỗi thường gặp → hậu quả → cách sửa. Phần có giá trị nhất lúc đào tạo người mới. */
export interface RecipePitfall {
  mistake: string
  effect: string
  fix: string
}

/**
 * M4 · M8 — Phần VĂN BẢN của thẻ công thức: quy cách, yêu cầu, an toàn, mẹo.
 *
 * `dish_recipes` trả lời "món này tốn bao nhiêu tiền". Bảng này trả lời "làm thế
 * nào để ra đúng món đó" — hai câu hỏi của hai người khác nhau, và khoảng trống
 * giữa chúng đang được lấp bằng trí nhớ của người làm lâu năm: thứ không nhân bản
 * được sang chi nhánh thứ hai và không đưa ra được khi đoàn kiểm tra hỏi.
 *
 * KHOÁ THEO (subject_kind, subject_id) GIỐNG `recipe_versions`, không phải theo
 * `dish_id`: sốt tare và nước dùng của M8 cũng có bước, có nhiệt độ, có ngưỡng an
 * toàn. Một bộ bảng phục vụ cả hai màn, và về sau M9 chụp được cả hai mà không
 * mọc thêm nhánh.
 *
 * Mảng để `jsonb`/`text[]` chứ không tách bảng con: những cụm này luôn đọc cả
 * khối và không bao giờ truy vấn lẻ — tách ra là thêm năm bảng để phục vụ đúng
 * một câu SELECT. Riêng các BƯỚC thì tách, vì chúng cần sắp xếp và trỏ về BOM.
 */
export const recipeDocs = pgTable(
  'recipe_docs',
  {
    /** 'dish' công thức món (M4) · 'prep' công thức mẻ bán thành phẩm (M8) */
    subjectKind: text('subject_kind').notNull().$type<'dish' | 'prep'>(),
    /** `dishes.id` hoặc `ingredients.id` tuỳ `subjectKind` — cùng lối polymorphic với M9 */
    subjectId: text('subject_id').notNull(),

    methodKind: text('method_kind').notNull().$type<RecipeMethodKind>(),
    /** Quy cách một phần, viết cho người đọc: '100g · 7–9 lát' */
    yieldLabel: text('yield_label'),
    /** Dụng cụ đựng chuẩn: 'Đĩa gỗ số 3, lót lá tía tô' */
    plateLabel: text('plate_label'),
    /** Sơ chế theo mẻ, làm TRƯỚC ca. 0 = món không có việc gì làm trước */
    prepMinutes: integer('prep_minutes').notNull().default(0),

    equipment: text('equipment').array().notNull().default(sql`'{}'`),
    inputSpec: jsonb('input_spec')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<RecipeInputSpec[]>(),
    specMeasured: jsonb('spec_measured')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<RecipeSpecItem[]>(),
    specSensory: text('spec_sensory').array().notNull().default(sql`'{}'`),
    ccp: jsonb('ccp')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<RecipeCcp[]>(),
    storage: text('storage'),
    tips: text('tips').array().notNull().default(sql`'{}'`),
    pitfalls: jsonb('pitfalls')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<RecipePitfall[]>(),
    /** Món mời thay khi 86 — `dishes.id`, chỉ có nghĩa với `subject_kind = 'dish'` */
    substituteIds: text('substitute_ids').array().notNull().default(sql`'{}'`),

    updatedBy: bigint('updated_by', { mode: 'number' }).references(() => staff.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.subjectKind, t.subjectId] }),
    check('recipe_docs_kind_check', sql`${t.subjectKind} IN ('dish','prep')`),
    check(
      'recipe_docs_method_check',
      sql`${t.methodKind} IN ('song','nuong','nau','lap_rap')`,
    ),
    check('recipe_docs_prep_minutes_check', sql`${t.prepMinutes} >= 0`),
  ],
)

/**
 * Các BƯỚC của quy trình — bảng riêng vì chúng phải sắp xếp lại được, đánh số
 * được, và trỏ được về dòng nguyên liệu.
 *
 * `ingredientIds` trỏ về `dish_recipes` thay vì chép lại định lượng vào câu chữ:
 * chép tay thì sửa định lượng ở bảng BOM là câu trong bước sai ngay, và không ai
 * phát hiện cho tới lúc người mới làm theo.
 *
 * Không khoá ngoại sang `ingredients` cho mảng đó — Postgres không có khoá ngoại
 * trên phần tử mảng. Trỏ trượt thì màn hình bỏ qua, không làm hỏng bước; đánh đổi
 * này rẻ hơn nhiều so với một bảng nối ba cột chỉ để giữ vài con trỏ hiển thị.
 */
export const recipeSteps = pgTable(
  'recipe_steps',
  {
    subjectKind: text('subject_kind').notNull().$type<'dish' | 'prep'>(),
    subjectId: text('subject_id').notNull(),
    phase: text('phase').notNull().$type<RecipeStepPhase>(),
    sort: integer('sort').notNull(),

    /** Một hành động, thể mệnh lệnh: 'Thái ngang thớ dày 5mm.' */
    text: text('text').notNull(),
    /** Thời lượng bước; NULL = bước không bấm giờ (chờ nguội, ướp qua đêm) */
    seconds: integer('seconds'),
    /** Thông số nổi bật in cạnh bước: '170°C' · '5mm' · '0–2°C' */
    paramLabel: text('param_label'),
    ingredientIds: text('ingredient_ids').array().notNull().default(sql`'{}'`),
    isCcp: boolean('is_ccp').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.subjectKind, t.subjectId, t.phase, t.sort] }),
    foreignKey({
      columns: [t.subjectKind, t.subjectId],
      foreignColumns: [recipeDocs.subjectKind, recipeDocs.subjectId],
      name: 'recipe_steps_doc_fk',
    }).onDelete('cascade'),
    check('recipe_steps_phase_check', sql`${t.phase} IN ('so_che','che_bien','hoan_thien')`),
    check('recipe_steps_sort_check', sql`${t.sort} >= 0`),
    check('recipe_steps_seconds_check', sql`${t.seconds} IS NULL OR ${t.seconds} > 0`),
  ],
)

/**
 * S4 — Đơn đặt hàng.
 *
 * Máy trạng thái ngắn và một chiều: `draft → sent → (received | cancelled)`.
 * Không có "sửa sau khi gửi" vì đơn đã gửi là đơn nhà cung cấp đang đọc — sửa
 * bên mình mà bên kia không biết là cách sinh ra một lượt giao sai.
 *
 * Nhận hàng KHÔNG đổi trạng thái đơn bằng tay: `S5.receive` gắn phiếu nhập vào
 * dòng đơn, và đơn tự sang `received` khi mọi dòng đã đủ. Nhận thiếu thì đơn ở
 * lại `sent` — đó chính là danh sách "còn nợ hàng" mà người mua cần thấy.
 */
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** PO-2608-0031 — dễ đọc qua điện thoại */
    displayCode: text('display_code').notNull().unique(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    supplierId: bigint('supplier_id', { mode: 'number' })
      .notNull()
      .references(() => suppliers.id),
    state: text('state').notNull().default('draft'),
    expectedOn: date('expected_on'),
    note: text('note'),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'purchase_orders_state_check',
      sql`${t.state} IN ('draft','sent','received','cancelled')`,
    ),
    check(
      'purchase_orders_sent_check',
      sql`${t.state} = 'draft' OR ${t.state} = 'cancelled' OR ${t.sentAt} IS NOT NULL`,
    ),
    index('purchase_orders_branch_idx').on(t.branchId, t.state, t.createdAt),
  ],
)

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => purchaseOrders.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** Đặt bao nhiêu ĐVT MUA — đơn hàng nói bằng ngôn ngữ nhà cung cấp */
    qtyPurchase: integer('qty_purchase').notNull(),
    /** Giá đơn vị lúc đặt, đóng băng — giá thoả thuận đổi về sau không viết lại đơn cũ */
    priceVnd: bigint('price_vnd', { mode: 'number' }).notNull(),
    /** Đã nhận bao nhiêu ĐVT mua; cộng dồn qua nhiều lượt nhập */
    receivedPurchase: integer('received_purchase').notNull().default(0),
  },
  (t) => [
    check('purchase_order_lines_qty_check', sql`${t.qtyPurchase} > 0`),
    check('purchase_order_lines_price_check', sql`${t.priceVnd} >= 0`),
    check('purchase_order_lines_received_check', sql`${t.receivedPurchase} >= 0`),
    uniqueIndex('purchase_order_lines_one_per_item').on(t.orderId, t.ingredientId),
  ],
)

/**
 * S5 · S9 — Lô hàng. Một dòng = một lượt hàng cùng số lô, cùng hạn dùng.
 *
 * `qtyRemainBase` là số CÒN LẠI, và nó giảm dần theo FEFO khi xuất. Lô hết thì
 * `qtyRemainBase = 0` nhưng dòng KHÔNG bị xoá: truy ngược "con tôm hỏng hôm nay
 * thuộc lô nào, nhập ngày nào, của ai" chỉ làm được nếu lô đã hết vẫn còn đó.
 *
 * KEG BIA có luật riêng (§25 S7 · S9): keg nguyên và keg đang mở là hai lô khác
 * nhau. Đục keg là **tách lô** — lô nguyên giảm một keg, sinh lô mới `state =
 * 'open'` với `expiresOn` tính từ ngày đục theo `openShelfLifeDays`, không phải
 * theo hạn in trên vỏ. Bia trong keg đã đục hỏng sau 5–7 ngày dù vỏ ghi sáu tháng.
 */
export const stockLots = pgTable(
  'stock_lots',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** Số lô của nhà cung cấp; sinh tự động khi họ không ghi */
    lotCode: text('lot_code').notNull(),
    receivedOn: date('received_on').notNull(),
    /** Hạn dùng — NULL với hàng không hạn (muối, đường) */
    expiresOn: date('expires_on'),

    qtyInBase: bigint('qty_in_base', { mode: 'number' }).notNull(),
    qtyRemainBase: bigint('qty_remain_base', { mode: 'number' }).notNull(),
    /** Giá của riêng lô này — để truy ngược, KHÔNG dùng để tính giá vốn xuất */
    unitCostMilli: bigint('unit_cost_milli', { mode: 'number' }).notNull().default(0),

    /** 'sealed' hàng nguyên · 'open' keg đã đục, đồng hồ ngắn hạn đang chạy */
    state: text('state').notNull().default('sealed'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    /** Lô nguyên sinh ra lô đã đục này */
    parentLotId: bigint('parent_lot_id', { mode: 'number' }),

    /** Nhiệt độ lúc nhận, °C ×10 (âm được: hàng đông −180 = −18,0°C) */
    receiveTempDeciC: integer('receive_temp_deci_c'),
    supplierId: bigint('supplier_id', { mode: 'number' }).references(() => suppliers.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('stock_lots_state_check', sql`${t.state} IN ('sealed','open')`),
    check('stock_lots_qty_check', sql`${t.qtyInBase} > 0 AND ${t.qtyRemainBase} >= 0`),
    check('stock_lots_remain_check', sql`${t.qtyRemainBase} <= ${t.qtyInBase}`),
    // Lô đã đục phải nói được đục lúc nào — đồng hồ hạn ngắn đếm từ mốc đó
    check('stock_lots_open_check', sql`${t.state} <> 'open' OR ${t.openedAt} IS NOT NULL`),
    check(
      'stock_lots_temp_check',
      sql`${t.receiveTempDeciC} IS NULL OR ${t.receiveTempDeciC} BETWEEN -400 AND 600`,
    ),
    uniqueIndex('stock_lots_code_unique').on(t.branchId, t.ingredientId, t.lotCode),
    /** Chỉ số của FEFO: lô còn hàng, sắp theo hạn gần nhất */
    index('stock_lots_fefo_idx')
      .on(t.branchId, t.ingredientId, t.expiresOn)
      .where(sql`qty_remain_base > 0`),
  ],
)

/** Tồn hiện tại theo chi nhánh × nguyên liệu. Bảng này là HÌNH CHIẾU của sổ kho. */
export const stockLevels = pgTable(
  'stock_levels',
  {
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    qtyBase: bigint('qty_base', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.ingredientId] })],
)

/**
 * Sổ kho — APPEND-ONLY, cùng luật với sổ doanh thu (§4.3.2): sửa sai bằng bút
 * toán ngược, không bao giờ sửa dòng cũ. Trigger canh ở migration 9004.
 *
 * `qtyBase` và `costVnd` mang DẤU: nhập là dương, bán/huỷ là âm. Cộng cả cột lên
 * là ra tồn và ra giá vốn hàng bán, không cần biết loại bút toán — đó là lý do
 * không tách hai cột "vào" và "ra".
 *
 * `costVnd` làm tròn về ĐỒNG NGUYÊN tại từng bút toán: đây là chỗ con số rời khỏi
 * thế giới phần nghìn đồng của `ingredients` và trở thành tiền thật mà F7 đọc.
 */
export const stockMoves = pgTable(
  'stock_moves',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    kind: text('kind').notNull(),
    qtyBase: bigint('qty_base', { mode: 'number' }).notNull(),
    costVnd: bigint('cost_vnd', { mode: 'number' }).notNull(),
    /**
     * Dòng đơn đã tiêu thụ nguyên liệu này — cửa truy ngược từ giá vốn về món.
     *
     * Đơn vị trừ kho là DÒNG ĐƠN chứ không phải vé bếp: món đa trạm (Sukiyaki =
     * nồi ST-04 + khay thịt ST-02) sinh hai vé mang CÙNG một `order_line_id`, trừ
     * theo vé là trừ đôi nguyên liệu. Chỉ số duy nhất bên dưới cưỡng chế điều đó.
     */
    orderLineId: bigint('order_line_id', { mode: 'number' }).references(() => orderLines.id),
    /** Lô bị rút (FEFO) hoặc lô vừa sinh ra — cửa truy ngược từ bút toán về lô */
    lotId: bigint('lot_id', { mode: 'number' }).references(() => stockLots.id),
    /**
     * Chứng từ sinh ra bút toán này: phiếu kiểm kê S8, lượt sản xuất S7, phiếu
     * chuyển kho S10. Chỉ để truy ngược — sổ vẫn tự đứng được nếu không có.
     */
    docKind: text('doc_kind'),
    docId: bigint('doc_id', { mode: 'number' }),
    note: text('note'),
    actorId: bigint('actor_id', { mode: 'number' }).references(() => staff.id),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Chín loại bút toán, đúng chín cửa ghi:
     *   `receipt`     nhập kho S5           · `sale`         bếp bấm Xong
     *   `count_adjust` điều chỉnh lẻ + chốt kiểm kê S8
     *   `write_off`   xuất huỷ có lý do S6  · `internal`     xuất nội bộ S6
     *   `transfer_out`/`transfer_in`        chuyển kho S10, hai đầu hai bút toán
     *   `produce_out`/`produce_in`          sản xuất nội bộ S7
     *
     * Xuất huỷ và xuất nội bộ tách nhau vì chúng nói hai chuyện khác hẳn: huỷ là
     * MẤT (vào dòng hao hụt của S11 và của Lãi/Lỗ), còn ăn ca là CHI PHÍ có ích.
     * Gộp làm một là báo cáo hao hụt kêu to mỗi khi nhân viên ăn cơm.
     */
    check(
      'stock_moves_kind_check',
      sql`${t.kind} IN ('receipt','sale','count_adjust','write_off','internal',
                        'transfer_out','transfer_in','produce_out','produce_in')`,
    ),
    // Nhập phải làm tăng kho, xuất phải làm giảm — sai dấu là sổ kho vô nghĩa.
    // Điều chỉnh đi được cả hai chiều nhưng không được bằng 0: một bút toán không
    // đổi gì mà vẫn đòi lý do chỉ làm bẩn sổ.
    check(
      'stock_moves_sign_check',
      sql`(${t.kind} IN ('receipt','transfer_in','produce_in') AND ${t.qtyBase} > 0)
       OR (${t.kind} IN ('sale','write_off','internal','transfer_out','produce_out') AND ${t.qtyBase} < 0)
       OR (${t.kind} = 'count_adjust' AND ${t.qtyBase} <> 0)`,
    ),
    // Bán thì phải nói được bán cho dòng đơn nào; mọi lượt xuất tay phải có lý do
    check('stock_moves_sale_needs_line', sql`${t.kind} <> 'sale' OR ${t.orderLineId} IS NOT NULL`),
    check(
      'stock_moves_reason_required',
      sql`${t.kind} NOT IN ('count_adjust','write_off','internal') OR ${t.note} IS NOT NULL`,
    ),
    check(
      'stock_moves_doc_check',
      sql`(${t.docKind} IS NULL) = (${t.docId} IS NULL)`,
    ),
    /** MỘT dòng đơn trừ kho ĐÚNG MỘT LẦN cho mỗi nguyên liệu */
    uniqueIndex('stock_moves_one_sale_per_line')
      .on(t.orderLineId, t.ingredientId)
      .where(sql`kind = 'sale'`),
    index('stock_moves_branch_date_idx').on(t.branchId, t.businessDate),
    index('stock_moves_ingredient_idx').on(t.ingredientId, t.createdAt),
    index('stock_moves_doc_idx').on(t.docKind, t.docId),
  ],
)

/**
 * S8 — Phiếu kiểm kê. Đếm trên tablet, DUYỆT rồi mới chốt (§25 S8).
 *
 * Hai bước tách nhau vì chúng là hai người và hai việc: thủ kho đếm, quản lý
 * duyệt. Chốt sinh bút toán `count_adjust` cho từng dòng lệch — đó là lúc sổ kho
 * đổi, và cũng là lúc chênh lệch trở thành chi phí trên Lãi/Lỗ. Trước khi chốt
 * thì phiếu chỉ là một tờ giấy nháp.
 *
 * `snapshotBase` chụp tồn sổ NGAY LÚC MỞ phiếu: đếm mất một tiếng, trong giờ đó
 * bếp vẫn bán, và so số đếm với tồn sổ lúc chốt sẽ ra chênh lệch giả bằng đúng
 * lượng bán trong lúc đếm.
 */
export const stockCounts = pgTable(
  'stock_counts',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    /** Kiểm cả kho hay chỉ một nhóm hàng */
    groupName: text('group_name'),
    state: text('state').notNull().default('counting'),
    note: text('note'),
    openedBy: bigint('opened_by', { mode: 'number' }).references(() => staff.id),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedBy: bigint('closed_by', { mode: 'number' }).references(() => staff.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    businessDate: date('business_date').notNull(),
  },
  (t) => [
    check('stock_counts_state_check', sql`${t.state} IN ('counting','closed','cancelled')`),
    check(
      'stock_counts_closed_check',
      sql`(${t.state} = 'closed') = (${t.closedAt} IS NOT NULL)`,
    ),
    /** Một chi nhánh chỉ có MỘT phiếu đang đếm — hai phiếu là hai số đếm chọi nhau */
    uniqueIndex('stock_counts_one_open')
      .on(t.branchId)
      .where(sql`state = 'counting'`),
    index('stock_counts_branch_idx').on(t.branchId, t.businessDate),
  ],
)

export const stockCountLines = pgTable(
  'stock_count_lines',
  {
    countId: bigint('count_id', { mode: 'number' })
      .notNull()
      .references(() => stockCounts.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** Tồn sổ lúc MỞ phiếu — mốc so, đóng băng ngay từ đầu */
    snapshotBase: bigint('snapshot_base', { mode: 'number' }).notNull(),
    /** Số đếm được; NULL = chưa đếm tới */
    countedBase: bigint('counted_base', { mode: 'number' }),
    note: text('note'),
    countedAt: timestamp('counted_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.countId, t.ingredientId] }),
    check('stock_count_lines_counted_check', sql`${t.countedBase} IS NULL OR ${t.countedBase} >= 0`),
  ],
)

/**
 * S7 — Sản xuất nội bộ: pha sốt, ninh nước dùng, **pha lóc thịt**, **đục keg**.
 *
 * Một lượt = nhiều đầu VÀO (`produce_out`) và nhiều đầu RA (`produce_in`). Ví dụ
 * của §25: một tảng bò 12kg → nầm 2,1kg + dẻ sườn 3,4kg + hao 0,8kg.
 *
 * HAO KHÔNG PHẢI MỘT ĐẦU RA. Nó là phần chênh giữa tổng vào và tổng ra, và tiền
 * của nó **nằm lại trong giá của các đầu ra** — lóc 12kg tảng bò được 5,5kg thịt
 * dùng được thì mỗi cân thịt đó phải gánh giá của cả 12kg. Ghi hao thành một dòng
 * riêng rồi tính giá theo trọng lượng ra là làm nầm bò rẻ đi một cách giả tạo, và
 * mọi món dùng nầm sẽ báo lãi cao hơn thực tế.
 */
export const productionRuns = pgTable(
  'production_runs',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    /** 'pha-che' sốt & nước dùng · 'pha-loc' lóc thịt · 'duc-keg' đục keg bia */
    kind: text('kind').notNull(),
    note: text('note'),
    actorId: bigint('actor_id', { mode: 'number' }).references(() => staff.id),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('production_runs_kind_check', sql`${t.kind} IN ('pha-che','pha-loc','duc-keg')`),
    index('production_runs_branch_idx').on(t.branchId, t.businessDate),
  ],
)

/**
 * Một dòng vào hoặc ra của lượt sản xuất.
 *
 * `costShareBp` chỉ có ý nghĩa với dòng RA: phần trăm (điểm cơ bản) của tổng giá
 * đầu vào mà dòng này gánh. Nầm bò và dẻ sườn cùng ra từ một tảng nhưng không
 * cùng giá trị, nên chia theo trọng lượng là sai — người pha lóc khai tỉ lệ, và
 * tổng các tỉ lệ phải bằng 100%.
 */
export const productionLines = pgTable(
  'production_lines',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    runId: bigint('run_id', { mode: 'number' })
      .notNull()
      .references(() => productionRuns.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** 'in' nguyên liệu tiêu hao · 'out' thành phẩm sinh ra */
    direction: text('direction').notNull(),
    qtyBase: bigint('qty_base', { mode: 'number' }).notNull(),
    /** Chỉ dòng RA: phần giá gánh, điểm cơ bản. Tổng dòng ra = 10000 */
    costShareBp: integer('cost_share_bp'),
    lotId: bigint('lot_id', { mode: 'number' }).references(() => stockLots.id),
  },
  (t) => [
    check('production_lines_direction_check', sql`${t.direction} IN ('in','out')`),
    check('production_lines_qty_check', sql`${t.qtyBase} > 0`),
    check(
      'production_lines_share_check',
      sql`(${t.direction} = 'out' AND ${t.costShareBp} BETWEEN 0 AND 10000)
       OR (${t.direction} = 'in' AND ${t.costShareBp} IS NULL)`,
    ),
    index('production_lines_run_idx').on(t.runId, t.direction),
  ],
)

/**
 * S10 — Chuyển kho giữa chi nhánh, **xác nhận hai đầu** (§25 S10).
 *
 * Hai đầu là điều kiện sống còn chứ không phải thủ tục: hàng lên xe ở Cầu Giấy
 * mà chưa tới Thảo Điền thì nó không nằm ở kho nào cả. Nếu ghi tăng cho bên nhận
 * ngay lúc gửi thì Thảo Điền thấy có hàng mà mở tủ ra không có; nếu chỉ ghi giảm
 * bên gửi thì hàng biến mất khỏi sổ trong lúc đang trên đường.
 *
 * Nên: gửi sinh `transfer_out` ngay (hàng rời kho là thật), còn `transfer_in` chỉ
 * sinh khi bên nhận xác nhận. Khoảng giữa là **hàng đang đi đường** — đọc được
 * bằng chênh lệch giữa hai bút toán, và đó là con số S1 cần hiện.
 */
export const stockTransfers = pgTable(
  'stock_transfers',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    displayCode: text('display_code').notNull().unique(),
    fromBranchId: text('from_branch_id')
      .notNull()
      .references(() => branches.id),
    toBranchId: text('to_branch_id')
      .notNull()
      .references(() => branches.id),
    state: text('state').notNull().default('sent'),
    note: text('note'),
    sentBy: bigint('sent_by', { mode: 'number' }).references(() => staff.id),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    receivedBy: bigint('received_by', { mode: 'number' }).references(() => staff.id),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    businessDate: date('business_date').notNull(),
  },
  (t) => [
    check('stock_transfers_state_check', sql`${t.state} IN ('sent','received','rejected')`),
    check('stock_transfers_two_branches', sql`${t.fromBranchId} <> ${t.toBranchId}`),
    check(
      'stock_transfers_received_check',
      sql`(${t.state} = 'received') = (${t.receivedAt} IS NOT NULL)`,
    ),
    index('stock_transfers_from_idx').on(t.fromBranchId, t.state),
    index('stock_transfers_to_idx').on(t.toBranchId, t.state),
  ],
)

export const stockTransferLines = pgTable(
  'stock_transfer_lines',
  {
    transferId: bigint('transfer_id', { mode: 'number' })
      .notNull()
      .references(() => stockTransfers.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    qtyBase: bigint('qty_base', { mode: 'number' }).notNull(),
    /** Bên nhận đếm lại được bao nhiêu; lệch là hao đường đi, ghi vào bên gửi */
    receivedBase: bigint('received_base', { mode: 'number' }),
  },
  (t) => [
    primaryKey({ columns: [t.transferId, t.ingredientId] }),
    check('stock_transfer_lines_qty_check', sql`${t.qtyBase} > 0`),
    check(
      'stock_transfer_lines_received_check',
      sql`${t.receivedBase} IS NULL OR ${t.receivedBase} >= 0`,
    ),
  ],
)
