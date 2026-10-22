import { Controller, Get, Module } from '@nestjs/common'
import { AdminModule } from './modules/admin/admin.module'
import { CommonModule } from './common/common.module'
import { ConfigBundleModule } from './modules/config-bundle/config-bundle.module'
import { AccountingModule } from './modules/accounting/accounting.module'
import { EinvoiceModule } from './modules/einvoice/einvoice.module'
import { CrmModule } from './modules/crm/crm.module'
import { ExpensesModule } from './modules/expenses/expenses.module'
import { HrModule } from './modules/hr/hr.module'
import { InboxModule } from './modules/inbox/inbox.module'
import { Public } from './modules/identity/auth.guard'
import { IdentityModule } from './modules/identity/identity.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { KitchenModule } from './modules/kitchen/kitchen.module'
import { OnlineModule } from './modules/online/online.module'
import { OrderingModule } from './modules/ordering/ordering.module'
import { OrgModule } from './modules/org/org.module'
import { PaymentsModule } from './modules/payments/payments.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { ReportsModule } from './modules/reports/reports.module'
import { ReservationsModule } from './modules/reservations/reservations.module'
import { SiteModule } from './modules/site/site.module'
import { WorkReportsModule } from './modules/work-reports/work-reports.module'
import { PerformanceModule } from './modules/performance/performance.module'

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
    EinvoiceModule,
    OnlineModule,
    ReservationsModule,
    SiteModule,
    AdminModule,
    InventoryModule,
    ExpensesModule,
    HrModule,
    OrgModule,
    WorkReportsModule,
    PerformanceModule,
    InboxModule,
    AccountingModule,
    CrmModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
