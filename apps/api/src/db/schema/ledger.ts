import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { branches, staff } from './identity'

/**
 * ====== SỔ BẤT BIẾN ======
 * Năm bảng dưới đây là APPEND-ONLY, cưỡng chế bằng HAI LỚP (xem migration guards):
 *   1. Role `sora_app` lúc chạy chỉ được SELECT/INSERT — không có UPDATE/DELETE.
 *   2. Trigger BEFORE UPDATE OR DELETE ném lỗi.
 * Sửa sai = ghi bút toán ngược, không bao giờ sửa dòng cũ (quy tắc cứng §4.3.2).
 */

/** Nhật ký thao tác A7 — mọi hành động nhạy cảm */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id').references(() => branches.id),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id'),
    /** 'order.line.void' · 'routing.changed' · 'param.updated' … */
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    payload: jsonb('payload'),
    approvalId: bigint('approval_id', { mode: 'number' }),
    deviceId: bigint('device_id', { mode: 'number' }),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'audit_log_actor_kind_check',
      sql`${t.actorKind} IN ('staff','customer','device','system')`,
    ),
    index('audit_log_branch_time_idx').on(t.branchId, t.createdAt),
    index('audit_log_entity_idx').on(t.entity, t.entityId),
  ],
)

/**
 * Bản ghi duyệt △ (§4.3.1): ai xin, ai duyệt, lý do, thời điểm.
 * Phân tách nhiệm vụ: `requested_by <> approved_by` — cưỡng chế ngay ở CSDL.
 */
export const approvals = pgTable(
  'approvals',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id').references(() => branches.id),
    action: text('action').notNull(),
    requestedBy: bigint('requested_by', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    approvedBy: bigint('approved_by', { mode: 'number' })
      .notNull()
      .references(() => staff.id),
    reason: text('reason').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('approvals_separation_of_duties', sql`${t.requestedBy} <> ${t.approvedBy}`),
    index('approvals_entity_idx').on(t.entity, t.entityId),
  ],
)

/** Nhật ký doanh thu F2 — sổ bất biến, chỉ đọc từ Office */
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    kind: text('kind').notNull(),
    orderId: bigint('order_id', { mode: 'number' }),
    paymentId: bigint('payment_id', { mode: 'number' }),
    /** VND nguyên; bút toán ngược ghi số âm */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    actorId: bigint('actor_id', { mode: 'number' }).references(() => staff.id),
    approvalId: bigint('approval_id', { mode: 'number' }).references(() => approvals.id),
    memo: text('memo'),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'journal_entries_kind_check',
      sql`${t.kind} IN ('sale','discount','comp','void','refund','payment','shift_adjust')`,
    ),
    index('journal_entries_branch_date_idx').on(t.branchId, t.businessDate),
  ],
)

/**
 * Outbox — xương sống sự kiện. Ghi CÙNG TRANSACTION với thay đổi nghiệp vụ, một
 * dispatcher in-process đọc và phát qua Socket.IO. Crash giữa commit và phát thì
 * phát lại khi boot ⇒ **vé bếp không thể mất**.
 *
 * `id` chính là `seq` đơn điệu tăng mà client dùng để phát hiện hở sự kiện.
 * Đây là bảng append-only DUY NHẤT được phép UPDATE — nhưng chỉ cột `dispatched_at`.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    branchId: text('branch_id'),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  },
  (t) => [
    index('outbox_events_branch_idx').on(t.branchId, t.id),
    index('outbox_events_undispatched_idx')
      .on(t.id)
      .where(sql`dispatched_at IS NULL`),
  ],
)

/**
 * Khoá idempotency — nền để hàng đợi offline của POS/KDS gửi lại mù mà không sinh
 * đơn trùng. Cùng key + cùng hash body ⇒ trả lại response cũ; khác hash ⇒ 409.
 * Dọn sau 48h.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    actor: text('actor').notNull(),
    endpoint: text('endpoint').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idempotency_keys_created_idx').on(t.createdAt)],
)
