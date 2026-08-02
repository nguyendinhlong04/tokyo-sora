import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'

@Module({
  imports: [IdentityModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  // KitchenModule dùng để trừ kho khi bếp bấm Xong
  exports: [InventoryService],
})
export class InventoryModule {}
