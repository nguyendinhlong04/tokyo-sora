import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { DocumentsController } from './documents.controller'
import { DocumentsService } from './documents.service'
import { OrgController } from './org.controller'
import { OrgService } from './org.service'

@Module({
  imports: [IdentityModule],
  controllers: [OrgController, DocumentsController],
  providers: [OrgService, DocumentsService],
  // Việc, báo cáo, KPI hỏi "ai quản ai" qua ảnh chụp của OrgService; hộp việc
  // đếm văn bản qua DocumentsService
  exports: [OrgService, DocumentsService],
})
export class OrgModule {}
