import { Module } from '@nestjs/common'
import { CrmModule } from '../crm/crm.module'
import { MockBankProvider, PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { SplitPaymentController } from './split-payment.controller'
import { SplitPaymentService } from './split-payment.service'

/**
 * Nhà cung cấp thanh toán chọn theo biến môi trường.
 *
 * Chưa cấu hình gì thì dùng bản giả lập — dev và test chạy trọn luồng VietQR mà
 * không cần tài khoản ngân hàng. Khi có hợp đồng VietinBank thì thêm adapter thật
 * ở đây, không màn hình nào phải sửa.
 */
function createProvider(): PaymentProvider {
  const kind = process.env.PAYMENT_PROVIDER ?? 'mock'
  if (kind !== 'mock') {
    throw new Error(`Chưa có adapter cho nhà cung cấp "${kind}"`)
  }
  const secret = process.env.BANK_WEBHOOK_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('Thiếu BANK_WEBHOOK_SECRET — không chạy bản giả lập ở production')
  }
  return new MockBankProvider(secret ?? 'dev-bank-secret')
}

// CrmModule để tích điểm ngay trong transaction thu tiền — §25 B14 "điểm chỉ
// sinh từ sự kiện thanh-toan.nhan". Chiều phụ thuộc một hướng: CRM không biết gì
// về thanh toán, nên không có vòng.
@Module({
  imports: [CrmModule],
  controllers: [PaymentsController, SplitPaymentController],
  providers: [
    PaymentsService,
    SplitPaymentService,
    { provide: PAYMENT_PROVIDER, useFactory: createProvider },
  ],
  exports: [PaymentsService, SplitPaymentService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
