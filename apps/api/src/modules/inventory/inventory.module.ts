import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'
import { WarehouseController } from './warehouse.controller'
import { WarehouseService } from './warehouse.service'

@Module({
  imports: [IdentityModule],
  controllers: [InventoryController, WarehouseController],
  providers: [InventoryService, WarehouseService],
  // KitchenModule dùng để trừ kho khi bếp bấm Xong
  exports: [InventoryService, WarehouseService],
})
export class InventoryModule {}
