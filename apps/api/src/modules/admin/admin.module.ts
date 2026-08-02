import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { AccessAdminController } from './access-admin.controller'
import { AccessAdminService } from './access-admin.service'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { CatalogAdminController } from './catalog-admin.controller'
import { CatalogAdminService } from './catalog-admin.service'
import { DeliveryAdminController } from './delivery-admin.controller'
import { DeliveryAdminService } from './delivery-admin.service'
import { DeviceAdminController } from './device-admin.controller'
import { DeviceAdminService } from './device-admin.service'
import { SiteAdminController } from './site-admin.controller'
import { SiteAdminService } from './site-admin.service'

@Module({
  imports: [IdentityModule],
  controllers: [
    AdminController,
    AccessAdminController,
    DeviceAdminController,
    SiteAdminController,
    CatalogAdminController,
    DeliveryAdminController,
  ],
  providers: [
    AdminService,
    AccessAdminService,
    DeviceAdminService,
    SiteAdminService,
    CatalogAdminService,
    DeliveryAdminService,
  ],
  exports: [
    AdminService,
    AccessAdminService,
    DeviceAdminService,
    SiteAdminService,
    CatalogAdminService,
    DeliveryAdminService,
  ],
})
export class AdminModule {}
