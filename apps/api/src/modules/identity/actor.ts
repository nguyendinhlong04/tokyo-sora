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
      /**
       * Trạm của THIẾT BỊ người này đang đứng, không phải thuộc tính của người.
       * Bếp trưởng đi qua màn ST-02 thì thấy vé ST-02; sang màn ST-06 thấy vé
       * ST-06. Nếu không mang theo thông tin này thì màn bếp mất trạm ngay khi
       * có người đăng nhập lên nó.
       */
      stationId: string | null
    }
  /** Thiết bị đã ghép nhưng chưa có ai đăng nhập ca — KDS, kiosk, cầu in */
  | {
      kind: 'device'
      deviceId: number
      branchId: string
      stationId: string | null
      deviceKind: string
    }
  /** Khách tại bàn (R0) — token QR của phiên bàn */
  | { kind: 'customer'; tableSessionId: number; branchId: string }
  /** Tác vụ nền, seeder, dispatcher */
  | { kind: 'system' }

export type StaffActor = Extract<Actor, { kind: 'staff' }>

export function actorRoles(actor: Actor): Role[] {
  switch (actor.kind) {
    case 'staff':
      return actor.roles
    case 'customer':
      return ['R0']
    case 'device':
      /**
       * Màn bếp đã ghép mang vai trò nhân viên bếp (R4) của ĐÚNG TRẠM nó được
       * gắn. Lý do: bộ thiết kế Kitchen chỉ có sáu màn K1–K6 và KHÔNG có màn đăng
       * nhập nào — việc ghép thiết bị chính là bước cấp quyền. Thực tế bếp cũng
       * không thể nhập PIN mỗi lần bấm nút với tay ướt và đeo găng.
       *
       * Đánh đổi đã cân nhắc: nhật ký ghi "thiết bị nào" chứ không ghi "ai". Chấp
       * nhận được vì màn ghim cứng một trạm, thu hồi được từ xa (A4), và thao tác
       * bếp không đụng tiền. Thao tác đụng tiền hay cần duyệt vẫn buộc phải có
       * phiên nhân viên.
       */
      return actor.deviceKind === 'kds' ? ['R4'] : []
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
