import { Module } from '@nestjs/common'
import { CrmModule } from '../crm/crm.module'
import { OrderingModule } from '../ordering/ordering.module'
import { ReservationConfigController } from './config.controller'
import { ReservationDeskController } from './desk.controller'
import { ReservationDeskService } from './desk.service'
import { ReservationsController } from './reservations.controller'
import { ReservationsService } from './reservations.service'

@Module({
  // "Đã đến" mở phiên bàn thật — đặt chỗ giao lại cho vòng vận hành tại bàn.
  // CrmModule để mỗi lượt đặt chỗ gom luôn vào Sổ khách B12.
  imports: [OrderingModule, CrmModule],
  controllers: [ReservationsController, ReservationDeskController, ReservationConfigController],
  providers: [ReservationsService, ReservationDeskService],
  exports: [ReservationsService, ReservationDeskService],
})
export class ReservationsModule {}
