import { describe, expect, it } from 'vitest'
import { actorRoles, type Actor } from './actor'

const kdsDevice = (stationId: string | null): Actor => ({
  kind: 'device',
  deviceId: 1,
  branchId: 'cg',
  stationId,
  deviceKind: 'kds',
})

const posDevice: Actor = {
  kind: 'device',
  deviceId: 2,
  branchId: 'cg',
  stationId: null,
  deviceKind: 'cashier',
}

/**
 * Bộ thiết kế Kitchen chỉ có sáu màn K1–K6 và KHÔNG có màn đăng nhập — việc ghép
 * thiết bị chính là bước cấp quyền. Các test dưới đây chốt lại quyết định đó để
 * người sau đọc code không tưởng là bỏ sót.
 */
describe('Màn bếp đã ghép mang quyền nhân viên bếp', () => {
  it('thiết bị kds có vai trò R4', () => {
    expect(actorRoles(kdsDevice('ST-06'))).toEqual(['R4'])
  })

  it('máy thu ngân KHÔNG mang vai trò nào — quyền đến từ người đăng nhập', () => {
    expect(actorRoles(posDevice)).toEqual([])
  })

  it('khách tại bàn luôn là R0', () => {
    expect(
      actorRoles({ kind: 'customer', tableSessionId: 9, branchId: 'cg' }),
    ).toEqual(['R0'])
  })

  it('tác vụ nền không mang quyền nghiệp vụ nào', () => {
    expect(actorRoles({ kind: 'system' })).toEqual([])
  })
})
