import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { OrgModule } from '../org/org.module'
import { AutoFieldsService } from './auto-fields.service'
import { IncidentsService } from './incidents.service'
import { IncidentsController, WorkReportsController } from './work-reports.controller'
import { WorkReportsService } from './work-reports.service'

/**
 * Báo cáo công việc và sự cố. Phụ thuộc một chiều: WorkReports → Org (ai quản ai,
 * giao việc khắc phục). Org không import ngược lại; hộp việc import cả hai.
 */
@Module({
  imports: [IdentityModule, OrgModule],
  controllers: [WorkReportsController, IncidentsController],
  providers: [WorkReportsService, IncidentsService, AutoFieldsService],
  exports: [WorkReportsService, IncidentsService, AutoFieldsService],
})
export class WorkReportsModule {}
