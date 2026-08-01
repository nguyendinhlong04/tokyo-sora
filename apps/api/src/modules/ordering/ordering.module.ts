import { Module } from '@nestjs/common'
import { CatalogService } from '../catalog/catalog.service'
import { FloorplanService } from './floorplan.service'
import { OrderingController } from './ordering.controller'
import { OrderingService } from './ordering.service'

@Module({
  controllers: [OrderingController],
  providers: [OrderingService, FloorplanService, CatalogService],
  exports: [OrderingService, FloorplanService, CatalogService],
})
export class OrderingModule {}
