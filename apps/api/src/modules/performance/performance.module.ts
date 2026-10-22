import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { OrgModule } from '../org/org.module'
import { MetricsService } from './metrics.service'
import { PerformanceController } from './performance.controller'
import { PerformanceService } from './performance.service'

/**
 * KPI. Phụ thuộc một chiều: Performance → Org (ai chấm ai). Nguồn số đọc thẳng
 * các bảng nghiệp vụ và mảnh SQL dùng chung `reports/sql.ts`, không import module
 * nghiệp vụ nào — module đó không bao giờ phải biết KPI tồn tại.
 */
@Module({
  imports: [IdentityModule, OrgModule],
  controllers: [PerformanceController],
  providers: [PerformanceService, MetricsService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
