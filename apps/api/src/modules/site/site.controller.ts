import { Controller, Get } from '@nestjs/common'
import { Public } from '../identity/auth.guard'
import { SiteService } from './site.service'

/** Website thương hiệu chỉ ĐỌC — không có endpoint ghi nào ở đây */
@Controller('api/site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  /** W5 · W9 · chân trang · W6 bước 1 */
  @Public()
  @Get('branches')
  branches() {
    return this.site.branches()
  }

  /** W1 — gợi ý phường ở ô địa chỉ của hero, khi chưa biết chi nhánh nào */
  @Public()
  @Get('wards')
  wards() {
    return this.site.wards()
  }

  /** W2 · W3 · W7 */
  @Public()
  @Get('menu')
  menu() {
    return this.site.menu()
  }

  /** W8 — tin tức, soạn ở A8 */
  @Public()
  @Get('posts')
  posts() {
    return this.site.posts()
  }

  /** W9 — tuyển dụng, soạn ở A8 */
  @Public()
  @Get('jobs')
  jobs() {
    return this.site.jobs()
  }

  /** W1 — ảnh hero trang chủ, xếp ở A8 */
  @Public()
  @Get('hero')
  hero() {
    return this.site.heroImages()
  }
}
