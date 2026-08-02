import { Module } from '@nestjs/common'
import { ExpensesModule } from '../expenses/expenses.module'
import { IdentityModule } from '../identity/identity.module'
import { HrController } from './hr.controller'
import { HrService } from './hr.service'

@Module({
  // Kỳ lương trừ tạm ứng lấy từ phiếu chi (C2)
  imports: [IdentityModule, ExpensesModule],
  controllers: [HrController],
  providers: [HrService],
  // ReportsModule dùng để lấy chi phí nhân sự cho dòng Nhân sự của F7
  exports: [HrService],
})
export class HrModule {}
