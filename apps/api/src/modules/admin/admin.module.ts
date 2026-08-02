import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { CatalogAdminController } from './catalog-admin.controller'
import { CatalogAdminService } from './catalog-admin.service'
import { DeliveryAdminController } from './delivery-admin.controller'
import { DeliveryAdminService } from './delivery-admin.service'

@Module({
  imports: [IdentityModule],
  controllers: [AdminController, CatalogAdminController, DeliveryAdminController],
  providers: [AdminService, CatalogAdminService, DeliveryAdminService],
  exports: [AdminService, CatalogAdminService, DeliveryAdminService],
})
export class AdminModule {}
