import { Module } from '@nestjs/common'
import { ExpensesModule } from '../expenses/expenses.module'
import { IdentityModule } from '../identity/identity.module'
import { ChannelController } from './channel.controller'
import { ChannelService } from './channel.service'
import { HrController } from './hr.controller'
import { HrService } from './hr.service'
import { TimesheetController } from './timesheet.controller'
import { TimesheetService } from './timesheet.service'

@Module({
  // Kỳ lương trừ tạm ứng lấy từ phiếu chi (C2)
  imports: [IdentityModule, ExpensesModule],
  controllers: [HrController, TimesheetController, ChannelController],
  providers: [HrService, TimesheetService, ChannelService],
  // ReportsModule dùng để lấy chi phí nhân sự cho dòng Nhân sự của F7
  exports: [HrService, TimesheetService],
})
export class HrModule {}
