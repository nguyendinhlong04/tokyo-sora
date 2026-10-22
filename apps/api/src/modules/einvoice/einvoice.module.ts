import { Module } from '@nestjs/common'
import { createEinvoiceProvider, EINVOICE_PROVIDER } from './einvoice-provider'
import { EinvoiceController } from './einvoice.controller'
import { EinvoiceService } from './einvoice.service'

/**
 * Hoá đơn điện tử. Không nhập module nghiệp vụ nào — Payments, CRM, Ordering,
 * Online và Accounting nhập nó để xếp hoá đơn ngay trong lượt thu tiền của chúng.
 * Đi ngược chiều đó là vòng phụ thuộc (Accounting → CRM → Ordering đã có sẵn).
 */
@Module({
  controllers: [EinvoiceController],
  providers: [EinvoiceService, { provide: EINVOICE_PROVIDER, useFactory: createEinvoiceProvider }],
  exports: [EinvoiceService, EINVOICE_PROVIDER],
})
export class EinvoiceModule {}
