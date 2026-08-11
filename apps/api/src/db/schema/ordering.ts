import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { dishes } from './catalog'
import { branches, staff } from './identity'
import { tableSessions } from './floorplan'

/**
 * Đơn hàng — nguồn sự thật duy nhất, mọi app đi qua đây.
 *
 * `displayCode` (ON-2608-0417) là thứ khách đọc qua điện thoại; `id` nội bộ là số
 * — hai thứ khác nhau, đừng bắt khách đọc UUID (điểm dễ sai §9.4).
 *
 * Khối tiền do SERVER tính (packages/contracts/money.ts) và đóng băng tại đây;
 * `pricingBundleVersion` ghi lại bản giá đã dùng để truy vết.
 */
export const orders = pgTable(
  'orders',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    displayCode: text('display_code').notNull(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    channel: text('channel').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('new'),
    tableSessionId: bigint('table_session_id', { mode: 'number' }).references(
      () => tableSessions.id,
    ),
    /** Khách online: tên, SĐT, địa chỉ, ghi chú */
    customer: jsonb('customer'),
    slotMode: text('slot_mode'),
    slotAt: timestamp('slot_at', { withTimezone: true }),

    moneySub: bigint('money_sub', { mode: 'number' }).notNull().default(0),
    moneyDiscount: bigint('money_discount', { mode: 'number' }).notNull().default(0),
    moneyService: bigint('money_service', { mode: 'number' }).notNull().default(0),
    moneyVat: bigint('money_vat', { mode: 'number' }).notNull().default(0),
    moneyShip: bigint('money_ship', { mode: 'number' }).notNull().default(0),
    moneyRound: bigint('money_round', { mode: 'number' }).notNull().default(0),
    moneyTotal: bigint('money_total', { mode: 'number' }).notNull().default(0),
    pricingBundleVersion: text('pricing_bundle_version'),

    paymentState: text('payment_state').notNull().default('unpaid'),
    cancelReason: text('cancel_reason'),
    /**
     * Băm của mã theo dõi đơn (O7).
     *
     * Khách online không có tài khoản, nhưng vẫn phải xem được đơn của mình mà
     * không xem được đơn người khác. Cùng cách làm với token bàn: chỉ giữ bản
     * băm, mã gốc trả về đúng một lần lúc đặt.
     */
    trackTokenHash: text('track_token_hash').unique(),
    /** Người giao đơn — drawer gán ship ở P16 / O9 */
    shipper: jsonb('shipper'),
    createdByKind: text('created_by_kind').notNull(),
    createdById: text('created_by_id'),
    /** Optimistic concurrency cho PATCH từ nhiều thiết bị POS */
    version: integer('version').notNull().default(1),

    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    check('orders_channel_check', sql`${t.channel} IN ('web','table','pos','grab','shopee','be')`),
    check('orders_type_check', sql`${t.type} IN ('dinein','takeaway','delivery')`),
    check(
      'orders_status_check',
      sql`${t.status} IN ('new','confirmed','cooking','ready','delivering','done','cancelled')`,
    ),
    check(
      'orders_payment_state_check',
      sql`${t.paymentState} IN ('unpaid','partial','paid','refunded')`,
    ),
    check('orders_slot_mode_check', sql`${t.slotMode} IS NULL OR ${t.slotMode} IN ('asap','scheduled')`),
    check(
      'orders_created_by_kind_check',
      sql`${t.createdByKind} IN ('staff','customer','device','system')`,
    ),
    // Huỷ phải có lý do (§3: POS O9 huỷ có lý do, ghi nhật ký)
    check(
      'orders_cancel_reason_required',
      sql`${t.status} <> 'cancelled' OR ${t.cancelReason} IS NOT NULL`,
    ),
    check('orders_money_nonneg', sql`${t.moneySub} >= 0 AND ${t.moneyTotal} >= 0`),
    // Bảng điều phối O8: chỉ quét đơn đang sống
    index('orders_dispatch_idx')
      .on(t.branchId, t.status, t.createdAt)
      .where(sql`status NOT IN ('done','cancelled')`),
    index('orders_branch_date_idx').on(t.branchId, t.businessDate),
    index('orders_table_session_idx').on(t.tableSessionId),
    /**
     * Mã đơn duy nhất TRONG MỘT CHI NHÁNH, không phải toàn hệ thống.
     *
     * Sổ số đếm chạy riêng cho từng chi nhánh (`display_counters` khoá theo
     * branch_id) nhưng mã in ra chỉ có kỳ và số thứ tự — `ON-2608-0001`. Ràng
     * buộc duy nhất toàn cục vì thế chặn đúng cái đơn ĐẦU TIÊN của chi nhánh thứ
     * hai trong tháng: nó xin số 1, mà số 1 của tháng đó đã thuộc về chi nhánh
     * mở hàng trước. Đo trên bản chạy thật ngày 10-08-2026: Hà Tĩnh không gọi
     * món được vì `ON-2608-0001` đã là đơn của Cầu Giấy từ ngày 02-08.
     *
     * Buộc mã mang chi nhánh thì khách phải đọc một chuỗi dài hơn qua điện
     * thoại, mà hai quán thì không bao giờ đứng cạnh nhau: mã chỉ cần phân biệt
     * được các đơn TRONG một quán.
     */
    uniqueIndex('orders_branch_display_code_unique').on(t.branchId, t.displayCode),
  ],
)

