import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Role } from '@sora/contracts'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import type { Db } from '../../db/client'
import { devices, pairingCodes, staff, staffRoles, staffSessions, tableSessions } from '../../db/schema'
import type { Actor } from './actor'
import { hashToken, newPairingCode, newToken } from './tokens'

export type DeviceKind = 'pos' | 'cashier' | 'kds' | 'kiosk' | 'bridge'

/**
 * Chống dò PIN. Đếm trong bộ nhớ tiến trình vì hệ thống chạy một process trên một
 * VPS (quyết định kiến trúc đã chốt) — thêm Redis chỉ để đếm là chi phí thừa.
 * Khi nào tách nhiều process thì chuyển sang Redis, đổi đúng lớp này.
 */
class PinThrottle {
  private attempts = new Map<string, { count: number; windowStart: number; lockedUntil: number }>()

  check(key: string, maxPerMinute: number, lockoutMinutes: number, now = Date.now()) {
    const entry = this.attempts.get(key)
    if (entry && entry.lockedUntil > now) {
      throw new ForbiddenException(
        `Nhập sai PIN quá nhiều lần. Thử lại sau ${Math.ceil((entry.lockedUntil - now) / 60_000)} phút.`,
      )
    }
    if (!entry || now - entry.windowStart > 60_000) {
      this.attempts.set(key, { count: 0, windowStart: now, lockedUntil: 0 })
      return
    }
    if (entry.count >= maxPerMinute) {
      entry.lockedUntil = now + lockoutMinutes * 60_000
      throw new ForbiddenException(`Nhập sai PIN quá nhiều lần. Thử lại sau ${lockoutMinutes} phút.`)
    }
  }

  fail(key: string, now = Date.now()) {
    const entry = this.attempts.get(key) ?? { count: 0, windowStart: now, lockedUntil: 0 }
    entry.count += 1
    this.attempts.set(key, entry)
  }

  succeed(key: string) {
    this.attempts.delete(key)
  }
}

