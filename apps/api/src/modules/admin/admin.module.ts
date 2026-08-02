import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { CatalogAdminController } from './catalog-admin.controller'
import { CatalogAdminService } from './catalog-admin.service'

@Module({
  imports: [IdentityModule],
  controllers: [AdminController, CatalogAdminController],
  providers: [AdminService, CatalogAdminService],
  exports: [AdminService, CatalogAdminService],
})
export class AdminModule {}
