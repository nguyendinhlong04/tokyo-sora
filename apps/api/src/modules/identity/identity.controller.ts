import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { Public, STAFF_COOKIE, type RequestWithActor } from './auth.guard'
import { IdentityService } from './identity.service'
import { RequirePermission } from './permission.guard'

const PairingCodeBody = z.object({
  branchId: z.string().min(1),
  kind: z.enum(['pos', 'cashier', 'kds', 'kiosk', 'bridge']),
  stationId: z.string().nullish(),
})

const PairBody = z.object({
  code: z.string().regex(/^\d{6}$/, 'Mã ghép gồm 6 chữ số'),
  name: z.string().min(1).max(80),
})

const LoginBody = z.object({
  branchId: z.string().min(1),
  staffId: z.number().int().positive(),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN gồm 4–6 chữ số'),
})

const OfficeLoginBody = z.object({
  branchId: z.string().min(1),
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
})

const ChannelLoginBody = z.object({
  token: z.string().min(20).max(200),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN gồm 4–6 chữ số'),
})

@Controller('api/auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  /** A4: quản lý sinh mã ghép để đọc cho người đứng ở máy */
  @Post('pairing-codes')
  @RequirePermission('admin.manage-accounts-roles')
  async createPairingCode(@Req() req: RequestWithActor, @Body() body: unknown) {
    const input = PairingCodeBody.parse(body)
    const actor = req.actor!
    return this.identity.createPairingCode({
      ...input,
      createdBy: actor.kind === 'staff' ? actor.staffId : null,
    })
  }

  /**
   * K1: thiết bị nhập mã 6 số. Public vì lúc này máy chưa có danh tính nào —
   * chính mã ghép là thứ chứng minh người thao tác đang đứng trong quán.
   */
  @Public()
  @Post('pair')
  async pair(@Body() body: unknown) {
    const input = PairBody.parse(body)
    return this.identity.pairDevice(input.code, input.name)
  }

  /** P1: lưới chọn nhân viên trước khi nhập PIN */
  @Get('staff')
  async staffList(@Query('branchId') branchId: string) {
    return this.identity.staffForBranch(branchId)
  }

  /** P1: đăng nhập ca bằng PIN trên thiết bị đã ghép */
  @Post('login')
  async login(
    @Req() req: RequestWithActor,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = LoginBody.parse(body)
    const actor = req.actor!
    // Chỉ đăng nhập được từ thiết bị đã ghép — PIN đứng một mình vô dụng
    const deviceId = actor.kind === 'device' ? actor.deviceId : actor.kind === 'staff' ? actor.deviceId : null
    if (deviceId === null) {
      return { error: 'Thiếu thiết bị đã ghép' }
    }

    const result = await this.identity.loginWithPin({ ...input, deviceId })
    reply.setCookie(STAFF_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    })
    return {
      token: result.token,
      expiresAt: result.expiresAt,
      staff: {
        id: result.actor.kind === 'staff' ? result.actor.staffId : null,
        fullName: result.actor.kind === 'staff' ? result.actor.fullName : null,
        roles: result.actor.kind === 'staff' ? result.actor.roles : [],
      },
    }
  }

  /**
   * Đăng nhập Sora Office. `@Public` vì đây chính là cửa vào — không có thiết bị
   * ghép nào để nhận diện trước.
   */
  @Public()
  @Post('office/login')
  async officeLogin(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const input = OfficeLoginBody.parse(body)
    const result = await this.identity.loginWithPassword(input)
    reply.setCookie(STAFF_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    })
    return {
      token: result.token,
      expiresAt: result.expiresAt,
      staff: {
        id: result.actor.kind === 'staff' ? result.actor.staffId : null,
        fullName: result.actor.kind === 'staff' ? result.actor.fullName : null,
        roles: result.actor.kind === 'staff' ? result.actor.roles : [],
      },
    }
  }

  /**
   * H8 · H9 Kênh nhân viên: link cá nhân + PIN.
   *
   * `@Public` vì đây là cửa vào — link chính là thứ chứng minh người bấm đang cầm
   * đường dẫn được cấp riêng cho họ. Phiên sinh ra mang phạm vi `self`, nên nó
   * KHÔNG mở được bất cứ màn vận hành nào dù người đó là thu ngân hay bếp trưởng.
   */
  @Public()
  @Post('channel/login')
  async channelLogin(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const input = ChannelLoginBody.parse(body)
    const result = await this.identity.loginWithChannelToken(input)
    reply.setCookie(STAFF_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    })
    return {
      expiresAt: result.expiresAt,
      staff: {
        fullName: result.actor.kind === 'staff' ? result.actor.fullName : null,
        branchId: result.actor.kind === 'staff' ? result.actor.branchId : null,
      },
    }
  }

  @Post('logout')
  async logout(@Req() req: RequestWithActor, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = req.actor!
    if (actor.kind === 'staff') await this.identity.logout(actor.sessionId)
    reply.clearCookie(STAFF_COOKIE, { path: '/' })
    return { ok: true }
  }

  /** Ai đang đăng nhập — POS/KDS gọi lúc khởi động để khôi phục phiên */
  @Get('me')
  me(@Req() req: RequestWithActor) {
    return req.actor
  }
}
