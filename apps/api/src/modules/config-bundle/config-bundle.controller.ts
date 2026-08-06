import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { ConfigBundleService } from './config-bundle.service'

const BranchQuery = z.object({ branch: z.string().min(1) })

@Controller('api')
export class ConfigBundleController {
  constructor(private readonly bundles: ConfigBundleService) {}

  /**
   * App tải cấu hình. Dùng ETag: máy đã có bản mới nhất thì nhận 304 và không tốn
   * băng thông — đúng pattern trong TRIEN-KHAI §5.
   *
   * `no-cache` chứ không phải `no-store`: trình duyệt vẫn giữ bản cũ nhưng luôn
   * hỏi lại server. Đúng ở đây vì cấu hình sai còn tệ hơn một lượt hỏi thừa.
   */
  @Get('config')
  async get(@Query() query: unknown, @Req() req: RequestWithActor, @Res() reply: FastifyReply) {
    const { branch } = BranchQuery.parse(query)
    const latest = await this.bundles.latest(branch)

    if (!latest) {
      return reply.status(404).send({
        code: 'config_not_published',
        message: `Chi nhánh ${branch} chưa phát hành cấu hình lần nào`,
      })
    }

    reply.header('Cache-Control', 'no-cache')
    reply.header('ETag', `"${latest.version}"`)

    const known = req.headers['if-none-match']
    if (known && known.replaceAll('"', '') === latest.version) {
      return reply.status(304).send()
    }

    return reply.send({ version: latest.version, publishedAt: latest.publishedAt, ...(latest.payload as object) })
  }

  /**
   * Bản cấu hình hiện hành là bản nào, phát hành lúc nào.
   *
   * Tách khỏi `GET /api/config` vì màn Office chỉ cần hai dòng chữ, mà bản đầy
   * đủ nặng hơn 40KB — kéo cả thực đơn về chỉ để hiện một cái mốc giờ là lãng
   * phí, nhất là khi thanh bên hiện ở mọi màn.
   */
  @Get('config/version')
  async version(@Query() query: unknown) {
    const { branch } = BranchQuery.parse(query)
    const latest = await this.bundles.latest(branch)
    return {
      version: latest?.version ?? null,
      publishedAt: latest?.publishedAt ?? null,
    }
  }

  /** Office bấm "Lưu & phát hành" */
  @Post('office/config/publish')
  @RequirePermission('menu.edit-price')
  async publish(@Query() query: unknown, @Req() req: RequestWithActor) {
    const { branch } = BranchQuery.parse(query)
    return this.bundles.publish(branch, req.actor!)
  }
}
