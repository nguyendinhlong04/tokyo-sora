import { Controller, Get, Module } from '@nestjs/common'
import { AdminModule } from './modules/admin/admin.module'
import { CommonModule } from './common/common.module'
import { ConfigBundleModule } from './modules/config-bundle/config-bundle.module'
import { AccountingModule } from './modules/accounting/accounting.module'
import { CrmModule } from './modules/crm/crm.module'
import { ExpensesModule } from './modules/expenses/expenses.module'
import { HrModule } from './modules/hr/hr.module'
import { Public } from './modules/identity/auth.guard'
import { IdentityModule } from './modules/identity/identity.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { KitchenModule } from './modules/kitchen/kitchen.module'
import { OnlineModule } from './modules/online/online.module'
import { OrderingModule } from './modules/ordering/ordering.module'
import { PaymentsModule } from './modules/payments/payments.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { ReportsModule } from './modules/reports/reports.module'
import { ReservationsModule } from './modules/reservations/reservations.module'
import { SiteModule } from './modules/site/site.module'

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true, service: 'sora-api' }
  }
}

@Module({
  imports: [
    CommonModule,
    IdentityModule,
    RealtimeModule,
    ConfigBundleModule,
    OrderingModule,
    KitchenModule,
    PaymentsModule,
    OnlineModule,
    ReservationsModule,
    SiteModule,
    AdminModule,
    InventoryModule,
    ExpensesModule,
    HrModule,
    AccountingModule,
    CrmModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
