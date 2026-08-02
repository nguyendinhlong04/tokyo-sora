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

  /** W2 · W3 · W7 */
  @Public()
  @Get('menu')
  menu() {
    return this.site.menu()
  }
}
