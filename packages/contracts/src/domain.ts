import { z } from 'zod'

/** Vòng đời đơn — TRIEN-KHAI §3 */
export const ORDER_STATUSES = [
  'new',
  'confirmed',
  'cooking',
  'ready',
  'delivering',
  'done',
  'cancelled',
] as const
export const OrderStatusSchema = z.enum(ORDER_STATUSES)
export type OrderStatus = z.infer<typeof OrderStatusSchema>

export const CHANNELS = ['web', 'table', 'pos', 'grab', 'shopee', 'be'] as const
export const ChannelSchema = z.enum(CHANNELS)
export type Channel = z.infer<typeof ChannelSchema>

export const ORDER_TYPES = ['dinein', 'takeaway', 'delivery'] as const
export const OrderTypeSchema = z.enum(ORDER_TYPES)
export type OrderType = z.infer<typeof OrderTypeSchema>

export const LINE_STATES = ['draft', 'queued', 'cooking', 'ready', 'served', 'voided'] as const
export const LineStateSchema = z.enum(LINE_STATES)
export type LineState = z.infer<typeof LineStateSchema>

/** waiting = đợt chưa "Ra đợt" / đơn online chưa tới giờ — đồng hồ CHƯA chạy */
export const TICKET_STATES = ['waiting', 'queued', 'cooking', 'ready', 'closed', 'voided'] as const
export const TicketStateSchema = z.enum(TICKET_STATES)
export type TicketState = z.infer<typeof TicketStateSchema>

export const TICKET_SOURCES = ['online', 'table', 'pos'] as const

export const PAYMENT_KINDS = ['cash', 'vietqr', 'card', 'cod'] as const
export const PAYMENT_STATES = [
  'pending',
  'paid',
  'failed',
  'expired',
  'refunded',
  'mismatch',
] as const

/**
 * 6 trạm bếp chốt (kế hoạch §16). Hệ thống đối xử station là CHUỖI MỞ đọc từ
 * bảng `stations` — hằng này chỉ là seed + gợi ý type cho code.
 */
export const STATION_IDS = ['ST-01', 'ST-02', 'ST-03', 'ST-04', 'ST-05', 'ST-06'] as const
export type StationId = (typeof STATION_IDS)[number]

/** Phương thức nướng — preset điền 2 cột trạm của món (§16) */
export const ROUTING_METHODS = ['fixed', 'song', 'nuong', 'linh_hoat'] as const

/** Khối tiền trên đơn — luôn do server tính (TRIEN-KHAI §2.1) */
export const OrderMoneySchema = z.object({
  sub: z.number().int(),
  discount: z.number().int(),
  service: z.number().int(),
  vat: z.number().int(),
  ship: z.number().int(),
  round: z.number().int(),
  total: z.number().int(),
})
export type OrderMoney = z.infer<typeof OrderMoneySchema>

/** Dòng đơn trên wire — giá đã ĐÓNG BĂNG lúc tạo */
export const OrderLineSchema = z.object({
  id: z.string(),
  parentLineId: z.string().nullable().optional(),
  batchNo: z.number().int().min(1),
  dishId: z.string(),
  name: z.string(),
  qty: z.number().int().min(1),
  unitPrice: z.number().int(),
  priceTotal: z.number().int(),
  modifiers: z
    .array(z.object({ optionId: z.string(), name: z.string(), priceDelta: z.number().int() }))
    .default([]),
  note: z.string().nullable().optional(),
  setLabel: z.string().nullable().optional(),
  station: z.string().nullable().optional(),
  state: LineStateSchema,
})
export type OrderLine = z.infer<typeof OrderLineSchema>

/** Vé bếp trên wire — KHÔNG có trường tiền (quy tắc cứng: bếp không biết giá) */
export const TicketItemSchema = z.object({
  id: z.string(),
  orderLineId: z.string(),
  dishId: z.string(),
  name: z.string(),
  qty: z.number().int().min(1),
  note: z.string().nullable().optional(),
  setLabel: z.string().nullable().optional(),
  componentLabel: z.string().nullable().optional(),
  state: z.enum(['queued', 'cooking', 'done', 'voided']),
  weightGrams: z.number().int().nullable().optional(),
})

export const TicketSchema = z.object({
  id: z.string(),
  displayCode: z.string(),
  orderId: z.string(),
  orderLabel: z.string(),
  branchId: z.string(),
  station: z.string(),
  source: z.enum(TICKET_SOURCES),
  table: z.string().nullable(),
  batchNo: z.number().int(),
  linkGroup: z.string().nullable().optional(),
  priority: z.enum(['normal', 'rush', 'late']),
  state: TicketStateSchema,
  openedAt: z.string(),
  queuedAt: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  startBy: z.string().nullable().optional(),
  items: z.array(TicketItemSchema),
})
export type Ticket = z.infer<typeof TicketSchema>
