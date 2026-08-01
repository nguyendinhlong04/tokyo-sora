import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { can, checkApproval, needsApproval, type ActionKey } from '@sora/contracts'
import type { Tx } from '../../common/tx'
import { approvals } from '../../db/schema'
import { actorRoles, type Actor } from './actor'
import { IdentityService } from './identity.service'

/** POS gửi kèm khi hành động cần duyệt (§4.3.1: duyệt bằng PIN ngay trên màn hình) */
export interface ApprovalInput {
  approverStaffId: number
  approverPin: string
  reason: string
}

export interface ApprovalOutcome {
  /** null khi hành động không cần duyệt */
  approvalId: number | null
}

/**
 * Luồng duyệt △.
 *
 * Ba tầng bảo vệ, cố ý trùng lặp vì đây là chỗ tiền bạc:
 *   1. Ma trận quyền: người xin phải ở mức `approve`, người duyệt phải `allow`.
 *   2. Phân tách nhiệm vụ: người duyệt ≠ người xin (PHẦN G).
 *   3. Ràng buộc CSDL `approvals_separation_of_duties` chặn lần cuối.
 */
@Injectable()
export class ApprovalService {
  constructor(private readonly identity: IdentityService) {}

  /**
   * Kiểm tra và ghi bản ghi duyệt nếu hành động cần.
   * Trả `approvalId` để nơi gọi gắn vào dòng bị sửa và vào nhật ký.
   */
  async authorize(
    tx: Tx,
    input: {
      actor: Actor
      action: ActionKey
      entity: string
      entityId: string
      approval?: ApprovalInput | null
    },
  ): Promise<ApprovalOutcome> {
    const roles = actorRoles(input.actor)

    if (can(input.action, roles)) return { approvalId: null }

    if (!needsApproval(input.action, roles)) {
      throw new ForbiddenException(`Vai trò hiện tại không được phép: ${input.action}`)
    }

    if (input.actor.kind !== 'staff') {
      throw new ForbiddenException('Chỉ nhân viên mới xin duyệt được')
    }
    if (!input.approval) {
      throw new BadRequestException({
        code: 'requires_approval',
        message: 'Thao tác này cần quản lý duyệt bằng PIN',
        action: input.action,
      })
    }

    const approverRoles = await this.identity.verifyPinOnly(
      input.approval.approverStaffId,
      input.approval.approverPin,
      input.actor.branchId,
    )
    if (!approverRoles) throw new ForbiddenException('PIN người duyệt không đúng')

    const verdict = checkApproval(
      input.action,
      { id: String(input.actor.staffId), roles },
      { id: String(input.approval.approverStaffId), roles: approverRoles },
    )
    if (!verdict.ok) {
      throw new ForbiddenException(
        {
          'tu-duyet': 'Không ai tự duyệt việc của mình',
          'nguoi-duyet-khong-du-quyen': 'Người duyệt không đủ quyền cho thao tác này',
          'khong-can-duyet': 'Thao tác này không cần duyệt',
        }[verdict.code],
      )
    }

    if (!input.approval.reason?.trim()) {
      throw new BadRequestException('Duyệt phải kèm lý do')
    }

    const [row] = await tx
      .insert(approvals)
      .values({
        branchId: input.actor.branchId,
        action: input.action,
        requestedBy: input.actor.staffId,
        approvedBy: input.approval.approverStaffId,
        reason: input.approval.reason.trim(),
        entity: input.entity,
        entityId: input.entityId,
      })
      .returning({ id: approvals.id })

    return { approvalId: row!.id }
  }
}
