import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

    /** Ký hiệu 6 ký tự có chữ M, riêng theo địa điểm kinh doanh (A9 · A6) */
    serial: text('serial').notNull(),
    /** Số hoá đơn trong ký hiệu; NULL khi chưa phát hành được */
    invoiceNo: text('invoice_no'),
    /** Mã cơ quan thuế cấp — bằng chứng hoá đơn đã lên hệ thống thuế */
    taxCode: text('tax_code'),

    state: text('state').notNull().default('pending'),
    /** Lý do lần phát hành gần nhất thất bại — nguồn của hàng đợi lỗi F3 */
    lastError: text('last_error'),

    /** Người mua, chỉ điền khi khách yêu cầu hoặc bán cho khách doanh nghiệp */
    buyerName: text('buyer_name'),
    buyerTaxCode: text('buyer_tax_code'),

    /** Đóng băng lúc phát hành — hoá đơn không đổi theo đơn về sau */
    amountSub: bigint('amount_sub', { mode: 'number' }).notNull(),
    amountVat: bigint('amount_vat', { mode: 'number' }).notNull(),
    amountTotal: bigint('amount_total', { mode: 'number' }).notNull(),

    /** Hoá đơn này thay thế bản nào */
    replacesId: bigint('replaces_id', { mode: 'number' }),
    voidReason: text('void_reason'),
    approvalId: bigint('approval_id', { mode: 'number' }).references(() => approvals.id),

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
    // Đã phát hành thì phải có đủ số hoá đơn và mã cơ quan thuế
    check(
      'invoices_issued_check',
      sql`${t.state} <> 'issued'
       OR (${t.invoiceNo} IS NOT NULL AND ${t.taxCode} IS NOT NULL AND ${t.issuedAt} IS NOT NULL)`,
    ),
    // Huỷ phải có lý do và bản ghi duyệt (§4.2 dòng huỷ/thay thế/điều chỉnh HĐĐT)
    check(
      'invoices_void_check',
      sql`${t.state} <> 'voided' OR (${t.voidReason} IS NOT NULL AND ${t.approvalId} IS NOT NULL)`,
    ),
    check('invoices_amount_check', sql`${t.amountTotal} >= 0 AND ${t.amountVat} >= 0`),
    /** Một đơn một hoá đơn còn hiệu lực; bản đã huỷ/đã thay thế không chiếm chỗ */
    uniqueIndex('invoices_one_live_per_order')
      .on(t.orderId)
      .where(sql`state IN ('pending','issued','failed')`),
    uniqueIndex('invoices_serial_number_unique')
      .on(t.serial, t.invoiceNo)
      .where(sql`invoice_no IS NOT NULL`),
    index('invoices_branch_date_idx').on(t.branchId, t.businessDate),
    index('invoices_queue_idx').on(t.branchId, t.state).where(sql`state IN ('pending','failed')`),
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
