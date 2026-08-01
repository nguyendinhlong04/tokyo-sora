import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { actorRoles, type Actor } from './actor'
import { IdentityService } from './identity.service'

export const IS_PUBLIC = 'sora:public'
/** Route không cần danh tính (ghép thiết bị, health) */
export const Public = () => SetMetadata(IS_PUBLIC, true)

/** Tên cookie/header — cookie là đường chính, header để thiết bị và test dùng */
export const STAFF_COOKIE = 'sora_staff'
export const TABLE_COOKIE = 'sora_table'
export const DEVICE_HEADER = 'x-sora-device'

export interface RequestWithActor extends FastifyRequest {
  actor?: Actor
}

/**
 * Dựng `Actor` từ credential gửi lên. Thứ tự ưu tiên:
 *   1. Phiên nhân viên (đã đăng nhập ca) — mang vai trò nghiệp vụ
 *   2. Phiên bàn (khách quét QR) — vai trò R0
 *   3. Thiết bị đã ghép — chưa ai đăng nhập, chỉ làm được việc của thiết bị
 *
 * Token nhân viên PHẢI đi kèm thiết bị hợp lệ: phiên gắn cứng với `deviceId` lúc
 * đăng nhập, nên thiết bị bị thu hồi là phiên chết theo.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly identity: IdentityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true
    }

    const req = context.switchToHttp().getRequest<RequestWithActor>()
    const actor = await this.resolve(req)
    if (!actor) throw new UnauthorizedException('Thiếu hoặc sai thông tin đăng nhập')
    req.actor = actor
    return true
  }

  private async resolve(req: RequestWithActor): Promise<Actor | null> {
    const deviceToken = req.headers[DEVICE_HEADER]
    const device =
      typeof deviceToken === 'string' ? await this.identity.resolveDevice(deviceToken) : null

    const staffToken = readCredential(req, STAFF_COOKIE)
    if (staffToken) {
      const actor = await this.identity.resolveStaffSession(staffToken)
      if (actor) {
        // Người đăng nhập MANG THEO cả trạm lẫn quyền của thiết bị họ đang đứng.
        // Quyền là HỢP của hai nguồn: bếp trưởng đứng ở màn ST-06 vẫn giữ quyền
        // của mình, còn thu ngân đứng ở đó thì mượn được quyền bếp của cái màn.
        // Thiếu bước này thì màn bếp mất cả trạm lẫn quyền ngay khi có ai đó
        // đăng nhập lên nó.
        const deviceActor: Actor | null = device
          ? {
              kind: 'device',
              deviceId: device.id,
              branchId: device.branchId,
              stationId: device.stationId,
              deviceKind: device.kind,
            }
          : null
        return {
          ...actor,
          stationId: device?.stationId ?? null,
          roles: [...new Set([...actor.roles, ...(deviceActor ? actorRoles(deviceActor) : [])])],
        }
      }
    }

    const tableToken = readCredential(req, TABLE_COOKIE)
    if (tableToken) {
      const actor = await this.identity.resolveTableToken(tableToken)
      if (actor) return actor
    }

    if (device) {
      return {
        kind: 'device',
        deviceId: device.id,
        branchId: device.branchId,
        stationId: device.stationId,
        deviceKind: device.kind,
      }
    }

    return null
  }
}

/** Cookie httpOnly là đường chính; Bearer để thiết bị/kiểm thử dùng */
function readCredential(req: FastifyRequest, cookieName: string): string | null {
  const cookies = (req as FastifyRequest & { cookies?: Record<string, string> }).cookies
  const fromCookie = cookies?.[cookieName]
  if (fromCookie) return fromCookie

  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}
