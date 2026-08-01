import { Module } from '@nestjs/common'
import { CatalogService } from '../catalog/catalog.service'
import { FloorplanService } from './floorplan.service'
import { OrderingController } from './ordering.controller'
import { OrderingService } from './ordering.service'
import { TableRequestService } from './table-request.service'
import { TableSessionController } from './table-session.controller'

@Module({
  controllers: [OrderingController, TableSessionController],
  providers: [OrderingService, FloorplanService, CatalogService, TableRequestService],
  exports: [OrderingService, FloorplanService, CatalogService, TableRequestService],
})
export class OrderingModule {}
