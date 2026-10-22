import { Module } from '@nestjs/common'
import { OrgModule } from '../org/org.module'
import { WorkReportsModule } from '../work-reports/work-reports.module'
import { InboxController } from './inbox.controller'

@Module({
  imports: [OrgModule, WorkReportsModule],
  controllers: [InboxController],
})
export class InboxModule {}
