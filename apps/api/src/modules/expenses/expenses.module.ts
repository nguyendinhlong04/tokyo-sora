import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { ExpensesController } from './expenses.controller'
import { ExpensesService } from './expenses.service'

@Module({
  imports: [IdentityModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  // ReportsModule doc chi phi cho F7; HrModule doc tam ung cho ky luong
  exports: [ExpensesService],
})
export class ExpensesModule {}
