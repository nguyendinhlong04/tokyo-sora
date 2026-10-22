import { sql } from 'drizzle-orm'
import type { VatRateTotals } from '@sora/contracts'
import {
  type AnyPgColumn,
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { approvals } from './ledger'
import { branches, staff } from './identity'
import { orders } from './ordering'

/**
 * ====== KẾ TOÁN: HOÁ ĐƠN ĐIỆN TỬ & KHOÁ SỔ ======
 *
 * Bối cảnh pháp lý (§30.2): nhà hàng thuộc nhóm bắt buộc dùng hoá đơn điện tử
 * khởi tạo từ máy tính tiền có kết nối cơ quan thuế. Ký hiệu 6 ký tự có chữ M,
 * mỗi địa điểm kinh doanh một ký hiệu riêng. *Phần pháp lý cần kế toán xác nhận
 * lại* — bản dựng này ghi đúng thứ tài liệu mô tả, không tự suy diễn thêm.
 */

/**
 * F3 — Sổ hoá đơn điện tử.
 *
 * MỘT hoá đơn cho một đơn hàng: chỉ số duy nhất bên dưới cưỡng chế điều đó, vì
 * phát hành hai hoá đơn cho cùng một bill là sai phạm thuế chứ không phải lỗi
 * hiển thị. Hoá đơn thay thế trỏ về bản cũ qua `replacesId` và bản cũ chuyển
 * trạng thái `replaced` — giữ nguyên bản gốc, đúng quy tắc cứng §4.3.2.
 *
 * `state = 'pending'` là hàng đợi lỗi: bill đã in, hoá đơn chưa lên được cơ quan
 * thuế. Khách vẫn về được, kế toán phát hành bù (§30.2) — nên trạng thái này phải
 * TỒN TẠI trong lược đồ chứ không phải một biến tạm trong bộ nhớ.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),

    /** Ký hiệu mẫu số: 1 = hoá đơn GTGT (doanh nghiệp khấu trừ thuế) — TT 91/2026 Phụ lục I */
    formNo: text('form_no').notNull().default('1'),
    /**
     * Ký hiệu 6 ký tự có chữ M, riêng theo địa điểm kinh doanh (A9 · A6). Hai số
     * sau chữ C/K là NĂM của ngày lập hoá đơn — sang năm mới là ký hiệu mới, số
     * đếm lại từ 1 (bộ đếm `einvoice_counters` khoá theo đúng chuỗi này).
     */
    serial: text('serial').notNull(),
    /** Số hoá đơn trong ký hiệu; NULL khi chưa cấp. Đã cấp thì không bao giờ đổi (9008) */
    invoiceNo: text('invoice_no'),
    /** Ngày lập hoá đơn theo giờ chi nhánh — có cùng lúc với số */
    invoiceDate: date('invoice_date'),
    /**
     * Mã cơ quan thuế cấp — bằng chứng hoá đơn đã lên hệ thống thuế. Tên cột là
     * di sản (không phải MST người mua); API trả ra với tên `authorityCode`.
     */
    taxCode: text('tax_code'),
    /** Mã và đường dẫn người mua tự tra cứu hoá đơn — in thành QR trên bill */
    lookupCode: text('lookup_code'),
    lookupUrl: text('lookup_url'),
    /** Nhà cung cấp đã phát hành (`mock`, …) và mã giao dịch phía họ */
    provider: text('provider'),
    providerRef: text('provider_ref'),

    state: text('state').notNull().default('pending'),
    /** Lý do lần phát hành gần nhất thất bại — nguồn của hàng đợi lỗi F3 */
    lastError: text('last_error'),
    lastErrorCode: text('last_error_code'),
    /**
     * Khoá gửi kèm mọi lượt gọi nhà cung cấp cho hoá đơn này. Lượt trước chết giữa
     * chừng (Vercel cắt hàm) mà lượt sau gửi lại thì nhà cung cấp nhận ra là một —
     * không thành hai hoá đơn thật cho một bill.
     */
    requestKey: uuid('request_key').notNull().defaultRandom(),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    /** Đang có lượt phát hành giữ hoá đơn này tới lúc này — lượt khác đứng ngoài */
    leaseUntil: timestamp('lease_until', { withTimezone: true }),

    /** consumer = "Bán cho người tiêu dùng" — khách không yêu cầu ghi thông tin */
    buyerKind: text('buyer_kind').notNull().default('consumer'),
    buyerName: text('buyer_name'),
    /** MST tổ chức (10 / 10-3 số) hoặc của cá nhân (10 số, số định danh 12 số) */
    buyerTaxCode: text('buyer_tax_code'),
    buyerAddress: text('buyer_address'),
    buyerEmail: text('buyer_email'),
    buyerPhone: text('buyer_phone'),
    /** Hình thức thanh toán in trên hoá đơn: TM, CK, Thẻ, Công nợ, ghép bằng "/" */
    paymentMethod: text('payment_method'),

    /** Đóng băng lúc phát hành — hoá đơn không đổi theo đơn về sau */
    amountSub: bigint('amount_sub', { mode: 'number' }).notNull(),
    amountDiscount: bigint('amount_discount', { mode: 'number' }).notNull().default(0),
    amountService: bigint('amount_service', { mode: 'number' }).notNull().default(0),
    amountShip: bigint('amount_ship', { mode: 'number' }).notNull().default(0),
    amountVat: bigint('amount_vat', { mode: 'number' }).notNull(),
    /** Chênh làm tròn của bill — có thể âm */
    amountRound: bigint('amount_round', { mode: 'number' }).notNull().default(0),
    amountTotal: bigint('amount_total', { mode: 'number' }).notNull(),
    /** Tiền theo từng thuế suất — nguồn của F4 */
    vatBreakdown: jsonb('vat_breakdown').$type<VatRateTotals[]>().notNull().default([]),
    /** Toàn bộ hoá đơn đã gửi đi (người bán, người mua, từng dòng) — dựng lại mỗi lượt cho tới khi phát hành */
    snapshot: jsonb('snapshot'),

    /** Hoá đơn này thay thế bản nào */
    replacesId: bigint('replaces_id', { mode: 'number' }).references(
      (): AnyPgColumn => invoices.id,
    ),
    voidReason: text('void_reason'),
    approvalId: bigint('approval_id', { mode: 'number' }).references(() => approvals.id),
    voidedBy: bigint('voided_by', { mode: 'number' }).references(() => staff.id),

    issuedAt: timestamp('issued_at', { withTimezone: true }),
    issuedBy: bigint('issued_by', { mode: 'number' }).references(() => staff.id),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'invoices_state_check',
      sql`${t.state} IN ('pending','issued','failed','voided','replaced')`,
    ),
    check('invoices_form_check', sql`${t.formNo} ~ '^[1-9]$'`),
    // Đã phát hành thì phải có đủ số hoá đơn và mã cơ quan thuế
    check(
      'invoices_issued_check',
      sql`${t.state} <> 'issued'
       OR (${t.invoiceNo} IS NOT NULL AND ${t.taxCode} IS NOT NULL AND ${t.issuedAt} IS NOT NULL)`,
    ),
    check('invoices_numbered_check', sql`${t.invoiceNo} IS NULL OR ${t.invoiceDate} IS NOT NULL`),
    /**
     * Huỷ và thay thế phải có lý do. Bản ghi duyệt KHÔNG bắt buộc ở đây: người được
     * làm thẳng (ô ✓ của §4.2) không sinh bản ghi duyệt nào — đòi nó ở CSDL từng làm
     * kế toán huỷ hoá đơn là ra lỗi 500. Ai cần duyệt thì tầng dịch vụ đã đòi.
     */
    check('invoices_void_check', sql`${t.state} <> 'voided' OR ${t.voidReason} IS NOT NULL`),
    check('invoices_replaced_check', sql`${t.state} <> 'replaced' OR ${t.voidReason} IS NOT NULL`),
    check('invoices_buyer_kind_check', sql`${t.buyerKind} IN ('consumer','company','person')`),
    // Doanh nghiệp phải có MST và địa chỉ; người tiêu dùng không mang thông tin người mua
    check(
      'invoices_buyer_check',
      sql`CASE ${t.buyerKind}
        WHEN 'consumer' THEN ${t.buyerName} IS NULL AND ${t.buyerTaxCode} IS NULL
        WHEN 'company' THEN ${t.buyerName} IS NOT NULL AND ${t.buyerAddress} IS NOT NULL
          AND ${t.buyerTaxCode} ~ '^[0-9]{10}(-[0-9]{3})?$'
        ELSE ${t.buyerName} IS NOT NULL
          AND (${t.buyerTaxCode} IS NULL OR ${t.buyerTaxCode} ~ '^([0-9]{10}|[0-9]{12})$')
      END`,
    ),
    check(
      'invoices_amount_check',
      sql`${t.amountSub} >= 0 AND ${t.amountDiscount} >= 0 AND ${t.amountService} >= 0
        AND ${t.amountShip} >= 0 AND ${t.amountVat} >= 0 AND ${t.amountTotal} >= 0`,
    ),
    check('invoices_attempts_check', sql`${t.attempts} >= 0`),
    /** Một đơn một hoá đơn còn hiệu lực; bản đã huỷ/đã thay thế không chiếm chỗ */
    uniqueIndex('invoices_one_live_per_order')
      .on(t.orderId)
      .where(sql`state IN ('pending','issued','failed')`),
    /** Một hoá đơn chỉ có MỘT bản thay thế còn hiệu lực */
    uniqueIndex('invoices_one_live_replacement')
      .on(t.replacesId)
      .where(sql`replaces_id IS NOT NULL AND state IN ('pending','issued','failed')`),
    uniqueIndex('invoices_serial_number_unique')
      .on(t.serial, t.invoiceNo)
      .where(sql`invoice_no IS NOT NULL`),
    uniqueIndex('invoices_request_key_unique').on(t.requestKey),
    index('invoices_branch_date_idx').on(t.branchId, t.businessDate),
    index('invoices_queue_idx').on(t.branchId, t.state).where(sql`state IN ('pending','failed')`),
  ],
)

