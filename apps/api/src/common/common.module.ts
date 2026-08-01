import { Global, Module } from '@nestjs/common'
import { DbModule } from './db.module'
import { ParamsService } from './params.service'

@Global()
@Module({
  imports: [DbModule],
  providers: [ParamsService],
  exports: [DbModule, ParamsService],
})
export class CommonModule {}
