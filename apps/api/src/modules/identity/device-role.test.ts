import { describe, expect, it } from 'vitest'
import { actorRoles, assertOwnTableSession, type Actor } from './actor'

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

/**
 * iPad gắn bàn (§9.1): bàn đang có phiên thì nó là khách R0 của đúng phiên đó;
 * bàn chưa mở thì nó là thiết bị KHÔNG có vai trò nào và không mở được phiên nào.
 */
describe('iPad gắn bàn', () => {
  const ipadNoSession: Actor = {
    kind: 'device',
    deviceId: 3,
    branchId: 'cg',
    stationId: null,
    deviceKind: 'table',
    tableId: 7,
  }
  const ipadInSession: Actor = {
    kind: 'customer',
    tableSessionId: 21,
    branchId: 'cg',
    deviceId: 3,
    tableId: 7,
  }

  it('bàn chưa mở: không vai trò, không đọc được phiên nào', () => {
    expect(actorRoles(ipadNoSession)).toEqual([])
    expect(() => assertOwnTableSession(ipadNoSession, 21)).toThrow()
  })

  it('bàn đang mở: R0 của đúng phiên bàn mình, không phải bàn khác', () => {
    expect(actorRoles(ipadInSession)).toEqual(['R0'])
    expect(() => assertOwnTableSession(ipadInSession, 21)).not.toThrow()
    expect(() => assertOwnTableSession(ipadInSession, 22)).toThrow()
  })

  it('máy thu ngân vẫn đọc được mọi bàn — họ phải nhìn cả sàn', () => {
    expect(() => assertOwnTableSession(posDevice, 22)).not.toThrow()
  })
})
