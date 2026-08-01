import { Controller, Get, Module } from '@nestjs/common'
import { CommonModule } from './common/common.module'
import { Public } from './modules/identity/auth.guard'
import { IdentityModule } from './modules/identity/identity.module'
import { RealtimeModule } from './modules/realtime/realtime.module'

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true, service: 'sora-api' }
  }
}

@Module({
  imports: [CommonModule, IdentityModule, RealtimeModule],
  controllers: [HealthController],
})
export class AppModule {}
