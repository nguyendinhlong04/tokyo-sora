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
import { employees } from './hr'
import { branches, staff } from './identity'

/**
 * ====== CHI PHÍ & TÀI SẢN ======
 *
 * Toàn bộ nhóm này xoay quanh MỘT phân biệt mà §29.4 gọi là chỗ chủ quán hay nhầm
 * nhất:
 *
 *   · **Tạm ứng** và **trả nợ** là TIỀN RA nhưng KHÔNG phải chi phí.
 *   · **Khấu hao** là CHI PHÍ nhưng KHÔNG phải tiền ra.
 *
 * Nên hai mặt đó là hai bảng khác nhau, không phải hai cột của một bảng:
 *   `expense_vouchers` ghi TIỀN RA (mặt dòng tiền, đối chiếu sổ quỹ F1),
 *   `expense_entries`  ghi CHI PHÍ theo kỳ (mặt dồn tích, đổ vào Lãi/Lỗ F7).
 *
 * Một phiếu chi 6 tháng tiền nhà = MỘT dòng tiền ra + SÁU dòng chi phí. Một phiếu
 * tạm ứng = một dòng tiền ra + KHÔNG dòng chi phí nào. Một tháng khấu hao = không
 * dòng tiền nào + một dòng chi phí. Cấu trúc này làm cả ba trường hợp tự đúng mà
 * không cần chỗ nào nhớ trừ ra.
 */

/**
 * C6 — Cây khoản mục. `parentId` cho phép nhiều cấp; F7 đọc theo `pnlLine` để
 * biết dòng nào của Lãi/Lỗ nhận khoản mục này.
 *
 * `pnlLine` là thứ nối C6 với F7. Không có nó thì mỗi lần thêm khoản mục lại phải
 * sửa mã nguồn báo cáo để biết xếp nó vào đâu.
 */
export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    /** Dòng của F7 mà khoản mục này cộng vào */
    pnlLine: text('pnl_line').notNull(),
    /** Khoản mục do máy tự ghi (giá vốn, nhân sự, khấu hao) — người không nhập tay */
    automatic: boolean('automatic').notNull().default(false),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    check(
      'expense_categories_pnl_line_check',
      sql`${t.pnlLine} IN ('cogs','labour','rent','utilities','depreciation','marketing','payment-fee','other-opex','tax')`,
    ),
    index('expense_categories_parent_idx').on(t.parentId, t.sort),
  ],
)

/** Ngân sách tháng theo khoản mục × chi nhánh (C6) — nguồn cảnh báo vượt ở C1 */
export const expenseBudgets = pgTable(
  'expense_budgets',
  {
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    /** Tháng dạng YYYY-MM-01 */
    month: date('month').notNull(),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.branchId, t.categoryId, t.month] }),
    check('expense_budgets_amount_check', sql`${t.amountVnd} >= 0`),
  ],
)

/**
 * C2 — Sổ phiếu chi. Đây là mặt DÒNG TIỀN: mỗi dòng là một lần tiền rời khỏi quán.
 *
 * `kind = 'advance'` là tạm ứng nhân viên: tiền ra thật, nhưng không sinh dòng chi
 * phí nào — nó là khoản phải thu, và sẽ khấu trừ vào kỳ lương H7.
 */
export const expenseVouchers = pgTable(
  'expense_vouchers',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    kind: text('kind').notNull().default('expense'),
    supplier: text('supplier'),
    memo: text('memo'),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    /** VAT đầu vào được khấu trừ — nguồn cho F4; màn C5 chưa dựng nên nhập tại đây */
    vatVnd: bigint('vat_vnd', { mode: 'number' }).notNull().default(0),
    /** Tiền mặt trừ thẳng sổ quỹ F1; chuyển khoản đối chiếu sao kê */
    method: text('method').notNull(),

    /**
     * Số THÁNG phân bổ chi phí. 1 = ghi hết vào tháng chi. 6 = trả trước 6 tháng
     * tiền nhà: tiền ra một lần, chi phí chia đều sáu tháng trên Lãi/Lỗ.
     */
    amortizeMonths: integer('amortize_months').notNull().default(1),
    /** Tháng đầu tiên chịu chi phí, dạng YYYY-MM-01 */
    amortizeFrom: date('amortize_from').notNull(),

    /** Tạm ứng cho ai — bắt buộc khi `kind = 'advance'` */
    advanceEmployeeId: bigint('advance_employee_id', { mode: 'number' }).references(
      () => employees.id,
    ),
    /** Kỳ lương đã khấu trừ khoản tạm ứng này; NULL = chưa trừ */
    settledPeriodId: bigint('settled_period_id', { mode: 'number' }),

    state: text('state').notNull().default('draft'),
    /** Phiếu do C3 tự sinh — người chỉ việc điền số thật rồi duyệt */
    recurringId: bigint('recurring_id', { mode: 'number' }),
    /** Tài sản sinh ra phiếu này (mua sắm ≥ ngưỡng) */
    assetId: bigint('asset_id', { mode: 'number' }),

    paidOn: date('paid_on').notNull(),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    approvedBy: bigint('approved_by', { mode: 'number' }).references(() => staff.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('expense_vouchers_kind_check', sql`${t.kind} IN ('expense','advance')`),
    check('expense_vouchers_method_check', sql`${t.method} IN ('cash','transfer')`),
    check('expense_vouchers_state_check', sql`${t.state} IN ('draft','approved','void')`),
    check('expense_vouchers_amount_check', sql`${t.amountVnd} > 0`),
    check('expense_vouchers_vat_check', sql`${t.vatVnd} >= 0 AND ${t.vatVnd} <= ${t.amountVnd}`),
    check('expense_vouchers_amortize_check', sql`${t.amortizeMonths} BETWEEN 1 AND 60`),
    // Tạm ứng phải nói được ứng cho ai, và không phân bổ vì nó không phải chi phí
    check(
      'expense_vouchers_advance_check',
      sql`${t.kind} <> 'advance'
       OR (${t.advanceEmployeeId} IS NOT NULL AND ${t.amortizeMonths} = 1)`,
    ),
    check(
      'expense_vouchers_approved_check',
      sql`(${t.state} = 'approved') = (${t.approvedAt} IS NOT NULL)`,
    ),
    index('expense_vouchers_branch_date_idx').on(t.branchId, t.paidOn),
    index('expense_vouchers_category_idx').on(t.categoryId, t.paidOn),
  ],
)

