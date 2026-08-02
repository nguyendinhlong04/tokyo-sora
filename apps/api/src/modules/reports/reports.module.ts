import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [IdentityModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
