import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ApprovalService } from './approval.service'
import { AuditService } from './audit.service'
import { AuthGuard } from './auth.guard'
import { IdentityController } from './identity.controller'
import { IdentityService } from './identity.service'
import { PermissionGuard } from './permission.guard'

@Global()
@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    AuditService,
    ApprovalService,
    // Thứ tự quan trọng: AuthGuard dựng Actor trước, PermissionGuard mới xét được
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [IdentityService, AuditService, ApprovalService],
})
export class IdentityModule {}
