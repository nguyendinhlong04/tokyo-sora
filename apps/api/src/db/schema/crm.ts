import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { approvals } from './ledger'
import { branches, shifts, staff } from './identity'
import { dishes } from './catalog'
import { orders } from './ordering'
import { payments } from './payments'

/**
 * ====== KHÁCH HÀNG & KHUYẾN MÃI (B11 – B15) ======
 *
 * Năm màn cuối nhóm Kinh doanh, và bốn ranh giới giữ cho chúng không lẫn vào nhau:
 *
 *  1. **Không cộng dồn khuyến mãi** — `promotion_redemptions` UNIQUE theo đơn.
 *     Quy tắc "tự áp mức lợi nhất cho khách" (§25 B11) chỉ đúng khi CSDL không cho
 *     phép đơn thứ hai chồng lên; để tầng nghiệp vụ tự nhớ là sớm muộn cũng chồng.
 *
 *  2. **Điểm chỉ sinh từ sự kiện thanh toán** — `loyalty_entries` dòng `earn` bắt
 *     buộc có `order_id`, và UNIQUE theo đơn. Không có nút cộng tay: muốn cộng thì
 *     phải là dòng `adjust` với lý do và người thao tác, mà quyền đó chỉ R11/R10 có.
 *
 *  3. **Sổ khách gom theo SỐ ĐIỆN THOẠI** — `customers.phone` UNIQUE. Đó là khoá
 *     duy nhất mà cả ba nguồn (đặt bàn, đơn online, hoá đơn) đều có. Gom theo tên
 *     là gom nhầm hai người trùng tên.
 *
 *  4. **Ghi nợ công ty là DỒN TÍCH, không phải dòng tiền** — `corporate_charges`
 *     KHÔNG sinh dòng `payments`. Doanh thu vào báo cáo ngay (báo cáo đọc
 *     `orders.money_total`), còn sổ quỹ F1 chỉ thấy tiền khi công ty chuyển khoản
 *     thật, lúc đó mới có `corporate_settlements` trỏ về đúng lượt trả đó.
 *
 * Con số cấu hình của B14 (tỷ lệ tích, tỷ lệ đổi, trần, hạn điểm, ngưỡng hạng) và
 * của B15 (hạn mức mặc định, số ngày quá hạn thì chặn) KHÔNG có bảng ở đây — chúng
 * sống trong Trung tâm tham số A6, đúng §29.1 "sửa ở đâu cũng là sửa một chỗ".
 */

// ============================================================ B11 · Khuyến mãi

/**
 * B11 — Chương trình khuyến mãi. Nơi TẠO, thứ mà P10 xưa nay thiếu.
 *
 * Bốn loại của tài liệu nằm trong `kind`, và mỗi loại chỉ dùng đúng cột của nó —
 * ràng buộc `promotions_value_check` bên dưới cưỡng chế điều đó, vì một chương
 * trình "giảm %" mà lại điền số tiền là một chương trình sẽ tính ra số nào đó chứ
 * không báo lỗi.
 *
 * Mảng rỗng nghĩa là KHÔNG GIỚI HẠN (mọi kênh / mọi chi nhánh / mọi thứ trong
 * tuần). Dùng NULL cho ý đó sẽ phải viết `IS NULL OR …` ở mọi câu lệnh.
 */
