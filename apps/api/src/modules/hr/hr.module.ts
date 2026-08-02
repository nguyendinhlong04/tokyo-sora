import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { HrController } from './hr.controller'
import { HrService } from './hr.service'

@Module({
  imports: [IdentityModule],
  controllers: [HrController],
  providers: [HrService],
  // ReportsModule dùng để lấy chi phí nhân sự cho dòng Nhân sự của F7
  exports: [HrService],
})
export class HrModule {}
