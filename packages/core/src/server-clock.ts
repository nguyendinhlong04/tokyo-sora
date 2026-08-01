/**
 * Đồng hồ theo giờ SERVER.
 *
 * Mọi đồng hồ đếm trong hệ thống — thang than hồng trên vé bếp, đếm ngược đơn hẹn
 * giờ, giữ chỗ 10 phút — phải tính theo giờ máy chủ. TV box giá rẻ chạy màn bếp
 * hay sai giờ hàng phút; nếu tin đồng hồ thiết bị thì mọi vé đỏ ngay khi hiện.
 */
let offsetMs = 0
let calibrated = false

/** Gọi mỗi khi nhận `serverTime` từ API (hàng vé K2 trả kèm trong mọi lượt) */
export function calibrate(serverTime: string | Date): void {
  const server = typeof serverTime === 'string' ? new Date(serverTime) : serverTime
  if (Number.isNaN(server.getTime())) return
  offsetMs = server.getTime() - Date.now()
  calibrated = true
}

export function serverNow(): number {
  return Date.now() + offsetMs
}

/** Số giây đã trôi kể từ một mốc, tính theo giờ server */
export function elapsedSeconds(since: string | Date | null): number {
  if (!since) return 0
  const at = typeof since === 'string' ? new Date(since) : since
  return Math.max(0, Math.round((serverNow() - at.getTime()) / 1000))
}

export function isCalibrated(): boolean {
  return calibrated
}

/** Lệch giữa đồng hồ thiết bị và máy chủ — hiện cảnh báo nếu quá lớn */
export function clockDriftSeconds(): number {
  return Math.round(offsetMs / 1000)
}
