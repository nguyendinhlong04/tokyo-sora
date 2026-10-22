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

export const SELF_OPEN = 'sora:self-open'
/**
 * Route không gắn quyền mà phiên Kênh nhân viên VẪN được gọi — đăng xuất, hỏi mình
 * là ai. Mọi route không gắn quyền khác đều đóng với phiên `self`.
 *
 * Mở bằng danh sách trắng chứ không đóng bằng danh sách đen: route mới quên gắn
 * quyền thì người cầm link cá nhân bị chặn, không phải được đi qua. Trước đây
 * chiều ngược lại: link Kênh nhân viên xin được token realtime và nghe được luồng
 * đơn của cả chi nhánh.
 */
export const SelfOpen = () => SetMetadata(SELF_OPEN, true)

const SELF_DENIED =
  'Kênh nhân viên chỉ mở lịch, công, lương, việc và văn bản của chính bạn. Việc quản lý cần đăng nhập ở máy của quán.'

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()]
    const action = this.reflector.getAllAndOverride<ActionKey>(REQUIRED_PERMISSION, targets)
    const req = context.switchToHttp().getRequest<RequestWithActor>()

    /**
     * Phiên Kênh nhân viên dừng ở đây với mọi thứ ngoài việc của chính mình.
     *
     * Chốt chặn nằm TRƯỚC ma trận quyền chứ không phải trong nó: ma trận nói vai
     * trò này được làm gì, còn dòng này nói cái link mở trên điện thoại cá nhân
     * thì mở được tới đâu. Trộn hai câu đó vào nhau là phải thêm một cột vào bảng
     * §4.2 cho mỗi cách đăng nhập mới.
     */
    const selfSession = req.actor?.kind === 'staff' && req.actor.scope === 'self'

    if (!action) {
      if (selfSession && !this.reflector.getAllAndOverride<boolean>(SELF_OPEN, targets)) {
        throw new ForbiddenException(SELF_DENIED)
      }
      return true
    }

    if (!req.actor) throw new ForbiddenException('Chưa xác định được người thao tác')

    if (selfSession && action !== SELF_SERVICE_ACTION) {
      throw new ForbiddenException(SELF_DENIED)
    }

    if (checkPermission(action, actorRoles(req.actor)) === 'deny') {
      throw new ForbiddenException(`Vai trò hiện tại không được phép: ${action}`)
    }
    return true
  }
}
