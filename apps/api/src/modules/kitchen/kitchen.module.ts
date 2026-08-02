import { Module } from '@nestjs/common'
import { InventoryModule } from '../inventory/inventory.module'
import { KitchenController } from './kitchen.controller'
import { KitchenService } from './kitchen.service'

@Module({
  // Bấm Xong là mốc trừ kho (§25, quyết định 2) — bếp phải gọi được sang kho
  imports: [InventoryModule],
  controllers: [KitchenController],
  providers: [KitchenService],
  exports: [KitchenService],
})
export class KitchenModule {}
