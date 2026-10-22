import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { OrgController } from './org.controller'
import { OrgService } from './org.service'

@Module({
  imports: [IdentityModule],
  controllers: [OrgController],
  providers: [OrgService],
  // Việc, văn bản, báo cáo, KPI hỏi "ai quản ai" qua ảnh chụp của OrgService
  exports: [OrgService],
})
export class OrgModule {}
