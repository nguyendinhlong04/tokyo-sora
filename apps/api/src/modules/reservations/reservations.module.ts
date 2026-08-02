import { Module } from '@nestjs/common'
import { OrderingModule } from '../ordering/ordering.module'
import { ReservationDeskController } from './desk.controller'
import { ReservationDeskService } from './desk.service'
import { ReservationsController } from './reservations.controller'
import { ReservationsService } from './reservations.service'

@Module({
  // "Đã đến" mở phiên bàn thật — đặt chỗ giao lại cho vòng vận hành tại bàn
  imports: [OrderingModule],
  controllers: [ReservationsController, ReservationDeskController],
  providers: [ReservationsService, ReservationDeskService],
  exports: [ReservationsService, ReservationDeskService],
})
export class ReservationsModule {}
