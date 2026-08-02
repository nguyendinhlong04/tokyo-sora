import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { AccountingController } from './accounting.controller'
import { AccountingService } from './accounting.service'

/**
 * Miền kế toán ĐỌC bảng của chi phí, nhân sự và kho, nhưng KHÔNG nhập module của
 * chúng — nó truy vấn thẳng bảng qua Drizzle. Nhờ vậy `PeriodLockService` nằm ở
 * `common` mà bốn miền kia gọi được, không sinh vòng phụ thuộc.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
