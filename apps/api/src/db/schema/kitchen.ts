import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { dishes, stations } from './catalog'
import { branches } from './identity'
import { orderLines, orders } from './ordering'

/**
 * Vé bếp — một vé cho mỗi (trạm × đợt), KHÔNG phải một vé cho cả đơn.
 *
 * Quy tắc cứng: bảng này và ticket_items KHÔNG CÓ CỘT TIỀN NÀO. Bếp chỉ tiêu thụ
 * vé, không biết giá, không biết khách là ai (TRIEN-KHAI nguyên tắc 3) — schema
 * cưỡng chế điều đó thay vì trông chờ vào kỷ luật code.
 *
 * `state = 'waiting'` = đợt chưa bấm "Ra đợt" ⇒ ĐỒNG HỒ CHƯA CHẠY. Đồng hồ tính từ
 * `queued_at`, không phải từ lúc khách bấm đặt (điểm dễ sai §9.5).
 */
export const tickets = pgTable(
  'tickets',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** A-0412 (ST-06) và B-0412 (ST-02) là hai vé của cùng đơn 0412 */
    displayCode: text('display_code').notNull(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    stationId: text('station_id')
      .notNull()
      .references(() => stations.id),
    source: text('source').notNull(),
    /** Số bàn hiển thị; NULL với đơn mang về/giao hàng */
    tableCode: text('table_code'),
    batchNo: smallint('batch_no').notNull(),
    priority: text('priority').notNull().default('normal'),
    state: text('state').notNull().default('waiting'),
    /** 'Bàn 05 không có bếp' — giải thích cho đầu bếp vì sao món về ST-06 */
    grillServiceNote: text('grill_service_note'),
    /** Thời gian chuẩn của vé, giây — nguồn tính dueAt và thang than hồng */
    prepSeconds: integer('prep_seconds').notNull(),

    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    queuedAt: timestamp('queued_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** Đơn hẹn giờ: mốc phải bắt đầu nấu — KDS đếm NGƯỢC tới đây */
    startBy: timestamp('start_by', { withTimezone: true }),
  },
  (t) => [
    check('tickets_source_check', sql`${t.source} IN ('online','table','pos')`),
    check('tickets_priority_check', sql`${t.priority} IN ('normal','rush','late')`),
    check(
      'tickets_state_check',
      sql`${t.state} IN ('waiting','queued','cooking','ready','closed','voided')`,
    ),
    // Đồng hồ chỉ chạy khi vé đã vào hàng
    check(
      'tickets_clock_check',
      sql`(${t.state} = 'waiting' AND ${t.queuedAt} IS NULL) OR (${t.state} <> 'waiting' AND ${t.queuedAt} IS NOT NULL)`,
    ),
    check('tickets_prep_seconds_check', sql`${t.prepSeconds} > 0`),
    // Hàng vé K2: mỗi trạm chỉ kéo vé của mình
    index('tickets_station_queue_idx').on(t.branchId, t.stationId, t.state, t.openedAt),
    // K6 Expo gom theo đơn
    index('tickets_order_idx').on(t.orderId),
    index('tickets_live_idx')
      .on(t.branchId, t.state)
      .where(sql`state IN ('waiting','queued','cooking')`),
  ],
)

/**
 * Món trên vé. `linkGroup` nối các phần của MỘT món đa trạm nằm ở hai vé khác trạm
 * (Sukiyaki: nồi ST-04 + khay thịt ST-02) — Expo chỉ báo sẵn sàng khi cả nhóm xong.
 * Đặt ở item chứ không ở vé vì hai món đa trạm khác nhau có thể cùng rơi vào một vé.
 */
export const ticketItems = pgTable(
  'ticket_items',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    ticketId: bigint('ticket_id', { mode: 'number' })
      .notNull()
      .references(() => tickets.id),
    orderLineId: bigint('order_line_id', { mode: 'number' })
      .notNull()
      .references(() => orderLines.id),
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id),
    nameSnapshot: text('name_snapshot').notNull(),
    qty: integer('qty').notNull(),
    note: text('note'),
    setLabel: text('set_label'),
    /** 'nồi' / 'khay thịt' — chỉ món đa trạm */
    componentLabel: text('component_label'),
    /** '100g' · '3 con' — định lượng của set */
    portionLabel: text('portion_label'),
    linkGroup: text('link_group'),
    state: text('state').notNull().default('queued'),
    /** Cân điện tử ST-02 tự điền */
    weightGrams: integer('weight_grams'),
  },
  (t) => [
    check('ticket_items_state_check', sql`${t.state} IN ('queued','cooking','done','voided')`),
    check('ticket_items_qty_check', sql`${t.qty} > 0`),
    index('ticket_items_ticket_idx').on(t.ticketId),
    index('ticket_items_link_group_idx').on(t.linkGroup),
  ],
)
