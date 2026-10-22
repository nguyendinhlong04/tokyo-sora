import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm'
import { orders, tickets } from '../../db/schema'
import type { DateRange } from './domain/period'

/**
 * Định nghĩa số liệu DÙNG CHUNG — B2, báo cáo công việc (tự điền) và KPI phải ra
 * cùng một con số cho cùng một ngày. Mỗi định nghĩa sống đúng một chỗ ở đây; nơi
 * nào tự viết lại công thức là nơi đó sớm muộn lệch với B2.
 *
 * File TS thường chứ không phải provider: import mảnh SQL không kéo theo phụ
 * thuộc module.
 */

/**
 * Doanh thu THỰC của một đơn: tạm tính trừ giảm giá cộng phí phục vụ.
 *
 * KHÔNG lấy `moneyTotal`: nó gồm cả VAT và phí ship, mà VAT là tiền thu hộ nhà
 * nước còn ship là tiền trả hộ người giao — cộng chúng vào doanh thu là tự khai
 * khống đúng bằng hai khoản không phải của quán.
 */
export const netRevenue = sql`${orders.moneySub} - ${orders.moneyDiscount} + ${orders.moneyService}`

/** Đơn được tính vào doanh thu: đã trả tiền và không bị huỷ */
export const soldOrders = (branchId: string, range: DateRange) =>
  and(
    eq(orders.branchId, branchId),
    gte(orders.businessDate, range.from),
    lte(orders.businessDate, range.to),
    eq(orders.paymentState, 'paid'),
    ne(orders.status, 'cancelled'),
  )

/**
 * Vé bếp đã XONG trong khoảng ngày (theo giờ vào hàng): bếp báo ra món (`ready`)
 * hoặc đã đóng. Vé chờ phục vụ mang ra vẫn là công của bếp — B5 và tỉ lệ trễ của
 * KPI bếp cùng đọc định nghĩa này.
 */
export const doneTickets = (branchId: string, range: DateRange) =>
  and(
    eq(tickets.branchId, branchId),
    inArray(tickets.state, ['ready', 'closed']),
    sql`${tickets.queuedAt} is not null and ${tickets.readyAt} is not null`,
    gte(sql`(${tickets.queuedAt} at time zone 'Asia/Ho_Chi_Minh')::date`, range.from),
    lte(sql`(${tickets.queuedAt} at time zone 'Asia/Ho_Chi_Minh')::date`, range.to),
  )

/** Vé ra sau hạn — đếm trên tập `doneTickets` */
export const lateTicketCount = sql<number>`count(*) filter (where ${tickets.readyAt} > ${tickets.dueAt})::int`
