import { Module } from '@nestjs/common'
import { ExpensesModule } from '../expenses/expenses.module'
import { HrModule } from '../hr/hr.module'
import { IdentityModule } from '../identity/identity.module'
import { InventoryModule } from '../inventory/inventory.module'
import { BusinessReportsService } from './business.service'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  // F7 gom ba nguồn: giá vốn (M4 · kho), chi nhân sự (H7), chi phí (nhóm C)
  imports: [IdentityModule, InventoryModule, HrModule, ExpensesModule],
  controllers: [ReportsController],
  providers: [ReportsService, BusinessReportsService],
})
export class ReportsModule {}
