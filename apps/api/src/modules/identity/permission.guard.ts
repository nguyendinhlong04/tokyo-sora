import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { checkPermission, type ActionKey } from '@sora/contracts'
import { actorRoles, SELF_SERVICE_ACTION } from './actor'
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

    /**
     * Phiên Kênh nhân viên dừng ở đây với mọi thứ ngoài việc của chính mình.
     *
     * Chốt chặn nằm TRƯỚC ma trận quyền chứ không phải trong nó: ma trận nói vai
     * trò này được làm gì, còn dòng này nói cái link mở trên điện thoại cá nhân
     * thì mở được tới đâu. Trộn hai câu đó vào nhau là phải thêm một cột vào bảng
     * §4.2 cho mỗi cách đăng nhập mới.
     */
    if (req.actor.kind === 'staff' && req.actor.scope === 'self' && action !== SELF_SERVICE_ACTION) {
      throw new ForbiddenException(
        'Kênh nhân viên chỉ mở lịch, công và phiếu lương của chính bạn. Việc quản lý cần đăng nhập ở máy của quán.',
      )
    }

    if (checkPermission(action, actorRoles(req.actor)) === 'deny') {
      throw new ForbiddenException(`Vai trò hiện tại không được phép: ${action}`)
    }
    return true
  }
}
