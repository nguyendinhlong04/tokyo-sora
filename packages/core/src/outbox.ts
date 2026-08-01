import Dexie, { type Table } from 'dexie'
import { ApiError, apiFetch, newIdempotencyKey } from './api'

export type OutboxStatus = 'pending' | 'inflight' | 'failed' | 'done'

export interface OutboxRow {
  id?: number
  idempotencyKey: string
  method: 'POST' | 'PATCH' | 'DELETE'
  path: string
  payload: unknown
  /** Mô tả để hiện cho người dùng khi hàng lỗi: "Gửi bếp bàn A4" */
  label: string
  status: OutboxStatus
  createdAt: number
  tries: number
  lastError: string | null
}

class OutboxDb extends Dexie {
  rows!: Table<OutboxRow, number>

  constructor() {
    super('sora-outbox')
    this.version(1).stores({ rows: '++id, status, createdAt' })
  }
}

const db = new OutboxDb()

type Listener = (state: OutboxState) => void

export interface OutboxState {
  pending: number
  failed: number
  online: boolean
  draining: boolean
}

const listeners = new Set<Listener>()
let draining = false

async function notify() {
  const [pending, failed] = await Promise.all([
    db.rows.where('status').anyOf('pending', 'inflight').count(),
    db.rows.where('status').equals('failed').count(),
  ])
  const state: OutboxState = { pending, failed, online: navigator.onLine, draining }
  for (const listener of listeners) listener(state)
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener)
  void notify()
  return () => listeners.delete(listener)
}

/**
 * Mọi thao tác ghi đi qua đây — KỂ CẢ KHI ĐANG ONLINE.
 *
 * Một đường code duy nhất nghĩa là "mất mạng không được mất đơn" đúng theo cấu
 * trúc chứ không nhờ nhớ gọi đúng hàm. Cái giá là mỗi lệnh ghi thêm một lượt vào
 * IndexedDB, không đáng kể so với việc mất đơn giờ cao điểm.
 *
 * Trả về kết quả nếu gửi được ngay; nếu offline thì trả `null` và lệnh nằm lại
 * hàng đợi. Nơi gọi phải xử lý được cả hai — đó là lý do POS cập nhật giao diện
 * lạc quan chứ không chờ server.
 */
export async function enqueue<T>(input: {
  method: 'POST' | 'PATCH' | 'DELETE'
  path: string
  payload?: unknown
  label: string
}): Promise<T | null> {
  const row: OutboxRow = {
    idempotencyKey: newIdempotencyKey(),
    method: input.method,
    path: input.path,
    payload: input.payload ?? null,
    label: input.label,
    status: 'pending',
    createdAt: Date.now(),
    tries: 0,
    lastError: null,
  }
  const id = await db.rows.add(row)
  await notify()

  const result = await drain<T>(id)
  return result
}

/**
 * Gửi hàng đợi theo THỨ TỰ. Tuần tự chứ không song song vì thứ tự trong một bàn
 * có ý nghĩa: thêm món rồi mới gửi bếp, không được đảo.
 */
export async function drainOutbox(): Promise<void> {
  await drain(undefined)
}

async function drain<T>(waitForId: number | undefined): Promise<T | null> {
  if (draining) return null
  draining = true
  let resultForCaller: T | null = null

  try {
    for (;;) {
      const next = await db.rows.where('status').equals('pending').first()
      if (!next?.id) break

      await db.rows.update(next.id, { status: 'inflight', tries: next.tries + 1 })
      await notify()

      try {
        const result = await apiFetch<T>(next.path, {
          method: next.method,
          body: next.payload,
          idempotencyKey: next.idempotencyKey,
        })
        await db.rows.delete(next.id)
        if (next.id === waitForId) resultForCaller = result
      } catch (err) {
        const apiError = err instanceof ApiError ? err : null

        if (apiError?.isOffline) {
          // Mất mạng: trả về hàng chờ, thử lại khi có mạng. KHÔNG đánh dấu lỗi.
          await db.rows.update(next.id, { status: 'pending', lastError: apiError.message })
          await notify()
          break
        }

        // Server đã hiểu và từ chối (món vừa hết, trạng thái không còn hợp lệ):
        // gửi lại cũng vô ích. Đánh dấu lỗi để người dùng quyết, KHÔNG âm thầm bỏ.
        await db.rows.update(next.id, {
          status: 'failed',
          lastError: apiError?.message ?? String(err),
        })
        await notify()
        if (next.id === waitForId) throw err
      }
    }
  } finally {
    draining = false
    await notify()
  }

  return resultForCaller
}

/** Danh sách hàng lỗi để POS hiện cho người dùng xử lý tay */
export function failedItems(): Promise<OutboxRow[]> {
  return db.rows.where('status').equals('failed').toArray()
}

export async function retryFailed(id: number): Promise<void> {
  await db.rows.update(id, { status: 'pending', lastError: null })
  await drainOutbox()
}

/** Bỏ hẳn một lệnh lỗi — thao tác có chủ ý của người dùng, không tự động */
export async function discardFailed(id: number): Promise<void> {
  await db.rows.delete(id)
  await notify()
}

/** Gắn vào lúc khởi động app: có mạng lại thì tự gửi tiếp */
export function watchConnectivity(): () => void {
  const onOnline = () => void drainOutbox()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', () => void notify())
  void drainOutbox()
  return () => {
    window.removeEventListener('online', onOnline)
  }
}
