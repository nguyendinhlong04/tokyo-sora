import { Module } from '@nestjs/common'
import { OrderingModule } from '../ordering/ordering.module'
import { PaymentsModule } from '../payments/payments.module'
import { DispatchController } from './dispatch.controller'
import { DispatchService } from './dispatch.service'
import { OnlineController } from './online.controller'
import { OnlineService } from './online.service'

@Module({
  imports: [OrderingModule, PaymentsModule],
  controllers: [OnlineController, DispatchController],
  providers: [OnlineService, DispatchService],
  exports: [OnlineService, DispatchService],
})
export class OnlineModule {}
