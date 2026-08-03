import { apiFetch } from '@sora/core'

export interface StaffOption {
  id: number
  fullName: string
  roles: string[]
}

/**
 * Kết quả một lượt bấm. Máy chủ quyết định chiều — vào hay ra — chứ không phải
 * người bấm: bắt người đang vội chọn đúng nút giữa hai nút giống nhau là cách
 * sinh ra những ca 14 tiếng và những ca 0 phút.
 */
export type PunchResult =
  | {
      direction: 'in'
      fullName: string
      at: string
      /** Giờ ca đã xếp, phút kể từ 00:00 — NULL khi hôm nay không có lịch */
      scheduledStartMinute: number | null
    }
  | { direction: 'out'; fullName: string; at: string; workedMinutes: number }

export const api = {
  pair: (code: string, name: string) =>
    apiFetch<{ token: string; deviceId: number }>('/api/auth/pair', {
      method: 'POST',
      body: { code, name },
    }),

  me: () => apiFetch<{ kind: string; branchId: string; deviceKind?: string }>('/api/auth/me'),

  staffList: (branchId: string) =>
    apiFetch<StaffOption[]>(`/api/auth/staff?branchId=${encodeURIComponent(branchId)}`),

  login: (input: { branchId: string; staffId: number; pin: string }) =>
    apiFetch<{ staff: { fullName: string } }>('/api/auth/login', { method: 'POST', body: input }),

  punch: () => apiFetch<PunchResult>('/api/hr/punch', { method: 'POST' }),

  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
}
