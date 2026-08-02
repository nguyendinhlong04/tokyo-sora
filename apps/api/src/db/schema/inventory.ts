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
 *   3. Bắt buộc lô với hải sản sống, thịt bò, keg — cờ `lotRequired` đã có ở đây,
 *      nhưng bảng lô (S9) chưa dựng nên chưa ai đọc cờ đó.
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
    /** Bắt buộc khai lô khi nhập (hải sản sống, thịt bò, keg) — chờ S9 đọc tới */
    lotRequired: boolean('lot_required').notNull().default(false),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check('ingredients_base_per_purchase_check', sql`${t.basePerPurchase} > 0`),
    check('ingredients_cost_nonneg', sql`${t.costPerBaseMilli} >= 0`),
    check('ingredients_min_level_nonneg', sql`${t.minLevelBase} >= 0`),
    index('ingredients_group_idx').on(t.groupName, t.sort),
  ],
)

/**
 * M4 — Công thức (BOM). Một dòng = một nguyên liệu trong một món.
 *
 * `wasteBp` là hao hụt tính bằng **điểm cơ bản** (1/100 của 1%): 6% = 600. Dùng
 * điểm cơ bản thay vì phần trăm nguyên vì hao hụt rót bia hay lóc thịt hiếm khi
 * tròn số — 2,5% phải khai được mà không cần cột thập phân.
 *
 * Bản thiết kế còn cho phép chèn BÁN THÀNH PHẨM (M8: sốt, nước dùng) làm một dòng
 * của công thức, tức là BOM lồng nhau. Chưa dựng: M8 chưa có, nên mọi dòng ở đây
 * đều trỏ vào nguyên liệu thô và giá vốn là tổng một tầng.
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
    note: text('note'),
    actorId: bigint('actor_id', { mode: 'number' }).references(() => staff.id),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Ba loại bút toán, đúng ba cửa ghi đang có: nhập kho, bếp bấm Xong, và điều
     * chỉnh tồn có lý do (§4.2 `stock.write-off`). Xuất huỷ/nội bộ/chuyển kho (S6),
     * kiểm kê (S8) và hao hụt (S11) sẽ thêm loại mới bằng migration khi có màn.
     */
    check('stock_moves_kind_check', sql`${t.kind} IN ('receipt','sale','count_adjust')`),
    // Nhập phải làm tăng kho, bán phải làm giảm — sai dấu là sổ kho vô nghĩa.
    // Điều chỉnh đi được cả hai chiều nhưng không được bằng 0: một bút toán không
    // đổi gì mà vẫn đòi lý do chỉ làm bẩn sổ.
    check(
      'stock_moves_sign_check',
      sql`(${t.kind} = 'receipt' AND ${t.qtyBase} > 0)
       OR (${t.kind} = 'sale' AND ${t.qtyBase} < 0)
       OR (${t.kind} = 'count_adjust' AND ${t.qtyBase} <> 0)`,
    ),
    // Bán thì phải nói được bán cho dòng đơn nào; điều chỉnh thì phải có lý do
    check('stock_moves_sale_needs_line', sql`${t.kind} <> 'sale' OR ${t.orderLineId} IS NOT NULL`),
    check('stock_moves_adjust_needs_note', sql`${t.kind} <> 'count_adjust' OR ${t.note} IS NOT NULL`),
    /** MỘT dòng đơn trừ kho ĐÚNG MỘT LẦN cho mỗi nguyên liệu */
    uniqueIndex('stock_moves_one_sale_per_line')
      .on(t.orderLineId, t.ingredientId)
      .where(sql`kind = 'sale'`),
    index('stock_moves_branch_date_idx').on(t.branchId, t.businessDate),
    index('stock_moves_ingredient_idx').on(t.ingredientId, t.createdAt),
  ],
)
