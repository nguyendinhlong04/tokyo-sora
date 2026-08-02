import { ForbiddenException } from '@nestjs/common'
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
      /** NULL khi đăng nhập Office bằng email — không có thiết bị ghép */
      deviceId: number | null
      sessionId: number
      fullName: string
      /**
       * 'self' = phiên Kênh nhân viên (H8 · H9), mở bằng link cá nhân + PIN.
       *
       * Người vẫn mang đủ vai trò của họ — điều đổi là PHẠM VI: PermissionGuard
       * chỉ cho phiên này đi qua đúng `staff.view-own-record`. Giới hạn ở guard
       * chứ không ở vai trò, vì cắt vai trò sẽ làm chính người đó không đọc nổi
       * hồ sơ của mình.
       */
      scope: 'full' | 'self'
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
  /**
   * Khách web đặt món online — không tài khoản, không thiết bị, không bàn.
   *
   * Tách hẳn khỏi `customer` thay vì mượn tạm với `tableSessionId = 0`: mọi chốt
   * chặn "khách chỉ thao tác trên bàn của mình" đều nhận diện qua `kind`, và một
   * số 0 giả sẽ lọt qua đúng những chốt đó vào một ngày nào đó.
   */
  | { kind: 'guest'; branchId: string }
  /** Tác vụ nền, seeder, dispatcher */
  | { kind: 'system' }

export type StaffActor = Extract<Actor, { kind: 'staff' }>

export function actorRoles(actor: Actor): Role[] {
  switch (actor.kind) {
    case 'staff':
      return actor.roles
    case 'customer':
      return ['R0']
    // Khách web có đúng quyền của khách tại bàn: xem giá, tự gọi món, tự trả tiền
    case 'guest':
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

/**
 * Token bàn chỉ mở đúng bàn của nó.
 *
 * Mã phiên là số chạy nên đoán được: không có chốt này thì khách bàn 12 sửa số
 * trên thanh địa chỉ là đọc được đơn và tạm tính của bàn 11. Nhân viên và thiết
 * bị không bị chặn — họ vốn phải nhìn được cả sàn.
 */
export function assertOwnTableSession(actor: Actor, sessionId: number): void {
  if (actor.kind === 'customer' && actor.tableSessionId !== sessionId) {
    throw new ForbiddenException('Mã QR này không mở được bàn khác')
  }
}

/**
 * Hành động duy nhất mà phiên Kênh nhân viên mở được.
 *
 * Một khoá, không phải một danh sách: mọi thứ H8 · H9 cần — lịch của tôi, công
 * của tôi, phiếu lương của tôi, gửi yêu cầu nghỉ — đều nằm dưới đúng khoá này ở
 * §4.2b. Danh sách nhiều dòng sẽ dài ra theo thời gian cho tới lúc không ai nói
 * được nó chứa gì.
 */
export const SELF_SERVICE_ACTION = 'staff.view-own-record'

/** Ghi vào audit_log.actor_kind / actor_id */
export function actorRef(actor: Actor): { kind: string; id: string | null } {
  switch (actor.kind) {
    case 'staff':
      return { kind: 'staff', id: String(actor.staffId) }
    case 'device':
      return { kind: 'device', id: String(actor.deviceId) }
    case 'customer':
      return { kind: 'customer', id: String(actor.tableSessionId) }
    case 'guest':
      return { kind: 'guest', id: null }
    case 'system':
      return { kind: 'system', id: null }
  }
}
