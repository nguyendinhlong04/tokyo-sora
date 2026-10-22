import { Module } from '@nestjs/common'
import { OrgModule } from '../org/org.module'
import { InboxController } from './inbox.controller'

@Module({
  imports: [OrgModule],
  controllers: [InboxController],
})
export class InboxModule {}
