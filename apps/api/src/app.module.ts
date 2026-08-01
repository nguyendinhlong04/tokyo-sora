import { Controller, Get, Module } from '@nestjs/common'
import { CommonModule } from './common/common.module'
import { Public } from './modules/identity/auth.guard'
import { IdentityModule } from './modules/identity/identity.module'

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true, service: 'sora-api' }
  }
}

@Module({
  imports: [CommonModule, IdentityModule],
  controllers: [HealthController],
})
export class AppModule {}