/** Đợt ra món. `held` = chưa bấm "Ra đợt" ⇒ vé bếp waiting, đồng hồ chưa chạy */
export const orderBatches = pgTable(
  'order_batches',
  {
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    batchNo: smallint('batch_no').notNull(),
    state: text('state').notNull().default('held'),
    firedAt: timestamp('fired_at', { withTimezone: true }),
    firedBy: bigint('fired_by', { mode: 'number' }).references(() => staff.id),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.batchNo] }),
    check('order_batches_state_check', sql`${t.state} IN ('held','fired')`),
    check('order_batches_no_check', sql`${t.batchNo} > 0`),
    check(
      'order_batches_fired_at_check',
      sql`(${t.state} = 'held' AND ${t.firedAt} IS NULL) OR (${t.state} = 'fired' AND ${t.firedAt} IS NOT NULL)`,
    ),
  ],
)

/**
 * Dòng đơn. Tên và giá ĐÓNG BĂNG lúc tạo — Office đổi giá không được làm đổi đơn
 * đã tạo (điểm dễ sai §9.2).
 *
 * Dòng set (kind='set_parent') giữ giá; dòng con trỏ về qua `parentLineId`, giá 0,
 * và CHÍNH chúng mới xuống bếp.
 */
export const orderLines = pgTable(
  'order_lines',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    parentLineId: bigint('parent_line_id', { mode: 'number' }),
    kind: text('kind').notNull().default('dish'),
    batchNo: smallint('batch_no').notNull().default(1),

    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id),
    dishCode: text('dish_code').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    qty: integer('qty').notNull(),
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
    priceTotal: bigint('price_total', { mode: 'number' }).notNull(),
    /** [{optionId, name, priceDelta}] đóng băng lúc tạo */
    modifiers: jsonb('modifiers'),

    note: text('note'),
    /** Nhãn set để bếp biết các món ra cùng lúc */
    setLabel: text('set_label'),
    portionLabel: text('portion_label'),
    /** Trạm đã giải ra lúc gửi bếp — ghi lại để đối chiếu khi đổi bàn */
    stationId: text('station_id'),

    state: text('state').notNull().default('draft'),
    voidReason: text('void_reason'),
    voidedBy: bigint('voided_by', { mode: 'number' }).references(() => staff.id),
    approvalId: bigint('approval_id', { mode: 'number' }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('order_lines_kind_check', sql`${t.kind} IN ('dish','set_parent')`),
    check(
      'order_lines_state_check',
      sql`${t.state} IN ('draft','queued','cooking','ready','served','voided')`,
    ),
    check('order_lines_qty_check', sql`${t.qty} > 0`),
    check('order_lines_price_check', sql`${t.unitPrice} >= 0 AND ${t.priceTotal} >= 0`),
    // Dòng con của set không mang giá — giá nằm ở dòng set cha
    check(
      'order_lines_child_price_zero',
      sql`${t.parentLineId} IS NULL OR ${t.priceTotal} = 0`,
    ),
    // Huỷ món phải có lý do
    check(
      'order_lines_void_reason_required',
      sql`${t.state} <> 'voided' OR ${t.voidReason} IS NOT NULL`,
    ),
    index('order_lines_order_idx').on(t.orderId, t.batchNo),
    index('order_lines_parent_idx').on(t.parentLineId),
  ],
)