export const promotions = pgTable(
  'promotions',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** Mã người đọc: KM-TRUA-2026 */
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),

    /** Giảm % nhân 100 (1250 = 12,5%) — chỉ `kind = 'percent'` */
    percentBp: integer('percent_bp'),
    /** Giảm thẳng số tiền — chỉ `kind = 'amount'` */
    amountVnd: bigint('amount_vnd', { mode: 'number' }),
    /** Món được tặng hoặc món áp giá khung giờ */
    targetDishId: text('target_dish_id').references(() => dishes.id),
    /** Giá cố định của món/set trong khung giờ — chỉ `kind = 'set_price'` */
    setPriceVnd: bigint('set_price_vnd', { mode: 'number' }),
    /** Trần giảm của loại % — không có trần thì một bàn 20 người ăn hết chương trình */
    maxDiscountVnd: bigint('max_discount_vnd', { mode: 'number' }),

    // ---- Điều kiện áp dụng
    /** 'web' 'table' 'pos' 'grab' 'shopee' 'be'; rỗng = mọi kênh */
    channels: text('channels').array().notNull().default(sql`'{}'::text[]`),
    /** Rỗng = mọi chi nhánh */
    branchIds: text('branch_ids').array().notNull().default(sql`'{}'::text[]`),
    /** 0 = Chủ nhật … 6 = Thứ bảy, theo `extract(dow)`; rỗng = mọi ngày */
    weekdays: smallint('weekdays').array().notNull().default(sql`'{}'::smallint[]`),
    /** Khung giờ trong ngày, phút từ 00:00; NULL = cả ngày */
    fromMinute: integer('from_minute'),
    toMinute: integer('to_minute'),
    minOrderVnd: bigint('min_order_vnd', { mode: 'number' }).notNull().default(0),
    /** Phải nhập mã voucher mới được hưởng */
    requiresVoucher: boolean('requires_voucher').notNull().default(false),

    // ---- Lịch chạy
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),

    state: text('state').notNull().default('draft'),
    /**
     * Bản ghi duyệt của lượt kích hoạt. R9 soạn được nhưng kích hoạt là đụng giá
     * nên phải có R11/R10 duyệt (§4.2b); R11/R10 tự bật thì cột này NULL.
     */
    approvalId: bigint('approval_id', { mode: 'number' }).references(() => approvals.id),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    activatedBy: bigint('activated_by', { mode: 'number' }).references(() => staff.id),

    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'promotions_kind_check',
      sql`${t.kind} IN ('percent','amount','free_dish','set_price')`,
    ),
    check('promotions_state_check', sql`${t.state} IN ('draft','active','paused','ended')`),
    // Mỗi loại chỉ mang đúng con số của mình — không có loại nào mang hai con số
    check(
      'promotions_value_check',
      sql`(${t.kind} = 'percent'   AND ${t.percentBp} BETWEEN 1 AND 10000
                                   AND ${t.amountVnd} IS NULL AND ${t.setPriceVnd} IS NULL)
       OR (${t.kind} = 'amount'    AND ${t.amountVnd} > 0
                                   AND ${t.percentBp} IS NULL AND ${t.setPriceVnd} IS NULL)
       OR (${t.kind} = 'free_dish' AND ${t.targetDishId} IS NOT NULL
                                   AND ${t.percentBp} IS NULL AND ${t.amountVnd} IS NULL
                                   AND ${t.setPriceVnd} IS NULL)
       OR (${t.kind} = 'set_price' AND ${t.targetDishId} IS NOT NULL AND ${t.setPriceVnd} >= 0
                                   AND ${t.percentBp} IS NULL AND ${t.amountVnd} IS NULL)`,
    ),
    check('promotions_window_check', sql`${t.endsOn} >= ${t.startsOn}`),
    check(
      'promotions_hour_check',
      sql`(${t.fromMinute} IS NULL AND ${t.toMinute} IS NULL)
       OR (${t.fromMinute} BETWEEN 0 AND 1439 AND ${t.toMinute} BETWEEN 1 AND 1440
           AND ${t.toMinute} > ${t.fromMinute})`,
    ),
    check('promotions_min_order_check', sql`${t.minOrderVnd} >= 0`),
    check(
      'promotions_max_discount_check',
      sql`${t.maxDiscountVnd} IS NULL OR ${t.maxDiscountVnd} > 0`,
    ),
    // Đang chạy thì phải biết ai bật — cột trống ở đây là chương trình không ai chịu trách nhiệm
    check(
      'promotions_activated_check',
      sql`${t.state} <> 'active' OR (${t.activatedAt} IS NOT NULL AND ${t.activatedBy} IS NOT NULL)`,
    ),
    index('promotions_live_idx').on(t.state, t.startsOn, t.endsOn).where(sql`state = 'active'`),
  ],
)

