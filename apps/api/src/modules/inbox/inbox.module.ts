import { Module } from '@nestjs/common'
import { OrgModule } from '../org/org.module'
import { PerformanceModule } from '../performance/performance.module'
import { WorkReportsModule } from '../work-reports/work-reports.module'
import { InboxController } from './inbox.controller'

@Module({
  imports: [OrgModule, WorkReportsModule, PerformanceModule],
  controllers: [InboxController],
})
export class InboxModule {}
