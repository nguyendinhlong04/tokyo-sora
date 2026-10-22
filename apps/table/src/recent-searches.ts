/**
 * T4 từ khoá vừa tìm.
 *
 * Giữ trong `sessionStorage`: giữa bữa ăn khách hay tìm lại đúng món vừa xem.
 * Người ngồi bàn sau không việc gì phải thấy khách trước đã tìm gì — đổi lượt
 * khách là xoá (`table-context.tsx`).
 */
export const RECENT_KEY = 'sora.table.recent-searches'
export const RECENT_MAX = 4

export function loadRecent(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}