/**
 * Lô mã voucher. Một chương trình có thể phát nhiều mã, mỗi mã có trần lượt riêng.
 *
 * `used_count` là bản đếm, không phải nguồn sự thật — nguồn là
 * `promotion_redemptions`. Giữ ở đây vì chốt chặn "hết lượt" phải khoá được một
 * dòng (`SELECT … FOR UPDATE`) chứ không thể đếm lại cả bảng ở mỗi lần quẹt mã.
 */
export const voucherCodes = pgTable(
  'voucher_codes',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    promotionId: bigint('promotion_id', { mode: 'number' })
      .notNull()
      .references(() => promotions.id),
    /** Khách gõ vào ô voucher ở P10 — viết HOA, không dấu cách */
    code: text('code').notNull().unique(),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    /** NULL = hết hạn theo lịch chương trình */
    expiresOn: date('expires_on'),
    state: text('state').notNull().default('live'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('voucher_codes_state_check', sql`${t.state} IN ('live','void')`),
    check('voucher_codes_max_uses_check', sql`${t.maxUses} >= 1`),
    // Không bao giờ quẹt quá trần — CSDL chặn, không trông vào chỗ đếm ở tầng trên
    check(
      'voucher_codes_used_check',
      sql`${t.usedCount} >= 0 AND ${t.usedCount} <= ${t.maxUses}`,
    ),
    index('voucher_codes_promotion_idx').on(t.promotionId),
  ],
)

/**
 * Lượt hưởng khuyến mãi — nguồn để B8 đo hiệu quả chương trình.
 *
 * UNIQUE theo `order_id` chính là **quy tắc không cộng dồn**: một đơn hưởng đúng
 * một chương trình, mức lợi nhất cho khách. Đặt ràng buộc ở đây thay vì ở tầng
 * nghiệp vụ vì hai thu ngân bấm cùng lúc trên hai máy thì tầng nghiệp vụ không
 * thấy nhau, còn chỉ số duy nhất thì thấy.
 */
export const promotionRedemptions = pgTable(
  'promotion_redemptions',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    promotionId: bigint('promotion_id', { mode: 'number' })
      .notNull()
      .references(() => promotions.id),
    voucherCodeId: bigint('voucher_code_id', { mode: 'number' }).references(() => voucherCodes.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    /** Số tiền khách thực sự được giảm nhờ chương trình này */
    discountVnd: bigint('discount_vnd', { mode: 'number' }).notNull(),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('promotion_redemptions_one_per_order').on(t.orderId),
    check('promotion_redemptions_amount_check', sql`${t.discountVnd} >= 0`),
    index('promotion_redemptions_promo_date_idx').on(t.promotionId, t.businessDate),
    index('promotion_redemptions_branch_date_idx').on(t.branchId, t.businessDate),
  ],
)

// ================================================================ B12 · Sổ khách

/**
 * B12 — Hồ sơ khách hợp nhất. Một dòng cho một SỐ ĐIỆN THOẠI.
 *
 * Không có cột `points_balance`: số dư điểm là TỔNG của `loyalty_entries`. Giữ hai
 * nguồn cho cùng một con số là hẹn ngày chúng lệch nhau, và khi lệch thì không ai
 * biết bên nào đúng.
 *
 * Cũng không có cột đếm no-show hay tổng chi tiêu — cả hai suy ra từ `reservations`
 * và `orders` đã có sẵn. Đây là hồ sơ, không phải bảng tổng hợp.
 */
