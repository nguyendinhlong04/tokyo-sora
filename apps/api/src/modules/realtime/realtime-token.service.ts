import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { SignJWT } from 'jose'
import type { Actor } from '../identity/actor'

/**
 * Cấp JWT để client nối thẳng vào Supabase Realtime.
 *
 * Với Socket.IO, server gán phòng lúc handshake nên client không tự join bừa được.
 * Ở đây client nối thẳng tới Supabase nên phải chuyển việc kiểm soát đó xuống RLS:
 * API ký một JWT ngắn hạn mang đúng phạm vi của người dùng (chi nhánh, trạm, đơn),
 * chính sách RLS trên `realtime.messages` đối chiếu tên kênh với các claim này.
 * Xem migration 9003_realtime_rls.sql.
 *
 * Token CHỈ để nghe sự kiện. Mọi thao tác ghi vẫn đi qua API và guard của nó —
 * lộ token này cũng không tạo/sửa được đơn.
 */
@Injectable()
export class RealtimeTokenService {
  /** Thời hạn ngắn: client xin lại khi hết, và mất quyền là mất theo trong vòng phút */
  private static readonly TTL_SECONDS = 30 * 60

  async issue(actor: Actor): Promise<{ token: string; expiresIn: number; rooms: string[] }> {
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình SUPABASE_JWT_SECRET — không cấp được token Realtime',
      )
    }

    const claims = claimsFor(actor)
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${RealtimeTokenService.TTL_SECONDS}s`)
      .sign(new TextEncoder().encode(secret))

    return {
      token,
      expiresIn: RealtimeTokenService.TTL_SECONDS,
      rooms: roomsFor(actor),
    }
  }
}

interface RealtimeClaims extends Record<string, unknown> {
  /** Supabase đòi role này để coi là người dùng đã xác thực */
  role: 'authenticated'
  sub: string
  sora_actor: 'staff' | 'device' | 'customer'
  sora_branch: string
  sora_station: string | null
  sora_session: number | null
}

function claimsFor(actor: Actor): RealtimeClaims {
  switch (actor.kind) {
    case 'staff':
      return {
        role: 'authenticated',
        sub: `staff:${actor.staffId}`,
        sora_actor: 'staff',
        sora_branch: actor.branchId,
        sora_station: null,
        sora_session: null,
      }
    case 'device':
      return {
        role: 'authenticated',
        sub: `device:${actor.deviceId}`,
        sora_actor: 'device',
        sora_branch: actor.branchId,
        // Màn KDS ghim cứng một trạm — chỉ nghe được vé của trạm mình
        sora_station: actor.stationId,
        sora_session: null,
      }
    case 'customer':
      return {
        role: 'authenticated',
        sub: `table:${actor.tableSessionId}`,
        sora_actor: 'customer',
        sora_branch: actor.branchId,
        sora_station: null,
        // Khách chỉ nghe được đơn của phiên bàn mình
        sora_session: actor.tableSessionId,
      }
    case 'system':
      throw new ServiceUnavailableException('Tác vụ nền không cần token Realtime')
  }
}

/** Gợi ý cho client biết nên đăng ký kênh nào — RLS mới là thứ cưỡng chế */
function roomsFor(actor: Actor): string[] {
  if (actor.kind === 'system') return []
  const b = actor.branchId
  switch (actor.kind) {
    case 'staff':
      return [`branch:${b}:orders`, `branch:${b}:tables`, `branch:${b}:config`]
    case 'device':
      return actor.stationId
        ? [`branch:${b}:station:${actor.stationId}`, `branch:${b}:config`]
        : [`branch:${b}:expo`, `branch:${b}:config`]
    case 'customer':
      return [`table-session:${actor.tableSessionId}`, `branch:${b}:config`]
  }
}
