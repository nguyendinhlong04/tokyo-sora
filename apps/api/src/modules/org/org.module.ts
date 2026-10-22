import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { DocumentsController } from './documents.controller'
import { DocumentsService } from './documents.service'
import { OrgController } from './org.controller'
import { OrgService } from './org.service'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

@Module({
  imports: [IdentityModule],
  controllers: [OrgController, DocumentsController, TasksController],
  providers: [OrgService, DocumentsService, TasksService],
  // Việc, báo cáo, KPI hỏi "ai quản ai" qua ảnh chụp của OrgService; hộp việc
  // đếm văn bản và việc; sự cố, khiếu nại giao việc khắc phục qua TasksService
  exports: [OrgService, DocumentsService, TasksService],
})
export class OrgModule {}
