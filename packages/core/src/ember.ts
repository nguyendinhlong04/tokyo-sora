/**
 * Thang than hồng — ngôn ngữ tiến độ dùng thống nhất ở mọi nơi (kế hoạch §8.3):
 * đồng hồ vé bếp, tiến độ đơn của khách, mức tồn kho, mức đạt chỉ tiêu.
 *
 * Một ẩn dụ, dùng chung cả hệ thống: tro → đồng → than → lửa.
 */
export type EmberLevel = 'ash' | 'brass' | 'char' | 'fire'

export const EMBER_VARS: Record<EmberLevel, string> = {
  ash: 'var(--sora-ember-0)',
  brass: 'var(--sora-ember-1)',
  char: 'var(--sora-ember-2)',
  fire: 'var(--sora-ember-3)',
}

/** `ratio` = thời gian đã trôi / thời gian chuẩn */
export function emberLevel(ratio: number): EmberLevel {
  if (ratio < 0.4) return 'ash'
  if (ratio < 0.7) return 'brass'
  if (ratio <= 1) return 'char'
  return 'fire'
}

export function emberColor(ratio: number): string {
  return EMBER_VARS[emberLevel(ratio)]
}

/** Quá giờ mới nhấp nháy — KDS chỉ được phép một hiệu ứng duy nhất (§11.4) */
export function isOverdue(ratio: number): boolean {
  return ratio > 1
}

/** mm:ss cho đồng hồ vé */
export function formatClock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : ''
  const abs = Math.abs(totalSeconds)
  const minutes = Math.floor(abs / 60)
  const seconds = abs % 60
  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
