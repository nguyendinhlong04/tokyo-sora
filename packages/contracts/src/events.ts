import { z } from 'zod'

/** Tên sự kiện — đúng từ vựng TRIEN-KHAI §6 */
export const WS_TOPICS = {
  orderCreated: 'order.created',
  orderUpdated: 'order.updated',
  orderCancelled: 'order.cancelled',
  ticketCreated: 'ticket.created',
  ticketVoid: 'ticket.void',
  ticketRush: 'ticket.rush',
  ticketReady: 'ticket.ready',
  tableOpened: 'table.opened',
  tableRequest: 'table.request',
  tablePaid: 'table.paid',
  configPublished: 'config.published',
  availabilityChanged: 'availability.changed',
  paymentReceived: 'payment.received',
  printJob: 'print.job',
} as const
export type WsTopic = (typeof WS_TOPICS)[keyof typeof WS_TOPICS]

/**
 * Phong bì sự kiện: MỌI sự kiện mang `seq` (outbox_events.id — đơn điệu tăng).
 * Client resync theo quy tắc "refetch rồi mới stream": snapshot REST trả watermark,
 * bỏ qua sự kiện seq ≤ watermark, hở seq → refetch lại.
 */
export const WsEnvelopeSchema = z.object({
  seq: z.number().int().nonnegative(),
  topic: z.string(),
  branchId: z.string().nullable(),
  payload: z.unknown(),
  at: z.string(),
})
export type WsEnvelope = z.infer<typeof WsEnvelopeSchema>

/** Tên room — server GÁN từ credential lúc handshake, client không tự join */
export const rooms = {
  orders: (branchId: string) => `branch:${branchId}:orders`,
  station: (branchId: string, stationId: string) => `branch:${branchId}:station:${stationId}`,
  expo: (branchId: string) => `branch:${branchId}:expo`,
  tables: (branchId: string) => `branch:${branchId}:tables`,
  order: (orderId: string) => `order:${orderId}`,
  config: (branchId: string) => `branch:${branchId}:config`,
  print: (branchId: string) => `branch:${branchId}:print`,
} as const

/** Header idempotency — bắt buộc trên mọi POST/PATCH ghi từ client có outbox */
export const IDEMPOTENCY_HEADER = 'idempotency-key'
