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
  /** Mốc bấm Xong — gốc tính cửa sổ hoàn tác, và là lúc đồng hồ vé dừng lại */
  readyAt: string | null
  /** Đơn hẹn giờ: mốc phải bắt đầu nấu — KDS đếm NGƯỢC tới đây */
  startBy: string | null
  items: TicketItem[]
}

export interface Station {
  id: string
  name: string
  kanji: string | null
  columns: number
}

export interface Queue {
  /** Giờ máy chủ — client hiệu chỉnh đồng hồ theo cái này, không tin đồng hồ TV box */
  serverTime: string
  /** Vé bấm Xong còn hoàn tác được trong ngần này giây (tham số `kitchen.undoSeconds`) */
  undoSeconds: number
  station: Station
  tickets: Ticket[]
}

export interface ExpoOrder {
  key: string
  orderId: number
  tableCode: string | null
  batchNo: number
  ready: boolean
  /** Còn chờ những trạm nào — rỗng nghĩa là ra được */
  waitingFor: string[]
  items: {
    name: string
    qty: number
    componentLabel: string | null
    linkGroup: string | null
    state: string
  }[]
}

export interface AvailabilityRow {
  dishId: string
  status: 'sold_out' | 'limited'
  remaining: number | null
}

export interface ConfigDish {
  id: string
  kind: 'dish' | 'set' | 'drink'
  nameVi: string
  routing: {
    stationGrill: string | null
    stationNoGrill: string | null
    secondaryStation: string | null
  } | null
}

// ------------------------------------------------------ K7 · Công thức

export type RecipeStepPhase = 'so_che' | 'che_bien' | 'hoan_thien'

export interface RecipeStep {
  phase: RecipeStepPhase
  text: string
  /** null = bước không bấm giờ (ướp qua đêm, chờ nguội) */
  seconds: number | null
  paramLabel: string | null
  isCcp: boolean
}

/**
 * Thẻ công thức đã trừ sạch tiền.
 *
 * Không có `costVnd`, không có đơn giá, không có hao hụt — nguyên tắc 3: bếp
 * không bao giờ biết giá. Định lượng thì có, vì "200g thịt" là lời chỉ dẫn.
 */
export interface KitchenRecipe {
  dish: {
    id: string
    nameVi: string
    nameJa: string | null
    allergens: string[]
    prepSeconds: number
  }
  /** `null` = bếp trưởng chưa soạn quy trình cho món này */
  doc: {
    methodKind: 'song' | 'nuong' | 'nau' | 'lap_rap'
    yieldLabel: string | null
    plateLabel: string | null
    prepMinutes: number
    equipment: string[]
    inputSpec: { item: string; requirement: string }[]
    specMeasured: { name: string; target: string }[]
    specSensory: string[]
    ccp: { point: string; limit: string; action: string }[]
    storage: string | null
    tips: string[]
    pitfalls: { mistake: string; effect: string; fix: string }[]
    updatedAt: string
  } | null
  steps: RecipeStep[]
  ingredients: { name: string; qtyBase: number; baseUnit: string }[]
  substitutes: { id: string; nameVi: string }[]
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

  expo: () => apiFetch<{ serverTime: string; orders: ExpoOrder[] }>('/api/expo'),

  config: (branchId: string) =>
    apiFetch<{ dishes: ConfigDish[] }>(`/api/config?branch=${branchId}`),

  availability: () => apiFetch<AvailabilityRow[]>('/api/availability'),

  /** Mã những món ĐÃ có quy trình — để ô món chưa soạn hiện mờ, bấm vào không hụt */
  recipeIndex: () => apiFetch<string[]>('/api/recipes'),

  recipe: (dishId: string) => apiFetch<KitchenRecipe>(`/api/recipes/${dishId}`),

  setState: (ticketId: number, action: 'start' | 'done' | 'undo', label: string) =>
    enqueue<{ state: string }>({
      method: 'POST',
      path: `/api/tickets/${ticketId}/state`,
      payload: { action },
      label,
    }),

  /** Bấm cho MỘT món trên vé — thao tác chính của bếp */
  setItemState: (itemId: number, action: 'start' | 'done' | 'undo', label: string) =>
    enqueue<{ state: string }>({
      method: 'POST',
      path: `/api/ticket-items/${itemId}/state`,
      payload: { action },
      label,
    }),

  setAvailability: (
    dishId: string,
    status: 'sold_out' | 'limited' | 'available',
    remaining: number | null,
    label: string,
  ) =>
    enqueue<AvailabilityRow>({
      method: 'POST',
      path: '/api/availability',
      payload: { dishId, status, remaining },
      label,
    }),
}