export const customers = pgTable(
  'customers',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** Khoá gom duy nhất — chỉ chữ số, đã bỏ khoảng trắng và dấu chấm */
    phone: text('phone').notNull().unique(),
    name: text('name'),
    /** Dị ứng: thứ bếp phải biết TRƯỚC khi món ra, nên là cột chứ không phải ghi chú chung */
    allergies: text('allergies'),
    /** Ghi chú phục vụ: "hay ngồi bàn cửa sổ", "không ăn cay" */
    note: text('note'),
    firstSeenOn: date('first_seen_on').notNull(),
    lastSeenOn: date('last_seen_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('customers_phone_check', sql`${t.phone} ~ '^[0-9]{8,15}$'`),
    check('customers_seen_check', sql`${t.lastSeenOn} >= ${t.firstSeenOn}`),
    index('customers_last_seen_idx').on(t.lastSeenOn),
  ],
)

/**
 * B14 — Sổ điểm, APPEND-ONLY về mặt nghiệp vụ.
 *
 * "Điểm chỉ sinh từ sự kiện `thanh-toan.nhan` — không có nút cộng tay" (§25 B14)
 * được cưỡng chế bằng ba thứ cùng lúc:
 *   · `earn` bắt buộc có `order_id` ⇒ không tích được nếu không có bill;
 *   · UNIQUE `order_id` với dòng `earn` ⇒ một bill tích đúng một lần;
 *   · muốn cộng ngoài luồng thì phải là `adjust`, mà `adjust` bắt buộc có lý do và
 *     người thao tác, và quyền `loyalty.adjust-manual` chỉ R11/R10 có.
 *
 * `reclaim` là thu hồi khi huỷ/hoàn bill — cũng UNIQUE theo đơn, vì huỷ hai lần
 * một bill thì không được trừ điểm khách hai lần.
 */
export const loyaltyEntries = pgTable(
  'loyalty_entries',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customers.id),
    kind: text('kind').notNull(),
    /** Dương khi cộng, ÂM khi trừ — tổng cột này là số dư */
    points: integer('points').notNull(),
    orderId: bigint('order_id', { mode: 'number' }).references(() => orders.id),
    branchId: text('branch_id').references(() => branches.id),
    /** Tiền thực trả sinh ra số điểm này — giữ lại để đối chiếu khi đổi tỷ lệ tích */
    baseVnd: bigint('base_vnd', { mode: 'number' }),
    reason: text('reason'),
    staffId: bigint('staff_id', { mode: 'number' }).references(() => staff.id),
    approvalId: bigint('approval_id', { mode: 'number' }).references(() => approvals.id),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'loyalty_entries_kind_check',
      sql`${t.kind} IN ('earn','redeem','reclaim','adjust','expire')`,
    ),
    check('loyalty_entries_points_check', sql`${t.points} <> 0`),
    // Dấu của điểm phải khớp với loại bút toán, và tích/đổi/thu hồi phải gắn bill
    check(
      'loyalty_entries_shape_check',
      sql`(${t.kind} = 'earn'    AND ${t.points} > 0 AND ${t.orderId} IS NOT NULL)
       OR (${t.kind} = 'redeem'  AND ${t.points} < 0 AND ${t.orderId} IS NOT NULL)
       OR (${t.kind} = 'reclaim' AND ${t.points} < 0 AND ${t.orderId} IS NOT NULL)
       OR (${t.kind} = 'expire'  AND ${t.points} < 0)
       OR (${t.kind} = 'adjust'  AND ${t.reason} IS NOT NULL AND ${t.staffId} IS NOT NULL)`,
    ),
    uniqueIndex('loyalty_entries_one_earn_per_order')
      .on(t.orderId)
      .where(sql`kind = 'earn'`),
    uniqueIndex('loyalty_entries_one_reclaim_per_order')
      .on(t.orderId)
      .where(sql`kind = 'reclaim'`),
    index('loyalty_entries_customer_idx').on(t.customerId, t.businessDate),
  ],
)

// =========================================================== B13 · Phản hồi khách

