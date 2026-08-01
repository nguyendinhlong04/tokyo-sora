import type { Role } from '@sora/contracts'

/**
 * Ai đang gọi API. Mọi guard, service và bản ghi nhật ký đều nói bằng kiểu này.
 */
export type Actor =
  | {
      kind: 'staff'
      staffId: number
      roles: Role[]
      branchId: string
      deviceId: number
      sessionId: number
      fullName: string
    }
  /** Thiết bị đã ghép nhưng chưa có ai đăng nhập ca — KDS, kiosk, cầu in */
  | { kind: 'device'; deviceId: number; branchId: string; stationId: string | null }
  /** Khách tại bàn (R0) — token QR của phiên bàn */
  | { kind: 'customer'; tableSessionId: number; branchId: string }
  /** Tác vụ nền, seeder, dispatcher */
  | { kind: 'system' }

export function actorRoles(actor: Actor): Role[] {
  switch (actor.kind) {
    case 'staff':
      return actor.roles
    case 'customer':
      return ['R0']
    // Thiết bị chưa đăng nhập không mang quyền nghiệp vụ nào; màn KDS thao tác
    // được là nhờ vai trò bếp của người đăng nhập, không phải nhờ thiết bị.
    case 'device':
    case 'system':
      return []
  }
}

export function actorBranchId(actor: Actor): string | null {
  return actor.kind === 'system' ? null : actor.branchId
}

/** Ghi vào audit_log.actor_kind / actor_id */
export function actorRef(actor: Actor): { kind: string; id: string | null } {
  switch (actor.kind) {
    case 'staff':
      return { kind: 'staff', id: String(actor.staffId) }
    case 'device':
      return { kind: 'device', id: String(actor.deviceId) }
    case 'customer':
      return { kind: 'customer', id: String(actor.tableSessionId) }
    case 'system':
      return { kind: 'system', id: null }
  }
}
