import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { SiteAdminService } from './site-admin.service'

const PostBody = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(40),
  excerpt: z.string().max(600).nullish().transform((v) => v ?? null),
  publishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  published: z.boolean().default(false),
})

const JobBody = z.object({
  title: z.string().min(1).max(120),
  /** null = tuyển cho cả chuỗi */
  branchId: z.string().min(1).nullable(),
  employment: z.string().min(1).max(80),
  slots: z.number().int().min(1).max(99).default(1),
  published: z.boolean().default(false),
  sort: z.number().int().min(0).max(999).default(0),
})

const HeroBody = z.object({
  imageUrl: z.string().min(1).max(600),
  videoUrl: z.string().max(600).nullish().transform((v) => v ?? null),
  caption: z.string().max(120).nullish().transform((v) => v ?? null),
  captionJa: z.string().max(60).nullish().transform((v) => v ?? null),
  published: z.boolean().default(false),
  sort: z.number().int().min(0).max(999).default(0),
})

/**
 * A8 — CMS website. Quyền `cms.edit` của §4.2: R9 Marketing và R10.
 *
 * Đây là màn DUY NHẤT trong Office mà marketing mở được — nên nó không được phép
 * chạm vào bất cứ thứ gì ngoài chữ nghĩa của trang tin, trang tuyển dụng và bộ
 * ảnh hero trang chủ.
 */
@Controller('api/admin/cms')
export class SiteAdminController {
  constructor(private readonly cms: SiteAdminService) {}

  @Get('posts')
  @RequirePermission('cms.edit')
  posts() {
    return this.cms.posts()
  }

  @Post('posts')
  @RequirePermission('cms.edit')
  createPost(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.cms.createPost(PostBody.parse(body), req.actor!)
  }

  @Patch('posts/:id')
  @RequirePermission('cms.edit')
  updatePost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.cms.updatePost(id, PostBody.partial().parse(body), req.actor!)
  }

  @Delete('posts/:id')
  @RequirePermission('cms.edit')
  deletePost(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.cms.deletePost(id, req.actor!)
  }

  @Get('jobs')
  @RequirePermission('cms.edit')
  jobs() {
    return this.cms.jobs()
  }

  @Post('jobs')
  @RequirePermission('cms.edit')
  createJob(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.cms.createJob(JobBody.parse(body), req.actor!)
  }

  @Patch('jobs/:id')
  @RequirePermission('cms.edit')
  updateJob(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.cms.updateJob(id, JobBody.partial().parse(body), req.actor!)
  }

  @Delete('jobs/:id')
  @RequirePermission('cms.edit')
  deleteJob(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.cms.deleteJob(id, req.actor!)
  }

  @Get('hero')
  @RequirePermission('cms.edit')
  heroImages() {
    return this.cms.heroImages()
  }

  @Post('hero')
  @RequirePermission('cms.edit')
  createHeroImage(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.cms.createHeroImage(HeroBody.parse(body), req.actor!)
  }

  @Patch('hero/:id')
  @RequirePermission('cms.edit')
  updateHeroImage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.cms.updateHeroImage(id, HeroBody.partial().parse(body), req.actor!)
  }

  @Delete('hero/:id')
  @RequirePermission('cms.edit')
  deleteHeroImage(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.cms.deleteHeroImage(id, req.actor!)
  }
}
