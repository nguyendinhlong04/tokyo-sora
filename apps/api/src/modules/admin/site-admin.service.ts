import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import { branches, siteHeroImages, siteJobs, sitePosts, staff } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'

export interface PostInput {
  title: string
  category: string
  excerpt: string | null
  publishedOn: string
  published: boolean
}

export interface JobInput {
  title: string
  /** null = tuyển cho cả chuỗi */
  branchId: string | null
  employment: string
  slots: number
  published: boolean
  sort: number
}

export interface HeroImageInput {
  imageUrl: string
  /** null = khung ảnh tĩnh. Có video thì `imageUrl` thành ảnh chờ của nó. */
  videoUrl: string | null
  caption: string | null
  captionJa: string | null
  published: boolean
  sort: number
}

/**
 * A8 — CMS website.
 *
 * Phạm vi cố ý HẸP: tin tức (W8), tuyển dụng (W9) và ảnh hero trang chủ (W1). Đó
 * đúng là những khối mà `apps/web/content/site.ts` đã hẹn sẵn sẽ chuyển sang đây,
 * và cũng đúng là những khối đổi theo tuần.
 *
 * Không kéo vào: giá và mô tả món (trung tâm sản phẩm M1 là nguồn duy nhất — §18.1),
 * địa chỉ và giờ mở (A10), câu chuyện bếp trưởng và lời hứa dưới hero (bản sắc
 * viết một lần). Kéo bất kỳ thứ nào trong đó vào đây là tạo nguồn thứ hai cho một
 * dữ liệu đã có nguồn.
 *
 * `published = false` là bản NHÁP: website chỉ đọc bài đã bật, nên viết dở rồi bỏ
 * đấy không làm trang tin hiện một tiêu đề cụt.
 */
