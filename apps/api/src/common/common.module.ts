import { Global, Module } from '@nestjs/common'
import { DbModule } from './db.module'
import { ParamsService } from './params.service'
import { PeriodLockService } from './period-lock.service'

@Global()
@Module({
  imports: [DbModule],
  providers: [ParamsService, PeriodLockService],
  exports: [DbModule, ParamsService, PeriodLockService],
})
export class CommonModule {}
