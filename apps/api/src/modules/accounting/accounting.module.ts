import { Module } from '@nestjs/common'
import { CrmModule } from '../crm/crm.module'
import { IdentityModule } from '../identity/identity.module'
import { AccountingController } from './accounting.controller'
import { AccountingService } from './accounting.service'

/**
 * Miền kế toán ĐỌC bảng của chi phí, nhân sự và kho, nhưng KHÔNG nhập module của
 * chúng — nó truy vấn thẳng bảng qua Drizzle. Nhờ vậy `PeriodLockService` nằm ở
 * `common` mà bốn miền kia gọi được, không sinh vòng phụ thuộc.
 *
 * NGOẠI LỆ là `CrmModule`: tab Phải thu của F5 hỏi B15 về tuổi nợ thay vì tự
 * tính lại, vì phép chia khoang tuổi nợ nằm ở `crm/domain/aging.ts` và chép nó
 * sang đây là tạo nguồn thứ hai cho một con số đã có nguồn. CRM không biết gì về
 * kế toán nên chiều phụ thuộc vẫn một hướng.
 */
@Module({
  imports: [IdentityModule, CrmModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