/**
 * Mặt DỒN TÍCH: chi phí thuộc về tháng nào. Một dòng = một khoản mục × một tháng
 * × một nguồn.
 *
 * Sinh tự động, không có cửa nhập tay: từ phiếu chi đã duyệt (chia đều theo kỳ
 * phân bổ) và từ khấu hao tháng của tài sản. Khoá duy nhất bên dưới là thứ khiến
 * chạy lại lệnh sinh khấu hao nhiều lần cũng không ghi trùng.
 */
export const expenseEntries = pgTable(
  'expense_entries',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    /** Tháng chịu chi phí, dạng YYYY-MM-01 */
    month: date('month').notNull(),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    source: text('source').notNull(),
    voucherId: bigint('voucher_id', { mode: 'number' }).references(() => expenseVouchers.id),
    assetId: bigint('asset_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('expense_entries_source_check', sql`${t.source} IN ('voucher','depreciation')`),
    check('expense_entries_amount_check', sql`${t.amountVnd} > 0`),
    check(
      'expense_entries_source_link',
      sql`(${t.source} = 'voucher' AND ${t.voucherId} IS NOT NULL)
       OR (${t.source} = 'depreciation' AND ${t.assetId} IS NOT NULL)`,
    ),
    /** Một tài sản khấu hao ĐÚNG MỘT LẦN mỗi tháng */
    uniqueIndex('expense_entries_one_depreciation_per_month')
      .on(t.assetId, t.month)
      .where(sql`source = 'depreciation'`),
    index('expense_entries_branch_month_idx').on(t.branchId, t.month),
    index('expense_entries_voucher_idx').on(t.voucherId),
  ],
)

/** C3 — Chi phí định kỳ: hằng tháng sinh một phiếu chi NHÁP chờ điền số thật */
export const recurringExpenses = pgTable(
  'recurring_expenses',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    name: text('name').notNull(),
    supplier: text('supplier'),
    /** Số tiền DỰ KIẾN — điện nước biến động thì phiếu nháp chờ điền số thật */
    expectedVnd: bigint('expected_vnd', { mode: 'number' }).notNull(),
    /** Ngày trong tháng sinh phiếu (1–28; chọn tới 28 để tháng nào cũng có) */
    dayOfMonth: integer('day_of_month').notNull(),
    method: text('method').notNull().default('transfer'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    check('recurring_expenses_day_check', sql`${t.dayOfMonth} BETWEEN 1 AND 28`),
    check('recurring_expenses_amount_check', sql`${t.expectedVnd} > 0`),
    check('recurring_expenses_method_check', sql`${t.method} IN ('cash','transfer')`),
    index('recurring_expenses_branch_idx').on(t.branchId, t.active),
  ],
)

/**
 * C4 — Tài sản. Khấu hao ĐƯỜNG THẲNG: nguyên giá chia đều số tháng, tháng cuối
 * nhận phần dư để tổng khấu hao đúng bằng nguyên giá.
 */
export const assets = pgTable(
  'assets',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    name: text('name').notNull(),
    costVnd: bigint('cost_vnd', { mode: 'number' }).notNull(),
    /** Tháng bắt đầu tính khấu hao, dạng YYYY-MM-01 */
    inServiceFrom: date('in_service_from').notNull(),
    depreciationMonths: integer('depreciation_months').notNull(),
    /** Thanh lý / hỏng — ngừng sinh khấu hao từ tháng này */
    retiredOn: date('retired_on'),
    note: text('note'),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('assets_cost_check', sql`${t.costVnd} > 0`),
    check('assets_months_check', sql`${t.depreciationMonths} BETWEEN 1 AND 600`),
    index('assets_branch_idx').on(t.branchId, t.inServiceFrom),
  ],
)