@Injectable()
export class SiteAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------- Tin tức

  async posts() {
    const rows = await this.db
      .select({ p: sitePosts, byName: staff.fullName })
      .from(sitePosts)
      .leftJoin(staff, eq(staff.id, sitePosts.updatedBy))
      .orderBy(desc(sitePosts.publishedOn), desc(sitePosts.id))

    return rows.map(({ p, byName }) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      excerpt: p.excerpt,
      publishedOn: p.publishedOn,
      published: p.published,
      updatedAt: p.updatedAt,
      updatedBy: byName,
    }))
  }

  async createPost(input: PostInput, actor: Actor) {
    assertPost(input)
    const [row] = await this.db
      .insert(sitePosts)
      .values({ ...normalisePost(input), updatedBy: staffIdOf(actor) })
      .returning({ id: sitePosts.id })
    await this.write(actor, 'cms.post-created', 'post', String(row!.id), { title: input.title })
    return this.postView(row!.id)
  }

  async updatePost(id: number, input: Partial<PostInput>, actor: Actor) {
    const [current] = await this.db.select().from(sitePosts).where(eq(sitePosts.id, id))
    if (!current) throw new NotFoundException('Không có bài viết này')

    const next = { ...current, ...input } as PostInput
    assertPost(next)
    await this.db
      .update(sitePosts)
      .set({ ...normalisePost(next), updatedBy: staffIdOf(actor), updatedAt: new Date() })
      .where(eq(sitePosts.id, id))
    await this.write(actor, 'cms.post-updated', 'post', String(id), { ...input })
    return this.postView(id)
  }

  async deletePost(id: number, actor: Actor) {
    const deleted = await this.db
      .delete(sitePosts)
      .where(eq(sitePosts.id, id))
      .returning({ title: sitePosts.title })
    if (deleted.length === 0) throw new NotFoundException('Không có bài viết này')
    await this.write(actor, 'cms.post-deleted', 'post', String(id), { title: deleted[0]!.title })
    return { id, deleted: true }
  }

  // ---------------------------------------------------------- Tuyển dụng

  async jobs() {
    const rows = await this.db
      .select({ j: siteJobs, branchName: branches.name, byName: staff.fullName })
      .from(siteJobs)
      .leftJoin(branches, eq(branches.id, siteJobs.branchId))
      .leftJoin(staff, eq(staff.id, siteJobs.updatedBy))
      .orderBy(asc(siteJobs.sort), asc(siteJobs.id))

    return rows.map(({ j, branchName, byName }) => ({
      id: j.id,
      title: j.title,
      branchId: j.branchId,
      branchName,
      employment: j.employment,
      slots: j.slots,
      published: j.published,
      sort: j.sort,
      updatedAt: j.updatedAt,
      updatedBy: byName,
    }))
  }

  async createJob(input: JobInput, actor: Actor) {
    await this.assertJob(input)
    const [row] = await this.db
      .insert(siteJobs)
      .values({ ...normaliseJob(input), updatedBy: staffIdOf(actor) })
      .returning({ id: siteJobs.id })
    await this.write(actor, 'cms.job-created', 'job', String(row!.id), { title: input.title })
    return this.jobView(row!.id)
  }

  async updateJob(id: number, input: Partial<JobInput>, actor: Actor) {
    const [current] = await this.db.select().from(siteJobs).where(eq(siteJobs.id, id))
    if (!current) throw new NotFoundException('Không có tin tuyển dụng này')

    const next = { ...current, ...input } as JobInput
    await this.assertJob(next)
    await this.db
      .update(siteJobs)
      .set({ ...normaliseJob(next), updatedBy: staffIdOf(actor), updatedAt: new Date() })
      .where(eq(siteJobs.id, id))
    await this.write(actor, 'cms.job-updated', 'job', String(id), { ...input })
    return this.jobView(id)
  }

  async deleteJob(id: number, actor: Actor) {
    const deleted = await this.db
      .delete(siteJobs)
      .where(eq(siteJobs.id, id))
      .returning({ title: siteJobs.title })
    if (deleted.length === 0) throw new NotFoundException('Không có tin tuyển dụng này')
    await this.write(actor, 'cms.job-deleted', 'job', String(id), { title: deleted[0]!.title })
    return { id, deleted: true }
  }

  // ------------------------------------------------- Ảnh hero trang chủ

  async heroImages() {
    const rows = await this.db
      .select({ h: siteHeroImages, byName: staff.fullName })
      .from(siteHeroImages)
      .leftJoin(staff, eq(staff.id, siteHeroImages.updatedBy))
      .orderBy(asc(siteHeroImages.sort), asc(siteHeroImages.id))

    return rows.map(({ h, byName }) => ({
      id: h.id,
      imageUrl: h.imageUrl,
      videoUrl: h.videoUrl,
      caption: h.caption,
      captionJa: h.captionJa,
      published: h.published,
      sort: h.sort,
      updatedAt: h.updatedAt,
      updatedBy: byName,
    }))
  }

  async createHeroImage(input: HeroImageInput, actor: Actor) {
    assertHeroImage(input)
    const [row] = await this.db
      .insert(siteHeroImages)
      .values({ ...normaliseHeroImage(input), updatedBy: staffIdOf(actor) })
      .returning({ id: siteHeroImages.id })
    await this.write(actor, 'cms.hero-created', 'hero-image', String(row!.id), {
      imageUrl: input.imageUrl,
    })
    return this.heroImageView(row!.id)
  }

  async updateHeroImage(id: number, input: Partial<HeroImageInput>, actor: Actor) {
    const [current] = await this.db
      .select()
      .from(siteHeroImages)
      .where(eq(siteHeroImages.id, id))
    if (!current) throw new NotFoundException('Không có ảnh hero này')

    const next = { ...current, ...input } as HeroImageInput
    assertHeroImage(next)
    await this.db
      .update(siteHeroImages)
      .set({ ...normaliseHeroImage(next), updatedBy: staffIdOf(actor), updatedAt: new Date() })
      .where(eq(siteHeroImages.id, id))
    await this.write(actor, 'cms.hero-updated', 'hero-image', String(id), { ...input })
    return this.heroImageView(id)
  }

  async deleteHeroImage(id: number, actor: Actor) {
    const deleted = await this.db
      .delete(siteHeroImages)
      .where(eq(siteHeroImages.id, id))
      .returning({ imageUrl: siteHeroImages.imageUrl })
    if (deleted.length === 0) throw new NotFoundException('Không có ảnh hero này')
    await this.write(actor, 'cms.hero-deleted', 'hero-image', String(id), {
      imageUrl: deleted[0]!.imageUrl,
    })
    return { id, deleted: true }
  }

  // ============================================================== phụ trợ

  private async assertJob(input: JobInput) {
    if (!input.title.trim()) throw new BadRequestException('Tin tuyển dụng phải có tên vị trí')
    if (!input.employment.trim()) throw new BadRequestException('Ghi rõ hình thức làm việc')
    if (!Number.isInteger(input.slots) || input.slots < 1 || input.slots > 99) {
      throw new BadRequestException('Số vị trí cần tuyển từ 1 đến 99')
    }
    if (input.branchId !== null) {
      const rows = await this.db
        .select({ id: branches.id })
        .from(branches)
        .where(inArray(branches.id, [input.branchId]))
      if (rows.length === 0) throw new BadRequestException(`Không có chi nhánh ${input.branchId}`)
    }
  }

  private async postView(id: number) {
    return (await this.posts()).find((p) => p.id === id)!
  }

  private async jobView(id: number) {
    return (await this.jobs()).find((j) => j.id === id)!
  }

  private async heroImageView(id: number) {
    return (await this.heroImages()).find((h) => h.id === id)!
  }

  private async write(
    actor: Actor,
    action: string,
    entity: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, { actor, action, entity, entityId, payload })
    })
  }
}

function staffIdOf(actor: Actor): number | null {
  return actor.kind === 'staff' ? actor.staffId : null
}

function assertPost(input: PostInput) {
  if (!input.title.trim()) throw new BadRequestException('Bài viết phải có tiêu đề')
  if (!input.category.trim()) throw new BadRequestException('Bài viết phải thuộc một mục')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.publishedOn)) {
    throw new BadRequestException('Ngày đăng viết theo mẫu YYYY-MM-DD')
  }
}

function normalisePost(input: PostInput) {
  return {
    title: input.title.trim(),
    category: input.category.trim(),
    excerpt: input.excerpt?.trim() || null,
    publishedOn: input.publishedOn,
    published: input.published,
  }
}

function assertHeroImage(input: HeroImageInput) {
  // Ảnh bắt buộc kể cả khi có video: nó là ảnh chờ trong lúc video tải, và là
  // thứ khách thấy khi máy họ không phát được video.
  if (!input.imageUrl.trim()) throw new BadRequestException('Ảnh hero phải có đường dẫn ảnh')
}

function normaliseHeroImage(input: HeroImageInput) {
  return {
    imageUrl: input.imageUrl.trim(),
    videoUrl: input.videoUrl?.trim() || null,
    caption: input.caption?.trim() || null,
    captionJa: input.captionJa?.trim() || null,
    published: input.published,
    sort: input.sort,
  }
}

function normaliseJob(input: JobInput) {
  return {
    title: input.title.trim(),
    branchId: input.branchId,
    employment: input.employment.trim(),
    slots: input.slots,
    published: input.published,
    sort: input.sort,
  }
}
