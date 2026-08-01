import { apiFetch, enqueue } from '@sora/core'

export interface TicketItem {
  id: number
  dishId: string
  nameSnapshot: string
  qty: number
  note: string | null
  setLabel: string | null
  componentLabel: string | null
  portionLabel: string | null
  linkGroup: string | null
  state: 'queued' | 'cooking' | 'done' | 'voided'
  weightGrams: number | null
}

export interface Ticket {
  id: number
  displayCode: string
  orderId: number
  stationId: string
  tableCode: string | null
  batchNo: number
  state: 'waiting' | 'queued' | 'cooking' | 'ready'
  grillServiceNote: string | null
  prepSeconds: number
  openedAt: string
  queuedAt: string | null
  startBy: string | null
  items: TicketItem[]
}

export interface Queue {
  /** Giờ máy chủ — client hiệu chỉnh đồng hồ theo cái này, không tin đồng hồ TV box */
  serverTime: string
  station: { id: string; name: string; kanji: string | null; columns: number }
  tickets: Ticket[]
}

export const api = {
  pair: (code: string, name: string) =>
    apiFetch<{ token: string; deviceId: number }>('/api/auth/pair', {
      method: 'POST',
      body: { code, name },
    }),

  me: () =>
    apiFetch<{ kind: string; branchId: string; stationId: string | null }>('/api/auth/me'),

  queue: () => apiFetch<Queue>('/api/tickets'),

  setState: (ticketId: number, action: 'start' | 'done' | 'undo', label: string) =>
    enqueue<{ state: string }>({
      method: 'POST',
      path: `/api/tickets/${ticketId}/state`,
      payload: { action },
      label,
    }),
}
