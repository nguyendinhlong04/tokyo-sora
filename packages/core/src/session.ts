/**
 * Lưu trữ phía thiết bị.
 *
 * Token PHIÊN NHÂN VIÊN không nằm ở đây — nó là cookie httpOnly, JavaScript không
 * đọc được. Đó là chủ ý: kịch bản XSS lấy được token phiên là mất cả ca làm.
 *
 * Token THIẾT BỊ thì khác: nó định danh cái máy chứ không phải người, và server
 * luôn kiểm nó có bị thu hồi chưa. Để ở localStorage vì phải sống qua mọi lần
 * đóng/mở trình duyệt trên máy POS.
 */
const DEVICE_TOKEN_KEY = 'sora.device.token'
const DEVICE_INFO_KEY = 'sora.device.info'

export interface DeviceInfo {
  deviceId: number
  branchId: string
  kind: string
  stationId: string | null
  name: string
}

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setDeviceToken(token: string): void {
  localStorage.setItem(DEVICE_TOKEN_KEY, token)
}

export function getDeviceInfo(): DeviceInfo | null {
  try {
    const raw = localStorage.getItem(DEVICE_INFO_KEY)
    return raw ? (JSON.parse(raw) as DeviceInfo) : null
  } catch {
    return null
  }
}

export function setDeviceInfo(info: DeviceInfo): void {
  localStorage.setItem(DEVICE_INFO_KEY, JSON.stringify(info))
}

export function clearDevice(): void {
  localStorage.removeItem(DEVICE_TOKEN_KEY)
  localStorage.removeItem(DEVICE_INFO_KEY)
}
