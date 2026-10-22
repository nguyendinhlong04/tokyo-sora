import { Module } from '@nestjs/common'
import { CatalogService } from '../catalog/catalog.service'
import { EinvoiceModule } from '../einvoice/einvoice.module'
import { FeedbackService } from './feedback.service'
import { FloorplanService } from './floorplan.service'
import { OrderingController } from './ordering.controller'
import { OrderingService } from './ordering.service'
import { QuickKeysService } from './quick-keys.service'
import { TableRequestService } from './table-request.service'
import { TableSessionController } from './table-session.controller'
import { TableTerminalController } from './table-terminal.controller'
import { TableTerminalService } from './table-terminal.service'

@Module({
  // Đóng bàn đẩy hoá đơn điện tử của bill đi nếu chưa ai đẩy (FloorplanService)
  imports: [EinvoiceModule],
  controllers: [OrderingController, TableSessionController, TableTerminalController],
  providers: [
    OrderingService,
    FloorplanService,
    CatalogService,
    TableRequestService,
    FeedbackService,
    QuickKeysService,
    TableTerminalService,
  ],
  exports: [
    OrderingService,
    FloorplanService,
    CatalogService,
    TableRequestService,
    FeedbackService,
  ],
})
export class OrderingModule {}