/**
 * Vùng giao hàng của một chi nhánh (màn O10 của Office).
 *
 * Khớp theo PHƯỜNG/XÃ khách chọn, không theo toạ độ: quán chưa đấu nối dịch vụ
 * bản đồ nào, và ở Việt Nam người ta vẫn đọc địa chỉ theo phường.
 *
 * Một phường chỉ được thuộc một vùng đang bật; CSDL không cưỡng chế được điều đó
 * trên cột mảng nên tầng nghiệp vụ báo lỗi cấu hình khi thấy hai vùng cùng khớp,
 * thay vì lặng lẽ chọn bừa một mức phí.
 */
export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    name: text('name').notNull(),
    /** Danh sách phường/xã thuộc vùng, viết thường không dấu để khớp thẳng */
    wards: text('wards').array().notNull(),
    feeVnd: bigint('fee_vnd', { mode: 'number' }).notNull(),
    /** Đơn dưới mức này thì không nhận giao */
    minOrderVnd: bigint('min_order_vnd', { mode: 'number' }).notNull().default(0),
    /** Thời gian giao dự kiến, phút — cộng vào giờ hẹn hiện cho khách */
    etaMinutes: integer('eta_minutes').notNull().default(30),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check('delivery_zones_fee_nonneg', sql`${t.feeVnd} >= 0 AND ${t.minOrderVnd} >= 0`),
    check('delivery_zones_eta_positive', sql`${t.etaMinutes} > 0`),
    check('delivery_zones_wards_not_empty', sql`array_length(${t.wards}, 1) > 0`),
    index('delivery_zones_branch_idx').on(t.branchId, t.sort),
  ],
)

/**
 * Chỉ mục địa chỉ tra được của vùng quán giao — nguồn gợi ý cho ô địa chỉ.
 *
 * Vì sao TỰ DỰNG thay vì gọi một dịch vụ bản đồ: đo trên OSM ngày 11-08-2026,
 * khu lõi thành phố Hà Tĩnh có 252 đoạn đường mang tên nhưng chỉ **12 điểm có số
 * nhà**. Không nguồn nào — miễn phí hay trả tiền — biết số nhà ở đây, nên số nhà
 * dù sao cũng phải để khách gõ. Thứ còn lại cần tra chỉ là đường, phường và
 * thôn/xóm: với một tỉnh, một quán thì đó là bảng vài nghìn dòng, nằm gọn trong
 * chính CSDL này. Đổi lại được ba thứ mà một API ngoài không cho: không tốn
 * tiền, không phụ thuộc ai, và **thêm tay được** những chỗ dân địa phương gọi
 * bằng tên riêng ("cổng chợ", "ngõ cạnh trường").
 *
 * `ward` RỖNG chứ không NULL khi chưa biết phường. Postgres coi mọi NULL là khác
 * nhau, nên để NULL thì chỉ mục duy nhất bên dưới hết chặn: chạy lại script nạp
 * là mỗi con đường nhân đôi một lần.
 */
export const addressPoints = pgTable(
  'address_points',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** 'ward' phường/xã · 'street' đường/phố/ngõ · 'hamlet' thôn/xóm/TDP · 'poi' mốc quen gọi */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    /** Bản bỏ dấu của `name` — ĐÂY mới là cột được tra, sinh bằng `foldWard()` lúc nạp */
    nameFolded: text('name_folded').notNull(),
    /** Phường/xã chứa điểm này. Rỗng = chưa biết — xem chú của bảng. */
    ward: text('ward').notNull().default(''),
    wardFolded: text('ward_folded').notNull().default(''),
    /**
     * Điểm đại diện, lấy từ OSM lúc nạp. Với một con đường đây là điểm GIỮA
     * đường chứ không phải cửa nhà khách — đủ để tính phí theo bậc khoảng cách,
     * không đủ để chỉ đường cho shipper. Rỗng được: phường và thôn/xóm nạp từ
     * danh mục hành chính nên không kèm toạ độ nào.
     */
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    /** Số lần khách chọn dòng này — quán càng chạy, gợi ý càng đúng chỗ hay đặt */
    hits: integer('hits').notNull().default(0),
  },
  (t) => [
    uniqueIndex('address_points_unique').on(t.kind, t.nameFolded, t.wardFolded),
    index('address_points_search_idx').on(t.nameFolded),
  ],
)

/**
 * Bộ đếm sinh mã hiển thị theo ngày (ON-xxxx). Tách khỏi id nội bộ để khách đọc
 * được qua điện thoại. Cấp số bằng UPSERT … RETURNING trong transaction.
 */
export const displayCounters = pgTable(
  'display_counters',
  {
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    kind: text('kind').notNull(),
    businessDate: date('business_date').notNull(),
    counter: integer('counter').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.kind, t.businessDate] })],
)
