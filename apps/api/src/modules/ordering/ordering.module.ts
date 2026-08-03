import { Module } from '@nestjs/common'
import { CatalogService } from '../catalog/catalog.service'
import { FeedbackService } from './feedback.service'
import { FloorplanService } from './floorplan.service'
import { OrderingController } from './ordering.controller'
import { OrderingService } from './ordering.service'
import { QuickKeysService } from './quick-keys.service'
import { TableRequestService } from './table-request.service'
import { TableSessionController } from './table-session.controller'

@Module({
  controllers: [OrderingController, TableSessionController],
  providers: [
    OrderingService,
    FloorplanService,
    CatalogService,
    TableRequestService,
    FeedbackService,
    QuickKeysService,
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
