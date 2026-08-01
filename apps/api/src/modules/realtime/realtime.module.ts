import { Module } from '@nestjs/common'
import { RealtimeController } from './realtime.controller'
import { RealtimeTokenService } from './realtime-token.service'

/**
 * Không có gateway WebSocket ở đây — việc phát sự kiện do Supabase Realtime lo,
 * kích hoạt bằng trigger trên `outbox_events` (migration 9002). Module này chỉ
 * cấp token nghe và đường bắt kịp sự kiện đã lỡ.
 */
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeTokenService],
  exports: [RealtimeTokenService],
})
export class RealtimeModule {}
