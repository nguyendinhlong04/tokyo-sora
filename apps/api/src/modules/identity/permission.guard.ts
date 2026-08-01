import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { checkPermission, type ActionKey } from '@sora/contracts'
import { actorRoles } from './actor'
import type { RequestWithActor } from './auth.guard'

export const REQUIRED_PERMISSION = 'sora:permission'

/**
 * Gắn hành động trong ma trận §4.2 vào route.
 *
 * `allow` → đi thẳng. `approve` (△) → route vẫn chạy, nhưng service bên trong
 * BẮT BUỘC gọi ApprovalService để lấy PIN người duyệt; guard chỉ chặn `deny`.
 * Tách như vậy vì chỉ service mới biết ngữ cảnh cần duyệt (VD huỷ món đã gửi bếp
 * cần duyệt, huỷ món chưa gửi thì không).
 */
export const RequirePermission = (action: ActionKey) => SetMetadata(REQUIRED_PERMISSION, action)

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<ActionKey>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!action) return true

    const req = context.switchToHttp().getRequest<RequestWithActor>()
    if (!req.actor) throw new ForbiddenException('Chưa xác định được người thao tác')

    if (checkPermission(action, actorRoles(req.actor)) === 'deny') {
      throw new ForbiddenException(`Vai trò hiện tại không được phép: ${action}`)
    }
    return true
  }
}
