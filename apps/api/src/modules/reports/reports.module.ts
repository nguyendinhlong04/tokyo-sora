import { Module } from '@nestjs/common'
import { HrModule } from '../hr/hr.module'
import { IdentityModule } from '../identity/identity.module'
import { InventoryModule } from '../inventory/inventory.module'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  // B3 và F7 đọc giá vốn tiêu chuẩn từ công thức (M4) và chi nhân sự từ kỳ lương (H7)
  imports: [IdentityModule, InventoryModule, HrModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