/**
 * Bộ đếm số hoá đơn theo ký hiệu.
 *
 * Số phải liên tục, tăng dần trong một ký hiệu (NĐ 254, Phụ lục mục 2). Lấy số
 * bằng `max(invoice_no) … FOR UPDATE` chỉ khoá dòng đang lớn nhất: hai máy cùng
 * phát hành đọc cùng một số lớn nhất và cấp trùng. UPSERT … RETURNING trên đúng
 * một dòng của ký hiệu là chỗ tuần tự hoá duy nhất cần có.
 */
export const einvoiceCounters = pgTable(
  'einvoice_counters',
  {
    serial: text('serial').primaryKey(),
    lastNo: integer('last_no').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('einvoice_counters_no_check', sql`${t.lastNo} BETWEEN 1 AND 99999999`)],
)

/**
 * Danh bạ người mua là doanh nghiệp, theo MST — để gõ MST là điền sẵn tên, địa chỉ.
 *
 * Nguồn: hoá đơn đã phát hành (`invoice`) hoặc tra cứu mã số thuế (`lookup`).
 * CHỈ MST tổ chức: số định danh 12 số của cá nhân là dữ liệu cá nhân, không bao
 * giờ vào đây — ràng buộc dạng MST bên dưới chặn luôn ở CSDL.
 */