/**
 * B13 — Phản hồi từ khối đánh giá 1 chạm ở T15 (tại bàn) và O7 (online).
 *
 * MỘT bill một lượt đánh giá: chỉ số duy nhất trên `order_id`. Khách bấm hai lần
 * là sửa lượt cũ chứ không sinh lượt mới, nếu không thì điểm trung bình của một
 * chi nhánh phụ thuộc vào việc ai bấm nhiều hơn.
 *
 * Ba cột hàng đợi (`assigned_to`, `due_at`, `resolution`) nằm cùng bảng chứ không
 * tách ra: một khiếu nại KHÔNG tồn tại độc lập với lượt đánh giá sinh ra nó.
 * `shift_id` chép lại lúc ghi để "điểm trung bình theo ca" không phải suy ngược từ
 * giờ tạo đơn về bảng ca.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    customerId: bigint('customer_id', { mode: 'number' }).references(() => customers.id),
    stars: smallint('stars').notNull(),
    comment: text('comment'),
    /** 'table' = khối T15 · 'online' = khối O7 */
    source: text('source').notNull(),
    shiftId: bigint('shift_id', { mode: 'number' }).references(() => shifts.id),

    state: text('state').notNull().default('new'),
    assignedTo: bigint('assigned_to', { mode: 'number' }).references(() => staff.id),
    /** Hạn phản hồi — quá hạn là màu đỏ trên hàng đợi, không phải lời nhắc suông */
    dueAt: timestamp('due_at', { withTimezone: true }),
    resolution: text('resolution'),
    resolvedBy: bigint('resolved_by', { mode: 'number' }).references(() => staff.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('feedback_one_per_order').on(t.orderId),
    check('feedback_stars_check', sql`${t.stars} BETWEEN 1 AND 5`),
    check('feedback_source_check', sql`${t.source} IN ('table','online')`),
    check('feedback_state_check', sql`${t.state} IN ('new','assigned','resolved')`),
    check(
      'feedback_assigned_check',
      sql`${t.state} <> 'assigned' OR ${t.assignedTo} IS NOT NULL`,
    ),
    // Đóng một khiếu nại mà không ghi đã làm gì thì hàng đợi chỉ là chỗ giấu việc
    check(
      'feedback_resolved_check',
      sql`${t.state} <> 'resolved'
       OR (${t.resolution} IS NOT NULL AND ${t.resolvedAt} IS NOT NULL AND ${t.resolvedBy} IS NOT NULL)`,
    ),
    index('feedback_branch_date_idx').on(t.branchId, t.businessDate),
    index('feedback_queue_idx').on(t.branchId, t.state).where(sql`state <> 'resolved'`),
  ],
)

// ===================================================== B15 · Khách doanh nghiệp

/**
 * B15 — Hồ sơ khách doanh nghiệp.
 *
 * `credit_limit_vnd` và `block_after_overdue_days` là thứ CHẶN được người ta ghi
 * thêm nợ, nên chúng phải ở hồ sơ chứ không phải trong đầu kế toán. Để NULL ở
 * `block_after_overdue_days` nghĩa là "dùng số chung của chuỗi" trong Trung tâm
 * tham số A6 — cùng cách với `einvoice_mode`.
 */
export const corporateCustomers = pgTable(
  'corporate_customers',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    taxCode: text('tax_code').notNull(),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    address: text('address'),

    creditLimitVnd: bigint('credit_limit_vnd', { mode: 'number' }).notNull(),
    /** NET 15 / NET 30 — số ngày từ ngày ghi nợ tới hạn trả */
    paymentTermDays: smallint('payment_term_days').notNull().default(30),
    /** Ngày trong tháng gửi bảng kê đối soát */
    reconcileDay: smallint('reconcile_day').notNull().default(1),
    /** NULL = theo tham số `corporate.blockAfterOverdueDays` của A6 */
    blockAfterOverdueDays: smallint('block_after_overdue_days'),
    /** NULL = theo tham số `corporate.einvoiceMode` của A6 */
    einvoiceMode: text('einvoice_mode'),

    active: boolean('active').notNull().default(true),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('corporate_customers_tax_code_check', sql`${t.taxCode} ~ '^[0-9]{10}(-[0-9]{3})?$'`),
    check('corporate_customers_limit_check', sql`${t.creditLimitVnd} >= 0`),
    check('corporate_customers_term_check', sql`${t.paymentTermDays} BETWEEN 0 AND 180`),
    check('corporate_customers_reconcile_check', sql`${t.reconcileDay} BETWEEN 1 AND 28`),
    check(
      'corporate_customers_block_days_check',
      sql`${t.blockAfterOverdueDays} IS NULL OR ${t.blockAfterOverdueDays} BETWEEN 0 AND 365`,
    ),
    check(
      'corporate_customers_einvoice_mode_check',
      sql`${t.einvoiceMode} IS NULL OR ${t.einvoiceMode} IN ('per-bill','aggregate')`,
    ),
  ],
)