@Injectable()
export class IdentityService {
  private readonly throttle = new PinThrottle()

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
  ) {}

  // ---------------------------------------------------------------- Thiết bị

  /** A4/K1: quản lý sinh mã 6 số, đọc cho người đứng ở máy nhập */
  async createPairingCode(input: {
    branchId: string
    kind: DeviceKind
    stationId?: string | null
    createdBy?: number | null
  }): Promise<{ code: string; expiresAt: Date }> {
    const ttlMinutes = await this.params.getNumber('auth.pairingCodeTtlMinutes', 10, input.branchId)
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)

    // Mã ngẫu nhiên có thể trùng mã còn sống — thử lại vài lần thay vì để lỗi ra ngoài
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newPairingCode()
      const existing = await this.db.select().from(pairingCodes).where(eq(pairingCodes.code, code))
      if (existing.length > 0) continue
      await this.db.insert(pairingCodes).values({
        code,
        branchId: input.branchId,
        kind: input.kind,
        stationId: input.stationId ?? null,
        expiresAt,
        createdBy: input.createdBy ?? null,
      })
      return { code, expiresAt }
    }
    throw new BadRequestException('Không sinh được mã ghép, thử lại')
  }

  /** Thiết bị nhập mã 6 số → nhận token dài hạn (chỉ trả về đúng một lần) */
  async pairDevice(code: string, name: string): Promise<{ token: string; deviceId: number }> {
    const [row] = await this.db
      .select()
      .from(pairingCodes)
      .where(
        and(
          eq(pairingCodes.code, code),
          isNull(pairingCodes.usedAt),
          gt(pairingCodes.expiresAt, new Date()),
        ),
      )
    if (!row) throw new UnauthorizedException('Mã ghép không đúng hoặc đã hết hạn')

    const token = newToken()
    return this.db.transaction(async (tx) => {
      // Đánh dấu đã dùng ngay trong transaction — mã dùng MỘT LẦN
      const used = await tx
        .update(pairingCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(pairingCodes.code, code), isNull(pairingCodes.usedAt)))
        .returning({ code: pairingCodes.code })
      if (used.length === 0) throw new UnauthorizedException('Mã ghép vừa được dùng ở máy khác')

      const [device] = await tx
        .insert(devices)
        .values({
          branchId: row.branchId,
          kind: row.kind,
          name,
          stationId: row.stationId,
          tokenHash: hashToken(token),
          pairedBy: row.createdBy,
        })
        .returning({ id: devices.id })
      return { token, deviceId: device!.id }
    })
  }

  async revokeDevice(deviceId: number): Promise<void> {
    await this.db
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.id, deviceId))
  }

  // ------------------------------------------------------------ Đăng nhập ca

  /** Danh sách nhân viên để POS hiện lưới chọn người trước khi nhập PIN (P1) */
  async staffForBranch(branchId: string): Promise<{ id: number; fullName: string; roles: Role[] }[]> {
    const rows = await this.db
      .select({
        id: staff.id,
        fullName: staff.fullName,
        roleCode: staffRoles.roleCode,
      })
      .from(staff)
      .innerJoin(staffRoles, eq(staffRoles.staffId, staff.id))
      .where(and(eq(staff.active, true), eq(staffRoles.branchId, branchId)))

    const byId = new Map<number, { id: number; fullName: string; roles: Role[] }>()
    for (const row of rows) {
      const entry = byId.get(row.id) ?? { id: row.id, fullName: row.fullName, roles: [] }
      entry.roles.push(row.roleCode as Role)
      byId.set(row.id, entry)
    }
    return [...byId.values()]
  }

  /**
   * PIN + thiết bị đã ghép → phiên nhân viên.
   * Thiết bị là YẾU TỐ SỞ HỮU: biết PIN mà không đứng ở máy trong quán thì vô dụng.
   */
  async loginWithPin(input: {
    deviceId: number
    branchId: string
    staffId: number
    pin: string
  }): Promise<{ token: string; expiresAt: Date; actor: Actor }> {
    const throttleKey = `${input.deviceId}:${input.staffId}`
    const { max, lockout, sessionHours } = {
      max: await this.params.getNumber('auth.pinMaxAttemptsPerMinute', 5, input.branchId),
      lockout: await this.params.getNumber('auth.pinLockoutMinutes', 5, input.branchId),
      sessionHours: await this.params.getNumber('auth.staffSessionHours', 12, input.branchId),
    }
    this.throttle.check(throttleKey, max, lockout)

    const [person] = await this.db
      .select()
      .from(staff)
      .where(and(eq(staff.id, input.staffId), eq(staff.active, true)))

    const ok = person?.pinHash ? await argonVerify(person.pinHash, input.pin).catch(() => false) : false
    if (!person || !ok) {
      this.throttle.fail(throttleKey)
      throw new UnauthorizedException('PIN không đúng')
    }
    this.throttle.succeed(throttleKey)

    const roles = await this.rolesOf(person.id, input.branchId)
    if (roles.length === 0) {
      throw new ForbiddenException('Nhân viên chưa được phân vai trò ở chi nhánh này')
    }

    const token = newToken()
    const expiresAt = new Date(Date.now() + sessionHours * 3_600_000)
    const [session] = await this.db
      .insert(staffSessions)
      .values({
        staffId: person.id,
        deviceId: input.deviceId,
        branchId: input.branchId,
        tokenHash: hashToken(token),
        expiresAt,
      })
      .returning({ id: staffSessions.id })

    return {
      token,
      expiresAt,
      actor: {
        kind: 'staff',
        staffId: person.id,
        roles,
        branchId: input.branchId,
        deviceId: input.deviceId,
        sessionId: session!.id,
        fullName: person.fullName,
      },
    }
  }

  async logout(sessionId: number): Promise<void> {
    await this.db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(eq(staffSessions.id, sessionId))
  }

  /** Vai trò ở một chi nhánh = vai trò gán riêng chi nhánh + vai trò toàn chuỗi */
  async rolesOf(staffId: number, branchId: string): Promise<Role[]> {
    const rows = await this.db
      .select({ roleCode: staffRoles.roleCode })
      .from(staffRoles)
      .where(
        and(
          eq(staffRoles.staffId, staffId),
          sql`(${staffRoles.branchId} = ${branchId} OR ${staffRoles.branchId} IS NULL)`,
        ),
      )
    return [...new Set(rows.map((r) => r.roleCode as Role))]
  }

  /** Xác minh PIN của NGƯỜI DUYỆT trong luồng △ — không tạo phiên */
  async verifyPinOnly(staffId: number, pin: string, branchId: string): Promise<Role[] | null> {
    const [person] = await this.db
      .select()
      .from(staff)
      .where(and(eq(staff.id, staffId), eq(staff.active, true)))
    if (!person?.pinHash) return null
    const ok = await argonVerify(person.pinHash, pin).catch(() => false)
    if (!ok) return null
    return this.rolesOf(person.id, branchId)
  }

  // -------------------------------------------------------- Giải mã token

  /** Token thiết bị → actor thiết bị; null nếu sai hoặc đã bị thu hồi */
  async resolveDevice(token: string) {
    const [device] = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.tokenHash, hashToken(token)), isNull(devices.revokedAt)))
    return device ?? null
  }

  /** Token phiên nhân viên → actor nhân viên */
  async resolveStaffSession(token: string): Promise<Actor | null> {
    const [row] = await this.db
      .select({
        sessionId: staffSessions.id,
        staffId: staffSessions.staffId,
        deviceId: staffSessions.deviceId,
        branchId: staffSessions.branchId,
        fullName: staff.fullName,
      })
      .from(staffSessions)
      .innerJoin(staff, eq(staff.id, staffSessions.staffId))
      .where(
        and(
          eq(staffSessions.tokenHash, hashToken(token)),
          isNull(staffSessions.revokedAt),
          gt(staffSessions.expiresAt, new Date()),
        ),
      )
    if (!row) return null
    return {
      kind: 'staff',
      staffId: row.staffId,
      roles: await this.rolesOf(row.staffId, row.branchId),
      branchId: row.branchId,
      deviceId: row.deviceId,
      sessionId: row.sessionId,
      fullName: row.fullName,
    }
  }

  /** Token QR của bàn → actor khách; chết ngay khi phiên bàn đóng */
  async resolveTableToken(token: string): Promise<Actor | null> {
    const [row] = await this.db
      .select({ id: tableSessions.id, branchId: tableSessions.branchId })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.qrTokenHash, hashToken(token)),
          sql`${tableSessions.status} <> 'closed'`,
        ),
      )
    if (!row) return null
    return { kind: 'customer', tableSessionId: row.id, branchId: row.branchId }
  }

  /** Băm PIN mới (đổi PIN, tạo nhân viên) */
  static hashPin(pin: string) {
    return argonHash(pin)
  }
}