export const invoiceBuyers = pgTable(
  'invoice_buyers',
  {
    taxCode: text('tax_code').primaryKey(),
    name: text('name').notNull(),
    address: text('address'),
    /** Email nhận hoá đơn lần gần nhất — chỉ nhân viên thấy */
    email: text('email'),
    /** Tình trạng hoạt động theo tra cứu, vd "Đang hoạt động" */
    status: text('status'),
    source: text('source').notNull(),
    lookedUpAt: timestamp('looked_up_at', { withTimezone: true }),
    lastInvoicedAt: timestamp('last_invoiced_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('invoice_buyers_tax_code_check', sql`${t.taxCode} ~ '^[0-9]{10}(-[0-9]{3})?$'`),
    check('invoice_buyers_source_check', sql`${t.source} IN ('invoice','lookup')`),
  ],
)

/**
 * F6 — Khoá sổ kỳ. Một dòng = một tháng đã chốt của một chi nhánh.
 *
 * KHÔNG CÓ MỞ KHOÁ. Đó không phải thiếu sót mà là toàn bộ giá trị của màn này:
 * "sau khoá chặn sửa cả doanh thu, phiếu chi, bảng công, kỳ lương kỳ đó — chỉ
 * tạo bút toán điều chỉnh kỳ sau" (§28 F6). Một cái khoá mở được thì không khoá
 * gì cả.
 *
 * Chốt chặn cho sai sót: tầng dịch vụ từ chối khoá tháng CHƯA KẾT THÚC, nên
 * không ai vô tình khoá tháng đang bán rồi tự chặn chính mình.
 */
export const periodLocks = pgTable(
  'period_locks',
  {
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    /** Tháng dạng YYYY-MM-01 */
    month: date('month').notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow(),
    lockedBy: bigint('locked_by', { mode: 'number' }).references(() => staff.id),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.month] })],
)