/**
 * Bill ghi nợ công ty — mặt DỒN TÍCH.
 *
 * Cố ý KHÔNG sinh dòng `payments`: tiền chưa về thì sổ quỹ F1 không được thấy gì.
 * Doanh thu vẫn vào báo cáo ngay vì báo cáo đọc `orders.money_total`, không đọc
 * lượt trả. Đây chính là chỗ §G.2 nói "doanh thu ghi nhận ngay, tiền về mới vào
 * dòng tiền".
 *
 * `approval_id` là dấu vết của lượt duyệt R7 khi thu ngân R2 bấm ghi nợ; `signer`
 * là chữ ký khách — hai bằng chứng, một trong hệ thống một ngoài đời, đúng như
 * §4.2b yêu cầu cả hai.
 */
export const corporateCharges = pgTable(
  'corporate_charges',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    corporateId: bigint('corporate_id', { mode: 'number' })
      .notNull()
      .references(() => corporateCustomers.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    chargedOn: date('charged_on').notNull(),
    /** `charged_on` + điều khoản thanh toán; tuổi nợ đếm từ đây */
    dueOn: date('due_on').notNull(),
    /** Người của công ty ký nhận trên bill giấy */
    signer: text('signer'),
    approvalId: bigint('approval_id', { mode: 'number' }).references(() => approvals.id),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('corporate_charges_one_per_order').on(t.orderId),
    check('corporate_charges_amount_check', sql`${t.amountVnd} > 0`),
    check('corporate_charges_due_check', sql`${t.dueOn} >= ${t.chargedOn}`),
    index('corporate_charges_aging_idx').on(t.corporateId, t.dueOn),
    index('corporate_charges_branch_date_idx').on(t.branchId, t.chargedOn),
  ],
)

/**
 * Gạch nợ (tiền về) và xoá nợ (không đòi được nữa) — hai việc khác nhau nên
 * `kind` phân biệt, nhưng cùng một bảng vì cả hai đều làm giảm số dư của một dòng
 * nợ và cả hai đều phải truy được ai làm.
 *
 * `payment_id` nối sang lượt tiền thật của F1: "tiền về khớp ở F1 → gạch nợ ở F5"
 * chỉ kiểm chứng được khi hai đầu trỏ vào nhau.
 */
export const corporateSettlements = pgTable(
  'corporate_settlements',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    chargeId: bigint('charge_id', { mode: 'number' })
      .notNull()
      .references(() => corporateCharges.id),
    kind: text('kind').notNull().default('payment'),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    paidOn: date('paid_on').notNull(),
    paymentId: bigint('payment_id', { mode: 'number' }).references(() => payments.id),
    note: text('note'),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('corporate_settlements_kind_check', sql`${t.kind} IN ('payment','write-off')`),
    check('corporate_settlements_amount_check', sql`${t.amountVnd} > 0`),
    // Xoá nợ là quyết định, không phải thao tác — phải có lý do viết ra
    check(
      'corporate_settlements_writeoff_reason',
      sql`${t.kind} <> 'write-off' OR ${t.note} IS NOT NULL`,
    ),
    index('corporate_settlements_charge_idx').on(t.chargeId),
    index('corporate_settlements_date_idx').on(t.paidOn),
  ],
)
