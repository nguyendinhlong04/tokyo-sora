import { Module } from '@nestjs/common'
import { OrderingModule } from '../ordering/ordering.module'
import { CorporateService } from './corporate.service'
import { CrmController } from './crm.controller'
import { CustomersService } from './customers.service'
import { FeedbackService } from './feedback.service'
import { PromotionsService } from './promotions.service'

/**
 * B11 – B15 · Khách hàng & khuyến mãi.
 *
 * `CustomersService` và `CorporateService` được XUẤT ra vì hai miền khác gọi vào:
 * luồng thu tiền gọi `accrueForPaidOrder` (điểm chỉ sinh từ thanh toán), và F5 của
 * kế toán gọi `receivables` (tab Phải thu đọc dữ liệu của B15). Hai chỗ đó tự tính
 * lại là hai chỗ sẽ báo con số khác.
 *
 * Nhập `OrderingModule` vì gắn voucher là tính lại tiền đơn, và tiền đơn chỉ có
 * một nơi tính (`recomputeTotals`). Chiều ngược lại không có — không vòng.
 */
@Module({
  imports: [OrderingModule],
  controllers: [CrmController],
  providers: [PromotionsService, CustomersService, FeedbackService, CorporateService],
  exports: [CustomersService, CorporateService],
})
export class CrmModule {}
