import { IDEMPOTENCY_HEADER } from '@sora/contracts'
import { getDeviceToken } from './session'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Lỗi mạng — đáng đưa vào hàng đợi gửi lại, khác hẳn lỗi nghiệp vụ */
  get isOffline() {
    return this.status === 0
  }

  /** Server đã hiểu và từ chối — gửi lại cũng vô ích */
  get isRejection() {
    return this.status >= 400 && this.status < 500
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Khoá chống trùng khi hàng đợi offline gửi lại */
  idempotencyKey?: string
  signal?: AbortSignal
}

/**
 * Gọi API. Same-origin nên cookie phiên tự đi kèm — không có token nào phải tự
 * gắn ngoài token thiết bị.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  const deviceToken = getDeviceToken()
  if (deviceToken) headers['x-sora-device'] = deviceToken
  if (options.idempotencyKey) headers[IDEMPOTENCY_HEADER] = options.idempotencyKey

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (cause) {
    throw new ApiError(0, 'offline', 'Mất kết nối tới máy chủ', cause)
  }

  if (response.status === 204 || response.status === 304) return undefined as T

  const text = await response.text()
  const body: unknown = text ? safeParse(text) : null

  if (!response.ok) {
    const detail = body as { code?: string; message?: string } | null
    throw new ApiError(
      response.status,
      detail?.code ?? null,
      detail?.message ?? `Lỗi ${response.status}`,
      body,
    )
  }

  return body as T
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}
